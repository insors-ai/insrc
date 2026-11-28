import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { ControllerStore } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { verifyBootstrapControl } from '../bootstrap-control.js';
import { ownedRuntimeHome } from './_owned-runtime-home.js';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const capture = await ownedRuntimeHome('ibp-'), home = capture.root;
  let store: ControllerStore | undefined;
  try {
    store = ControllerStore.acquire(resolveInstallationLocation('fixture', { home }));
    const owner = store;
    const bytes = { bootstrap: Buffer.from('unexecuted fixture bootstrap'), native: Buffer.from('unloaded fixture library') };
    const hashes = { bootstrap: sha(bytes.bootstrap), native: sha(bytes.native) };
    return { home, capture, store: owner, bytes, hashes, async clean() { owner.close(); await capture.cleanup(); } };
  } catch (cause) { store?.close(); await capture.cleanup(); throw cause; }
}
test('bootstrap control publication copies exact bytes and reuses only a verified immutable directory', async () => {
  const f = await fixture();
  try {
    const directory = await f.store.publishBootstrapControl(f.bytes, f.hashes), before = fs.lstatSync(directory);
    assert.deepEqual(await verifyBootstrapControl(directory, f.hashes, f.home), f.bytes);
    assert.equal(await f.store.publishBootstrapControl(f.bytes, f.hashes), directory); assert.equal(fs.lstatSync(directory).ino, before.ino);
    fs.writeFileSync(join(directory, 'bootstrap.mjs'), 'tampered');
    await assert.rejects(f.store.publishBootstrapControl(f.bytes, f.hashes), { code: 'runtime-invalid' });
    assert.equal(fs.lstatSync(directory).ino, before.ino); assert.equal(fs.readFileSync(join(directory, 'bootstrap.mjs'), 'utf8'), 'tampered');
    f.store.close(); await assert.rejects(f.store.publishBootstrapControl(f.bytes, f.hashes), { code: 'lock-lost' });
  } finally { await f.clean(); }
});
test('bootstrap control verification rejects extra members and unsafe private ancestors', async () => {
  const f = await fixture();
  try {
    const directory = await f.store.publishBootstrapControl(f.bytes, f.hashes);
    fs.writeFileSync(join(directory, 'extra'), 'extra', { mode: 0o600 });
    await assert.rejects(verifyBootstrapControl(directory, f.hashes, f.home), { code: 'runtime-invalid' }); fs.unlinkSync(join(directory, 'extra'));
    if (process.platform !== 'win32') {
      const parent = join(f.home, 'install', 'bootstrap'); fs.chmodSync(parent, 0o777);
      await assert.rejects(verifyBootstrapControl(directory, f.hashes, f.home), { code: 'runtime-invalid' }); fs.chmodSync(parent, 0o700);
    }
    await assert.rejects(verifyBootstrapControl(directory, f.hashes, join(f.home, 'unrelated')), { code: 'path-invalid' });
  } finally { await f.clean(); }
});
test('bootstrap control close uncertainty is bounded and retains the only owned publication stage', async t => {
  const f = await fixture(), open = io.open, abort = new AbortController(); let retained: FileHandle | undefined, closed: (() => void) | undefined;
  try {
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      if (retained || !String(args[0]).includes('bootstrap-publication-')) return file;
      retained = file; f.capture.trackResource(new Promise<void>(resolve => { closed = resolve; }));
      return new Proxy(file, { get(handle, key) {
        if (key === 'close') return async () => { abort.abort(); return new Promise<void>(() => {}); };
        const value = Reflect.get(handle, key); return typeof value === 'function' ? value.bind(handle) : value;
      } });
    }); syncBuiltinESMExports();
    await assert.rejects(f.store.publishBootstrapControl(f.bytes, f.hashes, abort.signal), { code: 'resource-close-uncertain' });
    assert.ok(retained); assert.equal((await retained.stat()).isFile(), true);
    assert.equal(fs.readdirSync(join(f.home, 'install')).filter(name => name.startsWith('bootstrap-publication-')).length, 1);
    assert.deepEqual(fs.readdirSync(join(f.home, 'install', 'bootstrap')), []);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    try { await retained?.close(); closed?.(); } catch (cause) { f.capture.retain(cause); throw cause; }
    finally { await f.clean(); }
  }
});

test('bootstrap control late cancellation during positive close cannot report successful reuse', async t => {
  const f = await fixture(), open = io.open, abort = new AbortController(); let closed = false;
  try {
    const directory = await f.store.publishBootstrapControl(f.bytes, f.hashes), before = fs.lstatSync(directory);
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      if (String(args[0]) !== join(directory, 'native', 'control.node')) return file;
      return new Proxy(file, { get(handle, key) {
        if (key === 'close') return async () => { await handle.close(); closed = true; abort.abort(); };
        const value = Reflect.get(handle, key); return typeof value === 'function' ? value.bind(handle) : value;
      } });
    }); syncBuiltinESMExports();
    await assert.rejects(f.store.publishBootstrapControl(f.bytes, f.hashes, abort.signal), { name: 'AbortError' });
    assert.equal(closed, true); assert.equal(fs.lstatSync(directory).ino, before.ino);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.clean(); }
});
