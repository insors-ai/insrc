/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const DESIGN_LIMITS = {
 subjectBytes: 8 * 1024 * 1024, checkpointBytes: 64 * 1024 * 1024,
 resultBytes: 1024 * 1024, requestBytes: 1024 * 1024 + 65536,
 units: 8192, chunks: 128, findings: 256, text: 8192, path: 2048,
} as const;
const object = <T extends Record<string, TSchema>>(fields: T) => Type.Object(fields, { additionalProperties: false });
const enumeration = <const T extends readonly string[]>(values: T) => Type.Union(values.map(value => Type.Literal(value)));
const text = Type.String({ minLength: 1, maxLength: DESIGN_LIMITS.text });
const path = Type.String({ minLength: 1, maxLength: DESIGN_LIMITS.path });
const id = Type.String({ minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$' });
const number = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const positive = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const timestamp = Type.String({ minLength: 20, maxLength: 30, pattern: '^\\d{4}-\\d{2}-\\d{2}T.*Z$' });
const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const texts = Type.Array(text, { maxItems: DESIGN_LIMITS.units });
const refs = Type.Array(path, { maxItems: DESIGN_LIMITS.units });
const ids = Type.Array(id, { maxItems: DESIGN_LIMITS.units });
export const DesignStatusSchema = enumeration(['pending','running','interrupted','paused','invalidated','passed','changes_requested','incomplete','failed']);
export type DesignReviewStatus = Static<typeof DesignStatusSchema>;
export const DesignWorkflowSchema = object({
 kind: enumeration(['epic','standalone','issue']), rootArtifactId: path,
 requiredReferences: Type.Array(object({ role: text, artifactId: path, path }), { maxItems: 128 }),
 availableReferences: Type.Array(object({ role: text, path }), { maxItems: 128 }),
 notApplicableRoles: Type.Array(text, { maxItems: 128 }),
});
export type DesignWorkflowContext = Static<typeof DesignWorkflowSchema>;
export const DesignSubjectSchema = object({
 project: path, artifactId: path, kind: enumeration(['DEF','HLD','LLD']),
 canonicalPath: path, documentPath: path, reviewer: enumeration(['daemon','controller']), workflow: DesignWorkflowSchema,
});
export type DesignReviewSubject = Static<typeof DesignSubjectSchema>;
export const DesignInventorySchema = object({ units: Type.Array(object({
 id: path, selector: path, title: text, kind: enumeration(['section','requirement','story','contract','citation','visual']),
}), { minItems: 1, maxItems: DESIGN_LIMITS.units }) });
export type DesignReviewInventory = Static<typeof DesignInventorySchema>;
export const DesignPlanSchema = object({
 chunks: Type.Array(object({ id, title: text, selectors: refs, concerns: texts,
  dependsOn: Type.Array(id, { maxItems: DESIGN_LIMITS.chunks }), purpose: enumeration(['substantive','consistency']),
 }), { minItems: 2, maxItems: DESIGN_LIMITS.chunks }),
 coverageExplanation: text, finalConsistencyChunkId: id,
 coverage: Type.Array(object({ unitId: path, chunkIds: Type.Array(id, { minItems: 1, maxItems: DESIGN_LIMITS.chunks }) }), { minItems: 1, maxItems: DESIGN_LIMITS.units }),
});
export type DesignChunkPlan = Static<typeof DesignPlanSchema>;
export type DesignChunk = DesignChunkPlan['chunks'][number];
export const DesignResultSchema = object({
 chunkId: id, status: enumeration(['passed','changes_requested','incomplete']), summary: text,
 findings: Type.Array(object({ id, severity: enumeration(['HIGH','MED','LOW']), location: path,
  message: text, evidenceReferences: Type.Array(path, { minItems: 1, maxItems: 128 }),
 }), { maxItems: DESIGN_LIMITS.findings }),
 inspectedReferences: refs, limitations: texts, advice: texts,
});
export type DesignChunkResult = Static<typeof DesignResultSchema>;
export type DesignFinding = DesignChunkResult['findings'][number];
export const DesignActivitySchema = object({ sessionId: id, sequence: positive,
 kind: enumeration(['session_started','model_output','tool_started','tool_completed','feedback_submitted','heartbeat']),
 toolId: Type.Optional(id),
});
export const DesignProgressSchema = object({ status: DesignStatusSchema,
 phase: enumeration(['planning','impact','chunk_review','tool_running','persisting','publishing','complete']),
 activeChunkId: Type.Optional(id), completedChunks: number, totalChunks: number,
 lastMeaningfulActivityAt: Type.Union([timestamp, Type.Null()]), activeToolCount: number,
 requiresUserInput: Type.Boolean(), checkpointPath: path, sequence: number,
 reviewElapsedMs: number, unitElapsedMs: Type.Union([number, Type.Null()]),
 observedAt: timestamp, freshness: enumeration(['live','stored']),
});
export type DesignReviewProgress = Static<typeof DesignProgressSchema>;
export const DesignReportSchema = object({ reviewId: id, attempt: positive, artifactId: path,
 status: enumeration(['passed','changes_requested','incomplete','failed','invalidated']),
 counts: object({ HIGH: number, MED: number, LOW: number }),
 chunks: Type.Array(DesignResultSchema, { maxItems: DESIGN_LIMITS.chunks }), limitations: texts,
 reviewer: enumeration(['daemon','controller']), reviewedContentIdentity: digest,
});
export type DesignReviewConsolidated = Static<typeof DesignReportSchema>;
const baseline = object({ subjectFingerprints: object({ canonical: digest, document: digest }), contentIdentity: digest,
 reviewedContent: object({ canonical: Type.String({ maxLength: DESIGN_LIMITS.subjectBytes }), document: Type.String({ maxLength: DESIGN_LIMITS.subjectBytes }) }), capturedAt: timestamp,
});
export type DesignBaseline = Static<typeof baseline>;
export const DesignAttemptSchema = object({
 number: positive, status: DesignStatusSchema, baseline, inventory: DesignInventorySchema,
 plan: Type.Optional(DesignPlanSchema), completedChunks: Type.Array(DesignResultSchema, { maxItems: DESIGN_LIMITS.chunks }),
 progress: DesignProgressSchema, startedAt: timestamp, finishedAt: Type.Optional(timestamp),
 current: Type.Optional(object({ kind: enumeration(['planning','chunk']), executionId: id,
  chunkId: Type.Optional(id), sequence: number, issuedAt: timestamp,
 })),
 failure: Type.Optional(object({ code: id, summary: text })),
 report: Type.Optional(DesignReportSchema), model: Type.Optional(text),
});
export type DesignAttempt = Static<typeof DesignAttemptSchema>;
export const DesignCheckpointSchema = object({ schemaVersion: Type.Literal(1), reviewId: id, project: path,
 artifactId: path, subject: DesignSubjectSchema,
 submitted: object({ artifactPath: path, attempt: positive }),
 attempts: Type.Array(DesignAttemptSchema, { minItems: 1, maxItems: 128 }),
});
export type DesignReviewCheckpoint = Static<typeof DesignCheckpointSchema>;
const identity = { repo: path, reviewId: id, attempt: positive };
const submission = { ...identity, executionId: id, sequence: positive };
export const DESIGN_REVIEW_PHASES = ['start','progress','assignment','plan','activity','result'] as const;
export const DesignRequestSchemas = {
 start: object({ phase: Type.Literal('start'), repo: path, reviewId: id, attempt: Type.Literal(1), artifactPath: path }),
 progress: object({ phase: Type.Literal('progress'), ...identity, afterCompletedChunk: Type.Optional(number), includeResult: Type.Optional(Type.Boolean()) }),
 assignment: object({ phase: Type.Literal('assignment'), ...identity }),
 plan: object({ phase: Type.Literal('plan'), ...submission, plan: DesignPlanSchema }),
 activity: object({ phase: Type.Literal('activity'), ...submission, event: DesignActivitySchema }),
 result: object({ phase: Type.Literal('result'), ...submission, result: DesignResultSchema }),
};
export const DesignRequestSchema = Type.Union(Object.values(DesignRequestSchemas));
export type DesignReviewRequest = Static<typeof DesignRequestSchema>;
export type DesignReviewStart = Static<typeof DesignRequestSchemas.start>;
export interface DesignReviewAcknowledgement {
 readonly reviewId: string; readonly attempt: number; readonly artifactId: string;
 readonly reviewer: 'daemon' | 'controller'; readonly status: DesignReviewStatus; readonly checkpointPath: string;
}
export interface DesignUnitAssignment {
 readonly kind: 'planning' | 'chunk'; readonly executionId: string; readonly sequence: number;
 readonly chunkId?: string | undefined; readonly prompt: string; readonly schema: TSchema;
}
export class DesignReviewError extends Error {
 constructor(readonly code: string, message: string) { super(message); this.name = 'DesignReviewError'; }
}
export class DesignReviewInputError extends DesignReviewError {
 constructor(code: string, message: string) { super(code, message); this.name = 'DesignReviewInputError'; }
}
export class DesignReviewContextError extends DesignReviewError {
 constructor(message: string) { super('invalid_context', message); this.name = 'DesignReviewContextError'; }
}
export class DesignReviewConflictError extends DesignReviewError {
 constructor(message: string) { super('review_conflict', message); this.name = 'DesignReviewConflictError'; }
}
export class DesignReviewPersistenceError extends DesignReviewError {
 constructor(message: string) { super('persistence_failed', message); this.name = 'DesignReviewPersistenceError'; }
}
export class DesignReviewOwnerError extends DesignReviewError {
 constructor(message: string) { super('wrong_owner', message); this.name = 'DesignReviewOwnerError'; }
}
export function requireDesign(condition: unknown, code: string, message: string): asserts condition {
 if (!condition) throw new DesignReviewError(code, message);
}
/** Snapshot untrusted JSON; reject excess size rather than trimming review scope. */
export function decodeDesign<T extends TSchema>(schema: T, input: unknown, maxBytes: number = DESIGN_LIMITS.checkpointBytes): Static<T> {
 let value: unknown;
 try {
  const raw = JSON.stringify(input);
  requireDesign(typeof raw === 'string' && Buffer.byteLength(raw) <= maxBytes, 'input_too_large', 'Expected bounded JSON');
  value = JSON.parse(raw);
 } catch (error) {
  if (error instanceof DesignReviewError) throw error;
  throw new DesignReviewError('invalid_json', 'Expected serializable JSON');
 }
 const error = Value.Errors(schema, value).First();
 requireDesign(!error, 'invalid_schema', `${error?.path ?? 'input'}: ${error?.message ?? 'Invalid schema'}`);
 return value as Static<T>;
}
export function parseDesignRequest(input: unknown): DesignReviewRequest {
 try {
  const request = decodeDesign(DesignRequestSchema, input, DESIGN_LIMITS.requestBytes);
  if (request.phase === 'result') decodeDesign(DesignResultSchema, request.result, DESIGN_LIMITS.resultBytes);
  return request;
 } catch (error) {
  if (error instanceof DesignReviewError) throw new DesignReviewInputError(error.code, error.message);
  throw error;
 }
}
export function currentDesignAttempt(checkpoint: DesignReviewCheckpoint): DesignAttempt {
 const attempt = checkpoint.attempts.at(-1);
 requireDesign(attempt, 'missing_attempt', 'Checkpoint has no attempt');
 return attempt;
}
