import { randomUUID, createHash } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import { getGraphStore, getGraphStorePath, withWriteTxn } from '../db/graph/store.js';
import type { GraphStore } from '../db/graph/store.js';
import { prefixSuccessor } from '../db/graph/keys.js';
import { AssessmentError, AttemptSchema, AuditSchema, CommandSchema, DeleteSchema, LearnerSchema, DomainSchemas,
  parse, parseRecord, parseScope, publicView, scopeFingerprint } from '../shared/understanding.js';
import type { AssessmentRecord, AssessmentView, AssessmentScope, AnswerAttempt, CommandEnvelope } from '../shared/understanding.js';
import type { ResolvedLearner } from './identity.js';
import { readAssessment, writeAssessment, tupleKey } from './storage.js';
import { enforcePrivatePaths } from './privacy.js';
import { initializeAssessmentStorage, listAssessments } from './storage.js';
import { assertAssessmentSchema } from './storage.js';

export type Owner = Pick<ResolvedLearner, 'ownerPrincipal' | 'learner'>;
export interface MutationResult { view: AssessmentView; appliedRevision: number }
export interface Transition {
  state?: AssessmentView['state'];
  associations?: AssessmentView['associations'];
  attempt?: AnswerAttempt;
  job?: NonNullable<AssessmentRecord['job']>;
  progressCursor?: string;
}
type TransitionHandler = (record: Readonly<AssessmentRecord>, payload: unknown) => Transition;
const DedupSchema = Type.Object({ hash: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  appliedRevision: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }) }, { additionalProperties: false });

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new AssessmentError('invalid-input');
  return encoded;
}
function requestHash(kind: string, payload: unknown): string {
  return createHash('sha256').update(canonical([kind, payload])).digest('hex');
}
export function owned(store: GraphStore, id: string, owner: Owner): AssessmentRecord {
  const record = readAssessment(store, id);
  if (!record || record.ownerPrincipal !== owner.ownerPrincipal || record.learner.key !== owner.learner.key) {
    throw new AssessmentError('not-found');
  }
  return record;
}
function audit(store: GraphStore, r: AssessmentRecord, kind: string): void {
  const key = tupleKey(r.view.id, String(r.view.revision).padStart(16, '0'), '0');
  if (store.understandingAudit.doesExist(key)) throw new AssessmentError('storage-failure');
  store.understandingAudit.putSync(key, parse(AuditSchema, { id: randomUUID(), assessmentId: r.view.id,
    revision: r.view.revision, kind, occurredAt: r.updatedAt, scope: r.view.scope }));
}

export class UnderstandingService {
  private readonly schemas = new DomainSchemas();
  private readonly transitions = new Map<string, TransitionHandler>();
  private constructor() {}
  static async open(socketPath: string): Promise<UnderstandingService> {
    await getGraphStore();
    enforcePrivatePaths(getGraphStorePath(), socketPath);
    await initializeAssessmentStorage();
    const service = new UnderstandingService();
    await service.recover();
    return service;
  }
  async list(owner: Owner, limit = 50, after?: string): Promise<AssessmentView[]> {
    return (await listAssessments(owner.ownerPrincipal, limit, after))
      .filter(r => r.learner.key === owner.learner.key).map(publicView);
  }
  private readonly listeners = new Map<string, Set<(deleted: boolean) => void>>();

  async subscribe(owner: Owner, id: string, listener: (deleted: boolean) => void): Promise<() => void> {
    owned(await getGraphStore(), id, owner);
    const listeners = this.listeners.get(id) ?? new Set();
    listeners.add(listener);
    this.listeners.set(id, listeners);
    return () => { listeners.delete(listener); if (listeners.size === 0) this.listeners.delete(id); };
  }

  private publish(id: string, deleted = false): void {
    for (const listener of this.listeners.get(id) ?? []) {
      try { listener(deleted); } catch { /* Observation cannot undo a committed write. */ }
    }
    if (deleted) this.listeners.delete(id);
  }

  async recover(): Promise<void> {
    await withWriteTxn(store => {
      assertAssessmentSchema(store);
      for (const { value } of store.understandingCurrent.getRange()) {
        const r = parseRecord(value);
        const prefix = tupleKey(r.view.id);
        let changed = r.job?.status === 'running' || r.view.eligibility !== 'unavailable';
        for (const { key } of store.understandingReceipt.getRange({ start: prefix, end: prefixSuccessor(prefix) })) {
          store.understandingReceipt.removeSync(key);
          changed = true;
        }
        if (!changed) continue;
        if (r.job?.status === 'running') { r.job.status = 'interrupted'; r.view.state = 'error'; }
        r.lifecycleGeneration++;
        r.view.revision++;
        r.view.eligibility = 'unavailable';
        r.updatedAt = new Date().toISOString();
        writeAssessment(store, r);
        audit(store, r, 'recovered');
      }
    });
  }

  async delete(owner: Owner, input: CommandEnvelope & { confirmed: true }): Promise<void> {
    const command = parse(DeleteSchema, input);
    await withWriteTxn(store => {
      const r = owned(store, command.assessmentId, owner);
      if (r.scopeFingerprint !== scopeFingerprint(command.scope)) throw new AssessmentError('scope-mismatch');
      if (r.view.revision !== command.expectedRevision) throw new AssessmentError('revision-conflict', publicView(r));
      const prefix = tupleKey(r.view.id);
      for (const name of ['understandingAttempt', 'understandingAudit', 'understandingRequest', 'understandingReceipt'] as const) {
        for (const { key } of store[name].getRange({ start: prefix, end: prefixSuccessor(prefix) })) store[name].removeSync(key);
      }
      store.understandingOwnerIndex.removeSync(tupleKey(r.ownerPrincipal, r.view.id));
      store.understandingScopeIndex.removeSync(tupleKey(r.scopeFingerprint, r.view.id));
      store.understandingRequest.removeSync(tupleKey('prepare', r.ownerPrincipal, r.learner.key, r.preparationRequestId));
      store.understandingCurrent.removeSync(prefix);
    });
    this.publish(command.assessmentId, true);
  }

  register(kind: string, schema: TSchema, handler: TransitionHandler): void {
    if (kind === 'cancel' || kind === 'prepare') throw new AssessmentError('invalid-input');
    this.schemas.register(kind, schema);
    this.transitions.set(kind, handler);
  }

  // Internal trusted preparation; the RPC layer must obtain authoritative scope from s2/s6.
  async prepare(owner: Owner, input: AssessmentScope, requestId: string): Promise<MutationResult> {
    const scope = parseScope(input);
    const learner = parse(LearnerSchema, owner.learner);
    if (scope.learnerKey !== learner.key) throw new AssessmentError('scope-mismatch');
    const command = parse(CommandSchema, { requestId, assessmentId: requestId, expectedRevision: 1, scope });
    const hash = requestHash('prepare', { scope, learner });
    const result = await withWriteTxn(store => {
      const prepareKey = tupleKey('prepare', owner.ownerPrincipal, learner.key, requestId);
      const previousId: unknown = store.understandingRequest.get(prepareKey);
      if (previousId !== undefined && typeof previousId !== 'string') throw new AssessmentError('schema-unsupported');
      const previous = previousId === undefined ? undefined : readAssessment(store, previousId as string);
      if (previousId !== undefined && !previous) throw new AssessmentError('schema-unsupported');
      if (previous) {
        const r = owned(store, previous!.view.id, owner);
        const cached = parse(DedupSchema, store.understandingRequest.get(tupleKey(r.view.id, command.requestId)));
        if (cached.hash !== hash) throw new AssessmentError('request-conflict');
        return { view: publicView(r), appliedRevision: cached.appliedRevision };
      }
      const now = new Date().toISOString();
      const r = parseRecord({ assessmentSchemaVersion: 1, ownerPrincipal: owner.ownerPrincipal, learner, preparationRequestId: requestId,
        scopeFingerprint: scopeFingerprint(scope), lifecycleGeneration: 1, createdAt: now, updatedAt: now,
        view: { id: randomUUID(), revision: 1, scope, state: 'preparing', associations: [], completion: 'incomplete',
          outcome: 'unassessed', eligibility: 'unavailable' } });
      writeAssessment(store, r);
      audit(store, r, 'prepare');
      store.understandingRequest.putSync(prepareKey, r.view.id);
      store.understandingRequest.putSync(tupleKey(r.view.id, command.requestId), { hash, appliedRevision: 1 });
      return { view: publicView(r), appliedRevision: 1 };
    });
    this.publish(result.view.id);
    return result;
  }

  async resume(owner: Owner, id: string): Promise<AssessmentView> {
    return publicView(owned(await getGraphStore(), id, owner));
  }

  async cancel(owner: Owner, command: CommandEnvelope): Promise<MutationResult> {
    return this.mutate(owner, command, 'cancel', null);
  }

  async mutate(owner: Owner, input: CommandEnvelope, kind: string, rawPayload: unknown,
    expectedJob?: { id: string; generation: number; inputRevision: number }): Promise<MutationResult> {
    const command = parse(CommandSchema, input);
    const payload = kind === 'cancel' ? parse(Type.Null(), rawPayload) : this.schemas.validate(kind, rawPayload);
    const hash = requestHash(kind, { command, payload });
    const result = await withWriteTxn(store => {
      const current = owned(store, command.assessmentId, owner);
      if (expectedJob && (!current.job || current.job.status !== 'running' || current.job.id !== expectedJob.id
        || current.lifecycleGeneration !== expectedJob.generation || current.job.generation !== expectedJob.generation
        || current.job.inputRevision !== expectedJob.inputRevision)) throw new AssessmentError('unavailable');
      if (scopeFingerprint(command.scope) !== current.scopeFingerprint) throw new AssessmentError('scope-mismatch');
      const key = tupleKey(current.view.id, command.requestId);
      const cached: unknown = store.understandingRequest.get(key);
      if (cached !== undefined) {
        const receipt = parse(DedupSchema, cached);
        if (receipt.hash !== hash) throw new AssessmentError('request-conflict');
        return { view: publicView(current), appliedRevision: receipt.appliedRevision };
      }
      if (current.view.revision !== command.expectedRevision) throw new AssessmentError('revision-conflict', publicView(current));
      if (kind !== 'cancel' && ['canceled', 'stale', 'completed', 'error'].includes(current.view.state)) throw new AssessmentError('unavailable');
      const transition = kind === 'cancel' ? { state: 'canceled' as const } : this.transitions.get(kind)?.(structuredClone(current), payload);
      if (!transition) throw new AssessmentError('unavailable');
      const next = structuredClone(current);
      next.view.revision++;
      next.updatedAt = new Date().toISOString();
      if (transition.state) next.view.state = transition.state;
      if (transition.associations) next.view.associations = transition.associations;
      if (transition.job) next.job = transition.job;
      if (transition.progressCursor !== undefined) next.progressCursor = transition.progressCursor;
      if (kind === 'cancel') {
        next.lifecycleGeneration++;
        if (next.job) next.job.status = 'canceled';
      }
      next.view.eligibility = 'unavailable';
      if (transition.attempt) {
        const attempt = parse(AttemptSchema, transition.attempt);
        if (attempt.assessmentId !== next.view.id) throw new AssessmentError('invalid-input');
        const attemptKey = tupleKey(next.view.id, String(attempt.sequence).padStart(16, '0'));
        if (store.understandingAttempt.doesExist(attemptKey)) throw new AssessmentError('request-conflict');
        store.understandingAttempt.putSync(attemptKey, attempt);
      }
      writeAssessment(store, next);
      audit(store, next, kind);
      store.understandingRequest.putSync(key, { hash, appliedRevision: next.view.revision });
      return { view: publicView(next), appliedRevision: next.view.revision };
    });
    this.publish(result.view.id);
    return result;
  }

  async history(owner: Owner, id: string, limit = 50, after = 0): Promise<AnswerAttempt[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(after) || after < 0) throw new AssessmentError('invalid-input');
    const store = await getGraphStore();
    owned(store, id, owner);
    const prefix = tupleKey(id);
    const start = tupleKey(id, String(after).padStart(16, '0'));
    const result: AnswerAttempt[] = [];
    for (const { value } of store.understandingAttempt.getRange({ start, end: prefixSuccessor(prefix), limit: limit + 1 })) {
      const attempt = parse(AttemptSchema, value);
      if (attempt.assessmentId !== id) throw new AssessmentError('schema-unsupported');
      if (attempt.sequence <= after) continue;
      result.push(attempt);
      if (result.length === limit) break;
    }
    return result;
  }

  async requestOverride(owner: Owner, command: CommandEnvelope): Promise<never> {
    await this.resume(owner, command.assessmentId);
    throw new AssessmentError('unavailable');
  }
}
