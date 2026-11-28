import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import type { Target, RuntimeIdentity } from '../contracts.js';
import type { DownloadTransport } from '../download.js';
import { ControllerStore } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { controlBinding } from '../native.js';
import { privateRuntimePaths, runtimeArchive, runtimeStorePaths } from '../runtime-policy.js';
import { stageRuntime, discardRuntimeStage } from '../runtime-acquire.js';
import { ensurePrivateRuntime } from '../runtime-install.js';
import { InstallerError } from '../contracts.js';
import { verifyRuntimeEntry } from '../runtime-store.js';
import { officialInputs } from './_runtime-profile-fixture.js';
import { ownedRuntimeHome } from './_owned-runtime-home.js';
import { childLine, spawnFixture } from '../../daemon/tools/__tests__/_proc.js';

const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'native-v1' };
const identity: RuntimeIdentity = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
const lockFixture = fileURLToPath(new URL('./control-fixture.mjs', import.meta.url));
async function setup() {
  const capture = await ownedRuntimeHome('irp-'), home = capture.root;
  try {
    if (process.platform === 'win32') controlBinding().protect(home);
    return { home, capture, location: resolveInstallationLocation('fixture', { home, ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) }), clean: () => capture.cleanup() };
  } catch (cause) { await capture.cleanup(); throw cause; }
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
  const f = await setup(); let store: ControllerStore | undefined;
  const fsync = fs.fsyncSync, stat = fs.lstatSync, synced = new Set<number>();
  let beforePublish: fs.Stats | undefined;
  try {
    const child = f.capture.trackChild(spawnFixture(process.execPath, [lockFixture, f.home, 'hold'], { stdio: ['pipe', 'pipe', 'pipe'] }));
    assert.match(await childLine(child), /ready/);
    assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
    const closed = once(child, 'close'); child.stdin!.end('exit\n'); assert.deepEqual(await closed, [0, null]);
    store = ControllerStore.acquire(f.location);
    t.mock.method(fs, 'lstatSync', (...args: Parameters<typeof stat>) => {
      const value = stat(...args);
      const path = String(args[0]);
      if (process.platform !== 'win32' && path.endsWith('/candidate') && fs.existsSync(join(path, 'completion.json'))
        && (stat(join(path, 'completion.json')).mode & 0o777) === 0o400) {
        assert.equal(Number(value.mode) & 0o7777, 0o700);
        const inventory = JSON.parse(fs.readFileSync(join(path, 'inventory.json'), 'utf8')) as { files: { path: string; mode: number }[] };
        for (const item of inventory.files) assert.equal(stat(join(path, 'distribution', item.path)).mode & 0o7777, item.mode & ~0o222);
        const visit = (directory: string) => {
          for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) {
            const child = join(directory, entry.name); assert.equal(stat(child).mode & 0o7777, 0o500); visit(child);
          }
        };
        visit(path); beforePublish = value as fs.Stats;
      }
      return value;
    });
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
      assert.ok(beforePublish); assert.equal(fs.lstatSync(paths.root).ino, beforePublish.ino);
      assert.equal(fs.lstatSync(paths.root).mode & 0o7777, 0o500);
      assert.notEqual(dirname(paths.root), join(f.home, 'install'));
      assert.notEqual(process.getuid?.(), 0, 'permission-denial evidence requires an ordinary user');
      assert.throws(() => fs.appendFileSync(runtime.node, 'forbidden'), { code: 'EACCES' });
      assert.throws(() => fs.writeFileSync(join(paths.root, 'forbidden'), 'forbidden'), { code: 'EACCES' });
      for (const path of [f.home, dirname(paths.root), paths.root, paths.directory]) assert.ok(synced.has(fs.lstatSync(path).ino), `durability: ${path}`);
    }
    const before = fs.lstatSync(paths.root);
    if (process.platform !== 'win32') {
      await assert.rejects(store.finalizeRuntime(identity), {
        code: 'runtime-invalid', message: 'Runtime finalization requires the exact root0700 permission-transition state',
      });
      assert.equal(fs.lstatSync(paths.root).ctimeMs, before.ctimeMs, 'sealed reuse is not another permission transition');
    }
    assert.deepEqual(await ensurePrivateRuntime(store, identity, { transport: noNetwork }), runtime);
    assert.equal(fs.lstatSync(paths.root).ino, before.ino);
    assert.deepEqual(fs.readdirSync(join(f.home, 'install')).filter(n => n.startsWith('runtime-stage-')), []);
    assert.equal(fs.existsSync(join(f.home, 'install', 'controller.json')), false);
    assert.equal(fs.existsSync(join(f.home, 'releases')), false);
    store.close(); store = undefined;
    assert.ok(fs.existsSync(runtime.node), 'shared runtime survives controller closure');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); store?.close(); await f.clean(); }
});

test('runtime root-only interrupted native publication is retained and finalized offline by a later controller', { skip: process.platform === 'win32' ? 'Windows native qualification is deferred' : false }, async t => {
  const f = await setup(), open = io.open; let store: ControllerStore | undefined;
  const paths = runtimeStorePaths(f.home, identity);
  try {
    store = ControllerStore.acquire(f.location);
    const stage = await stageRuntime(store, identity, { transport: await transport() }), before = fs.lstatSync(stage.directory);
    let injected = false;
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      if (!injected && String(args[0]) === paths.root && fs.existsSync(paths.root)) {
        injected = true; assert.equal(fs.lstatSync(paths.root).ino, before.ino);
        throw Error('injected after actual native rename before root seal');
      }
      return open(...args);
    }); syncBuiltinESMExports();
    await assert.rejects(store.publishRuntime(stage), { code: 'resource-close-uncertain' });
    assert.equal(injected, true); assert.equal(fs.existsSync(stage.directory), false);
    assert.ok(fs.existsSync(stage.workDirectory));
    await assert.rejects(discardRuntimeStage(stage, store), { code: 'resource-close-uncertain' });
    t.mock.restoreAll(); syncBuiltinESMExports();
    assert.equal(fs.lstatSync(paths.root).mode & 0o7777, 0o700);
    await verifyRuntimeEntry(paths.root, identity, undefined, 'permission-transition');
    await assert.rejects(privateRuntimePaths(f.location, identity), {
      code: 'runtime-invalid', message: `Shared Node runtime publication is unfinished at "${paths.root}". Re-run the authenticated installer to verify and finish protecting the entry; no bytes will be replaced.`,
    });
    store.close(); store = ControllerStore.acquire(f.location);
    const changed: string[] = [];
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      return new Proxy(handle, { get(file, key) {
        if (key === 'chmod') return async (value: number) => { changed.push(String(args[0])); return file.chmod(value); };
        const value = Reflect.get(file, key); return typeof value === 'function' ? value.bind(file) : value;
      } });
    }); syncBuiltinESMExports();
    const runtime = await ensurePrivateRuntime(store, identity, { transport: noNetwork });
    assert.equal(runtime.node, join(paths.directory, identity.relativeExecutable));
    assert.deepEqual(changed, [paths.root]);
    assert.equal(fs.lstatSync(paths.root).ino, before.ino);
    assert.equal(fs.lstatSync(paths.root).mode & 0o7777, 0o500);
    await verifyRuntimeEntry(paths.root, identity);
    assert.ok(fs.existsSync(stage.workDirectory), 'a later owner never adopts the uncertain original stage');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); store?.close(); await f.clean(); }
});

test('runtime publication retains a root sealed before failing final durability and never reports success', { skip: process.platform === 'win32' ? 'Windows native qualification is deferred' : false }, async t => {
  const f = await setup(), open = io.open; let store: ControllerStore | undefined;
  const paths = runtimeStorePaths(f.home, identity);
  try {
    store = ControllerStore.acquire(f.location);
    const stage = await stageRuntime(store, identity, { transport: await transport() }), before = fs.lstatSync(stage.directory);
    let injected = false, closed = false;
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      if (String(args[0]) !== paths.root) return handle;
      return new Proxy(handle, { get(file, key) {
        if (key === 'sync') return async () => { injected = true; assert.equal(fs.lstatSync(paths.root).mode & 0o7777, 0o500); throw Error('injected after root chmod before fsync'); };
        if (key === 'close') return async () => { await file.close(); closed = true; };
        const value = Reflect.get(file, key); return typeof value === 'function' ? value.bind(file) : value;
      } });
    }); syncBuiltinESMExports();
    await assert.rejects(store.publishRuntime(stage), { code: 'resource-close-uncertain' });
    assert.equal(injected, true); assert.equal(closed, true);
    assert.equal(fs.lstatSync(paths.root).ino, before.ino);
    assert.ok(fs.existsSync(stage.workDirectory));
    await assert.rejects(discardRuntimeStage(stage, store), { code: 'resource-close-uncertain' });
    t.mock.restoreAll(); syncBuiltinESMExports();
    await verifyRuntimeEntry(paths.root, identity);
    const fsync = fs.fsyncSync;
    t.mock.method(fs, 'fsyncSync', (fd: number) => {
      if (fs.fstatSync(fd).ino === before.ino) throw Error('injected sealed-entry reuse durability failure');
      return fsync(fd);
    }); syncBuiltinESMExports();
    await assert.rejects(ensurePrivateRuntime(store, identity, { transport: noNetwork }), {
      code: 'resource-close-uncertain', message: 'Shared Node runtime namespace durability is uncertain; retain the canonical entry',
    });
    assert.equal(fs.lstatSync(paths.root).ino, before.ino); assert.ok(fs.existsSync(stage.workDirectory));
    t.mock.restoreAll(); syncBuiltinESMExports(); store.close(); store = ControllerStore.acquire(f.location);
    const synced = new Set<number>(), sealed = fs.lstatSync(paths.root);
    t.mock.method(fs, 'fsyncSync', (fd: number) => { synced.add(fs.fstatSync(fd).ino); return fsync(fd); }); syncBuiltinESMExports();
    assert.equal((await ensurePrivateRuntime(store, identity, { transport: noNetwork })).node, join(paths.directory, identity.relativeExecutable));
    for (let path = paths.root; ; path = dirname(path)) {
      assert.ok(synced.has(fs.lstatSync(path).ino), `recovered durability: ${path}`);
      if (path === f.home) break;
    }
    assert.equal(fs.lstatSync(paths.root).ctimeMs, sealed.ctimeMs);
    assert.equal(fs.lstatSync(paths.root).ino, before.ino);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); store?.close(); await f.clean(); }
});

test('runtime install rejects old unsealed and mixed canonical layouts without repair or network', { skip: process.platform === 'win32' ? 'Windows native qualification is deferred' : false }, async () => {
  const f = await setup(); let store: ControllerStore | undefined;
  const paths = runtimeStorePaths(f.home, identity);
  try {
    store = ControllerStore.acquire(f.location);
    const stage = await stageRuntime(store, identity, { transport: await transport() });
    for (const path of [join(f.home, 'runtimes'), join(f.home, 'runtimes', identity.version), dirname(paths.root)]) fs.mkdirSync(path, { mode: 0o700 });
    fs.renameSync(stage.directory, paths.root);
    await verifyRuntimeEntry(paths.root, identity, undefined, 'source-stage');
    for (let path = paths.root; ; path = dirname(path)) {
      assert.equal(fs.lstatSync(path).mode & 0o7777, 0o700, path);
      if (path === f.home) break;
    }
    const before = fs.lstatSync(paths.root), completion = fs.readFileSync(paths.completion);
    await assert.rejects(ensurePrivateRuntime(store, identity, { transport: noNetwork }), {
      code: 'runtime-invalid', message: `Shared Node runtime protection layout is unsupported at "${paths.root}". This unpublished development home must be rebuilt in a new isolated home; no conversion or repair was attempted.`,
    });
    fs.chmodSync(paths.completion, 0o400);
    await assert.rejects(ensurePrivateRuntime(store, identity, { transport: noNetwork }), (error: unknown) => {
      assert.ok(error instanceof InstallerError); assert.equal(error.code, 'runtime-invalid'); assert.match(error.message, /^Shared Node runtime verification failed at /); return true;
    });
    assert.equal(fs.lstatSync(paths.root).ino, before.ino);
    assert.equal(fs.lstatSync(paths.directory).mode & 0o7777, 0o700);
    assert.deepEqual(fs.readFileSync(paths.completion), completion);
    await discardRuntimeStage(stage, store);
  } finally { store?.close(); await f.clean(); }
});

test('runtime publication retains postpublication root close uncertainty until its captured descriptor closes', { skip: process.platform === 'win32' ? 'Windows native qualification is deferred' : false }, async t => {
  const f = await setup(), open = io.open, abort = new AbortController();
  const paths = runtimeStorePaths(f.home, identity);
  let store: ControllerStore | undefined, retained: FileHandle | undefined, closed: (() => void) | undefined;
  try {
    store = ControllerStore.acquire(f.location);
    const stage = await stageRuntime(store, identity, { transport: await transport() });
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      if (retained || String(args[0]) !== paths.root) return handle;
      retained = handle; f.capture.trackResource(new Promise<void>(resolve => { closed = resolve; }));
      return new Proxy(handle, { get(file, key) {
        if (key === 'close') return async () => { abort.abort(); return new Promise<void>(() => {}); };
        const value = Reflect.get(file, key); return typeof value === 'function' ? value.bind(file) : value;
      } });
    }); syncBuiltinESMExports();
    await assert.rejects(store.publishRuntime(stage, abort.signal), { code: 'resource-close-uncertain' });
    assert.ok(retained); assert.equal((await retained.stat()).ino, fs.lstatSync(paths.root).ino);
    assert.equal(fs.lstatSync(paths.root).mode & 0o7777, 0o500);
    assert.ok(fs.existsSync(stage.workDirectory));
    await assert.rejects(discardRuntimeStage(stage, store), { code: 'resource-close-uncertain' });
    assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    try { await retained?.close(); closed?.(); } catch (cause) { f.capture.retain(cause); throw cause; }
    finally { store?.close(); await f.clean(); }
  }
});

test('runtime canonical stat failures are actionable coded errors and never trigger download or mutation', async t => {
  const f = await setup(), stat = io.lstat; let store: ControllerStore | undefined;
  const paths = runtimeStorePaths(f.home, identity); let requests = 0;
  try {
    store = ControllerStore.acquire(f.location);
    t.mock.method(io, 'lstat', async (...args: Parameters<typeof stat>) => {
      if (String(args[0]) === paths.root) throw Object.assign(Error('injected denied canonical stat'), { code: 'EACCES' });
      return stat(...args);
    }); syncBuiltinESMExports();
    await assert.rejects(ensurePrivateRuntime(store, identity, { transport: async () => { requests++; throw Error('unexpected network'); } }), (error: unknown) => {
      assert.ok(error instanceof InstallerError); assert.equal(error.code, 'runtime-invalid');
      assert.equal(error.message, `Cannot inspect shared Node runtime at "${paths.root}"; retain the entry and request operator assistance`);
      assert.equal((error.cause as NodeJS.ErrnoException).code, 'EACCES'); return true;
    });
    assert.equal(requests, 0); assert.equal(fs.existsSync(join(f.home, 'runtimes')), false);
    assert.deepEqual(fs.readdirSync(join(f.home, 'install')).filter(n => n.startsWith('runtime-stage-')), []);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); store?.close(); await f.clean(); }
});

test('runtime publication never overwrites an incomplete destination and retains its stage', async () => {
  const f = await setup(); let store: ControllerStore | undefined;
  try {
    store = ControllerStore.acquire(f.location);
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
  } finally { store?.close(); await f.clean(); }
});

test('runtime publication rejects stale original owners and forged or tampered stages', async () => {
  const f = await setup(); let store: ControllerStore | undefined;
  try {
    store = ControllerStore.acquire(f.location);
    const stage = await stageRuntime(store, identity, { transport: await transport() });
    await assert.rejects(store.publishRuntime({ ...stage }), /original ownership proof/);
    store.close();
    await assert.rejects(store.publishRuntime(stage), { code: 'lock-lost' });
    store = ControllerStore.acquire(f.location);
    await assert.rejects(store.publishRuntime(stage), /original ownership proof/);
    assert.equal(fs.existsSync(runtimeStorePaths(f.home, identity).root), false);
    assert.ok(fs.existsSync(stage.directory));
  } finally { store?.close(); await f.clean(); }
});

test('runtime publication verifies staged bytes and cannot publish a modified executable', async () => {
  const f = await setup(); let store: ControllerStore | undefined;
  try {
    store = ControllerStore.acquire(f.location);
    const stage = await stageRuntime(store, identity, { transport: await transport() });
    fs.appendFileSync(join(stage.directory, 'distribution', identity.relativeExecutable), 'tamper');
    await assert.rejects(store.publishRuntime(stage), { code: 'runtime-invalid' });
    assert.equal(fs.existsSync(runtimeStorePaths(f.home, identity).root), false);
    assert.ok(fs.existsSync(stage.directory)); await discardRuntimeStage(stage, store);
  } finally { store?.close(); await f.clean(); }
});

test('runtime publication stage is distinct from running Node and the loaded native library', async () => {
  const f = await setup(); let store: ControllerStore | undefined;
  try {
    store = ControllerStore.acquire(f.location);
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
  } finally { store?.close(); await f.clean(); }
});

test('runtime publication retains verifier close uncertainty and refuses later discard', async t => {
  const f = await setup(), open = io.open, abort = new AbortController();
  let store: ControllerStore | undefined, retained: FileHandle | undefined, closed: (() => void) | undefined;
  try {
    store = ControllerStore.acquire(f.location);
    const stage = await stageRuntime(store, identity, { transport: await transport() });
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      if (retained || String(args[0]) !== join(stage.directory, 'completion.json')) return file;
      retained = file; f.capture.trackResource(new Promise<void>(resolve => { closed = resolve; }));
      return new Proxy(file, { get(handle, key) {
        if (key === 'close') return async () => { abort.abort(); return new Promise<void>(() => {}); };
        const value = Reflect.get(handle, key); return typeof value === 'function' ? value.bind(handle) : value;
      } });
    }); syncBuiltinESMExports();
    await assert.rejects(store.publishRuntime(stage, abort.signal), { code: 'resource-close-uncertain' });
    assert.ok(retained); assert.equal((await retained.stat()).isFile(), true);
    await assert.rejects(discardRuntimeStage(stage, store), { code: 'resource-close-uncertain' });
    assert.ok(fs.existsSync(stage.directory)); assert.equal(fs.existsSync(runtimeStorePaths(f.home, identity).root), false);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); try { await retained?.close(); closed?.(); } catch (cause) { f.capture.retain(cause); throw cause; } finally { store?.close(); await f.clean(); } }
});
