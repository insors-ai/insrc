/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t3: the refresh git tools fail rejected on an aborted signal, stop a running
 * command, and start no later command; the git helper reports an aborted command as cancelled.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-abort.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { executeTool } from '../../../executor.js';
import { getTool } from '../../../registry.js';
import { cancelledFail, fail } from '../helpers.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; });

const aborted = (): AbortSignal => { const c = new AbortController(); c.abort(); return c.signal; };
const CALLS: Array<[string, Record<string, unknown>]> = [
	['git_fetch', { cwd: '/tmp', remote: 'origin' }],
	['git_fetch_refs', { cwd: '/tmp', remote: 'origin', refspecs: ['+refs/heads/main:refs/remotes/origin/main'] }],
	['git_rev_parse', { cwd: '/tmp', rev: 'HEAD' }],
	['git_symbolic_ref', { cwd: '/tmp', op: 'get', ref: 'HEAD' }],
	['git_ls_tree', { cwd: '/tmp', rev: 'HEAD' }],
	['git_cat_file', { cwd: '/tmp', rev: 'HEAD', exists: true }],
	['git_show', { cwd: '/tmp', ref: 'HEAD' }],
];

test('git-abort.test.ts: every refresh tool fails rejected on an already-aborted signal and starts no git', async () => {
	standIn = installStandInGit('sleep 30');
	registerForTests();
	for (const [id, input] of CALLS) {
		// called directly, the tool itself returns a rejected failure and starts nothing
		const r = await getTool(id)!.execute(input, { ...toolDeps('/tmp'), signal: aborted() });
		assert.equal(r.success, false, id);
		assert.equal(r.failure?.kind, 'rejected', id);
		assert.match(r.failure?.message ?? '', /cancel/i, id);
		// through the executor the call is stopped before the tool starts
		const e = await executeTool(id, input, { ...toolDeps('/tmp'), signal: aborted() });
		assert.equal(e.failure?.kind, 'denied', id);
		assert.equal(e.failure?.denial, 'cancelled', id);
	}
	assert.deepEqual(standIn.calls(), [], 'no git process was started');
});

test('git-abort.test.ts: every refresh tool stops its running command on an abort while running and returns a rejected failure', async () => {
	standIn = installStandInGit('sleep 30');
	registerForTests();
	for (const [id, input] of CALLS) {
		const c = new AbortController();
		setTimeout(() => c.abort(), 150);
		const t0 = Date.now();
		const r = await executeTool(id, input, { ...toolDeps('/tmp'), signal: c.signal });
		assert.equal(r.success, false, id);
		assert.equal(r.failure?.kind, 'rejected', id);
		assert.match(r.failure?.message ?? '', /cancel/i, id);
		assert.ok(Date.now() - t0 < 150 + 2000 + 1500, `${id} settled within the bound`);
	}
});

test('git-abort.test.ts: git_show starts no command after an abort between its header, diff and stat commands', async () => {
	const FS = '\\037';
	// the header completes at once; the diff sleeps and the abort comes while it runs
	standIn = installStandInGit(`case "$*" in
  *--no-patch*) printf 'aaaa${FS}bbbb${FS}${FS}An${FS}a@x${FS}2026-01-01T00:00:00Z${FS}subj${FS}body' ;;
  *--numstat*) echo 'stat' ;;
  *) sleep 30 ;;
esac`);
	registerForTests();
	const c = new AbortController();
	setTimeout(() => c.abort(), 400);
	const r = await executeTool('git_show', { cwd: '/tmp', ref: 'HEAD' }, { ...toolDeps('/tmp'), signal: c.signal });
	assert.equal(r.success, false);
	assert.equal(standIn.calls().length, 2, 'the header and the diff started; the stat did not');
	// and an abort during the header means neither the diff nor the stat starts
	standIn.restore(); cleanup(standIn.dir);
	standIn = installStandInGit('sleep 30');
	const c2 = new AbortController();
	setTimeout(() => c2.abort(), 150);
	await executeTool('git_show', { cwd: '/tmp', ref: 'HEAD' }, { ...toolDeps('/tmp'), signal: c2.signal });
	assert.equal(standIn.calls().length, 1, 'only the header started');
});

test('git-abort.test.ts: git_show returns a cancelled failure, never a success, when the abort comes after the header and the diff and during the stat', async () => {
	const FS = '\\037';
	standIn = installStandInGit(`case "$*" in
  *--no-patch*) printf 'aaaa${FS}bbbb${FS}${FS}An${FS}a@x${FS}2026-01-01T00:00:00Z${FS}subj${FS}body' ;;
  *--numstat*) sleep 30 ;;
  *) echo 'diff text' ;;
esac`);
	registerForTests();
	const c = new AbortController();
	setTimeout(() => c.abort(), 400);
	const r = await executeTool('git_show', { cwd: '/tmp', ref: 'HEAD' }, { ...toolDeps('/tmp'), signal: c.signal });
	assert.equal(standIn.calls().length, 3, 'header, diff and stat all started before the abort');
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.match(r.failure?.message ?? '', /cancel/i);
});

test('git-abort.test.ts: the git helper fail() reports an aborted command as cancelled, and a mutating one adds that its outcome is unknown', () => {
	const base = { stdout: '', stderr: '', code: null, spawnError: false, timedOut: false, stdoutTruncated: false, aborted: true } as const;
	const plain = fail('git_x', { ...base });
	assert.equal(plain.failure?.kind, 'rejected');
	assert.equal(plain.error, 'cancelled');
	assert.equal(plain.failure?.message, 'cancelled');
	const mutating = fail('git_x', { ...base }, { mutating: true });
	assert.match(mutating.failure?.message ?? '', /cancelled.*outcome is unknown/);
	assert.equal(cancelledFail('git_x').output, '[git_x] failed: cancelled');
	// a command that was not aborted keeps today's text
	const timed = fail('git_x', { ...base, aborted: false, timedOut: true, stderr: 'slow' });
	assert.equal(timed.failure?.kind, 'timed-out');
});
