/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectRepoType, repoTypeIgnoreDirs } from '../repo-type.js';
import {
	gitignoreDirs,
	initRepoIgnore,
	repoConfigPath,
	resolveRepoIgnore,
} from '../repo-ignore-config.js';
import { IGNORE_DIRS } from '../watcher.js';

function withRepo(fn: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-ign-'));
	try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// detectRepoType
// ---------------------------------------------------------------------------

test('detectRepoType: marker files map to types (polyglot returns all)', () => {
	withRepo(dir => {
		writeFileSync(join(dir, 'package.json'), '{}');
		writeFileSync(join(dir, 'pyproject.toml'), '');
		writeFileSync(join(dir, 'pom.xml'), '<project/>');
		const types = detectRepoType(dir).sort();
		assert.deepEqual(types, ['java', 'node', 'python']);
	});
});

test('detectRepoType: empty repo → no types', () => {
	withRepo(dir => assert.deepEqual(detectRepoType(dir), []));
});

test('repoTypeIgnoreDirs: java → target/build, python → __pycache__/.venv, node → node_modules/dist', () => {
	assert.ok(repoTypeIgnoreDirs(['java']).includes('target'));
	assert.ok(repoTypeIgnoreDirs(['python']).includes('__pycache__'));
	assert.ok(repoTypeIgnoreDirs(['node']).includes('node_modules'));
});

// ---------------------------------------------------------------------------
// gitignoreDirs parsing
// ---------------------------------------------------------------------------

test('gitignoreDirs: extracts bare dir names, skips comments/negations/globs/nested', () => {
	withRepo(dir => {
		writeFileSync(join(dir, '.gitignore'), [
			'# a comment', '/build/', 'coverage', '!keep', '*.log', 'src/generated', '.venv', 'target/',
		].join('\n'));
		const dirs = gitignoreDirs(dir).sort();
		// bare names kept (incl. dotfile dirs like .venv); comments/negations/globs/nested-paths dropped
		assert.deepEqual(dirs, ['.venv', 'build', 'coverage', 'target']);
	});
});

test('gitignoreDirs: no .gitignore → empty', () => {
	withRepo(dir => assert.deepEqual(gitignoreDirs(dir), []));
});

// ---------------------------------------------------------------------------
// initRepoIgnore precedence + persistence + idempotency
// ---------------------------------------------------------------------------

test('initRepoIgnore: with .gitignore → base ∪ gitignore dirs, persisted to .insrc/config.json', () => {
	withRepo(dir => {
		writeFileSync(join(dir, '.gitignore'), '/build/\ncoverage\n');
		const ignore = initRepoIgnore(dir);
		// universal base always present
		for (const b of IGNORE_DIRS) assert.ok(ignore.includes(b), `base ${b}`);
		// gitignore-derived
		assert.ok(ignore.includes('build') && ignore.includes('coverage'));
		// persisted
		assert.ok(existsSync(repoConfigPath(dir)));
		assert.deepEqual((JSON.parse(readFileSync(repoConfigPath(dir), 'utf8')) as { ignore: string[] }).ignore, ignore);
	});
});

test('initRepoIgnore: no .gitignore → base ∪ repo-type defaults (java)', () => {
	withRepo(dir => {
		writeFileSync(join(dir, 'pom.xml'), '<project/>');
		const ignore = initRepoIgnore(dir);
		assert.ok(ignore.includes('target'), 'java type default target');
		assert.ok(ignore.includes('.insrc') && ignore.includes('out'), 'base still applied');
	});
});

test('initRepoIgnore: idempotent — never overwrites an existing ignore', () => {
	withRepo(dir => {
		mkdirSync(join(dir, '.insrc'), { recursive: true });
		writeFileSync(repoConfigPath(dir), JSON.stringify({ ignore: ['custom-only'] }));
		const ignore = initRepoIgnore(dir);
		assert.deepEqual(ignore, ['custom-only'], 'user-authored config preserved');
	});
});

test('resolveRepoIgnore: config present → its ignore; absent → IGNORE_DIRS fallback', () => {
	withRepo(dir => {
		assert.deepEqual(resolveRepoIgnore(dir), [...IGNORE_DIRS], 'fallback when no config');
		initRepoIgnore(dir);
		assert.ok(resolveRepoIgnore(dir).includes('.insrc'), 'reads persisted config');
	});
});
