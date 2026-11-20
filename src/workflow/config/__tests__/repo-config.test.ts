/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { moveLegacyRepoConfig } from '../repo-config-store.js';

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
