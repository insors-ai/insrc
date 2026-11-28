import '../src/installer/qualification-time-budgets.mjs';
/** Finite qualification timing, composed with the existing retained coordinator. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALIFICATION_TIME_BUDGETS as policy } from '../src/installer/qualification-time-budgets.mjs';
import { createRun } from './test-harness/context.mjs';
import { withRun } from './test-harness/process.mjs';
import { parseArgs, runHarness } from './test-harness/run.mjs';

const minute = 60_000;
const failure = (code, message) => Object.assign(new Error(message), { code });
const positive = value => Number.isSafeInteger(value) && value > 0;
export const QUALIFICATION_CONTAINMENT = Object.freeze({
  jobMs: (policy.profile === 'slow-vm' ? 360 : 240) * minute,
  preflightMs: 40 * minute,
  setupAndDrainMs: 5 * minute,
  diagnosticsMs: 8 * minute,
  nativeMs: policy.qualification.runMs + policy.manager.cleanupMs + policy.qualification.cleanupMs,
  supervisorMs: policy.qualification.runMs + policy.manager.cleanupMs + policy.qualification.cleanupMs + 8 * minute,
});

/** The caller measures its enclosing allowance; no duration/profile multiplier. */
export function requireQualificationHeadroom(remainingMs) {
  const requiredMs = QUALIFICATION_CONTAINMENT.supervisorMs;
  if (!positive(remainingMs) || remainingMs < requiredMs) {
    throw failure('qualification-containment-insufficient', `Qualification needs ${requiredMs}ms including cleanup/diagnostics; available ${remainingMs}ms`);
  }
  return Object.freeze({ remainingMs, requiredMs });
}

/** Account for observed setup once, then measure preflight monotonically. */
export function qualificationAdmission(jobStartedAt) {
  const elapsedSetupMs = Date.now() - jobStartedAt, admittedAt = performance.now();
  if (!positive(jobStartedAt) || !Number.isSafeInteger(elapsedSetupMs) || elapsedSetupMs < 0) {
    throw failure('qualification-containment-invalid', 'Expected an observed job start timestamp');
  }
  return () => requireQualificationHeadroom(Math.floor(QUALIFICATION_CONTAINMENT.jobMs - elapsedSetupMs - (performance.now() - admittedAt)));
}

/** One work clock also aborts in-process/independently owned preparation.
 * finishWork stops this clock BEFORE withRun's separately budgeted final drain.
 * The optional exact short clock is for internal surrounding tests, never IPC/env.
 */
export async function withQualificationDeadline(work, { budgetMs = policy.qualification.runMs } = {}) {
  if (!positive(budgetMs)) throw failure('qualification-budget-invalid', 'Expected a positive finite work allowance');
  const controller = new AbortController(), expiresAt = performance.now() + budgetMs;
  let scope, finished = false;
  const expire = () => { if (!finished) controller.abort(failure('qualification-deadline', 'Qualification work allowance expired')); };
  const cancel = () => controller.abort(failure('qualification-interrupted', 'Qualification interrupted'));
  const stop = () => scope?.stop();
  const timer = setTimeout(expire, budgetMs);
  const check = () => { if (!finished && performance.now() >= expiresAt) expire(); controller.signal.throwIfAborted(); };
  controller.signal.addEventListener('abort', stop);
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const result = await work(Object.freeze({
      signal: controller.signal,
      attach(retainedScope) { scope = retainedScope; if (controller.signal.aborted) stop(); check(); },
      check,
      finishWork() { check(); finished = true; clearTimeout(timer); },
    }));
    check();
    return result;
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', stop);
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  }
}

const PREFLIGHT_FILES = ['bootstrap', 'runtime-store', 'runtime-install', 'controller-store', 'location']
  .map(name => `src/installer/__tests__/${name}.test.ts`);

/** Headers, npm ci, canonical build and selected tests share ONE owner/40min clock. */
export async function qualificationPreflight(root) {
  const selection = parseArgs(root, ['--concurrency=1', ...PREFLIGHT_FILES]);
  const cap = QUALIFICATION_CONTAINMENT.preflightMs;
  const base = createRun(root, { selectedFiles: selection.files, budgets: {
    ...policy.coordinator, runMs: cap,
    buildMs: Math.min(policy.coordinator.buildMs, cap), fileMs: Math.min(policy.coordinator.fileMs, cap),
  } });
  const run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1',
    ONNXRUNTIME_NODE_INSTALL_CUDA: process.env.ONNXRUNTIME_NODE_INSTALL_CUDA ?? 'skip' }) };
  const npmCli = join(dirname(run.runtime.executable), process.platform === 'win32'
    ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
  await withRun(run, async scope => {
    const command = async args => {
      const result = await scope.start(run.runtime.executable, args);
      assert.ok(result.code === 0 && !result.timedOut && !result.interrupted && !result.launchError, readFileSync(result.log, 'utf8'));
      return result;
    };
    const npmVersion = await command([npmCli, '--version']);
    assert.equal(readFileSync(npmVersion.log, 'utf8').trim(), '10.9.4');
    await command([join(dirname(dirname(npmCli)), 'node_modules/node-gyp/bin/node-gyp.js'), 'install', '--target=22.22.1', `--arch=${process.arch}`]);
    await command([npmCli, 'ci', '--include=dev', '--include=optional', '--no-audit', '--no-fund']);
    const result = await runHarness(run.root, selection, { ownedRun: run, ownedScope: scope, buildOptions: { npmCli } });
    assert.equal(result.code, 0, 'Native preflight coverage failed/incomplete');
  });
  const cleanup = JSON.parse(readFileSync(join(run.workspace, 'cleanup.json'), 'utf8'));
  assert.equal(cleanup.confirmedClosed, true); assert.equal(cleanup.closureMode, 'owned-groups');
  assert.deepEqual(cleanup.evidenceErrors, []); assert.deepEqual(cleanup.cancellationErrors, []);
  assert.equal(existsSync(run.active), false);
  return run;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const [started, parent, baseline] = process.argv.slice(2), jobStartedAt = Number(started);
    assert.ok(parent && baseline, 'Expected JOB_STARTED_AT_MS PARENT BASELINE');
    const admission = qualificationAdmission(jobStartedAt);
    admission();
    const run = await qualificationPreflight(realpathSync(fileURLToPath(new URL('../', import.meta.url))));
    const headroom = admission();
    writeFileSync(join(run.workspace, 'qualification-containment.json'), JSON.stringify({ profile: policy.profile,
      timeBudgets: policy, containment: QUALIFICATION_CONTAINMENT, jobStartedAt, ...headroom }) + '\n');
    const { qualifyRuntimeFoundation } = await import('./qualify-runtime-foundation.mjs');
    await qualifyRuntimeFoundation({ parent, baseline });
  } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}
