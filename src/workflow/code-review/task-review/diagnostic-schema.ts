import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

const text = (maxLength: number) => Type.String({ maxLength });
export const DiagnosticSnapshotSchema = Type.Object({
 provider: Type.Union([Type.Literal('claude'), Type.Literal('codex')]),
 issues: Type.Array(Type.Object({ code: Type.String({ minLength: 1, maxLength: 64 }), field: Type.String({ minLength: 1, maxLength: 256 }),
  correction: Type.String({ minLength: 1, maxLength: 256 }), message: Type.Optional(text(1024)), occurrences: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }) }, { additionalProperties: false }), { maxItems: 8 }),
 terminal: Type.Optional(Type.Object({ reason: Type.String({ minLength: 1, maxLength: 64 }), exitCode: Type.Optional(Type.Integer({ minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER })), message: Type.Optional(text(1024)) }, { additionalProperties: false })),
 lastRejectedFeedback: Type.Optional(Type.Object({ preview: text(8192), truncated: Type.Boolean() }, { additionalProperties: false })),
 truncated: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export const FailureDiagnosticSchema = Type.Object({
 phase: Type.Union([Type.Literal('attribution'), Type.Literal('assessment')]),
 taskId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
 diagnostic: DiagnosticSnapshotSchema,
 resolved: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export type FailureDiagnostic = Static<typeof FailureDiagnosticSchema>;
export const FailureDiagnosticsSchema = Type.Array(FailureDiagnosticSchema, { maxItems: 10000 });
