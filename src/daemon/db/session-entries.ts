/** Private sc5 config generations. No saved pool, registry, keychain or persistence ports. */
import { randomUUID } from 'node:crypto';
import type { SessionOverlayContext } from './session-owner.js';
import type { ConnectionConfig } from '../../shared/db-driver.js';
import type { ConnectionKey, CredentialPatch, SafeConnection } from '../../shared/connection-management.js';
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

export class TemporaryConnectionOverlay {
 readonly #entries = new Map<string, Entry>();
 #prepared = new WeakMap<PreparedTemporaryEntry, Prepared>();
 #budget: Budget = { entries: 0, bytes: 0 };
 readonly #root: string;
 readonly #assertActive: () => void;
 #closed = false;
 constructor(root: string, assertActive: () => void) {
  this.#root = root; this.#assertActive = assertActive;
 }
 /** Siblings share only counters, never entry maps or credentials. Owned by one session. */
 sibling(root: string, assertActive: () => void): TemporaryConnectionOverlay {
  this.#active(); const sibling = new TemporaryConnectionOverlay(root, assertActive); sibling.#budget = this.#budget; return sibling;
 }
 #active(signal?: AbortSignal): void { if (this.#closed || signal?.aborted) throw reject('session-expired'); this.#assertActive(); }
 #quota(previous: Entry | undefined, next: Entry): void {
  if (this.#budget.entries + (previous ? 0 : 1) > MAX_SESSION_CONNECTIONS || this.#budget.bytes - (previous?.bytes ?? 0) + next.bytes > MAX_SESSION_CONFIG_BYTES) throw reject('busy');
 }
 list(): readonly SafeConnection[] { this.#active(); return Object.freeze([...this.#entries.values()].map(entry => entry.safe)); }
 read(id: string): SafeConnection { this.#active(); const entry = this.#entries.get(id); if (!entry) throw reject('not-found'); return entry.safe; }
 async prepare(draft: TemporaryEntryDraft, signal?: AbortSignal): Promise<PreparedTemporaryEntry> {
  this.#active(signal);
  if (draft.key.scope !== 'temporary' || draft.key.repoRoot !== this.#root || !['create', 'update'].includes(draft.mode)) throw reject('invalid-input');
  const previous = this.#entries.get(draft.key.id);
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
  this.#budget.entries += previous ? 0 : 1; this.#budget.bytes += entry.bytes - (previous?.bytes ?? 0);
  this.#entries.set(entry.config.id, entry); this.#prepared.delete(prepared);
  return entry.safe;
 }
 /** Internal runtime callback only. Never expose the config in a management result. */
 async withGeneration<T>(id: string, revision: string, use: (config: ConnectionConfig) => T | Promise<T>): Promise<T> {
  this.#active(); const entry = this.#entries.get(id);
  if (!entry) throw reject('not-found'); if (entry.revision !== revision) throw reject('conflict');
  const result = await use(entry.config); this.#active();
  if (this.#entries.get(id) !== entry) throw reject('conflict'); return result;
 }
 close(): void {
  if (this.#closed) return; this.#closed = true;
  for (const entry of this.#entries.values()) { this.#budget.entries--; this.#budget.bytes -= entry.bytes; }
  this.#entries.clear(); this.#prepared = new WeakMap();
 }
}

/** Owner factory: no shared map survives the owning session. */
export function createTemporaryOverlay(root: string, _handle: string, context: SessionOverlayContext<TemporaryConnectionOverlay>): TemporaryConnectionOverlay {
 return context.existingOverlays[0]?.sibling(root, context.assertActive) ?? new TemporaryConnectionOverlay(root, context.assertActive);
}
