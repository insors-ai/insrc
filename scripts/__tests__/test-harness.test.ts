import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// Script modules deliberately live outside the application's TypeScript include.
import { assertSupportedVersion, checkedBudgets, childEnvironment, createRun, recoverRun, runtimeContext } from '../test-harness/context.mjs';
import { compileProbe } from '../test-harness/probe.mjs';

const moduleUrl = pathToFileURL(resolve('scripts/test-harness/context.mjs')).href;
function temporary(t: { after: (fn: () => void) => void }) {
	const root = mkdtempSync(join(tmpdir(), 'insrc-harness-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	return root;
}

test('Canonical-path contenders refuse overlap and preserve foreign/replaced/symlinked ownership', t => {
	const root = temporary(t), alias = `${root}-alias`;
	symlinkSync(root, alias);
	t.after(() => rmSync(alias, { force: true }));
	const run = createRun(root);
	const original = readFileSync(join(run.active, 'run.json'), 'utf8');
	const contender = spawnSync(process.execPath, ['--input-type=module', '-e', `import {createRun} from ${JSON.stringify(moduleUrl)}; try {createRun(process.argv[1]); process.exit(9)} catch(e) {process.stdout.write(e.code); process.exit(e.code==='harness-busy'?0:8)}`, alias], { encoding: 'utf8', timeout: 5000 });
	assert.equal(contender.status, 0, contender.stderr);
	assert.equal(contender.stdout, 'harness-busy');
	assert.equal(readFileSync(join(run.active, 'run.json'), 'utf8'), original);
	renameSync(run.active, `${run.active}-original`);
	symlinkSync(`${run.active}-original`, run.active);
	assert.throws(() => run.transition('draining'), { code: 'harness-context-invalid' });
	assert.throws(() => run.release({ confirmedClosed: true }), { code: 'harness-context-invalid' });
	assert.equal(readFileSync(join(run.active, 'run.json'), 'utf8'), original);
	rmSync(run.active);
	renameSync(`${run.active}-original`, run.active);
	const replacement = { ...JSON.parse(original), runId: '00000000-0000-0000-0000-000000000000' };
	writeFileSync(join(run.active, 'run.json'), JSON.stringify(replacement));
	assert.throws(() => run.transition('draining'), { code: 'harness-context-invalid' });
	assert.equal(JSON.parse(readFileSync(join(run.active, 'run.json'), 'utf8')).runId, replacement.runId);
});

test('Unsupported Node refuses before mutation and child environment resolves selected runtime', t => {
	const root = temporary(t);
	const unsupported = spawnSync(process.execPath, ['--input-type=module', '-e', `import {createRun} from ${JSON.stringify(moduleUrl)}; Object.defineProperty(process,'version',{value:'v26.0.0'}); try {createRun(process.argv[1]);process.exit(9)}catch(e){process.stdout.write(e.code);process.exit(e.code==='harness-runtime-unsupported'?0:8)}`, root], { encoding: 'utf8', timeout: 5000 });
	assert.equal(unsupported.status, 0, unsupported.stderr);
	assert.equal(existsSync(join(root, '.insrc')), false);
	for (const version of ['v20.20.0', 'v22.21.9', 'v22.22.0', 'v23.1.0', 'invalid']) assert.throws(() => assertSupportedVersion(version), { code: 'harness-runtime-unsupported' });
	assertSupportedVersion('v22.22.1');
	assertSupportedVersion('v22.23.2');
	const inherited = { PATH: '/untrusted-first', DEBUG: 'private-value', NODE_OPTIONS: '--require /private', GRPC_TRACE: 'private-trace', INSRC_LIVE_TESTS: '1' };
	const runtime = runtimeContext(), env = childEnvironment(runtime, inherited);
	assert.equal(inherited.DEBUG, 'private-value');
	assert.equal(env.DEBUG, undefined);
	assert.equal(env.NODE_OPTIONS, undefined);
	assert.equal(env.GRPC_TRACE, undefined);
	assert.equal(env.INSRC_LIVE_TESTS, '1');
	const run = createRun(root);
	assert.doesNotMatch(JSON.stringify(run.record), /private-value|private-trace|--require \/private/);
	run.transition('draining');
	run.release({ confirmedClosed: true });
	const nested = spawnSync('node', ['-p', 'JSON.stringify({exe:process.execPath,version:process.version,live:process.env.INSRC_LIVE_TESTS,debug:process.env.DEBUG})'], { env, encoding: 'utf8', timeout: 5000 });
	assert.equal(nested.status, 0, nested.stderr);
	assert.deepEqual(JSON.parse(nested.stdout), { exe: runtime.executable, version: runtime.version, live: '1' });
	assert.throws(() => checkedBudgets({ fileMs: 0 }), { code: 'harness-context-invalid' });
	assert.throws(() => checkedBudgets({ unknown: 1 }), { code: 'harness-context-invalid' });
});

test('Abandoned ownership cannot be stolen by age or PID absence', t => {
	const root = temporary(t);
	const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {createRun} from ${JSON.stringify(moduleUrl)}; const r=createRun(process.argv[1]);process.stdout.write(JSON.stringify({runId:r.runId,active:r.active}));`, root], { encoding: 'utf8', timeout: 5000 });
	assert.equal(child.status, 0, child.stderr);
	const abandoned = JSON.parse(child.stdout);
	const path = join(abandoned.active, 'run.json');
	const record = JSON.parse(readFileSync(path, 'utf8'));
	writeFileSync(path, JSON.stringify({ ...record, pid: 2147483647, createdAt: '1970-01-01T00:00:00.000Z' }));
	assert.throws(() => createRun(root), { code: 'harness-busy' });
	assert.throws(() => recoverRun(root, { runId: abandoned.runId }), { code: 'harness-cleanup-unconfirmed' });
	assert.throws(() => recoverRun(root, { runId: 'wrong', confirmedActorsEnded: true }), { code: 'harness-context-invalid' });
	mkdirSync(join(abandoned.active, 'writer'));
	writeFileSync(join(abandoned.active, 'unknown'), 'foreign entry');
	const beforeRecovery = readFileSync(path, 'utf8');
	assert.throws(() => recoverRun(root, { runId: abandoned.runId, confirmedActorsEnded: true }), { code: 'harness-context-invalid' });
	assert.equal(readFileSync(path, 'utf8'), beforeRecovery);
	rmSync(join(abandoned.active, 'unknown'));
	recoverRun(root, { runId: abandoned.runId, confirmedActorsEnded: true });
	assert.equal(existsSync(abandoned.active), false);
	const recovered = join(root, '.insrc/tmp/test-harness/recovered');
	const archived = readdirSync(recovered).find(name => name.startsWith(abandoned.runId));
	assert.ok(archived);
	assert.equal(readFileSync(join(recovered, archived, 'run.json'), 'utf8'), beforeRecovery);
	assert.equal(existsSync(join(recovered, archived, 'writer')), true);
	assert.equal(existsSync(record.workspace), true); // Recovery does not sweep old workspaces.
	const run = createRun(root);
	assert.throws(() => run.release(), { code: 'harness-cleanup-unconfirmed' });
	assert.equal(run.record.phase, 'blocked');
	assert.throws(() => run.release({ confirmedClosed: true }), { code: 'harness-context-invalid' });
	recoverRun(root, { runId: run.runId, confirmedActorsEnded: true });
	const next = createRun(root);
	next.transition('draining');
	next.release({ confirmedClosed: true });
	assert.equal(existsSync(next.active), false);
});

test('Malformed lease records and parent symlinks refuse without removal', t => {
	const root = temporary(t), run = createRun(root);
	const original = run.record;
	for (const malformed of [{ ...original, budgets: {} }, { ...original, diagnosticFlags: [123] }, { ...original, workspace: '/foreign' }, { ...original, runtimeVersion: 'v26.0.0' }]) {
		const bytes = JSON.stringify(malformed);
		writeFileSync(join(run.active, 'run.json'), bytes);
		assert.throws(() => run.transition('draining'), { code: 'harness-context-invalid' });
		assert.throws(() => run.release({ confirmedClosed: true }), { code: 'harness-context-invalid' });
		assert.throws(() => recoverRun(root, { runId: run.runId, confirmedActorsEnded: true }));
		assert.equal(readFileSync(join(run.active, 'run.json'), 'utf8'), bytes);
	}
	writeFileSync(join(run.active, 'run.json'), '{');
	assert.throws(() => run.transition('draining'), { code: 'harness-context-invalid' });
	assert.throws(() => recoverRun(root, { runId: run.runId, confirmedActorsEnded: true }));
	assert.equal(readFileSync(join(run.active, 'run.json'), 'utf8'), '{');
	const other = temporary(t), destination = temporary(t);
	symlinkSync(destination, join(other, '.insrc'));
	assert.throws(() => createRun(other), { code: 'harness-context-invalid' });
	assert.equal(existsSync(join(destination, 'tmp')), false);
});

test('compileProbe appends --skipLibCheck only when the per-probe skipLibCheck option is set and otherwise leaves its argv unchanged', async t => {
	const root = temporary(t);
	const compiler = join(root, 'stub-compiler.cjs');
	writeFileSync(compiler, 'console.log(JSON.stringify(process.argv.slice(2)));\nconsole.error("probe.ts(1,1): error TS2304: Cannot find name \'x\'.");\nprocess.exit(2);\n');
	const module = join(root, 'mod.ts');
	writeFileSync(module, 'export const x = 1;\n');
	const run = createRun(root);
	const prevRoot = process.env.INSRC_TEST_ROOT, prevRunId = process.env.INSRC_TEST_RUN_ID;
	process.env.INSRC_TEST_ROOT = run.record.canonicalRoot;
	process.env.INSRC_TEST_RUN_ID = run.runId;
	t.after(() => {
		if (prevRoot === undefined) delete process.env.INSRC_TEST_ROOT; else process.env.INSRC_TEST_ROOT = prevRoot;
		if (prevRunId === undefined) delete process.env.INSRC_TEST_RUN_ID; else process.env.INSRC_TEST_RUN_ID = prevRunId;
	});
	run.transition('reading');
	try {
		const snippet = (specifier: string) => `import { x } from ${JSON.stringify(specifier)};\nconsole.log(x);\n`;
		const withFlag = await compileProbe({ root, target: module, compiler, snippet, budgetMs: 30000, skipLibCheck: true });
		const withoutFlag = await compileProbe({ root, target: module, compiler, snippet, budgetMs: 30000 });
		assert.equal(withFlag.ok, false);
		assert.equal(withoutFlag.ok, false);
		assert.match(withFlag.out, /error TS2304:/, 'the stub diagnostic is reported');
		assert.match(withFlag.out, /"--skipLibCheck"/, 'the flag is appended exactly when the option is set');
		assert.doesNotMatch(withoutFlag.out, /--skipLibCheck/, 'the default argv is unchanged for every existing caller');
		assert.match(withoutFlag.out, /"--noEmit"[\s\S]*"--target"[\s\S]*"es2022"/, 'the base argv is intact');
	} finally {
		run.transition('draining');
		run.release({ confirmedClosed: true });
	}
});
