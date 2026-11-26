import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import type { ChildProcess } from 'node:child_process';
import type { Target, RuntimeIdentity } from '../contracts.js';
import type { DownloadTransport } from '../download.js';
import { ControllerStore } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { controlBinding } from '../native.js';
import { runtimeArchive, runtimeStorePaths } from '../runtime-policy.js';
import { stageRuntime, discardRuntimeStage } from '../runtime-acquire.js';
import { ensurePrivateRuntime } from '../runtime-install.js';
import { officialInputs } from './_runtime-profile-fixture.js';
import { childLine, spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'native-v1' };
const identity: RuntimeIdentity = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
const lockFixture = fileURLToPath(new URL('./control-fixture.mjs', import.meta.url));
function setup() {
  const home = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'irp-'));
  if (process.platform === 'win32') controlBinding().protect(home);
  return { home, location: resolveInstallationLocation('fixture', { home, ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) }),
    clean: () => fs.rmSync(home, { recursive: true, force: true }) };
}
async function transport(): Promise<DownloadTransport> {
  const directory = await officialInputs();
  return async url => {
    const body = fs.createReadStream(join(directory, url.pathname.split('/v22.22.1/')[1]!));
    return { status: 200, body, closed: new Promise<void>(resolve => body.once('close', resolve)) };
  };
}
const noNetwork: DownloadTransport = async () => { throw Error('network must not be reached'); };

test('runtime publication uses the native exclusive lock durable namespace and verified offline reuse', async t => {
  const f = setup(), children: ChildProcess[] = []; let store: ControllerStore | undefined;
  const fsync = fs.fsyncSync, synced = new Set<number>();
  try {
    const child = spawnFixture(process.execPath, [lockFixture, f.home, 'hold'], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
    assert.match(await childLine(child), /ready/);
    assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
    const closed = once(child, 'close'); child.stdin!.end('exit\n'); assert.deepEqual(await closed, [0, null]);
    store = ControllerStore.acquire(f.location);
    t.mock.method(fs, 'fsyncSync', (fd: number) => { const stat = fs.fstatSync(fd); if (stat.isDirectory()) synced.add(stat.ino); return fsync(fd); }); syncBuiltinESMExports();
    const requested = structuredClone(identity), send = await transport();
    const runtime = await ensurePrivateRuntime(store, requested, { transport: async (...args) => {
      requested.target.baseline = 'mutated-after-admission'; return send(...args);
    } });
    assert.deepEqual(runtime.identity, identity);
    const paths = runtimeStorePaths(f.home, identity);
    assert.equal(runtime.node, join(paths.directory, identity.relativeExecutable));
    assert.ok(fs.existsSync(paths.inventory)); assert.ok(fs.existsSync(paths.completion));
    if (process.platform !== 'win32') {
      for (const path of [f.home, dirname(paths.root), paths.root, paths.directory]) assert.ok(synced.has(fs.lstatSync(path).ino), `durability: ${path}`);
    }
    const before = fs.lstatSync(paths.root);
    assert.deepEqual(await ensurePrivateRuntime(store, identity, { transport: noNetwork }), runtime);
    assert.equal(fs.lstatSync(paths.root).ino, before.ino);
    assert.deepEqual(fs.readdirSync(join(f.home, 'install')).filter(n => n.startsWith('runtime-stage-')), []);
    assert.equal(fs.existsSync(join(f.home, 'install', 'controller.json')), false);
    assert.equal(fs.existsSync(join(f.home, 'releases')), false);
    store.close(); store = undefined;
    assert.ok(fs.existsSync(runtime.node), 'shared runtime survives controller closure');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); store?.close(); await stopOwnedChildren(children); f.clean(); }
});

test('runtime publication never overwrites an incomplete destination and retains its stage', async () => {
  const f = setup(), store = ControllerStore.acquire(f.location);
  try {
    const stage = await stageRuntime(store, identity, { transport: await transport() }), paths = runtimeStorePaths(f.home, identity);
    fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
    fs.writeFileSync(join(paths.root, 'sentinel'), 'incomplete entry', { mode: 0o600 });
    const before = fs.lstatSync(paths.root);
    await assert.rejects(store.publishRuntime(stage), { code: 'candidate-exists' });
    assert.equal(fs.lstatSync(paths.root).ino, before.ino);
    assert.equal(fs.readFileSync(join(paths.root, 'sentinel'), 'utf8'), 'incomplete entry');
    assert.ok(fs.existsSync(stage.directory));
    await assert.rejects(ensurePrivateRuntime(store, identity, { transport: noNetwork }), { code: 'runtime-invalid' });
    await discardRuntimeStage(stage, store);
  } finally { store.close(); f.clean(); }
});

test('runtime publication rejects stale original owners and forged or tampered stages', async () => {
  const f = setup(); let store = ControllerStore.acquire(f.location);
  try {
    const stage = await stageRuntime(store, identity, { transport: await transport() });
    await assert.rejects(store.publishRuntime({ ...stage }), /original ownership proof/);
    store.close();
    await assert.rejects(store.publishRuntime(stage), { code: 'lock-lost' });
    store = ControllerStore.acquire(f.location);
    await assert.rejects(store.publishRuntime(stage), /original ownership proof/);
    assert.equal(fs.existsSync(runtimeStorePaths(f.home, identity).root), false);
    assert.ok(fs.existsSync(stage.directory));
  } finally { store.close(); f.clean(); }
});

test('runtime publication verifies staged bytes and cannot publish a modified executable', async () => {
  const f = setup(), store = ControllerStore.acquire(f.location);
  try {
    const stage = await stageRuntime(store, identity, { transport: await transport() });
    fs.appendFileSync(join(stage.directory, 'distribution', identity.relativeExecutable), 'tamper');
    await assert.rejects(store.publishRuntime(stage), { code: 'runtime-invalid' });
    assert.equal(fs.existsSync(runtimeStorePaths(f.home, identity).root), false);
    assert.ok(fs.existsSync(stage.directory)); await discardRuntimeStage(stage, store);
  } finally { store.close(); f.clean(); }
});

test('runtime publication stage is distinct from running Node and the loaded native library', async () => {
  const f = setup(), store = ControllerStore.acquire(f.location);
  try {
    const stage = await stageRuntime(store, identity, { transport: await transport() });
    const native = fs.realpathSync(fileURLToPath(new URL('../../../out/installer/native/control.node', import.meta.url)));
    for (const executing of [fs.realpathSync(process.execPath), native]) {
      const part = relative(stage.directory, executing);
      assert.ok(part.startsWith('..') || isAbsolute(part));
      const before = fs.lstatSync(executing);
      const paths = runtimeStorePaths(f.home, identity);
      if (!fs.existsSync(paths.root)) await store.publishRuntime(stage);
      assert.equal(fs.lstatSync(executing).ino, before.ino);
      assert.equal(fs.lstatSync(executing).size, before.size);
      assert.ok(fs.lstatSync(join(paths.directory, identity.relativeExecutable)).nlink === 1);
    }
    await discardRuntimeStage(stage, store);
  } finally { store.close(); f.clean(); }
});

test('runtime publication retains verifier close uncertainty and refuses later discard', async t => {
  const f = setup(), store = ControllerStore.acquire(f.location), open = io.open, abort = new AbortController();
  let retained: FileHandle | undefined;
  try {
    const stage = await stageRuntime(store, identity, { transport: await transport() });
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      if (retained || String(args[0]) !== join(stage.directory, 'completion.json')) return file;
      retained = file;
      return new Proxy(file, { get(handle, key) {
        if (key === 'close') return async () => { abort.abort(); return new Promise<void>(() => {}); };
        const value = Reflect.get(handle, key); return typeof value === 'function' ? value.bind(handle) : value;
      } });
    }); syncBuiltinESMExports();
    await assert.rejects(store.publishRuntime(stage, abort.signal), { code: 'resource-close-uncertain' });
    assert.ok(retained); assert.equal((await retained.stat()).isFile(), true);
    await assert.rejects(discardRuntimeStage(stage, store), { code: 'resource-close-uncertain' });
    assert.ok(fs.existsSync(stage.directory)); assert.equal(fs.existsSync(runtimeStorePaths(f.home, identity).root), false);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await retained?.close(); store.close(); f.clean(); }
});
