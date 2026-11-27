import { register } from 'tsx/esm/api'; register();
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { QUALIFICATION_TIME_BUDGETS as policy } from '../../src/installer/qualification-time-budgets.mjs';
import { QUALIFICATION_CONTAINMENT as limits, qualificationAdmission, requireQualificationHeadroom, withQualificationDeadline } from '../qualification-containment.mjs';
import { createRun } from '../test-harness/context.mjs';
import { withRun } from '../test-harness/process.mjs';

const [root, mode] = process.argv.slice(2);
if (mode === 'headroom') {
  assert.equal(limits.jobMs, (policy.profile === 'slow-vm' ? 360 : 240) * 60000);
  assert.equal(limits.nativeMs, policy.qualification.runMs + policy.manager.cleanupMs + policy.qualification.cleanupMs);
  assert.equal(limits.supervisorMs, limits.nativeMs + 8 * 60000);
  assert.ok(limits.preflightMs + limits.setupAndDrainMs + limits.supervisorMs <= limits.jobMs);
  assert.equal(requireQualificationHeadroom(limits.supervisorMs).requiredMs, limits.supervisorMs);
  for (const value of [limits.supervisorMs - 1, 0, -1, NaN, Infinity, limits.supervisorMs + 0.5]) {
    assert.throws(() => requireQualificationHeadroom(value), { code: 'qualification-containment-insufficient' });
  }
  if (policy.profile === 'slow-vm') {
    assert.equal(limits.supervisorMs, 315 * 60000);
    assert.throws(() => requireQualificationHeadroom(120 * 60000), { code: 'qualification-containment-insufficient' });
  }
  const date = Date.now, descriptor = Object.getOwnPropertyDescriptor(performance, 'now'); let monotonic = 0, wall = 2_000_000_000_000;
  Date.now = () => wall;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => monotonic });
  try {
    const setupMs = 4 * 60000, admission = qualificationAdmission(wall - setupMs);
    monotonic = 40 * 60000 + policy.coordinator.cleanupMs;
    assert.equal(admission().remainingMs, limits.jobMs - setupMs - monotonic, 'production clock counts setup exactly once');
    if (policy.profile === 'slow-vm') assert.equal(admission().remainingMs, 315.5 * 60000);
    wall -= 2 * 3600000; // A later wall-clock correction cannot lend more work time.
    assert.equal(admission().remainingMs, limits.jobMs - setupMs - monotonic);
    monotonic = limits.jobMs - setupMs - limits.supervisorMs;
    assert.equal(admission().remainingMs, limits.supervisorMs, 'exact containing boundary is admitted');
    monotonic++;
    assert.throws(admission, { code: 'qualification-containment-insufficient' });
    for (const stamp of [0, -1, NaN, Infinity, wall + 1]) assert.throws(() => qualificationAdmission(stamp), { code: 'qualification-containment-invalid' });
  } finally { Date.now = date; if (descriptor) Object.defineProperty(performance, 'now', descriptor); else delete performance.now; }
} else {
  const counts = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
  const timeout = globalThis.setTimeout, clear = globalThis.clearTimeout, timers = new Set();
  let expire;
  globalThis.setTimeout = (callback, ms, ...args) => {
    const handle = timeout(callback, ms, ...args);
    if (ms === policy.qualification.runMs || ms === 100) { timers.add(handle); expire ??= callback; }
    return handle;
  };
  globalThis.clearTimeout = handle => { timers.delete(handle); return clear(handle); };
  try {
    if (mode === 'evidence') {
      const copy = fs.copyFileSync;
      fs.copyFileSync = () => { throw Error('controlled resource-copy failure'); }; syncBuiltinESMExports();
      try {
        const { qualifyRuntimeFoundation } = await import('../qualify-runtime-foundation.mjs');
        await assert.rejects(qualifyRuntimeFoundation({ parent: root, baseline: 'fixture' }), /controlled resource-copy failure/);
        const roots = fs.readdirSync(root).filter(name => name.startsWith('iq-')); assert.equal(roots.length, 1);
        const evidence = JSON.parse(fs.readFileSync(join(root, roots[0], 'result.json'), 'utf8'));
        assert.equal(evidence.profile, policy.profile); assert.deepEqual(evidence.timeBudgets, policy);
        assert.equal(evidence.status, 'fail'); assert.equal(evidence.releaseEnablement, false);
        assert.equal(evidence.confirmedClosed, undefined); assert.equal(evidence.runId, undefined);
        assert.equal(fs.existsSync(join(root, roots[0], '.insrc/tmp/test-harness/active')), false);
      } finally { fs.copyFileSync = copy; syncBuiltinESMExports(); }
    } else if (mode === 'finish') {
      const descriptor = Object.getOwnPropertyDescriptor(performance, 'now'); let now = 0;
      Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
      try {
        assert.equal(await withQualificationDeadline(async clock => {
          clock.finishWork(); now = 1000; expire(); clock.check();
          assert.equal(clock.signal.aborted, false, 'separately budgeted final drain does not restart work expiry');
          return 42;
        }, { budgetMs: 100 }), 42);
      } finally { if (descriptor) Object.defineProperty(performance, 'now', descriptor); else delete performance.now; }
      await assert.rejects(withQualificationDeadline(async () => { throw Error('controlled failure'); }), /controlled failure/);
      for (const budgetMs of [0, -1, NaN, Infinity, 1.5]) await assert.rejects(withQualificationDeadline(async () => assert.fail('not admitted'), { budgetMs }), { code: 'qualification-budget-invalid' });
    } else {
      const { executeDevWorker, devWorkerPaths, readClosedDevFailure } = await import('../../src/installer/dev-worker.ts');
      const { createDevSourceOffer, devPreparationPaths } = await import('../../src/installer/dev.ts');
      const { runtimeArchive } = await import('../../src/installer/runtime-policy.ts');
      const home = join(root, 'home'); fs.mkdirSync(home);
      const target = { os: process.platform, arch: process.arch, baseline: 'fixture' }, attemptId = randomUUID();
      const sourceOffer = createDevSourceOffer({ kind: 'dev-source', delivery: { mode: 'dev', repository: '/source', branch: 'installer' },
        sourceCommit: 'a'.repeat(40), target, runtime: { version: '22.22.1', target, sha256: runtimeArchive(target).sha256,
          relativeExecutable: process.platform === 'win32' ? 'node.exe' : 'bin/node' }, recipeVersion: 'dev-v2-app-only' });
      const record = { schemaVersion: 1, installationId: 'outer-clock', operationId: 'clock', attemptId, workerNonce: 'n'.repeat(32),
        sourceOffer, ...devPreparationPaths('clock', attemptId), coordinatorRunId: randomUUID(), stage: 'accepted' };
      const parent = join(root, 'parent'); fs.mkdirSync(parent);
      const base = createRun(parent, { mode: 'build', budgets: policy.qualification });
      const run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
      let outcome, resourceClosed = false;
      await assert.rejects(withQualificationDeadline(async clock => {
        await withRun(run, async scope => {
          clock.attach(scope);
          outcome = await executeDevWorker(home, { schemaVersion: 1, kind: 'prepare', checkpoint: record }, {
            signal: clock.signal, environment: run.environment(), work: async (worker, owned, signal) => {
              assert.notEqual(worker.runId, run.runId, 'independently owned worker'); assert.equal(signal, clock.signal);
              assert.equal((await owned.start(process.execPath, ['-e', '0'])).code, 0);
              const path = join(root, 'packaging-input'); fs.writeFileSync(path, 'controlled in-process packaging resource');
              const stream = fs.createReadStream(path); await once(stream, 'open');
              const closed = once(stream, 'close');
              const abort = () => stream.destroy(); signal.addEventListener('abort', abort, { once: true });
              try {
                assert.equal(owned.stopped, false); assert.equal(scope.stopped, false);
                if (mode === 'deadline') expire(); else process.emit(mode);
                assert.equal(owned.stopped, true); assert.equal(scope.stopped, true);
                await closed; resourceClosed = true; signal.throwIfAborted();
                assert.fail('cancelled packaging must not return an inventory');
              } finally { signal.removeEventListener('abort', abort); stream.destroy(); await closed; }
            },
          });
          clock.finishWork();
        });
      }), error => ['qualification-deadline', 'qualification-interrupted', 'harness-interrupted'].includes(error.code));
      assert.equal(outcome.outcome, 'cancelled'); assert.equal(resourceClosed, true);
      assert.equal((await readClosedDevFailure(home, record)).outcome, 'cancelled');
      const paths = devWorkerPaths(home, record);
      for (const workspace of [run.workspace, paths.workspace]) {
        const cleanup = JSON.parse(fs.readFileSync(join(workspace, 'cleanup.json'), 'utf8'));
        assert.equal(cleanup.confirmedClosed, true); assert.equal(cleanup.closureMode, 'owned-groups');
        assert.deepEqual(cleanup.evidenceErrors, []); assert.deepEqual(cleanup.cancellationErrors, []);
      }
      assert.equal(fs.existsSync(run.active), false); assert.equal(fs.existsSync(join(paths.checkout, '.insrc/tmp/test-harness/active')), false);
      assert.equal(fs.existsSync(join(home, 'releases')), false);
    }
    assert.equal(timers.size, 0, 'all work/run timers disposed');
    assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)), counts);
  } finally { globalThis.setTimeout = timeout; globalThis.clearTimeout = clear; }
}
