/**
 * Story E20260923401ae5fb:S006 / t3 — the consent-gated OrphanKill seam (sc9 Debug).
 * Driven over an injected kill/wait — no real signals.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createOrphanKill, readManagedPid, type OrphanKillDeps } from '../orphan-kill.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A scriptable kill: `alive` is the set of pids still running after SIGTERM (the
 * liveness re-probe throws ESRCH for a pid NOT in it); `throwOn` maps a pid to an
 * error thrown on its SIGTERM. Records every (pid, signal) call.
 */
function fakeKill(opts: { aliveAfterTerm?: Set<number>; throwOnTerm?: Map<number, Error> } = {}): {
  kill: OrphanKillDeps['kill'];
  calls: Array<{ pid: number; signal: NodeJS.Signals | 0 }>;
} {
  const alive = opts.aliveAfterTerm ?? new Set<number>();
  const throwOnTerm = opts.throwOnTerm ?? new Map<number, Error>();
  const calls: Array<{ pid: number; signal: NodeJS.Signals | 0 }> = [];
  const kill: OrphanKillDeps['kill'] = (pid, signal) => {
    calls.push({ pid, signal });
    if (signal === 'SIGTERM') {
      const err = throwOnTerm.get(pid);
      if (err) throw err;
      return;
    }
    if (signal === 0) {
      // Liveness probe: throw ESRCH when the process is gone.
      if (!alive.has(pid)) {
        const e = new Error('no such process') as NodeJS.ErrnoException;
        e.code = 'ESRCH';
        throw e;
      }
      return;
    }
    // SIGKILL — succeeds.
  };
  return { kill, calls };
}

const noWait: OrphanKillDeps['wait'] = async () => {};

test("a live pid -> SIGTERM->SIGKILL 'forced'; a pid dying on SIGTERM -> 'terminated'", async () => {
  const { kill, calls } = fakeKill({ aliveAfterTerm: new Set([100]) }); // 100 survives, 200 dies.
  const run = createOrphanKill({ kill, wait: noWait, managedPid: () => undefined, platform: 'darwin' });
  const outcomes = await run([100, 200]);
  assert.deepEqual(outcomes, [
    { pid: 100, result: 'forced' },
    { pid: 200, result: 'terminated' },
  ]);
  // 100 got SIGTERM, probe, then SIGKILL; 200 got SIGTERM + probe (gone).
  assert.ok(calls.some((c) => c.pid === 100 && c.signal === 'SIGKILL'), 'the survivor was SIGKILLed');
  assert.ok(!calls.some((c) => c.pid === 200 && c.signal === 'SIGKILL'), 'the dead pid was not SIGKILLed');
});

test("the managed daemon pid is never signalled even if passed in ('not-found'); only non-managed pids targeted", async () => {
  const { kill, calls } = fakeKill({ aliveAfterTerm: new Set([300]) });
  const run = createOrphanKill({ kill, wait: noWait, managedPid: () => 999, platform: 'darwin' });
  const outcomes = await run([999, 300]);
  assert.deepEqual(outcomes, [
    { pid: 999, result: 'not-found' }, // managed — skipped.
    { pid: 300, result: 'forced' },
  ]);
  assert.ok(!calls.some((c) => c.pid === 999), 'the managed pid received NO signal at all');
});

test("a per-pid kill throw is caught as 'error', the others proceed, the fn never throws", async () => {
  const boom = new Error('EPERM') as NodeJS.ErrnoException;
  boom.code = 'EPERM';
  const { kill } = fakeKill({ aliveAfterTerm: new Set([400]), throwOnTerm: new Map([[500, boom]]) });
  const run = createOrphanKill({ kill, wait: noWait, managedPid: () => undefined, platform: 'darwin' });
  let outcomes: Awaited<ReturnType<typeof run>> | undefined;
  await assert.doesNotReject(async () => {
    outcomes = await run([400, 500]);
  });
  assert.deepEqual(outcomes, [
    { pid: 400, result: 'forced' }, // proceeded normally
    { pid: 500, result: 'error' }, // EPERM on SIGTERM
  ]);
});

test("non-POSIX no-ops/reports 'error'; readManagedPid parses to number|undefined and never throws", async () => {
  const { kill, calls } = fakeKill();
  const run = createOrphanKill({ kill, wait: noWait, managedPid: () => undefined, platform: 'win32' });
  const outcomes = await run([1, 2]);
  assert.deepEqual(outcomes, [
    { pid: 1, result: 'error' },
    { pid: 2, result: 'error' },
  ]);
  assert.equal(calls.length, 0, 'no signal is sent on a non-POSIX platform');

  // readManagedPid: valid, garbage, missing.
  const dir = mkdtempSync(join(tmpdir(), 'insrc-pid-'));
  try {
    const good = join(dir, 'good.pid');
    writeFileSync(good, '  4242\n');
    assert.equal(readManagedPid(good), 4242, 'parses a numeric pidfile');
    const bad = join(dir, 'bad.pid');
    writeFileSync(bad, 'not-a-number');
    assert.equal(readManagedPid(bad), undefined, 'garbage -> undefined');
    assert.equal(readManagedPid(join(dir, 'missing.pid')), undefined, 'missing -> undefined');
    assert.doesNotThrow(() => readManagedPid(join(dir, 'missing.pid')), 'never throws');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('source-scan: orphan-kill.ts imports no vscode, no cloud, and is NOT a gateway method', () => {
  const src = readFileSync(join(HERE, '..', 'orphan-kill.ts'), 'utf8');
  // Scan IMPORT statements only (the doc comment's "off the read-only gateway" prose is fine).
  const imports = [...src.matchAll(/^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
  assert.ok(!imports.some((s) => s === 'vscode'), 'orphan-kill must not import vscode');
  assert.ok(!imports.some((s) => /undici|^https?:/.test(s)), 'orphan-kill imports no cloud/HTTP client');
  // The kill takes injected primitives (kill/wait/managedPid) — it never depends on the gateway.
  assert.ok(!src.includes('createDaemonDataGateway'), 'the kill does not construct/use the read-only gateway');
});
