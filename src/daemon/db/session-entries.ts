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
interface Budget { entries: number; bytes: number; retired: number }
interface Staging { plans: WeakMap<PreparedTemporaryEntry,Prepared> }
interface Entry { readonly config: ConnectionConfig; readonly revision: string; readonly bytes: number; readonly safe: SafeConnection; readonly staging: Staging }
export interface TemporaryEntryDraft {
 readonly key: ConnectionKey; readonly mode: 'create' | 'update';
 readonly expectedRevision?: string | undefined;
 readonly publicPatch: Readonly<Record<string, unknown>>;
 readonly credentials?: Readonly<Record<string, CredentialPatch>> | undefined;
}
/** Opaque staging identity; private config is held only by the issuing overlay. */
export interface PreparedTemporaryEntry { readonly safe: SafeConnection }
interface Prepared { readonly previous: Entry | undefined; readonly entry: Entry; readonly signal?: AbortSignal | undefined }
interface PreparedRemoval {
 previous: Entry | undefined;
 readonly revision: string; readonly resources: object; readonly release: () => void;
 readonly signal: AbortSignal | undefined; phase: 'prepared'|'committed'|'canceled';
}
interface RemovedResources { readonly id: string; readonly oldRevision: string }
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
 #prepared = new WeakMap<PreparedTemporaryEntry, Staging>();
 readonly #removalTokens = new WeakMap<object,PreparedRemoval>();
 readonly #removalPlans = new Set<object>();
 readonly #removedResources = new Map<string,RemovedResources>();
 #budget: Budget = { entries: 0, bytes: 0, retired: 0 };
 readonly #root: string;
 readonly #ownerId: string;
 readonly #gate: RevisionLeaseGate;
 readonly #resources: TemporaryDriverResources;
 readonly #resourcePorts: TemporaryResourcePorts;
 readonly #uses = new Set<Promise<unknown>>();
 readonly #externalLeases = new Set<() => Promise<void>>();
 readonly #retired = new Set<Promise<void>>();
	readonly #cleanupReservations = new Set<string>();
 #closing: Promise<void> | undefined;
 readonly #assertActive: () => void;
 #closed = false;
 constructor(root: string, assertActive: () => void, ownerId: string, factoryAuthority: object, resourcePorts: TemporaryResourcePorts = {}) {
  this.#root = root; this.#assertActive = assertActive; this.#ownerId = ownerId;
  this.#gate = new RevisionLeaseGate(root); this.#resourcePorts = Object.freeze({ ...resourcePorts });
  this.#resources = new TemporaryDriverResources(root, ownerId, () => this.#active(), factoryAuthority, this.#resourcePorts,()=>{
   // Transfer an already-admitted live entry slot; no new quota admission at removal or shutdown.
   this.#budget.retired++;let released=false;
   return ()=>{if(!released){released=true;this.#budget.retired--;}};
  });
 }
 /** Siblings share only counters, never entry maps or credentials. Owned by one session. */
 sibling(root: string, assertActive: () => void, factoryAuthority: object): TemporaryConnectionOverlay {
  this.#active(); const sibling = new TemporaryConnectionOverlay(root, assertActive, this.#ownerId, factoryAuthority, this.#resourcePorts); sibling.#budget = this.#budget; return sibling;
 }
 #active(signal?: AbortSignal): void { if (this.#closed || signal?.aborted) throw reject('session-expired'); this.#assertActive(); }
 #quota(previous: Entry | undefined, next: Entry): void {
  if (this.#budget.entries + this.#budget.retired + (previous ? 0 : 1) > MAX_SESSION_CONNECTIONS || this.#budget.bytes - (previous?.bytes ?? 0) + next.bytes > MAX_SESSION_CONFIG_BYTES) throw reject('busy');
 }
	/** Boolean-only root coordinator metadata; never grants access to closed entries. */
	reserves(id: string): boolean { return this.#entries.has(id) || this.#cleanupReservations.has(id); }
 contains(id: string): boolean { this.#active(); return this.#entries.has(id); }
 list(): readonly SafeConnection[] { this.#active(); return Object.freeze([...this.#entries.values()].map(entry => entry.safe)); }
 read(id: string): SafeConnection { this.#active(); const entry = this.#entries.get(id); if (!entry) throw reject('not-found'); return entry.safe; }
 async prepare(draft: TemporaryEntryDraft, signal?: AbortSignal): Promise<PreparedTemporaryEntry> {
  this.#active(signal);
  if (draft.key.scope !== 'temporary' || draft.key.repoRoot !== this.#root || !['create', 'update'].includes(draft.mode)) throw reject('invalid-input');
  const previous = this.#entries.get(draft.key.id);
  if (!previous && this.#cleanupReservations.has(draft.key.id)) throw reject('busy');
  // Probe the existing gate before materialization; commit acquires its final synchronous barrier again.
  this.#gate.beginMutation(draft.key.id, draft.mode, draft.expectedRevision)();
  const effective = await materializeDraft({ ...draft, ...(previous ? { current: { config: previous.config, revision: previous.revision } } : {}),
   readSecret: async () => { throw new ManagementServiceError('secret-unavailable'); } });
  this.#active(signal);
  if (this.#entries.get(draft.key.id) !== previous) throw reject('conflict');
  // Runtime preparation is readonly and consumes the existing sc8 path policy.
  const config = frozen({ ...await prepareRuntimeConfig(effective.config, this.#root, signal), ephemeral: true as const });
  this.#active(signal);
  if (this.#entries.get(draft.key.id) !== previous) throw reject('conflict');
  const revision = randomUUID(), bytes = Buffer.byteLength(JSON.stringify(config));
  const entry = Object.freeze({ config, revision, bytes, safe: frozen(safeConnection(config, draft.key, revision)), staging:{plans:new WeakMap<PreparedTemporaryEntry,Prepared>()} });
  this.#quota(previous, entry);
  const prepared = Object.freeze({ safe: entry.safe }), staging=previous?.staging ?? entry.staging;
  staging.plans.set(prepared,{ previous, entry, signal });this.#prepared.set(prepared,staging);
  return prepared;
 }
 /** Synchronous compare-and-swap; the caller publishes its ticket receipt in the same turn. */
 commit(prepared: PreparedTemporaryEntry): SafeConnection {
  this.#active(); const staging = this.#prepared.get(prepared);
  if (!staging) throw reject('invalid-input');
  const plan=staging.plans.get(prepared);if(!plan)throw reject('conflict');
  this.#active(plan.signal);
  const { previous, entry } = plan;
  if (this.#entries.get(entry.config.id) !== previous) throw reject('conflict');
  if (!previous && this.#cleanupReservations.has(entry.config.id)) throw reject('busy');
  this.#quota(previous, entry);
  const release = this.#gate.beginMutation(entry.config.id, previous ? 'update' : 'create', previous?.revision);
  try {
   const revisions = new Map([...this.#entries].map(([id, current]) => [id, current.revision])); revisions.set(entry.config.id, entry.revision);
   this.#gate.sync(revisions);
   this.#budget.entries += previous ? 0 : 1; this.#budget.bytes += entry.bytes - (previous?.bytes ?? 0);
   this.#entries.set(entry.config.id, entry); this.#prepared.delete(prepared);staging.plans.delete(prepared);
   if(previous)previous.staging.plans=new WeakMap();
   if (previous) {
    const closing = this.#resources.retire(previous.revision); this.#retired.add(closing);
    void closing.then(() => this.#retired.delete(closing), () => {});
   }
   return entry.safe;
  } finally { release(); }
 }
 /** Holds the existing revision barrier and resource capacity without deleting anything. */
 prepareRemoval(input: { readonly id: string; readonly expectedRevision: string }, signal?: AbortSignal): object {
  this.#active(signal);
  const previous=this.#entries.get(input.id);
  if(!previous)throw reject('not-found');
  const release=this.#gate.beginMutation(input.id,'remove',input.expectedRevision);
  try {
   // The ledger binds this fresh receipt revision to its signed operation id. Cleanup
   // is indexed by that server-derived revision, never by a caller-selected current id.
   const revision=randomUUID(),resources=this.#resources.prepareRemoval(previous.revision,revision),token=Object.freeze({});
   this.#removalTokens.set(token,{previous,revision,resources,release,signal,phase:'prepared'});this.#removalPlans.add(token);
   return token;
  }catch(error){release();throw error;}
 }
 cancelRemoval(token: object): void {
  const plan=this.#removalTokens.get(token);if(!plan)throw reject('invalid-input');
  if(plan.phase==='canceled')return;if(plan.phase!=='prepared')throw reject('conflict');
  this.#resources.cancelRemoval(plan.resources);plan.phase='canceled';plan.previous=undefined;this.#removalPlans.delete(token);plan.release();
 }
 /** Non-awaiting deletion and revision result; the ledger publishes its receipt in this same turn. */
 commitRemoval(token: object): { readonly revision: string } {
  const plan=this.#removalTokens.get(token);if(!plan)throw reject('invalid-input');
  if(plan.phase!=='prepared'||!plan.previous)throw reject('conflict');
  const previous=plan.previous,id=previous.config.id;
  try {this.#active(plan.signal);if(this.#entries.get(id)!==previous)throw reject('conflict');}
  catch(error){this.cancelRemoval(token);throw error;}
  const result=Object.freeze({revision:plan.revision});
  const revisions=new Map([...this.#entries].filter(([entryId])=>entryId!==id).map(([entryId,entry])=>[entryId,entry.revision]));
  const cleanup=this.#resources.commitRemoval(plan.resources);
  this.#gate.sync(revisions);this.#entries.delete(id);
  this.#budget.entries--;this.#budget.bytes-=previous.bytes;
  previous.staging.plans=new WeakMap();
  plan.phase='committed';plan.previous=undefined;this.#removalPlans.delete(token);
  if(this.#resources.removalCleanupPending(plan.revision,previous.revision)){
   const removed={id,oldRevision:previous.revision};this.#removedResources.set(plan.revision,removed);this.#cleanupReservations.add(id);
   void cleanup.close().then(()=>this.#finishedRemoval(plan.revision,removed),()=>{});
  }
  plan.release();return result;
 }
 #finishedRemoval(revision: string, removed: RemovedResources): void {
  if(this.#removedResources.get(revision)===removed){this.#removedResources.delete(revision);this.#cleanupReservations.delete(removed.id);}
 }
 removalCleanupPending(revision: string): boolean {
  this.#active();const removed=this.#removedResources.get(revision);if(!removed)return false;
  if(this.#resources.removalCleanupPending(revision,removed.oldRevision))return true;
  this.#finishedRemoval(revision,removed);return false;
 }
 async retryRemovalCleanup(revision: string): Promise<void> {
  this.#active();const removed=this.#removedResources.get(revision);if(!removed)return;
  await this.#resources.retryRemovalCleanup(revision,removed.oldRevision);this.#finishedRemoval(revision,removed);this.#active();
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
    let retainedWork: Promise<unknown> | undefined;
    const release = async () => { if (released) return; released = true; if (retainedWork) await retainedWork.catch(() => {}); authority.signal.removeEventListener('abort', abort); this.#externalLeases.delete(release); try { await lease.release(); } finally { done(); } };
    let retained = false;
    const abort = () => { if (!retained) void release(); };
    this.#externalLeases.add(release); authority.signal.addEventListener('abort', abort, { once: true });
    try { authority.registerDrain?.(drained); check(candidate); }
    catch { await release(); throw reject('session-expired'); }
    return { ...lease, key: { repoRoot: this.#root, scope: 'temporary', id }, release, retainWork: work => {
     check(candidate); if (released || retained) throw reject('session-expired');
     authority.registerDrain?.(work); this.retainWork(work); retainedWork = work; retained = true;
     void work.then(() => { if (authority.signal.aborted) void release(); }, () => { if (authority.signal.aborted) void release(); });
    } };
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
		if (!this.#closed) {
			this.#closed = true;
			for(const token of this.#removalPlans)this.cancelRemoval(token);
			this.#resources.stopAdmission();
			for (const release of this.#externalLeases) void release();
			for (const id of this.#entries.keys()) this.#cleanupReservations.add(id);
			for (const entry of this.#entries.values()) { this.#budget.entries--; this.#budget.bytes -= entry.bytes; entry.staging.plans=new WeakMap(); }
			this.#entries.clear(); this.#prepared = new WeakMap();
		}
  this.#closing = Promise.resolve().then(async () => {
			await Promise.allSettled([...this.#uses]); await this.#resources.close();
			// All retired handles are included in resources.close. Old rejected
			// promises are not cleanup truth after those exact handles close.
			this.#retired.clear(); this.#cleanupReservations.clear();this.#removedResources.clear();
		}).catch(() => { this.#closing = undefined; throw new ManagementServiceError('recovery-required'); });
  void this.#closing.catch(() => {}); return this.#closing;
 }
}

/** Owner factory: no shared map survives the owning session. */
export function createTemporaryOverlay(root: string, handle: string, context: SessionOverlayContext<TemporaryConnectionOverlay>, resourcePorts: TemporaryResourcePorts = {}): TemporaryConnectionOverlay {
 return context.existingOverlays[0]?.sibling(root, context.assertActive, context.factoryAuthority) ?? new TemporaryConnectionOverlay(root, context.assertActive, handle, context.factoryAuthority, resourcePorts);
}
