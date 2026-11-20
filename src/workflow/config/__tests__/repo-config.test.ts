/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRepoSettingsHandlers } from '../../../daemon/repo-settings.js';
import type { SettingsResult } from '../../../daemon/repo-settings.js';
import { PATHS } from '../../../shared/paths.js';
import { repoConfigPath } from '../repo-config.js';
import { moveLegacyRepoConfig } from '../repo-config-store.js';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const OWN_FILE = fileURLToPath(import.meta.url);

/** Every .ts and .tsx file under src, as absolute paths. */
function sourceFiles(dir: string = SRC): string[] {
	return readdirSync(dir).flatMap(name => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(full);
		return /\.tsx?$/.test(name) ? [full] : [];
	});
}

/** The variable and its restore, so a test never leaks the override into another. */
function withEnv(name: string, value: string | undefined, run: () => void): void {
	const before = process.env[name];
	if (value === undefined) delete process.env[name]; else process.env[name] = value;
	try { run(); } finally { if (before === undefined) delete process.env[name]; else process.env[name] = before; }
}

function inTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), 'repo-config-'));
	try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('repo-config.test.ts: moveLegacyRepoConfig renames github.json to repo-config.json when only the old file exists, leaving no github.json and the same content byte for byte, and returns nothing-to-move when there is no github.json', () => {
	inTempDir(dir => {
		const bytes = Buffer.from('{ "repos": {"/a": {"owner": "o"}},\r\n\t"x": "é✓" }\n\n', 'utf8');
		writeFileSync(join(dir, 'github.json'), bytes);
		assert.deepEqual(moveLegacyRepoConfig(dir), { status: 'moved' });
		assert.equal(existsSync(join(dir, 'github.json')), false);
		assert.deepEqual(readFileSync(join(dir, 'repo-config.json')), bytes);
	});
	inTempDir(dir => {
		assert.deepEqual(moveLegacyRepoConfig(dir), { status: 'nothing-to-move' });
		assert.equal(existsSync(join(dir, 'repo-config.json')), false, 'nothing is created when there is nothing to move');
	});
	inTempDir(dir => {
		writeFileSync(join(dir, 'repo-config.json'), '{}');
		assert.deepEqual(moveLegacyRepoConfig(dir), { status: 'nothing-to-move' }, 'a current file alone is left as it is');
		assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{}');
	});
});

test('repo-config.test.ts: moveLegacyRepoConfig leaves both files untouched and returns both-exist when both exist, never overwrites an existing repo-config.json, returns failed with a note and leaves github.json in place when the rename throws, and never throws', () => {
	inTempDir(dir => {
		writeFileSync(join(dir, 'github.json'), '{"old":true}');
		writeFileSync(join(dir, 'repo-config.json'), '{"current":true}');
		const both = moveLegacyRepoConfig(dir);
		assert.equal(both.status, 'both-exist');
		assert.match(both.note ?? '', /github\.json.*repo-config\.json.*both exist/);
		assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"old":true}');
		assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{"current":true}', 'the current file is never overwritten');
	});
	inTempDir(dir => {
		writeFileSync(join(dir, 'github.json'), '{"old":true}');
		const failed = moveLegacyRepoConfig(dir, { rename: () => { throw new Error('EACCES: permission denied'); } });
		assert.equal(failed.status, 'failed');
		assert.match(failed.note ?? '', /EACCES/);
		assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"old":true}', 'the old file stays');
		assert.equal(existsSync(join(dir, 'repo-config.json')), false);
		// a non-Error rejection is still a result, not an exception
		assert.equal(moveLegacyRepoConfig(dir, { rename: () => { throw 'nope'; } }).status, 'failed');
		// a directory that cannot be read is a failed result, not an exception
		assert.equal(moveLegacyRepoConfig(join(dir, 'github.json', 'not-a-directory')).status, 'failed');
	});
});

test('repo-config.test.ts: a second move after a successful one returns nothing-to-move, and a symbolic-link github.json is moved as a link', () => {
	inTempDir(dir => {
		writeFileSync(join(dir, 'github.json'), '{}');
		assert.equal(moveLegacyRepoConfig(dir).status, 'moved');
		assert.equal(moveLegacyRepoConfig(dir).status, 'nothing-to-move');
		assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{}');
	});
	inTempDir(dir => {
		const target = join(dir, 'real-settings.json');
		writeFileSync(target, '{"linked":true}');
		symlinkSync(target, join(dir, 'github.json'));
		assert.equal(moveLegacyRepoConfig(dir).status, 'moved');
		assert.equal(lstatSync(join(dir, 'repo-config.json')).isSymbolicLink(), true, 'the link itself is moved, not its content');
		assert.equal(readlinkSync(join(dir, 'repo-config.json')), target);
		assert.equal(readFileSync(target, 'utf8'), '{"linked":true}');
		assert.equal(existsSync(join(dir, 'github.json')), false);
	});
	inTempDir(dir => {
		symlinkSync(join(dir, 'missing-target.json'), join(dir, 'github.json'));
		assert.equal(moveLegacyRepoConfig(dir).status, 'moved', 'a dangling link is still the old file');
		assert.equal(lstatSync(join(dir, 'repo-config.json')).isSymbolicLink(), true);
	});
});

test('repo-config.test.ts: a source check that src/daemon/index.ts calls moveLegacyRepoConfig after the directories are ensured and before the database is opened, inside a try/catch and only when INSRC_REPO_CONFIG is unset', () => {
	const src = readFileSync(fileURLToPath(new URL('../../../daemon/index.ts', import.meta.url)), 'utf8');
	const ensured = src.indexOf("mkdirSync(PATHS.insrc, { recursive: true });");
	const call = src.indexOf('moveLegacyRepoConfig();');
	// the statements that open the database, not the comment that labels the step
	const getDb = src.indexOf('await getDb()');
	const initDb = src.indexOf('await initDb(');
	assert.ok(ensured > 0 && call > 0 && getDb > 0 && initDb > 0, 'the anchors exist in main');
	assert.ok(ensured < call, 'the move is after the directories are ensured');
	assert.ok(call < getDb && call < initDb, 'the move is before the database is opened');
	assert.equal(src.split('moveLegacyRepoConfig();').length - 1, 1, 'it is called once');
	// An empty INSRC_REPO_CONFIG counts as unset, as in repoConfigPath, so the move and the path agree on the location.
	const guard = "if ((process.env['INSRC_REPO_CONFIG'] ?? '').length === 0) {";
	const guardAt = src.indexOf(guard, ensured);
	assert.ok(guardAt > 0 && guardAt < call, 'the move runs only when the override is unset');
	assert.match(src.slice(guardAt, call), /^if \(\(process\.env\['INSRC_REPO_CONFIG'\] \?\? ''\)\.length === 0\) \{\s*try \{\s*$/, 'the call is directly inside the guard and a try');
	assert.match(src.slice(call, call + 400), /^moveLegacyRepoConfig\(\);\s*\} catch \(err\) \{\s*log\.warn\(/, 'a failure is caught and logged');
});

test('repo-config.test.ts: repoConfigPath returns the INSRC_REPO_CONFIG value when it is set and non-empty, PATHS.insrc/repo-config.json otherwise, and ignores INSRC_GITHUB_CONFIG', () => {
	withEnv('INSRC_REPO_CONFIG', '/tmp/elsewhere/settings.json', () => {
		assert.equal(repoConfigPath(), '/tmp/elsewhere/settings.json');
	});
	for (const unset of [undefined, '']) {
		withEnv('INSRC_REPO_CONFIG', unset, () => {
			assert.equal(repoConfigPath(), join(PATHS.insrc, 'repo-config.json'), unset === undefined ? 'unset' : 'empty counts as unset');
		});
	}
	// The old variable is no longer read, alone or beside the new one.
	withEnv('INSRC_REPO_CONFIG', undefined, () => withEnv('INSRC_GITHUB_CONFIG', '/tmp/old/github.json', () => {
		assert.equal(repoConfigPath(), join(PATHS.insrc, 'repo-config.json'));
	}));
	withEnv('INSRC_REPO_CONFIG', '/tmp/new.json', () => withEnv('INSRC_GITHUB_CONFIG', '/tmp/old/github.json', () => {
		assert.equal(repoConfigPath(), '/tmp/new.json');
	}));
});

test("repo-config.test.ts: after a boot move, repo.settings.get and repo.settings.set through the real handlers read and write repo-config.json and keep the repo's entry", async () => {
	const dir = mkdtempSync(join(tmpdir(), 'repo-config-handlers-'));
	try {
		const repo = '/work/repo';
		const legacy = { default: { type: 'github', ghHost: 'default.example' }, repos: { [repo]: { type: 'github', owner: 'acme', repo: 'widgets', ghHost: 'old.example' } } };
		writeFileSync(join(dir, 'github.json'), JSON.stringify(legacy));
		assert.equal(moveLegacyRepoConfig(dir).status, 'moved');

		const handlers = createRepoSettingsHandlers({
			registeredRepos: async () => [repo],
			configPath: () => join(dir, 'repo-config.json'),
			readPolicy: async () => ({ ok: true, value: 'none' }),
			makeTracker: () => ({ whoAmI: () => ({ ok: true, value: 'octocat' }) }),
		});
		const read = await handlers['repo.settings.get']!({ repo }) as SettingsResult;
		assert.ok(read.ok, JSON.stringify(read));
		assert.deepEqual(read.payload.values, { type: 'github', owner: 'acme', repo: 'widgets', ghHost: 'old.example' }, 'the moved file is the one read');

		const written = await handlers['repo.settings.set']!({ repo, key: 'ghHost', value: 'new.example' }) as SettingsResult;
		assert.ok(written.ok, JSON.stringify(written));
		const onDisk = JSON.parse(readFileSync(join(dir, 'repo-config.json'), 'utf8')) as typeof legacy;
		assert.equal(onDisk.repos[repo]!.ghHost, 'new.example');
		assert.equal(onDisk.repos[repo]!.owner, 'acme', "the repo's other keys are kept");
		assert.deepEqual(onDisk.default, legacy.default, 'the default entry is kept');
		assert.equal(existsSync(join(dir, 'github.json')), false, 'nothing is written under the old name');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('repo-config.test.ts: a source scan finds no file under src that names INSRC_GITHUB_CONFIG, githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile or GithubConfigError', () => {
	// GithubConfigError is not scanned for under src as a whole. It is the error the GitHub-tracker resolution throws
	// when GitHub is requested and no owner/repo resolves, so it is a tracker name and stays (a deviation from the LLD,
	// which took it for a file-layer error): the file layer, repo-config.ts and repo-config-store.ts, must not name it.
	const oldNames = ['INSRC_GITHUB_CONFIG', 'githubConfigPath', 'github-store', 'GithubConfigFile', 'GithubEntry', 'loadGithubConfigFile'];
	const found: string[] = [];
	for (const file of sourceFiles()) {
		if (file === OWN_FILE) continue;
		const text = readFileSync(file, 'utf8');
		const rel = relative(SRC, file);
		for (const name of oldNames) if (text.includes(name)) found.push(`${rel}: ${name}`);
		if (/\/config\/repo-config(-store)?\.ts$/.test(file) && text.includes('GithubConfigError')) found.push(`${rel}: GithubConfigError`);
	}
	assert.deepEqual(found, []);
});

test('repo-config.test.ts: a source scan finds the GitHub-tracker names (resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget, parseGithubRemoteUrl) still exported from github.ts and the file layer exported from repo-config.ts', () => {
	const github = readFileSync(join(SRC, 'workflow/config/github.ts'), 'utf8');
	for (const name of ['resolveGithubConfig', 'resolveGithubConfigFromFile', 'resolveBranchPattern', 'resolveStrictTrackerTarget', 'parseGithubRemoteUrl', 'GithubConfigError', 'TrackerAdapter']) {
		assert.match(github, new RegExp(`export (async function|function|class|type|const|\\{)[^\\n]*\\b${name}\\b`), `github.ts still exports ${name}`);
	}
	const repoConfig = readFileSync(join(SRC, 'workflow/config/repo-config.ts'), 'utf8');
	for (const name of ['repoConfigPath', 'loadRepoConfigFile', 'RepoConfigFile', 'RepoConfigEntry', 'TrackerAdapter']) {
		assert.match(repoConfig, new RegExp(`export (function|interface|type) ${name}\\b`), `repo-config.ts exports ${name}`);
	}
	// and github.ts does not define the file layer a second time
	for (const name of ['repoConfigPath', 'loadRepoConfigFile', 'RepoConfigFile', 'RepoConfigEntry']) {
		assert.doesNotMatch(github, new RegExp(`export (function|interface|type) ${name}\\b`), `github.ts does not define ${name}`);
	}
});
