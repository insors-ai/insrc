/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { digestValue } from '../workflow/code-review/investigation/identity.js';

export type ReviewModelProtocol = 'bound-v1' | 'compact-v1';
const obj = <T extends Record<string, TSchema>>(properties: T) => Type.Object(properties, { additionalProperties: false });
const text = Type.String({ minLength: 1, maxLength: 4096 });
const refs = Type.Array(text, { maxItems: 10000, uniqueItems: true });
const range = { start: Type.Integer({ minimum: 1 }), end: Type.Integer({ minimum: 1 }) };
export const CompactReadSchema = obj({ target: Type.Union([
 obj({ kind: Type.Literal('change'), blockId: text, side: Type.Union([Type.Literal('before'), Type.Literal('after')]), start: Type.Optional(range.start), end: Type.Optional(range.end) }),
 obj({ kind: Type.Literal('context'), path: text, ...range }),
 obj({ kind: Type.Literal('artifact'), artifactId: text, ...range }),
 obj({ kind: Type.Literal('test'), taskId: text })
]) });
export const CompactProgressSchema = obj({
 blockId: text, disposition: Type.Union([Type.Literal('reviewed'), Type.Literal('needs-followup'), Type.Literal('unverified')]),
 evidence: refs, notes: Type.String({ minLength: 1, maxLength: 16000 }), unresolved: refs,
 assessments: Type.Array(obj({ expectation: text,
  disposition: Type.Union([Type.Literal('satisfied'), Type.Literal('finding'), Type.Literal('unverified'), Type.Literal('not-applicable')]),
  evidence: refs, findings: Type.Array(Type.Integer({ minimum: 0, maximum: 9999 }), { uniqueItems: true, maxItems: 10000 }),
  rationale: Type.String({ minLength: 1, maxLength: 16000 }) }), { maxItems: 10000 }),
 findings: Type.Array(obj({ criterion: Type.String({ minLength: 1, maxLength: 4096, description: 'Use a criterion value displayed in the host expectation view.' }), severity: Type.Union([Type.Literal('HIGH'), Type.Literal('MED'), Type.Literal('LOW')]),
  confidence: Type.Union([Type.Literal('breach'), Type.Literal('observation')]), evidence: refs, expectations: refs,
  message: Type.String({ minLength: 1, maxLength: 16000 }) }), { maxItems: 10000 })
});
export const CompactReplySchema = obj({ action: Type.Union([Type.Literal('finish'), Type.Literal('yield')]), reason: text });
export const CompactFinalAckSchema = obj({ acknowledged: Type.Literal(true) });
const common = { protocol: Type.Literal('compact-v1'), version: Type.Literal(1), engine: Type.Literal('plan-investigation-v1'),
 bindingId: text, repo: text, runId: text, subjectDigest: text, generation: Type.Integer({ minimum: 0 }), attemptId: text, requestDigest: text };
export const CompactCommandSchema = Type.Union([
 obj({ ...common, operation: Type.Literal('read'), ...CompactReadSchema.properties }),
 obj({ ...common, operation: Type.Literal('progress'), progress: CompactProgressSchema }),
 obj({ ...common, operation: Type.Literal('reply'), reply: CompactReplySchema }),
 obj({ ...common, operation: Type.Literal('impact'), entityRef: text })
]);
export type CompactRead = Static<typeof CompactReadSchema>['target'];
export type CompactProgress = Static<typeof CompactProgressSchema>;
export type CompactCommand = Static<typeof CompactCommandSchema>;
export interface ReviewToolError { code: string; message: string; hint: string; referenceDigest?: string; retryable: boolean; }
export class CompactReviewError extends Error {
 constructor(readonly detail: ReviewToolError) { super(detail.message); this.name = 'CompactReviewError'; }
}
/** Error text is host-authored. Never expose a caught exception, source or capability. */
export function compactToolError(cause: unknown, reference?: unknown): ReviewToolError {
 const detail = cause instanceof CompactReviewError ? cause.detail : {
  code: 'operation-refused', message: 'Scoped review operation refused.',
  hint: 'Check the target, evidence and expectation aliases in the latest view. If ownership or source changed, yield and resume through the host.', retryable: false
 };
 return { ...detail, ...(reference === undefined ? {} : { referenceDigest: digestValue(reference) }) };
}
export function parseCompactCommand(value: unknown): CompactCommand {
 let encoded: string;
 try { encoded = JSON.stringify(value) ?? ''; } catch { encoded = ''; }
 if (!encoded || Buffer.byteLength(encoded) > 1024 * 1024 || !Value.Check(CompactCommandSchema, value)) {
  throw new CompactReviewError({ code: 'invalid-request', message: 'Invalid compact review request.', hint: 'Use the pinned compact-v1 tool schema; do not include binding, sequence or receipt fields.', retryable: true });
 }
 return Value.Clone(value);
}
