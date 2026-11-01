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

const STANDALONE: CompanionHeaderSource = { kind: 'LLD-standalone', epicHash: HASH, storyId: 's1', anchorCreatedAt: CREATED };

async function withRepo<T>(fn: (repo: string) => T | Promise<T>, config?: string): Promise<T> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-header-proj-'));
	try {
		if (config !== undefined) {
			mkdirSync(join(repo, '.insrc'), { recursive: true });
			writeFileSync(join(repo, '.insrc', 'config.json'), config);
		}
		return await fn(repo);
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

async function header(repo: string, source: CompanionHeaderSource = STANDALONE, deps: CompanionHeaderDeps = PINNED) {
	return (await resolveCompanionHeader({ repoPath: repo, source, artifactId: `LLD-${HASH}-s1`, sourceMdPath: join(repo, 'docs/standalone/x/S001/LLD.md') }, deps));
}

// ---------------------------------------------------------------------------
// unit: header: projectName override / basename fallback / malformed config ignored
// ---------------------------------------------------------------------------

test('d9f85b3c t4 — projectName comes from .insrc/config.json when set', async () => {
	(await withRepo(async repo => assert.equal((await header(repo)).projectName, 'Insrc Backend'), JSON.stringify({ projectName: '  Insrc Backend ', ignore: [] })));
});

test('d9f85b3c t4 — projectName falls back to the repo folder name with no config, or no / an empty / a non-string projectName', async () => {
	(await withRepo(async repo => assert.equal((await header(repo)).projectName, basename(repo))));
	(await withRepo(async repo => assert.equal((await header(repo)).projectName, basename(repo)), JSON.stringify({ ignore: ['x'] })));
	(await withRepo(async repo => assert.equal((await header(repo)).projectName, basename(repo)), JSON.stringify({ projectName: '   ' })));
	(await withRepo(async repo => assert.equal((await header(repo)).projectName, basename(repo)), JSON.stringify({ projectName: 42 })));
});

test('d9f85b3c t4 — a malformed config is ignored, not thrown', async () => {
	(await withRepo(async repo => {
		assert.doesNotThrow(async () => (await header(repo)));
		assert.equal((await header(repo)).projectName, basename(repo));
	}, '{ not json'));
});

// ---------------------------------------------------------------------------
// unit: header: git user / OS fallback / 'unknown'; injected clock format
// ---------------------------------------------------------------------------

test('d9f85b3c t4 — user is git user.name, else the OS login, else unknown', async () => {
	(await withRepo(async repo => {
		assert.equal((await header(repo)).user, 'Subho Ghosh', 'git, trimmed');
		assert.equal((await header(repo, STANDALONE, { ...PINNED, gitUserName: () => undefined })).user, 'subho');
		assert.equal((await header(repo, STANDALONE, { ...PINNED, gitUserName: () => '  ' })).user, 'subho', 'a blank git name counts as unset');
		assert.equal((await header(repo, STANDALONE, { ...PINNED, gitUserName: () => undefined, osUserName: () => undefined })).user, 'unknown');
	}));
});

test('d9f85b3c t4 — the real lookups do not throw outside a git repo', async () => {
	(await withRepo(async repo => {
		const h = (await header(repo, STANDALONE, {}));
		assert.ok(h.user.length > 0);
	}));
});

test('d9f85b3c t4 — the date comes from the injected clock as YYYY-MM-DD HH:mm local time', async () => {
	(await withRepo(async repo => assert.equal((await header(repo)).date, '2026-10-11 09:05')));
	assert.equal(formatDate(new Date(2027, 0, 2, 23, 59)), '2027-01-02 23:59');
});

test('d9f85b3c t4 — the source doc is the artifact id linked to its markdown beside the companion', async () => {
	(await withRepo(async repo => assert.deepEqual((await header(repo)).sourceDoc, { id: `LLD-${HASH}-s1`, href: './LLD.md' })));
});

// ---------------------------------------------------------------------------
// unit: header: malformed createdAt/epicHash/storyId -> plain id fallback, no throw
// ---------------------------------------------------------------------------

test('d9f85b3c t4 — a well-formed source gets the story or epic artifact id', async () => {
	(await withRepo(async repo => {
		assert.equal((await header(repo)).workItemId, `STORY-${HASH}-s1`);
		assert.equal((await header(repo, { kind: 'HLD', epicHash: HASH, anchorCreatedAt: CREATED })).workItemId, `EPIC-${HASH}`);
	}));
});

test('d9f85b3c t4 — a malformed epicHash or storyId falls back to the plain id without throwing, and the anchor date is not needed', async () => {
	(await withRepo(async repo => {
		assert.equal((await header(repo, { ...STANDALONE, anchorCreatedAt: 'not a date' } as CompanionHeaderSource)).workItemId, `STORY-${HASH}-s1`);
		assert.equal((await header(repo, { ...STANDALONE, epicHash: 'xyz' } as CompanionHeaderSource)).workItemId, 's1');
		assert.equal((await header(repo, { ...STANDALONE, storyId: 'draft' } as CompanionHeaderSource)).workItemId, 'draft');
		assert.equal((await header(repo, { kind: 'HLD', epicHash: 'xyz', anchorCreatedAt: '' })).workItemId, 'xyz');
	}));
});

// ---------------------------------------------------------------------------
// unit: header contextLine: HLD / epic-Story LLD / standalone LLD / placement-only
// ---------------------------------------------------------------------------

test('d9f85b3c t4 — an HLD context line is the Epic plus the first sentence of its summary', async () => {
	(await withRepo(async repo => assert.equal(
		(await header(repo, { kind: 'HLD', epicHash: HASH, epicSlug: 'order-intake', anchorCreatedAt: CREATED, summary: 'Orders flow in through one queue. Then more detail.' })).contextLine,
		'Epic order-intake · Orders flow in through one queue.',
	)));
});

test("d9f85b3c t4 — an epic Story's LLD context line is its placement, title and value", async () => {
	(await withRepo(async repo => assert.equal(
		(await header(repo, { kind: 'LLD-epic', epicHash: HASH, epicSlug: 'order-intake', storyId: 's2', anchorCreatedAt: CREATED, storyTitle: 'Validate orders', userValue: 'Bad orders are caught early. Fewer refunds.' })).contextLine,
		'Story S002 of Epic order-intake · Validate orders — Bad orders are caught early.',
	)));
});

test("d9f85b3c t4 — a standalone LLD's context line is the story title and the LLD summary's first sentence", async () => {
	(await withRepo(async repo => assert.equal(
		(await header(repo, { ...STANDALONE, storyTitle: 'Rework companion pages', summary: 'Every companion page shares one template.\nIt has four parts.' } as CompanionHeaderSource)).contextLine,
		'Standalone story S001 · Rework companion pages — Every companion page shares one template.',
	)));
});

test('d9f85b3c t4 — with nothing to say, the context line is placement only', async () => {
	(await withRepo(async repo => {
		assert.equal((await header(repo)).contextLine, 'Standalone story S001');
		assert.equal((await header(repo, { kind: 'HLD', epicHash: HASH, anchorCreatedAt: CREATED, summary: '  ' })).contextLine, `Epic ${HASH}`);
		assert.equal((await header(repo, { kind: 'LLD-epic', epicHash: HASH, epicSlug: 'e', storyId: 's1', anchorCreatedAt: CREATED })).contextLine, 'Story S001 of Epic e');
	}));
});

// ---------------------------------------------------------------------------
// Story 8d4b90c9/S001 t3 — the lookup the header and a saved comment share
// ---------------------------------------------------------------------------

test('reviewer: resolveReviewer gives the trimmed git name with source git, else the OS login with source os, else unknown, and resolveCompanionHeader\'s user is unchanged for the same inputs', async () => {
	(await withRepo(async repo => {
		const cases: readonly { readonly deps: CompanionHeaderDeps; readonly name: string; readonly source: 'git' | 'os' | 'unknown' }[] = [
			{ deps: PINNED, name: 'Subho Ghosh', source: 'git' },
			{ deps: { ...PINNED, gitUserName: () => undefined }, name: 'subho', source: 'os' },
			{ deps: { ...PINNED, gitUserName: () => '  \n' }, name: 'subho', source: 'os' },
			{ deps: { ...PINNED, gitUserName: () => undefined, osUserName: () => ' subho \n' }, name: 'subho', source: 'os' },
			{ deps: { ...PINNED, gitUserName: () => undefined, osUserName: () => undefined }, name: 'unknown', source: 'unknown' },
			{ deps: { ...PINNED, gitUserName: () => '', osUserName: () => '' }, name: 'unknown', source: 'unknown' },
		];
		for (const c of cases) {
			assert.deepEqual((await resolveReviewer(repo, c.deps)), { name: c.name, source: c.source });
			// The header's user is the same name, as it was before the lookup was extracted.
			assert.equal((await header(repo, STANDALONE, c.deps)).user, c.name);
		}
		// The git lookup is asked about this repo.
		let asked: string | undefined;
		await resolveReviewer(repo, { gitUserName: r => { asked = r; return 'A'; } });
		assert.equal(asked, repo);
		// With no seams it reads the machine and never throws.
		const real = await resolveReviewer(repo);
		assert.ok(real.name.length > 0);
		assert.ok(['git', 'os', 'unknown'].includes(real.source));
	}));
});
