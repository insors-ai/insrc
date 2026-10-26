/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The git coverage table (Story s4): every command of git 2.53.0's list has exactly one owner, every covered row has a
 * case that runs through executeTool in a temporary repository, and an operation assigned to s8 is never counted as
 * covered. The list of commands is a fixed fixture (coverage.ts), not whatever git is installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { listTools } from '../../../registry.js';
import type { ToolResult } from '../../../types.js';
import { GIT_2_53_COMMANDS, GIT_COVERAGE, renderCoverageTable } from '../coverage.js';
import type { CoverageRow } from '../coverage.js';
import { git, registerForTests, richRepo, toolDeps } from './_repo.js';

const MULTI_OPERATION = ['stash', 'worktree', 'remote', 'branch', 'tag', 'refs', 'reflog'];
const baseRows = GIT_COVERAGE.filter(r => r.operation === undefined);
const opRows = GIT_COVERAGE.filter(r => r.operation !== undefined);

test('every command of the recorded list has exactly one owner, an assigned row is never counted as covered and every registered git tool is in the table', () => {
	registerForTests();
	// (1) every command of the list is in the table once, as a command row, and nothing else is
	assert.equal(GIT_2_53_COMMANDS.length, 169);
	const owners = new Map<string, string[]>();
	for (const r of baseRows) { owners.set(r.command, [...(owners.get(r.command) ?? []), r.owner]); }
	for (const c of GIT_2_53_COMMANDS) { assert.deepEqual(owners.get(c)?.length, 1, `${c} has exactly one command row`); }
	assert.deepEqual([...owners.keys()].sort(), [...GIT_2_53_COMMANDS].sort(), 'the table holds exactly the recorded commands');

	// (2) a covered row names registered tools and has a case; every registered git tool is in a covered row
	const registered = new Set(listTools().map(t => t.id).filter(id => id.startsWith('git_') || id === 'git:cherry-pick'));
	assert.equal(registered.size, 38, '22 existing, 12 from s4 and 4 from s7');
	const inCovered = new Set<string>();
	for (const r of GIT_COVERAGE.filter(x => x.owner === 'covered')) {
		assert.ok((r.toolIds ?? []).length > 0, `${r.command} ${r.operation ?? ''} names its tools`);
		for (const id of r.toolIds ?? []) { assert.ok(registered.has(id), `${id} is registered (${r.command})`); inCovered.add(id); }
		const hasOperations = r.operation === undefined && opRows.some(o => o.command === r.command);
		assert.ok(hasOperations || (r.cases ?? []).length > 0, `${r.command} ${r.operation ?? ''} has a case`);
		for (const c of r.cases ?? []) { assert.ok((r.toolIds ?? []).includes(c.tool), `the case ${c.id} runs one of the row's tools`); }
	}
	assert.deepEqual([...registered].filter(id => !inCovered.has(id)), [], 'every registered git tool is in some covered row');
	assert.ok(inCovered.has('git_amend') && inCovered.has('git_fetch_refs'));

	// (4) an assigned or excluded row has no tool and no case, so nothing assigned can be counted as covered
	for (const r of GIT_COVERAGE.filter(x => x.owner !== 'covered')) {
		assert.equal(r.toolIds, undefined, `${r.command} ${r.operation ?? ''} is not served`);
		assert.equal(r.cases, undefined);
		if (r.owner === 'excluded') { assert.ok((r.reason ?? '').length > 0, `${r.command} says why`); }
	}
	// the owners add up
	const count = (o: string): number => baseRows.filter(r => r.owner === o).length;
	assert.equal(count('covered') + count('assigned') + count('excluded'), 169);

	// (5) a command only the installed git lists is logged, not failed
	const installed = execFileSync('git', ['--list-cmds=main'], { encoding: 'utf8' }).split('\n').filter(Boolean);
	const unknown = installed.filter(c => !GIT_2_53_COMMANDS.includes(c));
	if (unknown.length > 0) { console.error(`git lists commands the table does not know (update coverage.ts): ${unknown.join(', ')}`); }
});

test('multi-operation commands are tracked per subcommand and the operations the existing schemas lack are assigned to s8', () => {
	for (const command of MULTI_OPERATION) {
		const ops = opRows.filter(r => r.command === command);
		assert.ok(ops.length > 0, `${command} has a row per operation`);
		assert.equal(new Set(ops.map(r => r.operation)).size, ops.length, `${command}: no operation twice`);
		const base = baseRows.find(r => r.command === command)!;
		// a covered command never hides an assigned operation: they are rows of their own, owned by s8
		if (base.owner === 'covered') { assert.ok(ops.some(r => r.owner === 'covered'), `${command} covers at least one operation`); }
	}
	const owner = (command: string, operation: string): string | undefined => opRows.find(r => r.command === command && r.operation === operation)?.owner;
	// operations named by the LLD that the existing tool schemas do not offer
	for (const [c, op] of [['stash', 'branch'], ['stash', 'create'], ['stash', 'store'], ['stash', 'export'], ['stash', 'import'],
		['worktree', 'lock'], ['worktree', 'unlock'], ['worktree', 'repair'],
		['remote', 'show'], ['remote', 'prune'], ['remote', 'update'], ['remote', 'set-head'], ['remote', 'set-branches'], ['remote', 'set-url --add'], ['remote', 'set-url --delete'],
		['branch', 'rename'], ['branch', 'copy'], ['branch', 'set-upstream-to'], ['branch', 'unset-upstream'], ['branch', 'edit-description'],
		['tag', 'verify'], ['tag', 'sign'], ['refs', 'verify'], ['refs', 'migrate'], ['refs', 'optimize'],
		['reflog', 'show'], ['reflog', 'expire'], ['reflog', 'delete'], ['reflog', 'write']] as const) {
		assert.equal(owner(c, op), 'assigned', `${c} ${op} is assigned to s8`);
	}
	// the reads that git branch has and git_for_each_ref serves, and the two refs operations s4 covers
	for (const op of ['merged', 'no-merged', 'points-at', 'contains']) { assert.equal(owner('branch', op), 'covered', `branch ${op}`); }
	assert.equal(owner('refs', 'list'), 'covered'); assert.equal(owner('refs', 'exists'), 'covered');
	assert.equal(baseRows.find(r => r.command === 'reflog')?.owner, 'assigned');
	// a multi-operation command that is not in the list of seven would have no per-operation rows: none is missing
	assert.deepEqual([...new Set(opRows.map(r => r.command))].sort(), [...MULTI_OPERATION].sort());
});

test('docs/daemon.md shows the coverage table', () => {
	const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', 'docs', 'daemon.md'), 'utf8');
	const block = /<!-- git-coverage:start -->\n([\s\S]*?)\n<!-- git-coverage:end -->/.exec(doc);
	assert.ok(block, 'docs/daemon.md holds the generated block');
	assert.equal(block[1], renderCoverageTable(), 'the table in docs/daemon.md is the one coverage.ts renders');
});

// ---------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------

interface Ctx {
	repo: string; remote: string; wt: string;
	call(id: string, input?: Record<string, unknown>): Promise<ToolResult>;
	ok(id: string, input?: Record<string, unknown>): Promise<ToolResult>;
	git(...args: string[]): string;
}

const sha = (c: Ctx, rev: string): string => c.git('rev-parse', rev).trim();

/** The runner of each case id of the table: it runs the tool through executeTool and checks the result and the effect. */
const RUN: Record<string, (c: Ctx) => Promise<void>> = {
	'add': async c => { writeFileSync(join(c.repo, 'n.txt'), 'n'); await c.ok('git_stage', { op: 'stage', paths: ['n.txt'] }); assert.match(c.git('diff', '--cached', '--name-only'), /n\.txt/); },
	'stage': async c => { c.git('add', '-A'); await c.ok('git_stage', { op: 'unstage', paths: ['a.txt'] }); assert.equal(c.git('diff', '--cached', '--name-only').includes('a.txt'), false); },
	'annotate': async c => { const r = await c.ok('git_blame', { path: 'a.txt', ref: 'HEAD' }); assert.equal((r.data as { lines: unknown[] }).lines.length, 1); },
	'blame': async c => { const r = await c.ok('git_blame', { path: 'a.txt', startLine: 1, endLine: 1 }); assert.equal((r.data as { lines: { content: string }[] }).lines[0]?.content, 'two'); },
	'switch': async c => { await c.ok('git_branch', { op: 'switch', name: 'b' }); assert.equal(c.git('symbolic-ref', '--short', 'HEAD').trim(), 'b'); },
	'cat-file': async c => { const r = await c.ok('git_cat_file', { rev: 'HEAD:a.txt' }); assert.equal((r.data as { objects: { content: string }[] }).objects[0]?.content, 'two\n'); },
	'unpack-file': async c => { const r = await c.ok('git_cat_file', { rev: 'HEAD:a.txt', encoding: 'base64' }); assert.equal(Buffer.from((r.data as { objects: { contentBase64: string }[] }).objects[0]!.contentBase64, 'base64').toString(), 'two\n'); },
	'checkout': async c => { await c.ok('git_checkout', { mode: 'path', paths: ['a.txt'], ref: 'HEAD' }); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'two\n'); },
	'cherry-pick': async c => { c.git('checkout', '-q', '--', 'a.txt'); c.git('checkout', '-q', '-b', 'pick', 'HEAD~1'); await c.ok('git:cherry-pick', { refs: ['b'] }); assert.equal(c.git('log', '-1', '--format=%s').trim(), 'second'); },
	'commit': async c => { c.git('add', '-A'); const r = await c.ok('git_commit', { message: 'covered', allowEmpty: false }); assert.equal(c.git('log', '-1', '--format=%s').trim(), 'covered'); assert.equal((r.data as { filesChanged: number }).filesChanged, 1); },
	'commit-amend': async c => { await c.ok('git_amend', { mode: 'message', message: 'amended' }); assert.equal(c.git('log', '-1', '--format=%s').trim(), 'amended'); },
	'diff': async c => { const r = await c.ok('git_diff', {}); assert.deepEqual((r.data as { files: { path: string }[] }).files.map(f => f.path), ['a.txt']); },
	'fetch': async c => { const clone = c.git('rev-parse', '--git-dir'); void clone; c.git('remote', 'set-url', 'origin', c.remote); const r = await c.ok('git_fetch', { remote: 'origin' }); assert.equal((r.data as { remote: string }).remote, 'origin'); },
	'fetch-refs': async c => { const r = await c.ok('git_fetch_refs', { remote: 'origin', refspecs: ['+refs/heads/b:refs/remotes/origin/bb'] }); assert.equal((r.data as { updated: { ref: string }[] }).updated[0]?.ref, 'refs/remotes/origin/bb'); assert.ok(c.git('for-each-ref', 'refs/remotes/origin/bb').includes('refs/remotes/origin/bb')); },
	'for-each-ref': async c => { const r = await c.ok('git_for_each_ref', { pattern: ['refs/heads'], fields: ['refname:short'] }); assert.deepEqual((r.data as { refs: Record<string, string>[] }).refs.map(x => x['refname:short']).sort(), ['b', 'main', 'wtb']); },
	'hash-object': async c => { const r = await c.ok('git_hash_object', { path: 'a.txt' }); assert.equal((r.data as { sha: string }).sha, c.git('hash-object', 'a.txt').trim()); },
	'log': async c => { const r = await c.ok('git_log', { limit: 5 }); assert.deepEqual((r.data as { commits: { subject: string }[] }).commits.map(x => x.subject), ['second', 'first']); },
	'ls-files': async c => { const r = await c.ok('git_ls_files', {}); assert.deepEqual((r.data as { files: string[] }).files, ['a.txt']); },
	'ls-tree': async c => { const r = await c.ok('git_ls_tree', { rev: 'HEAD' }); assert.equal((r.data as { entries: { path: string }[] }).entries[0]?.path, 'a.txt'); },
	'merge': async c => { c.git('stash', 'drop', '-q'); c.git('checkout', '-q', '--', 'a.txt'); await c.ok('git_merge', { ref: 'b' }); assert.equal(sha(c, 'HEAD'), sha(c, 'b')); },
	'merge-base': async c => { const r = await c.ok('git_merge_base', { a: 'main', b: 'b' }); assert.deepEqual((r.data as { bases: string[] }).bases, [sha(c, 'main')]); },
	'pickaxe': async c => { const r = await c.ok('git_path_history', { pickaxe: 'two' }); assert.equal((r.data as { commits: { subject: string }[] }).commits[0]?.subject, 'second'); },
	'whatchanged': async c => { const r = await c.ok('git_path_history', { path: 'a.txt', limit: 1 }); assert.equal((r.data as { commits: { sha: string }[] }).commits[0]?.sha, sha(c, 'HEAD')); },
	'pull': async c => { c.git('remote', 'set-url', 'origin', c.remote); c.git('checkout', '-q', '--', 'a.txt'); const r = await c.ok('git_pull', { remote: 'origin', branch: 'main' }); assert.equal((r.data as { mode: string }).mode, 'ff-only'); },
	'push': async c => { c.git('checkout', '-q', '--', 'a.txt'); c.git('commit', '-q', '--allow-empty', '-m', 'pushed'); await c.ok('git_push', { remote: 'origin', ref: 'main' }); assert.equal(execFileSync('git', ['rev-parse', 'refs/heads/main'], { cwd: c.remote, encoding: 'utf8' }).trim(), sha(c, 'main')); },
	'rebase': async c => { c.git('checkout', '-q', '--', 'a.txt'); c.git('checkout', '-q', 'b'); await c.ok('git_rebase', { onto: 'main' }); assert.equal(c.git('merge-base', 'main', 'b').trim(), sha(c, 'main')); },
	'reset': async c => { c.git('checkout', '-q', '--', 'a.txt'); await c.ok('git_reset', { mode: 'soft', ref: 'HEAD~1' }); assert.equal(sha(c, 'HEAD'), sha(c, 'HEAD@{1}~1')); },
	'rev-list': async c => { const r = await c.ok('git_rev_list', { rev: 'HEAD', count: true }); assert.deepEqual(r.data, { count: 2 }); },
	'rev-parse': async c => { const r = await c.ok('git_rev_parse', { rev: 'HEAD' }); assert.deepEqual((r.data as { values: string[] }).values, [sha(c, 'HEAD')]); },
	'revert': async c => { c.git('checkout', '-q', '--', 'a.txt'); await c.ok('git_revert', { refs: ['HEAD'] }); assert.match(c.git('log', '-1', '--format=%s'), /Revert "second"/); },
	'show': async c => { const r = await c.ok('git_show', { ref: 'HEAD' }); assert.equal((r.data as { subject: string }).subject, 'second'); },
	'show-ref': async c => { const r = await c.ok('git_show_ref', { ref: 'refs/heads/b', verify: true }); assert.equal((r.data as { refs: { sha: string }[] }).refs[0]?.sha, sha(c, 'b')); },
	'status': async c => { const r = await c.ok('git_status', {}); assert.deepEqual((r.data as { unstaged: { path: string }[] }).unstaged.map(e => e.path), ['a.txt']); },
	'config': async c => { const r = await c.ok('git_config', { key: 'user.email' }); assert.deepEqual(r.data, { found: true, value: c.git('config', '--get', 'user.email').trim() }); const none = await c.ok('git_config', { key: 'no.such.key' }); assert.deepEqual(none.data, { found: false }); },
	'ls-remote': async c => { const r = await c.ok('git_ls_remote', { remote: 'origin', heads: true, patterns: ['refs/heads/main'] }); assert.deepEqual((r.data as { entries: { ref: string }[] }).entries.map(e => e.ref), ['refs/heads/main']); },
	'update-ref': async c => { c.git('update-ref', 'refs/heads/gone', 'HEAD'); await c.ok('git_update_ref', { ref: 'refs/heads/gone', delete: true }); assert.equal(c.git('for-each-ref', 'refs/heads/gone').trim(), ''); },
	'rm': async c => { c.git('checkout', '-q', '--', 'a.txt'); await c.ok('git_rm', { paths: ['a.txt'] }); assert.equal(existsSync(join(c.repo, 'a.txt')), false); },
	'symbolic-ref': async c => { const r = await c.ok('git_symbolic_ref', { ref: 'HEAD', op: 'get' }); assert.deepEqual(r.data, { target: 'refs/heads/main' }); },

	'stash list': async c => { const r = await c.ok('git_stash', { op: 'list' }); assert.equal((r.data as { entries: unknown[] }).entries.length, 1); },
	'stash show': async c => { const r = await c.ok('git_stash', { op: 'show' }); assert.match((r.data as { output: string }).output, /stashed/); },
	'stash push': async c => { await c.ok('git_stash', { op: 'push', message: 'wip' }); assert.equal(c.git('stash', 'list').trim().split('\n').length, 2); },
	'stash pop': async c => { c.git('checkout', '-q', '--', 'a.txt'); await c.ok('git_stash', { op: 'pop' }); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'stashed\n'); assert.equal(c.git('stash', 'list').trim(), ''); },
	'stash apply': async c => { c.git('checkout', '-q', '--', 'a.txt'); await c.ok('git_stash', { op: 'apply' }); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'stashed\n'); assert.notEqual(c.git('stash', 'list').trim(), ''); },
	'stash drop': async c => { await c.ok('git_stash', { op: 'drop' }); assert.equal(c.git('stash', 'list').trim(), ''); },
	'stash clear': async c => { await c.ok('git_stash', { op: 'clear' }); assert.equal(c.git('stash', 'list').trim(), ''); },
	'worktree list': async c => { const r = await c.ok('git_worktree', { op: 'list' }); assert.equal((r.data as { worktrees: unknown[] }).worktrees.length, 2); },
	'worktree add': async c => { const p = c.wt + '-two'; await c.ok('git_worktree', { op: 'add', path: p, branch: 'newwt', createBranch: true }); assert.ok(existsSync(join(p, '.git'))); rmSync(p, { recursive: true, force: true }); },
	'worktree move': async c => { const p = c.wt + '-moved'; await c.ok('git_worktree', { op: 'move', path: c.wt, newPath: p }); assert.ok(existsSync(join(p, '.git'))); rmSync(p, { recursive: true, force: true }); },
	'worktree remove': async c => { await c.ok('git_worktree', { op: 'remove', path: c.wt }); assert.equal(existsSync(c.wt), false); },
	'worktree prune': async c => { rmSync(c.wt, { recursive: true, force: true }); await c.ok('git_worktree', { op: 'prune' }); assert.doesNotMatch(c.git('worktree', 'list'), /linked/); },
	'remote list': async c => { const r = await c.ok('git_remote', { op: 'list' }); assert.equal((r.data as { remotes: { name: string }[] }).remotes[0]?.name, 'origin'); },
	'remote get-url': async c => { const r = await c.ok('git_remote', { op: 'list' }); assert.equal((r.data as { remotes: { fetchUrl: string; pushUrl: string }[] }).remotes[0]?.fetchUrl, c.remote); },
	'remote add': async c => { await c.ok('git_remote', { op: 'add', name: 'two', url: c.remote }); assert.equal(c.git('remote', 'get-url', 'two').trim(), c.remote); },
	'remote rename': async c => { await c.ok('git_remote', { op: 'rename', name: 'origin', newName: 'upstream' }); assert.equal(c.git('remote').trim(), 'upstream'); },
	'remote remove': async c => { await c.ok('git_remote', { op: 'remove', name: 'origin' }); assert.equal(c.git('remote').trim(), ''); },
	'remote set-url': async c => { await c.ok('git_remote', { op: 'set-url', name: 'origin', url: '/elsewhere' }); assert.equal(c.git('remote', 'get-url', 'origin').trim(), '/elsewhere'); },
	'branch list': async c => { const r = await c.ok('git_branch', { op: 'list' }); assert.deepEqual((r.data as { branches: { name: string }[] }).branches.map(b => b.name).sort(), ['b', 'main', 'wtb']); },
	'branch create': async c => { await c.ok('git_branch', { op: 'create', name: 'made', startPoint: 'b' }); assert.equal(sha(c, 'made'), sha(c, 'b')); },
	'branch delete': async c => { await c.ok('git_branch', { op: 'delete', name: 'b' }); assert.equal(c.git('branch', '--list', 'b').trim(), ''); },
	'branch merged': async c => { const r = await c.ok('git_for_each_ref', { pattern: ['refs/heads'], fields: ['refname:short'], merged: 'main' }); assert.ok((r.data as { refs: Record<string, string>[] }).refs.some(x => x['refname:short'] === 'b')); },
	'branch no-merged': async c => { c.git('checkout', '-q', '-b', 'ahead'); c.git('commit', '-q', '--allow-empty', '-m', 'ahead'); c.git('checkout', '-q', 'main'); const r = await c.ok('git_for_each_ref', { pattern: ['refs/heads'], fields: ['refname:short'], noMerged: 'main' }); assert.deepEqual((r.data as { refs: Record<string, string>[] }).refs.map(x => x['refname:short']), ['ahead']); },
	'branch points-at': async c => { const r = await c.ok('git_for_each_ref', { pattern: ['refs/heads'], fields: ['refname:short'], pointsAt: sha(c, 'main') }); assert.ok((r.data as { refs: Record<string, string>[] }).refs.some(x => x['refname:short'] === 'b')); },
	'branch contains': async c => { const r = await c.ok('git_for_each_ref', { pattern: ['refs/heads'], fields: ['refname:short'], contains: sha(c, 'HEAD~1') }); assert.equal((r.data as { refs: unknown[] }).refs.length, 3); },
	'branch show-current': async c => { const r = await c.ok('git_rev_parse', { rev: 'HEAD', abbrevRef: true }); assert.deepEqual((r.data as { values: string[] }).values, ['main']); },
	'tag list': async c => { const r = await c.ok('git_tag', { op: 'list' }); assert.deepEqual((r.data as { tags: { name: string }[] }).tags.map(x => x.name), ['t']); },
	'tag create': async c => { await c.ok('git_tag', { op: 'create', name: 'v2', message: 'release' }); assert.equal(c.git('cat-file', '-t', 'v2').trim(), 'tag'); },
	'tag delete': async c => { await c.ok('git_tag', { op: 'delete', name: 't' }); assert.equal(c.git('tag', '--list', 't').trim(), ''); },
	'refs list': async c => { const r = await c.ok('git_for_each_ref', {}); assert.ok((r.data as { refs: unknown[] }).refs.length >= 4); },
	'refs exists': async c => { const yes = await c.ok('git_show_ref', { ref: 'refs/heads/main', exists: true }); assert.equal((yes.data as { refs: unknown[] }).refs.length, 1); const no = await c.ok('git_show_ref', { ref: 'refs/heads/none', exists: true }); assert.deepEqual(no.data, { refs: [] }); },
};

test('every covered row\'s case runs through executeTool and matches its assertion', async () => {
	registerForTests();
	const covered: CoverageRow[] = GIT_COVERAGE.filter(r => r.owner === 'covered');
	const ids = covered.flatMap(r => (r.cases ?? []).map(c => c.id ?? ''));
	assert.equal(new Set(ids).size, ids.length, 'a case id is used once');
	assert.deepEqual([...ids].sort(), Object.keys(RUN).sort(), 'every case has a runner and every runner a case');
	const failures: string[] = [];
	for (const row of covered) {
		for (const kase of row.cases ?? []) {
			const { repo, wt, remote } = richRepo();
			const base = { ...toolDeps(repo), approvalMode: 'auto' as const };
			_setApprovalGateForTests(() => ({ async ask(r) { return { requestId: r.requestId, decision: 'approve' as const }; } }));
			const ctx: Ctx = {
				repo, wt, remote,
				call: (id, input = {}) => executeTool(id, { cwd: repo, ...input }, base),
				ok: async (id, input = {}) => {
					assert.ok(row.toolIds?.includes(id), `${kase.id}: ${id} is one of the row's tools`);
					assert.equal(kase.tool === id || (row.toolIds ?? []).includes(id), true);
					const r = await executeTool(id, { cwd: repo, ...input }, base);
					assert.equal(r.success, true, `${kase.id}: ${id} ${JSON.stringify(input)}: ${r.output}`);
					return r;
				},
				git: (...a) => git(repo, ...a),
			};
			try { await RUN[kase.id]!(ctx); }
			catch (err) { failures.push(`case ${kase.id} (${kase.tool}): ${(err instanceof Error ? err.message : String(err)).split('\n').slice(0, 3).join(' | ')}`); }
			finally {
				_setApprovalGateForTests(undefined);
				rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); rmSync(dirname(wt), { recursive: true, force: true });
			}
		}
	}
	assert.deepEqual(failures, [], 'every case holds');
});

test('git_amend runs its own case and git_diff with path and paths keeps its legacy failure', async () => {
	registerForTests();
	const commit = GIT_COVERAGE.find(r => r.command === 'commit' && r.operation === undefined)!;
	assert.deepEqual((commit.cases ?? []).map(c => c.tool), ['git_commit', 'git_amend'], 'commit is served by both tools, each with its own case');
	const { repo, wt, remote } = richRepo();
	try {
		const base = { ...toolDeps(repo), approvalMode: 'auto' as const };
		const both = await executeTool('git_diff', { cwd: repo, path: 'a.txt', paths: ['a.txt'] }, base);
		assert.equal(both.success, false);
		assert.match(both.output, /\[git:diff\] invalid-input: `paths` must be a non-empty array of non-empty strings, and cannot be combined with `path`/);
		assert.equal(both.error, 'invalid-input');
	} finally { rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); rmSync(dirname(wt), { recursive: true, force: true }); }
});

test('git_config, git_ls_remote, git_update_ref and git_rm are marked as built by s7 and are in gitToolDefinitions', async () => {
	const { gitToolDefinitions } = await import('../definitions.js');
	const ids = new Set(gitToolDefinitions.map(t => t.id));
	for (const [command, tool] of [['config', 'git_config'], ['ls-remote', 'git_ls_remote'], ['update-ref', 'git_update_ref'], ['rm', 'git_rm']] as const) {
		const row = GIT_COVERAGE.find(r => r.command === command && r.operation === undefined)!;
		assert.equal(row.owner, 'covered', `${command} is covered, no longer assigned to s8`);
		assert.equal(row.builtBy, 's7', `${command} is marked as built by s7`);
		assert.deepEqual(row.toolIds, [tool]);
		assert.ok(ids.has(tool), `${tool} is in gitToolDefinitions`);
	}
	assert.match(renderCoverageTable(), /\| config \|  \| covered \| git_config \(built by s7\) \|/);
});
