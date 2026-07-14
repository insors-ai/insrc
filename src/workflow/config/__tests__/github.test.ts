/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * GitHub tracker config resolution + git remote parsing.
 *
 * Note: `resolveGithubConfig` reads from `~/.insrc/github.json`,
 * which we don't want to touch during tests. The tests here focus
 * on the pure parser + the git-remote fallback via a real git
 * command over a tmp repo.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/config/__tests__/github.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	GithubConfigError,
	parseGithubRemoteUrl,
	parseGitRemoteOwnerRepo,
	resolveGithubConfig,
} from '../github.js';

// ---------------------------------------------------------------------------
// parseGithubRemoteUrl
// ---------------------------------------------------------------------------

test('parseGithubRemoteUrl handles SSH remotes', () => {
	assert.deepEqual(parseGithubRemoteUrl('git@github.com:foo/bar.git'), { owner: 'foo', repo: 'bar' });
	assert.deepEqual(parseGithubRemoteUrl('git@github.com:foo/bar'),     { owner: 'foo', repo: 'bar' });
});

test('parseGithubRemoteUrl handles HTTPS remotes', () => {
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/foo/bar.git'), { owner: 'foo', repo: 'bar' });
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/foo/bar'),     { owner: 'foo', repo: 'bar' });
	assert.deepEqual(parseGithubRemoteUrl('http://github.com/foo/bar'),      { owner: 'foo', repo: 'bar' });
});

test('parseGithubRemoteUrl rejects other hosts', () => {
	assert.equal(parseGithubRemoteUrl('git@gitlab.com:foo/bar.git'), null);
	assert.equal(parseGithubRemoteUrl('https://bitbucket.org/foo/bar'), null);
	assert.equal(parseGithubRemoteUrl(''), null);
});

// ---------------------------------------------------------------------------
// parseGitRemoteOwnerRepo (integration — real git repo)
// ---------------------------------------------------------------------------

test('parseGitRemoteOwnerRepo returns owner/repo for a repo with a GitHub origin', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gh-'));
	try {
		execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
		execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:myorg/myrepo.git'], { cwd: repo, stdio: 'ignore' });
		assert.deepEqual(parseGitRemoteOwnerRepo(repo), { owner: 'myorg', repo: 'myrepo' });
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('parseGitRemoteOwnerRepo returns null on a repo with no origin', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gh-'));
	try {
		execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
		assert.equal(parseGitRemoteOwnerRepo(repo), null);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('parseGitRemoteOwnerRepo returns null on a non-git dir', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gh-'));
	try {
		assert.equal(parseGitRemoteOwnerRepo(dir), null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// resolveGithubConfig — type discriminant (github vs none)
// ---------------------------------------------------------------------------

function withTempConfig<T>(config: unknown, fn: (configPath: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cfg-'));
	const path = join(dir, 'github.json');
	writeFileSync(path, JSON.stringify(config, null, 2));
	try { return fn(path); }
	finally { rmSync(dir, { recursive: true, force: true }); }
}

test('resolveGithubConfig honors per-repo "type": "none"', () => {
	withTempConfig(
		{ repos: { '/repo/A': { type: 'none' } } },
		configPath => {
			const cfg = resolveGithubConfig('/repo/A', configPath);
			assert.equal(cfg.type, 'none');
			assert.equal(cfg.source, 'per-repo-config');
		},
	);
});

test('resolveGithubConfig honors default "type": "none" when no per-repo entry', () => {
	withTempConfig(
		{ default: { type: 'none' } },
		configPath => {
			const cfg = resolveGithubConfig('/repo/unlisted', configPath);
			assert.equal(cfg.type, 'none');
			assert.equal(cfg.source, 'default-config');
		},
	);
});

test('resolveGithubConfig prefers per-repo "none" over default owner/repo', () => {
	withTempConfig(
		{
			default: { owner: 'org', repo: 'default' },
			repos:   { '/repo/A': { type: 'none' } },
		},
		configPath => {
			const cfg = resolveGithubConfig('/repo/A', configPath);
			assert.equal(cfg.type, 'none');
		},
	);
});

test('resolveGithubConfig returns type=github with owner/repo when configured', () => {
	withTempConfig(
		{ repos: { '/repo/A': { owner: 'acme', repo: 'foo' } } },
		configPath => {
			const cfg = resolveGithubConfig('/repo/A', configPath);
			assert.equal(cfg.type, 'github');
			if (cfg.type === 'github') {
				assert.equal(cfg.owner, 'acme');
				assert.equal(cfg.repo,  'foo');
				assert.equal(cfg.epicLabel, 'insrc:epic');
				assert.equal(cfg.storyLabel, 'insrc:story');
				assert.equal(cfg.useMilestones, false);
			}
		},
	);
});

test('resolveGithubConfig falls back to default entry when repo is unlisted', () => {
	withTempConfig(
		{ default: { owner: 'org', repo: 'default', useMilestones: true } },
		configPath => {
			const cfg = resolveGithubConfig('/repo/unlisted', configPath);
			assert.equal(cfg.type, 'github');
			if (cfg.type === 'github') {
				assert.equal(cfg.owner, 'org');
				assert.equal(cfg.useMilestones, true);
				assert.equal(cfg.source, 'default-config');
			}
		},
	);
});

test('resolveGithubConfig defaults to type=none when no matching entry AND no config file', () => {
	// Pass a config path that does not exist — loader falls back to empty {}
	// and the resolver's implicit default is 'none'.
	const cfg = resolveGithubConfig('/repo/unlisted', '/does/not/exist.json');
	assert.equal(cfg.type, 'none');
	assert.equal(cfg.source, 'default-config');
});

test('resolveGithubConfig defaults to type=none when file exists but has no matching entry', () => {
	withTempConfig({}, configPath => {
		const cfg = resolveGithubConfig('/repo/unlisted', configPath);
		assert.equal(cfg.type, 'none');
		assert.equal(cfg.source, 'default-config');
	});
});

test('resolveGithubConfig defaults to type=none when default entry is empty {}', () => {
	withTempConfig({ default: {} }, configPath => {
		const cfg = resolveGithubConfig('/repo/unlisted', configPath);
		assert.equal(cfg.type, 'none');
	});
});

test('resolveGithubConfig with explicit "type": "github" but no owner/repo throws when git remote is absent', () => {
	withTempConfig({ default: { type: 'github' } }, configPath => {
		const dir = mkdtempSync(join(tmpdir(), 'insrc-nogit-'));
		try {
			assert.throws(
				() => resolveGithubConfig(dir, configPath),
				(err: unknown) => err instanceof GithubConfigError,
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

test('resolveGithubConfig with explicit "type": "github" resolves via git remote when owner/repo omitted', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-remote-'));
	try {
		execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
		execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/from-remote.git'], { cwd: repo, stdio: 'ignore' });
		withTempConfig({ default: { type: 'github' } }, configPath => {
			const cfg = resolveGithubConfig(repo, configPath);
			assert.equal(cfg.type, 'github');
			if (cfg.type === 'github') {
				assert.equal(cfg.owner, 'acme');
				assert.equal(cfg.repo,  'from-remote');
				assert.equal(cfg.source, 'git-remote');
			}
		});
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('resolveGithubConfig without a config file does NOT auto-detect from git remote', () => {
	// This is the important regression: previously, a git-remote fallback fired
	// whenever nothing else matched. With default=none the tracker is opt-in.
	const repo = mkdtempSync(join(tmpdir(), 'insrc-noconfig-'));
	try {
		execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
		execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:silent/never.git'], { cwd: repo, stdio: 'ignore' });
		const cfg = resolveGithubConfig(repo, '/does/not/exist.json');
		assert.equal(cfg.type, 'none');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
