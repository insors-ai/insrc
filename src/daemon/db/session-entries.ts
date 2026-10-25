/** Private sc5 config generations. No saved pool, registry, keychain or persistence ports. */
import { randomUUID } from 'node:crypto';
import type { SessionOverlayContext } from './session-owner.js';
import { RevisionLeaseGate } from './lease-gate.js';
import { guardedDriver } from './driver-guard.js';
import { TemporaryDriverResources, temporaryDriverFailure } from './session-resources.js';
import type { TemporaryResourcePorts } from './session-resources.js';
import type { ConnectionConfig, Driver } from '../../shared/db-driver.js';
import type { ConnectionKey, CredentialPatch, SafeConnection, ConnectionAccessContext, ConnectionResolver, ConnectionLease } from '../../shared/connection-management.js';
import { materializeDraft, safeConnection } from './driver-profiles.js';
import { prepareRuntimeConfig } from './runtime-config.js';
import { ManagementServiceError } from './management.js';

export const MAX_SESSION_CONNECTIONS = 64;
export const MAX_SESSION_CONFIG_BYTES = 8 * 1024 * 1024;
interface Budget { entries: number; bytes: number }
interface Entry { readonly config: ConnectionConfig; readonly revision: string; readonly bytes: number; readonly safe: SafeConnection }
export interface TemporaryEntryDraft {
 readonly key: ConnectionKey; readonly mode: 'create' | 'update';
 readonly expectedRevision?: string | undefined;
 readonly publicPatch: Readonly<Record<string, unknown>>;
 readonly credentials?: Readonly<Record<string, CredentialPatch>> | undefined;
}
/** Opaque staging identity; private config is held only by the issuing overlay. */
export interface PreparedTemporaryEntry { readonly safe: SafeConnection }
interface Prepared { readonly previous: Entry | undefined; readonly entry: Entry; readonly signal?: AbortSignal | undefined }
function frozen<T>(value: T): T {
 if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
 return value;
}
const reject = (code: 'busy' | 'conflict' | 'not-found' | 'invalid-input' | 'session-expired') => new ManagementServiceError(code);

export interface TemporaryUseAuthority {
 readonly assertActive: () => void; readonly signal: AbortSignal;
 readonly registerDrain?: ((work: PromiseLike<unknown>) => void) | undefined;
}
export class TemporaryConnectionOverlay {
 readonly #entries = new Map<string, Entry>();
 #prepared = new WeakMap<PreparedTemporaryEntry, Prepared>();
 #budget: Budget = { entries: 0, bytes: 0 };
 readonly #root: string;
 readonly #ownerId: string;
 readonly #gate: RevisionLeaseGate;
 readonly #resources: TemporaryDriverResources;
 readonly #resourcePorts: TemporaryResourcePorts;
 readonly #uses = new Set<Promise<unknown>>();
 readonly #externalLeases = new Set<() => Promise<void>>();
 readonly #retired = new Set<Promise<void>>();
 #closing: Promise<void> | undefined;
 readonly #assertActive: () => void;
 #closed = false;
 constructor(root: string, assertActive: () => void, ownerId: string, factoryAuthority: object, resourcePorts: TemporaryResourcePorts = {}) {
  this.#root = root; this.#assertActive = assertActive; this.#ownerId = ownerId;
  this.#gate = new RevisionLeaseGate(root); this.#resourcePorts = Object.freeze({ ...resourcePorts });
  this.#resources = new TemporaryDriverResources(root, ownerId, () => this.#active(), factoryAuthority, this.#resourcePorts);
 }
 /** Siblings share only counters, never entry maps or credentials. Owned by one session. */
 sibling(root: string, assertActive: () => void, factoryAuthority: object): TemporaryConnectionOverlay {
  this.#active(); const sibling = new TemporaryConnectionOverlay(root, assertActive, this.#ownerId, factoryAuthority, this.#resourcePorts); sibling.#budget = this.#budget; return sibling;
 }
 #active(signal?: AbortSignal): void { if (this.#closed || signal?.aborted) throw reject('session-expired'); this.#assertActive(); }
 #quota(previous: Entry | undefined, next: Entry): void {
  if (this.#budget.entries + (previous ? 0 : 1) > MAX_SESSION_CONNECTIONS || this.#budget.bytes - (previous?.bytes ?? 0) + next.bytes > MAX_SESSION_CONFIG_BYTES) throw reject('busy');
 }
 contains(id: string): boolean { this.#active(); return this.#entries.has(id); }
 list(): readonly SafeConnection[] { this.#active(); return Object.freeze([...this.#entries.values()].map(entry => entry.safe)); }
 read(id: string): SafeConnection { this.#active(); const entry = this.#entries.get(id); if (!entry) throw reject('not-found'); return entry.safe; }
 async prepare(draft: TemporaryEntryDraft, signal?: AbortSignal): Promise<PreparedTemporaryEntry> {
  this.#active(signal);
  if (draft.key.scope !== 'temporary' || draft.key.repoRoot !== this.#root || !['create', 'update'].includes(draft.mode)) throw reject('invalid-input');
  const previous = this.#entries.get(draft.key.id);
  // Probe the existing gate before materialization; commit acquires its final synchronous barrier again.
  this.#gate.beginMutation(draft.key.id, draft.mode, draft.expectedRevision)();
  const effective = await materializeDraft({ ...draft, ...(previous ? { current: { config: previous.config, revision: previous.revision } } : {}),
   readSecret: async () => { throw new ManagementServiceError('secret-unavailable'); } });
  this.#active(signal);
  // Runtime preparation is readonly and consumes the existing sc8 path policy.
  const config = frozen({ ...await prepareRuntimeConfig(effective.config, this.#root, signal), ephemeral: true as const });
  this.#active(signal);
  const revision = randomUUID(), bytes = Buffer.byteLength(JSON.stringify(config));
  const entry = Object.freeze({ config, revision, bytes, safe: frozen(safeConnection(config, draft.key, revision)) });
  this.#quota(previous, entry);
  const prepared = Object.freeze({ safe: entry.safe }); this.#prepared.set(prepared, { previous, entry, signal });
  return prepared;
 }
 /** Synchronous compare-and-swap; ticket receipt publication shares this commit turn in t7. */
 commit(prepared: PreparedTemporaryEntry): SafeConnection {
  this.#active(); const plan = this.#prepared.get(prepared);
  if (!plan) throw reject('invalid-input');
  this.#active(plan.signal);
  const { previous, entry } = plan;
  if (this.#entries.get(entry.config.id) !== previous) throw reject('conflict');
  this.#quota(previous, entry);
  const release = this.#gate.beginMutation(entry.config.id, previous ? 'update' : 'create', previous?.revision);
  try {
   const revisions = new Map([...this.#entries].map(([id, current]) => [id, current.revision])); revisions.set(entry.config.id, entry.revision);
   this.#gate.sync(revisions);
   this.#budget.entries += previous ? 0 : 1; this.#budget.bytes += entry.bytes - (previous?.bytes ?? 0);
   this.#entries.set(entry.config.id, entry); this.#prepared.delete(prepared);
   if (previous) {
    const closing = this.#resources.retire(previous.revision); this.#retired.add(closing);
    void closing.then(() => this.#retired.delete(closing), () => {});
   }
   return entry.safe;
  } finally { release(); }
 }
 /** Internal runtime callback only. Never expose the config in a management result. */
 async withGeneration<T>(id: string, revision: string, use: (config: ConnectionConfig) => T | Promise<T>): Promise<T> {
  this.#active(); const entry = this.#entries.get(id);
  if (!entry) throw reject('not-found'); if (entry.revision !== revision) throw reject('conflict');
  const result = await use(entry.config); this.#active();
  if (this.#entries.get(id) !== entry) throw reject('conflict'); return result;
 }
 resolver(access: Readonly<ConnectionAccessContext>, authority: TemporaryUseAuthority): ConnectionResolver {
  const check = (candidate: ConnectionAccessContext = access) => {
   if (candidate !== access || candidate.lookupRoot !== this.#root || candidate.sessionHandle !== this.#ownerId || authority.signal.aborted) throw reject('session-expired');
   authority.assertActive(); this.#active();
  };
  return Object.freeze({
   list: async (candidate: ConnectionAccessContext) => { check(candidate); return this.list(); },
   lease: async (candidate: ConnectionAccessContext, id: string): Promise<ConnectionLease> => {
    check(candidate); const lease = this.#gate.lease(id); let done!: () => void, released = false;
    const drained = new Promise<void>(resolve => { done = resolve; });
    const release = async () => { if (released) return; released = true; authority.signal.removeEventListener('abort', abort); this.#externalLeases.delete(release); try { await lease.release(); } finally { done(); } };
    const abort = () => { void release(); };
    this.#externalLeases.add(release); authority.signal.addEventListener('abort', abort, { once: true });
    try { authority.registerDrain?.(drained); check(candidate); }
    catch { await release(); throw reject('session-expired'); }
    return { ...lease, key: { repoRoot: this.#root, scope: 'temporary', id }, release };
   },
   withConnection: <T>(candidate: ConnectionAccessContext, id: string, use: (driver: Driver) => Promise<T>) => {
    check(candidate); let admitted = false;
    const work = Promise.resolve().then(async () => {
     if (!admitted) throw reject('session-expired'); check(candidate);
     const lease = this.#gate.lease(id); let guard: ReturnType<typeof guardedDriver> | undefined;
     try {
      const entry = this.#entries.get(id); if (!entry || entry.revision !== lease.revision) throw reject('conflict');
      const driver = await this.#resources.acquire(entry.config, entry.revision); check(candidate);
      guard = guardedDriver(driver, { assertActive: check, failure: temporaryDriverFailure });
      const result = await use(guard.driver); check(candidate); return result;
     } catch (error) { throw temporaryDriverFailure(error); }
     finally { try { await guard?.finish(); } finally { await lease.release(); check(candidate); } }
    });
    this.#uses.add(work); void work.then(() => this.#uses.delete(work), () => this.#uses.delete(work));
    try { authority.registerDrain?.(work); admitted = true; }
    catch { void work.catch(() => {}); throw reject('session-expired'); }
    return work;
   },
  });
 }
 /** Trusted owner request/probe lifecycle, without staging an entry or receipt. */
 retainWork(work: PromiseLike<unknown>): void {
  this.#active(); const drained = Promise.resolve(work); this.#uses.add(drained);
  void drained.then(() => this.#uses.delete(drained), () => this.#uses.delete(drained));
 }
 /** Retired SDK handles are private cleanup truth, not current generation configuration. */
 get cleanupPending(): boolean { return this.#retired.size > 0; }
 async retiredCleanup(): Promise<void> {
  const results = await Promise.allSettled([...this.#retired]);
  if (results.some(result => result.status === 'rejected')) throw new ManagementServiceError('recovery-required');
 }
 close(): Promise<void> {
  if (this.#closing) return this.#closing;
  this.#closed = true; this.#resources.stopAdmission();
  for (const release of this.#externalLeases) void release();
  for (const entry of this.#entries.values()) { this.#budget.entries--; this.#budget.bytes -= entry.bytes; }
  this.#entries.clear(); this.#prepared = new WeakMap();
  this.#closing = Promise.resolve().then(async () => {
   await Promise.allSettled([...this.#uses]); await this.#resources.close(); await this.retiredCleanup();
  });
  void this.#closing.catch(() => {}); return this.#closing;
 }
}

/** Owner factory: no shared map survives the owning session. */
export function createTemporaryOverlay(root: string, handle: string, context: SessionOverlayContext<TemporaryConnectionOverlay>, resourcePorts: TemporaryResourcePorts = {}): TemporaryConnectionOverlay {
 return context.existingOverlays[0]?.sibling(root, context.assertActive, context.factoryAuthority) ?? new TemporaryConnectionOverlay(root, context.assertActive, handle, context.factoryAuthority, resourcePorts);
}
