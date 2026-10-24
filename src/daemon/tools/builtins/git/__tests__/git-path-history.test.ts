/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** git_path_history against a real repository: the history queries the workflow code runs today (Story s4, task t7). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { executeTool } from '../../../executor.js';
import { git, newRepo, registerForTests, toolDeps } from './_repo.js';

test('git_path_history answers the introducing-commit and first-parent queries the callers run today', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		const commit = (file: string, body: string, msg: string, date: string): string => {
			writeFileSync(join(repo, file), body);
			git(repo, 'add', '-A');
			process.env['GIT_COMMITTER_DATE'] = date; process.env['GIT_AUTHOR_DATE'] = date;
			try { git(repo, 'commit', '-q', '-m', msg); } finally { delete process.env['GIT_COMMITTER_DATE']; delete process.env['GIT_AUTHOR_DATE']; }
			return git(repo, 'rev-parse', 'HEAD').trim();
		};
		const addPolicy = commit('policy.md', 'v1', 'add policy', '2024-01-01T10:00:00+00:00');
		commit('other.txt', 'o', 'other', '2024-01-02T10:00:00+00:00');
		const editPolicy = commit('policy.md', 'v2 needle', 'edit policy', '2024-01-03T10:00:00+00:00');
		// a side branch that deletes and re-adds the policy, merged back: a later "add" that first-parent history does not see
		git(repo, 'checkout', '-q', '-b', 'side');
		git(repo, 'rm', '-q', 'policy.md'); git(repo, 'commit', '-q', '-m', 'drop policy');
		const readded = commit('policy.md', 'v3', 're-add policy', '2024-01-05T10:00:00+00:00');
		git(repo, 'checkout', '-q', 'main');
		const merge = (() => { git(repo, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side'); return git(repo, 'rev-parse', 'HEAD').trim(); })();
		git(repo, 'update-ref', 'refs/remotes/origin/main', merge);
		commit('later.txt', 'l', 'later', '2024-01-06T10:00:00+00:00'); // HEAD is now ahead of the tracking ref
		const d = toolDeps(repo);
		const history = async (input: Record<string, unknown>) => {
			const r = await executeTool('git_path_history', { cwd: repo, ...input }, d);
			assert.equal(r.success, true, r.output);
			return (r.data as { commits: { sha: string; committerTime: string; subject?: string }[] }).commits;
		};

		// range-base.ts: the commit that introduced a path on HEAD (--diff-filter=A --format=%H -1 -- path)
		const wantIntroducing = git(repo, 'log', '--diff-filter=A', '--format=%H', '-1', '--', 'policy.md').trim();
		const introducing = await history({ path: 'policy.md', diffFilter: 'A', limit: 1 });
		assert.deepEqual(introducing.map(c => c.sha), [wantIntroducing]);
		assert.equal(introducing[0]?.subject, 're-add policy', 'on HEAD the latest add is the one that is found');

		// anchor-finder.ts: an explicit tracking ref that is not HEAD, first parent only, oldest first, sha and committer time
		const wantAnchor = git(repo, 'log', '--first-parent', '--diff-filter=A', '--reverse', '--format=%H%x09%cI', 'origin/main', '--', ':(top)policy.md')
			.trim().split('\n').map(l => l.split('\t'));
		const anchor = await history({ path: 'policy.md', rev: 'origin/main', firstParent: true, diffFilter: 'A', reverse: true });
		assert.deepEqual(anchor.map(c => [c.sha, c.committerTime]), wantAnchor);
		assert.equal(anchor[0]?.sha, addPolicy, 'the first parent history sees only the first add');
		assert.equal(anchor[0]?.committerTime, '2024-01-01T10:00:00Z', 'the committer time is kept');
		assert.ok(!anchor.some(c => c.sha === readded), 'the re-add on the side branch is not on the first-parent history');
		assert.notEqual(git(repo, 'rev-parse', 'HEAD').trim(), merge, 'HEAD differs from the tracking ref');

		// without first-parent the side branch is seen, newest first
		const all = await history({ path: 'policy.md', rev: 'origin/main', diffFilter: 'A' });
		const wantAll = git(repo, 'log', '--diff-filter=A', '--format=%H', 'origin/main', '--', ':(top)policy.md').trim().split('\n');
		assert.deepEqual(all.map(c => c.sha), wantAll);
		assert.ok(all.some(c => c.sha === readded) && all.some(c => c.sha === addPolicy), 'both adds are seen');

		// the whole history, a modify filter, a pickaxe search and a limit
		assert.equal((await history({})).length, Number(git(repo, 'rev-list', '--count', 'HEAD').trim()));
		// on the first-parent history the merge itself is a modification of the policy
		const wantModified = git(repo, 'log', '--first-parent', '--diff-filter=M', '--format=%H', 'origin/main', '--', ':(top)policy.md').trim().split('\n');
		assert.deepEqual((await history({ path: 'policy.md', diffFilter: 'M', rev: 'origin/main', firstParent: true })).map(c => c.sha), wantModified);
		assert.deepEqual(wantModified, [merge, editPolicy]);
		// -S finds the commits that add or remove the text: the edit that added it and the commit that dropped the file
		const wantPickaxe = git(repo, 'log', '--format=%H', '-S', 'needle').trim().split('\n');
		assert.deepEqual((await history({ pickaxe: 'needle' })).map(c => c.sha), wantPickaxe);
		assert.ok(wantPickaxe.includes(editPolicy) && wantPickaxe.length === 2);
		assert.equal((await history({ limit: 2 })).length, 2);

		// a path is literal and rooted at the repository: glob characters match only themselves
		assert.deepEqual(await history({ path: '*.md' }), []);
		// no such path: an empty history, not a failure; an unknown rev is a failure
		assert.deepEqual(await history({ path: 'nope.md' }), []);
		const bad = await executeTool('git_path_history', { cwd: repo, rev: 'nosuchref' }, d);
		assert.equal(bad.success, false);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
