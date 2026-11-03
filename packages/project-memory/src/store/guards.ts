import { MemoryError } from '../errors.js';
import type { Scope } from '../types.js';
import { decimal } from '../queue/codec.js';
import { physicalId, STORE_LIMITS, validateRow } from './codec.js';
import { admittedPayload, canonical, domainId, evidenceId, invalidPlan, requirePrepared, rowScope, scopeWithin, subjectKeyHash, validateSource } from './plan.js';
import type { PreparedPlan } from './plan.js';
import type { AffectedRevision, CurrentPayload, EmbeddingProfile, Lifecycle, MutationReason, RevisionPayload, RootPayload, StoreRow } from './types.js';

/** Read-only, writer-lane-owned view of a refreshed native version. Implementations
 * must distinguish duplicate/unavailable authority from verified absence. */
export interface GuardLookup {
  get(rowId: string): Promise<unknown | null>;
  tombstones(projectId: string, epoch: string): Promise<readonly unknown[]>;
}
export interface GuardedEffects {
  readonly generation: string; readonly affectedRevisions: readonly AffectedRevision[];
  readonly sourceIds: readonly string[]; readonly tombstoneIds: readonly string[];
}
export function revisionConflict(): never { throw new MemoryError('REVISION_CONFLICT', 'Memory commit precondition changed.'); }
function unavailable(): never { throw new MemoryError('STORE_UNAVAILABLE', 'Memory authority could not be verified.'); }
function overflow(): never { throw new MemoryError('CONTEXT_OVERFLOW', 'Memory dependency validation exceeds its bound.'); }
const terminal = (status: Lifecycle) => ['superseded', 'expired', 'deleted'].includes(status);
const editable = (status: Lifecycle) => !terminal(status);

/** Reason-specific constraints are additional to, never replacements for, this matrix. */
export function lifecycleAllowed(previous: Lifecycle | null, next: Lifecycle): boolean {
  if (previous === null) return next === 'candidate' || next === 'active';
  if (terminal(previous)) return false;
  return previous === 'candidate' || next !== 'candidate';
}
export function validateTransition(previous: CurrentPayload | null, next: CurrentPayload, revision: RevisionPayload, commandKind: string, now: number): void {
  if (!lifecycleAllowed(previous?.status ?? null, next.status)) revisionConflict();
  const reason = revision.mutationReason.code;
  const semantic = ['capture', 'correct', 'resolve'].includes(commandKind);
  if (!previous) {
    if (reason !== 'create' || !semantic || revision.predecessorRevisionId !== null || next.createdAt !== next.updatedAt) invalidPlan();
    return;
  }
  if (next.memoryId !== previous.memoryId || next.revisionId === previous.revisionId || next.createdAt !== previous.createdAt || next.updatedAt < previous.updatedAt || revision.predecessorRevisionId !== previous.revisionId || canonical(next.scope) !== canonical(previous.scope)) revisionConflict();
  switch (reason) {
    case 'create': invalidPlan();
    case 'evidence-added': {
      if (!semantic) invalidPlan();
      const stable = (p: CurrentPayload) => ({ ...p, revisionId: null, updatedAt: null, sourceIds: null, authority: { ...p.authority, sourceIds: null } });
      if (canonical(stable(next)) !== canonical(stable(previous)) || previous.sourceIds.some(id => !next.sourceIds.includes(id)) || previous.authority.sourceIds.some(id => !next.authority.sourceIds.includes(id))) invalidPlan();
      break;
    }
    case 'correct': if (commandKind !== 'correct' || !editable(next.status)) invalidPlan(); break;
    case 'conflict': if (!semantic || next.status !== 'conflicted') invalidPlan(); break;
    case 'resolve': if (commandKind !== 'resolve' || !['candidate', 'conflicted'].includes(previous.status) || next.status !== 'active') invalidPlan(); break;
    case 'supersede': if ((!semantic && commandKind !== 'maintenance') || next.status !== 'superseded') invalidPlan(); break;
    case 'expire': if (commandKind !== 'maintenance' || next.status !== 'expired' || previous.validUntil === null || now < previous.validUntil || next.validUntil !== previous.validUntil) invalidPlan(); break;
    case 'forget': if (commandKind !== 'forget' || next.status !== 'deleted') invalidPlan(); break;
    default: { const never: never = reason; return never; }
  }
  // Terminal states require their corresponding causal reason.
  const causes: Partial<Record<Lifecycle, MutationReason>> = { superseded: 'supersede', expired: 'expire', deleted: 'forget' };
  if (causes[next.status] && causes[next.status] !== reason) invalidPlan();
  if (['supersede', 'expire', 'forget'].includes(reason)) {
    const stable = (p: CurrentPayload) => ({ ...p, revisionId: null, updatedAt: null, status: null });
    if (canonical(stable(next)) !== canonical(stable(previous))) invalidPlan();
  }
}
export function tombstoneCovers(marker: Extract<StoreRow, { rowKind: 'tombstone' }>, scope: Scope, current: CurrentPayload): boolean {
  if (!scopeWithin(scope, rowScope(marker))) return false;
  const target = marker.payload.selector;
  switch (target.kind) {
    case 'memory': return target.memoryId === current.memoryId;
    case 'source': return current.sourceIds.includes(target.sourceId);
    case 'subject': return target.subjectKeyHash === subjectKeyHash(current.assertion.subject, current.assertion.category);
    // Broad source-lifecycle matching is added by task 8, using SourceIdentity.
    case 'session': case 'conversation': case 'project': return false;
  }
}
export async function guardEffects(prepared: PreparedPlan, root: RootPayload, profile: EmbeddingProfile, lookup: GuardLookup, now: number): Promise<GuardedEffects> {
  requirePrepared(prepared);
  const { plan, identityDigest } = prepared, frame = plan.frame;
  if (!Number.isSafeInteger(now) || now < 0) invalidPlan();
  if (!decimal(root.generation) || root.generation !== plan.expectedGeneration) revisionConflict();
  if (root.queueId !== null && root.queueId !== frame.queueId) unavailable();
  const generation = String(BigInt(root.generation) + 1n); if (!decimal(generation)) unavailable();
  const incoming = new Map(plan.rows.map(row => [row.rowId, row]));
  const cache = new Map<string, StoreRow | null>();
  let refs = 0, bytes = 0;
  const charge = (row: StoreRow) => { bytes += Buffer.byteLength(canonical(row)); if (bytes > STORE_LIMITS.maxBytes) overflow(); };
  const existing = async (id: string): Promise<StoreRow | null> => {
    if (cache.has(id)) return cache.get(id)!;
    if (++refs > STORE_LIMITS.maxReferences) overflow();
    const raw = await lookup.get(id);
    if (raw === null) { cache.set(id, null); return null; }
    let row: StoreRow;
    try { row = validateRow(raw, profile); } catch { unavailable(); }
    if (row.rowId !== id) unavailable(); charge(row); cache.set(id, row); return row;
  };
  const reference = async <K extends 'current' | 'revision' | 'source'>(kind: K, namespace: string, key: string): Promise<Extract<StoreRow, { rowKind: K }>> => {
    domainId(kind === 'current' ? 'memory' : kind, key);
    const id = physicalId(kind, namespace, key), row = incoming.get(id) ?? await existing(id);
    if (!row || row.rowKind !== kind || row.namespaceKey !== namespace || row.scopeEpoch !== plan.scopeEpoch) invalidPlan();
    return row as Extract<StoreRow, { rowKind: K }>;
  };
  const rawMarkers = await lookup.tombstones(plan.scope.projectId, plan.scopeEpoch);
  if (!Array.isArray(rawMarkers) || rawMarkers.length > STORE_LIMITS.maxReferences - refs) overflow();
  refs += rawMarkers.length;
  const markers: Extract<StoreRow, { rowKind: 'tombstone' }>[] = [], markerIds = new Set<string>();
  for (const raw of rawMarkers) {
    let row: StoreRow; try { row = validateRow(raw, profile); } catch { unavailable(); }
    if (row.rowKind !== 'tombstone' || row.projectId !== plan.scope.projectId || row.scopeEpoch !== plan.scopeEpoch || markerIds.has(row.rowId) || row.payload.queueId !== frame.queueId || BigInt(row.payload.invalidFromGeneration) > BigInt(root.generation)) unavailable();
    markerIds.add(row.rowId); charge(row); markers.push(row);
  }
  for (const id of plan.disposition.rejectedByTombstoneIds) if (!markers.some(row => row.payload.tombstoneId === id)) invalidPlan();
  const failed = plan.disposition.state === 'failed' || plan.disposition.state === 'quarantined';
  // Missing admitted metadata may be terminalized only as a no-effect failure.
  let admitted = null;
  try { admitted = admittedPayload(frame); }
  catch (error) {
    if (!failed || !(error instanceof MemoryError) || !['INVALID_REQUEST', 'UNSUPPORTED_VERSION'].includes(error.code) || plan.disposition.errorCode !== error.code) throw error;
  }
  if (!failed && frame.command.kind === 'delivery') throw new MemoryError('NOT_READY', 'Memory delivery storage is not implemented.');
  const currents = plan.rows.filter((row): row is Extract<StoreRow, { rowKind: 'current' }> => row.rowKind === 'current');
  const revisions = plan.rows.filter((row): row is Extract<StoreRow, { rowKind: 'revision' }> => row.rowKind === 'revision');
  if (currents.length !== revisions.length || Object.keys(plan.expectedRevisions).length !== currents.length) invalidPlan();
  const affected: AffectedRevision[] = [];
  const tombstones = plan.rows.filter((row): row is Extract<StoreRow, { rowKind: 'tombstone' }> => row.rowKind === 'tombstone');
  for (const row of plan.rows) {
    if (row.scopeEpoch !== plan.scopeEpoch || !scopeWithin(rowScope(row), plan.scope)) throw new MemoryError('POLICY_DENIED', 'Memory effect exceeds admitted scope.');
    // Strict logical-id kinds are checked even when a row has no dependencies.
    if (row.entityId !== null) domainId('memory', row.entityId);
    if (row.revisionId !== null) domainId('revision', row.revisionId);
    if (row.sourceId !== null) domainId('source', row.sourceId);
    if (row.rowKind === 'control' || row.rowKind === 'receipt') invalidPlan();
    const old = await existing(row.rowId);
    if (old && row.rowKind !== 'current' && canonical(old) !== canonical(row)) revisionConflict();
    switch (row.rowKind) {
      case 'source': {
        if (!admitted || row.generation !== null) invalidPlan();
        validateSource(row.payload, row.namespaceKey, frame, admitted);
        break;
      }
      case 'evidence': {
        const p = row.payload;
        if (row.generation !== null || p.createdByOperationId !== frame.operationId || p.evidenceId !== evidenceId(row.namespaceKey, p.revisionId, p.sourceId, p.relation)) invalidPlan();
        const revision = await reference('revision', row.namespaceKey, p.revisionId), source = await reference('source', row.namespaceKey, p.sourceId);
        if (!incoming.has(revision.rowId) || revision.payload.memoryId !== p.memoryId || !revision.payload.snapshot.sourceIds.includes(p.sourceId) || source.payload.contentHash !== p.sourceContentHash) invalidPlan();
        break;
      }
      case 'revision': {
        const p = row.payload;
        if (p.committedGeneration !== generation || canonical(p.sourceEvent) !== canonical({ operationId: frame.operationId, identityDigest, payloadHash: frame.payloadHash }) || canonical(p.processingVersion) !== canonical(plan.processingVersion)) invalidPlan();
        if (['capture', 'correct', 'resolve'].includes(frame.command.kind) && (p.processingVersion.normalizer === null || p.processingVersion.prompt === null)) invalidPlan();
        const current = await reference('current', row.namespaceKey, p.memoryId);
        if (!incoming.has(current.rowId) || canonical(current.payload) !== canonical(p.snapshot)) invalidPlan();
        break;
      }
      case 'tombstone': {
        const p = row.payload; domainId('tombstone', p.tombstoneId);
        if (p.selector.kind === 'memory') domainId('memory', p.selector.memoryId);
        if (p.selector.kind === 'source') domainId('source', p.selector.sourceId);
        if (frame.command.kind !== 'forget' || p.queueId !== frame.queueId || p.cutoffSequence !== frame.sequence || p.invalidFromGeneration !== generation || p.createdByOperationId !== frame.operationId || p.createdAt !== now) invalidPlan();
        const payload = frame.command.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalidPlan();
        const input = payload.input;
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'target') || canonical(input.target) !== canonical(p.selector)) invalidPlan();
        if (['session', 'conversation', 'project'].includes(p.selector.kind) && (plan.scope.sessionId !== undefined || plan.scope.branch !== undefined || plan.scope.environment !== undefined || canonical(rowScope(row)) !== canonical(plan.scope))) throw new MemoryError('POLICY_DENIED', 'Broad forgetting requires project authority.');
        break;
      }
      case 'current': break;
    }
  }
  for (const current of currents) {
    const p = current.payload, old = await existing(current.rowId);
    if (old && old.rowKind !== 'current') unavailable();
    if (old) {
      const previous = await reference('revision', current.namespaceKey, old.payload.revisionId);
      if (incoming.has(previous.rowId) || canonical(previous.payload.snapshot) !== canonical(old.payload)) unavailable();
    }
    if (!Object.hasOwn(plan.expectedRevisions, p.memoryId)) invalidPlan();
    const expected = plan.expectedRevisions[p.memoryId];
    if (expected !== (old?.payload.revisionId ?? null) || frame.command.expectedRevision !== undefined && frame.command.expectedRevision !== expected) revisionConflict();
    const revision = await reference('revision', current.namespaceKey, p.revisionId);
    if (!incoming.has(revision.rowId) || current.generation !== generation) invalidPlan();
    validateTransition(old?.payload ?? null, p, revision.payload, frame.command.kind, now);
    if (old && ['evidence-added', 'supersede', 'expire', 'forget'].includes(revision.payload.mutationReason.code) && canonical(current.embedding) !== canonical(old.embedding)) invalidPlan();
    if (p.updatedAt !== now || !p.sourceIds.length || !p.authority.sourceIds.length) invalidPlan();
    const evidence = plan.rows.filter(row => row.rowKind === 'evidence' && row.namespaceKey === current.namespaceKey && row.payload.revisionId === p.revisionId);
    const sources = new Set(evidence.map(row => row.sourceId!));
    if (sources.size !== p.sourceIds.length || p.sourceIds.some(id => !sources.has(id)) || p.authority.sourceIds.some(id => !sources.has(id))) invalidPlan();
    for (const id of p.authority.sourceIds) {
      const source = await reference('source', current.namespaceKey, id);
      if (source.payload.attribution.origin !== p.authority.origin || source.payload.attribution.policyVersion !== p.authority.policyVersion) throw new MemoryError('POLICY_DENIED', 'Memory authority does not match its sources.');
    }
    // Exact-target protection never permits a new material revision to reactivate it.
    if (markers.some(marker => tombstoneCovers(marker, rowScope(current), p))) revisionConflict();
    if (p.status === 'deleted' && !tombstones.some(marker => tombstoneCovers(marker, rowScope(current), p))) invalidPlan();
    if (p.status === 'superseded' && !currents.some(replacement => replacement.namespaceKey === current.namespaceKey && replacement.payload.supersedesMemoryId === p.memoryId && editable(replacement.payload.status))) invalidPlan();
    const seen = new Set<string>([p.memoryId]);
    let target = p.supersedesMemoryId;
    while (target !== null) {
      if (seen.has(target)) invalidPlan(); seen.add(target);
      if (seen.size > STORE_LIMITS.maxReferences) overflow();
      const parent = await reference('current', current.namespaceKey, target);
      if (target === p.supersedesMemoryId && parent.payload.status !== 'superseded') invalidPlan();
      target = parent.payload.supersedesMemoryId;
    }
    for (const related of p.relatedMemoryIds) { if (related === p.memoryId) invalidPlan(); await reference('current', current.namespaceKey, related); }
    affected.push(Object.freeze({ memoryId: p.memoryId, previousRevisionId: old?.payload.revisionId ?? null, revisionId: p.revisionId }));
  }
  const sorted = (kind: 'source' | 'tombstone') => Object.freeze(plan.rows.flatMap(row => row.rowKind === kind ? [row.rowKind === 'source' ? row.payload.sourceId : row.payload.tombstoneId] : []).sort());
  return Object.freeze({ generation, affectedRevisions: Object.freeze(affected.sort((a, b) => a.memoryId.localeCompare(b.memoryId))), sourceIds: sorted('source'), tombstoneIds: sorted('tombstone') });
}
