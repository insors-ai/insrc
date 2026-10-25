import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mkdtemp, mkdir, realpath, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DuckDBInstance, DuckDBConnection, DuckDBPreparedStatement } from '@duckdb/node-api';
import avsc from 'avsc';
import { serialize } from 'bson';
import ExcelJS from 'exceljs';
import { ConnectionSessionOwner } from '../session-owner.js';
import { TemporaryDriverResources } from '../session-resources.js';
import { MemoryFileExecution } from '../file-execution.js';
import { contextualDriverFactory } from '../driver-log-policy.js';
import { getFactory } from '../registry.js';
import { PATHS } from '../../../shared/paths.js';
import type { ConnectionConfig, FileDriver, DriverFactory } from '../../../shared/db-driver.js';
import '../drivers/index.js';
const budget = 256 * 1024 * 1024;
async function tree(root: string): Promise<Record<string, string>> {
 const result: Record<string, string> = {};
 for (const name of await readdir(root, { recursive: true })) try { result[name] = createHash('sha256').update(await readFile(join(root, name))).digest('hex'); } catch { /* directory */ }
 return result;
}
async function fixture(factory?: (kind: string) => DriverFactory) {
 const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-session-files-'))), root = join(directory, 'root'), other = join(directory, 'other'), saved = PATHS.insrc;
 await mkdir(root); await mkdir(other); PATHS.insrc = join(directory, 'insrc'); await mkdir(PATHS.insrc); await writeFile(join(PATHS.insrc, 'saved-marker'), 'unchanged');
 let now = 0;
 const owner = new ConnectionSessionOwner<TemporaryDriverResources>({ daemonEpoch: 'fixture', monotonicNow: () => now, isRegistered: async r => r === root || r === other,
  createOverlay: (r, handle, c) => new TemporaryDriverResources(r, handle, c.assertActive, c.factoryAuthority, factory ? { factory } : {}), dropOverlay: r => r.close() });
 const context = (id: string) => ({ connectionIdentity: id, daemonEpoch: 'fixture' });
 return { directory, root, other, owner, context, expire() { now = 90000; owner.sweepExpired(); }, async close() { try { await owner.close(); } finally { PATHS.insrc = saved; await rm(directory, { recursive: true, force: true }); } } };
}
async function source(root: string, kind: string, marker: string): Promise<ConnectionConfig> {
 const path = join(root, marker + '.' + kind); let options: Record<string, unknown> | undefined;
 if (kind === 'csv' || kind === 'tsv') { await writeFile(path, `marker${kind === 'tsv' ? '\t' : ','}n\n${marker}${kind === 'tsv' ? '\t' : ','}1\n`); options = { header: true }; }
 else if (kind === 'json') await writeFile(path, JSON.stringify([{ marker }]));
 else if (kind === 'jsonl' || kind === 'ndjson') await writeFile(path, JSON.stringify({ marker }) + '\n');
 else if (kind === 'bson') await writeFile(path, serialize({ marker }));
 else if (kind === 'fixed-width') { await writeFile(path, marker + '\n'); options = { columns: [{ name: 'marker', start: 0, length: marker.length, type: 'string' }] }; }
 else if (kind === 'xlsx') { const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Data'); sheet.addRow(['marker']); sheet.addRow([marker]); await book.xlsx.writeFile(path); }
 else if (kind === 'avro') { const writer = new avsc.streams.BlockEncoder({ type: 'record', name: 'Row', fields: [{ name: 'marker', type: 'string' }] }); const parts: Buffer[] = []; const ended = new Promise<void>((resolve, reject) => { writer.on('data', part => parts.push(part)); writer.on('end', resolve); writer.on('error', reject); }); writer.end({ marker }); await ended; await writeFile(path, Buffer.concat(parts)); }
 else if (kind === 'parquet') { const db = await DuckDBInstance.create(':memory:'), c = await db.connect(); try { await c.run("COPY (SELECT '" + marker.replaceAll("'", "''") + "' AS marker) TO ? (FORMAT PARQUET)", [path]); } finally { c.closeSync(); db.closeSync(); } }
 else await writeFile(path, 'unsupported');
 return { id: kind, kind, path, ...(options ? { options } : {}) };
}
async function rows(driver: FileDriver) { assert.ok(driver.sample); return driver.sample(driver.kind === 'xlsx' ? 'Data' : undefined, { limit: 1 }); }

test('CM-S3-FILES: native and converted readers use distinct owner root revision resources at the production 256MiB budget without writes or INSTALL', async () => {
 const f = await fixture();
 try {
  for (const kind of ['csv', 'tsv', 'json', 'jsonl', 'ndjson', 'parquet', 'avro', 'bson', 'fixed-width', 'xlsx']) {
   const a = await source(f.root, kind, 'owner_A'), b = await source(f.root, kind, 'owner_B'), cross = kind === 'csv' ? await source(f.other, kind, 'root_B') : undefined;
   const oa = await f.owner.open(f.context('A' + kind), f.root), ob = await f.owner.open(f.context('B' + kind), f.root);
   const ra = await f.owner.overlay(f.context('A' + kind), f.root), rb = await f.owner.overlay(f.context('B' + kind), f.root);
   const crossResources = cross ? await f.owner.overlay(f.context('A' + kind), f.other) : undefined;
   const before = await tree(f.directory), events: string[] = [], sql: string[] = [];
   const watcher = watch(f.directory, { recursive: true }, (_t, name) => events.push(String(name)));
   const original = DuckDBConnection.prototype.run, spy = mock.method(DuckDBConnection.prototype, 'run', function (this: DuckDBConnection, query: string, ...args: unknown[]) { sql.push(query); return original.call(this, query, ...args as []); });
   try {
    const da = await ra.acquire(Object.freeze(a), 'revision-A').catch(error => { throw new Error(kind + ' owner-A construction failed', { cause: error }); }) as FileDriver, db = await rb.acquire(Object.freeze(b), 'revision-B') as FileDriver;
    assert.ok(JSON.stringify(await rows(da)).includes('owner_A'), kind); assert.ok(JSON.stringify(await rows(db)).includes('owner_B'), kind);
    const ea = (da as unknown as { execution: MemoryFileExecution }).execution, eb = (db as unknown as { execution: MemoryFileExecution }).execution;
    assert.ok(ea instanceof MemoryFileExecution && eb instanceof MemoryFileExecution); assert.notEqual(ea.engine.instance, eb.engine.instance);
    assert.equal(ea.policy.memoryBudgetBytes, budget); assert.equal(eb.policy.memoryBudgetBytes, budget); assert.equal(ea.policy.allowSpill, false); assert.equal(ea.policy.persistence, 'memory-only');
    assert.deepEqual([ea.policy.identity.ownerId, eb.policy.identity.ownerId], [oa.sessionHandle, ob.sessionHandle]); assert.equal(ea.policy.identity.lookupRoot, f.root); assert.equal(ea.policy.identity.connectionId, kind); assert.equal(ea.policy.identity.revision, 'revision-A');
    const c = await ea.engine.instance.connect(); try { const settings = (await c.runAndReadAll("SELECT current_setting('memory_limit') AS memory, current_setting('temp_directory') AS temp, current_setting('max_temp_directory_size') AS spill, current_setting('autoinstall_known_extensions') AS install")).getRowObjectsJS()[0]!; assert.equal(settings.memory, '256.0 MiB'); assert.equal(settings.temp, ''); assert.equal(settings.spill, '0 bytes'); assert.equal(settings.install, false); } finally { c.closeSync(); }
    if (cross && crossResources) { const dc = await crossResources.acquire(cross, 'revision-A') as FileDriver; assert.ok(JSON.stringify(await rows(dc)).includes('root_B')); const ec = (dc as unknown as { execution: MemoryFileExecution }).execution; assert.equal(ec.policy.identity.ownerId, oa.sessionHandle); assert.equal(ec.policy.identity.lookupRoot, f.other); assert.notEqual(ec.engine.instance, ea.engine.instance); await crossResources.retire('revision-A'); }
    await ra.retire('revision-A'); await rb.retire('revision-B'); assert.deepEqual(ea.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
    assert.equal(sql.some(s => /^\s*INSTALL\b/i.test(s)), false); assert.deepEqual(await tree(f.directory), before); assert.ok(events.every(name => Object.hasOwn(before, name)), JSON.stringify(events));
   } finally { spy.mock.restore(); watcher.close(); }
  }
 } finally { await f.close(); }
});

test('CM-S3-FILES: unavailable Arrow Feather and overbudget BSON refuse explicitly without source deletion or cache writes', async () => {
 const f = await fixture();
 try {
  await f.owner.open(f.context('owner'), f.root); const resources = await f.owner.overlay(f.context('owner'), f.root);
  for (const kind of ['arrow', 'feather', 'bson']) {
   const config = await source(f.root, kind, kind), header = Buffer.alloc(4); header.writeInt32LE(0x7fffffff); if (kind === 'bson') await writeFile(config.path!, header);
   const before = await tree(f.directory);
   await assert.rejects(async () => { const d = await resources.acquire(config, kind) as FileDriver; await rows(d); }, { code: kind === 'bson' ? 'resource-limit' : 'unsupported-temporary' });
   await resources.retire(kind); assert.deepEqual(await tree(f.directory), before);
  }
 } finally { await f.close(); }
});

test('CM-S3-FILES: owner end interrupts actual private file work and retains late allocations for cleanup', async () => {
 let allocated!: () => void, release!: () => void; const entered = new Promise<void>(r => { allocated = r; }), held = new Promise<void>(r => { release = r; }); let resource: MemoryFileExecution | undefined;
 const f = await fixture(kind => contextualDriverFactory(async (config, context) => { const driver = await getFactory(kind)!(config, context); resource = (driver as unknown as { execution: MemoryFileExecution }).execution; allocated(); await held; return driver; }));
 try {
  const config = await source(f.root, 'csv', 'late'); await f.owner.open(f.context('owner'), f.root); const resources = await f.owner.overlay(f.context('owner'), f.root);
  const constructing = resources.acquire(config, 'late'); void constructing.catch(() => {}); await entered;
  const ending = f.owner.end(f.context('owner')); assert.equal(resource!.diagnostics.closed, true); release(); await assert.rejects(constructing, { code: 'session-expired' }); await ending;
  assert.deepEqual(resource!.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
 } finally { release?.(); await f.close(); }
});

test('CM-S3-FILES: session end interrupts a running native query and drains all private execution counters', async () => {
 const f = await fixture(); let started!: () => void; const entered = new Promise<void>(r => { started = r; });
 try {
  const config = await source(f.root, 'csv', 'interrupt'); await f.owner.open(f.context('owner'), f.root); const resources = await f.owner.overlay(f.context('owner'), f.root);
  const driver = await resources.acquire(config, 'revision') as FileDriver, execution = (driver as unknown as { execution: MemoryFileExecution }).execution;
  const original = DuckDBPreparedStatement.prototype.runAndReadAll;
  const spy = mock.method(DuckDBPreparedStatement.prototype, 'runAndReadAll', function (this: DuckDBPreparedStatement) { const work = original.call(this); started(); return work; });
  try {
   const work = execution.withConnection(c => c.runAndReadAll('SELECT sum(hash(i)) FROM range(100000000000) t(i)')); void work.catch(() => {});
   await entered; const ending = f.owner.end(f.context('owner')); await assert.rejects(work); await ending;
   assert.deepEqual(execution.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
  } finally { spy.mock.restore(); }
 } finally { await f.close(); }
});

test('CM-S3-FILES: expiry during engine opening retains and closes the allocation before constructor refusal settles', async () => {
 const f = await fixture(); let entered!: () => void, release!: () => void;
 const opened = new Promise<void>(r => { entered = r; }), held = new Promise<void>(r => { release = r; }); let execution: MemoryFileExecution | undefined;
 const original = MemoryFileExecution.open;
 const spy = mock.method(MemoryFileExecution, 'open', async (...args: Parameters<typeof MemoryFileExecution.open>) => { execution = await original(...args); entered(); await held; return execution; });
 try {
  const config = await source(f.root, 'csv', 'opening'); await f.owner.open(f.context('owner'), f.root); const resources = await f.owner.overlay(f.context('owner'), f.root);
  const constructing = resources.acquire(config, 'opening'); void constructing.catch(() => {}); await opened;
  let ended = false; const ending = f.owner.end(f.context('owner')).then(() => { ended = true; }); assert.equal(ended, false); release();
  await assert.rejects(constructing, { code: 'session-expired' }); await ending;
  assert.deepEqual(execution!.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
 } finally { release?.(); spy.mock.restore(); await f.close(); }
});
