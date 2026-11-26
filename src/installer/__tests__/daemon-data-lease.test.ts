import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import { DaemonDataLease } from '../daemon-data-lease.js';
import { ControllerStore } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { childLine, spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

const fixture = fileURLToPath(new URL('./daemon-data-lease-fixture.mjs', import.meta.url));
function setup() {
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-lease-'));
  mkdirSync(join(home, 'install'), { mode: 0o700 });
  return { home, location: resolveInstallationLocation('fixture', { home }), cleanup: () => rmSync(home, { recursive: true, force: true }) };
}
async function probe(home: string, children: ChildProcess[]): Promise<string> {
  const child = spawnFixture(process.execPath, [fixture, home, 'probe'], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
  const closed = once(child, 'close'); const line = await childLine(child, 10_000);
  assert.deepEqual(await closed, [0, null]); return line.trim();
}

test('daemon data lease excludes separate processes survives GC and releases only on owner exit', async () => {
  const f = setup(), children: ChildProcess[] = [];
  try {
    const owner = spawnFixture(process.execPath, ['--expose-gc', fixture, f.home, 'hold'], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(owner);
    assert.match(await childLine(owner, 10_000), /ready/);
    assert.throws(() => DaemonDataLease.acquire(f.location), { code: 'busy' });
    assert.equal(await probe(f.home, children), 'busy');
    // The manager operation lock is independent and cannot release daemon data.
    const controller = ControllerStore.acquire(f.location); controller.assertHeld(); controller.close();
    assert.equal(await probe(f.home, children), 'busy');
    const lock = lstatSync(join(f.home, 'install/daemon-data.lock'));
    const closed = once(owner, 'close'); owner.stdin!.end('exit\n'); assert.deepEqual(await closed, [0, null]);
    assert.equal(await probe(f.home, children), 'acquired');
    assert.equal(lstatSync(join(f.home, 'install/daemon-data.lock')).ino, lock.ino);
  } finally { await stopOwnedChildren(children); f.cleanup(); }
});

test('daemon data lease waits for every store and worker closure and coalesces disposal', async () => {
  const f = setup(), children: ChildProcess[] = [];
  const lease = DaemonDataLease.acquire(f.location);
  let storeClosed!: () => void, workerClosed!: () => void, calls = 0;
  const stores = new Promise<void>(resolve => { storeClosed = resolve; });
  const worker = new Promise<void>(resolve => { workerClosed = resolve; });
  try {
    const closing = lease.releaseAfterResources(async () => { calls++; await stores; await worker; });
    assert.equal(lease.releaseAfterResources(async () => { throw new Error('Second close must not run'); }), closing);
    assert.equal(await probe(f.home, children), 'busy');
    storeClosed(); assert.equal(await probe(f.home, children), 'busy');
    workerClosed(); await closing;
    assert.equal(calls, 1); assert.equal(await probe(f.home, children), 'acquired');
    assert.throws(() => lease.assertHeld(), { code: 'data-lease-lost' });
    await lease.releaseAfterResources(async () => { throw new Error('Closed lease must not repeat cleanup'); });
  } finally { storeClosed(); workerClosed(); await lease.releaseAfterResources(async () => {}); await stopOwnedChildren(children); f.cleanup(); }
});

test('unconfirmed store closure retains original lease and rejects competing startup', async () => {
  const f = setup(), children: ChildProcess[] = [];
  const lease = DaemonDataLease.acquire(f.location);
  try {
    await assert.rejects(lease.releaseAfterResources(async () => { throw new Error('Native store close failed'); }), { code: 'data-lease-release-uncertain' });
    lease.assertHeld(); assert.equal(await probe(f.home, children), 'busy');
    await lease.releaseAfterResources(async () => {});
    assert.equal(await probe(f.home, children), 'acquired');
  } finally { await lease.releaseAfterResources(async () => {}); await stopOwnedChildren(children); f.cleanup(); }
});

test('daemon data lease rejects unsafe roots and never allocates enrollment or follows links', async () => {
  const f = setup();
  try {
    const lease = DaemonDataLease.acquire(f.location);
    await lease.releaseAfterResources(async () => {});
    assert.throws(() => lstatSync(join(f.home, 'install/enrollment.json')), { code: 'ENOENT' });
    const missing = resolveInstallationLocation('fixture', { home: join(f.home, 'missing') });
    assert.throws(() => DaemonDataLease.acquire(missing));
    assert.throws(() => lstatSync(missing.home), { code: 'ENOENT' });
    if (process.platform !== 'win32') {
      chmodSync(join(f.home, 'install'), 0o755);
      assert.throws(() => DaemonDataLease.acquire(f.location), { code: 'data-lease-root-invalid' });
      chmodSync(join(f.home, 'install'), 0o700);
      const alias = join(f.home, 'alias'); symlinkSync(join(f.home, 'install'), alias);
      assert.throws(() => DaemonDataLease.acquire(resolveInstallationLocation('fixture', { home: alias })));
    }
  } finally { f.cleanup(); }
});
