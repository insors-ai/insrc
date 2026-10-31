/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const object = <T extends Record<string, TSchema>>(fields: T) => Type.Object(fields, { additionalProperties: false });
const text = Type.String({ minLength: 1, maxLength: 65536 });
const strings = Type.Array(text, { maxItems: 10000 });
const oid = Type.String({ pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' });
const range = Type.Tuple([Type.Integer({ minimum: 1 }), Type.Integer({ minimum: 1 })]);
export const DocumentSchema = object({ path: text, commit: oid });
export const TestDetailSchema = object({ file: text, cases: Type.Array(text, { minItems: 1, maxItems: 10000 }), command: text,
 result: Type.Union((['pass', 'fail', 'skipped', 'not_run'] as const).map(s => Type.Literal(s))), executionDetails: text, evidenceReferences: strings });
export const PacketSchema = object({ storyId: text, taskId: Type.Optional(text), functionalSummary: text,
 documents: object({ story: DocumentSchema, lld: DocumentSchema, plan: DocumentSchema }),
 reviewSet: Type.Array(object({ commit: oid, parent: Type.Union([oid, Type.Null()]), files: Type.Array(object({ path: text,
  previousPath: Type.Optional(text), segments: Type.Array(object({ before: Type.Optional(range), after: Type.Optional(range) }), { maxItems: 10000 }) }), { minItems: 1, maxItems: 10000 }) }), { minItems: 1, maxItems: 10000 }),
 tests: Type.Array(TestDetailSchema, { maxItems: 10000 }) });
export const TaskResultSchema = object({ taskId: text,
 status: Type.Union((['passed', 'changes_requested', 'incomplete', 'failed'] as const).map(s => Type.Literal(s))), summary: text,
 findings: Type.Array(object({ severity: Type.Union((['HIGH', 'MED', 'LOW'] as const).map(s => Type.Literal(s))), location: text,
  message: text, rationale: text, evidenceReferences: Type.Array(text, { minItems: 1, maxItems: 10000 }) }), { maxItems: 10000 }),
 testCoverage: object({ assessment: Type.Union((['verified', 'partial', 'unverified', 'unsupported'] as const).map(s => Type.Literal(s))), explanation: text, evidenceReferences: strings }),
 limitations: strings, advice: strings, inspectedReferences: strings, executedTests: Type.Array(TestDetailSchema, { maxItems: 10000 }), error: Type.Optional(text) });
export type ReviewPacket = Static<typeof PacketSchema>;
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
 try { const bytes = JSON.stringify(input); requireReview(bytes && Buffer.byteLength(bytes) <= 4 * 1024 * 1024, 'input', 'JSON exceeds limit'); value = JSON.parse(bytes); }
 catch { throw new TaskReviewInputError('input', 'Expected bounded JSON'); }
 const errors = [...Value.Errors(schema, value)];
 requireReview(errors.length === 0, errors[0]?.path ?? 'input', errors[0]?.message ?? 'Invalid schema');
 return value as Static<T>;
}
export function reviewPath(path: string): void {
 requireReview(!/[\\\x00-\x1f\x7f:]/.test(path) && !path.startsWith('/') && path.split('/').every(p => p && p !== '.' && p !== '..'), 'path', 'Expected repository-relative literal path');
}
export function parsePacket(input: unknown): ReviewPacket {
 const packet = decodeReview(PacketSchema, input);
 for (const document of Object.values(packet.documents)) reviewPath(document.path);
 for (const test of packet.tests) reviewPath(test.file);
 const selected = new Set<string>();
 for (const commit of packet.reviewSet) {
  requireReview(commit.parent !== commit.commit, 'parent', 'A commit is not its own parent');
  for (const file of commit.files) {
   reviewPath(file.path); if (file.previousPath) reviewPath(file.previousPath);
   for (const segment of file.segments) {
    requireReview(segment.before || segment.after, 'segments', 'At least one changed side is required');
    for (const side of [segment.before, segment.after]) if (side) requireReview(side[0] <= side[1], 'segments', 'Reversed range');
   }
   const key = JSON.stringify([commit.commit, commit.parent, file]);
   requireReview(!selected.has(key), 'reviewSet', 'Duplicate selected file entry'); selected.add(key);
  }
 }
 return packet;
}
export interface ReviewAttempt {
 header: { attempt: number; reviewer: ReviewerParty; status: ReviewStatus; createdAt: string; completedAt?: string; activeTaskId?: string; interrupted?: boolean; selectedTaskIds: readonly string[] };
 submitted: ReviewPacket;
 'review-response': { summary: string; tasks: readonly TaskReviewResult[]; crPath?: string; crPublication: 'pending' | 'complete'; error?: string };
}
export interface ReviewCheckpoint { schemaVersion: 1; reviewId: string; project: string; storyId: string; taskId?: string; attempts: readonly ReviewAttempt[]; }
export interface CompletedReviewSummary {
 reviewId: string; attempt: number; storyId: string; taskId?: string; reviewer: ReviewerParty; status: TaskReviewResult['status'];
 scope: Pick<ReviewPacket, 'storyId' | 'taskId' | 'documents' | 'reviewSet'>; tasks: readonly TaskReviewResult[]; summary: string; completedAt: string;
}
/** Publication is deliberately distinct from the legacy dimension-shaped version-1 CR. */
export interface TaskBasedCodeReviewRecord {
 meta: { workflow: 'code-review'; schemaVersion: 2 };
 body: { kind: 'code-review'; format: 'task-based'; storyId: string; status: TaskReviewResult['status']; reviews: readonly CompletedReviewSummary[] };
}
