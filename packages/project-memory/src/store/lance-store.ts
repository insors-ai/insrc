import { mkdir, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Connection, Table } from '@lancedb/lancedb';
import type { DirectoryOwnership } from '../ownership.js';
import type { MemoryLimits, OperationReceipt } from '../types.js';
import type { ReceiptVerifier } from '../queue/types.js';
import { MemoryError } from '../errors.js';
import { errno } from '../configuration.js';
import { arrowSchema, decodeRow, encodeRow, rootRow, ROOT_ROW_ID, STORE_LIMITS } from './codec.js';
import { embeddingProfile, requireProfile, validateProfile } from './embedding-profile.js';
import { loadFormat, STORE_DIRECTORY, writeFormat } from './format.js';
import { AtomicWriter } from './writer.js';
import { receiptVerifier } from './receipts.js';
import type { WriterHooks } from './writer.js';
import { rowIdPredicate } from './plan.js';
import { decimal, validateQueueLimits } from '../queue/codec.js';
import type { EmbeddingProfile, RootPayload, StoreRow } from './types.js';

/** Private deterministic fault boundaries; not supplied by MemoryOptions/IPC. */
export type StoreOpenPoint = 'intent' | 'load' | 'connect' | 'table' | 'schema' | 'control' | 'ready' | 'before-write' | 'after-write' | 'close-table' | 'close-connection';
export interface StoreOpenHooks extends WriterHooks { readonly point?: ((point: StoreOpenPoint) => void | Promise<void>) | undefined; }
interface Resources { connection?: Connection | undefined; table?: Table | undefined; }
// Failed native cleanup must not become an implicit GC-based release.
const retained = new Set<Resources>();
const activeOwners = new WeakSet<DirectoryOwnership>();
const DEFAULT_LIMITS: MemoryLimits = Object.freeze({ maxEventBytes: 16 * 1024 * 1024, maxPendingBytes: 64 * 1024 * 1024, segmentBytes: 16 * 1024 * 1024, modelTimeoutMs: 30_000 });
class UnverifiedCleanup extends MemoryError {
  constructor() { super('STORE_UNAVAILABLE', 'Native memory store cleanup could not be verified. Ownership must remain held.'); }
}
export const storeCleanupUnverified = (error: unknown): boolean => error instanceof UnverifiedCleanup;
function unavailable(): never { throw new MemoryError('STORE_UNAVAILABLE', 'Memory store contents could not be verified.'); }
async function closeResources(resources: Resources, hooks: StoreOpenHooks): Promise<boolean> {
  let verified = true;
  if (resources.table) {
    try { await hooks.point?.('close-table'); resources.table.close(); resources.table = undefined; } catch { verified = false; }
  }
  if (resources.connection) {
    try { await hooks.point?.('close-connection'); resources.connection.close(); resources.connection = undefined; } catch { verified = false; }
  }
  if (verified) retained.delete(resources); else retained.add(resources);
  return verified;
}
async function directoryIdentity(path: string) {
  const value = await lstat(path, { bigint: true });
  if (!value.isDirectory() || value.uid !== BigInt(process.getuid!()) || (value.mode & 0o077n) !== 0n) unavailable();
  return { dev: value.dev, ino: value.ino };
}
/** Private native resource owner. Writer/read/proof facades are added separately. */
export class OwnedLanceStore {
  readonly profile: EmbeddingProfile;
  readonly storeId: string;
  readonly #owner: DirectoryOwnership;
  readonly #resources: Resources;
  readonly #hooks: StoreOpenHooks;
  readonly #identity: { dev: bigint; ino: bigint };
  readonly #writer: AtomicWriter;
  readonly #receipts: ReceiptVerifier;
  #observedVersion: number | undefined;
  #closing: Promise<void> | undefined;
  private constructor(owner: DirectoryOwnership, profile: EmbeddingProfile, storeId: string, resources: Resources, identity: { dev: bigint; ino: bigint }, hooks: StoreOpenHooks, limits: MemoryLimits) {
    this.#owner = owner; this.profile = profile; this.storeId = storeId; this.#resources = resources; this.#identity = identity; this.#hooks = hooks;
    const table = () => { if (!resources.table) unavailable(); return resources.table; };
    const get = async (id: string) => {
      await this.#checkIdentity(); const rows = await table().query().where(rowIdPredicate(id)).limit(2).toArray(); await this.#checkIdentity();
      if (rows.length > 1) unavailable(); return rows.length ? this.#decodeNative(rows[0]) : null;
    };
    const receiptWhere = async (column: 'identityDigest' | 'operationId', hash: string) => {
      if (!/^[a-f0-9]{64}$/.test(hash)) unavailable();
      await this.#checkIdentity(); const rows = await table().query().where("rowKind = 'receipt' AND " + column + " = '" + hash + "'").limit(2).toArray(); await this.#checkIdentity();
      if (rows.length > 1) unavailable();
      if (!rows.length) return null;
      const row = this.#decodeNative(rows[0]); if (row.rowKind !== 'receipt') unavailable(); return row;
    };
    this.#writer = new AtomicWriter({
      get,
      refresh: async () => { await this.#checkIdentity(); await table().checkoutLatest(); await this.#assertVersion(); await this.#checkIdentity(); },
      root: () => this.#authorityRoot(),
      version: async () => { await this.#checkIdentity(); await this.#assertVersion(); const version = await table().version(); await this.#checkIdentity(); return version; },
      receiptByIdentity: hash => receiptWhere('identityDigest', hash),
      tombstones: async (project, epoch) => {
        // Project and epoch never enter SQL: match decoded metadata after a bounded
        // protection scan. Task 8 adds broad lifecycle matching, not raw SQL.
        await this.#checkIdentity();
        const rows = await table().query().where("rowKind = 'tombstone'").limit(STORE_LIMITS.maxReferences + 1).toArray(); await this.#checkIdentity();
        if (rows.length > STORE_LIMITS.maxReferences) throw new MemoryError('CONTEXT_OVERFLOW', 'Memory protection scan exceeds its bound.');
        return rows.map(row => this.#decodeNative(row)).filter(row => row.projectId === project && row.scopeEpoch === epoch);
      },
      publish: async rows => {
        await this.#checkIdentity(); await hooks.point?.('before-write'); await this.#checkIdentity();
        await table().checkoutLatest(); await this.#assertVersion();
        const before = await table().version();
        try { await table().mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute(rows.map(row => ({ ...row }))); }
        catch (error) {
          // This exact native promise has settled. Permit old/one-new-version
          // reconciliation, never adopt an unrelated version as valid authority.
          await table().checkoutLatest(); const actual = await table().version();
          if (actual === before || actual === before + 1) this.#observedVersion = actual;
          throw error;
        }
        const after = await table().version(); if (after !== before + 1) unavailable();
        this.#observedVersion = after;
        await this.#checkIdentity(); await hooks.point?.('after-write'); await this.#checkIdentity();
        await table().checkoutLatest(); await this.#assertVersion();
      },
    }, profile, limits, hooks);
    this.#receipts = receiptVerifier({
      read: run => this.#closing ? Promise.reject(new MemoryError('STORE_UNAVAILABLE', 'Memory proof admission has closed.')) : this.#writer.orderedRead(async () => {
        await this.#checkIdentity(); await table().checkoutLatest(); await this.#assertVersion(); await this.#checkIdentity(); return run();
      }),
      identity: hash => receiptWhere('identityDigest', hash), operation: hash => receiptWhere('operationId', hash),
      root: () => this.#authorityRoot(),
    }, profile);
  }
  /** Package-private composition barrier. Recovery cannot run against unverified authority.
   * The recovery callback owns rollback of its own partial resources. Host wiring is separate.
   */
  static async beforeRecovery<T>(owner: DirectoryOwnership, profile: EmbeddingProfile, recover: (store: OwnedLanceStore) => Promise<T>): Promise<{ store: OwnedLanceStore; recovered: T }> {
    const store = await OwnedLanceStore.open(owner, profile);
    try { return { store, recovered: await recover(store) }; }
    catch (error) { await store.close(); throw error; }
  }
  static async open(owner: DirectoryOwnership, supplied: EmbeddingProfile, hooks: StoreOpenHooks = {}, limits: MemoryLimits = DEFAULT_LIMITS): Promise<OwnedLanceStore> {
    validateProfile(supplied); const profile = embeddingProfile(supplied.model, supplied.dimension); requireProfile(supplied, profile);
    validateQueueLimits(limits);
    if (hooks.timeoutMs !== undefined && (!Number.isSafeInteger(hooks.timeoutMs) || hooks.timeoutMs < 1 || hooks.timeoutMs > 2_147_483_647)) throw new MemoryError('INVALID_REQUEST', 'Invalid native write timeout.');
    if (activeOwners.has(owner)) throw new MemoryError('OWNERSHIP_CONFLICT', 'Memory store already has an active native owner.');
    activeOwners.add(owner);
    const resources: Resources = {}; let nativeWriteUncertain = false;
    try {
      const marker = await loadFormat(owner, profile); await hooks.point?.('intent');
      const path = join(owner.directory, STORE_DIRECTORY);
      let exists = true;
      try { await directoryIdentity(path); } catch (error) { if (errno(error) !== 'ENOENT') throw error; exists = false; }
      if (!exists) {
        if (marker.state !== 'initializing') unavailable();
        await owner.assertOwned(); await mkdir(path, { mode: 0o700 });
      }
      const identity = await directoryIdentity(path);
      const check = async () => { await owner.assertOwned(); const now = await directoryIdentity(path); if (now.dev !== identity.dev || now.ino !== identity.ino) unavailable(); };
      await check(); await hooks.point?.('load');
      const sdk = await import('@lancedb/lancedb');
      await check(); resources.connection = await sdk.connect(path, { readConsistencyInterval: 0 });
      retained.add(resources); await check(); await hooks.point?.('connect');
      const tables = await resources.connection.tableNames(); await check();
      if (tables.length === 0) {
        // Only an actually empty initializing directory can acquire a new table.
        if (marker.state !== 'initializing' || (await readdir(path)).length !== 0) unavailable();
        const schema = await arrowSchema(profile);
        nativeWriteUncertain = true;
        resources.table = await resources.connection.createEmptyTable('records', schema);
        nativeWriteUncertain = false;
      } else {
        if (tables.length !== 1 || tables[0] !== 'records') unavailable();
        resources.table = await resources.connection.openTable('records');
      }
      await check(); await hooks.point?.('table');
      const actual = await resources.table.schema(), expected = await arrowSchema(profile);
      const fields = (schema: typeof actual) => schema.fields.map(f => [f.name, f.type.toString(), f.nullable]);
      if (JSON.stringify(fields(actual)) !== JSON.stringify(fields(expected)) || (actual.metadata.has('embedding_functions') && actual.metadata.get('embedding_functions') !== '[]')) unavailable();
      await check(); await hooks.point?.('schema');
      if (marker.state === 'initializing') {
        const count = await resources.table.countRows(), version = await resources.table.version();
        if (count === 0 && version === 1) {
          const initial = { ...encodeRow(rootRow(marker.storeId, profile, Date.now()), profile) };
          nativeWriteUncertain = true;
          await resources.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute([initial]);
          nativeWriteUncertain = false;
        } else if (count !== 1 || version !== 2) unavailable();
      }
      const store = new OwnedLanceStore(owner, profile, marker.storeId, resources, identity, hooks, limits);
      const control = await store.readRoot();
      if (marker.state === 'initializing' && (control.generation !== '0' || control.queueId !== null)) unavailable();
      await hooks.point?.('control');
      if (marker.state === 'initializing') await writeFormat(owner, { ...marker, state: 'ready' });
      await store.#auditMetadata(); await store.assertOwned(); await hooks.point?.('ready');
      return store;
    } catch (error) {
      const verified = await closeResources(resources, hooks);
      if (!verified || nativeWriteUncertain) { retained.add(resources); throw new UnverifiedCleanup(); }
      activeOwners.delete(owner);
      if (error instanceof MemoryError) throw error;
      throw new MemoryError('STORE_UNAVAILABLE', 'Memory store could not be initialized.');
    }
  }
  async assertOwned(): Promise<void> {
    if (this.#closing) throw new MemoryError('NOT_READY', 'Memory store is closing.');
    await this.#checkIdentity();
  }
  async #checkIdentity(): Promise<void> {
    await this.#owner.assertOwned();
    const now = await directoryIdentity(join(this.#owner.directory, STORE_DIRECTORY));
    if (now.dev !== this.#identity.dev || now.ino !== this.#identity.ino) unavailable();
  }
  async readRoot(): Promise<RootPayload> {
    await this.assertOwned();
    return this.#observedVersion === undefined ? this.#readRoot() : this.#writer.orderedRead(async () => {
      const table = this.#resources.table; if (!table) unavailable();
      await table.checkoutLatest(); await this.#assertVersion(); return this.#readRoot();
    });
  }
  async #readRoot(): Promise<RootPayload> {
    await this.#checkIdentity(); const table = this.#resources.table; if (!table) unavailable();
    const rows = await table.query().where("rowId = '" + ROOT_ROW_ID + "'").limit(2).toArray();
    await this.#checkIdentity(); if (rows.length !== 1) unavailable();
    const row = decodeRow({ ...rows[0] }, this.profile);
    if (row.rowKind !== 'control' || row.payload.kind !== 'root' || row.payload.storeId !== this.storeId) unavailable();
    return row.payload;
  }
  async #authorityRoot(): Promise<RootPayload> {
    const root = await this.#readRoot(), table = this.#resources.table; if (!table) unavailable();
    const count = await table.countRows("rowKind = 'receipt'"); await this.#checkIdentity();
    if (!Number.isSafeInteger(count) || BigInt(count) !== BigInt(root.generation)) unavailable();
    await this.#assertVersion();
    return root;
  }
  async #assertVersion(): Promise<void> {
    const table = this.#resources.table; if (!table) unavailable();
    if (this.#observedVersion !== undefined && await table.version() !== this.#observedVersion) unavailable();
  }
  #decodeNative(value: Record<string, unknown>): StoreRow {
    const row = { ...value };
    if (row.embedding !== null) row.embedding = Array.from(row.embedding as Iterable<number>);
    for (const key of ['validFrom', 'validUntil']) if (typeof row[key] === 'bigint') row[key] = Number(row[key]);
    try { return decodeRow(row, this.profile); } catch { unavailable(); }
  }
  async #auditMetadata(): Promise<void> {
    await this.#checkIdentity(); const table = this.#resources.table; if (!table) unavailable();
    const version = await table.version();
    const root = await this.#readRoot(); let receipts = 0n;
    // Stream narrow metadata, rather than retaining the database's history in JS.
    // Per-ID native counts detect duplicates without an unbounded JS uniqueness set.
    for await (const batch of table.query().select(['rowId', 'rowKind', 'namespaceKey', 'scopeEpoch', 'generation', 'operationId', 'identityDigest'])) {
      for (const item of batch) {
        const row = { ...item } as Record<string, unknown>;
        if (typeof row['rowId'] !== 'string' || typeof row['rowKind'] !== 'string' || !['current', 'revision', 'source', 'evidence', 'receipt', 'tombstone', 'control'].includes(row['rowKind']) || typeof row['namespaceKey'] !== 'string' || !/^[a-f0-9]{64}$/.test(row['namespaceKey']) || typeof row['scopeEpoch'] !== 'string' || !row['scopeEpoch'].length || Buffer.byteLength(row['scopeEpoch']) > 512) unavailable();
        if (!row['rowId'].startsWith(row['rowKind'] + ':')) unavailable();
        let predicate: string; try { predicate = rowIdPredicate(row['rowId']); } catch { unavailable(); }
        if (await table.countRows(predicate) !== 1) unavailable();
        if (row['generation'] !== null && (!decimal(row['generation']) || BigInt(row['generation']) > BigInt(root.generation))) unavailable();
        if (row['rowKind'] === 'receipt') {
          if (!decimal(row['generation']) || row['generation'] === '0' || typeof row['identityDigest'] !== 'string' || !/^[a-f0-9]{64}$/.test(row['identityDigest'])) unavailable();
          if (await table.countRows("rowKind = 'receipt' AND generation = '" + row['generation'] + "'") !== 1 || await table.countRows("rowKind = 'receipt' AND identityDigest = '" + row['identityDigest'] + "'") !== 1) unavailable();
          // Validate payload against all lookup columns before trusting the open
          // version baseline. A corrupt filter column must not hide old proof.
          const stored = await table.query().where(predicate).limit(2).toArray();
          if (stored.length !== 1 || this.#decodeNative(stored[0]).rowKind !== 'receipt') unavailable();
          receipts++;
        }
        if (row['operationId'] !== null) {
          if (typeof row['operationId'] !== 'string' || !/^[a-f0-9]{64}$/.test(row['operationId']) || await table.countRows("rowKind = 'receipt' AND operationId = '" + row['operationId'] + "'") !== 1) unavailable();
        }
        await this.#checkIdentity();
      }
    }
    if (receipts !== BigInt(root.generation)) unavailable();
    await this.#checkIdentity();
    if (await table.version() !== version) unavailable();
    this.#observedVersion = version;
  }
  commit(plan: unknown): Promise<OperationReceipt> {
    if (this.#closing) return Promise.reject(new MemoryError('NOT_READY', 'Memory store is closing.'));
    return this.#writer.commit(plan);
  }
  stopAdmission(): void { this.#writer.stopAdmission(); }
  pendingWrites(): number { return this.#writer.pending(); }
  drainWrites(): Promise<void> { return this.#writer.drain(); }
  receiptVerifier(): ReceiptVerifier { return this.#receipts; }
  close(): Promise<void> {
    this.#closing ??= (async () => {
      this.#writer.stopAdmission(); await this.#writer.drain();
      if (!await closeResources(this.#resources, this.#hooks)) throw new UnverifiedCleanup();
      activeOwners.delete(this.#owner);
    })();
    return this.#closing;
  }
}
