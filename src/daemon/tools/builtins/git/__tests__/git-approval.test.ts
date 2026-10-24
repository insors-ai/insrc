/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Input schemas and per-input rules of the git tools (Story s4): what the executor accepts and what each tool is. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { executeTool } from '../../../executor.js';
import { listTools } from '../../../registry.js';
import { git, newRepo, registerForTests, toolDeps } from './_repo.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const snapshot = (JSON.parse(readFileSync(join(HERE, '..', '..', '..', '__tests__', 'fixtures', 'approval-snapshot.json'), 'utf8')) as {
	tools: { id: string; inputSchema: unknown }[];
}).tools;
const GIT_IDS = ['git_status', 'git_log', 'git_diff', 'git_show', 'git_blame', 'git_branch', 'git_stage', 'git_commit', 'git_amend',
	'git_push', 'git_pull', 'git_fetch', 'git_checkout', 'git_merge', 'git_rebase', 'git_stash', 'git_reset', 'git_revert',
	'git:cherry-pick', 'git_tag', 'git_remote', 'git_worktree'];

test('every typebox input schema serialises to the same JSON as the schema it replaced', () => {
	registerForTests();
	const live = new Map(listTools().map(t => [t.id, t]));
	for (const id of GIT_IDS) {
		const before = snapshot.find(s => s.id === id);
		assert.ok(before, `${id} is in the snapshot taken before the rewrite`);
		assert.deepEqual(JSON.parse(JSON.stringify(live.get(id)?.inputSchema)), before.inputSchema, id);
	}
});

test('git_log limit 0 and 501, git_diff maxBytes 100 and git_diff context 51 are rejected, git_show maxBytes 100 is clamped, and the schemas are unchanged', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'a.txt'), 'a\n');
		git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
		const d = toolDeps(repo);

		for (const [id, input, field] of [
			['git_log', { limit: 0 }, 'limit'], ['git_log', { limit: 501 }, 'limit'],
			['git_diff', { maxBytes: 100 }, 'maxBytes'], ['git_diff', { context: 51 }, 'context'],
		] as const) {
			const r = await executeTool(id, { cwd: repo, ...input }, d);
			assert.equal(r.success, false, `${id} ${JSON.stringify(input)}`);
			assert.equal(r.failure?.kind, 'rejected', id);
			assert.match(r.failure?.message ?? '', new RegExp(field), id);
		}
		// the legacy in-range inputs still run
		assert.equal((await executeTool('git_log', { cwd: repo, limit: 1 }, d)).success, true);
		assert.equal((await executeTool('git_log', { cwd: repo, limit: 500 }, d)).success, true);
		assert.equal((await executeTool('git_diff', { cwd: repo, maxBytes: 1024, context: 50 }, d)).success, true);
		// git_show maxBytes has no bounds in its schema and stays clamped as before
		const show = await executeTool('git_show', { cwd: repo, maxBytes: 100 }, d);
		assert.equal(show.success, true, show.output);

		// the schemas themselves did not move
		const live = new Map(listTools().map(t => [t.id, t]));
		for (const id of ['git_log', 'git_diff', 'git_show', 'git_status', 'git_blame']) {
			assert.deepEqual(JSON.parse(JSON.stringify(live.get(id)?.inputSchema)), snapshot.find(s => s.id === id)?.inputSchema, id);
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a dash-prefixed path after \'--\' is accepted and a dash-prefixed ref is rejected', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, '-dash.txt'), 'dash\n');
		git(repo, 'add', '--', '-dash.txt'); git(repo, 'commit', '-q', '-m', 'dash');
		const d = toolDeps(repo);

		// paths: git_log, git_show, git_blame and git_diff put them after '--'
		const log = await executeTool('git_log', { cwd: repo, path: '-dash.txt' }, d);
		assert.equal(log.success, true, log.output);
		assert.equal((log.data as { commits: unknown[] }).commits.length, 1);
		assert.equal((await executeTool('git_show', { cwd: repo, path: '-dash.txt' }, d)).success, true);
		const blame = await executeTool('git_blame', { cwd: repo, path: '-dash.txt' }, d);
		assert.equal(blame.success, true, blame.output);
		assert.equal((await executeTool('git_diff', { cwd: repo, path: '-dash.txt' }, d)).success, true);

		// refs: an option in a ref's place is refused before git runs
		for (const [id, input] of [
			['git_log', { ref: '--all' }], ['git_log', { ref: '-n1' }], ['git_show', { ref: '--output=/tmp/x' }],
			['git_blame', { path: 'a', ref: '--contents=x' }], ['git_diff', { from: '--stat' }], ['git_diff', { from: 'HEAD', to: '-p' }],
		] as const) {
			const r = await executeTool(id, { cwd: repo, ...input }, d);
			assert.equal(r.success, false, `${id} ${JSON.stringify(input)}`);
			assert.equal(r.failure?.kind, 'rejected');
			assert.match(r.output, /unsafe ref/, id);
		}
		// a NUL is refused in either place
		const nul = await executeTool('git_log', { cwd: repo, path: 'a\0b' }, d);
		assert.equal(nul.success, false);
		assert.match(nul.output, /NUL/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
