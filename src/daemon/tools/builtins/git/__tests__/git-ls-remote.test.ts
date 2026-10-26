/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t7: git_ls_remote lists refs of a remote.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { cleanup } from '../../../__tests__/_proc.js';
import { resolveApprovalClass } from '../../../approval-policy.js';
import { setShellTimeoutScaleForTests } from '../../../shell-helper.js';
import { executeTool } from '../../../executor.js';
import { getTool } from '../../../registry.js';
import { git, registerForTests, richRepo, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { setShellTimeoutScaleForTests(undefined); standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; });

function withRepo(fn: (repo: string) => Promise<void>): Promise<void> {
	const { repo, remote, wt } = richRepo();
	return fn(repo).finally(() => { for (const d of [repo, remote, wt]) rmSync(d, { recursive: true, force: true }); });
}

test('git-ls-remote.test.ts: symref true with HEAD gives the symref and the HEAD entry; heads true with a branch pattern gives that head', async () => withRepo(async repo => {
	registerForTests();
	const sym = await executeTool('git_ls_remote', { cwd: repo, remote: 'origin', symref: true, patterns: ['HEAD'] }, toolDeps(repo));
	assert.equal(sym.success, true, sym.output);
	const data = sym.data as { entries: Array<{ objectId: string; ref: string }>; symrefs: Array<{ ref: string; target: string }> };
	assert.deepEqual(data.symrefs, [{ ref: 'HEAD', target: 'refs/heads/main' }]);
	assert.equal(data.entries[0]?.ref, 'HEAD');
	assert.equal(data.entries[0]?.objectId, git(repo, 'rev-parse', 'main').trim());
	const heads = await executeTool('git_ls_remote', { cwd: repo, remote: 'origin', heads: true, patterns: ['refs/heads/b'] }, toolDeps(repo));
	assert.deepEqual((heads.data as { entries: unknown[] }).entries, [{ objectId: git(repo, 'rev-parse', 'b').trim(), ref: 'refs/heads/b' }]);
	assert.deepEqual((heads.data as { symrefs: unknown[] }).symrefs, []);
	// what the callers read today from the same repository
	const direct = git(repo, 'ls-remote', '--symref', 'origin', 'HEAD');
	assert.match(direct, /^ref: refs\/heads\/main\tHEAD\n/);
}));

test('git-ls-remote.test.ts: defaults are heads false, symref false and no patterns, and the argv is built from them', async () => {
	registerForTests();
	standIn = installStandInGit('exit 0');
	await executeTool('git_ls_remote', { cwd: '/tmp', remote: 'origin' }, toolDeps('/tmp'));
	await executeTool('git_ls_remote', { cwd: '/tmp', remote: 'origin', heads: true, symref: true, patterns: ['HEAD', 'refs/heads/x'] }, toolDeps('/tmp'));
	assert.deepEqual(standIn.calls(), ['ls-remote origin', 'ls-remote --symref --heads origin HEAD refs/heads/x']);
});

test('git-ls-remote.test.ts: an empty answer is a success with empty lists', async () => withRepo(async repo => {
	registerForTests();
	const r = await executeTool('git_ls_remote', { cwd: repo, remote: 'origin', heads: true, patterns: ['refs/heads/does-not-exist'] }, toolDeps(repo));
	assert.equal(r.success, true, r.output);
	assert.deepEqual(r.data, { entries: [], symrefs: [] });
}));

test('git-ls-remote.test.ts: an unreachable remote is a failure with kind unreachable and git\'s text in the message', async () => withRepo(async repo => {
	registerForTests();
	const r = await executeTool('git_ls_remote', { cwd: repo, remote: 'nowhere' }, toolDeps(repo));
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'unreachable');
	assert.match(r.failure?.message ?? '', /nowhere/);
}));

test('git-ls-remote.test.ts: an unsafe remote or pattern and nine patterns are rejected by the schema; ceiling and class', async () => {
	registerForTests();
	standIn = installStandInGit('exit 0');
	const nine = Array.from({ length: 9 }, (_, i) => `refs/heads/p${i}`);
	for (const input of [{ remote: '-x' }, { remote: 'a b' }, { remote: 'o', patterns: ['-x'] }, { remote: 'o', patterns: ['a..b'] }, { remote: 'o', patterns: nine }, { remote: '' }]) {
		const r = await executeTool('git_ls_remote', { cwd: '/tmp', ...input }, toolDeps('/tmp'));
		assert.equal(r.failure?.kind, 'rejected', JSON.stringify(input).slice(0, 60));
	}
	assert.deepEqual(standIn.calls(), []);
	assert.equal(resolveApprovalClass(getTool('git_ls_remote')!, { remote: 'o' }), 'none');
});

/** The tool's own limit, as a ceiling: with every limit scaled down a sleeping git is stopped after about limit x scale. */
async function assertCeiling(run: () => Promise<{ success: boolean; failure?: { kind?: string } | undefined }>, limitMs: number): Promise<void> {
	const scale = 0.05;
	standIn = installStandInGit('sleep 30');
	setShellTimeoutScaleForTests(scale);
	const t0 = Date.now();
	const r = await run();
	const took = Date.now() - t0;
	setShellTimeoutScaleForTests(undefined);
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'timed-out');
	assert.ok(took >= limitMs * scale * 0.8 && took < limitMs * scale * 2 + 800, `stopped after ${took} ms, expected about ${limitMs * scale} ms`);
}

test('git-ls-remote.test.ts: the 30000 ms ceiling stops a sleeping git with a timed-out failure', async () => {
	registerForTests();
	await assertCeiling(() => executeTool('git_ls_remote', { cwd: '/tmp', remote: 'origin' }, toolDeps('/tmp')), 30_000);
});
