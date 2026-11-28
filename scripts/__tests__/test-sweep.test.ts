/**
 * ISSUE-4b33600426ce4112 t2 — the bare-sweep entry point carries a finite per-test
 * timeout, so a bare glob run always terminates and reports every file.
 *
 * Run: npx tsx --test --test-force-exit scripts/__tests__/test-sweep.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('package.json test:sweep runs tsx --test with a finite --test-timeout', () => {
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
	const sweep = pkg.scripts?.['test:sweep'] ?? '';
	assert.match(sweep, /--test\b/, 'the sweep script runs the node test runner');
	const m = /--test-timeout=(\d+)/.exec(sweep);
	assert.ok(m, 'the sweep script carries --test-timeout');
	assert.ok(Number(m![1]) > 0 && Number(m![1]) <= 600_000, 'the timeout is finite and sane');
});

test('a bare tsx --test run with --test-timeout terminates and reports every file', async () => {
	// A tiny glob (this helper's own file) proves the invocation completes with a full
	// per-file report under a finite per-test timeout; without one, a single stuck file
	// would block the sweep indefinitely (ISSUE-4b33600426ce4112 repro: 6/6 hangs).
	const { stdout } = await execFileAsync(
		process.execPath,
		[join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--test', '--test-reporter', 'tap', '--test-timeout=30000', join(ROOT, 'src', 'workflow', '__tests__', 'helpers', 'exec-stand-in.test.ts')],
		{ cwd: ROOT, timeout: 90_000, maxBuffer: 16 * 1024 * 1024 },
	);
	assert.match(stdout, /^# tests \d+/m, 'the run printed a TAP summary (it terminated)');
	assert.match(stdout, /^# pass \d+/m);
	assert.doesNotMatch(stdout, /^# fail [1-9]/m, 'no failures in the bounded run');
});
