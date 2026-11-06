import { mkdir, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Connection, Table } from '@lancedb/lancedb';
import type { DirectoryOwnership } from '../ownership.js';
import type { HostPolicy, MemoryLimits, MemoryView, OperationReceipt, Scope } from '../types.js';
import type { ReceiptVerifier } from '../queue/types.js';
import { MemoryError } from '../errors.js';
import { errno } from '../configuration.js';
import { arrowSchema, decodeRow, encodeRow, physicalId, rootRow, ROOT_ROW_ID, STORE_LIMITS } from './codec.js';
import { embeddingProfile, requireProfile, validateProfile } from './embedding-profile.js';
import { loadFormat, STORE_DIRECTORY, writeFormat } from './format.js';
import { AtomicWriter } from './writer.js';
import { receiptVerifier } from './receipts.js';
import { broadSelector, forgetTarget, frameProtection, loadProtections } from './barriers.js';
import type { FrameEligibility } from './barriers.js';
import type { GuardLookup } from './guards.js';
import type { WriterHooks } from './writer.js';
import { ReadLeases } from './reads.js';
import type { ReadHooks } from './reads.js';
import { NativePinnedReader } from './native-reads.js';
import { admittedPayload, canonical, rowIdPredicate, rowScope, scopeWithin, snapshotAdmittedFrame } from './plan.js';
import { decimal, validateQueueLimits } from '../queue/codec.js';
import type { CommittedSnapshot, CurrentProjection, EmbeddingProfile, RootPayload, StoreRow } from './types.js';

/** Private deterministic fault boundaries; not supplied by MemoryOptions/IPC. */
export type StoreOpenPoint = 'intent' | 'load' | 'connect' | 'table' | 'schema' | 'control' | 'ready' | 'before-write' | 'after-write' | 'read-open' | 'read-pinned' | 'read-before-final' | 'read-close' | 'close-table' | 'close-connection';
export interface StoreOpenHooks extends WriterHooks, ReadHooks { readonly point?: ((point: StoreOpenPoint) => void | Promise<void>) | undefined; }
interface Resources { connection?: Connection | undefined; table?: Table | undefined; readers: Set<NativePinnedReader>; }
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
  readonly #guard: GuardLookup;
  readonly #maxEventBytes: number;
  readonly #reads: ReadLeases;
  readonly #orphanReaders = new Set<NativePinnedReader>();
  #observedVersion: number | undefined;
  #closing: Promise<void> | undefined;
  #closed = false;
  #cleanupFailed = false;
  private constructor(owner: DirectoryOwnership, profile: EmbeddingProfile, storeId: string, resources: Resources, identity: { dev: bigint; ino: bigint }, hooks: StoreOpenHooks, limits: MemoryLimits, policy: Pick<HostPolicy, 'bind'> | undefined) {
    this.#owner = owner; this.profile = profile; this.storeId = storeId; this.#resources = resources; this.#identity = identity; this.#hooks = hooks;
    this.#maxEventBytes = limits.maxEventBytes;
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
    const tombstones = async (project: string, epoch: string) => {
      await this.#checkIdentity();
      const rows = await table().query().where("rowKind = 'tombstone'").limit(STORE_LIMITS.maxReferences + 1).toArray(); await this.#checkIdentity();
      if (rows.length > STORE_LIMITS.maxReferences) throw new MemoryError('CONTEXT_OVERFLOW', 'Memory protection scan exceeds its bound.');
      return rows.map(row => this.#decodeNative(row)).filter(row => row.projectId === project && row.scopeEpoch === epoch);
    };
    this.#guard = { get, tombstones };
    this.#writer = new AtomicWriter({
      get,
      refresh: async () => { await this.#checkIdentity(); await table().checkoutLatest(); await this.#assertVersion(); await this.#checkIdentity(); },
      root: () => this.#authorityRoot(),
      version: async () => { await this.#checkIdentity(); await this.#assertVersion(); const version = await table().version(); await this.#checkIdentity(); return version; },
      receiptByIdentity: hash => receiptWhere('identityDigest', hash),
      tombstones,
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
    const head = () => this.#writer.orderedRead(async () => {
      await this.#checkIdentity(); await table().checkoutLatest(); await this.#assertVersion();
      return { version: await table().version(), root: await this.#authorityRoot() };
    }, true);
    this.#reads = new ReadLeases({
      accepting: () => !this.#closing && this.#writer.accepting(),
      binding: scope => { if (!policy) return Promise.reject(new MemoryError('NOT_READY', 'Memory read binding is not configured.')); return policy.bind(scope.projectId, scope.sessionId); },
      head,
      capture: () => this.#writer.orderedRead(async () => {
        await this.#checkIdentity(); await table().checkoutLatest(); await this.#assertVersion();
        const version = await table().version(), root = await this.#authorityRoot();
        const connection = resources.connection; if (!connection) unavailable();
        const native = await connection.openTable('records');
        const reader = new NativePinnedReader(native, profile, version, () => this.#checkIdentity(), async () => { await hooks.point?.('read-close'); }, handle => { resources.readers.delete(handle); this.#orphanReaders.delete(handle); });
        resources.readers.add(reader);
        try {
          await hooks.point?.('read-open'); await native.checkout(version); await this.#checkIdentity();
          let copied = 0;
          const pinned = await reader.get(ROOT_ROW_ID, { charge(n) { copied += n; if (copied > 65_536) unavailable(); }, release() {} }, 65_536);
          if (pinned?.rowKind !== 'control' || pinned.payload.kind !== 'root' || JSON.stringify(pinned.payload) !== JSON.stringify(root)) unavailable();
          await hooks.point?.('read-pinned'); return { version, root, reader };
        } catch (error) {
          try { await reader.close(); } catch { this.#orphanReaders.add(reader); throw new UnverifiedCleanup(); }
          if (error instanceof MemoryError) throw error; unavailable();
        }
      }, true),
      point: async () => { await hooks.point?.('read-before-final'); },
    }, profile, limits, hooks);
  }
  /** Package-private composition barrier. Recovery cannot run against unverified authority.
   * The recovery callback owns rollback of its own partial resources. Host wiring is separate.
   */
  static async beforeRecovery<T>(owner: DirectoryOwnership, profile: EmbeddingProfile, recover: (store: OwnedLanceStore) => Promise<T>): Promise<{ store: OwnedLanceStore; recovered: T }> {
    const store = await OwnedLanceStore.open(owner, profile);
    try { return { store, recovered: await recover(store) }; }
    catch (error) { await store.close(); throw error; }
  }
  static async open(owner: DirectoryOwnership, supplied: EmbeddingProfile, hooks: StoreOpenHooks = {}, limits: MemoryLimits = DEFAULT_LIMITS, policy?: Pick<HostPolicy, 'bind'>): Promise<OwnedLanceStore> {
    validateProfile(supplied); const profile = embeddingProfile(supplied.model, supplied.dimension); requireProfile(supplied, profile);
    validateQueueLimits(limits);
    if (hooks.timeoutMs !== undefined && (!Number.isSafeInteger(hooks.timeoutMs) || hooks.timeoutMs < 1 || hooks.timeoutMs > 2_147_483_647)) throw new MemoryError('INVALID_REQUEST', 'Invalid native write timeout.');
    if (hooks.leaseMs !== undefined && (!Number.isSafeInteger(hooks.leaseMs) || hooks.leaseMs < 1 || hooks.leaseMs > STORE_LIMITS.leaseMs)) throw new MemoryError('INVALID_REQUEST', 'Invalid private read lease duration.');
    if (activeOwners.has(owner)) throw new MemoryError('OWNERSHIP_CONFLICT', 'Memory store already has an active native owner.');
    activeOwners.add(owner);
    const resources: Resources = { readers: new Set() }; let nativeWriteUncertain = false;
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
      let sdk: typeof import('@lancedb/lancedb');
      try { sdk = await import('@lancedb/lancedb'); }
      catch { throw new MemoryError('NOT_READY', 'Native memory storage is unavailable.'); }
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
      const store = new OwnedLanceStore(owner, profile, marker.storeId, resources, identity, hooks, limits, policy);
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
    if (row.rowKind !== 'control' || row.payload.kind !== 'root' || row.payload.storeId !== this.storeId || row.payload.generation === '0' && row.payload.queueId !== null) unavailable();
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
    const metadataFields = ['rowId', 'rowKind', 'namespaceKey', 'scopeEpoch', 'generation', 'operationId', 'identityDigest'];
    const metadata = new Map<string, string>(metadataFields.map(field => [field, field])); metadata.set('payloadBytes', 'octet_length(payload)');
    for await (const batch of table.query().select(metadata)) {
      for (const item of batch) {
        const row = { ...item } as Record<string, unknown>;
        if (typeof row['rowId'] !== 'string' || typeof row['rowKind'] !== 'string' || !['current', 'revision', 'source', 'evidence', 'receipt', 'tombstone', 'control'].includes(row['rowKind']) || typeof row['namespaceKey'] !== 'string' || !/^[a-f0-9]{64}$/.test(row['namespaceKey']) || typeof row['scopeEpoch'] !== 'string' || !row['scopeEpoch'].length || Buffer.byteLength(row['scopeEpoch']) > 512) unavailable();
        if (!row['rowId'].startsWith(row['rowKind'] + ':')) unavailable();
        let predicate: string; try { predicate = rowIdPredicate(row['rowId']); } catch { unavailable(); }
        if (await table.countRows(predicate) !== 1) unavailable();
        const payloadBytes = Number(row['payloadBytes']);
        if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 1 || payloadBytes > STORE_LIMITS.maxBytes) unavailable();
        // Every scalar used by eligibility filters must agree with its payload
        // before trusting the open version. Otherwise corrupt status/namespace
        // columns could hide memory or protection before a targeted decode.
        const stored = await table.query().where(predicate).limit(2).toArray();
        if (stored.length !== 1) unavailable();
        const decoded = this.#decodeNative(stored[0]);
        if (decoded.rowKind !== row['rowKind']) unavailable();
        if (decoded.rowKind === 'receipt') await this.#auditReceiptProtection(decoded, root);
        if (decoded.rowKind === 'tombstone') {
          const creators = await table.query().where("rowKind = 'receipt' AND operationId = '" + decoded.payload.createdByOperationId + "'").limit(2).toArray();
          if (creators.length !== 1) unavailable();
          const creator = this.#decodeNative(creators[0]);
          if (creator.rowKind !== 'receipt' || !creator.payload.tombstoneIds.includes(decoded.payload.tombstoneId) || creator.payload.generation !== decoded.payload.invalidFromGeneration || creator.projectId !== decoded.projectId || creator.scopeEpoch !== decoded.scopeEpoch || decoded.payload.queueId !== root.queueId || creator.payload.committedAt !== decoded.payload.createdAt || !scopeWithin(rowScope(decoded), creator.payload.scope)) unavailable();
          if (broadSelector(decoded.payload.selector) && (decoded.sessionId !== null || decoded.branch !== null || decoded.environment !== null || canonical(rowScope(decoded)) !== canonical(creator.payload.scope))) unavailable();
        }
        if (row['generation'] !== null && (!decimal(row['generation']) || BigInt(row['generation']) > BigInt(root.generation))) unavailable();
        if (row['rowKind'] === 'receipt') {
          if (!decimal(row['generation']) || row['generation'] === '0' || typeof row['identityDigest'] !== 'string' || !/^[a-f0-9]{64}$/.test(row['identityDigest'])) unavailable();
          if (await table.countRows("rowKind = 'receipt' AND generation = '" + row['generation'] + "'") !== 1 || await table.countRows("rowKind = 'receipt' AND identityDigest = '" + row['identityDigest'] + "'") !== 1) unavailable();
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
  /** A terminal receipt must never outlive the protection it publishes or cites.
   * Stream narrow keys and retain at most one decoded marker plus bounded ID sets;
   * do not materialize all protection history during cold recovery. */
  async #auditReceiptProtection(receipt: Extract<StoreRow, { rowKind: 'receipt' }>, root: RootPayload): Promise<void> {
    const table = this.#resources.table; if (!table) unavailable();
    const p = receipt.payload, owned = new Set(p.tombstoneIds), rejected = new Set(p.rejectedByTombstoneIds);
    if (!owned.size && !rejected.size) return;
    const requested = new Set([...owned, ...rejected]), found = new Set<string>();
    for (const id of requested) if (!/^tombstone:[a-f0-9]{64}$/.test(id)) unavailable();
    let bytes = 0;
    const predicate = "rowKind = 'tombstone'" + (rejected.size ? '' : " AND operationId = '" + p.operationId + "'");
    for await (const batch of table.query().where(predicate).select(['rowId', 'namespaceKey'])) {
      for (const item of batch) {
        const id = item['rowId'], namespace = item['namespaceKey'];
        if (typeof id !== 'string' || typeof namespace !== 'string' || !/^[a-f0-9]{64}$/.test(namespace)) unavailable();
        // Logical protection IDs are not native scalar columns. Derive physical
        // keys from narrow namespace metadata before fetching any payload.
        let logical: string | undefined;
        for (const candidate of requested) if (physicalId('tombstone', namespace, candidate) === id) { logical = candidate; break; }
        if (logical === undefined) continue;
        if (found.has(logical)) unavailable(); found.add(logical);
        const rows = await table.query().where(rowIdPredicate(id)).limit(2).toArray();
        if (rows.length !== 1) unavailable();
        const marker = this.#decodeNative(rows[0]); if (marker.rowKind !== 'tombstone') unavailable();
        const m = marker.payload, own = owned.has(m.tombstoneId), reject = rejected.has(m.tombstoneId);
        if (m.tombstoneId !== logical || (!own && !reject)) unavailable();
        bytes += Buffer.byteLength(canonical(marker)); if (bytes > STORE_LIMITS.maxBytes) unavailable();
        if (marker.projectId !== receipt.projectId || marker.scopeEpoch !== receipt.scopeEpoch || m.queueId !== root.queueId || m.invalidFromGeneration === '0') unavailable();
        if (own) {
          if (m.createdByOperationId !== p.operationId || m.invalidFromGeneration !== p.generation || m.createdAt !== p.committedAt) unavailable();
          owned.delete(m.tombstoneId);
        }
        if (reject) {
          if (BigInt(m.invalidFromGeneration) >= BigInt(p.generation)) unavailable();
          rejected.delete(m.tombstoneId);
        }
      }
    }
    if (owned.size || rejected.size) unavailable();
  }
  commit(plan: unknown): Promise<OperationReceipt> {
    if (this.#closing) return Promise.reject(new MemoryError('NOT_READY', 'Memory store is closing.'));
    return this.#writer.commit(plan);
  }
  stopAdmission(): void { this.#writer.stopAdmission(); this.#reads.stopAdmission(); }
  isAvailable(): boolean { return !this.#closing && this.#writer.accepting(); }
  /** S3 validates internal cleanup targeting only. This is not authorization to
   * erase the database or its replay/deletion protections; S9 owns maintenance. */
  async preflightCleanupTarget(target: unknown): Promise<void> {
    if (typeof target !== 'string' || target !== join(this.#owner.directory, STORE_DIRECTORY)) throw new MemoryError('INVALID_REQUEST', 'Invalid memory cleanup target.');
    // Exact canonical sibling targeting excludes root, queue, metadata, parents,
    // descendants and lexical aliases. lstat/inode checks reject symlink or inode
    // substitution; the guard also rechecks root/lock ownership. No unlink here.
    await this.assertOwned(); await this.#checkIdentity();
  }
  pendingWrites(): number { return this.#writer.pending(); }
  drainWrites(): Promise<void> { return this.#writer.drain(); }
  receiptVerifier(): ReceiptVerifier { return this.#receipts; }
  snapshot(scope: Scope): Promise<CommittedSnapshot> { return this.#reads.snapshot(scope); }
  currentProjection(scope: Scope, snapshot: CommittedSnapshot): Promise<CurrentProjection> { return this.#reads.current(scope, snapshot); }
  async current(scope: Scope, snapshot: CommittedSnapshot): Promise<readonly MemoryView[]> { return (await this.currentProjection(scope, snapshot)).items; }
  releaseSnapshot(snapshot: CommittedSnapshot): Promise<void> { return this.#reads.release(snapshot); }
  prepareEmbeddingQuery(input: unknown, snapshot: CommittedSnapshot) { return this.#reads.prepareQuery(input, snapshot, this.#maxEventBytes); }
  pendingReadLeases(): number { return this.#reads.pending(); }
  /** Reader capture/head lane operations are already owned by their read lease.
   * A failed capture can leave a native handle outside the lease manager. */
  pendingOwnedWork(): number {
    const pending = this.#writer.pending() + this.#reads.pending() + this.#orphanReaders.size;
    return (this.#cleanupFailed || this.#closing && !this.#closed) ? Math.max(1, pending) : pending;
  }
  async drainOwnedWork(): Promise<void> {
    this.stopAdmission(); let failed = false;
    try { await this.#reads.drain(); } catch { failed = true; }
    try { await this.#writer.drain(); } catch { failed = true; }
    for (const reader of this.#orphanReaders) try { await reader.close(); } catch { failed = true; }
    if (failed) throw new UnverifiedCleanup();
  }
  async validateFrameEligibility(input: unknown): Promise<FrameEligibility> {
    try {
      if (this.#closing || !this.#writer.accepting()) unavailable();
      const frame = snapshotAdmittedFrame(input, this.#maxEventBytes); admittedPayload(frame); forgetTarget(frame);
      return await this.#writer.orderedRead(async () => {
        const table = this.#resources.table; if (!table) unavailable();
        await table.checkoutLatest(); await this.#assertVersion();
        const root = await this.#authorityRoot();
        const markers = await loadProtections(frame, root, this.profile, this.#guard);
        const result = frameProtection(frame, markers, frame.command.kind === 'forget');
        await this.#checkIdentity(); await this.#assertVersion(); return result;
      });
    } catch (error) {
      if (error instanceof MemoryError && error.code === 'CONTEXT_OVERFLOW') throw error;
      unavailable();
    }
  }
  close(): Promise<void> {
    this.#closing ??= (async () => {
      let verified = true;
      try { await this.drainOwnedWork(); } catch { verified = false; }
      // drain awaits actual native settlement even when verification fails. Attempt
      // every allocated handle; a failure retains resources and the owner guard.
      for (const reader of this.#resources.readers) try { await reader.close(); } catch { verified = false; }
      if (!await closeResources(this.#resources, this.#hooks)) verified = false;
      if (!verified) { this.#cleanupFailed = true; retained.add(this.#resources); throw new UnverifiedCleanup(); }
      this.#closed = true;
      activeOwners.delete(this.#owner);
    })();
    return this.#closing;
  }
}
