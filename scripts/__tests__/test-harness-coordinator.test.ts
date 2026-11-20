import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createRun } from '../test-harness/context.mjs';
import { prepareBuild, requirePreparedBuild } from '../test-harness/build.mjs';
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
			child.kill(signal);
			const [code] = await ended;
			assert.equal(code, 1, output);
			assert.equal(existsSync(join(root, '.insrc/tmp/test-harness/active')), false);
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

test('Selector deduplication, explicit budgets and bounded concurrency reject invalid admission', t => {
	const root = rootFixture(t);
	assert.equal(parseArgs(root, ['src/__tests__/a.test.ts', 'src/__tests__/a.test.ts']).files.length, 1);
	assert.equal(parseArgs(root, ['--file-ms=1200000', 'src/__tests__/a.test.ts']).budgets.fileMs, 1200000);
	for (const args of [['--concurrency=0'], ['--concurrency=5'], ['--file-ms=0'], ['../foreign.test.ts'], ['src/empty/*.test.ts']]) assert.throws(() => parseArgs(root, args));
	assert.equal(existsSync(join(root, '.insrc')), false);
});
