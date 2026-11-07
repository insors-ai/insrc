/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import type { SelectedChange } from './packet.js';
import type { PinnedBlob } from './sources.js';

const object = <T extends Record<string, TSchema>>(fields: T) => Type.Object(fields, { additionalProperties: false });
const text = Type.String({ minLength: 1, maxLength: 65536 });
const oid = Type.String({ pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' });
const identity = Type.String({ pattern: '^[0-9a-f]{64}$' });
const index = Type.Integer({ minimum: 0, maximum: 9999 });
const indexes = Type.Array(index, { maxItems: 10000, uniqueItems: true });
const attempt = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
export const ReviewedSegmentSchema = Type.Union([
 object({ after: Type.Tuple([Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }), Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })]) }),
 object({ deletionAt: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }) }),
]);
export type ReviewedSegment = Static<typeof ReviewedSegmentSchema>;
export const OriginRefSchema = object({ changeIndex: index, segmentIndex: index });
export type OriginRef = Static<typeof OriginRefSchema>;
export const OriginDispositionSchema = object({ source: OriginRefSchema, sourcePart: ReviewedSegmentSchema,
 kind: Type.Union((['surviving', 'superseded', 'deleted'] as const).map(s => Type.Literal(s))),
 finalSegments: Type.Array(ReviewedSegmentSchema, { maxItems: 100000 }),
 replacementWitnesses: Type.Array(OriginRefSchema, { maxItems: 10000 }),
});
export type OriginDisposition = Static<typeof OriginDispositionSchema>;
export interface ProjectedEntry {
 readonly originChangeIndex: number; readonly commit: string; readonly path: string;
 readonly after: PinnedBlob | null; readonly findingScope: 'selected' | 'none'; readonly segments: readonly ReviewedSegment[];
}
export interface ReviewProjection {
 readonly revision: string; readonly entries: readonly ProjectedEntry[];
 readonly dispositions: readonly OriginDisposition[]; readonly identity: string;
}
export interface EffectiveTaskChange extends ProjectedEntry { readonly origin: SelectedChange; }
export const AcceptedDecisionSchema = Type.Union([
 object({ action: Type.Literal('initial') }),
 object({ action: Type.Literal('reassess'), reason: text }),
 object({ action: Type.Literal('reuse'), reason: text, sourceAttempt: attempt }),
]);
export type AcceptedDecision = Static<typeof AcceptedDecisionSchema>;
const attributionFields = { taskId: text, changeIndexes: indexes, testIndexes: indexes, decision: AcceptedDecisionSchema };
export const AcceptedTaskAttributionSchema = object(attributionFields);
export type AcceptedTaskAttribution = Static<typeof AcceptedTaskAttributionSchema>;
export const AttributionFailureSchema = object({ code: Type.String({ minLength: 1, maxLength: 64 }), summary: Type.String({ minLength: 1, maxLength: 8192 }) });
const binding = object({ taskId: text, identity });
/** These branches are integrated with checkpoint persistence in the attribution task. */
export const AttributionStateSchema = Type.Union([
 object({ attributionState: Type.Literal('pending'), finalScopeIdentity: identity }),
 object({ attributionState: Type.Literal('accepted'), finalScopeIdentity: identity,
  acceptedAttribution: Type.Array(AcceptedTaskAttributionSchema, { minItems: 1, maxItems: 10000 }),
  taskScopeIdentities: Type.Array(binding, { minItems: 1, maxItems: 10000 }), attributionIdentity: identity }),
 object({ attributionState: Type.Literal('failed'), finalScopeIdentity: identity, attributionIdentity: identity, attributionFailure: AttributionFailureSchema }),
]);
const entry = Type.Union([
 object({ originChangeIndex: index, path: text, blobOid: Type.Union([oid, Type.Null()]), findingScope: Type.Literal('selected'), segments: Type.Array(ReviewedSegmentSchema, { minItems: 1, maxItems: 100000 }) }),
 object({ originChangeIndex: index, path: text, blobOid: Type.Union([oid, Type.Null()]), findingScope: Type.Literal('none'), segments: Type.Array(ReviewedSegmentSchema, { maxItems: 0 }) }),
]);
const snapshotFields = { revision: oid, identity, entries: Type.Array(entry, { minItems: 1, maxItems: 10000 }),
 dispositions: Type.Array(OriginDispositionSchema, { maxItems: 100000 }), selectedTaskIds: Type.Array(text, { minItems: 1, maxItems: 10000, uniqueItems: true }),
 testCount: Type.Integer({ minimum: 0, maximum: 10000 }), attributionIdentity: identity };
export const FinalScopeSnapshotSchema = Type.Union([
 object({ ...snapshotFields, attributionState: Type.Literal('accepted'), tasks: Type.Array(object({ ...attributionFields, identity }), { minItems: 1, maxItems: 10000 }) }),
 object({ ...snapshotFields, attributionState: Type.Literal('unmapped_failure'), tasks: Type.Array(Type.Never(), { maxItems: 0 }), attributionFailure: AttributionFailureSchema }),
]);
export type FinalScopeSnapshot = Static<typeof FinalScopeSnapshotSchema>;
