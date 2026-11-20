/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, lstatSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
		const failed = moveLegacyRepoConfig(dir, { link: () => { throw new Error('EACCES: permission denied'); }, copy: () => { throw new Error('EACCES: permission denied'); } });
		assert.equal(failed.status, 'failed');
		assert.match(failed.note ?? '', /EACCES/);
		assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"old":true}', 'the old file stays');
		assert.equal(existsSync(join(dir, 'repo-config.json')), false);
		// a non-Error rejection is still a result, not an exception
		assert.equal(moveLegacyRepoConfig(dir, { link: () => { throw 'nope'; }, copy: () => { throw 'nope'; } }).status, 'failed');
		// a directory that cannot be read is a failed result, not an exception
		assert.equal(moveLegacyRepoConfig(join(dir, 'github.json', 'not-a-directory')).status, 'failed');
	});
});

test('repo-config.test.ts: a repo-config.json created between the presence check and the move is not replaced, and neither file changes', () => {
	// another process creates the new file after moveLegacyRepoConfig has seen it absent and before the move
	inTempDir(dir => {
		writeFileSync(join(dir, 'github.json'), '{"legacy":true}');
		const result = moveLegacyRepoConfig(dir, { beforeCreate: () => writeFileSync(join(dir, 'repo-config.json'), '{"newer":true}') });
		assert.equal(result.status, 'both-exist');
		assert.match(result.note ?? '', /both exist.*neither was changed/);
		assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{"newer":true}', 'the newer settings are not replaced');
		assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"legacy":true}', 'the legacy file is not removed');
	});
	// the same interleaving for a symbolic-link github.json
	inTempDir(dir => {
		const target = join(dir, 'real-settings.json');
		writeFileSync(target, '{"linked":true}');
		symlinkSync(target, join(dir, 'github.json'));
		const result = moveLegacyRepoConfig(dir, { beforeCreate: () => writeFileSync(join(dir, 'repo-config.json'), '{"newer":true}') });
		assert.equal(result.status, 'both-exist');
		assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{"newer":true}');
		assert.equal(lstatSync(join(dir, 'github.json')).isSymbolicLink(), true);
	});
	// and when the new file appears at the link itself, the file system's exclusive link refuses it
	inTempDir(dir => {
		writeFileSync(join(dir, 'github.json'), '{"legacy":true}');
		const result = moveLegacyRepoConfig(dir, { link: (from, to) => { writeFileSync(to, '{"newer":true}'); linkSync(from, to); } });
		assert.equal(result.status, 'both-exist');
		assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{"newer":true}');
		assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"legacy":true}');
	});
	// removing the old name fails after the new one was published: both exist with the same content and nothing is lost
	inTempDir(dir => {
		writeFileSync(join(dir, 'github.json'), '{"legacy":true}');
		const result = moveLegacyRepoConfig(dir, { unlink: () => { throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); } });
		assert.equal(result.status, 'failed');
		assert.match(result.note ?? '', /was created but .*github\.json could not be removed/);
		assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{"legacy":true}');
		assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"legacy":true}');
	});
});

/** What an editor that saves atomically does to a file: writes a temporary file and renames it over the path. */
function replaceAtomically(path: string, content: string): void {
	writeFileSync(`${path}.editor-tmp`, content);
	renameSync(`${path}.editor-tmp`, path);
}

test('repo-config.test.ts: the old name is removed only if it is still the file that was moved, so a newer github.json that replaced it is kept', () => {
	const noHardLinks = (): never => { throw Object.assign(new Error('EPERM: operation not permitted, link'), { code: 'EPERM' }); };
	for (const viaCopy of [false, true]) {
		const label = viaCopy ? 'copy fallback' : 'hard link';
		inTempDir(dir => {
			writeFileSync(join(dir, 'github.json'), '{"older":true}');
			const result = moveLegacyRepoConfig(dir, {
				...(viaCopy ? { link: noHardLinks } : {}),
				// an editor saves a newer github.json between publishing the new name and removing the old one
				beforeRemoveSource: () => replaceAtomically(join(dir, 'github.json'), '{"newer":true,"longer":"content"}'),
			});
			assert.equal(result.status, 'both-exist', label);
			assert.match(result.note ?? '', /changed while it was being moved and was left in place/, label);
			assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"newer":true,"longer":"content"}', `${label}: the newer legacy settings are kept`);
			assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{"older":true}', `${label}: repo-config.json holds what was moved`);
		});
	}
	// an in-place edit of the same size and a later time changes the identity too
	inTempDir(dir => {
		writeFileSync(join(dir, 'github.json'), '{"a":1}');
		const result = moveLegacyRepoConfig(dir, { beforeRemoveSource: () => { const at = new Date(Date.now() + 5000); writeFileSync(join(dir, 'github.json'), '{"a":2}'); utimesSync(join(dir, 'github.json'), at, at); } });
		assert.equal(result.status, 'both-exist');
		assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"a":2}');
	});
	// the old name already gone is not a failure
	inTempDir(dir => {
		writeFileSync(join(dir, 'github.json'), '{"legacy":true}');
		const result = moveLegacyRepoConfig(dir, { beforeRemoveSource: () => rmSync(join(dir, 'github.json')) });
		assert.equal(result.status, 'moved');
		assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{"legacy":true}');
	});
});

test('repo-config.test.ts: where hard links are not supported the move publishes a checked copy by rename, never writes into repo-config.json, and removes only its own temporary file', () => {
	const noHardLinks = (): never => { throw Object.assign(new Error('EPERM: operation not permitted, link'), { code: 'EPERM' }); };
	const leftovers = (dir: string): string[] => readdirSync(dir).filter(n => n.endsWith('.tmp'));
	// a volume without hard links (FAT, exFAT, some shares): a complete copy is renamed into place and the old name removed
	inTempDir(dir => {
		const bytes = Buffer.from('{"repos":{"/a":{"owner":"o"}}}\r\n', 'utf8');
		writeFileSync(join(dir, 'github.json'), bytes);
		assert.deepEqual(moveLegacyRepoConfig(dir, { link: noHardLinks }), { status: 'moved' });
		assert.deepEqual(readFileSync(join(dir, 'repo-config.json')), bytes);
		assert.equal(lstatSync(join(dir, 'repo-config.json')).isFile(), true);
		assert.equal(existsSync(join(dir, 'github.json')), false);
		assert.deepEqual(leftovers(dir), [], 'no temporary file is left');
	});
	// a copy that fails part way or does not match is discarded: repo-config.json is never created, the old file stays
	inTempDir(dir => {
		writeFileSync(join(dir, 'github.json'), '{"legacy":true}');
		const partial = moveLegacyRepoConfig(dir, { link: noHardLinks, copy: (_from, tmp) => { writeFileSync(tmp, '{"leg'); throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }); } });
		assert.equal(partial.status, 'failed');
		assert.match(partial.note ?? '', /ENOSPC/);
		const wrong = moveLegacyRepoConfig(dir, { link: noHardLinks, copy: (_from, tmp) => writeFileSync(tmp, '{"other":1}') });
		assert.equal(wrong.status, 'failed');
		assert.match(wrong.note ?? '', /does not match/);
		for (const label of ['partial', 'wrong']) {
			assert.equal(existsSync(join(dir, 'repo-config.json')), false, `${label}: repo-config.json is never created`);
			assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"legacy":true}', `${label}: the old file stays`);
		}
		assert.deepEqual(leftovers(dir), [], 'only this call\'s own temporary files were made, and they are removed');
	});
	// a repo-config.json that another process creates is never replaced and never removed, wherever it appears
	const newer = (dir: string): (() => void) => () => writeFileSync(join(dir, 'repo-config.json'), '{"newer":true}');
	const cases: Array<[string, (dir: string) => Parameters<typeof moveLegacyRepoConfig>[1]]> = [
		['before the link attempt', dir => ({ link: noHardLinks, beforeCreate: newer(dir) })],
		['during the link attempt', dir => ({ link: () => { newer(dir)(); return noHardLinks(); } })],
		['after the copy was checked, before it is published', dir => ({ link: noHardLinks, beforePublish: newer(dir) })],
		['and the copy then fails', dir => ({ link: () => { newer(dir)(); return noHardLinks(); }, copy: () => { throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); } })],
		['and the copy does not match', dir => ({ link: () => { newer(dir)(); return noHardLinks(); }, copy: (_from, tmp) => writeFileSync(tmp, '{"other":1}') })],
	];
	for (const [when, seams] of cases) {
		inTempDir(dir => {
			writeFileSync(join(dir, 'github.json'), '{"legacy":true}');
			const result = moveLegacyRepoConfig(dir, seams(dir));
			assert.ok(result.status === 'both-exist' || result.status === 'failed', `${when}: ${result.status}`);
			assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), '{"newer":true}', `${when}: the newer settings are neither replaced nor removed`);
			assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"legacy":true}', `${when}: the legacy file stays`);
			assert.deepEqual(leftovers(dir), [], `${when}: no temporary file is left`);
		});
	}
	// both names, whatever they hold, are left alone by the next boot
	for (const current of ['{"same":true}', '{"same":true,"edited":1}']) {
		inTempDir(dir => {
			writeFileSync(join(dir, 'github.json'), '{"same":true}');
			writeFileSync(join(dir, 'repo-config.json'), current);
			assert.equal(moveLegacyRepoConfig(dir).status, 'both-exist');
			assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), '{"same":true}');
			assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), current);
		});
	}
});

test('repo-config.test.ts: a move killed part way through the copy leaves no repo-config.json, and the next boot completes it and sweeps the dead process\'s temporary file', () => {
	inTempDir(dir => {
		const legacy = '{"repos":{"/a":{"owner":"o","repo":"r"}},"note":"long enough that a partial copy is visibly shorter"}';
		writeFileSync(join(dir, 'github.json'), legacy);
		const script = join(dir, 'kill-during-copy.mts');
		writeFileSync(script, `
			import { writeFileSync } from 'node:fs';
			import { moveLegacyRepoConfig } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../repo-config-store.ts', import.meta.url))).href)};
			moveLegacyRepoConfig(${JSON.stringify(dir)}, {
				link: () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); },
				copy: (_from, tmp) => { writeFileSync(tmp, '{"repos":{"/a"'); process.kill(process.pid, 'SIGKILL'); },
			});
		`);
		const child = spawnSync(process.execPath, ['--import', 'tsx', script], { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), encoding: 'utf8', timeout: 60000 });
		assert.equal(child.signal, 'SIGKILL', `the child was killed during the copy: ${child.stderr}`);
		assert.equal(existsSync(join(dir, 'repo-config.json')), false, 'no partial repo-config.json was published');
		assert.equal(readFileSync(join(dir, 'github.json'), 'utf8'), legacy, 'the legacy settings are intact');
		assert.equal(readdirSync(dir).filter(n => n.endsWith('.tmp')).length, 1, "the dead process's partial temporary file is still there");
		const next = moveLegacyRepoConfig(dir);
		assert.equal(next.status, 'moved');
		assert.equal(readFileSync(join(dir, 'repo-config.json'), 'utf8'), legacy, 'the next boot publishes the complete settings');
		assert.equal(existsSync(join(dir, 'github.json')), false);
		assert.deepEqual(readdirSync(dir).filter(n => n.endsWith('.tmp')), [], "the dead process's temporary file was swept");
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
