import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
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
import { runtimeInventoryJson } from '../runtime-metadata.js';
import { verifyRuntimeInventory } from '../runtime-store.js';
import { stageRuntime, discardRuntimeStage, assertRuntimeStage } from '../runtime-acquire.js';
import { extractRuntimeArchiveBytes, extractRuntimeProfile } from '../runtime-archive.js';
import { officialInputs } from './_runtime-profile-fixture.js';
import { tarHeader, tarMember } from './_archive-boundary-fixture.js';

const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'native-v1' };
function identity(target: Target): RuntimeIdentity { return { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' }; }
function fixture() {
  const home = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'ira-')), binding = controlBinding();
  if (process.platform === 'win32') binding.protect(home);
  fs.mkdirSync(join(home, 'install'), { mode: 0o700 });
  const location = resolveInstallationLocation('runtime-stage', { home, os: target.os, ...(process.platform === 'win32' ? { userSid: binding.userSid() } : {}) });
  let held = true;
  const owner = { location, assertHeld() { assert.equal(held, true, 'original owner must remain held'); } };
  return { home, owner, lose() { held = false; }, empty() { const path = fs.mkdtempSync(join(home, 'raw-')); if (process.platform === 'win32') binding.protect(path); return path; },
    stages() { return fs.readdirSync(join(home, 'install')).filter(name => name.startsWith('runtime-stage-')); }, clean() { fs.rmSync(home, { recursive: true, force: true }); } };
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
test('runtime staging authenticates official assets and leaves only an owned unselected candidate', async () => {
  const f = fixture();
  try {
    const stage = await stageRuntime(f.owner, identity(target), { transport: await officialTransport() });
    assertRuntimeStage(stage, f.owner); assert.ok(Object.isFrozen(stage)); assert.ok(Object.isFrozen(stage.identity.target));
    const inventory = fs.readFileSync(join(stage.directory, 'inventory.json'));
    assert.equal(verifyRuntimeInventory(inventory, runtimeProfile(target)).length, runtimeProfile(target).entries);
    assert.equal(fs.existsSync(join(f.home, 'runtimes')), false); assert.equal(fs.existsSync(join(f.home, 'releases')), false);
    assert.equal(fs.existsSync(join(f.home, 'install', 'controller.json')), false);
    assert.throws(() => assertRuntimeStage({ ...stage }, f.owner), /original ownership proof/);
    await discardRuntimeStage(stage, f.owner); assert.deepEqual(f.stages(), []);
  } finally { f.clean(); }
});
test('runtime download rejects HTTP redirects sizes and digest failures before extracting code', async () => {
  const f = fixture();
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
      await assert.rejects(stageRuntime(f.owner, identity(target), { transport }));
      assert.equal(closed, true); assert.deepEqual(f.stages(), []); assert.equal(fs.existsSync(join(f.home, 'runtimes')), false);
    }
  } finally { f.clean(); }
});
test('runtime cancellation waits for output closure before owned stage cleanup', async t => {
  const f = fixture(), transport = await officialTransport(), abort = new AbortController(), open = io.open, rm = io.rm;
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
    t.mock.method(io, 'rm', async (...args: Parameters<typeof rm>) => { assert.equal(positive, true); return rm(...args); });
    syncBuiltinESMExports();
    await assert.rejects(stageRuntime(f.owner, identity(target), { transport, signal: abort.signal }), /cancelled/);
    assert.equal(armed, true); assert.equal(positive, true); assert.deepEqual(f.stages(), []);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); f.clean(); }
});
test('runtime download cancellation waits for the actual input stream close before cleanup', async t => {
  const f = fixture(), directory = await officialInputs(), abort = new AbortController(), rm = io.rm;
  let positive = false, body: fs.ReadStream | undefined, closed: Promise<void> | undefined;
  try {
    const transport: DownloadTransport = async url => {
      body = fs.createReadStream(join(directory, url.pathname.split('/v22.22.1/')[1]!), { highWaterMark: 16384 });
      closed = new Promise<void>(resolve => body!.once('close', () => { positive = true; resolve(); }));
      body.once('data', () => abort.abort(Error('download cancelled')));
      return { status: 200, body, closed };
    };
    t.mock.method(io, 'rm', async (...args: Parameters<typeof rm>) => { assert.equal(positive, true); return rm(...args); }); syncBuiltinESMExports();
    await assert.rejects(stageRuntime(f.owner, identity(target), { transport, signal: abort.signal }));
    assert.equal(positive, true); assert.deepEqual(f.stages(), []);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); body?.destroy(); await closed; f.clean(); }
});
test('unresponsive runtime transport returns bounded uncertainty and retains its stage', async () => {
  const f = fixture(), abort = new AbortController(); let entered!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  try {
    // Deliberately no real network handle: this fixture never acknowledges abort.
    const transport: DownloadTransport = async () => { entered(); return new Promise(() => {}); };
    const operation = stageRuntime(f.owner, identity(target), { transport, signal: abort.signal });
    const rejected = assert.rejects(operation, { code: 'resource-close-uncertain' });
    await reached; abort.abort(); await rejected; assert.equal(f.stages().length, 1);
    assert.equal(fs.existsSync(join(f.home, 'runtimes')), false);
  } finally { f.clean(); }
});
test('runtime close uncertainty retains the stage even when cancellation also occurs', async t => {
  const f = fixture(), transport = await officialTransport(), abort = new AbortController(), open = io.open;
  let retained: FileHandle | undefined;
  try {
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      if (retained || !String(args[0]).includes(`${sep}candidate${sep}distribution${sep}`)) return file;
      retained = file;
      return new Proxy(file, { get(handle, key) {
        if (key === 'close') return async () => { abort.abort(); throw new InstallerError('resource-close-uncertain', 'fixture output remains open'); };
        const value = Reflect.get(handle, key); return typeof value === 'function' ? value.bind(handle) : value;
      } });
    });
    syncBuiltinESMExports();
    await assert.rejects(stageRuntime(f.owner, identity(target), { transport, signal: abort.signal }), { code: 'resource-close-uncertain' });
    assert.ok(retained); assert.equal((await retained.stat()).isFile(), true); assert.equal(f.stages().length, 1);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await retained?.close(); f.clean(); }
});
test('Windows archive profiles require exact separate headers and architecture libraries', async () => {
  const f = fixture(), directory = await officialInputs(), windows: Target = { os: 'win32', arch: 'x64', baseline: 'native-v1' };
  try {
    const archive = join(directory, 'node-v22.22.1-win-x64.zip'), headers = join(directory, 'node-v22.22.1-headers.tar.gz'), library = join(directory, 'win-x64/node.lib');
    await assert.rejects(extractRuntimeProfile({ archive }, f.empty(), identity(windows), AbortSignal.timeout(60_000)), /headers.*library/);
    await assert.rejects(extractRuntimeProfile({ archive, headers, library: join(directory, 'win-arm64/node.lib') }, f.empty(), identity(windows), AbortSignal.timeout(60_000)), /digest|file/);
    const root = f.empty(); await extractRuntimeProfile({ archive, headers, library }, root, identity(windows), AbortSignal.timeout(60_000));
    assert.equal(verifyRuntimeInventory(fs.readFileSync(join(root, 'inventory.json')), runtimeProfile(windows)).length, runtimeProfile(windows).entries);
    assert.ok(fs.existsSync(join(root, 'distribution', 'x64', 'node.lib')));
    // Parsing foreign archive bytes is not Windows native installation evidence.
  } finally { f.clean(); }
});
test('runtime gzip and ZIP parsers reject unsafe collisions links special entries and incomplete profiles', async () => {
  const f = fixture(), posixTarget: Target = { os: 'linux', arch: 'arm64', baseline: 'native-v1' };
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
  } finally { f.clean(); }
});
