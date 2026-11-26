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
  const prepared = await source(), home = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'ir-'));
  const binding = process.platform === 'win32' ? controlBinding() : undefined;
  binding?.protect(home);
  const location = resolveInstallationLocation('runtime-test', { home, os: target.os, ...(binding ? { userSid: binding.userSid() } : {}) });
  const paths = runtimeStorePaths(home, identity);
  fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  fs.cpSync(prepared.directory, paths.directory, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
  fs.writeFileSync(paths.inventory, prepared.inventory, { mode: 0o600 }); fs.writeFileSync(paths.completion, completion(), { mode: 0o600 });
  return { home, location, paths, clean() { fs.rmSync(home, { recursive: true, force: true }); } };
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
    const input = structuredClone(identity), value = await privateRuntimePaths(f.location, input);
    assert.equal(value.directory, f.paths.directory); assert.equal(value.node, join(f.paths.directory, identity.relativeExecutable));
    assert.equal(value.npmCli, join(f.paths.directory, target.os === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js'));
    assert.equal(value.headers, f.paths.directory); assert.equal(value.nodeLib, target.os === 'win32' ? join(f.paths.directory, target.arch, 'node.lib') : undefined);
    assert.deepEqual(value.identity, identity); assert.notEqual(value.identity, input);
    assert.equal(value.inventorySha256, profile.inventorySha256);
    assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.identity)); assert.ok(Object.isFrozen(value.identity.target));
  } finally { f.clean(); }
});

test('resolver rejects corrupt receipts inventories files modes targets aliases and extra members', async () => {
  const f = await fixture();
  try {
    const original = fs.readFileSync(f.paths.completion), inventory = fs.readFileSync(f.paths.inventory);
    for (const bytes of [Buffer.from('{}'), Buffer.concat([original, Buffer.from('\n')]), Buffer.from(original.toString().replace('10.9.4', '0.0.0'))]) {
      fs.writeFileSync(f.paths.completion, bytes); await assert.rejects(privateRuntimePaths(f.location, identity));
    }
    fs.writeFileSync(f.paths.completion, original);
    fs.writeFileSync(f.paths.inventory, '{}'); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.writeFileSync(f.paths.inventory, inventory);
    const held = join(f.home, 'held');
    fs.renameSync(f.paths.completion, held); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.renameSync(held, f.paths.completion);
    for (const bad of [{ ...identity, sha256: 'a'.repeat(64) }, { ...identity, version: '26.0.0' },
      { ...identity, target: { ...target, arch: target.arch === 'arm64' ? 'x64' as const : 'arm64' as const } },
      { ...identity, target: { ...target, baseline: 'other' } }, { ...identity, target: { ...target, baseline: '../escape' } }]) {
      await assert.rejects(privateRuntimePaths(f.location, bad));
    }
    const extra = join(f.paths.directory, 'extra'); fs.writeFileSync(extra, 'extra'); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.rmSync(extra);
    fs.mkdirSync(extra, { mode: 0o700 }); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.rmSync(extra, { recursive: true });
    const node = join(f.paths.directory, identity.relativeExecutable), stat = fs.statSync(node);
    if (process.platform !== 'win32') { fs.chmodSync(node, 0o644); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.chmodSync(node, stat.mode); }
    fs.appendFileSync(node, 'changed'); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.truncateSync(node, stat.size);
    fs.linkSync(node, join(f.home, 'hardlink')); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.unlinkSync(join(f.home, 'hardlink'));
    for (const name of [target.os === 'win32' ? 'node_modules/npm/package.json' : 'lib/node_modules/npm/package.json', 'include/node/node_version.h']) {
      const path = join(f.paths.directory, name);
      fs.renameSync(path, held); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.renameSync(held, path);
      const bytes = fs.readFileSync(path); fs.appendFileSync(path, 'tamper'); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.writeFileSync(path, bytes);
    }
    if (process.platform !== 'win32') { fs.chmodSync(f.home, 0o755); await assert.rejects(privateRuntimePaths(f.location, identity)); fs.chmodSync(f.home, 0o700); }
    fs.renameSync(f.paths.directory, held);
    fs.symlinkSync(held, f.paths.directory, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(privateRuntimePaths(f.location, identity));
    fs.unlinkSync(f.paths.directory); fs.renameSync(held, f.paths.directory);
  } finally { f.clean(); }
});

test('rewritten self consistent receipt and inventory cannot replace independent pinned hashes', async () => {
  const f = await fixture();
  try {
    const original = fs.readFileSync(f.paths.completion, 'utf8');
    const input = JSON.parse(fs.readFileSync(f.paths.inventory, 'utf8'));
    input.files[0].sha256 = 'a'.repeat(64); const forged = runtimeInventoryJson(input.files), forgedHash = sha(forged);
    fs.writeFileSync(f.paths.inventory, forged);
    fs.writeFileSync(f.paths.completion, original.replace(profile.inventorySha256, forgedHash));
    await assert.rejects(privateRuntimePaths(f.location, identity), /completion/);
    fs.writeFileSync(f.paths.completion, original);
    await assert.rejects(privateRuntimePaths(f.location, identity), /independent pinned profile/);
  } finally { f.clean(); }
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
    syncBuiltinESMExports(); await privateRuntimePaths(f.location, identity);
    assert.equal(fs.existsSync(join(f.home, 'install', 'operation.lock')), false);
    assert.equal(fs.readFileSync(join(f.home, 'application-data', 'trap'), 'utf8'), 'not runtime');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); f.clean(); }
});

test('resolver bounds metadata and stops at cancellation without scanning application or Ollama data', async t => {
  const f = await fixture(); const open = fsp.open;
  try {
    const original = fs.readFileSync(f.paths.completion);
    fs.truncateSync(f.paths.completion, RUNTIME_LIMITS.completionBytes + 1); await assert.rejects(privateRuntimePaths(f.location, identity), /size/); fs.writeFileSync(f.paths.completion, original);
    fs.truncateSync(f.paths.inventory, RUNTIME_LIMITS.inventoryBytes + 1); await assert.rejects(privateRuntimePaths(f.location, identity), /size/);
    fs.writeFileSync(f.paths.inventory, (await source()).inventory);
    const cancelled = new AbortController(); cancelled.abort(Error('cancelled before IO'));
    await assert.rejects(privateRuntimePaths(f.location, identity, { signal: cancelled.signal }), /cancelled before IO/);
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
    await assert.rejects(privateRuntimePaths(f.location, identity, { signal: during.signal }), /cancelled while reading/); assert.equal(closed, true);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); f.clean(); }
});
