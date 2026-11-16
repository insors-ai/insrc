/** Read-only historical review compatibility. No live review execution. */
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { ReviewRuntimeReferenceSchema, PreparedContextReferenceSchema } from "../shared/review-preparation.js";
import { ReviewResourceGuardSchema } from "../shared/review-resources.js";
import { AdmissionCheckpointSchema, CodeAdmissionAttemptSchema, QualifiedAttemptSchema } from "../code-review/task-review/contracts.js";
import { DesignAdmissionCheckpointSchema, DesignAdmissionAttemptSchema, ResourceDesignAttemptSchema } from "./design-review/contracts.js";
/** Closed historical guard receipts remain audit data, never live authority. */
export const HistoricalPreparationMigrationSchema = Type.Object({
    sourceVersion: Type.Union([Type.Literal(1), Type.Literal(2)]),
    sourceDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    guards: Type.Array(Type.Object({ attempt: Type.Integer({ minimum: 1 }), guard: ReviewResourceGuardSchema }, { additionalProperties: false })),
}, { additionalProperties: false });
const refs = { schemaVersion: Type.Literal(3), runtime: ReviewRuntimeReferenceSchema, context: Type.Optional(PreparedContextReferenceSchema),
    migration: Type.Optional(HistoricalPreparationMigrationSchema) };
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
