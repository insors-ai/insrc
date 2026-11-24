import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createRun } from '../test-harness/context.mjs';
import { prepareBuild, publishPrepared, REQUIRED_ARTIFACTS } from '../test-harness/build.mjs';
import { withRun } from '../test-harness/process.mjs';
import { MUTATION_FILE, parseArgs, runHarness } from '../test-harness/run.mjs';

const urls = Object.fromEntries(['run', 'context', 'process', 'build'].map(name => [name, pathToFileURL(resolve(`scripts/test-harness/${name}.mjs`)).href]));
function rootFixture(t: { after: (fn: () => void) => void }) {
	const root = mkdtempSync(join(tmpdir(), 'insrc-coordinator-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const file of ['src/__tests__/a.test.ts', 'src/__tests__/b.test.ts', MUTATION_FILE]) { mkdirSync(resolve(root, file, '..'), { recursive: true }); writeFileSync(join(root, file), ''); }
	writeFileSync(join(root, 'package.json'), '{"type":"module"}');
	return root;
}
const options = { stages: [['-e', "const f=require('node:fs');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/helper','prepared');f.appendFileSync('events','build\\n');"]], requiredArtifacts: ['out/helper'] };

test('Prepared build excludes simultaneous writers and readers, validates helpers and rejects fingerprint drift', async t => {
	const root = rootFixture(t), run = createRun(root);
	await withRun(run, async scope => {
		const first = prepareBuild(run, scope, { ...options, stages: [['-e', 'setTimeout(()=>{},100)'], ...options.stages] });
		await assert.rejects(prepareBuild(run, scope, options), { code: 'harness-busy' });
		await first;
		assert.throws(() => createRun(root), { code: 'harness-busy' });
		run.transition('reading');
		const env = run.environment();
		const result = await scope.start(run.runtime.executable, ['--input-type=module', '-e', `import {requirePreparedBuild,mainBuild} from ${JSON.stringify(urls.build)};requirePreparedBuild(process.cwd());try{await mainBuild(process.cwd());process.exitCode=9}catch(e){if(e.code!=='harness-write-during-read')throw e}`], { env });
		assert.equal(result.code, 0);
		writeFileSync(join(root, 'out/helper'), 'foreign mutation');
		const drift = await scope.start(run.runtime.executable, ['--input-type=module', '-e', `import {requirePreparedBuild} from ${JSON.stringify(urls.build)};try{requirePreparedBuild(process.cwd());process.exitCode=9}catch(e){if(e.code!=='harness-build-drift')throw e}`]);
		assert.equal(drift.code, 0);
	});
	assert.equal(existsSync(join(root, '.insrc/tmp/test-harness/active')), false);
	const missing = createRun(root);
	await assert.rejects(withRun(missing, scope => prepareBuild(missing, scope, { stages: [], requiredArtifacts: ['out/missing'] })), { code: 'harness-build-incomplete' });
});

test('Output mutation lane precedes ordinary prepared readers and source drift never passes', async t => {
	const root = rootFixture(t);
	const selection = parseArgs(root, [MUTATION_FILE, 'src/__tests__/a.test.ts']);
	const result = await runHarness(root, selection, { buildOptions: options, testArgs: file => ['--input-type=module', '-e', file === MUTATION_FILE
		? `import fs from 'node:fs';import {participantContext} from ${JSON.stringify(urls.context)};if(participantContext().phase!=='mutating')throw Error('phase');fs.writeFileSync('out/helper','mutated');fs.appendFileSync('events','mutation\\n');`
		: `import fs from 'node:fs';import {requirePreparedBuild} from ${JSON.stringify(urls.build)};requirePreparedBuild(process.cwd());if(fs.readFileSync('out/helper','utf8')!=='mutated')throw Error('not refreshed');fs.appendFileSync('events','reader\\n');`] });
	assert.equal(result.code, 0);
	assert.deepEqual(readFileSync(join(root, 'events'), 'utf8').trim().split('\n'), ['build', 'mutation', 'reader']);
	await assert.rejects(runHarness(root, parseArgs(root, [MUTATION_FILE]), { buildOptions: options, testArgs: () => ['-e', "require('node:fs').writeFileSync('src/__tests__/a.test.ts','mutation lane source drift')"] }), { code: 'harness-build-drift' });
	await assert.rejects(runHarness(root, parseArgs(root, ['src/__tests__/a.test.ts']), { buildOptions: options, testArgs: () => ['-e', "require('node:fs').writeFileSync('src/__tests__/a.test.ts','source changed')"] }), { code: 'harness-build-drift' });
});

async function waitReady(path: string) {
	const end = Date.now() + 5000;
	while (!existsSync(path) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
	assert.equal(existsSync(path), true, 'disposable child must reach readiness');
}

test('SIGINT/SIGTERM and deadline drain registered actors or retain blocked incomplete outcome', { timeout: 20000 }, async t => {
	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		const root = rootFixture(t);
		const script = `import {runHarness,parseArgs} from ${JSON.stringify(urls.run)};try{await runHarness(process.argv[1],parseArgs(process.argv[1],['--cleanup-ms=100','src/__tests__/a.test.ts']),{buildOptions:${JSON.stringify(options)},testArgs:()=>['-e',"require('node:fs').writeFileSync('ready','yes');process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"]});process.exitCode=9}catch(e){process.stderr.write(e.code);process.exitCode=e.code==='harness-interrupted'?1:8}`;
		const child = spawn(process.execPath, ['--input-type=module', '-e', script, root], { stdio: ['ignore', 'pipe', 'pipe'] });
		let output = ''; child.stderr.on('data', data => { output += data; });
		try {
			const ended = once(child, 'close');
			await waitReady(join(root, 'ready'));
			const record = JSON.parse(readFileSync(join(root, '.insrc/tmp/test-harness/active/run.json'), 'utf8'));
			child.kill(signal);
			const [code] = await ended;
			assert.equal(code, 1, output);
			assert.equal(existsSync(join(root, '.insrc/tmp/test-harness/active')), false);
			assert.equal(JSON.parse(readFileSync(join(record.workspace, 'cleanup.json'), 'utf8')).confirmedClosed, true);
			const closes = readFileSync(join(record.workspace, 'child-results.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
			assert.ok(closes.some(close => close.signal === 'SIGKILL'), 'actual escalated child closure is recorded');
		} finally { if (child.exitCode === null && child.signalCode === null) { const ended = once(child, 'close'); child.kill('SIGKILL'); await ended; } }
	}
	const root = rootFixture(t);
	const result = await runHarness(root, parseArgs(root, ['--file-ms=200','--cleanup-ms=50','src/__tests__/a.test.ts']), { buildOptions: options, testArgs: () => ['-e', 'setInterval(()=>{},1000)'] });
	assert.equal(result.code, 1); assert.equal(result.results[0].timedOut, true);
	const cleanup = JSON.parse(readFileSync(join(result.workspace, 'cleanup.json'), 'utf8'));
	assert.equal(cleanup.confirmedClosed, true);
	await assert.rejects(runHarness(root, parseArgs(root, ['--run-ms=250','--cleanup-ms=50','src/__tests__/a.test.ts']), { buildOptions: options, testArgs: () => ['-e', 'setInterval(()=>{},1000)'] }), { code: 'harness-interrupted' });
	const blocked = createRun(root);
	await assert.rejects(withRun(blocked, async () => { mkdirSync(join(blocked.workspace, 'actors')); writeFileSync(join(blocked.workspace, 'actors', 'unacknowledged.json'), '{}'); }), { code: 'harness-cleanup-unconfirmed' });
	assert.equal(JSON.parse(readFileSync(join(blocked.active, 'run.json'), 'utf8')).phase, 'blocked');
});

test('Missing TAP destinations and failed build stages retain logs, actual closure and unavailable coverage', async t => {
	const root = rootFixture(t);
	const selection = parseArgs(root, ['--test-reporter-destination=missing.tap', 'src/__tests__/a.test.ts']);
	const result = await runHarness(root, selection, { buildOptions: options, testArgs: () => ['-e', "process.stdout.write('failed fixture output');process.exitCode=7"] });
	assert.equal(result.code, 1);
	const report = JSON.parse(readFileSync(join(result.workspace, 'results.json'), 'utf8'));
	assert.equal(report.results[0].code, 7);
	assert.equal(report.results[0].coverage.status, 'unavailable');
	assert.equal(report.results[0].coverage.error, 'ENOENT');
	assert.match(readFileSync(join(root, report.results[0].log), 'utf8'), /failed fixture output/);
	const closes = readFileSync(join(result.workspace, 'child-results.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
	assert.equal(closes.find(close => close.childId === report.results[0].childId).code, 7);
	const run = createRun(root);
	await assert.rejects(withRun(run, scope => prepareBuild(run, scope, { ...options, stages: [['-e', "process.stderr.write('build failure detail');process.exitCode=17"]] })), { code: 'harness-build-failed' });
	const failure = JSON.parse(readFileSync(join(run.workspace, 'child-results.jsonl'), 'utf8').trim());
	assert.equal(failure.code, 17);
	assert.match(readFileSync(failure.log, 'utf8'), /build failure detail/);
	assert.equal(JSON.parse(readFileSync(join(run.workspace, 'cleanup.json'), 'utf8')).confirmedClosed, true);
});

test('Selector deduplication, explicit budgets and bounded concurrency reject invalid admission', t => {
	const root = rootFixture(t);
	assert.equal(parseArgs(root, ['src/__tests__/a.test.ts', 'src/__tests__/a.test.ts']).files.length, 1);
	assert.equal(parseArgs(root, ['--file-ms=1200000', 'src/__tests__/a.test.ts']).budgets.fileMs, 1200000);
	for (const args of [['--concurrency=0'], ['--concurrency=5'], ['--file-ms=0'], ['../foreign.test.ts'], ['src/empty/*.test.ts']]) assert.throws(() => parseArgs(root, args));
	assert.equal(existsSync(join(root, '.insrc')), false);
});

test('A timed-out writer retains its reservation until its child closes', { timeout: 5000 }, async t => {
	const root = rootFixture(t), run = createRun(root, { budgets: { buildMs: 300, cleanupMs: 600 } });
	await withRun(run, async scope => {
		const first = prepareBuild(run, scope, { ...options, stages: [['-e', "require('node:fs').writeFileSync('writer-ready','yes');process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"]] });
		const rejected = assert.rejects(first, { code: 'harness-build-failed' });
		await waitReady(join(root, 'writer-ready'));
		await new Promise(resolve => setTimeout(resolve, 350));
		assert.equal(existsSync(join(run.active, 'writer')), true);
		await assert.rejects(prepareBuild(run, scope, options), { code: 'harness-busy' });
		await rejected;
		assert.equal(existsSync(join(run.active, 'writer')), false);
	});
});

test('Default prepared output requires the host native installer control binding', async t => {
	const root = rootFixture(t), run = createRun(root);
	const missing = 'out/installer/native/control.node';
	for (const file of REQUIRED_ARTIFACTS.filter(file => file !== missing)) { mkdirSync(resolve(root, file, '..'), { recursive: true }); writeFileSync(join(root, file), 'fixture prerequisite'); }
	await withRun(run, async () => { assert.throws(() => publishPrepared(run), error => error.code === 'harness-build-incomplete' && error.message.includes(missing)); });
});

test('Explicit live opt-in admits files serially without enabling services in the control', async t => {
	const root = rootFixture(t), selection = parseArgs(root, ['--concurrency=4', 'src/__tests__/a.test.ts', 'src/__tests__/b.test.ts']);
	const run = createRun(root, { selectedFiles: selection.files });
	const environment = run.environment;
	run.environment = () => ({ ...environment(), INSRC_LIVE_TESTS: '1' });
	// These disposable children never import or call a provider.
	await withRun(run, async scope => {
		const result = await runHarness(root, selection, { ownedRun: run, ownedScope: scope, buildOptions: options, testArgs: file => ['-e', `const f=require('node:fs');f.appendFileSync('events','start:'+${JSON.stringify(file)}+'\\n');setTimeout(()=>f.appendFileSync('events','end:'+${JSON.stringify(file)}+'\\n'),200);`] });
		assert.equal(result.code, 0);
	});
	assert.deepEqual(readFileSync(join(root, 'events'), 'utf8').trim().split('\n'), ['build', 'start:src/__tests__/a.test.ts', 'end:src/__tests__/a.test.ts', 'start:src/__tests__/b.test.ts', 'end:src/__tests__/b.test.ts']);
	const report = JSON.parse(readFileSync(join(run.workspace, 'results.json'), 'utf8'));
	assert.equal(report.requestedConcurrency, 4); assert.equal(report.effectiveConcurrency, 1); assert.equal(report.liveTests, '1');
});

test('Retained owned group drains after leader exit, including inherited output pipes', { skip: process.platform === 'win32' ? 'POSIX group qualification' : false }, async t => {
  for (const pipes of [false, true]) {
    const root = rootFixture(t), base = createRun(root, { budgets: { cleanupMs: 1000, fileMs: 3000 } });
    const run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
    const release = join(root, 'release'), ready = join(root, 'group-ready'), ended = join(root, 'group-ended'), signalled = join(root, 'group-signalled');
    const descendant = `const f=require('node:fs');process.on('SIGTERM',()=>{f.writeFileSync(${JSON.stringify(signalled)},'yes');process.exit(0)});process.on('exit',()=>f.writeFileSync(${JSON.stringify(ended)},'yes'));f.writeFileSync(${JSON.stringify(ready)},'yes');setInterval(()=>{if(f.existsSync(${JSON.stringify(release)}))process.exit(0)},10);`;
    const leader = `const f=require('node:fs');require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:false,stdio:${JSON.stringify(pipes ? 'inherit' : 'ignore')}});const t=setInterval(()=>{if(f.existsSync(${JSON.stringify(ready)})){clearInterval(t);process.exit(0)}},10);`;
    await withRun(run, async scope => {
      try {
        const result = await scope.start(process.execPath, ['-e', leader], pipes ? { outputLimitBytes: 1024 } : {});
        assert.equal(result.code, 0); assert.equal(result.timedOut, false);
        assert.equal(await scope.drain(), true);
        assert.equal(existsSync(signalled), true); assert.equal(existsSync(ended), true);
      } finally {
        writeFileSync(release, 'release');
        assert.equal(await scope.drain(), true, 'fixture group must be confirmed closed');
      }
    });
    assert.equal(JSON.parse(readFileSync(join(run.workspace, 'cleanup.json'), 'utf8')).confirmedClosed, true);
  }
});

test('Whole preparation budget spans commands and deadline cancellation uses owner channel', async t => {
  const root = rootFixture(t), base = createRun(root, { budgets: { fileMs: 50, runMs: 6000, cleanupMs: 1000 } });
  const run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
  await withRun(run, async scope => {
    const valid = await scope.start(process.execPath, ['-e', 'setTimeout(()=>setTimeout(()=>{},150),150)'], { budgetMs: 1500 });
    assert.equal(valid.code, 0); assert.equal(valid.timedOut, false, 'whole job may exceed its per-command default');
    const program = "const f=require('node:fs');let input='';process.on('SIGTERM',()=>{f.writeFileSync('raw-signal','yes');process.exit(9)});process.stdin.on('data',chunk=>{input+=chunk;if(input.includes('cancel\\n')){f.writeFileSync('cooperatively-cancelled','yes');process.exit(0)}});";
    const cancelled = await scope.start(process.execPath, ['-e', program], { budgetMs: 1000,
      ownerChannel: { initial: 'start\n', cancel: 'cancel\n', connect: () => () => {} } });
    assert.equal(cancelled.timedOut, true); assert.equal(await scope.drain(), true);
    assert.equal(existsSync(join(root, 'cooperatively-cancelled')), true);
    assert.equal(existsSync(join(root, 'raw-signal')), false);
    const closed = readFileSync(join(run.workspace, 'child-results.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(closed.at(-1).code, 0); assert.equal(closed.at(-1).signal, null);
  });
});
