import { isAbsolute } from 'node:path';
import { MemoryError } from '../errors.js';
import type { MemoryLimits, MemoryView, ProjectBinding, Scope } from '../types.js';
import { boundedString, digest, IngressBudget, snapshotJson, validateScope } from '../queue/codec.js';
import type { Reservation } from '../queue/codec.js';
import { shape } from '../queue/shape.js';
import { logicalId, namespaceKey, physicalId, ROOT_ROW_ID, STORE_LIMITS } from './codec.js';
import { broadSelector, sourceLifecycleMatches } from './barriers.js';
import { tombstoneCovers } from './guards.js';
import { embeddingQuery } from './embedding-profile.js';
import { canonical, evidenceId, rowScope, scopeWithin } from './plan.js';
import type { CommittedSnapshot, CurrentProjection, EmbeddingProfile, RootPayload, StoreRow } from './types.js';

export interface PinnedReader {
  get(rowId: string, reservation: Reservation, maxBytes: number): Promise<StoreRow | null>;
  currentKeys(namespaces: readonly string[], at: number, limit: number): Promise<readonly string[]>;
  protectionKeys(namespaces: readonly string[], limit: number): Promise<readonly string[]>;
  evidenceKeys(namespace: string, revisionId: string, limit: number): Promise<readonly string[]>;
  receiptKey(operationId: string): Promise<string | null>;
  nextStart(namespaces: readonly string[], after: number): Promise<number | null>;
  close(): Promise<void>;
}
export interface ReadAccess {
  accepting(): boolean;
  binding(scope: Scope): Promise<unknown>;
  capture(): Promise<{ version: number; root: RootPayload; reader: PinnedReader }>;
  head(): Promise<{ version: number; root: RootPayload }>;
  readonly point?: ((point: 'before-final') => Promise<void>) | undefined;
}
export interface ReadHooks { readonly now?: (() => number) | undefined; readonly monotonic?: (() => number) | undefined; readonly leaseMs?: number | undefined; }
interface Lease {
  readonly scope: Scope; readonly binding: ProjectBinding; readonly snapshot: CommittedSnapshot;
  readonly reader: PinnedReader; readonly expires: number; timer: ReturnType<typeof setTimeout> | undefined;
  active: boolean; expired: boolean; closed: boolean; closing: Promise<void> | undefined;
}
function notReady(): never { throw new MemoryError('NOT_READY', 'Memory read admission is unavailable.'); }
function unavailable(): never { throw new MemoryError('STORE_UNAVAILABLE', 'Memory read authority could not be verified.'); }
function conflict(): never { throw new MemoryError('REVISION_CONFLICT', 'Memory read binding, generation or eligibility changed.'); }
function overflow(): never { throw new MemoryError('CONTEXT_OVERFLOW', 'Memory read exceeds its complete validation bound.'); }
function expired(): never { throw new MemoryError('DEADLINE_EXCEEDED', 'Memory read lease expired.'); }
function scopeCopy(input: unknown): Scope { const copy = snapshotJson(input, 16_384).value; validateScope(copy); return copy; }
export function visibleNamespaces(scope: Scope, epoch: string): readonly string[] {
  validateScope(scope); const keys = (['sessionId', 'branch', 'environment'] as const).filter(key => scope[key] !== undefined);
  const result: string[] = [];
  for (let mask = 0; mask < 1 << keys.length; mask++) {
    const candidate: { projectId: string; sessionId?: string; branch?: string; environment?: string } = { projectId: scope.projectId };
    for (let i = 0; i < keys.length; i++) if (mask & 1 << i) { const key = keys[i]!; candidate[key] = scope[key]!; }
    result.push(namespaceKey(candidate, epoch));
  }
  return Object.freeze(result.sort());
}
export class ReadLeases {
  readonly #access: ReadAccess;
  readonly #profile: EmbeddingProfile;
  readonly #hooks: ReadHooks;
  readonly #budget: IngressBudget;
  readonly #registered = new WeakMap<object, Lease>();
  readonly #live = new Set<Lease>();
  readonly #activity = new Set<Promise<unknown>>();
  #slots = 0;
  #stopped = false;
  constructor(access: ReadAccess, profile: EmbeddingProfile, limits: MemoryLimits, hooks: ReadHooks = {}) {
    if (hooks.leaseMs !== undefined && (!Number.isSafeInteger(hooks.leaseMs) || hooks.leaseMs < 1 || hooks.leaseMs > STORE_LIMITS.leaseMs)) throw new MemoryError('INVALID_REQUEST', 'Invalid private read lease duration.');
    this.#access = access; this.#profile = profile; this.#hooks = Object.freeze({ ...hooks }); this.#budget = new IngressBudget(limits, STORE_LIMITS.maxBytes);
  }
  #now(): number { const now = this.#hooks.now?.() ?? Date.now(); if (!Number.isSafeInteger(now) || now < 0) unavailable(); return now; }
  #elapsed(): number { const now = this.#hooks.monotonic?.() ?? performance.now(); if (!Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - STORE_LIMITS.leaseMs) unavailable(); return now; }
  #admission(): void { if (this.#stopped || !this.#access.accepting()) notReady(); }
  #track<T>(work: Promise<T>): Promise<T> {
    const tracked = work.finally(() => this.#activity.delete(tracked)); this.#activity.add(tracked); return tracked;
  }
  async #binding(scope: Scope): Promise<ProjectBinding> {
    try {
      const value = snapshotJson(await this.#access.binding(scope), 65_536).value;
      shape(unavailable, value, ['projectId', 'root', 'scopeEpoch']);
      if (value.projectId !== scope.projectId || !boundedString(value.scopeEpoch, 256) || typeof value.root !== 'string' || !isAbsolute(value.root) || value.root.includes('\0')) unavailable();
      return value as unknown as ProjectBinding;
    } catch (error) { if (error instanceof MemoryError && error.code === 'NOT_READY') notReady(); unavailable(); }
  }
  snapshot(input: Scope): Promise<CommittedSnapshot> {
    let scope: Scope;
    try {
      this.#admission(); scope = scopeCopy(input);
      if (this.#slots >= STORE_LIMITS.maxLeases) throw new MemoryError('BACKPRESSURE', 'Memory read lease capacity is exhausted.');
      this.#slots++;
    } catch (error) { return Promise.reject(error instanceof MemoryError ? error : new MemoryError('INVALID_REQUEST', 'Invalid memory read scope.')); }
    return this.#track((async () => {
      let lease: Lease | undefined, reader: PinnedReader | undefined;
      try {
        const binding = await this.#binding(scope); this.#admission();
        const captured = await this.#access.capture(); reader = captured.reader;
        const snapshot = Object.freeze({ version: captured.version, generation: captured.root.generation, scopeDigest: digest(canonical(scope)), scopeEpoch: binding.scopeEpoch, eligibleAt: this.#now() });
        const duration = this.#hooks.leaseMs ?? STORE_LIMITS.leaseMs;
        lease = { scope, binding, snapshot, reader, expires: this.#elapsed() + duration, timer: undefined, active: false, expired: false, closed: false, closing: undefined };
        this.#registered.set(snapshot, lease); this.#live.add(lease);
        const owned = lease;
        lease.timer = setTimeout(() => { owned.expired = true; if (!owned.active) void this.#release(owned).catch(() => {}); }, duration);
        lease.timer.unref();
        if (canonical(await this.#binding(scope)) !== canonical(binding)) conflict();
        this.#admission(); return snapshot;
      } catch (error) {
        if (lease) await this.#release(lease);
        else { if (reader) await reader.close(); this.#slots--; }
        if (error instanceof MemoryError) throw error;
        unavailable();
      }
    })());
  }
  async #release(lease: Lease): Promise<void> {
    lease.closing ??= (async () => {
      clearTimeout(lease.timer); lease.timer = undefined;
      await lease.reader.close(); lease.closed = true; this.#live.delete(lease); this.#slots--;
    })();
    return lease.closing;
  }
  release(snapshot: CommittedSnapshot): Promise<void> {
    const lease = this.#registered.get(snapshot); if (!lease) return Promise.reject(new MemoryError('INVALID_REQUEST', 'Unknown memory read lease.'));
    if (lease.active) return Promise.reject(new MemoryError('NOT_READY', 'Memory read is still active.'));
    return this.#release(lease);
  }
  prepareQuery(input: unknown, snapshot: CommittedSnapshot, maxBytes: number) {
    const lease = this.#registered.get(snapshot); if (!lease) throw new MemoryError('INVALID_REQUEST', 'Unknown memory read lease.');
    this.#check(lease); return embeddingQuery(input, this.#profile, maxBytes);
  }
  #check(lease: Lease): void {
    if (lease.expired || this.#elapsed() >= lease.expires) { lease.expired = true; expired(); }
    this.#admission(); if (lease.closed) notReady();
  }
  current(scope: Scope, snapshot: CommittedSnapshot): Promise<CurrentProjection> {
    let lease: Lease;
    try {
      const value = this.#registered.get(snapshot); if (!value || canonical(scopeCopy(scope)) !== canonical(value.scope)) throw new MemoryError('INVALID_REQUEST', 'Unknown or mismatched memory read lease.');
      lease = value; this.#check(lease); if (lease.active) notReady(); lease.active = true;
    } catch (error) { return Promise.reject(error instanceof MemoryError ? error : new MemoryError('INVALID_REQUEST', 'Invalid memory read scope.')); }
    return this.#track((async () => {
      let reservation: Reservation | undefined;
      try {
        reservation = this.#budget.reserve();
        if (canonical(await this.#binding(lease.scope)) !== canonical(lease.binding)) conflict();
        const projection = await this.#projection(lease, reservation);
        await this.#access.point?.('before-final'); this.#check(lease);
        // Double collection gives an overlap where the unique host binding and
        // monotone store generation agree, without invoking host callbacks while
        // the writer lane is held. Epochs are never reused by the trusted host.
        const binding = await this.#binding(lease.scope), head = await this.#access.head();
        const rebound = await this.#binding(lease.scope), confirmed = await this.#access.head(); this.#check(lease);
        if (canonical(binding) !== canonical(lease.binding) || canonical(rebound) !== canonical(lease.binding) || head.version !== snapshot.version || head.root.generation !== snapshot.generation || confirmed.version !== snapshot.version || confirmed.root.generation !== snapshot.generation) conflict();
        if (projection.nextValidityBoundary !== null && this.#now() >= projection.nextValidityBoundary) conflict();
        return projection;
      } catch (error) {
        if (error instanceof MemoryError && error.code === 'BACKPRESSURE') overflow();
        if (error instanceof MemoryError) throw error;
        unavailable();
      } finally { reservation?.release(); lease.active = false; await this.#release(lease); }
    })());
  }
  async #projection(lease: Lease, reservation: Reservation): Promise<CurrentProjection> {
    const now = this.#now(), namespaces = visibleNamespaces(lease.scope, lease.binding.scopeEpoch), cache = new Map<string, StoreRow>();
    let references = 0;
    const get = async (id: string, dependency = true): Promise<StoreRow> => {
      this.#check(lease); if (cache.has(id)) return cache.get(id)!;
      if (dependency && ++references > STORE_LIMITS.maxReferences) overflow();
      const row = await lease.reader.get(id, reservation, STORE_LIMITS.maxBytes - this.#budget.bytes);
      this.#check(lease); if (row === null) unavailable(); cache.set(id, row); return row;
    };
    const root = await get(ROOT_ROW_ID);
    if (root.rowKind !== 'control' || root.payload.kind !== 'root' || root.payload.generation !== lease.snapshot.generation) unavailable();
    const protectionKeys = await lease.reader.protectionKeys(namespaces, STORE_LIMITS.maxReferences + 1);
    if (protectionKeys.length > STORE_LIMITS.maxReferences) overflow();
    const protections: Extract<StoreRow, { rowKind: 'tombstone' }>[] = [];
    for (const key of protectionKeys) {
      const row = await get(key);
      if (row.rowKind !== 'tombstone' || row.scopeEpoch !== lease.binding.scopeEpoch || !scopeWithin(lease.scope, rowScope(row)) || row.payload.queueId !== root.payload.queueId || BigInt(row.payload.invalidFromGeneration) > BigInt(lease.snapshot.generation)) unavailable();
      if (broadSelector(row.payload.selector) && (row.sessionId !== null || row.branch !== null || row.environment !== null)) unavailable();
      protections.push(row);
    }
    const keys = await lease.reader.currentKeys(namespaces, now, STORE_LIMITS.maxRows + 1);
    if (keys.length > STORE_LIMITS.maxRows || new Set(keys).size !== keys.length) overflow();
    let boundary = await lease.reader.nextStart(namespaces, now);
    const note = (value: number | null) => { if (value !== null && value > now) boundary = boundary === null ? value : Math.min(boundary, value); };
    const valid = (row: { validFrom: number | null; validUntil: number | null }) => { note(row.validFrom); note(row.validUntil); return (row.validFrom === null || row.validFrom <= now) && (row.validUntil === null || now < row.validUntil); };
    const views: { view: MemoryView; rowId: string }[] = [];
    const receiptKeys = new Map<string, string>();
    const receipt = async (operationId: string) => {
      let key = receiptKeys.get(operationId);
      if (key === undefined) { key = await lease.reader.receiptKey(operationId) ?? undefined; if (key === undefined) unavailable(); receiptKeys.set(operationId, key); }
      const row = await get(key);
      if (row.rowKind !== 'receipt' || row.payload.operationId !== operationId || row.payload.scopeEpoch !== lease.binding.scopeEpoch || BigInt(row.payload.generation) > BigInt(lease.snapshot.generation)) unavailable();
      return row.payload;
    };
    for (const key of keys) {
      const current = await get(key, false);
      if (current.rowKind !== 'current' || current.scopeEpoch !== lease.binding.scopeEpoch || !namespaces.includes(current.namespaceKey) || !scopeWithin(lease.scope, current.payload.scope)) unavailable();
      const p = current.payload; if (p.status !== 'active' || !valid(p)) continue;
      const revision = await get(physicalId('revision', current.namespaceKey, p.revisionId));
      if (revision.rowKind !== 'revision' || revision.payload.memoryId !== p.memoryId || canonical(revision.payload.snapshot) !== canonical(p) || revision.payload.committedGeneration !== current.generation || BigInt(revision.payload.committedGeneration) > BigInt(lease.snapshot.generation)) unavailable();
      const outcome = await receipt(revision.payload.sourceEvent.operationId);
      if (outcome.state !== 'committed' || outcome.identityDigest !== revision.payload.sourceEvent.identityDigest || outcome.payloadHash !== revision.payload.sourceEvent.payloadHash || outcome.generation !== revision.payload.committedGeneration || canonical(outcome.processingVersion) !== canonical(revision.payload.processingVersion) || !scopeWithin(p.scope, outcome.scope) || !outcome.affectedRevisions.some(item => item.memoryId === p.memoryId && item.revisionId === p.revisionId)) unavailable();
      let eligible = !protections.some(marker => tombstoneCovers(marker, rowScope(current), p));
      const evidenceKeys = await lease.reader.evidenceKeys(current.namespaceKey, p.revisionId, STORE_LIMITS.maxReferences - references + 1);
      if (evidenceKeys.length > STORE_LIMITS.maxReferences - references) overflow();
      const sources = new Set<string>();
      for (const key of evidenceKeys) {
        const evidence = await get(key);
        if (evidence.rowKind !== 'evidence' || evidence.namespaceKey !== current.namespaceKey || evidence.payload.memoryId !== p.memoryId || evidence.payload.revisionId !== p.revisionId || evidence.payload.createdByOperationId !== revision.payload.sourceEvent.operationId) unavailable();
        if (evidence.payload.evidenceId !== evidenceId(current.namespaceKey, p.revisionId, evidence.payload.sourceId, evidence.payload.relation)) unavailable();
        const source = await get(physicalId('source', current.namespaceKey, evidence.payload.sourceId));
        if (source.rowKind !== 'source' || source.namespaceKey !== current.namespaceKey || source.payload.contentHash !== evidence.payload.sourceContentHash) unavailable();
        const origin = source.payload, expectedSource = logicalId('source', current.namespaceKey, [origin.operationId, origin.identity.sourceVersion, origin.contentHash, origin.span.start, origin.span.end]);
        const identityText = canonical({ version: 1, projectId: current.projectId, producerId: origin.identity.producerId, eventId: origin.identity.eventId });
        const sourceOutcome = await receipt(origin.operationId);
        if (origin.sourceId !== expectedSource || origin.operationId !== digest('insrc-project-memory-operation-v1\0' + identityText) || sourceOutcome.identityDigest !== digest(identityText) || sourceOutcome.eventId !== origin.identity.eventId || !sourceOutcome.sourceIds.includes(origin.sourceId) || !scopeWithin(rowScope(source), sourceOutcome.scope)) unavailable();
        sources.add(source.payload.sourceId);
        if (!valid(source.payload) || protections.some(marker => sourceLifecycleMatches(marker.payload.selector, source.payload.identity))) eligible = false;
        if (p.authority.sourceIds.includes(source.payload.sourceId) && (source.payload.attribution.origin !== p.authority.origin || source.payload.attribution.policyVersion !== p.authority.policyVersion)) unavailable();
      }
      if (!sources.size || sources.size !== p.sourceIds.length || p.sourceIds.some(id => !sources.has(id)) || !p.authority.sourceIds.length || p.authority.sourceIds.some(id => !sources.has(id))) unavailable();
      if (eligible) views.push({ rowId: current.rowId, view: Object.freeze({ id: p.memoryId, revision: p.revisionId, kind: p.kind, text: p.text, status: p.status, sourceIds: Object.freeze([...p.sourceIds]) }) });
    }
    views.sort((a, b) => a.view.id.localeCompare(b.view.id) || a.rowId.localeCompare(b.rowId));
    return Object.freeze({ items: Object.freeze(views.map(record => record.view)), eligibleRowIds: Object.freeze(views.map(record => record.rowId)), generation: lease.snapshot.generation, scopeEpoch: lease.binding.scopeEpoch, evaluatedAt: now, nextValidityBoundary: boundary });
  }
  stopAdmission(): void { this.#stopped = true; }
  pending(): number { return this.#slots; }
  async drain(): Promise<void> {
    this.stopAdmission(); let failed = false;
    for (const lease of this.#live) if (!lease.active) try { await this.#release(lease); } catch { failed = true; }
    for (const work of this.#activity) try { await work; } catch { /* Failed reads still settle before cleanup. */ }
    for (const lease of this.#live) try { await this.#release(lease); } catch { failed = true; }
    if (failed) unavailable();
  }
}
