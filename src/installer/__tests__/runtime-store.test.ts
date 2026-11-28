import { once } from 'node:events';
import { spawnFixture } from '../../daemon/tools/__tests__/_proc.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { join, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import type { Target, RuntimeIdentity } from '../contracts.js';
import { resolveInstallationLocation } from '../location.js';
import { controlBinding } from '../native.js';
import { privateRuntimePaths, runtimeArchive, runtimePolicy, runtimeProfile, runtimeStorePaths } from '../runtime-policy.js';
import { RUNTIME_LIMITS, RUNTIME_PROFILE_VERSION, runtimeInventoryJson, runtimeCompletionJson } from '../runtime-metadata.js';
import { officialInputs } from './_runtime-profile-fixture.js';
import { readRuntimeProfileFiles } from '../../../scripts/generate-runtime-profiles.mjs';
import { inventoryFor } from '../../../scripts/installer-payload.mjs';
import { verifyRuntimeEntry } from '../runtime-store.js';
import type { RuntimeProtection } from '../runtime-metadata.js';
import { ownedRuntimeHome } from './_owned-runtime-home.js';

const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'native-v1' };
const identity: RuntimeIdentity = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
const profile = runtimeProfile(target);
const completion = () => runtimeCompletionJson({ schemaVersion: 1, identity, profileVersion: RUNTIME_PROFILE_VERSION,
  inventorySha256: profile.inventorySha256, npmVersion: runtimePolicy.npmVersion, headersVersion: runtimePolicy.headersVersion });
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
let base: Promise<{ root: string; directory: string; inventory: string }> | undefined;
async function source() {
  return base ??= (async () => {
    const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'irp-')), directory = join(root, 'distribution');
    try {
      const { files } = await readRuntimeProfileFiles(`${target.os}-${target.arch}`, await officialInputs());
      const inventory = runtimeInventoryJson(inventoryFor(files)); assert.equal(sha(inventory), profile.inventorySha256);
      fs.mkdirSync(directory, { mode: 0o700 });
      for (const [name, file] of files as Map<string, { bytes: Buffer; mode: number }>) {
        const path = join(directory, name); fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); fs.writeFileSync(path, file.bytes, { mode: file.mode }); fs.chmodSync(path, file.mode);
      }
      return { root, directory, inventory };
    } catch (error) { fs.rmSync(root, { recursive: true, force: true }); throw error; }
  })();
}
after(async () => { if (base) { const value = await base; fs.rmSync(value.root, { recursive: true, force: true }); } });
async function fixture() {
  const owner = await ownedRuntimeHome("ir Ω's-"), home = owner.root;
  try {
    const prepared = await source(), binding = process.platform === 'win32' ? controlBinding() : undefined;
    binding?.protect(home);
    const location = resolveInstallationLocation('runtime-test', { home, os: target.os, ...(binding ? { userSid: binding.userSid() } : {}) });
    const paths = runtimeStorePaths(home, identity);
    fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
    fs.cpSync(prepared.directory, paths.directory, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
    fs.writeFileSync(paths.inventory, prepared.inventory, { mode: 0o600 }); fs.writeFileSync(paths.completion, completion(), { mode: 0o600 });
    const inventory = JSON.parse(prepared.inventory) as { files: { path: string; mode: number }[] };
    function form(protection: RuntimeProtection) {
      for (const file of inventory.files) fs.chmodSync(join(paths.directory, file.path), protection === 'source-stage' ? file.mode : file.mode & ~0o222);
      for (const path of [paths.inventory, paths.completion]) fs.chmodSync(path, protection === 'source-stage' ? 0o600 : 0o400);
      function directories(path: string) {
        for (const name of fs.readdirSync(path)) { const child = join(path, name); if (fs.lstatSync(child).isDirectory()) directories(child); }
        fs.chmodSync(path, protection === 'source-stage' ? 0o700 : 0o500);
      }
      directories(paths.directory); fs.chmodSync(paths.root, protection === 'published' ? 0o500 : 0o700);
    }
    function write(path: string, bytes: string | Buffer) {
      assert.ok(path.startsWith(home + sep)); const mode = fs.lstatSync(path).mode & 0o777;
      fs.chmodSync(path, mode | 0o200); try { fs.writeFileSync(path, bytes); } finally { fs.chmodSync(path, mode); }
    }
    function inDirectory(path: string, work: () => void) {
      assert.ok(path === home || path.startsWith(home + sep)); const mode = fs.lstatSync(path).mode & 0o777;
      fs.chmodSync(path, mode | 0o200); try { work(); } finally { fs.chmodSync(path, mode); }
    }
    function closed<T>(operation: Promise<T>): Promise<T> {
      owner.trackResource(operation.then(() => {}, error => { if (error?.code === 'resource-close-uncertain') throw error; }));
      return operation;
    }
    form('published');
    return { home, location, paths, owner, form, write, inDirectory,
      resolve: (input = identity, options = {}, at = location) => closed(privateRuntimePaths(at, input, options)),
      verify: (lane: RuntimeProtection) => closed(verifyRuntimeEntry(paths.root, identity, undefined, lane)),
      clean: () => owner.cleanup() };
  } catch (error) { await owner.cleanup(); throw error; }
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function recovery(f: Fixture, reason: string) {
  const quoted = "'" + f.paths.root.replaceAll("'", "'\\''") + "'";
  return `Shared Node runtime verification failed at "${f.paths.root}": ${reason}. This runtime is shared by all releases; no repair was attempted. Manual recovery only: stop all Insrc consumers of "${f.home}". Do not delete anything. If the runtime-entry root is not owner-writable, first restore owner write on that root only: chmod u+w ${quoted}. Preserve and move the entire entry outside the runtime store, then rerun the authenticated installer. This procedure is not protected by operation.lock; Insrc cannot confirm that every consumer has stopped. If unsure, leave the entry unchanged and request operator assistance.`;
}
async function rejectedMutation(f: Fixture, change: () => () => void, reason: string) {
  await f.resolve(); await f.owner.assertOwned(); const restore = change();
  try {
    await assert.rejects(f.resolve(), error => {
      const value = error as { code: string; message: string };
      assert.equal(value.code, 'runtime-invalid');
      assert.equal(value.message, recovery(f, reason));
      return true;
    });
  } finally { restore(); await f.resolve(); }
}

test('resolver import graph stays within installer-only read primitives', async () => {
  const result = await build({ entryPoints: ['src/installer/runtime-store.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, metafile: true });
  for (const path of Object.keys(result.metafile!.inputs)) {
    assert.match(path, /^src\/installer\//);
    assert.doesNotMatch(path, /(?:runtime-acquire|controller-store|safe-zip|bundle|dev-worker|lifecycle|dependencies)\./);
  }
});

test('resolver returns frozen canonical Node npm headers and platform library for the exact identity', async () => {
  const f = await fixture();
  try {
    const input = structuredClone(identity), value = await f.resolve(input);
    assert.equal(value.directory, f.paths.directory); assert.equal(value.node, join(f.paths.directory, identity.relativeExecutable));
    assert.equal(value.npmCli, join(f.paths.directory, target.os === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js'));
    assert.equal(value.headers, f.paths.directory); assert.equal(value.nodeLib, target.os === 'win32' ? join(f.paths.directory, target.arch, 'node.lib') : undefined);
    assert.deepEqual(value.identity, identity); assert.notEqual(value.identity, input);
    assert.equal(value.inventorySha256, profile.inventorySha256);
    assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.identity)); assert.ok(Object.isFrozen(value.identity.target));
  } finally { await f.clean(); }
});

test('resolver rejects corrupt receipts inventories files modes targets aliases and extra members', async () => {
  const f = await fixture();
  try {
    const original = fs.readFileSync(f.paths.completion), inventory = fs.readFileSync(f.paths.inventory);
    for (const bytes of [Buffer.from('{}'), Buffer.concat([original, Buffer.from('\n')]), Buffer.from(original.toString().replace('10.9.4', '0.0.0'))]) {
      await rejectedMutation(f, () => { f.write(f.paths.completion, bytes); return () => f.write(f.paths.completion, original); }, 'Runtime completion identity or canonical bytes differ');
    }
    await rejectedMutation(f, () => { f.write(f.paths.inventory, '{}'); return () => f.write(f.paths.inventory, inventory); }, 'Runtime inventory differs from independent pinned profile');
    const held = join(f.home, 'held');
    await rejectedMutation(f, () => {
      f.inDirectory(f.paths.root, () => fs.renameSync(f.paths.completion, held));
      return () => f.inDirectory(f.paths.root, () => fs.renameSync(held, f.paths.completion));
    }, 'Runtime entry membership differs');
    const extra = join(f.paths.directory, 'extra');
    for (const directory of [false, true]) await rejectedMutation(f, () => {
      f.inDirectory(f.paths.directory, () => { if (directory) fs.mkdirSync(extra, { mode: 0o500 }); else fs.writeFileSync(extra, 'extra', { mode: 0o400 }); });
      return () => f.inDirectory(f.paths.directory, () => { if (directory) fs.rmdirSync(extra); else fs.unlinkSync(extra); });
    }, directory ? 'Unexpected runtime directory' : 'Unexpected runtime file');
    const node = join(f.paths.directory, identity.relativeExecutable);
    await rejectedMutation(f, () => { fs.linkSync(node, join(f.home, 'hardlink')); return () => fs.unlinkSync(join(f.home, 'hardlink')); }, 'Runtime path must be an owned regular non-link file or directory');
    for (const name of [target.os === 'win32' ? 'node_modules/npm/package.json' : 'lib/node_modules/npm/package.json', 'include/node/node_version.h']) {
      const path = join(f.paths.directory, name), bytes = fs.readFileSync(path);
      await rejectedMutation(f, () => { f.inDirectory(dirname(path), () => fs.renameSync(path, held)); return () => f.inDirectory(dirname(path), () => fs.renameSync(held, path)); }, 'Runtime file set is incomplete');
      const tampered = Buffer.from(bytes); tampered[0] = tampered[0]! ^ 1;
      await rejectedMutation(f, () => { f.write(path, tampered); return () => f.write(path, bytes); }, 'Runtime file changed or digest differs');
      await rejectedMutation(f, () => { f.write(path, Buffer.concat([bytes, Buffer.from('x')])); return () => f.write(path, bytes); }, 'Runtime file size differs');
    }
    await rejectedMutation(f, () => {
      fs.chmodSync(f.paths.directory, 0o700);
      f.inDirectory(f.paths.root, () => { fs.renameSync(f.paths.directory, held); fs.symlinkSync(held, f.paths.directory, process.platform === 'win32' ? 'junction' : 'dir'); });
      fs.chmodSync(held, 0o500);
      return () => f.inDirectory(f.paths.root, () => { fs.unlinkSync(f.paths.directory); fs.chmodSync(held, 0o700); fs.renameSync(held, f.paths.directory); fs.chmodSync(f.paths.directory, 0o500); });
    }, 'Runtime path must be an owned regular non-link file or directory');
    if (process.platform !== 'win32') await rejectedMutation(f, () => { fs.chmodSync(f.home, 0o755); return () => fs.chmodSync(f.home, 0o700); }, 'Runtime path must be an owned regular non-link file or directory');
    if (process.platform !== 'win32') {
      await f.resolve(); const alias = join(f.home, 'alias'); fs.symlinkSync(f.home, alias, 'dir');
      try {
        const location = resolveInstallationLocation('runtime-test', { home: alias });
        await assert.rejects(f.resolve(identity, {}, location), { code: 'runtime-invalid',
          message: recovery({ ...f, home: alias, paths: runtimeStorePaths(alias, identity) }, 'Control roots and ancestors must be real directories') });
      } finally { fs.unlinkSync(alias); await f.resolve(); }
    }
    for (const [bad, message] of [
      [{ ...identity, sha256: 'a'.repeat(64) }, 'Runtime identity differs from pinned policy'],
      [{ ...identity, version: '26.0.0' }, 'runtime: data/version must be equal to constant'],
      [{ ...identity, target: { ...target, arch: target.arch === 'arm64' ? 'x64' : 'arm64' } }, 'Runtime target or home is not canonical for this process'],
      [{ ...identity, relativeExecutable: '../node' }, 'Runtime identity differs from pinned policy'],
    ] as const) {
      await f.resolve(); await assert.rejects(f.resolve(bad as RuntimeIdentity), { code: 'runtime-invalid', message }); await f.resolve();
    }
    await f.resolve();
    await assert.rejects(f.resolve({ ...identity, target: { ...target, baseline: 'other' } }), error => {
      assert.equal((error as { code: string }).code, 'runtime-invalid'); assert.match((error as Error).message, /ENOENT.*other/); return true;
    }); await f.resolve();
    await assert.rejects(f.resolve({ ...identity, target: { ...target, baseline: '../escape' } }), { code: 'runtime-invalid', message: 'Expected a bounded path-safe identity' }); await f.resolve();
  } finally { await f.clean(); }
});

test('rewritten self consistent receipt and inventory cannot replace independent pinned hashes', async () => {
  const f = await fixture();
  try {
    const original = fs.readFileSync(f.paths.completion, 'utf8'), inventory = fs.readFileSync(f.paths.inventory);
    const input = JSON.parse(inventory.toString()); input.files[0].sha256 = 'a'.repeat(64);
    const forged = runtimeInventoryJson(input.files), forgedHash = sha(forged);
    await rejectedMutation(f, () => { f.write(f.paths.inventory, forged); f.write(f.paths.completion, original.replace(profile.inventorySha256, forgedHash));
      return () => { f.write(f.paths.inventory, inventory); f.write(f.paths.completion, original); }; }, 'Runtime completion identity or canonical bytes differ');
    await rejectedMutation(f, () => { f.write(f.paths.inventory, forged); return () => f.write(f.paths.inventory, inventory); }, 'Runtime inventory differs from independent pinned profile');
  } finally { await f.clean(); }
});

test('resolver performs only runtime reads without downloads allocation locks or application traversal', async t => {
  const f = await fixture();
  fs.mkdirSync(join(f.home, 'application-data')); fs.writeFileSync(join(f.home, 'application-data', 'trap'), 'not runtime');
  const open = fsp.open, readdir = fsp.readdir;
  try {
    t.mock.method(fsp, 'open', async (path: string, flags: number) => {
      assert.ok(path.startsWith(f.paths.root + sep)); assert.equal(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC), 0);
      return open(path, flags);
    });
    t.mock.method(fsp, 'readdir', async (path: string) => { assert.ok(path === f.paths.root || path.startsWith(f.paths.directory)); return readdir(path); });
    for (const name of ['mkdir', 'writeFile', 'rename', 'unlink', 'rm'] as const) t.mock.method(fsp, name, () => { throw Error('Runtime resolution must not mutate'); });
    t.mock.method(https, 'get', () => { throw Error('Runtime resolution must not download'); });
    syncBuiltinESMExports(); await f.resolve(identity);
    assert.equal(fs.existsSync(join(f.home, 'install', 'operation.lock')), false);
    assert.equal(fs.readFileSync(join(f.home, 'application-data', 'trap'), 'utf8'), 'not runtime');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.clean(); }
});

test('resolver bounds metadata and stops at cancellation without scanning application or Ollama data', async t => {
  const f = await fixture(); const open = fsp.open;
  try {
    for (const [path, maximum] of [[f.paths.completion, RUNTIME_LIMITS.completionBytes], [f.paths.inventory, RUNTIME_LIMITS.inventoryBytes]] as const) {
      const original = fs.readFileSync(path);
      await rejectedMutation(f, () => { f.write(path, Buffer.alloc(maximum + 1)); return () => f.write(path, original); }, 'Runtime file size differs');
    }
    const cancelled = new AbortController(); cancelled.abort(Error('cancelled before IO'));
    await f.resolve(); await assert.rejects(f.resolve(identity, { signal: cancelled.signal }), /cancelled before IO/); await f.resolve();
    await f.resolve();
    const during = new AbortController(); let closed = false;
    t.mock.method(fsp, 'open', async (path: string, flags: number) => {
      const handle = await open(path, flags);
      if (path === f.paths.completion) {
        const read = handle.read.bind(handle), close = handle.close.bind(handle);
        t.mock.method(handle, 'read', async (...args: Parameters<typeof handle.read>) => { const result = await read(...args); during.abort(Error('cancelled while reading')); return result; });
        t.mock.method(handle, 'close', async () => { await close(); closed = true; });
      }
      return handle;
    });
    syncBuiltinESMExports();
    await assert.rejects(f.resolve(identity, { signal: during.signal }), /cancelled while reading/); assert.equal(closed, true);
    t.mock.restoreAll(); syncBuiltinESMExports(); await f.resolve();
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.clean(); }
});

test('strict POSIX runtime protection preserves pinned bytes and rejects every write or execute mode drift', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture();
  try {
    const inventory = fs.readFileSync(f.paths.inventory), receipt = fs.readFileSync(f.paths.completion);
    const node = join(f.paths.directory, identity.relativeExecutable), npm = join(f.paths.directory, 'lib/node_modules/npm/package.json');
    await f.resolve();
    assert.equal(fs.statSync(f.paths.root).mode & 0o777, 0o500);
    assert.equal(fs.statSync(node).mode & 0o777, 0o555); assert.equal(fs.statSync(npm).mode & 0o777, 0o444);
    assert.notEqual(process.getuid?.(), 0, 'Run protection checks as an ordinary user');
    assert.throws(() => fs.appendFileSync(node, 'must fail'), { code: 'EACCES' });
    assert.throws(() => fs.writeFileSync(join(f.paths.directory, 'must-not-exist'), 'x'), { code: 'EACCES' });
    for (const [path, modes, reason] of [
      [node, [0o755, 0o554, 0o444], 'Runtime file mode differs from published protection'],
      [node, [0o575, 0o557], 'Runtime path must be an owned regular non-link file or directory'],
      [npm, [0o644, 0o445], 'Runtime file mode differs from published protection'],
      [f.paths.completion, [0o600], 'Runtime file mode differs from published protection'],
      [f.paths.inventory, [0o600], 'Runtime file mode differs from published protection'],
      [f.paths.directory, [0o700, 0o510], 'Runtime directory mode differs from published protection'],
    ] as const) {
      for (const mode of modes) await rejectedMutation(f, () => {
        const original = fs.statSync(path).mode; fs.chmodSync(path, mode); return () => fs.chmodSync(path, original);
      }, reason);
    }
    assert.deepEqual(fs.readFileSync(f.paths.inventory), inventory); assert.deepEqual(fs.readFileSync(f.paths.completion), receipt);
    assert.equal(sha(inventory.toString()), profile.inventorySha256);
    assert.ok(JSON.parse(inventory.toString()).files.every((file: { mode: number }) => file.mode === 0o644 || file.mode === 0o755));
    await f.resolve();
  } finally { await f.clean(); }
});

test('verifier lanes reject mixed layouts and never grant canonical paths from a weaker flag', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture();
  try {
    await f.resolve(); assert.equal(await f.verify('published'), undefined); assert.equal(await f.verify('permission-transition'), undefined);
    await assert.rejects(f.verify('source-stage'), { code: 'runtime-invalid', message: 'Runtime root mode differs from source-stage protection' }); await f.resolve();
    await assert.rejects(f.verify('forged' as RuntimeProtection), { code: 'runtime-invalid', message: 'Unknown runtime verification protection lane' }); await f.resolve();
    const original = fs.readFileSync(f.paths.inventory);
    f.form('permission-transition'); assert.equal(await f.verify('permission-transition'), undefined);
    const unfinished = `Shared Node runtime publication is unfinished at "${f.paths.root}". Re-run the authenticated installer to verify and finish protecting the entry; no bytes will be replaced.`;
    for (const options of [{}, { protection: 'permission-transition' }, { protection: 'source-stage' }]) {
      await assert.rejects(f.resolve(identity, options), { code: 'runtime-invalid', message: unfinished });
      assert.equal(fs.statSync(f.paths.root).mode & 0o777, 0o700);
    }
    f.form('published'); await f.resolve();
    f.form('source-stage'); assert.equal(await f.verify('source-stage'), undefined);
    await assert.rejects(f.verify('permission-transition'), { code: 'runtime-invalid', message: 'Runtime file mode differs from permission-transition protection' });
    const unsupported = `Shared Node runtime protection layout is unsupported at "${f.paths.root}". This unpublished development home must be rebuilt in a new isolated home; no conversion or repair was attempted.`;
    await assert.rejects(f.resolve(), { code: 'runtime-invalid', message: unsupported });
    assert.deepEqual(fs.readFileSync(f.paths.inventory), original); assert.equal(fs.statSync(f.paths.root).mode & 0o777, 0o700);
    f.form('published'); await f.resolve();
    // Root-only permission transition is the entire exception. Writable
    // descendants and corrupt bytes must get ordinary manual guidance.
    for (const corruption of ['directory', 'bytes']) {
      await f.resolve(); f.form('permission-transition');
      const metadata = fs.readFileSync(f.paths.completion);
      if (corruption === 'directory') fs.chmodSync(f.paths.directory, 0o700); else f.write(f.paths.completion, '{}');
      try { await assert.rejects(f.resolve(), { code: 'runtime-invalid', message: recovery(f, 'Runtime root mode differs from published protection') }); }
      finally { f.write(f.paths.completion, metadata); f.form('published'); await f.resolve(); }
    }
  } finally { await f.clean(); }
});

test('manual runtime diagnostics preserve corrupt entries and quote spaces Unicode and apostrophes safely', async () => {
  const f = await fixture();
  try {
    await f.resolve(); const original = fs.readFileSync(f.paths.completion), inode = fs.statSync(f.paths.root).ino;
    f.write(f.paths.completion, '{}'); let message = '';
    try {
      await assert.rejects(f.resolve(), error => {
        assert.equal((error as { code: string }).code, 'runtime-invalid'); message = (error as Error).message;
        assert.equal(message, recovery(f, 'Runtime completion identity or canonical bytes differ')); return true;
      });
      assert.equal(fs.statSync(f.paths.root).ino, inode); assert.equal(fs.readFileSync(f.paths.completion, 'utf8'), '{}');
      assert.equal(fs.existsSync(join(f.home, 'install', 'operation.lock')), false);
      assert.ok(message.includes('Do not delete anything.')); assert.ok(message.includes('not protected by operation.lock'));
      if (process.platform !== 'win32') {
        const quoted = message.split('chmod u+w ')[1]!.split('. Preserve and move')[0]!;
        const child = f.owner.trackChild(spawnFixture('/bin/sh', ['-c', `set -- ${quoted}; printf '%s\\n%s' "$#" "$1"`], { stdio: ['ignore', 'pipe', 'pipe'] }));
        let output = ''; child.stdout!.on('data', bytes => { output += String(bytes); }); const closed = once(child, 'close');
        assert.equal((await closed)[0], 0); assert.equal(output, `1\n${f.paths.root}`);
      }
      if (process.platform !== 'win32') assert.equal(fs.statSync(f.paths.root).mode & 0o777, 0o500);
    } finally { f.write(f.paths.completion, original); await f.resolve(); }
  } finally { await f.clean(); }
});
