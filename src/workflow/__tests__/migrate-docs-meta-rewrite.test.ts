/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-7d42920d S001 — the docs migration realigns each artifact's stored label,
 * anchor and standalone flag with the work item it was moved into.
 *
 * UNIT over seeded mkdtemp fixtures for planMigration's metaRewrites; INTEGRATION
 * over a `git init` tmp repo for applyMigration. Seeding mirrors
 * migrate-docs-tree.test.ts.
 *
 *   npx tsx --test src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import { epicShortName, type DefineArtifact } from '../artifacts/define.js';
import { hldShortName, type HldArtifact } from '../artifacts/hld.js';
import { planMigration, type MetaRewrite } from '../migrate-docs-tree.js';
import { artifactIdMarker } from '../storage.js';

const H      = 'a1b2c3d4e5f60718';            // hash8 'a1b2c3d4'
const ANCHOR = '2026-10-11T09:00:00.000Z';    // -> E20261011
const SEG    = 'E20261011a1b2c3d4';
const LABEL  = 'the-lld-label';
const FOLDER = `docs/standalone/${LABEL}-${SEG}`;

function newRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-meta-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	return repo;
}
function seedJson(repo: string, id: string, meta: Record<string, unknown>, body: Record<string, unknown> = {}): void {
	writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify({ meta, body }, null, 2) + '\n');
}
function seedMd(repo: string, rel: string, id: string | null, body = 'x'): void {
	const abs = join(repo, rel);
	mkdirSync(join(abs, '..'), { recursive: true });
	writeFileSync(abs, (id !== null ? artifactIdMarker(id) + '\n\n' : '') + body);
}
/** The standalone head LLD, already in its own folder and consistent. */
function seedHeadLld(repo: string, meta: Record<string, unknown> = { standalone: true }): void {
	seedJson(repo, `LLD-${H}-S001`, { createdAt: ANCHOR, epicHash: H, epicSlug: LABEL, storyId: 'S001', ...meta });
	seedMd(repo, `${FOLDER}/S001/LLD.md`, `LLD-${H}-S001`, `**Epic:** \`${LABEL}\`\n`);
}
function rewriteOf(rewrites: readonly MetaRewrite[], id: string): MetaRewrite | undefined {
	return rewrites.find(r => r.artifactId === id);
}
/** Every file under docs/ and .insrc/, by repo-relative path. */
function fingerprint(repo: string): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const abs = join(dir, name);
			if (statSync(abs).isDirectory()) walk(abs);
			else out[relative(repo, abs)] = readFileSync(abs, 'utf8');
		}
	};
	walk(join(repo, 'docs'));
	walk(join(repo, '.insrc'));
	return out;
}

// ---------------------------------------------------------------------------
// t1 — the plan shape and the exported short-name helpers
// ---------------------------------------------------------------------------

test('t1 — a repo with no artifact store plans an empty metaRewrites list', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-meta-'));
	try {
		const plan = planMigration(repo);
		assert.deepEqual(plan.metaRewrites, []);
		assert.deepEqual(plan.moves, []);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('t1 — epicShortName and hldShortName: the slug when set, else the first sentence / first line', () => {
	const def = (epicSlug: string | undefined) =>
		({ meta: epicSlug === undefined ? {} : { epicSlug }, body: { problem: 'Folders drift. Labels too.' } }) as unknown as DefineArtifact;
	const hld = (epicSlug: string | undefined) =>
		({ meta: epicSlug === undefined ? {} : { epicSlug }, body: { frameworkSummary: 'One folder per item. More detail.' } }) as unknown as HldArtifact;
	assert.equal(epicShortName(def('the-label')), 'the-label');
	assert.equal(epicShortName(def(undefined)), 'Folders drift.');
	assert.equal(hldShortName(hld('the-label')), 'the-label');
	assert.equal(hldShortName(hld(undefined)), 'One folder per item');
});

// ---------------------------------------------------------------------------
// t2 — planMigration plans the stored fields that disagree with the work item
// ---------------------------------------------------------------------------

test('t2 — a moved PLAN whose stored label and anchor differ from its LLD head gets one rewrite setting both', () => {
	const repo = newRepo();
	try {
		seedHeadLld(repo);
		// The plan stage named its own folder, on its own (later) day.
		seedJson(repo, `PLAN-${H}-S001`, { createdAt: '2026-10-12T10:00:00.000Z', epicCreatedAt: '2026-10-12T10:00:00.000Z', epicHash: H, epicSlug: 'a-plan-label', storyId: 'S001', standalone: true });
		seedMd(repo, 'docs/standalone/a-plan-label-E20261012a1b2c3d4/S001/PLAN.md', `PLAN-${H}-S001`);

		const plan = planMigration(repo);
		assert.deepEqual(plan.unmappable, []);
		assert.equal(plan.moves.filter(m => m.kind === 'PLAN').length, 1);
		assert.equal(plan.metaRewrites.length, 1, JSON.stringify(plan.metaRewrites));
		const rw = rewriteOf(plan.metaRewrites, `PLAN-${H}-S001`)!;
		assert.deepEqual(rw.set, { epicSlug: LABEL, epicCreatedAt: ANCHOR });
		assert.equal(rw.groupHash, H);
		assert.equal(rw.jsonPath, join(repo, '.insrc', 'artifacts', `PLAN-${H}-S001.json`));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — an already-placed member with stale metadata (no move) still gets a rewrite', () => {
	const repo = newRepo();
	try {
		seedHeadLld(repo);
		// Already in the LLD's folder (moved by hand), meta still names the old one.
		seedJson(repo, `PLAN-${H}-S001`, { createdAt: '2026-10-12T10:00:00.000Z', epicCreatedAt: '2026-10-12T10:00:00.000Z', epicHash: H, epicSlug: 'a-plan-label', storyId: 'S001', standalone: true });
		seedMd(repo, `${FOLDER}/S001/PLAN.md`, `PLAN-${H}-S001`);

		const plan = planMigration(repo);
		assert.deepEqual(plan.moves, []);
		assert.deepEqual(rewriteOf(plan.metaRewrites, `PLAN-${H}-S001`)?.set, { epicSlug: LABEL, epicCreatedAt: ANCHOR });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — a hash-fallback group gets no label rewrite; anchor and standalone rewrites are still planned', () => {
	const repo = newRepo();
	try {
		// No member carries a slug and nothing is flat, so the folder is named by the hash.
		seedJson(repo, `LLD-${H}-S001`, { createdAt: ANCHOR, epicHash: H, storyId: 'S001', standalone: true });
		seedMd(repo, `docs/standalone/${H}-${SEG}/S001/LLD.md`, `LLD-${H}-S001`);
		seedJson(repo, `BUILD-${H}-S001`, { createdAt: '2026-10-13T08:00:00.000Z', epicHash: H, storyId: 'S001' });
		seedMd(repo, `docs/standalone/${H}-${SEG}/S001/BUILD.md`, `BUILD-${H}-S001`);

		const plan = planMigration(repo);
		assert.deepEqual(plan.unmappable, []);
		assert.equal(rewriteOf(plan.metaRewrites, `LLD-${H}-S001`), undefined);
		assert.deepEqual(rewriteOf(plan.metaRewrites, `BUILD-${H}-S001`)?.set, { epicCreatedAt: ANCHOR, standalone: true });
		assert.ok(plan.metaRewrites.every(r => r.set.epicSlug === undefined));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — a legacy unflagged head LLD in a standalone group gets only standalone: true; false is never planned', () => {
	const repo = newRepo();
	try {
		seedHeadLld(repo, {});   // no flag — written before standalone was stamped
		const plan = planMigration(repo);
		assert.deepEqual(rewriteOf(plan.metaRewrites, `LLD-${H}-S001`)?.set, { standalone: true });

		// An epic: DEF-headed, members stored with standalone: false. Nothing is
		// planned for the flag, in either direction.
		const epic = newRepo();
		try {
			const E = '0f1e2d3c4b5a6978';
			seedJson(epic, `DEF-${E}`, { createdAt: ANCHOR, epicHash: E, epicSlug: 'an-epic' });
			seedMd(epic, `docs/epics/an-epic-E202610110f1e2d3c/DEF.md`, `DEF-${E}`);
			seedJson(epic, `BUILD-${E}-S001`, { createdAt: ANCHOR, epicHash: E, epicSlug: 'an-epic', storyId: 'S001', standalone: false });
			seedMd(epic, `docs/epics/an-epic-E202610110f1e2d3c/S001/BUILD.md`, `BUILD-${E}-S001`);
			const epicPlan = planMigration(epic);
			assert.deepEqual(epicPlan.unmappable, []);
			assert.deepEqual(epicPlan.metaRewrites, []);
		} finally { rmSync(epic, { recursive: true, force: true }); }
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — a SPEC with no stored standalone flag in a standalone group gets standalone: true', () => {
	const repo = newRepo();
	try {
		const S = '9988776655443322';
		// The planner treats every SPEC as standalone in memory; its stored meta has no flag.
		seedJson(repo, `SPEC-${S}`, { createdAt: ANCHOR, specHash: S, epicSlug: 'a-spec' });
		seedMd(repo, 'docs/specs/SPEC-a-spec.md', `SPEC-${S}`);
		const plan = planMigration(repo);
		assert.deepEqual(plan.unmappable, []);
		assert.deepEqual(rewriteOf(plan.metaRewrites, `SPEC-${S}`)?.set, { standalone: true });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — a same-day unstamped BUILD plans no anchor rewrite; a later-day unstamped BUILD plans epicCreatedAt = group anchor', () => {
	const repo = newRepo();
	try {
		seedHeadLld(repo);
		seedHeadLldStory2(repo);
		// Hours after the LLD, the same day: already resolves the LLD's folder.
		seedJson(repo, `BUILD-${H}-S001`, { createdAt: '2026-10-11T22:30:00.000Z', epicHash: H, epicSlug: LABEL, storyId: 'S001', standalone: true });
		seedMd(repo, `${FOLDER}/S001/BUILD.md`, `BUILD-${H}-S001`);
		// The next day, no stamp: deriveMdPath would resolve E20261012.
		seedJson(repo, `BUILD-${H}-S002`, { createdAt: '2026-10-12T01:00:00.000Z', epicHash: H, epicSlug: LABEL, storyId: 'S002', standalone: true });
		seedMd(repo, `${FOLDER}/S002/BUILD.md`, `BUILD-${H}-S002`);

		const plan = planMigration(repo);
		assert.deepEqual(plan.unmappable, []);
		assert.equal(rewriteOf(plan.metaRewrites, `BUILD-${H}-S001`), undefined);
		assert.deepEqual(rewriteOf(plan.metaRewrites, `BUILD-${H}-S002`)?.set, { epicCreatedAt: ANCHOR });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — a consistent repo plans no metaRewrites, and planning leaves docs and .insrc byte-identical', () => {
	const repo = newRepo();
	try {
		seedHeadLld(repo);
		seedJson(repo, `PLAN-${H}-S001`, { createdAt: '2026-10-11T12:00:00.000Z', epicHash: H, epicSlug: LABEL, storyId: 'S001', standalone: true });
		seedMd(repo, `${FOLDER}/S001/PLAN.md`, `PLAN-${H}-S001`, `**Epic:** \`${LABEL}\`\n`);
		const before = fingerprint(repo);
		const plan = planMigration(repo);
		assert.deepEqual(plan.metaRewrites, []);
		assert.deepEqual(plan.moves, []);
		assert.deepEqual(fingerprint(repo), before);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

/** A second Story's LLD in the same work item, so S002 records have a folder. */
function seedHeadLldStory2(repo: string): void {
	seedJson(repo, `LLD-${H}-S002`, { createdAt: ANCHOR, epicCreatedAt: ANCHOR, epicHash: H, epicSlug: LABEL, storyId: 'S002', standalone: true });
	seedMd(repo, `${FOLDER}/S002/LLD.md`, `LLD-${H}-S002`);
}

// ---------------------------------------------------------------------------
// t3 — the md label lines and companion notes of a relabelled member
// ---------------------------------------------------------------------------

test("t3 — PLAN and LLD get the '**Epic:**' edit at the post-move path, including an old '`undefined`' line", () => {
	const repo = newRepo();
	try {
		seedHeadLld(repo);
		seedJson(repo, `PLAN-${H}-S001`, { createdAt: ANCHOR, epicHash: H, epicSlug: 'a-plan-label', storyId: 'S001', standalone: true });
		seedMd(repo, 'docs/standalone/a-plan-label-E20261011a1b2c3d4/S001/PLAN.md', `PLAN-${H}-S001`, '**Epic:** `a-plan-label`\n');
		// A second Story's LLD written with no slug: its renderer printed `undefined`.
		seedJson(repo, `LLD-${H}-S002`, { createdAt: ANCHOR, epicHash: H, storyId: 'S002', standalone: true });
		seedMd(repo, `${FOLDER}/S002/LLD.md`, `LLD-${H}-S002`, '**Epic:** `undefined`\n');

		const plan = planMigration(repo);
		assert.deepEqual(plan.unmappable, []);
		const planTo = plan.moves.find(m => m.kind === 'PLAN')!.to;
		assert.deepEqual(rewriteOf(plan.metaRewrites, `PLAN-${H}-S001`)?.mdEdits, [
			{ file: planTo, from: '**Epic:** `a-plan-label`', to: `**Epic:** \`${LABEL}\`` },
		]);
		assert.deepEqual(rewriteOf(plan.metaRewrites, `LLD-${H}-S002`)?.mdEdits, [
			{ file: join(repo, FOLDER, 'S002', 'LLD.md'), from: '**Epic:** `undefined`', to: `**Epic:** \`${LABEL}\`` },
		]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

const E      = '0f1e2d3c4b5a6978';           // hash8 '0f1e2d3c'
const E_ROOT = 'docs/epics/the-label-E202610110f1e2d3c';

/** An epic whose label comes from its ISSUE, with a slug-less DEF and members
 *  that still carry an old label, all filed in a stray folder. */
function seedRelabelledEpic(repo: string, hldBody: Record<string, unknown> = {}): void {
	const stray = 'docs/epics/old-label-E202610110f1e2d3c';
	seedJson(repo, `DEF-${E}`, { createdAt: ANCHOR, epicHash: E }, { problem: 'Folders drift apart. More words.' });
	seedMd(repo, `${stray}/DEF.md`, `DEF-${E}`, '# Epic: Folders drift apart.\n');
	seedJson(repo, `ISSUE-${E}`, { createdAt: ANCHOR, epicHash: E, epicSlug: 'the-label' });
	seedMd(repo, `${E_ROOT}/ISSUE.md`, `ISSUE-${E}`);
	seedJson(repo, `HLD-${E}`, { createdAt: ANCHOR, epicHash: E, epicSlug: 'old-label' }, { frameworkSummary: 'One folder.', ...hldBody });
	seedMd(repo, `${stray}/HLD.md`, `HLD-${E}`, '# HLD: old-label\n');
	seedJson(repo, `EXT-${E}-S001`, { createdAt: ANCHOR, epicHash: E, epicSlug: 'old-label', storyId: 'S001' }, { addedStory: { title: 'Add a thing' } });
	seedMd(repo, `${stray}/S001/EXT.md`, `EXT-${E}-S001`);
	for (const kind of ['BUILD', 'CR', 'TESTS'] as const) {
		seedJson(repo, `${kind}-${E}-S001`, { createdAt: ANCHOR, epicHash: E, epicSlug: 'old-label', storyId: 'S001' });
		seedMd(repo, `${stray}/S001/${kind}.md`, `${kind}-${E}-S001`);
	}
}

test('t3 — BUILD/CR/TESTS get JSON-only rewrites; EXT gets its two title-line edits; DEF and HLD get their H1 edit', () => {
	const repo = newRepo();
	try {
		seedRelabelledEpic(repo);
		const plan = planMigration(repo);
		assert.deepEqual(plan.unmappable, []);
		const to = (id: string) => plan.moves.find(m => m.from.endsWith(`/${id.split('-')[0]}.md`))!.to;

		for (const kind of ['BUILD', 'CR', 'TESTS']) {
			const rw = rewriteOf(plan.metaRewrites, `${kind}-${E}-S001`)!;
			assert.equal(rw.set.epicSlug, 'the-label', kind);
			assert.deepEqual(rw.mdEdits, [], `${kind} prints no label`);
		}
		assert.deepEqual(rewriteOf(plan.metaRewrites, `EXT-${E}-S001`)?.mdEdits, [
			{ file: to(`EXT-${E}-S001`), from: '# Extend: old-label — Add a thing', to: '# Extend: the-label — Add a thing' },
			{
				file: to(`EXT-${E}-S001`),
				from: '> **Extends Epic `old-label`** — this builds on existing docs + code; no new Epic was created.',
				to:   '> **Extends Epic `the-label`** — this builds on existing docs + code; no new Epic was created.',
			},
		]);
		// The slug-less DEF's H1 was its problem's first sentence.
		assert.deepEqual(rewriteOf(plan.metaRewrites, `DEF-${E}`)?.mdEdits, [
			{ file: join(repo, E_ROOT, 'DEF.md'), from: '# Epic: Folders drift apart.', to: '# Epic: the-label' },
		]);
		assert.deepEqual(rewriteOf(plan.metaRewrites, `HLD-${E}`)?.mdEdits, [
			{ file: join(repo, E_ROOT, 'HLD.md'), from: '# HLD: old-label', to: '# HLD: the-label' },
		]);
		assert.equal(rewriteOf(plan.metaRewrites, `ISSUE-${E}`), undefined, 'the head already carries the label');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t3 — a relabelled HLD with a companion page plans no edit to the page and lists it in companionNotes', () => {
	const repo = newRepo();
	try {
		seedRelabelledEpic(repo, { companions: [{ kind: 'component-dependency', relPath: 'docs/epics/old-label-E202610110f1e2d3c/component-dependency.html', title: 'Components' }] });
		seedMd(repo, 'docs/epics/old-label-E202610110f1e2d3c/component-dependency.html', null, '<p>Epic old-label</p>');
		const plan = planMigration(repo);
		const rw = rewriteOf(plan.metaRewrites, `HLD-${E}`)!;
		assert.deepEqual(rw.companionNotes, [join(repo, E_ROOT, 'component-dependency.html')]);
		assert.ok(rw.mdEdits.every(e => e.file.endsWith('HLD.md')), 'only the HLD md is edited');
		assert.ok(plan.metaRewrites.every(r => r.mdEdits.every(e => !e.file.endsWith('.html'))));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
