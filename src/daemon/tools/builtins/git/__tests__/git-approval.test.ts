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
import { resolveApprovalClass } from '../../../approval-policy.js';
import { listTools } from '../../../registry.js';
import { git, newRepo, registerForTests, richRepo, toolDeps } from './_repo.js';
import { gitBranchExtended, gitRemoteExtended, gitStashExtended, gitTagExtended, gitWorktreeExtended } from '../extended.js';
import { gitBranchTool } from '../branch.js';
import { gitRemoteTool } from '../remote.js';
import { gitStashTool } from '../stash.js';
import { gitTagTool } from '../tag.js';
import { gitWorktreeTool } from '../worktree.js';
import type { Tool, ToolInput } from '../../../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const snapshot = (JSON.parse(readFileSync(join(HERE, '..', '..', '..', '__tests__', 'fixtures', 'approval-snapshot.json'), 'utf8')) as {
	tools: { id: string; inputSchema: unknown }[];
}).tools;
const GIT_IDS = ['git_status', 'git_log', 'git_diff', 'git_show', 'git_blame', 'git_branch', 'git_stage', 'git_commit', 'git_amend',
	'git_push', 'git_pull', 'git_fetch', 'git_checkout', 'git_merge', 'git_rebase', 'git_stash', 'git_reset', 'git_revert',
	'git:cherry-pick', 'git_tag', 'git_remote', 'git_worktree'];

/** Optional inputs the s9 audit added after the snapshot (Story s9, task t24); the snapshot stays pinned. */
const ADDED_BY_S9 = new Map([['git_status', ['paths', 'untrackedFiles']], ['git_log', ['firstParent']], ['git_diff', ['againstWorktree', 'excludeDeleted']], ['git_worktree', ['startPoint']], ['git_stage', ['force']], ['git_show', ['excludeDeleted']]]);

/**
 * What Story s8 added to the five multi-operation tools: new optional inputs and new values of `op`. Nothing the schemas
 * had before changed; the snapshot stays pinned and these are taken off the live schema before it is compared.
 */
const ADDED_BY_S8 = new Map<string, { inputs: string[]; ops: string[] }>([
	['git_stash', { inputs: ['branchName', 'commit', 'toRef'], ops: ['branch', 'create', 'store', 'export', 'import'] }],
	['git_worktree', { inputs: ['reason', 'repairPaths'], ops: ['lock', 'unlock', 'repair'] }],
	['git_remote', { inputs: ['remote', 'query', 'dryRun', 'remotes', 'pruneRefs', 'headBranch', 'auto', 'deleteHead', 'branches', 'addBranches', 'newUrl', 'urlPattern'], ops: ['show', 'prune', 'update', 'set-head', 'set-branches', 'set-url-add', 'set-url-delete'] }],
	['git_branch', { inputs: ['fromName', 'toName', 'upstream', 'branchName', 'description'], ops: ['rename', 'copy', 'set-upstream-to', 'unset-upstream', 'edit-description'] }],
	['git_tag', { inputs: ['tagNames', 'tagName', 'target', 'key'], ops: ['verify', 'sign'] }],
]);

/** The live schema of a tool without what s8 added. */
function withoutS8(id: string, schema: { properties: Record<string, unknown> }): unknown {
	const added = ADDED_BY_S8.get(id);
	if (added === undefined) { return schema; }
	for (const name of added.inputs) { delete schema.properties[name]; }
	const op = schema.properties['op'] as { enum: string[] };
	op.enum = op.enum.filter(v => !added.ops.includes(v));
	return schema;
}

test('every typebox input schema serialises to the same JSON as the schema it replaced', () => {
	registerForTests();
	const live = new Map(listTools().map(t => [t.id, t]));
	for (const id of GIT_IDS) {
		const before = snapshot.find(s => s.id === id);
		assert.ok(before, `${id} is in the snapshot taken before the rewrite`);
		// git_push gained the optional configured input after the snapshot (Story s10); the snapshot stays pinned
		const schema = JSON.parse(JSON.stringify(live.get(id)?.inputSchema)) as { properties: Record<string, unknown> };
		if (id === 'git_push') { delete schema.properties['configured']; }
		for (const added of ADDED_BY_S9.get(id) ?? []) { delete schema.properties[added]; }
		assert.deepEqual(withoutS8(id, schema), before.inputSchema, id);
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
			const schema = JSON.parse(JSON.stringify(live.get(id)?.inputSchema)) as { properties: Record<string, unknown> };
			for (const added of ADDED_BY_S9.get(id) ?? []) { delete schema.properties[added]; }
			assert.deepEqual(schema, snapshot.find(s => s.id === id)?.inputSchema, id);
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

type Row = readonly [tool: string, input: Record<string, unknown>, cls: 'none' | 'common' | 'destructive'];

/** The class of every operation of every existing git tool (LLD 2.6). */
const CLASSES: readonly Row[] = [
	// reads
	['git_status', {}, 'none'], ['git_log', {}, 'none'], ['git_diff', { staged: true }, 'none'], ['git_show', {}, 'none'], ['git_blame', { path: 'a' }, 'none'],
	['git_fetch', {}, 'none'], ['git_fetch', { all: true, prune: true }, 'none'],
	['git_branch', { op: 'list' }, 'none'], ['git_tag', { op: 'list' }, 'none'], ['git_stash', { op: 'list' }, 'none'], ['git_stash', { op: 'show' }, 'none'],
	['git_worktree', { op: 'list' }, 'none'], ['git_remote', { op: 'list' }, 'none'],
	// ordinary mutations
	['git_stage', { op: 'stage', paths: ['a'] }, 'common'], ['git_stage', { op: 'unstage', paths: ['a'] }, 'common'], ['git_commit', { message: 'm' }, 'common'],
	['git_amend', { mode: 'message', message: 'm' }, 'common'], ['git_pull', {}, 'common'], ['git_pull', { mode: 'rebase' }, 'common'],
	['git_merge', { ref: 'x' }, 'common'], ['git_merge', { abort: true }, 'common'], ['git_rebase', { onto: 'x' }, 'common'], ['git_rebase', { op: 'abort' }, 'common'],
	['git_revert', { refs: ['x'] }, 'common'], ['git:cherry-pick', { refs: ['x'] }, 'common'],
	['git_push', { remote: 'origin', ref: 'main' }, 'common'], ['git_push', {}, 'common'], ['git_push', { ref: 'src:dst' }, 'common'], ['git_push', { ref: 'v1.0', tags: true }, 'common'],
	['git_reset', { ref: 'x' }, 'common'], ['git_reset', { ref: 'x', mode: 'soft' }, 'common'], ['git_reset', { ref: 'x', mode: 'mixed' }, 'common'],
	['git_branch', { op: 'create', name: 'b' }, 'common'], ['git_branch', { op: 'switch', name: 'b' }, 'common'],
	['git_tag', { op: 'create', name: 't' }, 'common'],
	['git_stash', { op: 'push' }, 'common'], ['git_stash', { op: 'pop' }, 'common'], ['git_stash', { op: 'apply' }, 'common'], ['git_stash', {}, 'common'],
	['git_worktree', { op: 'add', path: 'p' }, 'common'], ['git_worktree', { op: 'move', path: 'p', newPath: 'q' }, 'common'], ['git_worktree', { op: 'prune' }, 'common'],
	['git_worktree', { op: 'remove', path: 'p' }, 'common'], ['git_worktree', { op: 'remove', path: 'p', force: false }, 'common'],
	['git_checkout', { mode: 'ref', ref: 'main' }, 'common'],
	['git_remote', { op: 'add' }, 'common'], ['git_remote', { op: 'remove' }, 'common'], ['git_remote', { op: 'set-url' }, 'common'], ['git_remote', { op: 'rename' }, 'common'],
	// work-destroying operations
	['git_reset', { ref: 'x', mode: 'hard' }, 'destructive'],
	['git_push', { force: true }, 'destructive'], ['git_push', { forceRaw: true }, 'destructive'], ['git_push', { forceToMain: true }, 'destructive'],
	['git_push', { ref: '+main' }, 'destructive'], ['git_push', { ref: '+refs/heads/a:refs/heads/b' }, 'destructive'], ['git_push', { ref: ':dev' }, 'destructive'],
	['git_push', { ref: ':refs/tags/v1' }, 'destructive'],
	['git_branch', { op: 'delete', name: 'b' }, 'destructive'], ['git_branch', { op: 'delete', name: 'b', force: true }, 'destructive'],
	['git_tag', { op: 'delete', name: 't' }, 'destructive'],
	['git_stash', { op: 'drop' }, 'destructive'], ['git_stash', { op: 'clear' }, 'destructive'],
	['git_worktree', { op: 'remove', path: 'p', force: true }, 'destructive'],
	['git_checkout', { mode: 'path', paths: ['a'] }, 'destructive'], ['git_checkout', { mode: 'ref', ref: 'x', discard: true }, 'destructive'],
];

function classOf(id: string, input: Record<string, unknown>): string {
	const tool = listTools().find(t => t.id === id);
	assert.ok(tool, `${id} is registered`);
	return resolveApprovalClass(tool, input);
}

test('each work-destroying operation is destructive and each read is none', () => {
	registerForTests();
	for (const [id, input, cls] of CLASSES) { assert.equal(classOf(id, input), cls, `${id} ${JSON.stringify(input)}`); }
	// every one of the 22 existing tools is in the table, and each declares a typed result
	for (const id of GIT_IDS) { assert.ok(listTools().find(t => t.id === id)?.outputSchema, `${id} declares an outputSchema`); }
	assert.deepEqual([...new Set(CLASSES.map(r => r[0]))].sort(), [...GIT_IDS].sort());
	// no mutation that asked before stops asking: nothing in the table that is not a read is none
	const reads = new Set(['git_status', 'git_log', 'git_diff', 'git_show', 'git_blame', 'git_fetch']);
	for (const [id, input, cls] of CLASSES) {
		if (cls === 'none') { assert.ok(reads.has(id) || ['list', 'show'].includes(String(input['op'])), `${id} ${JSON.stringify(input)} is a read`); }
	}
});

test('git_push deletes and forced refspecs, branch and tag delete, stash drop and clear, hard reset, worktree remove with force and checkout of a path are destructive and each read is none', () => {
	registerForTests();
	const destructive: Row[] = CLASSES.filter(r => r[2] === 'destructive').map(r => r);
	// the named operations are all there
	const names = destructive.map(([id, input]) => `${id}:${String(input['op'] ?? input['mode'] ?? (input['ref'] ?? Object.keys(input)[0]))}`);
	for (const want of ['git_push::dev', 'git_push:+main', 'git_branch:delete', 'git_tag:delete', 'git_stash:drop', 'git_stash:clear', 'git_reset:hard', 'git_checkout:path']) {
		assert.ok(names.includes(want), `${want} is destructive in the table`);
	}
	assert.ok(destructive.some(([id, i]) => id === 'git_worktree' && i['op'] === 'remove' && i['force'] === true));
	// a plain push of a branch, a tag or src:dst is not, whatever else is set
	for (const ref of ['main', 'refs/tags/v1', 'a:b', 'feature/x']) { assert.equal(classOf('git_push', { ref, setUpstream: true, dryRun: true }), 'common', ref); }
	// force flags that are false do not make a push destructive
	assert.equal(classOf('git_push', { force: false, forceRaw: false, forceToMain: false }), 'common');
	// a malformed input never gets a lower class than an ordinary mutation
	for (const bad of [{ ref: 5 }, { ref: null }, { op: 7 }, { mode: [] }]) {
		for (const id of ['git_push', 'git_reset', 'git_branch', 'git_tag', 'git_stash', 'git_worktree', 'git_checkout']) {
			assert.notEqual(classOf(id, bad as Record<string, unknown>), 'none', `${id} ${JSON.stringify(bad)}`);
		}
	}
});

test('git-approval.test.ts: the pinned inputs of the five extended tools are unchanged and the new inputs are listed as added by s8', () => {
	registerForTests();
	const live = new Map(listTools().map(t => [t.id, t]));
	assert.deepEqual([...ADDED_BY_S8.keys()].sort(), ['git_branch', 'git_remote', 'git_stash', 'git_tag', 'git_worktree']);
	for (const [id, added] of ADDED_BY_S8) {
		const now = JSON.parse(JSON.stringify(live.get(id)?.inputSchema)) as { properties: Record<string, { enum?: string[] }>; required?: string[] };
		const before = snapshot.find(s => s.id === id)?.inputSchema as { properties: Record<string, { enum?: string[] }>; required?: string[] };
		// every input and every op value that was there is still there, and `required` has not moved
		for (const name of Object.keys(before.properties)) { assert.ok(name in now.properties, `${id}.${name} is still an input`); }
		for (const value of before.properties['op']?.enum ?? []) { assert.ok(now.properties['op']?.enum?.includes(value), `${id} op ${value} is still accepted`); }
		assert.deepEqual(now.required, before.required, `${id}: what is required is unchanged`);
		// what is new is exactly what is listed as added by s8
		const newInputs = Object.keys(now.properties).filter(n => !(n in before.properties)).sort();
		const addedByS9 = ADDED_BY_S9.get(id) ?? [];
		assert.deepEqual(newInputs.filter(n => !addedByS9.includes(n)), [...added.inputs].sort(), `${id}: the new inputs are the ones listed`);
		assert.deepEqual((now.properties['op']?.enum ?? []).filter(v => !(before.properties['op']?.enum ?? []).includes(v)), added.ops, `${id}: the new ops are the ones listed`);
	}
});

test('git-approval.test.ts: the five extended tools give the class and the result they gave before for every old input', async () => {
	const pairs: Array<[Tool, Tool]> = [[gitStashTool, gitStashExtended], [gitWorktreeTool, gitWorktreeExtended], [gitRemoteTool, gitRemoteExtended], [gitBranchTool, gitBranchExtended], [gitTagTool, gitTagExtended]];
	const klass = (tool: Tool, input: ToolInput): unknown => (typeof tool.approval === 'function' ? tool.approval(input) : tool.approval);
	for (const [base, extended] of pairs) {
		const ops = (base.inputSchema as { properties: { op: { enum: string[] } } }).properties.op.enum;
		for (const op of ops) {
			for (const extra of [{}, { force: true }, { name: 'x' }]) {
				const input = { op, ...extra };
				assert.equal(klass(extended, input), klass(base, input), `${base.id} ${JSON.stringify(input)}`);
			}
		}
		assert.equal(klass(extended, {}), klass(base, {}), `${base.id} with no op`);
	}
	const { repo, wt, remote } = richRepo();
	try {
		const d = toolDeps(repo);
		for (const [base, extended] of pairs) {
			const input = { cwd: repo, op: 'list' };
			const before = await base.execute(input, d);
			const after = await extended.execute(input, d);
			assert.equal(after.success, before.success, `${base.id} list`);
			assert.deepEqual(after.data, before.data, `${base.id} list gives the same answer`);
		}
	} finally { rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); rmSync(dirname(wt), { recursive: true, force: true }); }
});
