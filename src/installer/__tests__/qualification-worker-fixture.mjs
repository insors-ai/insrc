import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { QUALIFICATION_TIME_BUDGETS as policy } from '../qualification-time-budgets.mjs';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
const { launchDevWorker } = await import('../dev-worker.ts');
const { createDevSourceOffer, devPreparationPaths } = await import('../dev.ts');
const { resolveInstallationLocation } = await import('../location.ts');
const { runtimeArchive, runtimeStorePaths } = await import('../runtime-policy.ts');
const { controlBinding } = await import('../native.ts');
const [root, home, mode] = process.argv.slice(2);
const target = { os: process.platform, arch: process.arch, baseline: 'fixture' };
const location = resolveInstallationLocation('worker-budget', { home,
  ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) });
const identity = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256,
  relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
const sourceOffer = createDevSourceOffer({ kind: 'dev-source', delivery: { mode: 'dev', repository: '/source', branch: 'installer' },
  sourceCommit: 'a'.repeat(40), target, runtime: identity, recipeVersion: 'dev-v2-app-only' });
const record = () => { const attemptId = randomUUID(); return { schemaVersion: 1, installationId: location.installationId,
  operationId: 'clock', attemptId, workerNonce: 'n'.repeat(32), sourceOffer, ...devPreparationPaths('clock', attemptId),
  coordinatorRunId: randomUUID(), stage: 'accepted' }; };
const entrypoint = join(root, 'worker.mjs');

if (mode === 'remaining') {
  fs.writeFileSync(entrypoint, '// not launched by the captured admission seam');
  const completion = runtimeStorePaths(home, identity).completion, io = fs.promises, open = io.open;
  for (const [elapsed, explicit, expected] of [[9000, 800, 500], [9000, 200, 200], [11000, 800, undefined]]) {
    let reached, release, once = false, clock = 0, starts = 0, budget;
    const barrier = new Promise(resolve => { reached = resolve; }), released = new Promise(resolve => { release = resolve; });
    const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
    Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
    io.open = async (...args) => {
      const handle = await open(...args);
      if (String(args[0]) === completion && !once) { once = true; reached(); await released; }
      return handle;
    };
    syncBuiltinESMExports();
    let operation;
    try {
      const scope = { async start(_command, _args, options) { starts++; budget = options.budgetMs; return { code: 1 }; }, async drain() { return true; } };
      operation = launchDevWorker(scope, location, record(), { entrypoint, environment: process.env, budgetMs: explicit,
        deadline: Object.freeze({ expiresAt: 10000, reserveMs: 500 }) });
      const outcome = operation.then(() => assert.fail('captured failing worker must not return a prepared result'), error => error);
      await Promise.race([barrier, outcome.then(error => { throw Error(`Runtime setup barrier was not reached: ${error.code}`); })]);
      assert.equal(starts, 0); clock = elapsed; release();
      const error = await outcome;
      assert.equal(error.code, expected === undefined ? 'source-build-failed' : 'preparation-uncertain');
      assert.equal(starts, expected === undefined ? 0 : 1); assert.equal(budget, expected);
    } finally {
      release(); await operation?.catch(() => {}); io.open = open; syncBuiltinESMExports();
      if (descriptor) Object.defineProperty(performance, 'now', descriptor); else delete performance.now;
    }
  }
} else if (mode === 'reserve') {
  assert.ok(policy.manager.cleanupMs >= policy.coordinator.cleanupMs);
  if (policy.profile === 'slow-vm') { assert.equal(policy.manager.cleanupMs, 120000); assert.equal(policy.coordinator.cleanupMs, 30000); }
  const ready = join(root, 'ready'), proof = join(root, 'final-proof');
  fs.writeFileSync(entrypoint, `import fs from 'node:fs';let text='',accepted=false;const hold=setInterval(()=>{},1000);
    process.stdin.on('data',bytes=>{text+=bytes;let end;while((end=text.indexOf('\\n'))>=0){const frame=JSON.parse(text.slice(0,end));text=text.slice(end+1);
      if(frame.kind==='prepare'){accepted=true;fs.writeFileSync(${JSON.stringify(ready)},'ready');}
      else if(frame.kind==='cancel'&&accepted)setTimeout(()=>{const fd=fs.openSync(${JSON.stringify(proof)},'wx');fs.writeSync(fd,'closed');fs.fsyncSync(fd);fs.closeSync(fd);clearInterval(hold);},100);}});`);
  const base = createRun(root, { mode: 'build', budgets: { ...policy.manager, runMs: 60000, cleanupMs: 8000 } });
  const run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
  await withRun(run, async scope => {
    const abort = new AbortController();
    const pending = launchDevWorker(scope, location, record(), { entrypoint, environment: run.environment(), signal: abort.signal,
      deadline: Object.freeze({ expiresAt: performance.now() + run.budgets.runMs, reserveMs: run.budgets.cleanupMs }) });
    const rejected = assert.rejects(pending, { code: 'preparation-uncertain' });
    const limit = performance.now() + 30000;
    while (!fs.existsSync(ready) && performance.now() < limit) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(fs.existsSync(ready), 'wait for actual worker readiness before the cancellation clock');
    const start = performance.now(); abort.abort(Error('explicit stop')); scope.stop(); await rejected;
    assert.ok(performance.now() - start < run.budgets.cleanupMs);
    assert.equal(fs.readFileSync(proof, 'utf8'), 'closed');
    assert.equal(scope.cancellationErrors.length, 0); assert.equal(scope.evidenceErrors.length, 0);
  });
  const cleanup = JSON.parse(fs.readFileSync(join(run.workspace, 'cleanup.json'), 'utf8'));
  assert.equal(cleanup.confirmedClosed, true); assert.equal(fs.existsSync(run.active), false);
  const repeatedBase = createRun(root, { mode: 'build', budgets: { ...policy.manager, runMs: 60000, cleanupMs: 200 } });
  const repeated = { ...repeatedBase, environment: () => ({ ...repeatedBase.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
  await withRun(repeated, async scope => {
    const actor = join(repeated.workspace, 'actors', 'controlled-unknown.json');
    fs.mkdirSync(join(repeated.workspace, 'actors'), { recursive: true }); fs.writeFileSync(actor, 'controlled stand-in, no external process');
    assert.equal(await scope.drain(), false);
    const timer = globalThis.setTimeout; let sleeps = 0;
    globalThis.setTimeout = (...args) => { sleeps++; return timer(...args); };
    try { assert.equal(await scope.drain(), false); assert.equal(sleeps, 0, 'a repeated drain must not reset the exhausted reserve'); }
    finally { globalThis.setTimeout = timer; fs.unlinkSync(actor); }
  });
  assert.equal(JSON.parse(fs.readFileSync(join(repeated.workspace, 'cleanup.json'), 'utf8')).confirmedClosed, true);
} else if (mode === 'missing-proof') {
  const observed = join(root, 'frame.json');
  fs.writeFileSync(entrypoint, `import fs from 'node:fs';let text='';process.stdin.on('data',bytes=>{text+=bytes;if(text.includes('\\n')){
    const frame=JSON.parse(text.slice(0,text.indexOf('\\n')));fs.writeFileSync(${JSON.stringify(observed)},JSON.stringify({keys:Object.keys(frame).sort(),profile:process.env.INSRC_QUALIFICATION_PROFILE}));process.stdin.destroy();}});`);
  const base = createRun(root, { mode: 'build', budgets: { ...policy.manager, runMs: 300000 } });
  const run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
  await withRun(run, async scope => {
    await assert.rejects(launchDevWorker(scope, location, record(), { entrypoint, environment: run.environment(),
      deadline: Object.freeze({ expiresAt: performance.now() + run.budgets.runMs, reserveMs: run.budgets.cleanupMs }) }), { code: 'preparation-uncertain' });
  });
  const frame = JSON.parse(fs.readFileSync(observed, 'utf8'));
  assert.deepEqual(frame.keys, ['checkpoint', 'kind', 'schemaVersion']); assert.equal(frame.profile, policy.profile);
  assert.equal(fs.existsSync(join(home, 'releases')), false);
  assert.equal(JSON.parse(fs.readFileSync(join(run.workspace, 'cleanup.json'), 'utf8')).confirmedClosed, true);
} else { throw Error('Unknown worker budget fixture'); }
