import { mkdir, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Connection, Table } from '@lancedb/lancedb';
import type { DirectoryOwnership } from '../ownership.js';
import { MemoryError } from '../errors.js';
import { errno } from '../configuration.js';
import { arrowSchema, decodeRow, encodeRow, rootRow, ROOT_ROW_ID } from './codec.js';
import { embeddingProfile, requireProfile, validateProfile } from './embedding-profile.js';
import { loadFormat, STORE_DIRECTORY, writeFormat } from './format.js';
import type { EmbeddingProfile, RootPayload } from './types.js';

/** Private deterministic fault boundaries; not supplied by MemoryOptions/IPC. */
export type StoreOpenPoint = 'intent' | 'load' | 'connect' | 'table' | 'schema' | 'control' | 'ready' | 'close-table' | 'close-connection';
export interface StoreOpenHooks { readonly point?: ((point: StoreOpenPoint) => void | Promise<void>) | undefined; }
interface Resources { connection?: Connection | undefined; table?: Table | undefined; }
// Failed native cleanup must not become an implicit GC-based release.
const retained = new Set<Resources>();
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
  #closing: Promise<void> | undefined;
  private constructor(owner: DirectoryOwnership, profile: EmbeddingProfile, storeId: string, resources: Resources, identity: { dev: bigint; ino: bigint }, hooks: StoreOpenHooks) {
    this.#owner = owner; this.profile = profile; this.storeId = storeId; this.#resources = resources; this.#identity = identity; this.#hooks = hooks;
  }
  static async open(owner: DirectoryOwnership, supplied: EmbeddingProfile, hooks: StoreOpenHooks = {}): Promise<OwnedLanceStore> {
    validateProfile(supplied); const profile = embeddingProfile(supplied.model, supplied.dimension); requireProfile(supplied, profile);
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
      const store = new OwnedLanceStore(owner, profile, marker.storeId, resources, identity, hooks);
      const control = await store.readRoot();
      if (marker.state === 'initializing' && (control.generation !== '0' || control.queueId !== null)) unavailable();
      await hooks.point?.('control');
      if (marker.state === 'initializing') await writeFormat(owner, { ...marker, state: 'ready' });
      await store.assertOwned(); await hooks.point?.('ready');
      return store;
    } catch (error) {
      const verified = await closeResources(resources, hooks);
      if (!verified || nativeWriteUncertain) { retained.add(resources); throw new UnverifiedCleanup(); }
      if (error instanceof MemoryError) throw error;
      throw new MemoryError('STORE_UNAVAILABLE', 'Memory store could not be initialized.');
    }
  }
  async assertOwned(): Promise<void> {
    if (this.#closing) throw new MemoryError('NOT_READY', 'Memory store is closing.');
    await this.#owner.assertOwned();
    const now = await directoryIdentity(join(this.#owner.directory, STORE_DIRECTORY));
    if (now.dev !== this.#identity.dev || now.ino !== this.#identity.ino) unavailable();
  }
  async readRoot(): Promise<RootPayload> {
    await this.assertOwned(); const table = this.#resources.table; if (!table) unavailable();
    const rows = await table.query().where("rowId = '" + ROOT_ROW_ID + "'").limit(2).toArray();
    await this.assertOwned(); if (rows.length !== 1) unavailable();
    const row = decodeRow({ ...rows[0] }, this.profile);
    if (row.rowKind !== 'control' || row.payload.kind !== 'root' || row.payload.storeId !== this.storeId) unavailable();
    return row.payload;
  }
  close(): Promise<void> {
    this.#closing ??= (async () => {
      if (!await closeResources(this.#resources, this.#hooks)) throw new UnverifiedCleanup();
    })();
    return this.#closing;
  }
}
