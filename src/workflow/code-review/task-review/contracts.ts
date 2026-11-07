import { FailureDiagnosticsSchema } from './diagnostic-schema.js';
import type { FailureDiagnostic } from './diagnostic-schema.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { ProgressSchema } from './progress.js';
import type { ReviewProgress } from './progress.js';
import { CloneType, Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { AcceptedTaskAttributionSchema, AttributionFailureSchema } from './final-scope-contracts.js';
import type { AcceptedTaskAttribution } from './final-scope-contracts.js';

const cloneFields = <T extends Record<string, TSchema>>(fields: T): T => Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, CloneType(schema)])) as T;
const object = <T extends Record<string, TSchema>>(fields: T) => Type.Object(fields, { additionalProperties: false });
const text = Type.String({ minLength: 1, maxLength: 65536 });
const strings = Type.Array(text, { maxItems: 10000 });
export const MAX_REVIEW_JSON_BYTES = 4 * 1024 * 1024;
const oid = Type.String({ pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' });
const range = Type.Tuple([Type.Integer({ minimum: 1 }), Type.Integer({ minimum: 1 })]);
export const DocumentSchema = object({ path: text, commit: oid });
/** What a route without a Plan derived when the review was admitted: the epic and the single review unit, kept so a stored review is re-read without reading the Story's artifacts again. */
export const DerivedSchema = object({ epicHash: text, unit: object({ id: text, title: text, summary: text, size: Type.Union((['S', 'M', 'L'] as const).map(s => Type.Literal(s))), acceptanceChecks: Type.Array(text, { minItems: 1, maxItems: 10000 }) }) });
export type StoredDerived = Static<typeof DerivedSchema>;
export const TestDetailSchema = object({ file: text, cases: Type.Array(text, { minItems: 1, maxItems: 10000 }), command: text,
 result: Type.Union((['pass', 'fail', 'skipped', 'not_run'] as const).map(s => Type.Literal(s))), executionDetails: text, evidenceReferences: strings });
const storedPacketFields = { reviewRevision: Type.Optional(oid), storyId: text, taskId: Type.Optional(text), functionalSummary: text,
 documents: object({ story: Type.Optional(DocumentSchema), lld: Type.Optional(DocumentSchema), plan: Type.Optional(DocumentSchema), issue: Type.Optional(DocumentSchema) }),
 reviewSet: Type.Array(object({ commit: oid, parent: Type.Union([oid, Type.Null()]), files: Type.Array(object({ path: text,
  previousPath: Type.Optional(text), segments: Type.Array(object({ before: Type.Optional(range), after: Type.Optional(range), deletionAt: Type.Optional(Type.Integer({ minimum: 0 })) }), { maxItems: 10000 }) }), { minItems: 1, maxItems: 10000 }) }), { minItems: 1, maxItems: 10000 }),
 tests: Type.Array(TestDetailSchema, { maxItems: 10000 }) };
export const StoredPacketSchema = object(cloneFields(storedPacketFields));
/** New submissions exclude prior-version selections. Stored history remains immutable. */
const submissionFields = cloneFields(storedPacketFields);
Reflect.deleteProperty(submissionFields.reviewSet.items.properties.files.items.properties.segments.items.properties, 'before');
// Object construction computes required from the NEW non-optional field.
export const PacketSchema = object({ ...submissionFields, reviewRevision: CloneType(oid) });
export const TaskResultSchema = object({ taskId: text,
 status: Type.Union((['passed', 'changes_requested', 'incomplete', 'failed'] as const).map(s => Type.Literal(s))), summary: text,
 findings: Type.Array(object({ severity: Type.Union((['HIGH', 'MED', 'LOW'] as const).map(s => Type.Literal(s))), location: text,
  message: text, rationale: text, evidenceReferences: Type.Array(text, { minItems: 1, maxItems: 10000 }) }), { maxItems: 10000 }),
 testCoverage: Type.Object({ assessment: Type.Union((['verified', 'partial', 'unverified', 'unsupported'] as const).map(s => Type.Literal(s))), explanation: text, evidenceReferences: strings }, { additionalProperties: false, description: 'Mandatory evidence-backed review of relevant test coverage. Verified means this assessment is complete, not that tests were executed. Report demonstrated coverage defects in findings.' }),
 limitations: Type.Array(text, { maxItems: 10000, description: 'Blocking omissions of mandatory code/module, requirements or test-coverage review only. Any skipped required review scope means incomplete. Do not put skipped optional execution here.' }),
 advice: Type.Array(text, { maxItems: 10000, description: 'Nonblocking optional execution disclosures (integration checks, tests, typecheck or build not run) and optional improvements. Prefix execution disclosures with Optional execution:.' }), inspectedReferences: strings, executedTests: Type.Array(TestDetailSchema, { maxItems: 10000 }), error: Type.Optional(text) });
export const TaskOriginSchema = object({ taskId: text, sourceAttempt: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }), reason: text });
export type TaskResultOrigin = Static<typeof TaskOriginSchema>;
export const ReviewRequestSchema = object({ reviewId: text, attempt: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
 operation: Type.Optional(Type.Union([Type.Literal('start'), Type.Literal('resume')])), packet: Type.Optional(PacketSchema) });
export const SavedReviewRequestSchema = object({ ...ReviewRequestSchema.properties, packet: Type.Optional(StoredPacketSchema) });
export type ReviewOperation = 'start' | 'resume';
export type ReviewPacket = Static<typeof StoredPacketSchema>;
export type CommittedDocument = Static<typeof DocumentSchema>;
export type TaskReviewResult = Static<typeof TaskResultSchema>;
export type SubmittedTestDetail = Static<typeof TestDetailSchema>;
export type ReviewStatus = 'pending' | 'running' | TaskReviewResult['status'];
export type ReviewerParty = 'daemon' | 'controller';
export class TaskReviewInputError extends Error {
 constructor(readonly field: string, message: string) { super(`${field}: ${message}`); this.name = 'TaskReviewInputError'; }
}
export function requireReview(condition: unknown, field: string, message: string): asserts condition {
 if (!condition) throw new TaskReviewInputError(field, message);
}
/** Snapshot untrusted input once; callers cannot mutate an admitted packet through their original object. */
export function decodeReview<T extends TSchema>(schema: T, input: unknown): Static<T> {
 let value: unknown;
 try { const bytes = JSON.stringify(input); requireReview(bytes && Buffer.byteLength(bytes) <= MAX_REVIEW_JSON_BYTES, 'input', 'JSON exceeds limit'); value = JSON.parse(bytes); }
 catch { throw new TaskReviewInputError('input', 'Expected bounded JSON'); }
 const errors = [...Value.Errors(schema, value)];
 requireReview(errors.length === 0, errors[0]?.path ?? 'input', errors[0]?.message ?? 'Invalid schema');
 return value as Static<T>;
}
export function reviewPath(path: string): void {
 requireReview(!/[\\\x00-\x1f\x7f:]/.test(path) && !path.startsWith('/') && path.split('/').every(p => p && p !== '.' && p !== '..'), 'path', 'Expected repository-relative literal path');
}
export function parsePacket(input: unknown, historical = false): ReviewPacket {
 let packet: ReviewPacket;
 try { packet = decodeReview(historical ? StoredPacketSchema : PacketSchema, input); }
 catch (error) {
  if (error instanceof TaskReviewInputError && error.field === '/reviewRevision') throw new TaskReviewInputError('reviewRevision', 'Expected a full commit object ID');
  throw error;
 }
 for (const document of Object.values(packet.documents)) reviewPath(document.path);
 for (const test of packet.tests) reviewPath(test.file);
 const selected = new Set<string>();
 for (const commit of packet.reviewSet) {
  requireReview(commit.parent !== commit.commit, 'parent', 'A commit is not its own parent');
  for (const file of commit.files) {
   reviewPath(file.path); if (file.previousPath) reviewPath(file.previousPath);
   requireReview(historical || file.segments.length > 0, 'scope_conflict', `Origin change ${selected.size} (${file.path}) has no selected segments`);
   for (const segment of file.segments) {
    requireReview(historical || segment.before === undefined, 'segments', 'Before-version selections are not accepted; submit reviewed-version blocks or a deletion anchor');
    requireReview(segment.before || segment.after || segment.deletionAt !== undefined, 'segments', 'A reviewed block or deletion anchor is required');
    requireReview(segment.deletionAt === undefined || (!segment.before && !segment.after), 'segments', 'Deletion anchors cannot carry code ranges');
    for (const side of [segment.before, segment.after]) if (side) requireReview(side[0] <= side[1], 'segments', 'Reversed range');
   }
   const key = JSON.stringify([commit.commit, commit.parent, file]);
   requireReview(!selected.has(key), 'reviewSet', 'Duplicate selected file entry'); selected.add(key);
  }
 }
 return packet;
}
export interface ReviewAttempt {
 progress?: ReviewProgress;
 header: { attempt: number; reviewer: ReviewerParty; status: ReviewStatus; createdAt: string; completedAt?: string; activeTaskId?: string; interrupted?: boolean; selectedTaskIds: readonly string[]; derived?: StoredDerived | undefined; buildFingerprint?: string; attributionRepair?: { rejections: number; feedback: string }; reassessmentSummary?: string;
 finalScopeIdentity?: string; attributionState?: 'pending' | 'accepted' | 'failed'; acceptedAttribution?: readonly AcceptedTaskAttribution[]; taskScopeIdentities?: readonly { taskId: string; identity: string }[]; attributionIdentity?: string; attributionFailure?: { code: string; summary: string } };
 submitted: ReviewPacket;
 'review-response': { failureDiagnostics?: readonly FailureDiagnostic[]; summary: string; tasks: readonly TaskReviewResult[]; crPath?: string; crPublication: 'pending' | 'complete'; error?: string; origins?: readonly TaskResultOrigin[] };
}
export interface ReviewCheckpoint { schemaVersion: 1; reviewId: string; project: string; storyId: string; taskId?: string; attempts: readonly ReviewAttempt[]; }
export interface CompletedReviewSummary {
 reviewId: string; attempt: number; storyId: string; taskId?: string; reviewer: ReviewerParty; status: TaskReviewResult['status'];
 scope: Pick<ReviewPacket, 'storyId' | 'taskId' | 'documents' | 'reviewSet'>; tasks: readonly TaskReviewResult[]; summary: string; completedAt: string; buildFingerprint?: string; reassessmentSummary?: string; origins?: readonly TaskResultOrigin[];
}
/** Publication is deliberately distinct from the legacy dimension-shaped version-1 CR. */
export interface TaskBasedCodeReviewRecord {
 meta: { workflow: 'code-review'; schemaVersion: 2 };
 body: { kind: 'code-review'; format: 'task-based'; storyId: string; status: TaskReviewResult['status']; reviews: readonly CompletedReviewSummary[] };
}

export const CheckpointSchema = Type.Object({ schemaVersion:Type.Literal(1), reviewId:text, project:text, storyId:text, taskId:Type.Optional(text), attempts:Type.Array(Type.Object({
 progress:Type.Optional(ProgressSchema),
 header:Type.Object({ attempt:Type.Integer({ minimum:1, maximum:Number.MAX_SAFE_INTEGER }), reviewer:Type.Union([Type.Literal('daemon'),Type.Literal('controller')]), status:Type.Union([Type.Literal('pending'),Type.Literal('running'),TaskResultSchema.properties.status]), createdAt:text, completedAt:Type.Optional(text), activeTaskId:Type.Optional(text), interrupted:Type.Optional(Type.Boolean()), selectedTaskIds:Type.Array(text), derived:Type.Optional(DerivedSchema), buildFingerprint:Type.Optional(text), attributionRepair:Type.Optional(object({rejections:Type.Integer({minimum:1,maximum:3}),feedback:Type.String({minLength:1,maxLength:8192})})), reassessmentSummary:Type.Optional(text), finalScopeIdentity:Type.Optional(Type.String({pattern:'^[0-9a-f]{64}$'})), attributionState:Type.Optional(Type.Union((['pending','accepted','failed'] as const).map(s=>Type.Literal(s)))), acceptedAttribution:Type.Optional(Type.Array(AcceptedTaskAttributionSchema,{maxItems:10000})), taskScopeIdentities:Type.Optional(Type.Array(object({taskId:text,identity:Type.String({pattern:'^[0-9a-f]{64}$'})}),{maxItems:10000})), attributionIdentity:Type.Optional(Type.String({pattern:'^[0-9a-f]{64}$'})), attributionFailure:Type.Optional(AttributionFailureSchema) },{additionalProperties:false}),
 submitted:StoredPacketSchema, 'review-response':Type.Object({ failureDiagnostics:Type.Optional(FailureDiagnosticsSchema), summary:Type.String(), tasks:Type.Array(TaskResultSchema), crPath:Type.Optional(text), crPublication:Type.Union([Type.Literal('pending'),Type.Literal('complete')]), error:Type.Optional(text), origins:Type.Optional(Type.Array(TaskOriginSchema, {maxItems:10000})) },{additionalProperties:false})
 },{additionalProperties:false}),{minItems:1}) },{additionalProperties:false});
