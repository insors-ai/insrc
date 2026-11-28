/**
 * ISSUE-4b33600426ce4112 t2 — the bare-sweep entry point carries a finite per-test
 * timeout, so a bare glob run always terminates and reports every file (a single stuck
 * or slow file can no longer block the sweep indefinitely).
 *
 * Bare glob sweeps (e.g. `npx tsx --test 'src/<glob>.test.ts'`) have no per-test timeout;
 * run them through `npm run test:sweep -- '<globs>'` (adds --test-timeout=120000).
 * The harness (`npm test --`) remains the owned gate path: one bounded child per
 * file, pinned runtime, --test-force-exit.
 *
 * Run: npx tsx --test --test-force-exit scripts/__tests__/test-sweep.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Spawn with the current (pinned) runtime's bin dir first on PATH: the harness runs
 * this file with a cleaned environment whose PATH may resolve `npm`/`node` to a
 * different Node major, which breaks the nested tsx invocation.
 */
const SPAWN_ENV = (() => {
	const env = {
		...process.env,
		PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
	};
	// Under `node --test` this variable is set for the test file's process; a nested
	// `node --test` inheriting it speaks IPC instead of printing TAP to stdout.
	delete env.NODE_TEST_CONTEXT;
	return env;
})();

/** The test:sweep script command from package.json (split into argv). */
function sweepScriptArgv(): string[] {
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
	const sweep = pkg.scripts?.['test:sweep'] ?? '';
	return sweep.split(/\s+/).filter((s) => s.length > 0);
}

test('package.json test:sweep runs the node test runner with a finite --test-timeout', () => {
	const argv = sweepScriptArgv();
	assert.ok(argv.some((a) => a === '--test'), 'the sweep script runs the node test runner');
	const flag = argv.find((a) => a.startsWith('--test-timeout='));
	assert.ok(flag, 'the sweep script carries --test-timeout');
	const ms = Number(flag!.split('=')[1]);
	assert.ok(Number.isFinite(ms) && ms > 0 && ms <= 600_000, 'the timeout is finite and sane');
});

test('npm run test:sweep terminates and reports every requested file', async () => {
	const files = [
		join('src', 'workflow', '__tests__', 'helpers', 'exec-stand-in.test.ts'),
		join('src', 'workflow', '__tests__', 'anchor-folders.test.ts'),
	];
	const { stdout } = await execFileAsync('npm', ['run', 'test:sweep', '--', ...files], { cwd: ROOT, timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: SPAWN_ENV });
	assert.match(stdout, /^# tests 2$/m, 'the sweep printed a TAP summary (it terminated)');
	assert.match(stdout, /^# pass 2$/m, 'both requested files\' tests passed');
	assert.match(stdout, /^# fail 0$/m);
	assert.ok(stdout.includes('anchor-folders.test.ts'), 'file-level results are reported in the TAP output');
});

test('a stuck file is failed at the per-test timeout and cannot block the sweep', async () => {
	// A deliberately never-settling test in a temp file; the sweep script is invoked with
	// an extra short --test-timeout (later flag wins) so the timeout actually fires.
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sweep-hang-'));
	try {
		const hang = join(dir, 'hang.test.ts');
		// The never-settling test holds a REF'D interval, so the event loop cannot drain:
		// only the finite --test-timeout can stop it, which is what this test proves.
		writeFileSync(hang, "import { test } from 'node:test';\ntest('never settles', async () => { setInterval(() => {}, 1000); await new Promise(() => {}); });\n");
		const argv = [...sweepScriptArgv(), '--test-timeout=3000', hang];
		let stdout = '';
		let code = 0;
		try {
			const out = await execFileAsync(argv[0]!, argv.slice(1), { cwd: ROOT, timeout: 60_000, maxBuffer: 16 * 1024 * 1024, env: SPAWN_ENV });
			stdout = out.stdout;
		} catch (err) {
			const e = err as { code?: number; stdout?: string };
			code = e.code ?? 1;
			stdout = e.stdout ?? '';
		}
		assert.match(stdout, /^# tests 1$/m, 'the sweep still terminated and printed the summary');
		assert.match(stdout, /^not ok 1 - /m, 'the stuck file is reported at file level, not dropped');
		assert.match(stdout, /test timed out after 3000ms/, 'the stuck test (loop held alive) was stopped by the per-test timeout itself');
		assert.notEqual(code, 0, 'the stuck file is a reported failure, not a silent pass');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
