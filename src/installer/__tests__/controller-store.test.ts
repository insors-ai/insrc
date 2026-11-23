import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, realpathSync, rmSync, lstatSync, writeFileSync, unlinkSync, symlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ControllerStore, inspectController } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { controlBinding } from '../native.js';
import { childLine, spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import type { ChildProcess } from 'node:child_process';
import type { ControllerSnapshot } from '../contracts.js';
const fixture = fileURLToPath(new URL('./control-fixture.mjs', import.meta.url));
function initial(home: string): ControllerSnapshot {
  return { schemaVersion: 1, revision: 0, installation: { schemaVersion: 1, installationId: 'fixture', dataHome: home, delivery: { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' }, activeReleaseId: 'old' } };
}
function setup() {
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-lock-'));
  return { home, location: resolveInstallationLocation('fixture', { home }), cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test('OS lock excludes another writer and releases on owned fixture self exit', async () => {
  const f = setup(), children: ChildProcess[] = [];
  try {
    const child = spawnFixture(process.execPath, [fixture, f.home, 'hold'], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
    assert.match(await childLine(child), /ready/);
    const lockPath = join(f.home, 'install/operation.lock'), before = lstatSync(lockPath);
    assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
    // Age and contents do not decide ownership.
    assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
    const exited = once(child, 'close'); child.stdin!.end('exit\n');
    assert.deepEqual(await exited, [0, null]);
    const store = ControllerStore.acquire(f.location);
    try { store.assertHeld(); assert.equal(lstatSync(lockPath).ino, before.ino); }
    finally { store.close(); }
    assert.throws(() => store.commit(initial(f.home), null), { code: 'lock-lost' });
  } finally { await stopOwnedChildren(children); f.cleanup(); }
});

test('atomic replacement crash points preserve one valid snapshot', async () => {
  for (const point of ['temp-flushed', 'replaced', 'directory-flushed']) {
    const f = setup(), children: ChildProcess[] = [];
    try {
      const store = ControllerStore.acquire(f.location); store.commit(initial(f.home), null); store.close();
      const child = spawnFixture(process.execPath, [fixture, f.home, 'crash', point], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
      assert.deepEqual(await once(child, 'close'), [0, null]);
      const observed = inspectController(f.location);
      assert.equal(observed.kind, 'present');
      if (observed.kind !== 'present') throw new Error('Lost snapshot');
      const replaced = point !== 'temp-flushed';
      assert.equal(observed.snapshot.revision, replaced ? 1 : 0);
      assert.equal(observed.snapshot.installation.activeReleaseId, replaced ? 'new' : 'old');
      const next = ControllerStore.acquire(f.location); next.assertHeld(); next.close();
    } finally { await stopOwnedChildren(children); f.cleanup(); }
  }
});

test('controller inspection and revision failures never silently enroll or overwrite', () => {
  const f = setup();
  try {
    assert.deepEqual(inspectController(f.location), { kind: 'missing' });
    assert.throws(() => lstatSync(join(f.home, 'install')), { code: 'ENOENT' });
    const store = ControllerStore.acquire(f.location);
    try {
      store.commit(initial(f.home), null);
      assert.throws(() => store.commit(initial(f.home), null), { code: 'revision-conflict' });
      const next = initial(f.home); next.revision = 1; next.installation.activeReleaseId = 'new';
      store.commit(next, 0);
      assert.throws(() => store.commit({ ...next, revision: 2 }, 0), { code: 'revision-conflict' });
      assert.throws(() => store.commit({ ...next, revision: 2, installation: { ...next.installation, installationId: 'other' } }, 1), { code: 'identity-invalid' });
      unlinkSync(join(f.home, 'install/controller.json'));
      assert.equal(inspectController(f.location).kind, 'corrupt');
      assert.throws(() => store.commit(initial(f.home), null), { code: 'controller-corrupt' });
      writeFileSync(join(f.home, 'install/controller.json'), 'broken', { mode: 0o600 });
      assert.equal(inspectController(f.location).kind, 'corrupt');
    } finally { store.close(); }
  } finally { f.cleanup(); }
});

test('controller rejects lock replacement and unsafe records or control roots', () => {
  const f = setup();
  try {
    const store = ControllerStore.acquire(f.location);
    try {
      if (process.platform !== 'win32') {
        const lock = join(f.home, 'install/operation.lock');
        unlinkSync(lock); writeFileSync(lock, '', { mode: 0o600 });
        assert.throws(() => store.commit(initial(f.home), null), { code: 'lock-lost' });
      }
    } finally { store.close(); }
    if (process.platform !== 'win32') {
      chmodSync(join(f.home, 'install/operation.lock'), 0o666);
      assert.throws(() => ControllerStore.acquire(f.location), { code: 'lock-invalid' });
      unlinkSync(join(f.home, 'install/operation.lock'));
      symlinkSync(join(f.home, 'outside'), join(f.home, 'install/operation.lock'));
      assert.throws(() => ControllerStore.acquire(f.location), { code: 'lock-invalid' });
    }
    assert.equal(typeof controlBinding().acquire, 'function');
  } finally { f.cleanup(); }
});

test('native publication remains gated without exact target runtime and live qualification', async () => {
  const { requireNativeQualification } = await import('../native-qualification.js');
  const target = { os: 'darwin', arch: 'arm64', baseline: 'macos-13' } as const, digest = 'a'.repeat(64);
  assert.throws(() => requireNativeQualification(target, digest), { code: 'target-unqualified' });
  const fixture = { target, runtimeVersion: '22.22.1', addonSha256: digest, nativeExecution: true, lockExclusion: true, interruptedReplace: true, privateRuntimeSmoke: true, liveInstallUpgrade: true };
  // Fabricated receipt exercises policy only; it is never published as evidence.
  requireNativeQualification(target, digest, fixture);
  assert.throws(() => requireNativeQualification(target, digest, { ...fixture, liveInstallUpgrade: false }), { code: 'target-unqualified' });
  assert.throws(() => requireNativeQualification({ ...target, os: 'linux' }, digest, fixture), { code: 'target-unqualified' });
  assert.throws(() => requireNativeQualification(target, 'b'.repeat(64), fixture), { code: 'target-unqualified' });
});

test('native publisher denies unqualified output before publishing target artifacts', async () => {
  // Importing emitted qualification policy is intentional: production publisher uses it.
  const { packageControlBinding } = await import('../../../scripts/package-installer-control.mjs');
  const { buildStages, REQUIRED_ARTIFACTS } = await import('../../../scripts/test-harness/build.mjs');
  assert.ok(buildStages({ environment: () => process.env }).some((args: string[]) => args[0] === 'scripts/build-installer-control.mjs'));
  assert.ok(REQUIRED_ARTIFACTS.includes('out/installer/native/control.node'));
  const f = setup();
  try {
    const destination = join(f.home, 'published');
    assert.throws(() => packageControlBinding({ source: 'out/installer/native/control.node', destination, target: { os: process.platform, arch: process.arch, baseline: 'fixture' } }), /writer admission|Publication requires/);
    assert.throws(() => lstatSync(destination), { code: 'ENOENT' });
  } finally { f.cleanup(); }
});
