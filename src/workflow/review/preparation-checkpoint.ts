/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { reviewJsonLimit } from '../../config/review.js';
import { ReviewRuntimeReferenceSchema, PreparedContextReferenceSchema } from '../../shared/review-preparation.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { ReviewKeySchema } from '../../shared/review-resources.js';
import { AdmissionCheckpointSchema, CodeAdmissionAttemptSchema, QualifiedAttemptSchema } from '../code-review/task-review/contracts.js';
import { decodeStoredCheckpoint } from '../code-review/task-review/admission-checkpoint.js';
import { DesignAdmissionCheckpointSchema, DesignAdmissionAttemptSchema, ResourceDesignAttemptSchema } from './design-review/contracts.js';
import { decodeStoredDesignCheckpoint } from './design-review/admission-checkpoint.js';

const refs = { schemaVersion: Type.Literal(3), runtime: ReviewRuntimeReferenceSchema, context: Type.Optional(PreparedContextReferenceSchema) };
const withoutGuard = <T extends typeof CodeAdmissionAttemptSchema | typeof QualifiedAttemptSchema | typeof DesignAdmissionAttemptSchema | typeof ResourceDesignAttemptSchema>(s: T) => Type.Omit(s, ['resourceGuard']);
export const CodePreparationCheckpointSchema = Type.Object({
 ...AdmissionCheckpointSchema.properties, ...refs,
 attempts: Type.Array(Type.Union([withoutGuard(CodeAdmissionAttemptSchema), withoutGuard(QualifiedAttemptSchema)]), { minItems: 1 }),
}, { additionalProperties: false });
export const DesignPreparationCheckpointSchema = Type.Object({
 ...DesignAdmissionCheckpointSchema.properties, ...refs,
 attempts: Type.Array(Type.Union([withoutGuard(DesignAdmissionAttemptSchema), withoutGuard(ResourceDesignAttemptSchema)]), { minItems: 1 }),
}, { additionalProperties: false });
export type CodePreparationCheckpoint = Static<typeof CodePreparationCheckpointSchema>;
export type DesignPreparationCheckpoint = Static<typeof DesignPreparationCheckpointSchema>;

/** Read-only discriminating codec. Existing execution consumers still refuse
 * v3 until the coordinated cutover; this does not introduce another engine. */
export function decodePreparationCheckpoint(input: unknown, key: ReviewKey) {
 if (!Value.Check(ReviewKeySchema, key)) throw new Error('Invalid preparation checkpoint key');
 const bytes = JSON.stringify(input);
 if (bytes === undefined || Buffer.byteLength(bytes) > reviewJsonLimit() || !input || typeof input !== 'object') throw new Error('Invalid preparation checkpoint');
 const version = Reflect.get(input, 'schemaVersion');
 const current = version === 3;
 if (![1, 2, 3].includes(version)) throw new Error('Unsupported preparation checkpoint version');
 if (current && !Value.Check(key.family === 'code' ? CodePreparationCheckpointSchema : DesignPreparationCheckpointSchema, input)) throw new Error('Invalid version-3 checkpoint');
 const { runtime: _runtime, context: _context, ...history } = input as Record<string, unknown>;
 const legacyInput = current ? { ...history, schemaVersion: 2 } : input;
 const decoded = key.family === 'code' ? decodeStoredCheckpoint(legacyInput) : decodeStoredDesignCheckpoint(legacyInput);
 if (decoded.project !== key.project || decoded.reviewId !== key.reviewId) throw new Error('Foreign preparation checkpoint');
 return current ? { format: 'current' as const, checkpoint: input as CodePreparationCheckpoint | DesignPreparationCheckpoint } : { format: 'historical' as const, checkpoint: decoded };
}
