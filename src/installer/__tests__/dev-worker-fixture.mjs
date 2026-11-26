import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { createRun, participantContext } from '../../../scripts/test-harness/context.mjs';
import { processScope, withRun } from '../../../scripts/test-harness/process.mjs';
import { traceFlushes } from './_flush-fixture.mjs';
const { DevWorkerInput, devWorkerPaths, executeDevWorker, launchDevWorker, readVerifiedDevResult, requireClosedDevAttempt } = await import('../dev-worker.ts');
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
  const names = ['bootstrap.mjs', 'manager.mjs', 'native/control.node',
    'out/daemon/index.js', 'out/cli/index.js', 'data/required.txt'];
  const files = names.map(path => {
    const value = Buffer.from('controlled protocol fixture');
    mkdirSync(dirname(join(stage, path)), { recursive: true }); writeFileSync(join(stage, path), value);
    return { path, bytes: value.length, mode: 0o644, sha256: digest(value) };
  });
  const inventory = canonicalJson({ schemaVersion: 1, files }), inventorySha256 = digest(inventory);
  writeFileSync(join(stage, 'inventory.json'), inventory);
  const offer = checkpoint.sourceOffer;
  writeFileSync(join(stage, '.dev-release.json'), canonicalJson({ schemaVersion: 2, mode: 'dev', sourceOffer: offer, inventorySha256,
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
        // Missing cooperating-actor evidence is genuinely unconfirmed. A
        // killable descendant in our retained POSIX group must instead drain.
        assert.equal((await scope.start(process.execPath, ['-e', '0'])).code, 0);
        mkdirSync(join(run.workspace,'actors'),{recursive:true});
        writeFileSync(join(run.workspace,'actors','unconfirmed.fixture.json'),JSON.stringify({runId:run.runId,kind:'unconfirmed-fixture'}));
      } else if (scenario === 'unregistered-detached') {
        const folder = devWorkerPaths(home, launch.checkpoint).privateRoot;
        const ready = join(folder, 'fixture-detached-ready'), release = join(folder, 'fixture-detached-release'), ended = join(folder, 'fixture-detached-ended');
        // This process intentionally never registers. Its own release protocol
        // and deadline belong to this boundary fixture, not installer cleanup.
        const descendant = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(ready)},'ready');const deadline=Date.now()+15000;const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})||Date.now()>deadline){clearInterval(t);fs.writeFileSync(${JSON.stringify(ended)},'ended');}},10);`;
        const command = `const cp=require('node:child_process'),fs=require('node:fs');const child=cp.spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'});child.unref();const deadline=Date.now()+5000;const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(ready)})){clearInterval(t);}else if(Date.now()>deadline){clearInterval(t);process.exitCode=1;}},10);`;
        assert.equal((await scope.start(process.execPath, ['-e', command])).code, 0);
      } else {
        assert.equal((await scope.start(process.execPath, ['-e', '0'])).code, 0);
      }
      if (scenario === 'empty') return undefined;
      const output = stageFixture(stage, launch.checkpoint);
      if (scenario === 'missing-file') rmSync(join(stage, 'data/required.txt'));
      if (scenario === 'tampered-file') writeFileSync(join(stage, 'data/required.txt'), 'x'.repeat(Buffer.byteLength('controlled protocol fixture')));
      if (scenario === 'wrong-size') writeFileSync(join(stage, 'data/required.txt'), 'too short');
      if (scenario === 'extra-file') writeFileSync(join(stage, 'extra.txt'), 'unexpected');
      return output;
    };
    const paths = devWorkerPaths(home, launch.checkpoint);
    const trace = ['durable-proof','flush-failure','directory-failure'].includes(scenario) ? traceFlushes(event =>
      scenario==='flush-failure' && event.path.startsWith(paths.result+'.') && !event.directory
      || scenario==='directory-failure' && event.directory && event.path===paths.privateRoot && existsSync(paths.result)) : undefined;
    try {
      await executeDevWorker(home, launch, { work, signal: channel.controller.signal, environment: process.env });
    } finally {
      trace?.restore(); if(trace)writeFileSync(join(paths.privateRoot,'flush-events.json'),JSON.stringify(trace.events));
    }
  } catch (error) { process.stderr.write(`${error.code ?? 'fixture-worker-error'}: preparation refused\n`); process.exitCode = 2; }
  finally { channel.dispose(); }
} else {
  const [root, scenario] = process.argv.slice(2), home = join(root, 'home'); mkdirSync(home);
  const target = { os: process.platform, arch: process.arch, baseline: 'protocol-fixture' };
  const sourceOffer = createDevSourceOffer({ kind: 'dev-source', delivery: { mode: 'dev', repository: 'https://example.test/org/repo.git', branch: 'installer' },
    sourceCommit: 'b'.repeat(40), target, runtime: { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: process.platform === 'win32' ? 'node.exe' : 'bin/node' }, recipeVersion: 'dev-v2-app-only' });
  const record = { schemaVersion: 1, installationId: 'home', operationId: 'op', attemptId: 'attempt', workerNonce: 'n'.repeat(32),
    sourceOffer, ...devPreparationPaths('op', 'attempt'), coordinatorRunId: randomUUID(), stage: 'accepted' };
  const { devRuntimeFixture } = await import('./_dev-runtime-fixture.ts');
  await devRuntimeFixture(home, target, 'home');
  const paths = devWorkerPaths(home, record), location = resolveInstallationLocation('home', { home });
  const parentRoot = join(root, 'parent'); mkdirSync(parentRoot);
  const parent = createRun(parentRoot, { mode: 'build' }), controller = new AbortController(), input = new PassThrough();
  const env = { ...parent.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1', INSRC_DEV_WORKER_FIXTURE_MODE: ['abort', 'eof'].includes(scenario) ? 'wait' : scenario };
  const owned = { ...parent, environment: () => env };
  try { await withRun(owned, async scope => {
    const launchOptions = { entrypoint: process.argv[1], signal: controller.signal, ownerInput: input, environment: env };
    if (scenario === 'foreign') {
      await assert.rejects(launchDevWorker(scope, location, { ...record, installationId: 'foreign' }, launchOptions), { code: 'preparation-uncertain' });
      await assert.rejects(launchDevWorker(scope, location, { ...record, sourceOffer: { ...record.sourceOffer, sourceSha256: 'f'.repeat(64) } }, launchOptions));
      assert.equal(existsSync(paths.identity), false);
    }
    const pending = launchDevWorker(scope, location, record, { entrypoint: process.argv[1], signal: controller.signal, ownerInput: input, environment: env });
    if (['abort', 'eof'].includes(scenario)) {
      await until(() => existsSync(join(paths.checkout, 'ready')));
      if (scenario === 'abort') controller.abort(); else { input.resume(); input.end(); }
    }
    if (scenario === 'held') {
      await assert.rejects(pending, { code: 'preparation-uncertain' });
      assert.equal(existsSync(paths.result), false); assert.equal(existsSync(paths.active), true);
      await assert.rejects(launchDevWorker(scope, location, record, launchOptions), { code: 'preparation-uncertain' });
      await assert.rejects(requireClosedDevAttempt(home, record, 'cleanup'), { code: 'preparation-uncertain' });
      assert.equal(existsSync(paths.active), true); assert.equal(existsSync(paths.checkout), true);
      rmSync(join(paths.workspace,'actors','unconfirmed.fixture.json'));
      return;
    }
    if (scenario === 'flush-failure') {
      await assert.rejects(pending,{code:'preparation-uncertain'});
      assert.equal(existsSync(paths.result),false);assert.equal(existsSync(paths.active),false);
      const events=JSON.parse(readFileSync(join(paths.privateRoot,'flush-events.json'),'utf8'));
      assert.ok(events.some(event=>event.path.startsWith(paths.result+'.')));
      await assert.rejects(readVerifiedDevResult(home,record),{code:'preparation-uncertain'});
      return;
    }
    if (scenario === 'directory-failure') {
      await assert.rejects(pending,{code:'preparation-uncertain'});
      assert.equal(existsSync(paths.result),true);assert.equal(existsSync(paths.active),false);
      const trace=traceFlushes(event=>event.directory&&event.path===paths.privateRoot);
      try {await assert.rejects(readVerifiedDevResult(home,record),{code:'preparation-uncertain'});} finally{trace.restore();}
      assert.equal((await readVerifiedDevResult(home,record)).outcome,'prepared','explicit reconciliation must durably flush the observed result');
      return;
    }
    const result = await pending;
    assert.equal(result.outcome, ['abort', 'eof'].includes(scenario) ? 'cancelled' : ['empty', 'missing', 'missing-file', 'tampered-file', 'wrong-size', 'extra-file'].includes(scenario) ? 'failed' : 'prepared');
    assert.equal(existsSync(paths.active), false);
    assert.deepEqual(await readVerifiedDevResult(home, record), result);
    const admissionFile = join(paths.workspace, 'child-admissions.jsonl');
    const admissions = existsSync(admissionFile) ? readFileSync(admissionFile, 'utf8').trim().split('\n') : [];
    if (scenario === 'nested') assert.equal(admissions.length, 2);
    if (scenario === 'durable-proof') {
      const events=JSON.parse(readFileSync(join(paths.privateRoot,'flush-events.json'),'utf8'));
      const resultFlush=events.findIndex(event=>event.path.startsWith(paths.result+'.')&&!event.directory);
      assert.ok(resultFlush>=0);
      for(const name of ['cleanup.json','child-admissions.jsonl','child-results.jsonl','child-disposals.jsonl'])
        assert.ok(events.findIndex(event=>event.path===join(paths.workspace,name)&&!event.directory)<resultFlush && events.some(event=>event.path===join(paths.workspace,name)),name+' must precede result publication');
      if(process.platform!=='win32') {
        assert.ok(events.slice(0,resultFlush).some(event=>event.path===paths.workspace&&event.directory));
        assert.ok(events.slice(resultFlush+1).some(event=>event.path===paths.privateRoot&&event.directory));
      }
    }
    if (scenario === 'unregistered-detached') {
      assert.equal(admissions.length, 1);
      assert.equal(existsSync(join(paths.privateRoot, 'fixture-detached-ready')), true);
      assert.equal(existsSync(join(paths.privateRoot, 'fixture-detached-ended')), false);
      assert.equal(JSON.parse(readFileSync(join(paths.workspace, 'cleanup.json'), 'utf8')).closureMode, 'owned-groups');
    }
    if (scenario === 'tamper') {
      const handle = controlBinding().acquire(paths.lock);
      try {
        await assert.rejects(requireClosedDevAttempt(home, record, 'retry'), { code: 'preparation-uncertain' });
        await assert.rejects(requireClosedDevAttempt(home, record, 'cleanup'), { code: 'preparation-uncertain' });
        await assert.rejects(launchDevWorker(scope, location, record, launchOptions), { code: 'preparation-uncertain' });
      }
      finally { controlBinding().close(handle); }
      const original = readFileSync(paths.closure, 'utf8'); writeFileSync(paths.closure, original + ' ');
      await assert.rejects(requireClosedDevAttempt(home, record, 'retry'), { code: 'preparation-uncertain' });
      await assert.rejects(requireClosedDevAttempt(home, record, 'cleanup'), { code: 'preparation-uncertain' }); writeFileSync(paths.closure, original);
      await assert.rejects(readVerifiedDevResult(home, { ...record, workerNonce: 'x'.repeat(32) }), { code: 'preparation-uncertain' });
      const journal = join(paths.workspace, 'child-results.jsonl'), saved = readFileSync(journal); writeFileSync(journal, '');
      await assert.rejects(requireClosedDevAttempt(home, record, 'retry'), { code: 'preparation-uncertain' });
      await assert.rejects(requireClosedDevAttempt(home, record, 'cleanup'), { code: 'preparation-uncertain' }); writeFileSync(journal, saved);
      const cleanup = join(paths.workspace, 'cleanup.json'), savedCleanup = readFileSync(cleanup); writeFileSync(cleanup, JSON.stringify({ confirmedClosed: true, closureMode: 'legacy' }));
      await assert.rejects(requireClosedDevAttempt(home, record, 'retry'), { code: 'preparation-uncertain' });
      await assert.rejects(requireClosedDevAttempt(home, record, 'cleanup'), { code: 'preparation-uncertain' }); writeFileSync(cleanup, savedCleanup);
      for (const folder of ['src', 'out']) {
        mkdirSync(join(paths.checkout, folder)); writeFileSync(join(paths.checkout, folder, 'changed.js'), 'changed');
        await assert.rejects(readVerifiedDevResult(home, record), { code: 'preparation-uncertain' });
        rmSync(join(paths.checkout, folder), { recursive: true });
      }
      assert.deepEqual(await readVerifiedDevResult(home, record), result);
    }
    assert.ok(readdirSync(home).every(name => ['dev', 'install', 'runtimes'].includes(name)));
    assert.equal(existsSync(join(home, 'install/controller.json')), false);
  }); } finally {
    if (scenario === 'unregistered-detached' && existsSync(join(paths.privateRoot, 'fixture-detached-ready'))) {
      writeFileSync(join(paths.privateRoot, 'fixture-detached-release'), 'release');
      await until(() => existsSync(join(paths.privateRoot, 'fixture-detached-ended')));
    }
  }
}
