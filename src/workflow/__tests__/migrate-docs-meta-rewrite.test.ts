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
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { epicShortName, type DefineArtifact } from '../artifacts/define.js';
import { hldShortName, type HldArtifact } from '../artifacts/hld.js';
import { applyMigration, planMigration, type MetaRewrite } from '../migrate-docs-tree.js';
import type { ArtifactKind } from '../path-scheme.js';
import { deriveMdPath } from '../pending.js';
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
	seedMd(repo, `${stray}/S001/EXT.md`, `EXT-${E}-S001`,
		'# Extend: old-label — Add a thing\n\n> **Extends Epic `old-label`** — this builds on existing docs + code; no new Epic was created.\n');
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

// ---------------------------------------------------------------------------
// t4 — applyMigration writes the rewrites inside the per-work-item commits
// ---------------------------------------------------------------------------

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}
function gitInit(repo: string): void {
	git(repo, 'init', '-q');
	git(repo, 'config', 'user.email', 'test@example.com');
	git(repo, 'config', 'user.name', 'Test');
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'seed');
}
function readJson(repo: string, id: string): string {
	return readFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), 'utf8');
}

/** The split standalone item: a head LLD in its folder, a PLAN filed by the plan
 *  stage in a second folder with its own label and day, and a BUILD written the
 *  next day with no stamp, already sitting beside the LLD. */
function seedSplitItem(repo: string): void {
	seedHeadLld(repo);
	seedJson(repo, `PLAN-${H}-S001`,
		{ createdAt: '2026-10-12T10:00:00.000Z', epicCreatedAt: '2026-10-12T10:00:00.000Z', epicHash: H, epicSlug: 'a-plan-label', storyId: 'S001', standalone: true, approvedAt: '2026-10-12T11:00:00.000Z' },
		{ tasks: [{ id: 't1' }] });
	seedMd(repo, 'docs/standalone/a-plan-label-E20261012a1b2c3d4/S001/PLAN.md', `PLAN-${H}-S001`, '# Plan\n\n**Epic:** `a-plan-label`\n**LLD run:** `r1`\n');
	seedJson(repo, `BUILD-${H}-S001`, { createdAt: '2026-10-12T09:00:00.000Z', epicHash: H, epicSlug: LABEL, storyId: 'S001', standalone: true });
	seedMd(repo, `${FOLDER}/S001/BUILD.md`, `BUILD-${H}-S001`);
}

test('t4 — after apply, deriveMdPath on every member\'s stored meta is where its md sits, and PLAN.md shows the head label', () => {
	const repo = newRepo();
	try {
		seedSplitItem(repo);
		gitInit(repo);
		applyMigration(repo, planMigration(repo));

		for (const name of readdirSync(join(repo, '.insrc', 'artifacts'))) {
			const kind = name.split('-')[0] as ArtifactKind;
			const meta = (JSON.parse(readFileSync(join(repo, '.insrc', 'artifacts', name), 'utf8')) as { meta: Record<string, unknown> }).meta;
			const derived = deriveMdPath(repo, kind, meta);
			assert.equal(relative(repo, derived), `${FOLDER}/S001/${kind}.md`, name);
			assert.ok(existsSync(derived), `${name}: its md is at the derived path`);
		}
		const planMd = readFileSync(join(repo, FOLDER, 'S001', 'PLAN.md'), 'utf8');
		assert.match(planMd, new RegExp(`^\\*\\*Epic:\\*\\* \`${LABEL}\`$`, 'm'));
		assert.doesNotMatch(planMd, /a-plan-label/);
		assert.equal(git(repo, 'status', '--porcelain').trim(), '', 'everything is committed');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4 — only the planned meta fields change; a consistent member\'s JSON is byte-identical', () => {
	const repo = newRepo();
	try {
		seedSplitItem(repo);
		gitInit(repo);
		const planBefore = JSON.parse(readJson(repo, `PLAN-${H}-S001`)) as { meta: Record<string, unknown>; body: unknown };
		const lldBefore = readJson(repo, `LLD-${H}-S001`);
		const plan = planMigration(repo);
		const set = rewriteOf(plan.metaRewrites, `PLAN-${H}-S001`)!.set;
		applyMigration(repo, plan);

		// Byte-for-byte what patching only those fields produces: same key order,
		// same body, approvedAt and every other field kept.
		const expected = JSON.stringify({ ...planBefore, meta: { ...planBefore.meta, ...set } }, null, 2) + '\n';
		assert.equal(readJson(repo, `PLAN-${H}-S001`), expected);
		assert.equal((JSON.parse(readJson(repo, `PLAN-${H}-S001`)) as { meta: { approvedAt: string } }).meta.approvedAt, '2026-10-12T11:00:00.000Z');
		assert.equal(readJson(repo, `LLD-${H}-S001`), lldBefore, 'the head already matched');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

const E2 = '0c0ffee012345678';
const E2_FOLDER = 'docs/standalone/second-item-E202610110c0ffee0';

/** A second, already-placed work item whose PLAN still carries an old label:
 *  it needs a rewrite but no move. Its hash sorts before H. */
function seedRewriteOnlyItem(repo: string): void {
	seedJson(repo, `LLD-${E2}-S001`, { createdAt: ANCHOR, epicHash: E2, epicSlug: 'second-item', storyId: 'S001', standalone: true });
	seedMd(repo, `${E2_FOLDER}/S001/LLD.md`, `LLD-${E2}-S001`);
	seedJson(repo, `PLAN-${E2}-S001`, { createdAt: ANCHOR, epicHash: E2, epicSlug: 'old-second', storyId: 'S001', standalone: true });
	seedMd(repo, `${E2_FOLDER}/S001/PLAN.md`, `PLAN-${E2}-S001`, '**Epic:** `old-second`\n');
}

test('t4 — a group\'s moves, JSON rewrites and md edits land in one commit; a rewrite-only group gets its own realign commit', () => {
	const repo = newRepo();
	try {
		seedSplitItem(repo);
		seedRewriteOnlyItem(repo);
		gitInit(repo);
		applyMigration(repo, planMigration(repo));

		const log = git(repo, 'log', '--format=%s', '-2').trim().split('\n');
		const files = (rev: string) => git(repo, 'show', '--name-only', '--no-renames', '--format=', rev).trim().split('\n').sort();
		const migrate = log.findIndex(m => m.startsWith(`chore(docs): migrate ${H}`));
		const realign = log.findIndex(m => m === `chore(docs): realign ${E2} artifact labels with their work-item folder`);
		assert.ok(migrate >= 0 && realign >= 0, log.join(' | '));
		// The PLAN's move, its JSON and its md edit, plus the next-day BUILD's anchor.
		assert.deepEqual(files(`HEAD~${migrate}`), [
			`.insrc/artifacts/BUILD-${H}-S001.json`,
			`.insrc/artifacts/PLAN-${H}-S001.json`,
			'docs/standalone/a-plan-label-E20261012a1b2c3d4/S001/PLAN.md',
			`${FOLDER}/S001/PLAN.md`,
		].sort());
		assert.deepEqual(files(`HEAD~${realign}`), [`${E2_FOLDER}/S001/PLAN.md`, `.insrc/artifacts/PLAN-${E2}-S001.json`].sort());
		assert.equal(git(repo, 'status', '--porcelain').trim(), '');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4 — a plan with rewrites but no moves still applies', () => {
	const repo = newRepo();
	try {
		seedRewriteOnlyItem(repo);
		gitInit(repo);
		const plan = planMigration(repo);
		assert.deepEqual(plan.moves, []);
		assert.equal(plan.metaRewrites.length, 1);
		applyMigration(repo, plan);
		assert.match(readJson(repo, `PLAN-${E2}-S001`), /"epicSlug": "second-item"/);
		assert.equal(readFileSync(join(repo, E2_FOLDER, 'S001', 'PLAN.md'), 'utf8'), artifactIdMarker(`PLAN-${E2}-S001`) + '\n\n**Epic:** `second-item`\n');
		assert.equal(git(repo, 'log', '--format=%s', '-1').trim(), `chore(docs): realign ${E2} artifact labels with their work-item folder`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

for (const corrupt of ['label line', 'JSON'] as const) {
	test(`t4 — a ${corrupt} broken and committed after planning rolls the whole two-group run back to the start commit`, () => {
		const repo = newRepo();
		try {
			seedSplitItem(repo);
			seedRewriteOnlyItem(repo);
			gitInit(repo);
			const plan = planMigration(repo);
			// Committed, so the clean-tree check passes and the rewrite step meets it.
			if (corrupt === 'label line') writeFileSync(join(repo, E2_FOLDER, 'S001', 'PLAN.md'), 'the label line is gone\n');
			else writeFileSync(join(repo, '.insrc', 'artifacts', `PLAN-${E2}-S001.json`), '{ not json');
			git(repo, 'commit', '-qam', 'edit after planning');
			const start = git(repo, 'rev-parse', 'HEAD').trim();
			const startTree = fingerprint(repo);

			assert.throws(() => applyMigration(repo, plan),
				corrupt === 'label line' ? /expected the label line exactly once in .*PLAN\.md, found 0/ : new RegExp(`cannot read PLAN-${E2}-S001`));
			// The first work item's chunk had been committed before the failure...
			assert.match(git(repo, 'reflog', '--format=%gs'), new RegExp(`commit: chore\\(docs\\): migrate ${H}`));
			// ...and the rollback undid it with everything else.
			assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), start);
			assert.equal(git(repo, 'status', '--porcelain').trim(), '');
			assert.deepEqual(fingerprint(repo), startTree);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});
}

test('t4 — a second plan after apply has no moves and no metaRewrites', () => {
	const repo = newRepo();
	try {
		seedSplitItem(repo);
		seedRewriteOnlyItem(repo);
		gitInit(repo);
		applyMigration(repo, planMigration(repo));
		const again = planMigration(repo);
		assert.deepEqual(again.moves, []);
		assert.deepEqual(again.metaRewrites, []);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4 — a SPEC realigned to standalone resolves under docs/standalone via deriveMdPath', () => {
	const repo = newRepo();
	try {
		const S = '9988776655443322';
		seedJson(repo, `SPEC-${S}`, { createdAt: ANCHOR, specHash: S, epicSlug: 'a-spec' });
		seedMd(repo, 'docs/specs/SPEC-a-spec.md', `SPEC-${S}`);
		gitInit(repo);
		applyMigration(repo, planMigration(repo));
		const meta = (JSON.parse(readJson(repo, `SPEC-${S}`)) as { meta: Record<string, unknown> }).meta;
		assert.equal(meta['standalone'], true);
		const derived = deriveMdPath(repo, 'SPEC', meta);
		assert.equal(relative(repo, derived), 'docs/standalone/a-spec-E2026101199887766/SPEC.md');
		assert.ok(existsSync(derived));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4 — a label line the md does not hold is reported, and apply refuses the plan until the md is fixed', () => {
	const repo = newRepo();
	try {
		seedHeadLld(repo);
		// Rendered by an older renderer: no '**Epic:**' line at all.
		seedJson(repo, `PLAN-${H}-S001`, { createdAt: ANCHOR, epicHash: H, epicSlug: 'a-plan-label', storyId: 'S001', standalone: true });
		seedMd(repo, `${FOLDER}/S001/PLAN.md`, `PLAN-${H}-S001`, '# Plan\n');
		gitInit(repo);
		const plan = planMigration(repo);
		const rw = rewriteOf(plan.metaRewrites, `PLAN-${H}-S001`)!;
		assert.deepEqual(rw.mdEdits, []);
		assert.deepEqual(rw.unmatchedLabelLines, [{ file: join(repo, FOLDER, 'S001', 'PLAN.md'), from: '**Epic:** `a-plan-label`', to: `**Epic:** \`${LABEL}\`` }]);

		// Realigning the JSON alone would hide the stale md from every later plan.
		const before = fingerprint(repo);
		const head = git(repo, 'rev-parse', 'HEAD');
		assert.throws(() => applyMigration(repo, plan), /refusing to apply — 1 label line\(s\) to fix by hand first:[\s\S]*PLAN\.md/);
		assert.deepEqual(fingerprint(repo), before);
		assert.equal(git(repo, 'rev-parse', 'HEAD'), head);

		// Once the md carries its label line, the plan applies.
		writeFileSync(join(repo, FOLDER, 'S001', 'PLAN.md'), artifactIdMarker(`PLAN-${H}-S001`) + '\n\n# Plan\n**Epic:** `a-plan-label`\n');
		git(repo, 'commit', '-qam', 'restore the label line');
		applyMigration(repo, planMigration(repo));
		assert.match(readJson(repo, `PLAN-${H}-S001`), new RegExp(`"epicSlug": "${LABEL}"`));
		assert.match(readFileSync(join(repo, FOLDER, 'S001', 'PLAN.md'), 'utf8'), new RegExp(`\\*\\*Epic:\\*\\* \`${LABEL}\``));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4 — a duplicate render checks and edits the copy kept at the destination', () => {
	const repo = newRepo();
	try {
		seedHeadLld(repo);
		seedJson(repo, `PLAN-${H}-S001`, { createdAt: ANCHOR, epicHash: H, epicSlug: 'a-plan-label', storyId: 'S001', standalone: true });
		// Two renders: the stray one carries the label line, the kept one does too
		// but with different surrounding content.
		seedMd(repo, 'docs/standalone/a-plan-label-E20261011a1b2c3d4/S001/PLAN.md', `PLAN-${H}-S001`, '**Epic:** `a-plan-label`\nstray\n');
		seedMd(repo, `${FOLDER}/S001/PLAN.md`, `PLAN-${H}-S001`, '**Epic:** `a-plan-label`\nkept\n');
		gitInit(repo);
		const plan = planMigration(repo);
		const kept = join(repo, FOLDER, 'S001', 'PLAN.md');
		assert.deepEqual(rewriteOf(plan.metaRewrites, `PLAN-${H}-S001`)?.mdEdits.map(e => e.file), [kept]);
		applyMigration(repo, plan);
		assert.equal(readFileSync(kept, 'utf8'), artifactIdMarker(`PLAN-${H}-S001`) + `\n\n**Epic:** \`${LABEL}\`\nkept\n`);

		// Kept render without the line: reported against the kept file, not the stray.
		const repo2 = newRepo();
		try {
			seedHeadLld(repo2);
			seedJson(repo2, `PLAN-${H}-S001`, { createdAt: ANCHOR, epicHash: H, epicSlug: 'a-plan-label', storyId: 'S001', standalone: true });
			seedMd(repo2, 'docs/standalone/a-plan-label-E20261011a1b2c3d4/S001/PLAN.md', `PLAN-${H}-S001`, '**Epic:** `a-plan-label`\n');
			seedMd(repo2, `${FOLDER}/S001/PLAN.md`, `PLAN-${H}-S001`, 'no label here\n');
			const rw = rewriteOf(planMigration(repo2).metaRewrites, `PLAN-${H}-S001`)!;
			assert.deepEqual(rw.mdEdits, []);
			assert.deepEqual(rw.unmatchedLabelLines.map(e => e.file), [join(repo2, FOLDER, 'S001', 'PLAN.md')]);
		} finally { rmSync(repo2, { recursive: true, force: true }); }
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4 — a link rewritten in a file that does not move is committed, leaving a clean tree', () => {
	const repo = newRepo();
	try {
		seedHeadLld(repo);
		seedJson(repo, `PLAN-${H}-S001`, { createdAt: ANCHOR, epicHash: H, epicSlug: LABEL, storyId: 'S001', standalone: true });
		seedMd(repo, 'docs/standalone/a-plan-label-E20261011a1b2c3d4/S001/PLAN.md', `PLAN-${H}-S001`, `**Epic:** \`${LABEL}\`\n`);
		// The LLD neither moves nor needs realigning, and links to the PLAN.
		seedMd(repo, `${FOLDER}/S001/LLD.md`, `LLD-${H}-S001`, `**Epic:** \`${LABEL}\`\nSee [the plan](docs/standalone/a-plan-label-E20261011a1b2c3d4/S001/PLAN.md).\n`);
		gitInit(repo);
		const plan = planMigration(repo);
		assert.equal(rewriteOf(plan.metaRewrites, `LLD-${H}-S001`), undefined);
		assert.deepEqual(plan.linkRewrites.map(l => relative(repo, l.file)), [`${FOLDER}/S001/LLD.md`]);
		applyMigration(repo, plan);
		assert.match(readFileSync(join(repo, FOLDER, 'S001', 'LLD.md'), 'utf8'), new RegExp(`${FOLDER}/S001/PLAN\\.md`));
		assert.equal(git(repo, 'status', '--porcelain').trim(), '');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t5 — the CLI dry run lists every metadata rewrite
// ---------------------------------------------------------------------------

const CLI = join(dirname(fileURLToPath(import.meta.url)), '../../bin/insrc-migrate-docs.ts');

test('t5 — the insrc-migrate-docs dry run prints each metadata rewrite, its md edits and companion notes, and mutates nothing', () => {
	const repo = newRepo();
	try {
		seedSplitItem(repo);
		seedRewriteOnlyItem(repo);
		seedRelabelledEpic(repo, { companions: [{ kind: 'component-dependency', relPath: 'docs/epics/old-label-E202610110f1e2d3c/component-dependency.html', title: 'Components' }] });
		seedMd(repo, 'docs/epics/old-label-E202610110f1e2d3c/component-dependency.html', null, '<p>Epic old-label</p>');
		gitInit(repo);
		const before = fingerprint(repo);
		const plan = planMigration(repo);

		// tsx is resolved from this repo: the child runs inside the fixture repo.
		const out = execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'), CLI], {
			cwd: repo, encoding: 'utf8', env: { ...process.env, INSRC_REPO: repo, INSRC_LOG_LEVEL: 'silent' },
		});
		assert.match(out, new RegExp(`, ${plan.metaRewrites.length} metadata rewrite\\(s\\), `));
		const metaLines = out.split('\n').filter(l => l.startsWith('  meta  '));
		assert.equal(metaLines.length, plan.metaRewrites.length, out);
		assert.ok(metaLines.includes(`  meta  PLAN-${H}-S001: epicSlug=${LABEL} epicCreatedAt=${ANCHOR}`), out);
		assert.ok(metaLines.includes(`  meta  PLAN-${E2}-S001: epicSlug=second-item`), out);
		assert.ok(out.includes(`        ${E2_FOLDER}/S001/PLAN.md: '**Epic:** \`old-second\`' -> '**Epic:** \`second-item\`'`), out);
		assert.ok(out.includes(`        note  ${E_ROOT}/component-dependency.html: companion page still shows the old label`), out);
		assert.match(out, /Dry-run only/);
		assert.deepEqual(fingerprint(repo), before, 'the dry run wrote nothing');
		assert.equal(git(repo, 'status', '--porcelain').trim(), '');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
