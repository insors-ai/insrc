/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-c00559b7 S001/t1 — an LLD heads a work item that has no DEF and no ISSUE.
 *
 * A standalone feature writes only an LLD (then a PLAN), so before this fix
 * readEpicDefinitionCore found no head for it: the tracker resolver could not
 * see the work item and the build tool refused every task of its plan. These
 * tests pin the head order DEF -> ISSUE -> lowest-ordinal LLD, and the placement
 * a legacy LLD with no `standalone` flag now gets.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/lld-head.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compareStoryOrdinal, inheritedStoryStandalone, readEpicDefinitionCore, storyRecordFolderArgs, writeAtomic } from '../storage.js';
import { buildRecordPathsFor } from '../runners/build/standalone-record.js';
import { testRecordPaths } from '../runners/build/test-record.js';

const HASH         = '5e6f7a8b9c0d1e2f';
const DEF_MADE     = '2026-09-01T08:00:00.000Z';
const ISSUE_MADE   = '2026-09-02T08:00:00.000Z';
const LLD_MADE     = '2026-09-03T08:00:00.000Z';
const LLD_ANCHOR   = '2026-09-02T23:00:00.000Z';
const TRACKER      = { epicRef: '#12', storyRefs: { S001: '#13' } };

function repo(): { repo: string; seed: (id: string, meta: Record<string, unknown>) => void; cleanup: () => void } {
	const r = mkdtempSync(join(tmpdir(), 'insrc-lld-head-'));
	return {
		repo:    r,
		seed:    (id, meta) => writeAtomic(join(r, '.insrc/artifacts', `${id}.json`), JSON.stringify({ meta, body: {} })),
		cleanup: () => rmSync(r, { recursive: true, force: true }),
	};
}

// ---------------------------------------------------------------------------
// unit: readEpicDefinitionCore head precedence, LLD fallback, standalone:true and tracker
// ---------------------------------------------------------------------------

test('c00559b7 — a DEF beats an ISSUE and an LLD, and reports headKind DEF with its tracker', () => {
	const r = repo();
	try {
		r.seed(`DEF-${HASH}`,        { createdAt: DEF_MADE, epicSlug: 'the-def', tracker: TRACKER });
		r.seed(`ISSUE-${HASH}`,      { createdAt: ISSUE_MADE, epicSlug: 'the-issue', standalone: true });
		r.seed(`LLD-${HASH}-S001`,   { createdAt: LLD_MADE, epicSlug: 'the-lld', standalone: true });
		const core = readEpicDefinitionCore(r.repo, HASH);
		assert.equal(core.headKind, 'DEF');
		assert.equal(core.epicSlug, 'the-def');
		assert.equal(core.createdAt, DEF_MADE);
		assert.equal(core.standalone, undefined, 'an epic DEF must not acquire a standalone flag');
		assert.deepEqual(core.tracker, TRACKER, 'the DEF\'s tracker block rides along');
	} finally { r.cleanup(); }
});

test('c00559b7 — an ISSUE beats an LLD, keeps its own fields and carries its tracker', () => {
	const r = repo();
	try {
		r.seed(`ISSUE-${HASH}`,    { createdAt: ISSUE_MADE, epicSlug: 'the-issue', standalone: true, tracker: TRACKER });
		r.seed(`LLD-${HASH}-S001`, { createdAt: LLD_MADE, epicSlug: 'the-lld', standalone: true });
		const core = readEpicDefinitionCore(r.repo, HASH);
		assert.deepEqual(core, { createdAt: ISSUE_MADE, epicSlug: 'the-issue', standalone: true, tracker: TRACKER, headKind: 'ISSUE' });
	} finally { r.cleanup(); }
});

test('c00559b7 — a lone flagged LLD heads its work item, anchored on its epicCreatedAt', () => {
	const r = repo();
	try {
		r.seed(`LLD-${HASH}-S001`, { createdAt: LLD_MADE, epicCreatedAt: LLD_ANCHOR, epicSlug: 'the-lld', standalone: true });
		const core = readEpicDefinitionCore(r.repo, HASH);
		assert.equal(core.headKind, 'LLD');
		assert.equal(core.epicSlug, 'the-lld');
		assert.equal(core.standalone, true);
		assert.equal(core.createdAt, LLD_ANCHOR, 'the anchor its own folder is keyed on, not its bare createdAt');
	} finally { r.cleanup(); }
});

test('c00559b7 — a legacy UNFLAGGED lone LLD still heads its work item and reports standalone: true', () => {
	const r = repo();
	try {
		r.seed(`LLD-${HASH}-S001`, { createdAt: LLD_MADE, epicSlug: 'the-lld' });
		const core = readEpicDefinitionCore(r.repo, HASH);
		assert.equal(core.headKind, 'LLD');
		assert.equal(core.standalone, true, 'a work item with no DEF is never an epic');
		assert.equal(core.createdAt, LLD_MADE, 'with no stamp the LLD\'s createdAt is the anchor');
	} finally { r.cleanup(); }
});

test('c00559b7 — the lowest-ordinal Story\'s LLD wins, compared numerically', () => {
	const r = repo();
	try {
		r.seed(`LLD-${HASH}-S010`, { createdAt: LLD_MADE, epicSlug: 'story-ten' });
		r.seed(`LLD-${HASH}-S002`, { createdAt: LLD_MADE, epicSlug: 'story-two' });
		r.seed(`LLD-${HASH}-S009`, { createdAt: LLD_MADE, epicSlug: 'story-nine' });
		assert.equal(readEpicDefinitionCore(r.repo, HASH).epicSlug, 'story-two');
		// Another work item's LLD is never consulted.
		r.seed(`LLD-ffffffffffffffff-S001`, { createdAt: LLD_MADE, epicSlug: 'someone-else' });
		assert.equal(readEpicDefinitionCore(r.repo, HASH).epicSlug, 'story-two');
	} finally { r.cleanup(); }
});

test('c00559b7 — a malformed lowest-ordinal LLD is no head: the result is {}', () => {
	const r = repo();
	try {
		writeAtomic(join(r.repo, '.insrc/artifacts', `LLD-${HASH}-S001.json`), '{ not json');
		r.seed(`LLD-${HASH}-S002`, { createdAt: LLD_MADE, epicSlug: 'story-two' });
		assert.deepEqual(readEpicDefinitionCore(r.repo, HASH), {});
		// And an LLD that parses but carries none of the head fields is no head either.
		r.seed(`LLD-${HASH}-S001`, { workflow: 'design.story' });
		assert.deepEqual(readEpicDefinitionCore(r.repo, HASH), {});
	} finally { r.cleanup(); }
});

test('c00559b7 — no artifacts at all, or no artifacts dir, is still {}', () => {
	const r = repo();
	try {
		assert.deepEqual(readEpicDefinitionCore(r.repo, HASH), {});
		assert.deepEqual(readEpicDefinitionCore(join(r.repo, 'missing'), HASH), {});
	} finally { r.cleanup(); }
});

test('c00559b7 — a non-object tracker is ignored rather than passed through', () => {
	const r = repo();
	try {
		r.seed(`DEF-${HASH}`, { createdAt: DEF_MADE, epicSlug: 'the-def', tracker: 'nope' });
		assert.equal(readEpicDefinitionCore(r.repo, HASH).tracker, undefined);
	} finally { r.cleanup(); }
});

// ---------------------------------------------------------------------------
// integration: legacy unflagged LLD-only item: BUILD/TESTS placed under docs/standalone
// ---------------------------------------------------------------------------

test('c00559b7 — a legacy unflagged LLD-only item files its BUILD and TESTS records under docs/standalone, in the LLD\'s folder', () => {
	const r = repo();
	try {
		r.seed(`LLD-${HASH}-S001`, { createdAt: LLD_MADE, epicSlug: 'legacy-feature' });
		const folder = join(r.repo, 'docs/standalone', `legacy-feature-E20260903${HASH.slice(0, 8)}`, 'S001');

		assert.equal(inheritedStoryStandalone(r.repo, HASH, 'S001'), true);
		assert.deepEqual(
			storyRecordFolderArgs(r.repo, HASH, 'S001', { ownCreatedAt: '2026-10-11T00:00:00.000Z' }),
			{ createdAtISO: LLD_MADE, workItemKind: 'standalone', epicSlug: 'legacy-feature' },
		);

		// The BUILD record exactly as the shared validate persist writes it: no
		// standalone key, created today.
		const build = buildRecordPathsFor(r.repo, {
			meta: { workflow: 'build', epicHash: HASH, storyId: 'S001', createdAt: '2026-10-11T00:00:00.000Z' },
			body: { tasks: [] },
		} as never);
		assert.equal(build.md, join(folder, 'BUILD.md'));

		const tests = testRecordPaths(r.repo, HASH, 'S001', { now: '2026-10-11T00:00:00.000Z' });
		assert.equal(tests.md, join(folder, 'TESTS.md'));
	} finally { r.cleanup(); }
});

test('c00559b7 — compareStoryOrdinal orders by ordinal, then by id, for both id spellings', () => {
	assert.deepEqual(['S010', 's2', 'S002', 'S001', 's10'].sort(compareStoryOrdinal), ['S001', 'S002', 's2', 'S010', 's10']);
});

test('c00559b7 — compareStoryOrdinal uses the canonical story-id parse: a non-story id sorts last', () => {
	assert.deepEqual(['S002', 'draft', 'S001x', 's1'].sort(compareStoryOrdinal), ['s1', 'S002', 'draft', 'S001x']);
});
