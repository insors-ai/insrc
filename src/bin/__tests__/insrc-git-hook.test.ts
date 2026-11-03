/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOOK_TIMEOUT_MS, runGitHook } from '../insrc-git-hook.js';
import type { HookCall } from '../insrc-git-hook.js';

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'insrc-git-hook.ts');

test('src/bin/__tests__/insrc-git-hook.test.ts: the hook entry exits 0 when the daemon is not running, times out, answers an error or names an unregistered repository', async () => {
	// every way the call can end, in-process: the entry resolves and asks for exactly one repository-wide refresh
	const outcomes: [string, HookCall][] = [
		['daemon not running', async () => { throw new Error('daemon is not running (connect ENOENT)'); }],
		['timeout', async () => { throw new Error('timed out'); }],
		['an error answer', async () => ({ error: 'tracker.sync: `repoPath` is required' })],
		['an unregistered repository', async () => { throw new Error('repository is not registered'); }],
		['success', async () => ({ status: 'synced', refreshed: 1 })],
	];
	for (const [label, outcome] of outcomes) {
		const calls: { method: string; params: unknown; timeoutMs: number }[] = [];
		await runGitHook(['/work/repo', 'post-merge'], async (method, params, timeoutMs) => { calls.push({ method, params, timeoutMs }); return outcome(method, params, timeoutMs); });
		assert.deepEqual(calls, [{ method: 'tracker.sync', params: { repoPath: '/work/repo' }, timeoutMs: HOOK_TIMEOUT_MS }], `${label}: one call, no epicHash, a timeout`);
	}
	// no repository given: nothing is called and nothing throws
	let called = false;
	await runGitHook([], async () => { called = true; return undefined; });
	assert.equal(called, false);

	// a real process with no daemon behind its home directory exits 0 at once and prints nothing
	const home = mkdtempSync(join(tmpdir(), 'insrc-git-hook-'));
	try {
		const run = spawnSync(process.execPath, ['--import', 'tsx', ENTRY, '/work/repo', 'post-merge'], { env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30_000 });
		assert.equal(run.status, 0, `exit status (stderr: ${run.stderr})`);
		assert.equal(run.stdout, '');
	} finally { rmSync(home, { recursive: true, force: true }); }

	// the entry imports only the rpc client (which reads the socket path from the paths module) and node built-ins
	const imports = [...readFileSync(ENTRY, 'utf8').matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
	assert.deepEqual(imports, ['node:url', '../shared/ipc-client.js']);
});
