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
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { computeContentIdentity, _setContentIdentityDepsForTests } from '../content-identity.js';

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

/** Every test below exercises computeContentIdentity's own git/filesystem
 *  logic, not the daemon's real repo registry (which would need a running
 *  graph store) -- a fixture repo is treated as registered via the injectable
 *  seam, mirroring this codebase's own _set*DepsForTests convention. */
function treatAsRegistered(repoPath: string): void {
	_setContentIdentityDepsForTests(async candidate => candidate === repoPath);
}

test('computeContentIdentity: an application-source file in targets.entries is edited, manifests/lockfiles unchanged -> digest changes', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		const targets = { entries: [{ path: 'app.ts' }] };
		const before = await computeContentIdentity(repo, targets);
		writeFileSync(join(repo, 'app.ts'), 'export const x = 2;\n');
		const after = await computeContentIdentity(repo, targets);
		assert.notEqual(before, after);
	} finally {
		_setContentIdentityDepsForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: a file NOT in targets.entries is edited -> no change', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		const targets = { entries: [{ path: 'app.ts' }] };
		const before = await computeContentIdentity(repo, targets);
		writeFileSync(join(repo, 'other.ts'), 'export const y = 999;\n');
		const after = await computeContentIdentity(repo, targets);
		assert.equal(before, after);
	} finally {
		_setContentIdentityDepsForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: identical targets.entries bytes -> identical string on repeated calls', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		const targets = { entries: [{ path: 'app.ts' }, { path: 'other.ts' }] };
		const a = await computeContentIdentity(repo, targets);
		const b = await computeContentIdentity(repo, targets);
		assert.equal(a, b);
	} finally {
		_setContentIdentityDepsForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: a targets.entries path outside repoPath throws', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		await assert.rejects(() => computeContentIdentity(repo, { entries: [{ path: '../outside.ts' }] }));
	} finally {
		_setContentIdentityDepsForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: repoPath that is not a registered repo throws', async () => {
	const repo = initRepo();
	_setContentIdentityDepsForTests(async () => false);
	try {
		await assert.rejects(() => computeContentIdentity(repo, { entries: [] }));
	} finally {
		_setContentIdentityDepsForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: repoPath that is not a git repository at all throws', async () => {
	const notRepo = mkdtempSync(join(tmpdir(), 'insrc-not-a-repo-'));
	treatAsRegistered(notRepo);
	try {
		await assert.rejects(() => computeContentIdentity(notRepo, { entries: [] }));
	} finally {
		_setContentIdentityDepsForTests();
		rmSync(notRepo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: a git repository with no commits yet (HEAD unresolvable) throws', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-no-commits-'));
	treatAsRegistered(repo);
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		await assert.rejects(() => computeContentIdentity(repo, { entries: [] }));
	} finally {
		_setContentIdentityDepsForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});

test("computeContentIdentity: two DIFFERENT (path, content) pairs never hash to the same identity merely because their concatenation would coincide (e.g. path 'a' content 'bc' vs path 'ab' content 'c')", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'a'), 'bc');
		writeFileSync(join(repo, 'ab'), 'c');
		const identityA = await computeContentIdentity(repo, { entries: [{ path: 'a' }] });
		const identityAb = await computeContentIdentity(repo, { entries: [{ path: 'ab' }] });
		assert.notEqual(identityA, identityAb, 'a path/content framing ambiguity would make these equal');
	} finally {
		_setContentIdentityDepsForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});

test('computeContentIdentity: a targets.entries path that is a SYMLINK pointing outside repoPath throws', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	const outsideDir = mkdtempSync(join(tmpdir(), 'insrc-outside-'));
	try {
		writeFileSync(join(outsideDir, 'secret.ts'), 'export const secret = 1;\n');
		symlinkSync(join(outsideDir, 'secret.ts'), join(repo, 'linked.ts'));
		await assert.rejects(() => computeContentIdentity(repo, { entries: [{ path: 'linked.ts' }] }));
	} finally {
		_setContentIdentityDepsForTests();
		rmSync(repo, { recursive: true, force: true });
		rmSync(outsideDir, { recursive: true, force: true });
	}
});
