/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGitTools } from './../tools/builtins/git/index.js';
import { createGitHooks } from '../git-hooks-methods.js';
import { createRepoSettingsHandlers } from '../repo-settings.js';

registerGitTools();
const ENTRY = '/opt/insrc/out/bin/insrc-git-hook.js';

function fixture() {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'git-hooks-methods-')));
	const repo = join(root, 'repo'); mkdirSync(repo);
	const plain = join(root, 'plain'); mkdirSync(plain);
	execFileSync('git', ['-C', repo, 'init', '-q'], { env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } });
	const flags: boolean[] = [];
	const hooks = createGitHooks({ registeredRepos: async () => [repo, plain], entryPath: ENTRY, setFlag: async (_r, v) => { flags.push(v); return { ok: true }; } });
	const settings = createRepoSettingsHandlers({
		registeredRepos: async () => [repo, plain], configPath: () => join(root, 'github.json'),
		readPolicy: async () => ({ ok: true, value: 'none' }),
		makeTracker: () => ({ whoAmI: () => ({ ok: true, value: 'octocat' }) }),
		applyGitHooks: (r, enabled) => hooks.apply(r, enabled),
	});
	return { root, repo, plain, flags, hooks, settings, hook: (name: string, dir = join(repo, '.git', 'hooks')) => join(dir, name), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('src/daemon/__tests__/git-hooks-methods.test.ts: repo.gitHooks.install, uninstall and status refuse an unregistered repository, write only through the daemon, and keep the gitHooks setting equal to what is installed', async () => {
	const f = fixture();
	try {
		const h = f.hooks.handlers;
		const stranger = await h['repo.gitHooks.install']!({ repo: join(f.root, 'elsewhere') }) as any;
		assert.deepEqual([stranger.ok, stranger.error.code], [false, 'repo-not-registered']);
		const notGit = await h['repo.gitHooks.install']!({ repo: f.plain }) as any;
		assert.deepEqual([notGit.ok, notGit.error.code], [false, 'not-a-git-repository']);
		assert.deepEqual(f.flags, [], 'nothing was set and nothing written');

		const installed = await h['repo.gitHooks.install']!({ repo: f.repo }) as any;
		assert.equal(installed.ok, true);
		assert.deepEqual(installed.hooks.map((x: any) => [x.name, x.installed]), [['post-merge', true], ['post-rewrite', true]]);
		assert.deepEqual(f.flags, [true]);
		assert.ok(readFileSync(f.hook('post-merge'), 'utf8').includes(ENTRY));
		const status = await h['repo.gitHooks.status']!({ repo: f.repo }) as any;
		assert.deepEqual(status.hooks.map((x: any) => [x.installed, x.stale]), [[true, false], [true, false]]);

		// the setting drives the files: turning it off removes the blocks, turning it on writes them again
		const off = await f.settings['repo.settings.set']!({ repo: f.repo, key: 'gitHooks', value: false }) as any;
		assert.equal(off.ok, true);
		assert.equal(existsSync(f.hook('post-merge')) || existsSync(f.hook('post-rewrite')), false);
		assert.deepEqual(f.flags, [true, false]);
		const on = await f.settings['repo.settings.set']!({ repo: f.repo, key: 'gitHooks', value: true }) as any;
		assert.equal(on.ok, true);
		assert.ok(existsSync(f.hook('post-rewrite')));
		const refused = await f.settings['repo.settings.set']!({ repo: f.plain, key: 'gitHooks', value: true }) as any;
		assert.equal(refused.ok, false);
		assert.equal(existsSync(join(f.root, 'github.json')), false, 'the key was not written when the install failed');

		const removed = await h['repo.gitHooks.uninstall']!({ repo: f.repo }) as any;
		assert.deepEqual([removed.ok, removed.setting], [true, false]);
		const after = await h['repo.gitHooks.status']!({ repo: f.repo }) as any;
		assert.deepEqual(after.hooks.map((x: any) => x.installed), [false, false]);

		// the hooks directory is the one git names, so core.hooksPath is honoured
		const custom = join(f.root, 'custom-hooks'); mkdirSync(custom);
		execFileSync('git', ['-C', f.repo, 'config', 'core.hooksPath', custom]);
		const moved = await h['repo.gitHooks.install']!({ repo: f.repo }) as any;
		assert.equal(moved.hooksDir, custom);
		assert.ok(existsSync(f.hook('post-merge', custom)));
		assert.equal(existsSync(f.hook('post-merge')), false);
	} finally { f.cleanup(); }
});

test('src/daemon/__tests__/git-hooks-methods.test.ts: a failing hook file leaves the other hook installed and is reported with its reason', async () => {
	const f = fixture();
	try {
		mkdirSync(f.hook('post-rewrite'));   // a directory where the hook file belongs: it cannot be read as a file
		const result = await f.hooks.handlers['repo.gitHooks.install']!({ repo: f.repo }) as any;
		assert.equal(result.ok, true);
		const byName = Object.fromEntries(result.hooks.map((x: any) => [x.name, x]));
		assert.equal(byName['post-merge'].installed, true);
		assert.equal(byName['post-rewrite'].installed, false);
		assert.match(byName['post-rewrite'].reason, /EISDIR/);
		assert.deepEqual(f.flags, [true], 'the setting records the partial install');
		assert.ok(existsSync(f.hook('post-merge')));
		// installing over a foreign hook that ends early flags it in the result
		rmSync(f.hook('post-rewrite'), { recursive: true });
		writeFileSync(f.hook('post-rewrite'), '#!/bin/sh\necho mine\nexit 0\n', { mode: 0o755 });
		const over = await f.hooks.handlers['repo.gitHooks.install']!({ repo: f.repo }) as any;
		const rewrite = over.hooks.find((x: any) => x.name === 'post-rewrite');
		assert.deepEqual([rewrite.installed, rewrite.foreign, rewrite.earlyExit], [true, true, true]);
		assert.equal(over.hooks.find((x: any) => x.name === 'post-merge').foreign, undefined, 'a hook with no other content is not flagged');
		rmSync(f.hook('post-rewrite')); f.flags.length = 0; f.flags.push(true);
		// nothing installed at all is an error and sets nothing
		rmSync(f.hook('post-merge'));
		mkdirSync(f.hook('post-merge')); mkdirSync(f.hook('post-rewrite'));
		const none = await f.hooks.handlers['repo.gitHooks.install']!({ repo: f.repo }) as any;
		assert.deepEqual([none.ok, none.error.code], [false, 'hooks-failed']);
		assert.deepEqual(f.flags, [true]);
	} finally { f.cleanup(); }
});
