/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t4 — resolving a companion page's header.
 *
 * Run:
 *   npx tsx --test src/workflow/artifacts/companion/__tests__/header.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { formatDate, resolveCompanionHeader, resolveReviewer, type CompanionHeaderDeps, type CompanionHeaderSource } from '../header.js';

const HASH = 'd9f85b3cc8cc966b';
const CREATED = '2026-10-11T10:31:49.465Z';

const PINNED: CompanionHeaderDeps = {
	now:         () => new Date(2026, 9, 11, 9, 5),
	gitUserName: () => 'Subho Ghosh\n',
	osUserName:  () => 'subho',
};

const STANDALONE: CompanionHeaderSource = { kind: 'LLD-standalone', epicHash: HASH, storyId: 'S001', anchorCreatedAt: CREATED };

function withRepo<T>(fn: (repo: string) => T, config?: string): T {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-header-proj-'));
	try {
		if (config !== undefined) {
			mkdirSync(join(repo, '.insrc'), { recursive: true });
			writeFileSync(join(repo, '.insrc', 'config.json'), config);
		}
		return fn(repo);
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

function header(repo: string, source: CompanionHeaderSource = STANDALONE, deps: CompanionHeaderDeps = PINNED) {
	return resolveCompanionHeader({ repoPath: repo, source, artifactId: `LLD-${HASH}-S001`, sourceMdPath: join(repo, 'docs/standalone/x/S001/LLD.md') }, deps);
}

// ---------------------------------------------------------------------------
// unit: header: projectName override / basename fallback / malformed config ignored
// ---------------------------------------------------------------------------

test('d9f85b3c t4 — projectName comes from .insrc/config.json when set', () => {
	withRepo(repo => assert.equal(header(repo).projectName, 'Insrc Backend'), JSON.stringify({ projectName: '  Insrc Backend ', ignore: [] }));
});

test('d9f85b3c t4 — projectName falls back to the repo folder name with no config, or no / an empty / a non-string projectName', () => {
	withRepo(repo => assert.equal(header(repo).projectName, basename(repo)));
	withRepo(repo => assert.equal(header(repo).projectName, basename(repo)), JSON.stringify({ ignore: ['x'] }));
	withRepo(repo => assert.equal(header(repo).projectName, basename(repo)), JSON.stringify({ projectName: '   ' }));
	withRepo(repo => assert.equal(header(repo).projectName, basename(repo)), JSON.stringify({ projectName: 42 }));
});

test('d9f85b3c t4 — a malformed config is ignored, not thrown', () => {
	withRepo(repo => {
		assert.doesNotThrow(() => header(repo));
		assert.equal(header(repo).projectName, basename(repo));
	}, '{ not json');
});

// ---------------------------------------------------------------------------
// unit: header: git user / OS fallback / 'unknown'; injected clock format
// ---------------------------------------------------------------------------

test('d9f85b3c t4 — user is git user.name, else the OS login, else unknown', () => {
	withRepo(repo => {
		assert.equal(header(repo).user, 'Subho Ghosh', 'git, trimmed');
		assert.equal(header(repo, STANDALONE, { ...PINNED, gitUserName: () => undefined }).user, 'subho');
		assert.equal(header(repo, STANDALONE, { ...PINNED, gitUserName: () => '  ' }).user, 'subho', 'a blank git name counts as unset');
		assert.equal(header(repo, STANDALONE, { ...PINNED, gitUserName: () => undefined, osUserName: () => undefined }).user, 'unknown');
	});
});

test('d9f85b3c t4 — the real lookups do not throw outside a git repo', () => {
	withRepo(repo => {
		const h = header(repo, STANDALONE, {});
		assert.ok(h.user.length > 0);
	});
});

test('d9f85b3c t4 — the date comes from the injected clock as YYYY-MM-DD HH:mm local time', () => {
	withRepo(repo => assert.equal(header(repo).date, '2026-10-11 09:05'));
	assert.equal(formatDate(new Date(2027, 0, 2, 23, 59)), '2027-01-02 23:59');
});

test('d9f85b3c t4 — the source doc is the artifact id linked to its markdown beside the companion', () => {
	withRepo(repo => assert.deepEqual(header(repo).sourceDoc, { id: `LLD-${HASH}-S001`, href: './LLD.md' }));
});

// ---------------------------------------------------------------------------
// unit: header: malformed createdAt/epicHash/storyId -> plain id fallback, no throw
// ---------------------------------------------------------------------------

test('d9f85b3c t4 — a well-formed source gets the hierarchical story or epic id', () => {
	withRepo(repo => {
		assert.equal(header(repo).workItemId, 'E20261011d9f85b3c:S001');
		assert.equal(header(repo, { kind: 'HLD', epicHash: HASH, anchorCreatedAt: CREATED }).workItemId, 'E20261011d9f85b3c');
	});
});

test('d9f85b3c t4 — a malformed createdAt, epicHash or storyId falls back to the plain id without throwing', () => {
	withRepo(repo => {
		assert.equal(header(repo, { ...STANDALONE, anchorCreatedAt: 'not a date' } as CompanionHeaderSource).workItemId, 'S001');
		assert.equal(header(repo, { ...STANDALONE, epicHash: 'xyz' } as CompanionHeaderSource).workItemId, 'S001');
		assert.equal(header(repo, { ...STANDALONE, storyId: 'draft' } as CompanionHeaderSource).workItemId, 'draft');
		assert.equal(header(repo, { kind: 'HLD', epicHash: 'xyz', anchorCreatedAt: '' }).workItemId, 'xyz');
	});
});

// ---------------------------------------------------------------------------
// unit: header contextLine: HLD / epic-Story LLD / standalone LLD / placement-only
// ---------------------------------------------------------------------------

test('d9f85b3c t4 — an HLD context line is the Epic plus the first sentence of its summary', () => {
	withRepo(repo => assert.equal(
		header(repo, { kind: 'HLD', epicHash: HASH, epicSlug: 'order-intake', anchorCreatedAt: CREATED, summary: 'Orders flow in through one queue. Then more detail.' }).contextLine,
		'Epic order-intake · Orders flow in through one queue.',
	));
});

test("d9f85b3c t4 — an epic Story's LLD context line is its placement, title and value", () => {
	withRepo(repo => assert.equal(
		header(repo, { kind: 'LLD-epic', epicHash: HASH, epicSlug: 'order-intake', storyId: 's2', anchorCreatedAt: CREATED, storyTitle: 'Validate orders', userValue: 'Bad orders are caught early. Fewer refunds.' }).contextLine,
		'Story S002 of Epic order-intake · Validate orders — Bad orders are caught early.',
	));
});

test("d9f85b3c t4 — a standalone LLD's context line is the story title and the LLD summary's first sentence", () => {
	withRepo(repo => assert.equal(
		header(repo, { ...STANDALONE, storyTitle: 'Rework companion pages', summary: 'Every companion page shares one template.\nIt has four parts.' } as CompanionHeaderSource).contextLine,
		'Standalone story S001 · Rework companion pages — Every companion page shares one template.',
	));
});

test('d9f85b3c t4 — with nothing to say, the context line is placement only', () => {
	withRepo(repo => {
		assert.equal(header(repo).contextLine, 'Standalone story S001');
		assert.equal(header(repo, { kind: 'HLD', epicHash: HASH, anchorCreatedAt: CREATED, summary: '  ' }).contextLine, `Epic ${HASH}`);
		assert.equal(header(repo, { kind: 'LLD-epic', epicHash: HASH, epicSlug: 'e', storyId: 's1', anchorCreatedAt: CREATED }).contextLine, 'Story S001 of Epic e');
	});
});

// ---------------------------------------------------------------------------
// Story 8d4b90c9/S001 t3 — the lookup the header and a saved comment share
// ---------------------------------------------------------------------------

test('reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader\'s user is unchanged for the same inputs', () => {
	withRepo(repo => {
		const cases: readonly { readonly deps: CompanionHeaderDeps; readonly name: string; readonly source: 'git' | 'os' | 'unknown' }[] = [
			{ deps: PINNED, name: 'Subho Ghosh', source: 'git' },
			{ deps: { ...PINNED, gitUserName: () => undefined }, name: 'subho', source: 'os' },
			{ deps: { ...PINNED, gitUserName: () => '  \n' }, name: 'subho', source: 'os' },
			{ deps: { ...PINNED, gitUserName: () => undefined, osUserName: () => ' subho \n' }, name: 'subho', source: 'os' },
			{ deps: { ...PINNED, gitUserName: () => undefined, osUserName: () => undefined }, name: 'unknown', source: 'unknown' },
			{ deps: { ...PINNED, gitUserName: () => '', osUserName: () => '' }, name: 'unknown', source: 'unknown' },
		];
		for (const c of cases) {
			assert.deepEqual(resolveReviewer(repo, c.deps), { name: c.name, source: c.source });
			// The header's user is the same name, as it was before the lookup was extracted.
			assert.equal(header(repo, STANDALONE, c.deps).user, c.name);
		}
		// The git lookup is asked about this repo.
		let asked: string | undefined;
		resolveReviewer(repo, { gitUserName: r => { asked = r; return 'A'; } });
		assert.equal(asked, repo);
		// With no seams it reads the machine and never throws.
		const real = resolveReviewer(repo);
		assert.ok(real.name.length > 0);
		assert.ok(['git', 'os', 'unknown'].includes(real.source));
	});
});
