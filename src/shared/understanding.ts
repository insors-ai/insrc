import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { createHash } from 'node:crypto';

const str = Type.String({ minLength: 1, maxLength: 2048 });
const uuid = Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' });
const revision = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const oid = Type.String({ pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' });
const obj = <T extends Record<string, TSchema>>(properties: T) => Type.Object(properties, { additionalProperties: false });
const choices = <T extends string>(values: readonly T[]) => Type.Union(values.map(v => Type.Literal(v)));
export const ScopeSchema = obj({ repoId: str, worktreeId: str, baseOid: Type.Union([oid, Type.Null()]), stagedTreeOid: oid,
  commitMode: choices(['normal', 'amend', 'merge']), parentOids: Type.Array(oid, { maxItems: 64 }),
  learnerKey: str, policyRevision: str, evidenceRevision: str });
export type AssessmentScope = Static<typeof ScopeSchema>;
export const AssociationSchema = obj({ itemId: str, parentIds: Type.Array(str, { maxItems: 64 }),
  state: choices(['inferred', 'learner-proposed', 'verified', 'unresolved']), evidenceRefs: Type.Array(str, { maxItems: 256 }),
  confidence: choices(['supported', 'tentative', 'unknown']), explanation: Type.String({ maxLength: 16384 }) });
export const ViewSchema = obj({ id: uuid, revision, scope: ScopeSchema,
  state: choices(['preparing', 'ready', 'answering', 'guidance', 'evaluating', 'completed', 'canceled', 'stale', 'error']),
  associations: Type.Array(AssociationSchema, { maxItems: 256 }), completion: choices(['incomplete', 'complete']),
  outcome: choices(['unassessed', 'pending', 'pass', 'gaps', 'unverifiable']),
  eligibility: choices(['pending', 'allowed', 'override-required', 'stale', 'unavailable']) });
export type AssessmentView = Static<typeof ViewSchema>;
export const CommandSchema = obj({ requestId: uuid, assessmentId: uuid, expectedRevision: revision, scope: ScopeSchema });
export type CommandEnvelope = Static<typeof CommandSchema>;
export const OverrideSchema = obj({ reason: Type.String({ minLength: 1, maxLength: 16384 }), acknowledged: Type.Boolean() });
export type OverrideIntent = Static<typeof OverrideSchema>;
export const AttemptSchema = obj({ id: uuid, assessmentId: uuid, sequence: revision, questionId: str, conceptId: str,
  answer: Type.String({ maxLength: 65536 }), confidence: choices(['unsure', 'low', 'medium', 'high']), assisted: Type.Boolean(),
  guidanceRefs: Type.Array(str, { maxItems: 256 }), submittedAt: str });
export type AnswerAttempt = Static<typeof AttemptSchema>;
export const ReceiptSchema = obj({ id: uuid, assessmentId: uuid, scope: ScopeSchema, attemptId: uuid, revision,
  basis: choices(['trivial', 'optional', 'medium-complete', 'pass', 'override']), overrideRecordId: Type.Optional(uuid), expiresAt: str });
export type AuthorizationReceipt = Static<typeof ReceiptSchema>;
export const AuditSchema = obj({ id: uuid, assessmentId: uuid, revision, kind: str, occurredAt: str, scope: ScopeSchema });
export type AuditEntry = Static<typeof AuditSchema>;
export const JobSchema = obj({ id: uuid, kind: str, inputRevision: revision, generation: revision,
  status: choices(['running', 'interrupted', 'canceled', 'completed']) });
export const RecordSchema = obj({ assessmentSchemaVersion: Type.Literal(1), view: ViewSchema, ownerPrincipal: str,
  scopeFingerprint: str, lifecycleGeneration: revision, createdAt: str, updatedAt: str,
  job: Type.Optional(JobSchema), progressCursor: Type.Optional(str) });
export type AssessmentRecord = Static<typeof RecordSchema>;
export type ErrorCode = 'invalid-input' | 'not-found' | 'revision-conflict' | 'request-conflict' | 'scope-mismatch'
  | 'unavailable' | 'schema-unsupported' | 'storage-failure';
export class AssessmentError extends Error {
  constructor(readonly code: ErrorCode, readonly current?: AssessmentView) { super(code); }
}
export type AssessmentResult<T> = { protocolVersion: 1; ok: true; value: T; appliedRevision?: number }
  | { protocolVersion: 1; ok: false; error: { code: ErrorCode; retryable: boolean; message: string }; current?: AssessmentView };
export type AssessmentEvent = { protocolVersion: 1; type: 'snapshot'; assessmentId: string; revision: number; view: AssessmentView }
  | { protocolVersion: 1; type: 'deleted' | 'unavailable'; assessmentId: string };
export interface AssessmentService {
  prepare(scope: AssessmentScope): Promise<AssessmentView>;
  resume(id: string): Promise<AssessmentView>;
  cancel(command: CommandEnvelope): Promise<AssessmentView>;
  requestOverride(command: CommandEnvelope, intent: OverrideIntent): Promise<AssessmentView>;
}
export function parse<T extends TSchema>(schema: T, input: unknown): Static<T> {
  if (!Value.Check(schema, input)) throw new AssessmentError('invalid-input');
  return structuredClone(input) as Static<T>;
}
export function parseScope(input: unknown): AssessmentScope {
  const s = parse(ScopeSchema, input);
  if ([s.baseOid, ...s.parentOids].some(v => v !== null && v.length !== s.stagedTreeOid.length)
    || (s.baseOid === null && (s.commitMode !== 'normal' || s.parentOids.length !== 0))) throw new AssessmentError('invalid-input');
  return s;
}
export function scopeFingerprint(input: AssessmentScope): string {
  const s = parseScope(input);
  return createHash('sha256').update(JSON.stringify(['assessment-scope-v1', s.repoId, s.worktreeId, s.baseOid,
    s.stagedTreeOid, s.commitMode, s.parentOids, s.learnerKey, s.policyRevision, s.evidenceRevision])).digest('hex');
}
export function parseRecord(input: unknown): AssessmentRecord {
  try {
    const r = parse(RecordSchema, input);
    if (r.scopeFingerprint !== scopeFingerprint(r.view.scope)) throw new Error('scope');
    return r;
  } catch { throw new AssessmentError('schema-unsupported'); }
}
export function publicView(record: AssessmentRecord): AssessmentView {
  const v = record.view;
  return parse(ViewSchema, { id: v.id, revision: v.revision, scope: v.scope, state: v.state,
    associations: v.associations, completion: v.completion, outcome: v.outcome, eligibility: v.eligibility });
}
export const PrepareSchema = obj({ requestId: uuid, repoPath: str, worktreePath: str });
export const ReadSchema = obj({ assessmentId: uuid });
export const WatchSchema = obj({ assessmentId: uuid, afterRevision: Type.Optional(revision) });
export const DeleteSchema = obj({ ...CommandSchema.properties, confirmed: Type.Literal(true) });
export const PageSchema = obj({ assessmentId: uuid, after: Type.Optional(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) });
export const ListSchema = obj({ repoPath: str, after: Type.Optional(uuid), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) });
export class DomainSchemas {
  private readonly schemas = new Map<string, TSchema>();
  register(kind: string, schema: TSchema): void {
    if (!kind || this.schemas.has(kind)) throw new AssessmentError('invalid-input');
    this.schemas.set(kind, schema);
  }
  validate(kind: string, payload: unknown): unknown {
    const schema = this.schemas.get(kind);
    if (!schema) throw new AssessmentError('unavailable');
    return parse(schema, payload);
  }
}
