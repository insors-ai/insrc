/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s2/t3: computeContentIdentity.
 * Run: npx tsx --test src/workflow/security-review/__tests__/content-identity.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { computeContentIdentity } from '../content-identity.js';

function initRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-content-identity-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
	execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
	writeFileSync(join(repo, 'app.ts'), 'export const x = 1;\n');
	writeFileSync(join(repo, 'other.ts'), 'export const y = 2;\n');
	execFileSync('git', ['add', '.'], { cwd: repo });
	execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
	return repo;
}

test('computeContentIdentity: an application-source file in targets.entries is edited, manifests/lockfiles unchanged -> digest changes', async () => {
	const repo = initRepo();
	try {
		const targets = { entries: [{ path: 'app.ts' }] };
		const before = await computeContentIdentity(repo, targets);
		writeFileSync(join(repo, 'app.ts'), 'export const x = 2;\n');
		const after = await computeContentIdentity(repo, targets);
		assert.notEqual(before, after);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: a file NOT in targets.entries is edited -> no change', async () => {
	const repo = initRepo();
	try {
		const targets = { entries: [{ path: 'app.ts' }] };
		const before = await computeContentIdentity(repo, targets);
		writeFileSync(join(repo, 'other.ts'), 'export const y = 999;\n');
		const after = await computeContentIdentity(repo, targets);
		assert.equal(before, after);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: identical targets.entries bytes -> identical string on repeated calls', async () => {
	const repo = initRepo();
	try {
		const targets = { entries: [{ path: 'app.ts' }, { path: 'other.ts' }] };
		const a = await computeContentIdentity(repo, targets);
		const b = await computeContentIdentity(repo, targets);
		assert.equal(a, b);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: a targets.entries path outside repoPath throws', async () => {
	const repo = initRepo();
	try {
		await assert.rejects(() => computeContentIdentity(repo, { entries: [{ path: '../outside.ts' }] }));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: repoPath that is not a registered git repository throws', async () => {
	const notRepo = mkdtempSync(join(tmpdir(), 'insrc-not-a-repo-'));
	try {
		await assert.rejects(() => computeContentIdentity(notRepo, { entries: [] }));
	} finally {
		rmSync(notRepo, { recursive: true, force: true });
	}
});
