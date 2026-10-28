/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { freezeValue, snapshotValue, identifySubject, digestValue } from './identity.js';
import { ReviewGitReader, assertOid, readCommitPacket } from './git-packets.js';
import type { BinaryGitRunner } from '../../../design/corpus/sources/git-reader.js';
import { assertRequest } from './work.js';
import { SUBJECT_LIMITS, SubjectPreparationError } from './types.js';
import type { ApprovedWorkSnapshot, CommitPacketV1, PrepareReviewRequest, ReviewSubjectV1, SubjectWorkReader } from './types.js';

export interface SubjectPreparationDeps extends SubjectWorkReader {
 readonly repoPath: string;
 readonly runGit?: BinaryGitRunner | undefined;
}
function assertWork(request: PrepareReviewRequest, work: ApprovedWorkSnapshot): void {
 if (request.repoId !== work.repoId || request.rootArtifactId !== work.rootArtifactId || request.storyId !== work.storyId
  || request.buildArtifactId !== work.build.artifactId || !Number.isSafeInteger(work.build.revision) || work.build.revision < 1
  || !work.contracts.length || !['approved-plan', 'approved-upstream'].includes(work.taskBasis)
  || (work.taskBasis === 'approved-plan' && !work.tasks.length)) throw new SubjectPreparationError('invalid-input', 'Trusted work binding is invalid.');
 assertOid(work.build.sourceCommit);
}
export async function prepareReviewSubject(input: PrepareReviewRequest, deps: SubjectPreparationDeps): Promise<ReviewSubjectV1> {
 const request = snapshotValue(input); assertRequest(request);
 if (!Array.isArray(request.selections) || !request.selections.length || request.selections.length > SUBJECT_LIMITS.packets) {
  throw new SubjectPreparationError('invalid-input', 'Explicit nonempty commit packet selection required.');
 }
 const work = freezeValue(snapshotValue(await deps.readWork(request))); assertWork(request, work);
 const reader = new ReviewGitReader(deps.repoPath, deps.runGit);
 const context = await reader.commit(work.build.sourceCommit);
 const packets: CommitPacketV1[] = [], packetKeys = new Set<string>(); let count = 0;
 for (const selection of request.selections) {
  if (!selection || typeof selection !== 'object' || typeof selection.attestationRef !== 'string' || !selection.attestationRef.trim()) {
   throw new SubjectPreparationError('ambiguous-attribution', 'Packet needs a trusted scope attestation.');
  }
  assertOid(selection.commitId); assertOid(selection.parentId);
  const key = `${selection.commitId}/${selection.parentId}`;
  if (packetKeys.has(key)) throw new SubjectPreparationError('invalid-input', 'Duplicate parent-relative packet.');
  packetKeys.add(key);
  const proof = snapshotValue(await deps.readAttestation(selection.attestationRef));
  if (proof.ref !== selection.attestationRef || proof.commitId !== selection.commitId || proof.parentId !== selection.parentId
   || proof.rootArtifactId !== work.rootArtifactId || proof.storyId !== work.storyId || proof.buildArtifactId !== work.build.artifactId
   || proof.sourceCommit !== work.build.sourceCommit || typeof proof.exclusive !== 'boolean' || !Array.isArray(proof.blockIds)
   || new Set(proof.blockIds).size !== proof.blockIds.length || proof.blockIds.some(id => typeof id !== 'string' || !id)) {
   throw new SubjectPreparationError('ambiguous-attribution', 'Scope attestation does not match this packet/work.');
  }
  const packet = await readCommitPacket(reader, selection.commitId, selection.parentId);
  const canonicalIds = new Set(packet.blocks.map(b => b.blockId));
  if (proof.blockIds.some(id => !canonicalIds.has(id))) throw new SubjectPreparationError('ambiguous-attribution', 'Attestation refers to stale or foreign blocks.');
  const ids = selection.blockIds ?? (proof.exclusive ? packet.blocks.map(b => b.blockId) : proof.blockIds);
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !canonicalIds.has(id)
   || (!proof.exclusive && !proof.blockIds.includes(id)))) throw new SubjectPreparationError('ambiguous-attribution', 'Selected blocks lack unambiguous ownership.');
  const selected = new Set(ids);
  const blocks = packet.blocks.filter(b => selected.has(b.blockId)).map(b => ({ ...b, attributionRefs: [proof.ref] }));
  count += blocks.length;
  if (count > SUBJECT_LIMITS.blocks) throw new SubjectPreparationError('resource-limit', 'Subject block limit exceeded.');
  const content = { ...packet, blocks, attribution: { basis: proof.exclusive ? 'exclusive-scope-attestation' : 'block-scope-attestation', evidenceRefs: [proof.ref] } };
  packets.push({ ...content, packetId: `packet-${digestValue({ commitId: packet.commitId, parentId: packet.parentId, blocks: blocks.map(b => b.blockId), attribution: content.attribution })}` });
 }
 await deps.assertFresh(work);
 return identifySubject({ version: 1, repoId: work.repoId, rootArtifactId: work.rootArtifactId, storyId: work.storyId, build: work.build,
  contracts: work.contracts, tasks: work.tasks, taskBasis: work.taskBasis, packets, contextTree: context.tree, ambiguities: [] });
}
export async function assertReviewSubjectFresh(subject: ReviewSubjectV1, deps: SubjectPreparationDeps): Promise<void> {
 const copy = snapshotValue(subject);
 const { subjectId, subjectDigest, ...projection } = copy;
 const expected = identifySubject(projection);
 if (expected.subjectId !== subjectId || expected.subjectDigest !== subjectDigest) throw new SubjectPreparationError('stale-contract', 'Subject integrity mismatch.');
 const work = await deps.readWork({ repoId: copy.repoId, rootArtifactId: copy.rootArtifactId, storyId: copy.storyId,
  buildArtifactId: copy.build.artifactId, selections: [] });
 if (digestValue({ build: work.build, contracts: work.contracts, tasks: work.tasks, taskBasis: work.taskBasis }) !==
  digestValue({ build: copy.build, contracts: copy.contracts, tasks: copy.tasks, taskBasis: copy.taskBasis })) {
  throw new SubjectPreparationError('stale-contract', 'Approved work or build source changed.');
 }
 await deps.assertFresh(work);
 const reader = new ReviewGitReader(deps.repoPath, deps.runGit);
 if ((await reader.commit(copy.build.sourceCommit)).tree !== copy.contextTree) throw new SubjectPreparationError('invalid-object', 'Context tree mismatch.');
 // Re-check all selected commit/parent/blob objects even when unrelated HEAD has advanced.
 for (const packet of copy.packets) {
  const current = await readCommitPacket(reader, packet.commitId, packet.parentId);
  const ids = new Set(current.blocks.map(b => b.blockId));
  if (packet.blocks.some(b => !ids.has(b.blockId))) throw new SubjectPreparationError('invalid-object', 'Pinned packet no longer verifies.');
 }
}
