/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import { realpath } from 'node:fs/promises';
import type { ArtifactStore } from '../artifact-core/store.js';
import { checkIntegrity, contentHash } from '../artifact-core/lifecycle.js';
import { APPROVED_OR_BEYOND } from '../artifact-core/approval-view.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId } from '../storage.js';
import { reviewJsonLimit } from '../../config/review.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { ReviewCleanupTarget } from './cleanup-owner.js';
import { readTaskReviewHistory } from '../code-review/task-review/history.js';
import { reviewedBuildFingerprint } from '../code-review/build-freshness.js';
import { latestReviewSummaries } from '../code-review/task-review/record.js';
import { authorPartyOf } from './party.js';
import { validatePermanentDesignReview, preparedDesignCheckpointFromRecord, designWorkflowDigest } from './design-review/history.js';
import { prepareDesignSubject } from './design-review/subject.js';
import type { PreparationHistory } from './history-binding.js';
import type { PublicationProof } from './publication-proof.js';
import { validatePublicationProof } from './publication-proof.js';
import { cleanupBytes, cleanupStat } from './cleanup-claim-files.js';
import { preparationDigest } from './prepared-context.js';

export interface PreparedCleanupAuthorization {
 readonly history: PreparationHistory; readonly proof: PublicationProof; readonly approvalRevision: number;
 readonly bindingHeads: readonly string[];
 readonly permanent: { readonly artifactId: string; readonly historyEntryId: string; readonly preservationDigest: string };
}
/** Current human approval and independent permanent evidence, never a disk
 * cache credential. Used on initial cleanup AND every explicit claim retry. */
export async function authorizePreparedCleanup(target: ReviewCleanupTarget, key: ReviewKey, store: ArtifactStore): Promise<PreparedCleanupAuthorization> {
 if (key.project !== target.project || key.family !== target.family) throw new Error('Foreign cleanup target');
 const approvedId = target.family === 'code' ? buildArtifactId(target.epicHash, target.storyId) : target.artifactId;
 const approved = await store.readWithHistory(approvedId), approval = approved.lifecycle.approval;
 if (!APPROVED_OR_BEYOND.includes(approved.lifecycle.status) || !approval || approval.revision !== approved.lifecycle.revision.number || !checkIntegrity(approved, approved.changeLog).ok) throw new Error('Current verified human approval is required for cleanup');
 if (target.family === 'code') {
  const artifactId = codeReviewArtifactId(target.epicHash, target.storyId), permanent = await store.readWithHistory(artifactId);
  if (!checkIntegrity(permanent, permanent.changeLog).ok) throw new Error('Permanent code-review integrity changed');
  const body = await readTaskReviewHistory(key.project, target.epicHash, target.storyId), archive = body.preparationHistories?.find(a => a.checkpoint.reviewId === key.reviewId);
  if (!archive || !same(body, permanent.payload.body)) throw new Error('Complete permanent code preparation history is required');
  const build = JSON.parse((await cleanupBytes(artifactJsonPath(key.project, approvedId), reviewJsonLimit())).bytes.toString('utf8')) as { meta?: unknown; body?: unknown };
  if (!same(build.body, approved.payload.body)) throw new Error('BUILD changed during cleanup authorization');
  const full = latestReviewSummaries(body.reviews).filter(r => !r.taskId && !r.failedAttempt).sort((a,b) => Date.parse(a.completedAt)-Date.parse(b.completedAt)).at(-1);
  const tasks = approved.payload.body['tasks'];
  if (!full || !full.buildFingerprint || full.buildFingerprint !== reviewedBuildFingerprint(build) || authorPartyOf(build.meta) === 'unknown' || authorPartyOf(build.meta) === full.reviewer
   || !Array.isArray(tasks) || !tasks.length || tasks.some(task => !full.tasks.some(r => r.taskId === (task as { id?: unknown }).id))) throw new Error('Current independent whole-story BUILD evidence is required for cleanup');
  const entry = permanent.changeLog.find(e => {
   const data = e.outcome?.data as { kind?: unknown; schemaVersion?: unknown; reviewId?: unknown; attempt?: unknown; evidenceDigest?: unknown } | undefined;
   return data?.kind === 'prepared-code-review' && data.schemaVersion === 1 && data.reviewId === key.reviewId && data.attempt === archive.proof.runtime.attempt && data.evidenceDigest === archive.proof.evidenceDigest;
  });
  if (!entry) throw new Error('Permanent code publication entry is missing');
  validatePublicationProof(archive.proof, archive.checkpoint, key);
  return { history: archive.checkpoint, proof: archive.proof, bindingHeads: [archive.proof, ...(archive.earlierProofs ?? [])].map(p => p.binding.bindingDigest), approvalRevision: approval.revision, permanent: { artifactId, historyEntryId: entry.id, preservationDigest: archive.proof.evidenceDigest } };
 }
 const entries = approved.changeLog.filter(e => (e.outcome?.data as { kind?: unknown; reviewId?: unknown } | undefined)?.kind === 'design-chunk-review'
  && (e.outcome!.data as { reviewId?: unknown }).reviewId === key.reviewId).map(entry => ({ entry, record: validatePermanentDesignReview(entry.outcome!.data, { project: key.project, artifactId: target.artifactId }) }))
  .sort((a,b) => a.record.applicableAttempt-b.record.applicableAttempt);
 const latest = entries.at(-1); if (!latest || latest.record.schemaVersion !== 3) throw new Error('Permanent design preparation proof is required');
 const record = latest.record, prepared = prepareDesignSubject(key.project, artifactJsonPath(key.project, target.artifactId));
 if (record.binding.sourceRevision.number !== approved.lifecycle.revision.number || record.binding.sourceRevision.contentHash !== (approved.lifecycle.revision.contentHash || contentHash(approved.description, approved.payload))
  || record.binding.documentDigest !== prepared.baseline.subjectFingerprints.document || record.binding.workflowDigest !== designWorkflowDigest(prepared.subject.workflow)
  || prepared.subject.reviewer !== record.reviewer) throw new Error('Current design approval no longer matches reviewed content, author or workflow');
 const history = preparedDesignCheckpointFromRecord(record);
 validatePublicationProof(record.preparation.proof, history, key);
 return { history, proof: record.preparation.proof, bindingHeads: entries.flatMap(e => e.record.schemaVersion === 3 ? [e.record.preparation.proof.binding.bindingDigest] : []), approvalRevision: approval.revision, permanent: { artifactId: target.artifactId, historyEntryId: latest.entry.id, preservationDigest: record.preservationDigest } };
}

/** A private phase pins validated evidence, not mutable approval. Every
 * destructive boundary checks current file identity/ctime. Changes revoke the
 * operation instead of reparsing full permanent history per context object. */
export async function pinPreparedCleanupAuthority(target: ReviewCleanupTarget, key: ReviewKey, store: ArtifactStore, first: PreparedCleanupAuthorization) {
 const approvedId = target.family === 'code' ? buildArtifactId(target.epicHash, target.storyId) : target.artifactId;
 const journal = artifactJsonPath(key.project, first.permanent.artifactId).replace(/\.json$/, '.log.jsonl');
 const paths = new Set([artifactJsonPath(key.project, approvedId), artifactJsonPath(key.project, first.permanent.artifactId), journal,
  artifactJsonPath(key.project, approvedId).replace(/\.json$/, '.log.jsonl')]);
 if ('subject' in first.history && first.history.subject) {
  paths.add(first.history.subject.documentPath);
  for (const reference of first.history.subject.workflow.requiredReferences) { paths.add(reference.path); paths.add(artifactJsonPath(key.project, reference.artifactId)); }
 }
 const stamp = async (path: string) => {
  const stat = await cleanupStat(path); if (!stat?.isFile() || stat.isSymbolicLink() || await realpath(path) !== path) throw new Error('Cleanup approval/evidence file is missing or unsafe');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
 };
 const stamps = new Map<string, string>(); for (const path of paths) stamps.set(path, await stamp(path));
 const check = async () => { for (const [path, expected] of stamps) if (await stamp(path) !== expected) throw new Error('Cleanup approval or permanent evidence changed; explicit retry required'); };
 const current = await authorizePreparedCleanup(target, key, store);
 if (preparationDigest(current) !== preparationDigest(first)) throw new Error('Cleanup authority changed during qualification');
 await check();
 return { check, files: [...paths], journal, acknowledgeJournal: async () => { stamps.set(journal, await stamp(journal)); } };
}
