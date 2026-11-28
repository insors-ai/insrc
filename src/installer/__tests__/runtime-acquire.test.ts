import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { syncBuiltinESMExports } from 'node:module';
import { once } from 'node:events';
import { ZipFile } from 'yazl';
import { InstallerError } from '../contracts.js';
import type { Target, RuntimeIdentity } from '../contracts.js';
import type { DownloadTransport } from '../download.js';
import { resolveInstallationLocation } from '../location.js';
import { controlBinding } from '../native.js';
import { runtimeArchive, runtimePolicy, runtimeProfile } from '../runtime-policy.js';
import { RUNTIME_LIMITS, runtimeInventoryJson } from '../runtime-metadata.js';
import { verifyRuntimeEntry, verifyRuntimeInventory } from '../runtime-store.js';
import { stageRuntime, discardRuntimeStage, assertRuntimeStage, retainUncertainRuntimeStage } from '../runtime-acquire.js';
import { extractRuntimeArchiveBytes, extractRuntimeProfile } from '../runtime-archive.js';
import { officialInputs } from './_runtime-profile-fixture.js';
import { tarHeader, tarMember } from './_archive-boundary-fixture.js';
import { ownedRuntimeHome } from './_owned-runtime-home.js';

const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'native-v1' };
function identity(target: Target): RuntimeIdentity { return { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' }; }
async function fixture() {
  const capture = await ownedRuntimeHome('ira-'), home = capture.root;
  try {
    const binding = controlBinding(); if (process.platform === 'win32') binding.protect(home);
    fs.mkdirSync(join(home, 'install'), { mode: 0o700 });
    const location = resolveInstallationLocation('runtime-stage', { home, os: target.os, ...(process.platform === 'win32' ? { userSid: binding.userSid() } : {}) });
    let held = true;
    const owner = { location, assertHeld() { assert.equal(held, true, 'original owner must remain held'); } };
    return { home, owner, capture, lose() { held = false; },
      stage(options: { transport?: DownloadTransport | undefined; signal?: AbortSignal | undefined } = {}) {
        const operation = stageRuntime(owner, identity(target), options);
        capture.trackResource(operation.then(() => {}, error => { if (error?.code === 'resource-close-uncertain') throw error; }));
        return operation;
      },
      empty() { const path = fs.mkdtempSync(join(home, 'raw-')); if (process.platform === 'win32') binding.protect(path); return path; },
      stages() { return fs.readdirSync(join(home, 'install')).filter(name => name.startsWith('runtime-stage-')); }, clean: () => capture.cleanup() };
  } catch (cause) { await capture.cleanup(); throw cause; }
}

async function officialTransport(): Promise<DownloadTransport> {
  const directory = await officialInputs();
  return async url => {
    assert.equal(url.origin, 'https://nodejs.org');
    const name = url.pathname.split('/v22.22.1/')[1]!;
    const body = fs.createReadStream(join(directory, name));
    return { status: 200, body, closed: new Promise<void>(resolve => body.once('close', resolve)) };
  };
}
test('runtime staging authenticates official assets and leaves only an owned unselected candidate', async t => {
  const f = await fixture(), transport = await officialTransport(), timeout = AbortSignal.timeout, open = io.open, clocks: number[] = [];
  let release!: () => void, reached!: () => void, physicallyClosed: (() => void) | undefined;
  const closeGate = new Promise<void>(resolve => { release = resolve; }), atClose = new Promise<void>(resolve => { reached = resolve; });
  let metadataClosed = false, operation: ReturnType<typeof f.stage> | undefined;
  try {
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      if (!String(args[0]).endsWith(`${sep}candidate${sep}completion.json`) || !(Number(args[1]) & fs.constants.O_WRONLY)) return file;
      f.capture.trackResource(new Promise<void>(resolve => { physicallyClosed = resolve; }));
      return new Proxy(file, { get(handle, key) {
        if (key === 'close') return async () => { reached(); await closeGate; await handle.close(); metadataClosed = true; physicallyClosed!(); };
        const value = Reflect.get(handle, key); return typeof value === 'function' ? value.bind(handle) : value;
      } });
    }); syncBuiltinESMExports();
    t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
      clocks.push(milliseconds);
      if (milliseconds === RUNTIME_LIMITS.verificationMs) {
        assert.equal(metadataClosed, true, 'source verification requires the actual final writer close');
        const stages = f.stages(); assert.equal(stages.length, 1);
        assert.ok(fs.existsSync(join(f.home, 'install', stages[0]!, 'candidate', 'completion.json')), 'read-only verification follows completed durable extraction');
      }
      return timeout.call(AbortSignal, milliseconds);
    });
    operation = f.stage({ transport }); let returned = false; void operation.then(() => { returned = true; }, () => {});
    await Promise.race([atClose, operation.then(() => { throw Error('Final metadata close barrier was not observed'); })]);
    assert.equal(returned, false); assert.equal(metadataClosed, false); assert.deepEqual(clocks, [RUNTIME_LIMITS.networkMs]);
    release(); const stage = await operation;
    assert.deepEqual(clocks, [RUNTIME_LIMITS.networkMs, RUNTIME_LIMITS.verificationMs]); t.mock.restoreAll(); syncBuiltinESMExports();
    await verifyRuntimeEntry(stage.directory, identity(target), undefined, 'source-stage');
    await assert.rejects(verifyRuntimeEntry(stage.directory, identity(target)), { code: 'runtime-invalid', message: 'Runtime root mode differs from published protection' });
    assert.equal(fs.statSync(stage.directory).mode & 0o777, 0o700); assert.equal(fs.statSync(join(stage.directory, 'inventory.json')).mode & 0o777, 0o600);
    assertRuntimeStage(stage, f.owner); assert.ok(Object.isFrozen(stage)); assert.ok(Object.isFrozen(stage.identity.target));
    const inventory = fs.readFileSync(join(stage.directory, 'inventory.json'));
    assert.equal(verifyRuntimeInventory(inventory, runtimeProfile(target)).length, runtimeProfile(target).entries);
    assert.equal(fs.existsSync(join(f.home, 'runtimes')), false); assert.equal(fs.existsSync(join(f.home, 'releases')), false);
    assert.equal(fs.existsSync(join(f.home, 'install', 'controller.json')), false);
    assert.throws(() => assertRuntimeStage({ ...stage }, f.owner), /original ownership proof/);
    await discardRuntimeStage(stage, f.owner); assert.deepEqual(f.stages(), []);
  } finally { release(); await operation?.catch(() => {}); t.mock.restoreAll(); syncBuiltinESMExports(); await f.clean(); }
});
test('runtime download rejects HTTP redirects sizes and digest failures before extracting code', async () => {
  const f = await fixture();
  try {
    for (const mode of ['status', 'http-redirect', 'short', 'wrong-digest']) {
      let closed = false;
      const transport: DownloadTransport = async () => {
        const body = Readable.from(mode === 'wrong-digest' ? [Buffer.alloc(runtimeProfile(target).archiveBytes)] : [Buffer.from('bad')]);
        body.once('close', () => { closed = true; });
        return { status: mode === 'status' ? 404 : mode === 'http-redirect' ? 302 : 200,
          ...(mode === 'http-redirect' ? { location: 'http://fixture.invalid/forbidden' } : {}), body,
          closed: new Promise<void>(resolve => body.once('close', resolve)) };
      };
      await assert.rejects(f.stage({ transport }));
      assert.equal(closed, true); assert.deepEqual(f.stages(), []); assert.equal(fs.existsSync(join(f.home, 'runtimes')), false);
    }
  } finally { await f.clean(); }
});
test('runtime download deadline expires before extraction and closes input before cleanup', async t => {
  const f = await fixture(), timeout = AbortSignal.timeout, unlink = io.unlink;
  let entered = false, positive = false, expired: AbortSignal | undefined;
  // Shorten only the clock, keeping production deadline creation and propagation.
  // A real network socket would keep the loop alive while the body stalls.
  const keepAlive = setInterval(() => {}, 1_000);
  try {
    t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
      assert.equal(milliseconds, RUNTIME_LIMITS.networkMs);
      expired = timeout.call(AbortSignal, 1_000); return expired;
    });
    const transport: DownloadTransport = async (_url, signal) => {
      entered = true; assert.equal(signal, expired);
      const body = new Readable({ read() {} });
      const closed = new Promise<void>(resolve => body.once('close', () => { positive = true; resolve(); }));
      return { status: 200, body, closed };
    };
    t.mock.method(io, 'unlink', async (...args: Parameters<typeof unlink>) => {
      assert.equal(positive, true);
      const work = dirname(String(args[0]));
      assert.deepEqual(fs.readdirSync(join(work, 'candidate')), [], 'deadline must reject before extraction');
      return unlink(...args);
    });
    syncBuiltinESMExports();
    await assert.rejects(f.stage({ transport }), (error: unknown) => {
      assert.ok(error instanceof Error); assert.equal(error.name, 'AbortError');
      assert.ok(error.cause instanceof DOMException); assert.equal(error.cause.name, 'TimeoutError'); return true;
    });
    assert.equal(entered, true); assert.equal(expired?.aborted, true); assert.equal(positive, true);
    assert.deepEqual(f.stages(), []); assert.equal(fs.existsSync(join(f.home, 'runtimes')), false);
  } finally { clearInterval(keepAlive); t.mock.restoreAll(); syncBuiltinESMExports(); await f.clean(); }
});
test('runtime acquisition deadline during extraction closes output before owned cleanup', async t => {
  const f = await fixture(), transport = await officialTransport(), deadline = new AbortController(), open = io.open, unlink = io.unlink;
  const reason = new DOMException('Acquisition deadline expired', 'TimeoutError');
  let downloaded = false, armed = false, closed = false;
  try {
    t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
      assert.equal(milliseconds, RUNTIME_LIMITS.networkMs); return deadline.signal;
    });
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      if (armed || !String(args[0]).includes(`${sep}candidate${sep}distribution${sep}`)) return file;
      armed = true; assert.equal(downloaded, true);
      return new Proxy(file, { get(handle, key) {
        if (key === 'write') return async (...values: unknown[]) => {
          const result = await Reflect.apply(handle.write, handle, values); deadline.abort(reason); return result;
        };
        if (key === 'close') return async () => { await handle.close(); closed = true; };
        const value = Reflect.get(handle, key); return typeof value === 'function' ? value.bind(handle) : value;
      } });
    });
    t.mock.method(io, 'unlink', async (...args: Parameters<typeof unlink>) => { assert.equal(closed, true); return unlink(...args); });
    syncBuiltinESMExports();
    await assert.rejects(f.stage({ transport: async (...args) => {
      const response = await transport(...args);
      response.body.once('end', () => { downloaded = true; }); return response;
    } }), (error: unknown) => { assert.equal(error, reason); return true; });
    assert.equal(armed, true); assert.equal(closed, true); assert.deepEqual(f.stages(), []);
    assert.equal(fs.existsSync(join(f.home, 'runtimes')), false);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.clean(); }
});
test('runtime cancellation waits for output closure before owned stage cleanup', async t => {
  const f = await fixture(), transport = await officialTransport(), abort = new AbortController(), open = io.open, unlink = io.unlink;
  let positive = false, armed = false;
  try {
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      if (armed || !String(args[0]).includes(`${sep}candidate${sep}distribution${sep}`)) return file;
      armed = true;
      return new Proxy(file, { get(handle, key) {
        if (key === 'write') return async (...values: unknown[]) => { const result = await Reflect.apply(handle.write, handle, values); abort.abort(Error('runtime extraction cancelled')); return result; };
        if (key === 'close') return async () => { await handle.close(); positive = true; };
        const value = Reflect.get(handle, key); return typeof value === 'function' ? value.bind(handle) : value;
      } });
    });
    t.mock.method(io, 'unlink', async (...args: Parameters<typeof unlink>) => { assert.equal(positive, true); return unlink(...args); });
    syncBuiltinESMExports();
    await assert.rejects(f.stage({ transport, signal: abort.signal }), /cancelled/);
    assert.equal(armed, true); assert.equal(positive, true); assert.deepEqual(f.stages(), []);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.clean(); }
});
test('runtime download cancellation waits for the actual input stream close before cleanup', async t => {
  const f = await fixture(), directory = await officialInputs(), abort = new AbortController(), unlink = io.unlink;
  let positive = false, body: fs.ReadStream | undefined, closed: Promise<void> | undefined;
  try {
    const transport: DownloadTransport = async url => {
      body = fs.createReadStream(join(directory, url.pathname.split('/v22.22.1/')[1]!), { highWaterMark: 16384 });
      closed = new Promise<void>(resolve => body!.once('close', () => { positive = true; resolve(); }));
      body.once('data', () => abort.abort(Error('download cancelled')));
      return { status: 200, body, closed };
    };
    t.mock.method(io, 'unlink', async (...args: Parameters<typeof unlink>) => { assert.equal(positive, true); return unlink(...args); }); syncBuiltinESMExports();
    await assert.rejects(f.stage({ transport, signal: abort.signal }));
    assert.equal(positive, true); assert.deepEqual(f.stages(), []);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); body?.destroy(); await closed; await f.clean(); }
});
test('unresponsive runtime transport returns bounded uncertainty and retains its stage', async t => {
  const f = await fixture(), abort = new AbortController(); let entered!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  try {
    // Deliberately no real network handle: this fixture never acknowledges abort.
    const transport: DownloadTransport = async () => { entered(); return new Promise(() => {}); };
    const operation = f.stage({ transport, signal: abort.signal });
    const rejected = assert.rejects(operation, { code: 'resource-close-uncertain' });
    await reached; abort.abort(); await rejected; assert.equal(f.stages().length, 1);
    assert.equal(fs.existsSync(join(f.home, 'runtimes')), false);
  } finally { await assert.rejects(f.clean(), { code: 'fixture-cleanup-uncertain' }); t.diagnostic(`Retained unconfirmed transport fixture: ${f.home}`); }
});
test('runtime close uncertainty retains the stage even when cancellation also occurs', async t => {
  const f = await fixture(), transport = await officialTransport(), abort = new AbortController(), open = io.open;
  let retained: FileHandle | undefined, closed: (() => void) | undefined;
  try {
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      if (retained || !String(args[0]).includes(`${sep}candidate${sep}distribution${sep}`)) return file;
      retained = file; f.capture.trackResource(new Promise<void>(resolve => { closed = resolve; }));
      return new Proxy(file, { get(handle, key) {
        if (key === 'close') return async () => { abort.abort(); throw new InstallerError('resource-close-uncertain', 'fixture output remains open'); };
        const value = Reflect.get(handle, key); return typeof value === 'function' ? value.bind(handle) : value;
      } });
    });
    syncBuiltinESMExports();
    await assert.rejects(stageRuntime(f.owner, identity(target), { transport, signal: abort.signal }), { code: 'resource-close-uncertain' });
    assert.ok(retained); assert.equal((await retained.stat()).isFile(), true); assert.equal(f.stages().length, 1);
  } catch (cause) { f.capture.retain(cause); throw cause; }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); try { await retained?.close(); closed?.(); } catch (cause) { f.capture.retain(cause); throw cause; } finally { await f.clean(); } }
});
test('Windows archive profiles require exact separate headers and architecture libraries', async () => {
  const f = await fixture(), directory = await officialInputs(), windows: Target = { os: 'win32', arch: 'x64', baseline: 'native-v1' };
  try {
    const archive = join(directory, 'node-v22.22.1-win-x64.zip'), headers = join(directory, 'node-v22.22.1-headers.tar.gz'), library = join(directory, 'win-x64/node.lib');
    await assert.rejects(extractRuntimeProfile({ archive }, f.empty(), identity(windows), AbortSignal.timeout(60_000)), /headers.*library/);
    await assert.rejects(extractRuntimeProfile({ archive, headers, library: join(directory, 'win-arm64/node.lib') }, f.empty(), identity(windows), AbortSignal.timeout(60_000)), /digest|file/);
    const root = f.empty(); await extractRuntimeProfile({ archive, headers, library }, root, identity(windows), AbortSignal.timeout(60_000));
    assert.equal(verifyRuntimeInventory(fs.readFileSync(join(root, 'inventory.json')), runtimeProfile(windows)).length, runtimeProfile(windows).entries);
    assert.ok(fs.existsSync(join(root, 'distribution', 'x64', 'node.lib')));
    // Parsing foreign archive bytes is not Windows native installation evidence.
  } finally { await f.clean(); }
});
test('runtime gzip and ZIP parsers reject unsafe collisions links special entries and incomplete profiles', async () => {
  const f = await fixture(), posixTarget: Target = { os: 'linux', arch: 'arm64', baseline: 'native-v1' };
  const root = runtimeArchive(posixTarget).root, data = Buffer.from('unqualified fixture');
  const member = (name: string, options = {}) => tarMember(tarHeader(name, data, options), data);
  try {
    for (const members of [
      [member('../escape')], [member(`${root}/bin/node`), member(`${root}/bin/node`)],
      [member(`${root}/bin/node`), member(`${root}/BIN/other`)],
      [tarMember(tarHeader(`${root}/bin/node`, Buffer.alloc(0), { type: '2', link: 'outside' }), Buffer.alloc(0))],
      [tarMember(tarHeader(`${root}/device`, Buffer.alloc(0), { type: '3' }), Buffer.alloc(0))],
    ]) {
      await assert.rejects(extractRuntimeArchiveBytes(gzipSync(Buffer.concat([...members, Buffer.alloc(1024)])), f.empty(), posixTarget, AbortSignal.timeout(60_000)));
    }
    const partial = await extractRuntimeArchiveBytes(gzipSync(Buffer.concat([member(`${root}/bin/node`), Buffer.alloc(1024)])), f.empty(), posixTarget, AbortSignal.timeout(60_000));
    assert.throws(() => verifyRuntimeInventory(Buffer.from(runtimeInventoryJson(partial)), runtimeProfile(posixTarget)), /independent pinned/);
    const windows: Target = { os: 'win32', arch: 'x64', baseline: 'native-v1' }, zipRoot = runtimeArchive(windows).root;
    for (const names of [[`${zipRoot}/node.exe`, `${zipRoot}/node.exe`], [`${zipRoot}/node_modules/npm/x`, `${zipRoot}/NODE_MODULES/npm/y`]]) {
      const zip = new ZipFile(), chunks: Buffer[] = [], ended = once(zip.outputStream, 'end'); zip.outputStream.on('data', (b: Buffer) => chunks.push(b));
      for (const name of names) zip.addBuffer(data, name); zip.end(); await ended;
      await assert.rejects(extractRuntimeArchiveBytes(Buffer.concat(chunks), f.empty(), windows, AbortSignal.timeout(60_000)));
    }
    assert.equal(fs.existsSync(join(f.home, 'escape')), false);
  } finally { await f.clean(); }
});

test('runtime discard restores protected directories only under its original closed stage capability', async () => {
  const f = await fixture();
  try {
    const stage = await f.stage({ transport: await officialTransport() });
    function protect(path: string) {
      const stat = fs.lstatSync(path);
      if (stat.isDirectory()) { for (const name of fs.readdirSync(path)) protect(join(path, name)); fs.chmodSync(path, 0o500); }
      else fs.chmodSync(path, stat.mode & 0o777 & ~0o222);
    }
    protect(stage.directory);
    await verifyRuntimeEntry(stage.directory, identity(target), undefined, 'published');
    await assert.rejects(discardRuntimeStage({ ...stage }, f.owner), { code: 'runtime-invalid' });
    await assert.rejects(discardRuntimeStage(stage, { ...f.owner }), { code: 'runtime-invalid' });
    assert.equal(fs.statSync(stage.directory).mode & 0o777, 0o500);
    await discardRuntimeStage(stage, f.owner); assert.deepEqual(f.stages(), []);
    assert.equal(fs.existsSync(join(f.home, 'runtimes')), false);
  } finally { await f.clean(); }
});

test('runtime discard retains a linked stage without chmodding an external runtime', async () => {
  const f = await fixture(), external = await ownedRuntimeHome();
  try {
    const marker = join(external.root, 'marker'); fs.writeFileSync(marker, 'not a staging root', { mode: 0o400 }); fs.chmodSync(external.root, 0o500);
    const before = fs.lstatSync(marker), rootBefore = fs.lstatSync(external.root);
    const stage = await f.stage({ transport: await officialTransport() }), alias = join(stage.directory, 'external-runtime');
    fs.symlinkSync(external.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    f.capture.allowFixtureSymlink(alias); // Test teardown may unlink this known link, never its target.
    await assert.rejects(discardRuntimeStage(stage, f.owner), { code: 'resource-close-uncertain' });
    await assert.rejects(discardRuntimeStage(stage, f.owner), { code: 'resource-close-uncertain' });
    assert.equal(fs.lstatSync(marker).mode, before.mode); assert.equal(fs.lstatSync(external.root).mode, rootBefore.mode);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'not a staging root'); assert.ok(fs.existsSync(stage.directory));
  } finally { try { await f.clean(); } finally { await external.cleanup(); } }
});

test('runtime discard retains protected data if the original owner is lost after admission', async t => {
  const f = await fixture(), lstat = io.lstat;
  try {
    const stage = await f.stage({ transport: await officialTransport() }); fs.chmodSync(stage.directory, 0o500);
    t.mock.method(io, 'lstat', async (...args: Parameters<typeof lstat>) => {
      const stat = await lstat(...args); if (String(args[0]) === stage.workDirectory) f.lose(); return stat;
    }); syncBuiltinESMExports();
    await assert.rejects(discardRuntimeStage(stage, f.owner), { code: 'resource-close-uncertain' });
    assert.equal(fs.statSync(stage.directory).mode & 0o777, 0o500); assert.ok(fs.existsSync(join(stage.directory, 'completion.json')));
    await assert.rejects(discardRuntimeStage(stage, f.owner), { code: 'resource-close-uncertain' });
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.clean(); }
});

test('runtime discard retains a stage marked uncertain after cleanup admission', async t => {
  const f = await fixture(), lstat = io.lstat;
  try {
    const stage = await f.stage({ transport: await officialTransport() }); fs.chmodSync(stage.directory, 0o500);
    t.mock.method(io, 'lstat', async (...args: Parameters<typeof lstat>) => {
      const stat = await lstat(...args);
      if (String(args[0]) === stage.workDirectory) retainUncertainRuntimeStage(stage, f.owner);
      return stat;
    }); syncBuiltinESMExports();
    await assert.rejects(discardRuntimeStage(stage, f.owner), { code: 'resource-close-uncertain' });
    assert.equal(fs.statSync(stage.directory).mode & 0o777, 0o500); assert.ok(fs.existsSync(join(stage.directory, 'completion.json')));
    await assert.rejects(discardRuntimeStage(stage, f.owner), { code: 'resource-close-uncertain' });
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.clean(); }
});
