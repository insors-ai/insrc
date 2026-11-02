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
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { listTools } from '../../../registry.js';
import type { ToolResult } from '../../../types.js';
import { GIT_2_53_COMMANDS, GIT_COVERAGE, renderCoverageTable } from '../coverage.js';
import type { CoverageRow } from '../coverage.js';
import { git, newRepo, registerForTests, richRepo, toolDeps } from './_repo.js';

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
	assert.equal(registered.size, 49, '22 existing, 12 from s4, 4 from s7, 2 from s9 and git_inspect, git_text, git_objects, git_patch, git_tree, git_maintenance, git_setup, git_refs, git_reflog from s8');
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

test('multi-operation commands are tracked per subcommand and the operations s8 added are covered', () => {
	for (const command of MULTI_OPERATION) {
		const ops = opRows.filter(r => r.command === command);
		assert.ok(ops.length > 0, `${command} has a row per operation`);
		assert.equal(new Set(ops.map(r => r.operation)).size, ops.length, `${command}: no operation twice`);
		const base = baseRows.find(r => r.command === command)!;
		// a covered command never hides an assigned operation: they are rows of their own, owned by s8
		if (base.owner === 'covered') { assert.ok(ops.some(r => r.owner === 'covered'), `${command} covers at least one operation`); }
	}
	const owner = (command: string, operation: string): string | undefined => opRows.find(r => r.command === command && r.operation === operation)?.owner;
	// the operations s8 added to the five existing tools are covered by those tools
	for (const [c, op] of [['stash', 'branch'], ['stash', 'create'], ['stash', 'store'], ['stash', 'export'], ['stash', 'import'],
		['worktree', 'lock'], ['worktree', 'unlock'], ['worktree', 'repair'],
		['remote', 'show'], ['remote', 'prune'], ['remote', 'update'], ['remote', 'set-head'], ['remote', 'set-branches'], ['remote', 'set-url --add'], ['remote', 'set-url --delete'],
		['branch', 'rename'], ['branch', 'copy'], ['branch', 'set-upstream-to'], ['branch', 'unset-upstream'], ['branch', 'edit-description'],
		['tag', 'verify'], ['tag', 'sign'], ['refs', 'verify'], ['refs', 'migrate'], ['refs', 'optimize'],
		['reflog', 'show'], ['reflog', 'expire'], ['reflog', 'delete'], ['reflog', 'write']] as const) {
		assert.equal(owner(c, op), 'covered', `${c} ${op} is covered`);
	}
	// the reads that git branch has and git_for_each_ref serves, and the two refs operations s4 covers
	for (const op of ['merged', 'no-merged', 'points-at', 'contains']) { assert.equal(owner('branch', op), 'covered', `branch ${op}`); }
	assert.equal(owner('refs', 'list'), 'covered'); assert.equal(owner('refs', 'exists'), 'covered');
	assert.equal(baseRows.find(r => r.command === 'reflog')?.owner, 'covered');
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

/** Sign with a throwaway ssh key, so a tag can be signed and verified without gpg. */
function sshSigning(c: Ctx): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sshkey-')); const key = join(dir, 'k');
	execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key, '-C', 't@example.com']);
	const pub = readFileSync(`${key}.pub`, 'utf8').trim(); writeFileSync(join(dir, 'allowed'), `t@example.com ${pub}\n`);
	c.git('config', 'gpg.format', 'ssh'); c.git('config', 'user.signingkey', `${key}.pub`); c.git('config', 'gpg.ssh.allowedSignersFile', join(dir, 'allowed'));
}

/** Pack the repository and return the path of its pack index. */
function packIndex(c: Ctx): string {
	c.git('gc', '-q');
	const dir = join(c.repo, '.git', 'objects', 'pack');
	return join(dir, readdirSync(dir).find(f => f.endsWith('.idx'))!);
}

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
	'diff-tree': async c => { const r = await c.ok('git_diff_tree', { rev: 'HEAD' }); assert.deepEqual(r.data, { paths: ['a.txt'] }); },
	'merge-tree': async c => { const r = await c.ok('git_merge_tree', { a: 'main', b: 'b' }); assert.deepEqual(r.data, { tree: c.git('rev-parse', 'main^{tree}').trim(), clean: true }); },
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

	// ---- git_inspect (s8)
	'describe': async c => { const r = await c.ok('git_inspect', { op: 'describe', tags: true }); assert.deepEqual(r.data, { op: 'describe', text: 't' }); },
	'name-rev': async c => { const r = await c.ok('git_inspect', { op: 'name-rev', rev: 'HEAD' }); assert.match((r.data as { text: string }).text, /main|tags\/t/); },
	'cherry': async c => {
		const same = await c.ok('git_inspect', { op: 'cherry', upstream: 'main', head: 'b' }); assert.deepEqual(same.data, { op: 'cherry', count: 0, items: [] });
		c.git('checkout', '-q', '-b', 'x'); c.git('commit', '-q', '--allow-empty', '-m', 'only on x');
		const r = await c.ok('git_inspect', { op: 'cherry', upstream: 'main', head: 'x' }); assert.deepEqual((r.data as { items: unknown[] }).items, [{ sign: '+', sha: sha(c, 'x') }]);
	},
	'shortlog': async c => { const r = await c.ok('git_inspect', { op: 'shortlog', summary: true, numbered: true }); assert.match((r.data as { text: string }).text, /^2\s+T$/); },
	'show-branch': async c => { const r = await c.ok('git_inspect', { op: 'show-branch', refs: ['main', 'b'] }); assert.match((r.data as { text: string }).text, /second/); },
	'grep': async c => {
		const hit = await c.ok('git_inspect', { op: 'grep', pattern: 'dirty' }); assert.deepEqual(hit.data, { op: 'grep', found: true, matches: ['a.txt:1:dirty'] });
		const none = await c.ok('git_inspect', { op: 'grep', pattern: 'zzz' }); assert.deepEqual(none.data, { op: 'grep', found: false, matches: [] });
	},
	'last-modified': async c => { const r = await c.ok('git_inspect', { op: 'last-modified', paths: ['a.txt'] }); assert.deepEqual((r.data as { items: unknown[] }).items, [{ sha: sha(c, 'HEAD'), path: 'a.txt' }]); },
	'count-objects': async c => { const r = await c.ok('git_inspect', { op: 'count-objects', verbose: true }); assert.match((r.data as { text: string }).text, /^count: \d+/m); },
	'var': async c => { const r = await c.ok('git_inspect', { op: 'var', variable: 'GIT_AUTHOR_IDENT' }); assert.match((r.data as { text: string }).text, /^T <t@example\.com> \d+ /); },
	'version': async c => { const r = await c.ok('git_inspect', { op: 'version' }); assert.match((r.data as { text: string }).text, /^git version \d/); },
	'check-attr': async c => { const r = await c.ok('git_inspect', { op: 'check-attr', attrs: ['text'], paths: ['a.txt'] }); assert.deepEqual((r.data as { items: unknown[] }).items, [{ path: 'a.txt', attr: 'text', value: 'unspecified' }]); },
	'check-ignore': async c => {
		writeFileSync(join(c.repo, '.gitignore'), '*.log\n');
		const hit = await c.ok('git_inspect', { op: 'check-ignore', paths: ['x.log', 'a.txt'] }); assert.deepEqual(hit.data, { op: 'check-ignore', found: true, paths: ['x.log'] });
		const none = await c.ok('git_inspect', { op: 'check-ignore', paths: ['a.txt'] }); assert.deepEqual(none.data, { op: 'check-ignore', found: false, paths: [] });
	},
	'check-mailmap': async c => { const r = await c.ok('git_inspect', { op: 'check-mailmap', contacts: ['T <t@example.com>'] }); assert.deepEqual(r.data, { op: 'check-mailmap', count: 1, lines: ['T <t@example.com>'] }); },
	'check-ref-format': async c => {
		const yes = await c.ok('git_inspect', { op: 'check-ref-format', name: 'refs/heads/ok' }); assert.deepEqual(yes.data, { op: 'check-ref-format', valid: true });
		const no = await c.ok('git_inspect', { op: 'check-ref-format', name: 'refs/heads/a..b' }); assert.deepEqual(no.data, { op: 'check-ref-format', valid: false });
	},
	'get-tar-commit-id': async c => {
		const archive = execFileSync('git', ['archive', 'HEAD'], { cwd: c.repo, maxBuffer: 16 * 1024 * 1024 }).toString('base64');
		const r = await c.ok('git_inspect', { op: 'get-tar-commit-id', archive }); assert.deepEqual(r.data, { op: 'get-tar-commit-id', found: true, sha: sha(c, 'HEAD') });
	},
	'diff-files': async c => { const r = await c.ok('git_inspect', { op: 'diff-files' }); assert.deepEqual(r.data, { op: 'diff-files', count: 1, items: [{ status: 'M', path: 'a.txt' }] }); },
	'diff-index': async c => {
		const r = await c.ok('git_inspect', { op: 'diff-index', rev: 'HEAD' }); assert.deepEqual((r.data as { items: unknown[] }).items, [{ status: 'M', path: 'a.txt' }]);
		const staged = await c.ok('git_inspect', { op: 'diff-index', rev: 'HEAD', cached: true }); assert.equal((staged.data as { count: number }).count, 0);
	},
	'diff-pairs': async c => { const r = await c.ok('git_inspect', { op: 'diff-pairs', raw: c.git('diff-tree', '-r', '-z', 'HEAD~1', 'HEAD') }); assert.match((r.data as { text: string }).text, /^diff --git a\/a\.txt b\/a\.txt/); },
	'range-diff': async c => { const r = await c.ok('git_inspect', { op: 'range-diff', rangeA: 'main~1..main', rangeB: 'main~1..b' }); assert.match((r.data as { text: string }).text, /1:\s+\w+ = 1:\s+\w+ second/); },
	'show-index': async c => {
		const idx = packIndex(c);
		const r = await c.ok('git_inspect', { op: 'show-index', index: readFileSync(idx).toString('base64') }); assert.ok((r.data as { text: string }).text.includes(sha(c, 'HEAD')));
	},
	'verify-commit': async c => { const r = await c.ok('git_inspect', { op: 'verify-commit', rev: 'HEAD' }); assert.equal((r.data as { verified: boolean }).verified, false); },
	'verify-tag': async c => { const r = await c.ok('git_inspect', { op: 'verify-tag', rev: 't' }); assert.equal((r.data as { verified: boolean }).verified, false); },
	'verify-pack': async c => { const r = await c.ok('git_inspect', { op: 'verify-pack', pack: packIndex(c), verbose: true }); assert.match((r.data as { text: string }).text, /: ok$/m); },
	'fsck': async c => { const r = await c.ok('git_inspect', { op: 'fsck' }); assert.equal(typeof (r.data as { text: string }).text, 'string'); c.git('fsck'); },
	'fsck-objects': async c => { const r = await c.ok('git_inspect', { op: 'fsck-objects', noDangling: true }); assert.equal(typeof (r.data as { text: string }).text, 'string'); },
	'pack-redundant': async c => { packIndex(c); const r = await c.ok('git_inspect', { op: 'pack-redundant' }); assert.equal((r.data as { text: string }).text, ''); },
	'repo': async c => {
		const info = await c.ok('git_inspect', { op: 'repo', what: 'info', keys: ['layout.bare'] }); assert.deepEqual(info.data, { op: 'repo', text: 'layout.bare=false' });
		const shape = await c.ok('git_inspect', { op: 'repo', what: 'structure' }); assert.match((shape.data as { text: string }).text, /References/);
	},

	// ---- git_text (s8)
	'column': async c => { const r = await c.ok('git_text', { op: 'column', content: 'a\nb\nc\nd\n', width: 20 }); assert.deepEqual(r.data, { op: 'column', text: 'a b c d' }); },
	'stripspace': async c => {
		const r = await c.ok('git_text', { op: 'stripspace', content: '  hi  \n\n\n\nx\n# c\n', stripComments: true }); assert.deepEqual(r.data, { op: 'stripspace', text: '  hi\n\nx\n' });
		const commented = await c.ok('git_text', { op: 'stripspace', content: 'a\n', commentLines: true }); assert.equal((commented.data as { text: string }).text, '# a\n');
	},
	'interpret-trailers': async c => { const r = await c.ok('git_text', { op: 'interpret-trailers', content: 'subject\n\nbody\n', trailers: ['Signed-off-by: A <a@b.c>'] }); assert.equal((r.data as { text: string }).text, 'subject\n\nbody\n\nSigned-off-by: A <a@b.c>\n'); },
	'fmt-merge-msg': async c => { const r = await c.ok('git_text', { op: 'fmt-merge-msg', content: `${sha(c, 'HEAD')}\t\tbranch 'b' of /x\n` }); assert.equal((r.data as { text: string }).text, "Merge branch 'b' of /x\n"); },
	'patch-id': async c => {
		const patch = c.git('diff', 'HEAD~1', 'HEAD');
		const r = await c.ok('git_text', { op: 'patch-id', content: patch }); const items = (r.data as { items: { patchId: string }[] }).items;
		assert.equal(items.length, 1); assert.equal(items[0]!.patchId, execFileSync('git', ['patch-id', '--stable'], { cwd: c.repo, input: patch, encoding: 'utf8' }).split(' ')[0]);
	},
	'mailinfo': async c => {
		const mail = c.git('format-patch', '-1', '--stdout');
		const r = await c.ok('git_text', { op: 'mailinfo', content: mail }); const d = r.data as { headers: string; patch: string };
		assert.match(d.headers, /^Author: T\nEmail: t@example\.com\nSubject: second\n/); assert.match(d.patch, /a\.txt \| 2 \+-/);
	},
	'mailsplit': async c => {
		c.git('commit', '-q', '--allow-empty', '-m', 'third');
		const r = await c.ok('git_text', { op: 'mailsplit', content: c.git('format-patch', '--stdout', '-2') }); const d = r.data as { count: number; messages: string[] };
		assert.equal(d.count, 2); assert.match(d.messages[0]!, /Subject: \[PATCH 1\/2\] second/); assert.match(d.messages[1]!, /Subject: \[PATCH 2\/2\] third/);
	},

	// ---- git_objects (s8)
	'commit-tree': async c => {
		const r = await c.ok('git_objects', { op: 'commit-tree', tree: 'HEAD^{tree}', parents: [sha(c, 'HEAD')], message: 'synthetic' }); const made = (r.data as { sha: string }).sha;
		assert.equal(c.git('log', '-1', '--format=%s', made).trim(), 'synthetic'); assert.equal(c.git('rev-parse', `${made}^`).trim(), sha(c, 'HEAD'));
	},
	'mktree': async c => { const r = await c.ok('git_objects', { op: 'mktree', entries: c.git('ls-tree', 'HEAD') }); assert.deepEqual(r.data, { op: 'mktree', sha: sha(c, 'HEAD^{tree}') }); },
	'mktag': async c => {
		const tag = `object ${sha(c, 'HEAD')}\ntype commit\ntag v9\ntagger T <t@example.com> 1700000000 +0000\n\nmsg\n`;
		const r = await c.ok('git_objects', { op: 'mktag', tag }); assert.equal(c.git('cat-file', '-t', (r.data as { sha: string }).sha).trim(), 'tag');
	},
	'write-tree': async c => { const r = await c.ok('git_objects', { op: 'write-tree' }); assert.deepEqual(r.data, { op: 'write-tree', sha: sha(c, 'HEAD^{tree}') }); },
	'read-tree': async c => {
		await c.ok('git_objects', { op: 'read-tree', rev: 'HEAD~1' }); assert.equal(c.git('ls-files', '-s').split(/\s+/)[1], sha(c, 'HEAD~1:a.txt'));
		await c.ok('git_objects', { op: 'read-tree', rev: 'HEAD~1', reset: true, update: true }); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'one\n');
	},
	'update-index': async c => {
		writeFileSync(join(c.repo, 'n.txt'), 'n'); await c.ok('git_objects', { op: 'update-index', add: true, paths: ['n.txt'] }); assert.match(c.git('ls-files'), /n\.txt/);
		await c.ok('git_objects', { op: 'update-index', add: true, cacheinfo: `100644,${sha(c, 'HEAD:a.txt')},y.txt` }); assert.match(c.git('ls-files'), /y\.txt/);
		await c.ok('git_objects', { op: 'update-index', indexInfo: `100644 ${sha(c, 'HEAD:a.txt')} 0\tz.txt\n` }); assert.match(c.git('ls-files'), /z\.txt/);
	},
	'replace': async c => {
		const old = sha(c, 'HEAD~1'); const made = await c.ok('git_objects', { op: 'replace', action: 'create', object: old, replacement: sha(c, 'HEAD') });
		assert.ok(made.success); assert.match(c.git('replace', '--list'), new RegExp(old));
		const listed = await c.ok('git_objects', { op: 'replace', action: 'list' }); assert.match((listed.data as { text: string }).text, new RegExp(old));
		await c.ok('git_objects', { op: 'replace', action: 'delete', object: old }); assert.equal(c.git('replace', '--list').trim(), '');
	},
	'notes': async c => {
		await c.ok('git_objects', { op: 'notes', action: 'add', message: 'hi' }); assert.equal(c.git('notes', 'show', 'HEAD').trim(), 'hi');
		await c.ok('git_objects', { op: 'notes', action: 'append', message: 'more' }); assert.match(c.git('notes', 'show', 'HEAD'), /hi\n\nmore/);
		const shown = await c.ok('git_objects', { op: 'notes', action: 'show' }); assert.match((shown.data as { text: string }).text, /^hi\n\nmore$/);
		const listed = await c.ok('git_objects', { op: 'notes', action: 'list' }); assert.match((listed.data as { text: string }).text, new RegExp(sha(c, 'HEAD')));
		await c.ok('git_objects', { op: 'notes', action: 'remove' }); assert.equal(c.git('notes', 'list').trim(), '');
		await c.ok('git_objects', { op: 'notes', action: 'prune' });
	},
	'fast-import': async c => {
		const stream = 'blob\nmark :1\ndata 3\nabc\ncommit refs/heads/imp\nmark :2\ncommitter T <t@example.com> 1700000000 +0000\ndata 3\nimp\nM 100644 :1 f.txt\n\n';
		await c.ok('git_objects', { op: 'fast-import', stream }); assert.equal(c.git('log', '-1', '--format=%s', 'imp').trim(), 'imp'); assert.equal(c.git('show', 'imp:f.txt'), 'abc');
	},
	'unpack-objects': async c => {
		const pack = execFileSync('git', ['pack-objects', '--revs', '--stdout', '-q'], { cwd: c.repo, input: 'HEAD\n' }).toString('base64'); const other = newRepo();
		try { await c.ok('git_objects', { op: 'unpack-objects', pack, cwd: other }); assert.equal(git(other, 'cat-file', '-t', sha(c, 'HEAD')).trim(), 'commit'); } finally { rmSync(other, { recursive: true, force: true }); }
	},
	'index-pack': async c => {
		const pack = execFileSync('git', ['pack-objects', '--revs', '--stdout', '-q'], { cwd: c.repo, input: 'HEAD\n' }).toString('base64'); const other = newRepo();
		try {
			const r = await c.ok('git_objects', { op: 'index-pack', pack, cwd: other }); assert.match((r.data as { text: string }).text, /^pack\t[0-9a-f]{40}$/);
			assert.ok(readdirSync(join(other, '.git', 'objects', 'pack')).some(f => f.endsWith('.idx'))); assert.equal(git(other, 'cat-file', '-t', sha(c, 'HEAD')).trim(), 'commit');
		} finally { rmSync(other, { recursive: true, force: true }); }
	},
	'pack-objects': async c => {
		const r = await c.ok('git_objects', { op: 'pack-objects', revs: 'HEAD\n' }); const d = r.data as { pack: string; size: number };
		assert.equal(Buffer.from(d.pack, 'base64').subarray(0, 4).toString(), 'PACK'); assert.equal(Buffer.from(d.pack, 'base64').length, d.size);
	},

	// ---- git_patch (s8)
	'apply': async c => {
		const patch = c.git('diff'); c.git('checkout', '-q', '--', 'a.txt');
		const check = await c.ok('git_patch', { op: 'apply', patch, check: true }); assert.equal(check.success, true); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'two\n', '--check changes nothing');
		await c.ok('git_patch', { op: 'apply', patch }); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'dirty\n');
	},
	'am': async c => {
		const mbox = c.git('format-patch', '--stdout', '-1'); c.git('checkout', '-q', '--', 'a.txt'); c.git('reset', '-q', '--hard', 'HEAD~1');
		await c.ok('git_patch', { op: 'am', mbox }); assert.equal(c.git('log', '-1', '--format=%s').trim(), 'second'); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'two\n');
	},
	'format-patch': async c => {
		const printed = await c.ok('git_patch', { op: 'format-patch', range: 'HEAD~1' }); assert.match((printed.data as { text: string }).text, /^From [0-9a-f]{40} .*\nFrom: T <t@example\.com>/);
		const dir = mkdtempSync(join(tmpdir(), 'insrc-fp-'));
		try { await c.ok('git_patch', { op: 'format-patch', range: 'HEAD~1', outputDirectory: dir }); assert.deepEqual(readdirSync(dir), ['0001-second.patch']); } finally { rmSync(dir, { recursive: true, force: true }); }
	},
	'archive': async c => {
		const r = await c.ok('git_patch', { op: 'archive', rev: 'HEAD' }); const d = r.data as { archive: string; size: number };
		assert.equal(execFileSync('tar', ['-tf', '-'], { input: Buffer.from(d.archive, 'base64'), encoding: 'utf8' }).trim(), 'a.txt'); assert.equal(Buffer.from(d.archive, 'base64').length, d.size);
		const dir = mkdtempSync(join(tmpdir(), 'insrc-ar-')); const out = join(dir, 'a.zip');
		try { const f = await c.ok('git_patch', { op: 'archive', rev: 'HEAD', format: 'zip', output: out }); assert.equal((f.data as { size: number }).size > 0, true); assert.ok(existsSync(out)); } finally { rmSync(dir, { recursive: true, force: true }); }
	},
	'bundle': async c => {
		const dir = mkdtempSync(join(tmpdir(), 'insrc-bu-')); const file = join(dir, 'x.bundle');
		try {
			await c.ok('git_patch', { op: 'bundle', action: 'create', file, revs: ['main'] }); assert.ok(existsSync(file));
			const ok = await c.ok('git_patch', { op: 'bundle', action: 'verify', file }); assert.match((ok.data as { text: string }).text, /is okay/);
			const heads = await c.ok('git_patch', { op: 'bundle', action: 'list-heads', file }); assert.match((heads.data as { text: string }).text, /refs\/heads\/main/);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	},
	'fast-export': async c => {
		const r = await c.ok('git_patch', { op: 'fast-export', revs: ['main'] }); assert.match((r.data as { text: string }).text, /^commit refs\/heads\/main$/m);
		const dir = mkdtempSync(join(tmpdir(), 'insrc-fe-')); const marks = join(dir, 'marks');
		try { await c.ok('git_patch', { op: 'fast-export', all: true, exportMarks: marks }); assert.match(readFileSync(marks, 'utf8'), /^:\d+ [0-9a-f]{40}/m); } finally { rmSync(dir, { recursive: true, force: true }); }
	},
	'diagnose': async c => {
		const dir = mkdtempSync(join(tmpdir(), 'insrc-dg-'));
		try { await c.ok('git_patch', { op: 'diagnose', output: dir, suffix: 'x' }); assert.deepEqual(readdirSync(dir), ['git-diagnostics-x.zip']); } finally { rmSync(dir, { recursive: true, force: true }); }
	},
	'bugreport': async c => {
		const dir = mkdtempSync(join(tmpdir(), 'insrc-br-'));
		try { await c.ok('git_patch', { op: 'bugreport', output: dir, suffix: 'x' }); assert.deepEqual(readdirSync(dir), ['git-bugreport-x.txt']); } finally { rmSync(dir, { recursive: true, force: true }); }
	},

	// ---- git_tree (s8)
	'checkout-index': async c => {
		rmSync(join(c.repo, 'a.txt')); await c.ok('git_tree', { op: 'checkout-index', paths: ['a.txt'] }); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'two\n');
		writeFileSync(join(c.repo, 'a.txt'), 'changed\n'); await c.ok('git_tree', { op: 'checkout-index', all: true, force: true }); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'two\n');
	},
	'clean': async c => {
		writeFileSync(join(c.repo, 'u.txt'), 'u');
		const dry = await c.ok('git_tree', { op: 'clean', dryRun: true }); assert.equal((dry.data as { text: string }).text, 'Would remove u.txt'); assert.ok(existsSync(join(c.repo, 'u.txt')));
		await c.ok('git_tree', { op: 'clean' }); assert.equal(existsSync(join(c.repo, 'u.txt')), false);
	},
	'restore': async c => {
		await c.ok('git_tree', { op: 'restore', paths: ['a.txt'] }); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'two\n');
		writeFileSync(join(c.repo, 'a.txt'), 'staged\n'); c.git('add', 'a.txt'); await c.ok('git_tree', { op: 'restore', paths: ['a.txt'], staged: true });
		assert.equal(c.git('diff', '--cached', '--name-only').trim(), ''); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'staged\n');
	},
	'mv': async c => { await c.ok('git_tree', { op: 'mv', from: 'a.txt', to: 'b.txt' }); assert.equal(existsSync(join(c.repo, 'a.txt')), false); assert.equal(c.git('ls-files').trim(), 'b.txt'); },
	'sparse-checkout': async c => {
		c.git('checkout', '-q', '--', 'a.txt'); writeFileSync(join(c.repo, 'b.txt'), 'b'); c.git('add', 'b.txt'); c.git('commit', '-q', '-m', 'b');
		await c.ok('git_tree', { op: 'sparse-checkout', action: 'set', patterns: ['a.txt'], cone: false });
		const listed = await c.ok('git_tree', { op: 'sparse-checkout', action: 'list' }); assert.equal((listed.data as { text: string }).text, 'a.txt'); assert.equal(existsSync(join(c.repo, 'b.txt')), false);
		await c.ok('git_tree', { op: 'sparse-checkout', action: 'disable' }); assert.ok(existsSync(join(c.repo, 'b.txt')));
	},
	'submodule': async c => {
		const sub = newRepo(); writeFileSync(join(sub, 's.txt'), 's'); git(sub, 'add', '-A'); git(sub, 'commit', '-q', '-m', 'sub');
		// a submodule is cloned by a child git that ignores the repository's config, so allow the file transport for this process
		const saved = [process.env['GIT_CONFIG_COUNT'], process.env['GIT_CONFIG_KEY_0'], process.env['GIT_CONFIG_VALUE_0']];
		process.env['GIT_CONFIG_COUNT'] = '1'; process.env['GIT_CONFIG_KEY_0'] = 'protocol.file.allow'; process.env['GIT_CONFIG_VALUE_0'] = 'always';
		try {
			await c.ok('git_tree', { op: 'submodule', action: 'add', url: sub, paths: ['sm'] }); assert.match(readFileSync(join(c.repo, '.gitmodules'), 'utf8'), /path = sm/);
			const status = await c.ok('git_tree', { op: 'submodule', action: 'status' }); assert.match((status.data as { text: string }).text, /^ ?[0-9a-f]{40} sm/);
			await c.ok('git_tree', { op: 'submodule', action: 'sync' }); await c.ok('git_tree', { op: 'submodule', action: 'init' }); await c.ok('git_tree', { op: 'submodule', action: 'update', force: true });
			await c.ok('git_tree', { op: 'submodule', action: 'deinit', paths: ['sm'], force: true }); assert.equal(existsSync(join(c.repo, 'sm', 's.txt')), false);
		} finally {
			for (const [k, v] of [['GIT_CONFIG_COUNT', saved[0]], ['GIT_CONFIG_KEY_0', saved[1]], ['GIT_CONFIG_VALUE_0', saved[2]]] as const) { if (v === undefined) { delete process.env[k]; } else { process.env[k] = v; } }
			rmSync(sub, { recursive: true, force: true });
		}
	},
	'rerere': async c => {
		c.git('config', 'rerere.enabled', 'true');
		for (const action of ['status', 'diff', 'remaining', 'gc', 'clear']) { const r = await c.ok('git_tree', { op: 'rerere', action }); assert.equal(typeof (r.data as { text: string }).text, 'string'); }
		await c.ok('git_tree', { op: 'rerere', action: 'forget', paths: ['a.txt'] });
	},
	'merge-file': async c => {
		const dir = mkdtempSync(join(tmpdir(), 'insrc-mf-')); const w = (n: string, s: string): string => { writeFileSync(join(dir, n), s); return join(dir, n); };
		try {
			const base = w('base', 'a\nb\nc\nd\ne\n'); const ours = w('ours', 'a\nB\nc\nd\ne\n'); const theirs = w('theirs', 'a\nb\nc\nD\ne\n');
			const clean = await c.ok('git_tree', { op: 'merge-file', current: ours, base, other: theirs, stdout: true }); assert.deepEqual(clean.data, { op: 'merge-file', conflicts: 0, text: 'a\nB\nc\nD\ne\n' }); assert.equal(readFileSync(ours, 'utf8'), 'a\nB\nc\nd\ne\n');
			await c.ok('git_tree', { op: 'merge-file', current: ours, base, other: theirs }); assert.equal(readFileSync(ours, 'utf8'), 'a\nB\nc\nD\ne\n');
			const x = w('x', 'x\n'); const conflict = await c.ok('git_tree', { op: 'merge-file', current: x, base: w('z', 'z\n'), other: w('y', 'y\n'), stdout: true }); assert.equal((conflict.data as { conflicts: number }).conflicts, 1);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	},
	'bisect': async c => {
		c.git('checkout', '-q', '--', 'a.txt');
		const r = await c.ok('git_tree', { op: 'bisect', action: 'start', bad: 'HEAD', good: ['HEAD~1'] }); assert.match((r.data as { text: string }).text, /is the first bad commit/);
		const log = await c.ok('git_tree', { op: 'bisect', action: 'log' }); assert.match((log.data as { text: string }).text, /git bisect start/);
		await c.ok('git_tree', { op: 'bisect', action: 'reset' }); assert.equal(c.git('symbolic-ref', '--short', 'HEAD').trim(), 'main');
	},
	'replay': async c => {
		c.git('checkout', '-q', '--', 'a.txt'); c.git('checkout', '-q', '-b', 'topic', 'HEAD~1'); writeFileSync(join(c.repo, 't.txt'), 't'); c.git('add', 't.txt'); c.git('commit', '-q', '-m', 'topic'); c.git('checkout', '-q', 'main');
		const before = sha(c, 'topic'); const printed = await c.ok('git_tree', { op: 'replay', onto: 'main', range: 'main..topic' });
		assert.match((printed.data as { text: string }).text, /^update refs\/heads\/topic [0-9a-f]{40} [0-9a-f]{40}$/); assert.equal(sha(c, 'topic'), before, 'print makes no change');
		await c.ok('git_tree', { op: 'replay', onto: 'main', range: 'main..topic', refAction: 'update' }); assert.equal(c.git('merge-base', 'main', 'topic').trim(), sha(c, 'main'));
	},

	// ---- git_maintenance, git_setup, git_refs, git_reflog (s8)
	'gc': async c => {
		const loose = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: c.repo, input: 'unreachable gc' }).toString().trim();
		await c.ok('git_maintenance', { op: 'gc', aggressive: true }); assert.match(c.git('count-objects', '-v'), /^in-pack: [1-9]/m); c.git('cat-file', '-e', loose);
		await c.ok('git_maintenance', { op: 'gc', pruneNow: true }); assert.throws(() => c.git('cat-file', '-e', loose));
	},
	'repack': async c => { await c.ok('git_maintenance', { op: 'repack', all: true, deleteRedundant: true }); assert.match(c.git('count-objects', '-v'), /^in-pack: [1-9]/m); },
	'prune': async c => {
		const loose = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: c.repo, input: 'unreachable prune' }).toString().trim();
		const dry = await c.ok('git_maintenance', { op: 'prune', dryRun: true, expire: 'now' }); assert.match((dry.data as { text: string }).text, new RegExp(loose)); c.git('cat-file', '-e', loose);
		await c.ok('git_maintenance', { op: 'prune', expire: 'now' }); assert.throws(() => c.git('cat-file', '-e', loose));
	},
	'prune-packed': async c => {
		c.git('repack', '-q', '-a'); assert.match(c.git('count-objects', '-v'), /^count: [1-9]/m);
		await c.ok('git_maintenance', { op: 'prune-packed' }); assert.match(c.git('count-objects', '-v'), /^count: 0$/m);
	},
	'pack-refs': async c => { await c.ok('git_maintenance', { op: 'pack-refs', all: true }); assert.match(readFileSync(join(c.repo, '.git', 'packed-refs'), 'utf8'), /refs\/heads\/main/); },
	'multi-pack-index': async c => {
		c.git('repack', '-q', '-a', '-d'); await c.ok('git_maintenance', { op: 'multi-pack-index', action: 'write' }); assert.ok(existsSync(join(c.repo, '.git', 'objects', 'pack', 'multi-pack-index')));
		await c.ok('git_maintenance', { op: 'multi-pack-index', action: 'verify' });
	},
	'maintenance': async c => { await c.ok('git_maintenance', { op: 'maintenance', tasks: ['commit-graph'] }); assert.ok(existsSync(join(c.repo, '.git', 'objects', 'info', 'commit-graph')) || existsSync(join(c.repo, '.git', 'objects', 'info', 'commit-graphs'))); },
	'commit-graph': async c => {
		await c.ok('git_maintenance', { op: 'commit-graph', action: 'write', reachable: true }); assert.ok(existsSync(join(c.repo, '.git', 'objects', 'info', 'commit-graph')));
		await c.ok('git_maintenance', { op: 'commit-graph', action: 'verify' });
	},
	'backfill': async c => {
		c.git('config', '--file', join(c.remote, 'config'), 'uploadpack.allowFilter', 'true'); const clone = mkdtempSync(join(tmpdir(), 'insrc-bf-'));
		try {
			execFileSync('git', ['clone', '-q', '--no-checkout', '--filter=blob:none', `file://${c.remote}`, clone]);
			await c.ok('git_maintenance', { op: 'backfill', cwd: clone }); assert.equal(execFileSync('git', ['rev-list', '--objects', '--missing=print', '--all'], { cwd: clone, encoding: 'utf8' }).includes('?'), false, 'no object is missing any more');
		} finally { rmSync(clone, { recursive: true, force: true }); }
	},
	'init': async c => {
		const dir = mkdtempSync(join(tmpdir(), 'insrc-init-')); const target = join(dir, 'new');
		try {
			const first = await c.ok('git_setup', { op: 'init', directory: target, initialBranch: 'trunk' }); assert.equal((first.data as { reinitialised: boolean }).reinitialised, false);
			assert.equal(execFileSync('git', ['symbolic-ref', 'HEAD'], { cwd: target, encoding: 'utf8' }).trim(), 'refs/heads/trunk');
			const again = await c.ok('git_setup', { op: 'init', directory: target }); assert.equal((again.data as { reinitialised: boolean }).reinitialised, true);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	},
	'init-db': async c => {
		const dir = mkdtempSync(join(tmpdir(), 'insrc-initdb-'));
		try { const r = await c.ok('git_setup', { op: 'init-db', directory: join(dir, 'b'), bare: true }); assert.equal((r.data as { reinitialised: boolean }).reinitialised, false); assert.equal(execFileSync('git', ['rev-parse', '--is-bare-repository'], { cwd: join(dir, 'b'), encoding: 'utf8' }).trim(), 'true'); } finally { rmSync(dir, { recursive: true, force: true }); }
	},
	'clone': async c => {
		const dir = mkdtempSync(join(tmpdir(), 'insrc-clone-')); const target = join(dir, 'c');
		try {
			await c.ok('git_setup', { op: 'clone', url: c.remote, directory: target, branch: 'main' }); assert.equal(execFileSync('git', ['log', '-1', '--format=%s'], { cwd: target, encoding: 'utf8' }).trim(), 'second');
			const refused = await executeTool('git_setup', { cwd: c.repo, op: 'clone', url: 'ext::sh -c "touch /tmp/insrc-ext-ran"' }, { ...toolDeps(c.repo), approvalMode: 'auto' as const }); assert.equal(refused.success, false); assert.equal(existsSync('/tmp/insrc-ext-ran'), false);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	},
	'refs verify': async c => { const r = await c.ok('git_refs', { op: 'verify', strict: true }); assert.equal(typeof (r.data as { text: string }).text, 'string'); },
	'refs migrate': async c => {
		const fresh = newRepo(); writeFileSync(join(fresh, 'f.txt'), 'f'); git(fresh, 'add', '-A'); git(fresh, 'commit', '-q', '-m', 'f');
		try {
			await c.ok('git_refs', { op: 'migrate', refFormat: 'reftable', dryRun: true, cwd: fresh }); assert.equal(git(fresh, 'rev-parse', '--show-ref-format').trim(), 'files', 'a dry run changes nothing');
			await c.ok('git_refs', { op: 'migrate', refFormat: 'reftable', cwd: fresh }); assert.equal(git(fresh, 'rev-parse', '--show-ref-format').trim(), 'reftable'); assert.equal(git(fresh, 'log', '-1', '--format=%s').trim(), 'f');
		} finally { rmSync(fresh, { recursive: true, force: true }); }
	},
	'refs optimize': async c => { await c.ok('git_refs', { op: 'optimize', all: true }); assert.match(readFileSync(join(c.repo, '.git', 'packed-refs'), 'utf8'), /refs\/heads\/main/); },
	'reflog show': async c => { const r = await c.ok('git_reflog', { op: 'show', limit: 3 }); const d = r.data as { count: number; lines: string[] }; assert.equal(d.count, 3); assert.ok(d.lines.some(l => /HEAD@\{\d+\}: commit: second/.test(l))); },
	'reflog list': async c => { const r = await c.ok('git_reflog', { op: 'list' }); assert.ok((r.data as { lines: string[] }).lines.includes('refs/heads/main')); },
	'reflog exists': async c => {
		const yes = await c.ok('git_reflog', { op: 'exists', ref: 'refs/heads/main' }); assert.deepEqual(yes.data, { op: 'exists', exists: true });
		const no = await c.ok('git_reflog', { op: 'exists', ref: 'refs/heads/nope' }); assert.deepEqual(no.data, { op: 'exists', exists: false });
	},
	'reflog expire': async c => {
		await c.ok('git_reflog', { op: 'expire', expire: 'now', all: true, dryRun: true }); assert.notEqual(c.git('reflog').trim(), '');
		await c.ok('git_reflog', { op: 'expire', expire: 'now', all: true }); assert.equal(c.git('reflog').trim(), '');
	},
	'reflog delete': async c => {
		const before = c.git('reflog').trim().split('\n').length; await c.ok('git_reflog', { op: 'delete', entries: ['HEAD@{1}'] }); assert.equal(c.git('reflog').trim().split('\n').length, before - 1);
	},
	'reflog write': async c => {
		await c.ok('git_reflog', { op: 'write', ref: 'refs/heads/main', oldOid: sha(c, 'HEAD~1'), newOid: sha(c, 'HEAD'), message: 'manual entry' }); assert.match(c.git('reflog', 'show', 'main'), /manual entry/);
	},

	// ---- the operations s8 added to the five existing tools
	'stash branch': async c => {
		c.git('checkout', '-q', '--', 'a.txt'); await c.ok('git_stash', { op: 'branch', branchName: 'fromstash' });
		assert.equal(c.git('symbolic-ref', '--short', 'HEAD').trim(), 'fromstash'); assert.equal(readFileSync(join(c.repo, 'a.txt'), 'utf8'), 'stashed\n'); assert.equal(c.git('stash', 'list').trim(), '');
	},
	'stash create': async c => {
		const r = await c.ok('git_stash', { op: 'create', message: 'snap' }); const made = (r.data as { sha: string }).sha;
		assert.equal(c.git('cat-file', '-t', made).trim(), 'commit'); assert.equal(c.git('stash', 'list').trim().split('\n').length, 1, 'the stack is unchanged');
	},
	'stash store': async c => {
		const made = c.git('stash', 'create').trim(); await c.ok('git_stash', { op: 'store', commit: made, message: 'stored' });
		assert.equal(c.git('stash', 'list').trim().split('\n').length, 2); assert.match(c.git('stash', 'list'), /stored/);
	},
	'stash export': async c => { await c.ok('git_stash', { op: 'export', toRef: 'refs/stash-export' }); assert.equal(c.git('cat-file', '-t', 'refs/stash-export').trim(), 'commit'); },
	'stash import': async c => {
		c.git('stash', 'export', '--to-ref', 'refs/stash-export'); c.git('stash', 'clear'); await c.ok('git_stash', { op: 'import', commit: sha(c, 'refs/stash-export') });
		assert.equal(c.git('stash', 'list').trim().split('\n').length, 1);
	},
	'worktree lock': async c => { await c.ok('git_worktree', { op: 'lock', path: c.wt, reason: 'busy' }); assert.match(c.git('worktree', 'list', '--porcelain'), /locked busy/); },
	'worktree unlock': async c => { c.git('worktree', 'lock', c.wt); await c.ok('git_worktree', { op: 'unlock', path: c.wt }); assert.doesNotMatch(c.git('worktree', 'list', '--porcelain'), /locked/); },
	'worktree repair': async c => {
		const moved = c.wt + '-moved'; renameSync(c.wt, moved);
		try { await c.ok('git_worktree', { op: 'repair', repairPaths: [moved] }); assert.match(c.git('worktree', 'list'), new RegExp(moved)); } finally { rmSync(moved, { recursive: true, force: true }); }
	},
	'remote show': async c => { const r = await c.ok('git_remote', { op: 'show', remote: 'origin' }); assert.match((r.data as { text: string }).text, /Fetch URL:/); },
	'remote prune': async c => {
		git(c.remote, 'branch', '-D', 'b'); assert.match(c.git('branch', '-r'), /origin\/b/);
		const dry = await c.ok('git_remote', { op: 'prune', remote: 'origin', dryRun: true }); assert.match((dry.data as { text: string }).text, /Would prune|would prune/i); assert.match(c.git('branch', '-r'), /origin\/b/);
		await c.ok('git_remote', { op: 'prune', remote: 'origin' }); assert.doesNotMatch(c.git('branch', '-r'), /origin\/b/);
	},
	'remote update': async c => { git(c.remote, 'branch', 'zz', 'main'); await c.ok('git_remote', { op: 'update' }); assert.match(c.git('branch', '-r'), /origin\/zz/); },
	'remote set-head': async c => {
		await c.ok('git_remote', { op: 'set-head', remote: 'origin', headBranch: 'b' }); assert.equal(c.git('symbolic-ref', 'refs/remotes/origin/HEAD').trim(), 'refs/remotes/origin/b');
		await c.ok('git_remote', { op: 'set-head', remote: 'origin', deleteHead: true }); assert.throws(() => c.git('symbolic-ref', 'refs/remotes/origin/HEAD'));
	},
	'remote set-branches': async c => { await c.ok('git_remote', { op: 'set-branches', remote: 'origin', branches: ['main'] }); assert.equal(c.git('config', '--get-all', 'remote.origin.fetch').trim(), '+refs/heads/main:refs/remotes/origin/main'); },
	'remote set-url --add': async c => { await c.ok('git_remote', { op: 'set-url-add', remote: 'origin', newUrl: '/second/url' }); assert.deepEqual(c.git('remote', 'get-url', '--all', 'origin').trim().split('\n'), [c.remote, '/second/url']); },
	'remote set-url --delete': async c => {
		c.git('remote', 'set-url', '--add', 'origin', '/second/url'); await c.ok('git_remote', { op: 'set-url-delete', remote: 'origin', urlPattern: 'second' });
		assert.deepEqual(c.git('remote', 'get-url', '--all', 'origin').trim().split('\n'), [c.remote]);
	},
	'branch rename': async c => {
		await c.ok('git_branch', { op: 'rename', fromName: 'b', toName: 'bb' }); assert.equal(c.git('branch', '--list', 'b').trim(), ''); assert.match(c.git('branch', '--list', 'bb'), /bb/);
		const clash = await executeTool('git_branch', { cwd: c.repo, op: 'rename', fromName: 'bb', toName: 'wtb' }, { ...toolDeps(c.repo), approvalMode: 'auto' as const }); assert.equal(clash.success, false, 'no force: an existing name is not overwritten');
	},
	'branch copy': async c => { await c.ok('git_branch', { op: 'copy', fromName: 'b', toName: 'bc' }); assert.equal(sha(c, 'bc'), sha(c, 'b')); assert.match(c.git('branch', '--list', 'b'), /b/); },
	'branch set-upstream-to': async c => { await c.ok('git_branch', { op: 'set-upstream-to', branchName: 'b', upstream: 'origin/b' }); assert.equal(c.git('config', 'branch.b.remote').trim(), 'origin'); },
	'branch unset-upstream': async c => {
		c.git('branch', '--set-upstream-to=origin/b', 'b'); await c.ok('git_branch', { op: 'unset-upstream', branchName: 'b' }); assert.throws(() => c.git('config', 'branch.b.remote'));
	},
	'branch edit-description': async c => {
		await c.ok('git_branch', { op: 'edit-description', branchName: 'b', description: 'hello there' }); assert.equal(c.git('config', 'branch.b.description').trim(), 'hello there');
		await c.ok('git_branch', { op: 'edit-description', branchName: 'b', description: '' }); assert.throws(() => c.git('config', 'branch.b.description'));
	},
	'tag verify': async c => {
		sshSigning(c); c.git('tag', '-s', '-m', 'signed', 'vs');
		const good = await c.ok('git_tag', { op: 'verify', tagNames: ['vs'] }); assert.equal((good.data as { verified: boolean }).verified, true);
		const bad = await c.ok('git_tag', { op: 'verify', tagNames: ['t'] }); assert.equal((bad.data as { verified: boolean }).verified, false);
	},
	'tag sign': async c => {
		sshSigning(c); await c.ok('git_tag', { op: 'sign', tagName: 'v1', message: 'signed release', target: 'b' });
		assert.equal(c.git('cat-file', '-t', 'v1').trim(), 'tag'); assert.match(c.git('cat-file', '-p', 'v1'), /BEGIN SSH SIGNATURE/); assert.equal(sha(c, 'v1^{commit}'), sha(c, 'b'));
	},
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

test('git_diff_tree and git_merge_tree are marked as built by s9 and are in gitToolDefinitions', async () => {
	const { gitToolDefinitions } = await import('../definitions.js');
	const ids = new Set(gitToolDefinitions.map(t => t.id));
	for (const [command, tool] of [['diff-tree', 'git_diff_tree'], ['merge-tree', 'git_merge_tree']] as const) {
		const row = GIT_COVERAGE.find(r => r.command === command && r.operation === undefined)!;
		assert.equal(row.owner, 'covered', `${command} is covered, no longer assigned to s8`);
		assert.equal(row.builtBy, 's9', `${command} is marked as built by s9`);
		assert.deepEqual(row.toolIds, [tool]);
		assert.ok(ids.has(tool), `${tool} is in gitToolDefinitions`);
	}
	assert.match(renderCoverageTable(), /\| diff-tree \|  \| covered \| git_diff_tree \(built by s9\) \|/);
});

test('git-coverage.test.ts: the ls-files coverage case still passes and the git_ls_files input lists maxBytes', async () => {
	const { gitLsFilesTool } = await import('../ls-files.js');
	assert.ok('maxBytes' in (gitLsFilesTool.inputSchema as { properties: Record<string, unknown> }).properties, 'the input lists maxBytes');
	const row = GIT_COVERAGE.find(r => r.command === 'ls-files');
	assert.deepEqual(row?.toolIds, ['git_ls_files']);
});

test('git-coverage.test.ts: no row is assigned, every excluded row has a reason and every command has a row', () => {
	registerForTests();
	assert.deepEqual(GIT_COVERAGE.filter(r => r.owner === 'assigned').map(r => `${r.command} ${r.operation ?? ''}`.trim()), [], 'no row is left assigned');
	for (const r of GIT_COVERAGE.filter(x => x.owner === 'excluded')) { assert.ok((r.reason ?? '').length > 0, `${r.command} says why it is excluded`); }
	for (const r of GIT_COVERAGE.filter(x => x.owner === 'covered')) { assert.ok(r.operation !== undefined || (r.cases ?? []).length > 0 || GIT_COVERAGE.some(o => o.command === r.command && o.operation !== undefined), `${r.command} has a case`); }
	const rows = new Set(baseRows.map(r => r.command));
	assert.deepEqual(GIT_2_53_COMMANDS.filter(c => !rows.has(c)), [], 'every command of the recorded list has a row');
	// the commands the user decided on 2026-11-02 are excluded, each with its reason
	for (const c of ['for-each-repo', 'hook', 'filter-branch', 'merge-octopus', 'merge-ours', 'merge-recursive', 'merge-recursive-ours', 'merge-recursive-theirs', 'merge-resolve', 'merge-subtree', 'subtree', 'request-pull', 'quiltimport']) {
		const row = baseRows.find(r => r.command === c);
		assert.equal(row?.owner, 'excluded', `${c} is excluded`);
		assert.equal(row?.toolIds, undefined);
		assert.ok((row?.reason ?? '').length > 10);
	}
	// no owner other than covered or excluded is used, so a row cannot be put back to assigned without failing here
	assert.deepEqual([...new Set(GIT_COVERAGE.map(r => r.owner))].sort(), ['covered', 'excluded']);
});
