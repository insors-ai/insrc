/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { freezeValue, snapshotValue } from './identity.js';
import { assertOid } from './git-packets.js';
import { SubjectPreparationError } from './types.js';
import type { ApprovedWorkSnapshot, PrepareReviewRequest } from './types.js';

/** Returned by a daemon-owned canonical store adapter AFTER lifecycle/journal integrity verification.
 * This is a trusted adapter output, never a serialized MCP approval flag. */
export interface VerifiedWorkArtifact {
 readonly artifactId: string; readonly path: string; readonly revision: number; readonly contentDigest: string;
 readonly repoId: string; readonly rootArtifactId: string; readonly storyId: string | null;
 readonly status: string; readonly approvedRevision: number | null;
 readonly body: Readonly<Record<string, unknown>>; readonly text: string;
}
export interface VerifiedWorkInputs {
 readonly build: { readonly artifactId: string; readonly revision: number; readonly sourceCommit: string;
  readonly repoId: string; readonly rootArtifactId: string; readonly storyId: string };
 readonly route: 'planned' | 'approved-upstream';
 /** null means absent; a present unapproved/stale PLAN must be supplied and rejected. */
 readonly plan: VerifiedWorkArtifact | null;
 readonly upstream: readonly VerifiedWorkArtifact[];
}
export interface WorkInputReader {
 readonly readVerifiedInputs: (request: PrepareReviewRequest) => Promise<VerifiedWorkInputs>;
}
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export function assertRequest(request: PrepareReviewRequest): void {
 for (const s of [request.repoId, request.rootArtifactId, request.storyId, request.buildArtifactId]) {
  if (!nonempty(s)) throw new SubjectPreparationError('invalid-input', 'Missing work identity.');
 }
}

/** Projects verified canonical work; never derives an approved state from mutable markdown. */
export async function readApprovedWork(request: PrepareReviewRequest, reader: WorkInputReader): Promise<ApprovedWorkSnapshot> {
 assertRequest(request);
 const input = snapshotValue(await reader.readVerifiedInputs(request));
 const { build } = input;
 if (build.artifactId !== request.buildArtifactId || build.repoId !== request.repoId || build.rootArtifactId !== request.rootArtifactId
  || build.storyId !== request.storyId || !Number.isSafeInteger(build.revision) || build.revision < 1) {
  throw new SubjectPreparationError('invalid-input', 'Build does not belong to this work item.');
 }
 assertOid(build.sourceCommit);
 if (!Array.isArray(input.upstream) || !input.upstream.length || !['planned', 'approved-upstream'].includes(input.route)) {
  throw new SubjectPreparationError('invalid-input', 'An explicit approved upstream basis is required.');
 }
 if (input.route === 'planned' && input.plan === null) throw new SubjectPreparationError('unapproved-contract', 'Planned build has no approved PLAN.');
 if (input.route === 'approved-upstream' && input.plan !== null) throw new SubjectPreparationError('invalid-input', 'Planless route cannot bypass an existing PLAN.');
 const artifacts = [...input.upstream, ...(input.plan ? [input.plan] : [])];
 const seen = new Set<string>();
 for (const a of artifacts) {
  if (!nonempty(a.artifactId) || !nonempty(a.path) || !nonempty(a.text) || !/^[a-f0-9]{64}$/.test(a.contentDigest)
   || !Number.isSafeInteger(a.revision) || a.revision < 1 || seen.has(a.artifactId)
   || a.repoId !== request.repoId || a.rootArtifactId !== request.rootArtifactId
   || (a.storyId !== null && a.storyId !== request.storyId)) throw new SubjectPreparationError('invalid-input', 'Invalid or mismatched artifact pin.');
  seen.add(a.artifactId);
  if (a.status !== 'approved' || a.approvedRevision !== a.revision) throw new SubjectPreparationError('unapproved-contract', 'Contract is not approved at its pinned revision.');
 }
 const tasks: ApprovedWorkSnapshot['tasks'][number][] = [];
 if (input.plan) {
  const raw = input.plan.body['tasks'];
  if (!Array.isArray(raw) || raw.length === 0) throw new SubjectPreparationError('invalid-input', 'PLAN tasks are missing.');
  const ids = new Set<string>();
  const ordered = [...raw].sort((a, b) => a.order - b.order);
  const orders = new Set<number>();
  for (const t of ordered) {
   if (!t || typeof t !== 'object' || !nonempty(t.id) || ids.has(t.id) || !nonempty(t.title) || !nonempty(t.summary)
    || !Number.isSafeInteger(t.order) || t.order < 1 || orders.has(t.order)
    || !Array.isArray(t.dependsOn) || t.dependsOn.some((id: unknown) => !nonempty(id) || !ids.has(id))
    || !Array.isArray(t.acceptanceChecks) || !t.acceptanceChecks.length || !t.acceptanceChecks.every(nonempty)) throw new SubjectPreparationError('invalid-input', 'Invalid PLAN task/checks.');
   ids.add(t.id); orders.add(t.order);
   tasks.push({ id: t.id, description: `${t.title}\n\n${t.summary}`, acceptanceChecks: t.acceptanceChecks.map((text: string, i: number) => ({ id: `${t.id}/ac${i + 1}`, text })) });
  }
 }
 return freezeValue({ repoId: request.repoId, rootArtifactId: request.rootArtifactId, storyId: request.storyId,
  build: { artifactId: build.artifactId, revision: build.revision, sourceCommit: build.sourceCommit },
  contracts: artifacts.map(a => ({ artifactId: a.artifactId, path: a.path, revision: a.revision, contentDigest: a.contentDigest })),
  contractText: Object.fromEntries(artifacts.map(a => [a.artifactId, a.text])), taskBasis: input.plan ? 'approved-plan' : 'approved-upstream', tasks });
}
