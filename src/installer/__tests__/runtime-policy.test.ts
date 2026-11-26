import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { posix, win32 } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import type { RuntimeIdentity, Target } from '../contracts.js';
import { runtimeArchive, runtimePolicy, runtimeProfile, runtimeStorePaths } from '../runtime-policy.js';
import { RUNTIME_LIMITS, RUNTIME_PROFILE_VERSION, runtimeInventoryJson } from '../runtime-metadata.js';
import { requireNativeQualification } from '../native-qualification.js';
import { installerSchemas } from '../schemas.js';
import { officialInputs } from './_runtime-profile-fixture.js';
import { deriveRuntimeProfiles } from '../../../scripts/generate-runtime-profiles.mjs';

const targets = Object.keys(runtimePolicy.archives) as (keyof typeof runtimePolicy.archives)[];
function identity(key: string): RuntimeIdentity {
  const [os, arch] = key.split('-') as [Target['os'], Target['arch']];
  const target = { os, arch, baseline: 'native-v1' };
  return { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: os === 'win32' ? 'node.exe' : 'bin/node' };
}


test('runtime policy pins all six official distribution identities without enabling targets', () => {
  assert.equal(targets.length, 6); assert.deepEqual(Object.keys(runtimePolicy.profiles), targets);
  assert.equal(runtimePolicy.nodeVersion, '22.22.1'); assert.equal(runtimePolicy.npmVersion, '10.9.4'); assert.equal(runtimePolicy.headersVersion, '22.22.1');
  for (const key of targets) {
    const value = identity(key), profile = runtimeProfile(value.target), archive = runtimeArchive(value.target);
    assert.equal(profile.profileVersion, RUNTIME_PROFILE_VERSION);
    assert.match(profile.inventorySha256, /^[a-f0-9]{64}$/); assert.match(profile.nodeSha256, /^[a-f0-9]{64}$/);
    assert.ok(profile.archiveBytes > 0 && profile.archiveBytes <= RUNTIME_LIMITS.compressedBytes);
    assert.ok(profile.entries > 0 && profile.entries <= RUNTIME_LIMITS.entries);
    assert.ok(profile.expandedBytes > 0 && profile.expandedBytes <= RUNTIME_LIMITS.expandedBytes);
    assert.match(archive.url, /^https:\/\/nodejs\.org\/download\/release\/v22\.22\.1\//);
    assert.ok(Object.isFrozen(profile)); assert.ok(Object.isFrozen(runtimePolicy.archives));
    assert.throws(() => requireNativeQualification(value.target, 'a'.repeat(64)), /qualification/);
  }
  for (const asset of [runtimePolicy.supplemental.headers, ...Object.values(runtimePolicy.supplemental.libraries)]) {
    assert.match(asset.url, /^https:\/\/nodejs\.org\/download\/release\/v22\.22\.1\//); assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.ok(asset.bytes > 0 && asset.bytes <= RUNTIME_LIMITS.compressedBytes); assert.ok(Object.isFrozen(asset));
  }
  assert.deepEqual(Object.keys(installerSchemas.runtime.properties).sort(), ['relativeExecutable', 'sha256', 'target', 'version']);
  assert.equal(installerSchemas.manifest.properties.schemaVersion.const, 1);
});

test('runtime layout binds complete identity and rejects unsafe aliases without filesystem allocation', () => {
  for (const key of targets) {
    const value = identity(key), home = value.target.os === 'win32' ? 'C:\\isolated home Ω' : '/isolated home Ω';
    const paths = runtimeStorePaths(home, value), path = value.target.os === 'win32' ? win32 : posix;
    assert.equal(paths.root, path.join(home, 'runtimes', '22.22.1', `${key}-native-v1`, value.sha256));
    assert.equal(paths.directory, path.join(paths.root, 'distribution'));
    assert.equal(paths.inventory, path.join(paths.root, 'inventory.json')); assert.equal(paths.completion, path.join(paths.root, 'completion.json'));
    assert.ok(Object.isFrozen(paths));
    for (const bad of [{ ...value, sha256: 'a'.repeat(64) }, { ...value, version: '26.0.0' }, { ...value, relativeExecutable: '../node' }, { ...value, target: { ...value.target, baseline: '../escape' } }]) {
      assert.throws(() => runtimeStorePaths(home, bad));
    }
    assert.throws(() => runtimeStorePaths('relative', value));
  }
});

test('runtime metadata has fixed finite bounds and locale independent inventory serialization', () => {
  assert.deepEqual(RUNTIME_LIMITS, { completionBytes: 65536, inventoryBytes: 16777216, entries: 32768, entryBytes: 134217728,
    expandedBytes: 1073741824, compressedBytes: 268435456, networkMs: 600000, verificationMs: 120000 });
  assert.ok(Object.isFrozen(RUNTIME_LIMITS));
  const files = ['z', 'A', 'a'].map(path => ({ path, bytes: 0, sha256: 'a'.repeat(64), mode: 0o644 }));
  const encoded = runtimeInventoryJson(files);
  assert.equal(encoded, runtimeInventoryJson([...files].reverse()));
  assert.deepEqual(JSON.parse(encoded).files.map((file: { path: string }) => file.path), ['A', 'a', 'z']);
});

test('official profile metadata reproduces all pinned assets without target execution or extraction', { timeout: 600_000 }, async t => {
  const directory = await officialInputs();
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) {
    t.mock.method(childProcess, name, () => { throw Error('Foreign/host process execution forbidden during metadata derivation'); });
  }
  t.mock.method(fs, 'writeFileSync', () => { throw Error('Metadata derivation must not extract or publish files'); });
  t.mock.method(fs, 'mkdirSync', () => { throw Error('Metadata derivation must not allocate runtime directories'); });
  syncBuiltinESMExports();
  try { assert.deepEqual(await deriveRuntimeProfiles(directory), runtimePolicy.profiles); }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});
