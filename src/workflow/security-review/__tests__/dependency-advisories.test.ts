/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s2/t2: enumerateManagers.
 * Run: npx tsx --test src/workflow/security-review/__tests__/dependency-advisories.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { enumerateManagers } from '../dependency-advisories.js';

const EMPTY_TARGETS = { entries: [] };

function tmpRepo(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-enum-managers-'));
}

test('enumerateManagers finds a manager for each of the 8 supported manifest/lockfile shapes', () => {
	const repo = tmpRepo();
	try {
		const shapes: ReadonlyArray<readonly [string, string]> = [
			['npm', 'package-lock.json'],
			['pnpm', 'pnpm-lock.yaml'],
			['yarn', 'yarn.lock'],
			['pip', 'requirements.txt'],
			['pipenv', 'Pipfile.lock'],
			['poetry', 'poetry.lock'],
			['go', 'go.sum'],
			['cargo', 'Cargo.lock'],
		];
		for (const [manager, file] of shapes) {
			const dir = join(repo, manager);
			mkdirSync(dir);
			writeFileSync(join(dir, file), '');
		}
		const { managers, ambiguities } = enumerateManagers(repo, EMPTY_TARGETS);
		assert.deepEqual(ambiguities, []);
		const found = new Set(managers.map(m => m.manager));
		for (const [manager] of shapes) {
			assert.ok(found.has(manager as never), `expected ${manager} to be found; got ${[...found].join(',')}`);
		}
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("enumerateManagers: a lockfile's own companion bare manifest (pnpm-lock.yaml + package.json, yarn.lock + package.json, poetry.lock + pyproject.toml) is NOT a second manager -- it is the same manager's own manifest, not independent evidence of another", () => {
	const repo = tmpRepo();
	try {
		const cases: ReadonlyArray<readonly [string, string, string]> = [
			['pnpm', 'pnpm-lock.yaml', 'package.json'],
			['yarn', 'yarn.lock', 'package.json'],
			['poetry', 'poetry.lock', 'pyproject.toml'],
		];
		for (const [manager, lockfile, bareManifest] of cases) {
			const dir = join(repo, manager);
			mkdirSync(dir);
			writeFileSync(join(dir, lockfile), '');
			writeFileSync(join(dir, bareManifest), '');
			const { managers, ambiguities } = enumerateManagers(dir, EMPTY_TARGETS);
			assert.deepEqual(ambiguities, [], `${manager}: expected no ambiguity, got ${JSON.stringify(ambiguities)}`);
			assert.deepEqual(managers.map(m => m.manager), [manager], `${manager}: expected only itself, got ${JSON.stringify(managers)}`);
		}
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('enumerateManagers: two manifests for the same manager family -> unresolved ambiguity', () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'package-lock.json'), '');
		writeFileSync(join(repo, 'yarn.lock'), '');
		const { managers, ambiguities } = enumerateManagers(repo, EMPTY_TARGETS);
		assert.equal(managers.length, 0, 'the ambiguous family must never be silently resolved to one manager');
		assert.equal(ambiguities.length, 1);
		assert.equal(ambiguities[0]?.directory, repo);
		assert.deepEqual([...ambiguities[0]?.managers ?? []].sort(), ['npm', 'yarn']);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('enumerateManagers: a directory with no recognizable manifest yields no manager', () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'README.md'), '');
		const { managers, ambiguities } = enumerateManagers(repo, EMPTY_TARGETS);
		assert.deepEqual(managers, []);
		assert.deepEqual(ambiguities, []);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('enumerateManagers: a SUBDIRECTORY named like a manifest file (e.g. package.json/) is never mistaken for the file', () => {
	const repo = tmpRepo();
	try {
		mkdirSync(join(repo, 'package.json'));
		const { managers, ambiguities } = enumerateManagers(repo, EMPTY_TARGETS);
		assert.deepEqual(managers, []);
		assert.deepEqual(ambiguities, []);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
