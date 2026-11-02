/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The two post-success rules that refresh the tracker status, run through callTool on real git_pull and git_push calls in a
 * temporary repository with a bare remote (Story s9).
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/refresh-hooks.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { callTool } from '../../../daemon/tools/call-tool.js';
import { _resetToolHooksForTests, runToolHooks } from '../../../daemon/tools/hooks.js';
import { getTool, registerTool } from '../../../daemon/tools/registry.js';
import { gitPullTool } from '../../../daemon/tools/builtins/git/pull.js';
import { gitPushTool } from '../../../daemon/tools/builtins/git/push.js';
import { _setApprovalGateForTests } from '../../../daemon/tools/executor.js';
import { workflowToolDeps } from '../registry-table.js';
import { registerTrackerRefreshHooks } from '../refresh-hooks.js';
import type { TrackerRefreshReport } from '../sync.js';
import { approveEveryToolCall } from '../../__tests__/approve-fallback-kit.js';

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
const NO_WARNINGS: TrackerRefreshReport = { results: [], warnings: [] };

interface Fx { readonly dir: string; readonly repo: string; readonly calls: string[]; refresh: () => Promise<TrackerRefreshReport> }
let fx: Fx;

beforeEach(() => {
	for (const t of [gitPullTool, gitPushTool]) if (getTool(t.id) === undefined) registerTool(t);
	approveEveryToolCall();
	_resetToolHooksForTests();
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-refresh-hooks-')));
	const remote = join(dir, 'remote.git');
	const repo = join(dir, 'repo');
	git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
	git(dir, 'clone', '-q', remote, repo);
	writeFileSync(join(repo, 'a.txt'), 'a');
	git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'one'); git(repo, 'push', '-q', '-u', 'origin', 'HEAD:main');
	fx = { dir, repo, calls: [], refresh: async () => NO_WARNINGS };
	registerTrackerRefreshHooks({
		registeredRepos: async () => new Set([repo]),
		refresh: async (path: string) => { fx.calls.push(path); return await fx.refresh(); },
	});
});
afterEach(() => { _resetToolHooksForTests(); _setApprovalGateForTests(undefined); rmSync(fx.dir, { recursive: true, force: true }); });

const deps = () => workflowToolDeps(fx.repo);
const push = (input: Record<string, unknown>) => callTool(gitPushTool, { remote: 'origin', ref: 'HEAD:refs/heads/main', ...input } as never, deps());
const pull = (input: Record<string, unknown>) => callTool(gitPullTool, input as never, deps());

test('git_pull and git_push through callTool with the hooks registered refresh the status after success', async () => {
	const pulled = await pull({ cwd: fx.repo });
	assert.equal(pulled.success, true, pulled.output);
	assert.deepEqual(fx.calls, [fx.repo]);

	writeFileSync(join(fx.repo, 'b.txt'), 'b'); git(fx.repo, 'add', '.'); git(fx.repo, 'commit', '-q', '-m', 'two');
	const pushed = await push({ cwd: fx.repo });
	assert.equal(pushed.success, true, pushed.output);
	assert.deepEqual(fx.calls, [fx.repo, fx.repo]);
	assert.equal('hookFailures' in pushed && pushed.hookFailures !== undefined, false);

	// the same root named through a symbolic link is still the registered root
	const link = join(fx.dir, 'link'); symlinkSync(fx.repo, link);
	assert.equal((await pull({ cwd: link })).success, true);
	assert.equal(fx.calls.length, 3);
});

test('a failing, denied or slow tracker leaves success true and adds hookFailures and a line of output', async () => {
	const cases: Array<[string, () => Promise<TrackerRefreshReport>, RegExp]> = [
		['failed', async () => ({ results: [], warnings: ['tracker status of a3f4 failed: dial tcp: i/o timeout'] }), /i\/o timeout/],
		['slow', async () => ({ results: [], warnings: ['tracker status of a3f4 skipped: time limit reached'] }), /time limit reached/],
		['denied', async () => { throw new Error('gh_tracker was declined'); }, /declined/],
	];
	for (const [label, refresh, expected] of cases) {
		fx.refresh = refresh;
		for (const result of [await pull({ cwd: fx.repo }), await push({ cwd: fx.repo })]) {
			assert.equal(result.success, true, label);
			const failures = result.success ? result.hookFailures : undefined;
			assert.equal(failures?.length, 1, label);
			assert.match(failures?.[0]?.message ?? '', expected, label);
			assert.match(result.output, expected, `${label}: a line of output`);
		}
	}
});

test('a dry-run pull, a push with pushed false, a failed git command, a missing cwd and a push from a temporary worktree run no refresh', async () => {
	const dry = await pull({ cwd: fx.repo, remote: 'origin', dryRun: true }); assert.equal(dry.success, true, JSON.stringify(dry));
	assert.equal((await push({ cwd: fx.repo, dryRun: true })).success, true, 'a dry-run push is a success with pushed false');
	assert.deepEqual(fx.calls, []);

	const failed = await pull({ cwd: fx.repo, remote: 'origin', branch: 'no-such-branch' });
	assert.equal(failed.success, false);
	assert.deepEqual(fx.calls, []);

	// no cwd: the tool would run in the daemon's own directory, which the rule does not take for a repo (the rules run directly, so no git runs there)
	const done = { output: 'ok', format: 'text', success: true, data: { pushed: true } } as const;
	for (const t of [gitPullTool, gitPushTool]) await runToolHooks(t, {}, done, deps());
	assert.deepEqual(fx.calls, []);

	// a repo that is not registered
	const other = join(fx.dir, 'other'); git(fx.dir, 'clone', '-q', join(fx.dir, 'remote.git'), other);
	const otherPull = await pull({ cwd: other }); assert.equal(otherPull.success, true, otherPull.output);
	assert.deepEqual(fx.calls, []);

	// the temporary detached worktree the handoff park pushes from: the push succeeds, the rule sees a path that is not the root
	const park = join(fx.dir, 'park');
	git(fx.repo, 'worktree', 'add', '-q', '--detach', park);
	const parked = await push({ cwd: park, ref: 'HEAD:refs/heads/park' });
	assert.equal(parked.success, true, parked.output);
	assert.deepEqual(fx.calls, []);
	assert.match(git(fx.repo, 'ls-remote', 'origin', 'refs/heads/park'), /refs\/heads\/park/);
});
