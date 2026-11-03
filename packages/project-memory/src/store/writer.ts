import { MemoryError } from '../errors.js';
import type { MemoryLimits, OperationReceipt } from '../types.js';
import { IngressBudget, snapshotJson } from '../queue/codec.js';
import type { Reservation } from '../queue/codec.js';
import { encodeRow, makeRow, namespaceKey, physicalId, ROOT_ROW_ID, snapshotRows, STORE_LIMITS } from './codec.js';
import { guardEffects, revisionConflict } from './guards.js';
import type { GuardLookup } from './guards.js';
import { canonical, rowScope, snapshotPlan } from './plan.js';
import type { PreparedPlan } from './plan.js';
import type { EmbeddingProfile, EncodedRow, ReceiptPayload, RootPayload, StoreRow } from './types.js';

/** Package-private native facade; never exposed through MemoryService or IPC. */
export interface WriterIO extends GuardLookup {
  refresh(): Promise<void>;
  root(): Promise<RootPayload>;
  receiptByIdentity(identityDigest: string): Promise<Extract<StoreRow, { rowKind: 'receipt' }> | null>;
  version(): Promise<number>;
  publish(rows: readonly EncodedRow[]): Promise<void>;
}
export interface WriterHooks { readonly now?: (() => number) | undefined; readonly timeoutMs?: number | undefined; }
function unavailable(): MemoryError { return new MemoryError('STORE_UNAVAILABLE', 'Memory writer outcome could not be verified.'); }
export function receiptView(payload: ReceiptPayload): OperationReceipt {
  return Object.freeze({ operationId: payload.operationId, eventId: payload.eventId, state: payload.state, generation: payload.generation, ...(payload.errorCode === null ? {} : { errorCode: payload.errorCode }) });
}
export class AtomicWriter {
  readonly #io: WriterIO;
  readonly #profile: EmbeddingProfile;
  readonly #limits: MemoryLimits;
  readonly #hooks: WriterHooks;
  readonly #budget: IngressBudget;
  #tail: Promise<void> = Promise.resolve();
  #stopped = false;
  #fenced = false;
  #settlementVerified = true;
  constructor(io: WriterIO, profile: EmbeddingProfile, limits: MemoryLimits, hooks: WriterHooks = {}) {
    const timeout = hooks.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new MemoryError('INVALID_REQUEST', 'Invalid native write timeout.');
    this.#io = io; this.#profile = profile; this.#limits = Object.freeze({ ...limits }); this.#hooks = Object.freeze({ now: hooks.now, timeoutMs: timeout });
    this.#budget = new IngressBudget(limits, STORE_LIMITS.maxBytes);
  }
  stopAdmission(): void { this.#stopped = true; }
  pending(): number { return this.#budget.calls + (!this.#settlementVerified && this.#budget.calls === 0 ? 1 : 0); }
  async drain(): Promise<void> { await this.#tail; if (!this.#settlementVerified) throw unavailable(); }
  isFenced(): boolean { return this.#fenced; }
  commit(input: unknown): Promise<OperationReceipt> {
    if (this.#stopped || this.#fenced) return Promise.reject(unavailable());
    let reservation: Reservation | undefined, prepared: PreparedPlan;
    try {
      reservation = this.#budget.reserve();
      prepared = snapshotPlan(input, this.#profile, this.#limits.maxEventBytes, reservation);
    } catch (error) { reservation?.release(); return Promise.reject(error); }
    const held = reservation;
    let resolve!: (receipt: OperationReceipt) => void, reject!: (error: unknown) => void;
    const result = new Promise<OperationReceipt>((yes, no) => { resolve = yes; reject = no; });
    const run = this.#tail.then(async () => {
      try {
        // Admission was granted before stopAdmission, but an earlier uncertain write
        // fences even work already queued behind it.
        if (this.#fenced) throw unavailable();
        await this.#execute(prepared, held, resolve, reject);
      } catch (error) { reject(error instanceof MemoryError ? error : unavailable()); }
      finally { held.release(); }
    });
    // The lane tracks actual settlement, not the caller's timeout/rejection.
    this.#tail = run.catch(() => {});
    return result;
  }
  async #execute(prepared: PreparedPlan, reservation: Reservation, resolve: (receipt: OperationReceipt) => void, reject: (error: unknown) => void): Promise<void> {
    const { plan, identityDigest } = prepared, io = this.#io;
    await io.refresh();
    const root = await io.root();
    const previousReceipt = await io.receiptByIdentity(identityDigest);
    if (previousReceipt) {
      const p = previousReceipt.payload;
      if (p.operationId !== plan.operationId || p.identityDigest !== identityDigest || p.payloadHash !== plan.commandHash || p.scopeEpoch !== plan.scopeEpoch || canonical(p.scope) !== canonical(plan.scope)) revisionConflict();
      if (root.queueId !== plan.frame.queueId || BigInt(p.generation) > BigInt(root.generation)) throw unavailable();
      resolve(receiptView(p)); return;
    }
    const now = this.#hooks.now?.() ?? Date.now();
    const cache = new Map<string, StoreRow | null>();
    const get = async (id: string) => {
      if (!cache.has(id)) cache.set(id, await io.get(id) as StoreRow | null);
      return cache.get(id)!;
    };
    const effects = await guardEffects(prepared, root, this.#profile, { get, tombstones: io.tombstones.bind(io) }, now);
    const receipt: ReceiptPayload = { schemaVersion: 1, operationId: plan.operationId, eventId: plan.frame.command.source.eventId, identityDigest, payloadHash: plan.commandHash, scope: plan.scope, scopeEpoch: plan.scopeEpoch,
      state: plan.disposition.state, generation: effects.generation, queueTerminal: true, affectedRevisions: effects.affectedRevisions, sourceIds: effects.sourceIds, tombstoneIds: effects.tombstoneIds,
      rejectedByTombstoneIds: plan.disposition.rejectedByTombstoneIds, processingVersion: plan.processingVersion, errorCode: plan.disposition.errorCode, committedAt: now };
    const batch: StoreRow[] = [...plan.rows];
    const scopes = new Map([[namespaceKey(plan.scope, plan.scopeEpoch), plan.scope]]);
    for (const row of plan.rows) scopes.set(row.namespaceKey, rowScope(row));
    for (const [namespace, scope] of scopes) {
      const old = await get(physicalId('control', namespace, 'namespace'));
      if (old) {
        if (old.rowKind !== 'control' || old.payload.kind !== 'namespace' || old.payload.namespaceKey !== namespace || old.payload.scopeEpoch !== plan.scopeEpoch || canonical(old.payload.scope) !== canonical(scope)) throw unavailable();
      } else batch.push(makeRow('control', scope, plan.scopeEpoch, { schemaVersion: 1, kind: 'namespace', namespaceKey: namespace, scope, scopeEpoch: plan.scopeEpoch, createdAt: now }, this.#profile));
    }
    batch.push(makeRow('receipt', plan.scope, plan.scopeEpoch, receipt, this.#profile));
    batch.push(makeRow('control', plan.scope, plan.scopeEpoch, { ...root, generation: effects.generation, queueId: plan.frame.queueId }, this.#profile));
    const bounded = snapshotRows(batch, this.#profile, this.#limits.maxEventBytes, reservation);
    const encoded: EncodedRow[] = [];
    let encodedBytes = 2;
    const limit = Math.min(STORE_LIMITS.maxBytes, 8 * this.#limits.maxEventBytes);
    for (const row of bounded.rows) {
      // Claim space before retaining canonical payload strings/physical arrays.
      reservation.charge(2 * Buffer.byteLength(canonical(row)) + 256);
      const physical = encodeRow(row, this.#profile);
      encodedBytes += snapshotJson(physical, STORE_LIMITS.maxBytes).bytes + 1;
      if (encodedBytes > limit) throw new MemoryError('INVALID_REQUEST', 'Generated memory batch exceeds its byte bound.');
      encoded.push(physical);
      await get(row.rowId);
    }
    const version = await io.version();
    let timer: ReturnType<typeof setTimeout> | undefined;
    this.#settlementVerified = false;
    // Capture synchronous native adapter rejection as an uncertain publication too.
    const native = Promise.resolve().then(() => io.publish(Object.freeze(encoded))).then(() => ({ ok: true as const }), () => ({ ok: false as const }));
    const timeout = new Promise<{ ok: false; timedOut: true }>(done => { timer = setTimeout(() => done({ ok: false, timedOut: true }), this.#hooks.timeoutMs ?? 30_000); });
    try {
      const outcome = await Promise.race([native, timeout]);
      if (!outcome.ok) {
        this.#fenced = true; reject(unavailable());
        await native; // Cancellation/deadline never releases the lane or resources.
        this.#settlementVerified = await this.#reconcile(bounded.rows, cache, version);
        return;
      }
      clearTimeout(timer);
      if (!await this.#matches(bounded.rows, version + 1)) {
        this.#fenced = true; reject(unavailable());
        this.#settlementVerified = await this.#reconcile(bounded.rows, cache, version);
        return;
      }
      this.#settlementVerified = true; resolve(receiptView(receipt));
    } catch {
      this.#fenced = true; reject(unavailable());
      await native;
      this.#settlementVerified = await this.#reconcile(bounded.rows, cache, version);
    } finally { clearTimeout(timer); }
  }
  async #matches(rows: readonly StoreRow[], version: number): Promise<boolean> {
    await this.#io.refresh();
    if (await this.#io.version() !== version) return false;
    for (const row of rows) if (canonical(await this.#io.get(row.rowId)) !== canonical(row)) return false;
    return true;
  }
  async #reconcile(after: readonly StoreRow[], before: ReadonlyMap<string, StoreRow | null>, version: number): Promise<boolean> {
    try {
      await this.#io.refresh(); const actualVersion = await this.#io.version();
      let old = actualVersion === version, complete = actualVersion === version + 1;
      for (const row of after) {
        const actual = canonical(await this.#io.get(row.rowId));
        old &&= actual === canonical(before.get(row.rowId) ?? null);
        complete &&= actual === canonical(row);
      }
      return old || complete;
    } catch { return false; }
  }
}
