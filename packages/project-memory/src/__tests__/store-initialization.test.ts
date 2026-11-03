import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, readdir, rename, rm, writeFile, lstat, symlink } from 'node:fs/promises';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireOwnership } from '../ownership.js';
import type { DirectoryOwnership } from '../ownership.js';
import { MemoryError } from '../errors.js';
import { FileQueue } from '../queue/file-queue.js';
import { QueueAdmission } from '../queue/admission.js';
import { digest } from '../queue/codec.js';
import { embeddingProfile } from '../store/embedding-profile.js';
import { arrowSchema, encodeRow, rootRow } from '../store/codec.js';
import { formatText, STORE_DIRECTORY, STORE_FORMAT, STORE_PENDING } from '../store/format.js';
import type { StoreFormat } from '../store/format.js';
import { OwnedLanceStore, storeCleanupUnverified } from '../store/lance-store.js';
import type { StoreOpenPoint } from '../store/lance-store.js';
import { nativeTest } from './fixtures/node22.js';
import { options } from './fixtures/options.js';
import { profile } from './fixtures/store-rows.js';
import { openNative } from './fixtures/store-native.js';

const denied = (code?: string) => (e: unknown) => e instanceof MemoryError && (code === undefined || e.code === code);
async function fixture(run: (root: string, owner: DirectoryOwnership) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-store-open-'))); const owner = await acquireOwnership(options(root));
  try { await run(root, owner); } finally { await owner.close(); await rm(root, { recursive: true, force: true }); }
}
async function bytes(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(path: string) {
    for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
      const key = path ? path + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await walk(key);
      else if (entry.isFile()) result[key] = digest((await readFile(join(root, key))).toString('base64'));
    }
  }
  await walk(''); return result;
}
async function marker(root: string): Promise<StoreFormat> { return JSON.parse(await readFile(join(root, STORE_FORMAT), 'utf8')) as StoreFormat; }
nativeTest(import.meta.url, 'store-initialization-fresh-profile-and-read-only-reopen', async () => {
  await fixture(async (root, owner) => {
    const opened = await OwnedLanceStore.open(owner, profile);
    const control = await opened.readRoot(); assert.equal(control.generation, '0'); assert.equal(control.queueId, null);
    assert.equal(control.storeId, opened.storeId); assert.equal(control.normalizationVersion, profile.normalizationVersion);
    assert.equal((await marker(root)).state, 'ready'); assert.equal((await lstat(join(root, STORE_FORMAT))).mode & 0o777, 0o600);
    assert.equal((await lstat(join(root, STORE_DIRECTORY))).mode & 0o777, 0o700);
    await opened.close(); await opened.close(); await owner.assertOwned();
    const before = await bytes(root); const again = await OwnedLanceStore.open(owner, profile);
    try { assert.deepEqual(await again.readRoot(), control); } finally { await again.close(); }
    assert.deepEqual(await bytes(root), before, 'reopen never rewrites metadata or creates empty replacement');
  });
});
nativeTest(import.meta.url, 'store-initialization-refuses-queue-only-and-unknown-roots-without-replacement', async () => {
  await fixture(async (root, owner) => {
    const config = options(root), queue = new FileQueue(owner, root, config.limits); await queue.start();
    const admission = new QueueAdmission(queue, config.policy);
    await admission.append({ version: 1, scope: { projectId: 'p' }, source: { producerId: 'test', eventId: 'e', sessionId: 's', turnId: 't', sourceVersion: '1' }, kind: 'capture', payload: { text: 'accepted pending' } });
    await queue.close(); const before = await bytes(root); let loaded = false;
    await assert.rejects(OwnedLanceStore.open(owner, profile, { point(point) { if (point === 'load') loaded = true; } }), denied('NOT_READY'));
    assert.equal(loaded, false); assert.deepEqual(await bytes(root), before); assert.equal((await readdir(root)).includes(STORE_FORMAT), false);
  });
  await fixture(async (root, owner) => {
    await writeFile(join(root, 'index.lance'), 'foreign index sentinel'); const before = await bytes(root);
    await assert.rejects(OwnedLanceStore.open(owner, profile), denied('NOT_READY')); assert.deepEqual(await bytes(root), before);
  });
});
nativeTest(import.meta.url, 'store-initialization-preserves-missing-corrupt-and-mismatched-profile-data', async () => {
  await fixture(async (root, owner) => {
    const opened = await OwnedLanceStore.open(owner, profile); await opened.close();
    const original = await marker(root), originalText = formatText(original);
    for (const changed of [embeddingProfile('different-model', 2), embeddingProfile(profile.model, 3)]) {
      const before = await bytes(root); await assert.rejects(OwnedLanceStore.open(owner, changed), denied('UNSUPPORTED_VERSION')); assert.deepEqual(await bytes(root), before);
    }
    for (const bad of [{ ...original, normalizationVersion: 'semantic-normalizer' }, { ...original, normalizationVersion: undefined }]) {
      const text = JSON.stringify(bad) + '\n'; await writeFile(join(root, STORE_FORMAT), text);
      const before = await bytes(root); await assert.rejects(OwnedLanceStore.open(owner, profile), denied()); assert.deepEqual(await bytes(root), before);
    }
    await writeFile(join(root, STORE_FORMAT), originalText);
    await writeFile(join(root, STORE_FORMAT), formatText({ ...original, storeId: '00000000-0000-0000-0000-000000000000' }));
    const uuidBefore = await bytes(root); await assert.rejects(OwnedLanceStore.open(owner, profile), denied()); assert.deepEqual(await bytes(root), uuidBefore);
    await writeFile(join(root, STORE_FORMAT), originalText);
    const savedMarker = root + '-marker'; await rename(join(root, STORE_FORMAT), savedMarker);
    try { const before = await bytes(root); await assert.rejects(OwnedLanceStore.open(owner, profile), denied()); assert.deepEqual(await bytes(root), before); }
    finally { await rename(savedMarker, join(root, STORE_FORMAT)); }
    const saved = root + '-native'; await rename(join(root, STORE_DIRECTORY), saved);
    try { const before = await bytes(root); await assert.rejects(OwnedLanceStore.open(owner, profile), denied()); assert.deepEqual(await bytes(root), before); }
    finally { await rename(saved, join(root, STORE_DIRECTORY)); }
    const db = await openNative(root); try {
      const wrong = embeddingProfile('different-model', 2);
      await db.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute([{ ...encodeRow(rootRow(original.storeId, wrong, 99), wrong) }]);
    } finally { db.close(); }
    const before = await bytes(root); await assert.rejects(OwnedLanceStore.open(owner, profile), denied('UNSUPPORTED_VERSION')); assert.deepEqual(await bytes(root), before);
  });
});
nativeTest(import.meta.url, 'store-initialization-never-replaces-ready-store-with-missing-control-or-extra-table', async () => {
  for (const corrupt of ['missing-control', 'extra-table']) await fixture(async (root, owner) => {
    const opened = await OwnedLanceStore.open(owner, profile); await opened.close();
    const db = await openNative(root);
    try {
      if (corrupt === 'missing-control') await db.table.delete("rowId = 'control:root'");
      else { const other = await db.connection.createEmptyTable('foreign', await arrowSchema(profile)); other.close(); }
    } finally { db.close(); }
    const before = await bytes(root); await assert.rejects(OwnedLanceStore.open(owner, profile), denied()); assert.deepEqual(await bytes(root), before);
  });
});
nativeTest(import.meta.url, 'store-initialization-resumes-only-recognized-generation-zero', async () => {
  for (const point of ['intent', 'table', 'control'] as const) await fixture(async (root, owner) => {
    await assert.rejects(OwnedLanceStore.open(owner, profile, { point(p) { if (p === point) throw Error('interrupted'); } }), denied());
    const first = await marker(root); assert.equal(first.state, 'initializing');
    const resumed = await OwnedLanceStore.open(owner, profile);
    try { assert.equal(resumed.storeId, first.storeId); assert.equal((await resumed.readRoot()).generation, '0'); assert.equal((await marker(root)).state, 'ready'); }
    finally { await resumed.close(); }
  });
  await fixture(async (root, owner) => {
    const opened = await OwnedLanceStore.open(owner, profile); await opened.close();
    const original = await marker(root); await writeFile(join(root, STORE_FORMAT), formatText({ ...original, state: 'initializing' }));
    const db = await openNative(root); try {
      // A second mutation is not a recognized initial generation-zero version.
      const row = { ...encodeRow(rootRow(original.storeId, profile, 99), profile) };
      await db.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute([row]);
    } finally { db.close(); }
    const before = await bytes(root); await assert.rejects(OwnedLanceStore.open(owner, profile), denied()); assert.deepEqual(await bytes(root), before);
  });
});
nativeTest(import.meta.url, 'store-initialization-validates-pending-markers-and-native-directory-identity', async () => {
  await fixture(async (root, owner) => {
    await writeFile(join(root, STORE_PENDING), '{"partial', { mode: 0o600 }); const before = await bytes(root);
    await assert.rejects(OwnedLanceStore.open(owner, profile), denied()); assert.deepEqual(await bytes(root), before);
  });
  await fixture(async (root, owner) => {
    const opened = await OwnedLanceStore.open(owner, profile); const identity = await marker(root); await opened.close();
    await writeFile(join(root, STORE_PENDING), formatText({ ...identity, state: 'ready' }).slice(0, 30), { mode: 0o600 });
    const again = await OwnedLanceStore.open(owner, profile); await again.close();
    await rm(join(root, STORE_PENDING));
    const saved = root + '-saved'; await rename(join(root, STORE_DIRECTORY), saved); await symlink(saved, join(root, STORE_DIRECTORY));
    try { await assert.rejects(OwnedLanceStore.open(owner, profile), denied()); }
    finally { await rm(join(root, STORE_DIRECTORY)); await rename(saved, join(root, STORE_DIRECTORY)); }
  });
});
nativeTest(import.meta.url, 'store-initialization-rolls-back-each-acquired-native-resource', async () => {
  for (const failure of ['load', 'connect', 'table', 'schema', 'control', 'ready'] as StoreOpenPoint[]) await fixture(async (root, owner) => {
    const calls: StoreOpenPoint[] = [];
    await assert.rejects(OwnedLanceStore.open(owner, profile, { point(p) { calls.push(p); if (p === failure) throw Error('fault'); } }), e => denied()(e) && !storeCleanupUnverified(e));
    if (failure !== 'load') assert.ok(calls.includes('close-connection'), failure);
    if (['table', 'schema', 'control', 'ready'].includes(failure)) assert.ok(calls.includes('close-table'), failure);
    await owner.assertOwned();
    const reopened = await OwnedLanceStore.open(owner, profile); await reopened.close();
  });
});
nativeTest(import.meta.url, 'store-initialization-unverified-close-is-explicit-and-owner-stays-held', async () => {
  for (const mode of ['close', 'startup']) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-cleanup-peer-')));
    const env = { ...process.env }; delete env['NODE_TEST_CONTEXT'];
    const peer = fork(fileURLToPath(new URL('./fixtures/store-cleanup-peer.ts', import.meta.url)), [root, mode], { execPath: process.execPath, execArgv: ['--import', 'tsx'], env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const exited = once(peer, 'exit'); let stderr = '';
    peer.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4096); });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Cleanup peer timed out: ' + stderr)), 20_000);
        peer.once('message', value => { clearTimeout(timer); if ((value as { type?: string }).type === 'owner-held') resolve(); else reject(Error('Unexpected peer message.')); });
        peer.once('exit', () => { clearTimeout(timer); reject(Error('Cleanup peer exited early: ' + stderr)); });
        peer.once('error', error => { clearTimeout(timer); reject(error); });
      });
      await assert.rejects(acquireOwnership(options(root)), denied('OWNERSHIP_CONFLICT'));
    } finally {
      peer.kill('SIGKILL'); const [_code, signal] = await exited; assert.equal(signal, 'SIGKILL');
    }
    try {
      const owner = await acquireOwnership(options(root));
      try { const recovered = await OwnedLanceStore.open(owner, profile); await recovered.close(); }
      finally { await owner.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
