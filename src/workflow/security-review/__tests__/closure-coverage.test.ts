/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s2/t4: verifyManagerClosureCoverage.
 * Run: npx tsx --test src/workflow/security-review/__tests__/closure-coverage.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verifyManagerClosureCoverage } from '../dependency-advisories.js';

function tmpRepo(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-closure-'));
}

test("verifyManagerClosureCoverage: a closure fully contained in targets.entries -> covered:true", async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\n');
		const result = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'requirements.txt' }] }, 'pip', repo);
		assert.deepEqual(result, { covered: true });
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("verifyManagerClosureCoverage: a closure referencing a file outside targets.entries -> covered:false with missing listed", async () => {
	const repo = tmpRepo();
	try {
		mkdirSync(join(repo, 'reqs'));
		writeFileSync(join(repo, 'requirements.txt'), '-r reqs/dev.txt\nflask==2.0.0\n');
		writeFileSync(join(repo, 'reqs', 'dev.txt'), 'pytest==7.0.0\n');
		// Only the top-level file is in scope; reqs/dev.txt is NOT.
		const result = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'requirements.txt' }] }, 'pip', repo);
		assert.equal(result.covered, false);
		assert.ok(!result.covered && result.missing.includes('reqs/dev.txt'), JSON.stringify(result));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("verifyManagerClosureCoverage: re-resolves the closure fresh on each call -- two calls in a row after a file is added return different results", async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\n');
		const targets = { entries: [{ path: 'requirements.txt' }] };
		const before = await verifyManagerClosureCoverage(repo, targets, 'pip', repo);
		assert.deepEqual(before, { covered: true });

		// Add a nested reference AFTER the first call, pointing outside the pinned scope.
		writeFileSync(join(repo, 'requirements.txt'), '-r more.txt\nflask==2.0.0\n');
		writeFileSync(join(repo, 'more.txt'), 'pytest==7.0.0\n');
		const after = await verifyManagerClosureCoverage(repo, targets, 'pip', repo);
		assert.equal(after.covered, false);
		assert.ok(!after.covered && after.missing.includes('more.txt'), JSON.stringify(after));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('verifyManagerClosureCoverage: never mutates targets.entries', async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\n');
		const targets = { entries: [{ path: 'requirements.txt' }] };
		const before = JSON.stringify(targets);
		await verifyManagerClosureCoverage(repo, targets, 'pip', repo);
		assert.equal(JSON.stringify(targets), before);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("verifyManagerClosureCoverage: a '-r' line with a trailing inline comment still resolves to the real referenced file, not the comment text", async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'requirements.txt'), '-r more.txt  # dev deps\nflask==2.0.0\n');
		writeFileSync(join(repo, 'more.txt'), 'pytest==7.0.0\n');
		const missingBoth = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'requirements.txt' }] }, 'pip', repo);
		assert.equal(missingBoth.covered, false);
		assert.ok(!missingBoth.covered && missingBoth.missing.includes('more.txt'), JSON.stringify(missingBoth));
		assert.ok(!missingBoth.covered && !missingBoth.missing.some(m => m.includes('#')), 'must never report the comment text as a path');

		const fullyScoped = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'requirements.txt' }, { path: 'more.txt' }] }, 'pip', repo);
		assert.deepEqual(fullyScoped, { covered: true });
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("verifyManagerClosureCoverage: a compact '-rfile' (glued, no space) reference is still resolved, not just the spaced '-r file' form", async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'requirements.txt'), '-rmore.txt\nflask==2.0.0\n');
		writeFileSync(join(repo, 'more.txt'), 'pytest==7.0.0\n');
		const missing = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'requirements.txt' }] }, 'pip', repo);
		assert.equal(missing.covered, false);
		assert.ok(!missing.covered && missing.missing.includes('more.txt'), JSON.stringify(missing));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('verifyManagerClosureCoverage: a -r reference to a file that does not exist on disk is still reported missing, never silently dropped from the closure', async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'requirements.txt'), '-r does-not-exist.txt\nflask==2.0.0\n');
		const result = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'requirements.txt' }] }, 'pip', repo);
		assert.equal(result.covered, false);
		assert.ok(!result.covered && result.missing.includes('does-not-exist.txt'), JSON.stringify(result));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("verifyManagerClosureCoverage: a go package directory literally named 'build' or 'dist' is still part of the closure (those are not reserved Go names)", async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'go.mod'), 'module example.com/x\n');
		writeFileSync(join(repo, 'go.sum'), '');
		mkdirSync(join(repo, 'build'));
		writeFileSync(join(repo, 'build', 'real.go'), 'package build\n');
		const result = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'go.mod' }, { path: 'go.sum' }] }, 'go', repo);
		assert.equal(result.covered, false);
		assert.ok(!result.covered && result.missing.includes(join('build', 'real.go')), JSON.stringify(result));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("verifyManagerClosureCoverage: a go module's closure also covers assembly (.s) and cgo (.c/.h) source files, not just .go", async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'go.mod'), 'module example.com/x\n');
		writeFileSync(join(repo, 'go.sum'), '');
		writeFileSync(join(repo, 'main.go'), 'package main\n');
		writeFileSync(join(repo, 'asm.s'), '// assembly\n');
		writeFileSync(join(repo, 'cgo.c'), '// cgo\n');
		writeFileSync(join(repo, 'cgo.h'), '// cgo header\n');
		const fullyScoped = await verifyManagerClosureCoverage(
			repo,
			{ entries: [{ path: 'go.mod' }, { path: 'go.sum' }, { path: 'main.go' }, { path: 'asm.s' }, { path: 'cgo.c' }, { path: 'cgo.h' }] },
			'go',
			repo,
		);
		assert.deepEqual(fullyScoped, { covered: true });

		const missingCgo = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'go.mod' }, { path: 'go.sum' }, { path: 'main.go' }, { path: 'asm.s' }] }, 'go', repo);
		assert.equal(missingCgo.covered, false);
		assert.ok(!missingCgo.covered && missingCgo.missing.includes('cgo.c') && missingCgo.missing.includes('cgo.h'), JSON.stringify(missingCgo));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("verifyManagerClosureCoverage: a go module's closure also covers //go:embed-referenced files", async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'go.mod'), 'module example.com/x\n');
		writeFileSync(join(repo, 'go.sum'), '');
		writeFileSync(join(repo, 'main.go'), 'package main\n\n//go:embed assets/logo.png\nvar logo []byte\n');
		mkdirSync(join(repo, 'assets'));
		writeFileSync(join(repo, 'assets', 'logo.png'), 'fake-png-bytes');
		const fullyScoped = await verifyManagerClosureCoverage(
			repo,
			{ entries: [{ path: 'go.mod' }, { path: 'go.sum' }, { path: 'main.go' }, { path: join('assets', 'logo.png') }] },
			'go',
			repo,
		);
		assert.deepEqual(fullyScoped, { covered: true });

		const missingEmbed = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'go.mod' }, { path: 'go.sum' }, { path: 'main.go' }] }, 'go', repo);
		assert.equal(missingEmbed.covered, false);
		assert.ok(!missingEmbed.covered && missingEmbed.missing.includes(join('assets', 'logo.png')), JSON.stringify(missingEmbed));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("verifyManagerClosureCoverage: a '//go:embed <directory>' directive (no wildcard) embeds every file under that directory recursively, not the directory entry itself", async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'go.mod'), 'module example.com/x\n');
		writeFileSync(join(repo, 'go.sum'), '');
		writeFileSync(join(repo, 'main.go'), 'package main\n\n//go:embed assets\nvar assets embed.FS\n');
		mkdirSync(join(repo, 'assets'));
		mkdirSync(join(repo, 'assets', 'nested'));
		writeFileSync(join(repo, 'assets', 'logo.png'), 'fake-png-bytes');
		writeFileSync(join(repo, 'assets', 'nested', 'icon.png'), 'fake-icon-bytes');
		const fullyScoped = await verifyManagerClosureCoverage(
			repo,
			{
				entries: [
					{ path: 'go.mod' }, { path: 'go.sum' }, { path: 'main.go' },
					{ path: join('assets', 'logo.png') }, { path: join('assets', 'nested', 'icon.png') },
				],
			},
			'go',
			repo,
		);
		assert.deepEqual(fullyScoped, { covered: true });

		const missingNested = await verifyManagerClosureCoverage(
			repo,
			{ entries: [{ path: 'go.mod' }, { path: 'go.sum' }, { path: 'main.go' }, { path: join('assets', 'logo.png') }] },
			'go',
			repo,
		);
		assert.equal(missingNested.covered, false);
		assert.ok(!missingNested.covered && missingNested.missing.includes(join('assets', 'nested', 'icon.png')), JSON.stringify(missingNested));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('verifyManagerClosureCoverage: a go module closure covers every .go source file under manifestDir', async () => {
	const repo = tmpRepo();
	try {
		writeFileSync(join(repo, 'go.mod'), 'module example.com/x\n');
		writeFileSync(join(repo, 'go.sum'), '');
		writeFileSync(join(repo, 'main.go'), 'package main\n');
		const fullyScoped = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'go.mod' }, { path: 'go.sum' }, { path: 'main.go' }] }, 'go', repo);
		assert.deepEqual(fullyScoped, { covered: true });

		const underScoped = await verifyManagerClosureCoverage(repo, { entries: [{ path: 'go.mod' }, { path: 'go.sum' }] }, 'go', repo);
		assert.equal(underScoped.covered, false);
		assert.ok(!underScoped.covered && underScoped.missing.includes('main.go'));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
