/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isAbsolute, normalize } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ReviewKeySchema, ReviewResourceGuardSchema, validateReviewResourceGuard } from './review-resources.js';
import type { ReviewKey } from './review-resources.js';

export const REVIEW_RUNTIME_MAX_BYTES = 256 * 1024;
const object = <T extends Record<string, TSchema>>(fields: T) => Type.Object(fields, { additionalProperties: false });
const id = Type.String({ minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$' });
const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const count = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const positive = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const stamp = Type.String({ minLength: 20, maxLength: 30 });
const enumeration = <T extends string>(values: readonly T[]) => Type.Union(values.map(v => Type.Literal(v)));
const binding = object({ generationId: digest, manifestDigest: digest, historyBindingDigest: digest });
export const ReviewRuntimeReferenceSchema = object({ runtimeId: id, inputDigest: digest });
export const ReviewOperationStateSchema = enumeration(['cancelling', 'stopped', 'resource_fenced']);
export const ReviewCancellationInputSchema = object({ actionId: id, reason: Type.String({ minLength: 1, maxLength: 2048 }) });
export const ReviewCancellationReceiptSchema = object({ key: ReviewKeySchema, attempt: positive, actionId: id, requestedAt: stamp, operationState: ReviewOperationStateSchema });
export type ReviewCancellationReceipt = Static<typeof ReviewCancellationReceiptSchema>;
export const ReviewCancellationRequestSchema = object({ phase: Type.Literal('cancel'), repo: ReviewKeySchema.properties.project, reviewId: ReviewKeySchema.properties.reviewId, attempt: positive, reason: ReviewCancellationInputSchema.properties.reason });
export const ReviewPreparationProgressSchema = object({
 stage: enumeration(['validate_input', 'inspect_history', 'source_inventory', 'fetch_sources', 'qualify_scope', 'build_views', 'commit_context']),
 logicalCompleted: count, physicalCompleted: count, cacheHits: count, bytes: count,
 total: Type.Union([count, Type.Null()]), elapsedMs: count,
});
export const ReviewRuntimeSchema = object({
 schemaVersion: Type.Literal(1), key: ReviewKeySchema, attempt: positive,
 runtimeId: id, daemonEpoch: id, workerIncarnation: id, sequence: count,
 checkpointBinding: object({ inputDigest: digest, semanticSequence: count, historyBindingDigest: Type.Optional(digest) }),
 state: enumeration(['initializing', 'active', 'interrupted', 'terminal', 'cleanup']),
 resourceGuard: ReviewResourceGuardSchema,
 preparation: Type.Optional(ReviewPreparationProgressSchema),
 progress: object({ completedUnits: count, totalUnits: Type.Union([count, Type.Null()]), observedAt: stamp, lastMeaningfulActivityAt: Type.Union([stamp, Type.Null()]) }),
 cancellation: Type.Optional(object({ actionId: id, reason: Type.String({ minLength: 1, maxLength: 2048 }), requestedAt: stamp, operationState: ReviewOperationStateSchema })),
 // A cold qualification can acknowledge an already accepted result prefix at
 // the initial binding (sequence zero); completion is still host-verified.
 committedResultBoundary: Type.Optional(object({ semanticSequence: count, historyBindingDigest: digest })),
 publicationBoundary: Type.Optional(object({ semanticSequence: positive, preservationDigest: digest, artifactId: id })),
});
export type ReviewRuntime = Static<typeof ReviewRuntimeSchema>;

export const PreparedContextManifestSchema = object({
 schemaVersion: Type.Literal(1), key: ReviewKeySchema, attempt: positive,
 generationId: digest, identityDigest: digest, inputDigest: digest, validatorVersion: positive,
 sourceIdentity: digest, manifestDigest: digest,
 objects: Type.Array(object({ queryDigest: digest, contentDigest: digest, bytes: count }), { maxItems: 100000 }),
 views: Type.Array(object({ id, objectDigests: Type.Array(digest, { maxItems: 100000, uniqueItems: true }) }), { maxItems: 10000 }),
 byteTotals: object({ stored: count, decoded: count }),
});
export type PreparedContextManifest = Static<typeof PreparedContextManifestSchema>;
/** Disposable staged-view encoding. Never interpret v1 eager views as v2. */
export const StagedContextManifestSchema = object({
 schemaVersion: Type.Literal(2), encoding: Type.Literal('staged-values-v2'),
 key: ReviewKeySchema, attempt: positive, generationId: digest, identityDigest: digest,
 inputDigest: digest, validatorVersion: positive, sourceIdentity: digest, manifestDigest: digest,
 objects: PreparedContextManifestSchema.properties.objects,
 views: Type.Array(object({ id, kind: enumeration(['packet', 'task', 'file', 'view']), rootDigest: digest }), { minItems: 1, maxItems: 10000 }),
 byteTotals: PreparedContextManifestSchema.properties.byteTotals,
});
export type StagedContextManifest = Static<typeof StagedContextManifestSchema>;
export function decodeStagedContextManifest(input: unknown, key: ReviewKey, maxBytes: number): StagedContextManifest {
 const value = decodePreparation(StagedContextManifestSchema, input, key, maxBytes);
 const queries = new Set<string>(), contents = new Map<string, number>(), views = new Set<string>();
 let total = 0;
 for (const item of value.objects) {
  if (queries.has(item.queryDigest)) throw new Error('Duplicate staged query identity');
  queries.add(item.queryDigest);
  const previous = contents.get(item.contentDigest);
  if (previous !== undefined && previous !== item.bytes) throw new Error('Conflicting staged content size');
  if (previous === undefined) { total += item.bytes; contents.set(item.contentDigest, item.bytes); }
 }
 for (const view of value.views) {
  if (views.has(view.id) || !contents.has(view.rootDigest)) throw new Error('Duplicate or unresolved staged descriptor');
  views.add(view.id);
 }
 if (!Number.isSafeInteger(total) || total !== value.byteTotals.stored) throw new Error('Unaccounted staged content');
 return value;
}
export const HistoryBindingSchema = object({
 schemaVersion: Type.Literal(1), key: ReviewKeySchema, attempt: positive,
 generationId: digest, priorBindingDigest: Type.Union([digest, Type.Null()]),
 semanticSequence: count, historyPrefixDigest: digest, evidenceManifestDigest: digest,
 lifecycle: Type.Optional(object({ generationId: digest, identityDigest: digest, inputDigest: digest,
  sourceIdentity: digest, validatorVersion: positive, manifestDigest: digest, storedBytes: count })),
 bindingDigest: digest,
});
export type HistoryBinding = Static<typeof HistoryBindingSchema>;
export const PreparedContextReferenceSchema = binding;

export const CleanupClaimSchema = object({
 schemaVersion: Type.Literal(1), key: ReviewKeySchema, attempt: positive, claimId: id,
 runtimeId: id, checkpointDigest: digest,
 checkpointFileIdentity: object({ dev: Type.String({ pattern: '^\\d+$' }), ino: Type.String({ pattern: '^\\d+$' }) }),
 closedAuditDigest: digest, context: Type.Optional(binding), approvalRevision: count,
 permanent: object({ artifactId: id, historyEntryId: id, preservationDigest: digest }),
 deletions: Type.Array(object({ kind: enumeration(['context', 'runtime', 'checkpoint']),
  relativePath: Type.String({ maxLength: 4096 }), nodeType: enumeration(['file', 'directory']),
  identity: digest, contentDigest: digest }), { minItems: 1, maxItems: 10000 }),
});
export type CleanupClaim = Static<typeof CleanupClaimSchema>;
export const PreparationAccessSchema = object({ capabilityId: id, daemonEpoch: id, expectedGenerationId: Type.Optional(digest) });
export type PreparationAccess = Static<typeof PreparationAccessSchema>;

export function decodePreparation<T extends TSchema>(schema: T, input: unknown, key: ReviewKey, maxBytes: number): Static<T> {
 if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid preparation capacity');
 const bytes = JSON.stringify(input);
 if (bytes === undefined || Buffer.byteLength(bytes) > maxBytes || !Value.Check(schema, input)) throw new Error('Invalid or oversized review preparation record');
 if (!Value.Check(ReviewKeySchema, key) || !isAbsolute(key.project) || normalize(key.project) !== key.project) throw new Error('Invalid canonical review key');
 if (!isDeepStrictEqual(Reflect.get(input as object, 'key'), key)) throw new Error('Foreign review preparation record');
 return input as Static<T>;
}
export function decodeReviewRuntime(input: unknown, key: ReviewKey): ReviewRuntime {
 const value = decodePreparation(ReviewRuntimeSchema, input, key, REVIEW_RUNTIME_MAX_BYTES);
 validateReviewResourceGuard(value.resourceGuard, key);
 if (value.resourceGuard.daemonInstance !== value.daemonEpoch || value.resourceGuard.openLeases.some(l => l.workerIncarnation !== value.workerIncarnation)) throw new Error('Foreign runtime resource owner');
 if (value.progress.totalUnits !== null && value.progress.completedUnits > value.progress.totalUnits) throw new Error('Impossible review completion count');
 const times = [value.progress.observedAt, value.progress.lastMeaningfulActivityAt, value.cancellation?.requestedAt];
 if (times.some(t => t !== null && t !== undefined && !Number.isFinite(Date.parse(t)))) throw new Error('Invalid runtime timestamp');
 if (value.preparation?.total !== null && value.preparation?.total !== undefined && value.preparation.logicalCompleted > value.preparation.total) throw new Error('Impossible preparation count');
 if (value.committedResultBoundary && (value.committedResultBoundary.semanticSequence > value.checkpointBinding.semanticSequence || value.committedResultBoundary.semanticSequence === value.checkpointBinding.semanticSequence && value.committedResultBoundary.historyBindingDigest !== value.checkpointBinding.historyBindingDigest)) throw new Error('Unbound result boundary');
 if (value.publicationBoundary && value.publicationBoundary.semanticSequence > value.checkpointBinding.semanticSequence) throw new Error('Unbound publication boundary');
 if (value.state === 'initializing' && (value.resourceGuard.openLeases.length || value.progress.completedUnits || value.committedResultBoundary || value.publicationBoundary)) throw new Error('Initializing runtime cannot execute or complete work');
 if (value.cancellation?.operationState === 'stopped' && value.resourceGuard.openLeases.length) throw new Error('Stopped runtime has unresolved resources');
 return value;
}
/** Decoding a reference never issues authority. The expected value must come
 * from the current host's private authenticated-owner registry, not disk/RPC. */
export function matchIssuedPreparationAccess(input: unknown, issued: PreparationAccess | undefined): PreparationAccess {
 if (!issued || !Value.Check(PreparationAccessSchema, input) || !isDeepStrictEqual(input, issued)) throw new Error('Unissued preparation access');
 return { ...issued };
}

export function decodePreparedContextManifest(input: unknown, key: ReviewKey, maxBytes: number): PreparedContextManifest {
 const v = decodePreparation(PreparedContextManifestSchema, input, key, maxBytes);
 if (new Set(v.objects.map(o => o.queryDigest)).size !== v.objects.length || new Set(v.views.map(o => o.id)).size !== v.views.length) throw new Error('Duplicate preparation object/view identity');
 const objects = new Map<string, number>();
 for (const o of v.objects) {
  const prior = objects.get(o.contentDigest);
  if (prior !== undefined && prior !== o.bytes) throw new Error('Conflicting preparation object size');
  objects.set(o.contentDigest, o.bytes);
 }
 if (v.views.some(view => view.objectDigests.some(d => !objects.has(d)))) throw new Error('Unresolved preparation view');
 const total = [...objects.values()].reduce((sum, bytes) => sum + bytes, 0);
 if (!Number.isSafeInteger(total) || total > v.byteTotals.stored) throw new Error('Unaccounted preparation bytes');
 return v;
}
export function decodeHistoryBinding(input: unknown, key: ReviewKey, maxBytes: number): HistoryBinding {
 const v = decodePreparation(HistoryBindingSchema, input, key, maxBytes);
 if (v.priorBindingDigest === v.bindingDigest) throw new Error('Self-referencing history binding');
 return v;
}
export function decodeCleanupClaim(input: unknown, key: ReviewKey, maxBytes: number): CleanupClaim {
 const v = decodePreparation(CleanupClaimSchema, input, key, maxBytes);
 const ids = v.deletions.map(d => `${d.kind}:${d.identity}`);
 if (new Set(ids).size !== ids.length || v.deletions.filter(d => d.kind === 'checkpoint').length !== 1 || v.deletions.filter(d => d.kind === 'runtime').length !== 1) throw new Error('Invalid cleanup deletion inventory');
 const paths = new Set<string>();
 for (const entry of v.deletions) {
  const path = entry.relativePath;
  if (path.includes('\\') || path.includes('\0') || path.startsWith('/') || path !== '' && path.split('/').some(p => !p || p === '.' || p === '..')
   || entry.kind !== 'context' && (path !== '' || entry.nodeType !== 'file') || paths.has(`${entry.kind}:${path}`)) throw new Error('Invalid cleanup deletion path');
  paths.add(`${entry.kind}:${path}`);
 }
 return v;
}
