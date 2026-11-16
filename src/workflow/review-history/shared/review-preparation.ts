/** Read-only historical review compatibility. No live review execution. */
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isAbsolute, normalize } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ReviewKeySchema, ReviewResourceGuardSchema, validateReviewResourceGuard } from "./review-resources.js";
import type { ReviewKey } from "./review-resources.js";
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
export const HistoryBindingSchema = object({
    schemaVersion: Type.Literal(1), key: ReviewKeySchema, attempt: positive,
    generationId: digest, priorBindingDigest: Type.Union([digest, Type.Null()]),
    semanticSequence: count, historyPrefixDigest: digest, evidenceManifestDigest: digest,
    lifecycle: Type.Optional(object({ generationId: digest, identityDigest: digest, inputDigest: digest,
        sourceIdentity: digest, validatorVersion: positive, manifestDigest: digest, storedBytes: count })),
    bindingDigest: digest,
});
export const PreparedContextReferenceSchema = binding;
export function decodePreparation<T extends TSchema>(schema: T, input: unknown, key: ReviewKey, maxBytes: number): Static<T> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
        throw new Error('Invalid preparation capacity');
    const bytes = JSON.stringify(input);
    if (bytes === undefined || Buffer.byteLength(bytes) > maxBytes || !Value.Check(schema, input))
        throw new Error('Invalid or oversized review preparation record');
    if (!Value.Check(ReviewKeySchema, key) || !isAbsolute(key.project) || normalize(key.project) !== key.project)
        throw new Error('Invalid canonical review key');
    if (!isDeepStrictEqual(Reflect.get(input as object, 'key'), key))
        throw new Error('Foreign review preparation record');
    return input as Static<T>;
}
export function decodeReviewRuntime(input: unknown, key: ReviewKey): ReviewRuntime {
    const value = decodePreparation(ReviewRuntimeSchema, input, key, REVIEW_RUNTIME_MAX_BYTES);
    validateReviewResourceGuard(value.resourceGuard, key);
    if (value.resourceGuard.daemonInstance !== value.daemonEpoch || value.resourceGuard.openLeases.some(l => l.workerIncarnation !== value.workerIncarnation))
        throw new Error('Foreign runtime resource owner');
    if (value.progress.totalUnits !== null && value.progress.completedUnits > value.progress.totalUnits)
        throw new Error('Impossible review completion count');
    const times = [value.progress.observedAt, value.progress.lastMeaningfulActivityAt, value.cancellation?.requestedAt];
    if (times.some(t => t !== null && t !== undefined && !Number.isFinite(Date.parse(t))))
        throw new Error('Invalid runtime timestamp');
    if (value.preparation?.total !== null && value.preparation?.total !== undefined && value.preparation.logicalCompleted > value.preparation.total)
        throw new Error('Impossible preparation count');
    if (value.committedResultBoundary && (value.committedResultBoundary.semanticSequence > value.checkpointBinding.semanticSequence || value.committedResultBoundary.semanticSequence === value.checkpointBinding.semanticSequence && value.committedResultBoundary.historyBindingDigest !== value.checkpointBinding.historyBindingDigest))
        throw new Error('Unbound result boundary');
    if (value.publicationBoundary && value.publicationBoundary.semanticSequence > value.checkpointBinding.semanticSequence)
        throw new Error('Unbound publication boundary');
    if (value.state === 'initializing' && (value.resourceGuard.openLeases.length || value.progress.completedUnits || value.committedResultBoundary || value.publicationBoundary))
        throw new Error('Initializing runtime cannot execute or complete work');
    if (value.cancellation?.operationState === 'stopped' && value.resourceGuard.openLeases.length)
        throw new Error('Stopped runtime has unresolved resources');
    return value;
}
