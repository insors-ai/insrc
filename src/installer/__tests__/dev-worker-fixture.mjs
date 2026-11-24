import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { createRun, participantContext } from '../../../scripts/test-harness/context.mjs';
import { processScope, withRun } from '../../../scripts/test-harness/process.mjs';
const { DevWorkerInput, devWorkerPaths, executeDevWorker, launchDevWorker, readVerifiedDevResult } = await import('../dev-worker.ts');
const { createDevSourceOffer, devPreparationPaths } = await import('../dev.ts');
const { canonicalJson, digest } = await import('../release-descriptor.ts');
const { runtimeArchive } = await import('../runtime-policy.ts');
const { resolveInstallationLocation } = await import('../location.ts');
const { controlBinding } = await import('../native.ts');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, ms = 10000) {
  const end = performance.now() + ms;
  while (!predicate() && performance.now() < end) await sleep(10);
  assert.ok(predicate(), 'fixture readiness timed out');
}
function stageFixture(stage, checkpoint) {
  mkdirSync(stage, { recursive: true });
  const names = ['bootstrap.mjs', 'manager.mjs', 'native/control.node', `tools/node/${checkpoint.sourceOffer.runtime.relativeExecutable}`,
    'out/daemon/index.js', 'out/cli/index.js'];
  const files = names.map(path => {
    const value = Buffer.from('controlled protocol fixture');
    mkdirSync(dirname(join(stage, path)), { recursive: true }); writeFileSync(join(stage, path), value);
    return { path, bytes: value.length, mode: 0o644, sha256: digest(value) };
  });
  const inventory = canonicalJson({ schemaVersion: 1, files }), inventorySha256 = digest(inventory);
  writeFileSync(join(stage, 'inventory.json'), inventory);
  const offer = checkpoint.sourceOffer;
  writeFileSync(join(stage, '.dev-release.json'), canonicalJson({ schemaVersion: 1, mode: 'dev', sourceOffer: offer, inventorySha256,
    checkoutRelativePath: checkpoint.checkoutRelativePath, manifest: { schemaVersion: 1, releaseId: offer.releaseId, sourceCommit: offer.sourceCommit,
      target: offer.target, runtime: offer.runtime, payloadSha256: inventorySha256, daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs',
      tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors: [], migrations: [] } }));
  return { inventorySha256 };
}

if (process.argv[2] === '--nested') {
  const context = participantContext(process.argv[3]);
  const run = { ...context, record: context, environment: () => ({ ...process.env }), assertOwner: () => participantContext(context.root) };
  const scope = processScope(run, { includeForeignActors: false });
  const child = await scope.start(process.execPath, ['-e', 'setTimeout(()=>{},30)']);
  assert.equal(child.code, 0); assert.equal(await scope.drain(), true);
} else if (process.argv[2] === '--dev-preparation-worker') {
  const channel = new DevWorkerInput(process.stdin), home = process.argv[3];
  try {
    const launch = await channel.launch, scenario = process.env.INSRC_DEV_WORKER_FIXTURE_MODE;
    const work = scenario === 'missing' ? undefined : async (run, scope, signal, stage) => {
      if (scenario === 'wait') {
        await scope.start(process.execPath, ['-e', "require('node:fs').writeFileSync('ready','yes');process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)"]);
        signal.throwIfAborted();
      } else if (scenario === 'nested') {
        assert.equal((await scope.start(process.execPath, [process.argv[1], '--nested', run.root])).code, 0);
      } else if (scenario === 'held') {
        const done = join(run.root, 'descendant-closed'), quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
        assert.equal((await scope.start('sh', ['-c', `(sleep 7; printf closed > ${quote(done)}) >/dev/null 2>&1 & exit 0`])).code, 0);
      } else {
        assert.equal((await scope.start(process.execPath, ['-e', '0'])).code, 0);
      }
      if (scenario === 'empty') return undefined;
      return stageFixture(stage, launch.checkpoint);
    };
    await executeDevWorker(home, launch, { work, signal: channel.controller.signal, environment: process.env });
  } catch (error) { process.stderr.write(`${error.code ?? 'fixture-worker-error'}: preparation refused\n`); process.exitCode = 2; }
  finally { channel.dispose(); }
} else {
  const [root, scenario] = process.argv.slice(2), home = join(root, 'home'); mkdirSync(home);
  const target = { os: process.platform, arch: process.arch, baseline: 'protocol-fixture' };
  const sourceOffer = createDevSourceOffer({ kind: 'dev-source', delivery: { mode: 'dev', repository: 'https://example.test/org/repo.git', branch: 'installer' },
    sourceCommit: 'b'.repeat(40), target, runtime: { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: process.platform === 'win32' ? 'node.exe' : 'bin/node' }, recipeVersion: 'dev-v1' });
  const record = { schemaVersion: 1, installationId: 'home', operationId: 'op', attemptId: 'attempt', workerNonce: 'n'.repeat(32),
    sourceOffer, ...devPreparationPaths('op', 'attempt'), coordinatorRunId: randomUUID(), stage: 'accepted' };
  const paths = devWorkerPaths(home, record), location = resolveInstallationLocation('home', { home });
  const parentRoot = join(root, 'parent'); mkdirSync(parentRoot);
  const parent = createRun(parentRoot, { mode: 'build' }), controller = new AbortController(), input = new PassThrough();
  const env = { ...parent.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1', INSRC_DEV_WORKER_FIXTURE_MODE: ['abort', 'eof'].includes(scenario) ? 'wait' : scenario };
  const owned = { ...parent, environment: () => env };
  await withRun(owned, async scope => {
    const pending = launchDevWorker(scope, location, record, { entrypoint: process.argv[1], signal: controller.signal, ownerInput: input, environment: env });
    if (['abort', 'eof'].includes(scenario)) {
      await until(() => existsSync(join(paths.checkout, 'ready')));
      if (scenario === 'abort') controller.abort(); else { input.resume(); input.end(); }
    }
    if (scenario === 'held') {
      await assert.rejects(pending, { code: 'preparation-uncertain' });
      assert.equal(existsSync(paths.result), false); assert.equal(existsSync(paths.active), true);
      await until(() => existsSync(join(paths.checkout, 'descendant-closed')));
      return;
    }
    const result = await pending;
    assert.equal(result.outcome, ['abort', 'eof'].includes(scenario) ? 'cancelled' : ['empty', 'missing'].includes(scenario) ? 'failed' : 'prepared');
    assert.equal(existsSync(paths.active), false);
    assert.deepEqual(readVerifiedDevResult(home, record), result);
    const admissionFile = join(paths.workspace, 'child-admissions.jsonl');
    const admissions = existsSync(admissionFile) ? readFileSync(admissionFile, 'utf8').trim().split('\n') : [];
    if (scenario === 'nested') assert.equal(admissions.length, 2);
    if (scenario === 'tamper') {
      const handle = controlBinding().acquire(paths.lock);
      try { assert.throws(() => readVerifiedDevResult(home, record), { code: 'preparation-uncertain' }); }
      finally { controlBinding().close(handle); }
      const original = readFileSync(paths.closure, 'utf8'); writeFileSync(paths.closure, original + ' ');
      assert.throws(() => readVerifiedDevResult(home, record), { code: 'preparation-uncertain' }); writeFileSync(paths.closure, original);
      assert.throws(() => readVerifiedDevResult(home, { ...record, workerNonce: 'x'.repeat(32) }), { code: 'preparation-uncertain' });
      const journal = join(paths.workspace, 'child-results.jsonl'), saved = readFileSync(journal); writeFileSync(journal, '');
      assert.throws(() => readVerifiedDevResult(home, record), { code: 'preparation-uncertain' }); writeFileSync(journal, saved);
      const cleanup = join(paths.workspace, 'cleanup.json'), savedCleanup = readFileSync(cleanup); writeFileSync(cleanup, JSON.stringify({ confirmedClosed: true, closureMode: 'legacy' }));
      assert.throws(() => readVerifiedDevResult(home, record), { code: 'preparation-uncertain' }); writeFileSync(cleanup, savedCleanup);
      for (const folder of ['src', 'out']) {
        mkdirSync(join(paths.checkout, folder)); writeFileSync(join(paths.checkout, folder, 'changed.js'), 'changed');
        assert.throws(() => readVerifiedDevResult(home, record), { code: 'preparation-uncertain' });
        rmSync(join(paths.checkout, folder), { recursive: true });
      }
      assert.deepEqual(readVerifiedDevResult(home, record), result);
    }
    assert.ok(readdirSync(home).every(name => ['dev', 'install'].includes(name)));
    assert.equal(existsSync(join(home, 'install/controller.json')), false);
  });
}
