/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the one-time docs-tree migration (Story S003). UNIT over a seeded
 * mkdtemp fixture for the pure planMigration core; INTEGRATION over a `git init`
 * tmp repo for the applyMigration executor. Mirrors path-scheme.test.ts's seeding.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { test } from 'node:test';

import { applyMigration, planMigration } from '../migrate-docs-tree.js';
import { artifactIdMarker } from '../storage.js';

const HASH = '1234567890abcdef';           // 16-hex epic hash → hash8 '12345678'
const DEF_CREATED = '2026-07-17T07:42:28.275Z';   // → E20260717
const SEG = 'E2026071712345678';
const SLUG = 'my-feature';

function seedJson(repo: string, id: string, meta: Record<string, unknown>): void {
	writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify({ meta, body: {} }, null, 2));
}
function seedMd(repo: string, rel: string, id: string | null, body = 'x'): void {
	const abs = join(repo, rel);
	mkdirSync(join(abs, '..'), { recursive: true });
	writeFileSync(abs, (id !== null ? artifactIdMarker(id) + '\n\n' : '') + body);
}

/** A repo with a full epic (DEF/HLD + one story LLD/PLAN/BUILD) in the FLAT
 *  layout + companion JSON, plus a hand-written non-artifact. */
function seedEpicRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-mig-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	// Companion JSON (the authoritative set). LLD carries a DIFFERENT createdAt
	// (a different UTC day) to prove the anchor is the DEF's, not per-artifact.
	seedJson(repo, `DEF-${HASH}`, { createdAt: DEF_CREATED, epicHash: HASH, epicSlug: SLUG });
	seedJson(repo, `HLD-${HASH}`, { createdAt: '2026-07-18T00:00:00.000Z', epicHash: HASH, epicSlug: SLUG });
	seedJson(repo, `LLD-${HASH}-s1`, { createdAt: '2026-07-19T23:59:00.000Z', epicHash: HASH, epicSlug: SLUG, storyId: 's1' });
	seedJson(repo, `PLAN-${HASH}-s1`, { createdAt: '2026-07-20T00:00:00.000Z', epicHash: HASH, epicSlug: SLUG, storyId: 's1' });
	// BUILD companion lacks epicSlug (the real-world gap) and is markerless on disk.
	seedJson(repo, `BUILD-${HASH}-s1`, { createdAt: '2026-07-21T00:00:00.000Z', epicHash: HASH, storyId: 's1', standalone: false });
	// Flat md — slug-named kinds carry the marker; BUILD is markerless + hash-named.
	seedMd(repo, `docs/defines/DEF-${SLUG}.md`, `DEF-${HASH}`);
	seedMd(repo, `docs/designs/HLD-${SLUG}.md`, `HLD-${HASH}`);
	seedMd(repo, `docs/designs/LLD-${SLUG}-s1.md`, `LLD-${HASH}-s1`);
	seedMd(repo, `docs/plans/PLAN-${SLUG}-s1.md`, `PLAN-${HASH}-s1`);
	seedMd(repo, `docs/builds/BUILD-${HASH}-s1.md`, null, '# Build (plan-driven) — Story s1');
	// A hand-written non-artifact (no marker, no companion JSON).
	seedMd(repo, 'docs/reviews/2026-07-20-audit.md', null, '# hand-written audit');
	return repo;
}

// ---------------------------------------------------------------------------
// planMigration — pure core (ac1 / ac2)
// ---------------------------------------------------------------------------

test('planMigration: every member of the epic resolves to ONE folder; story artifacts under S<nnn>/; DEF-anchored (no split)', () => {
	const repo = seedEpicRepo();
	try {
		const plan = planMigration(repo);
		assert.equal(plan.unmappable.length, 0, JSON.stringify(plan.unmappable));
		const rel = (p: string) => p.slice(repo.length + 1);
		const byKind = Object.fromEntries(plan.moves.map(m => [m.kind, rel(m.to)]));
		// item-root artifacts (DEF/HLD) at the folder root; story artifacts under S001/.
		// The folder E<date> is the DEF's day (E20260717), NOT any later member's.
		assert.equal(byKind['DEF'], `docs/epics/${SLUG}-${SEG}/DEF.md`);
		assert.equal(byKind['HLD'], `docs/epics/${SLUG}-${SEG}/HLD.md`);
		assert.equal(byKind['LLD'], `docs/epics/${SLUG}-${SEG}/S001/LLD.md`);
		assert.equal(byKind['PLAN'], `docs/epics/${SLUG}-${SEG}/S001/PLAN.md`);
		// BUILD (no epicSlug in its own meta, markerless md) still lands in the SAME folder.
		assert.equal(byKind['BUILD'], `docs/epics/${SLUG}-${SEG}/S001/BUILD.md`);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('planMigration: both locate paths — slug-named md via marker, markerless BUILD via hash filename', () => {
	const repo = seedEpicRepo();
	try {
		const plan = planMigration(repo);
		const lld = plan.moves.find(m => m.kind === 'LLD')!;
		const build = plan.moves.find(m => m.kind === 'BUILD')!;
		assert.ok(lld.from.endsWith(`docs/designs/LLD-${SLUG}-s1.md`), 'LLD located by marker at its slug-named flat path');
		assert.ok(build.from.endsWith(`docs/builds/BUILD-${HASH}-s1.md`), 'BUILD located by its hash-named filename');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('planMigration: a hand-written non-artifact doc is never enumerated (not moved, not unmappable)', () => {
	const repo = seedEpicRepo();
	try {
		const plan = planMigration(repo);
		assert.ok(!plan.moves.some(m => m.from.includes('2026-07-20-audit')), 'audit not moved');
		assert.ok(!plan.unmappable.some(u => u.artifactId.includes('audit')), 'audit not unmappable');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('planMigration: a standalone item resolves under docs/standalone/ with the LLD createdAt as anchor', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-mig-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		const h = 'abcdef0123456789';
		seedJson(repo, `LLD-${h}-S001`, { createdAt: DEF_CREATED, epicHash: h, epicSlug: 'sa-feature', storyId: 'S001', standalone: true });
		seedJson(repo, `BUILD-${h}-S001`, { createdAt: '2026-07-25T00:00:00.000Z', epicHash: h, storyId: 'S001', standalone: true });
		seedMd(repo, `docs/designs/LLD-sa-feature-S001.md`, `LLD-${h}-S001`);
		seedMd(repo, `docs/builds/BUILD-${h}-S001.md`, null, '# Build (standalone)');
		const plan = planMigration(repo);
		assert.equal(plan.unmappable.length, 0);
		const rel = (p: string) => p.slice(repo.length + 1);
		const seg = 'E20260717abcdef01';
		assert.equal(rel(plan.moves.find(m => m.kind === 'LLD')!.to), `docs/standalone/sa-feature-${seg}/S001/LLD.md`);
		assert.equal(rel(plan.moves.find(m => m.kind === 'BUILD')!.to), `docs/standalone/sa-feature-${seg}/S001/BUILD.md`);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('planMigration: an artifact already at its nested destination is SKIPPED (idempotent)', () => {
	const repo = seedEpicRepo();
	try {
		// Pre-place the DEF at its nested destination and remove its flat copy.
		seedMd(repo, `docs/epics/${SLUG}-${SEG}/DEF.md`, `DEF-${HASH}`);
		rmSync(join(repo, 'docs', 'defines', `DEF-${SLUG}.md`));
		const plan = planMigration(repo);
		assert.equal(plan.unmappable.length, 0);
		assert.ok(!plan.moves.some(m => m.kind === 'DEF'), 'DEF already nested → no move');
		assert.ok(plan.moves.some(m => m.kind === 'LLD'), 'other members still move');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('planMigration: fail-loud — a work item with no slug source AND a missing md is recorded in unmappable[]', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-mig-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		// A lone BUILD: hash-named md gives no slug, meta has no epicSlug → missing-slug.
		const h = '00112233445566aa';
		seedJson(repo, `BUILD-${h}-s1`, { createdAt: DEF_CREATED, epicHash: h, storyId: 's1', standalone: false });
		seedMd(repo, `docs/builds/BUILD-${h}-s1.md`, null, '# build');
		const plan = planMigration(repo);
		assert.equal(plan.moves.length, 0);
		assert.equal(plan.unmappable.length, 1);
		assert.match(plan.unmappable[0]!.reason, /no slug source/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// applyMigration — git executor (ac1 / ac3)
// ---------------------------------------------------------------------------

function gitInit(repo: string): void {
	const g = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
	g('init', '-q');
	g('config', 'user.email', 'test@example.com');
	g('config', 'user.name', 'Test');
	g('add', '-A');
	g('commit', '-q', '-m', 'seed flat tree');
}

test('applyMigration: git mv relocates each md (history followed), no flat md remains, .insrc/artifacts byte-identical', () => {
	const repo = seedEpicRepo();
	try {
		gitInit(repo);
		const jsonBefore = readFileSync(join(repo, '.insrc', 'artifacts', `DEF-${HASH}.json`), 'utf8');
		const plan = planMigration(repo);
		applyMigration(repo, plan);
		// no artifact md remains in the flat dirs (the non-artifact audit stays)
		assert.ok(!existsSync(join(repo, 'docs', 'defines', `DEF-${SLUG}.md`)));
		assert.ok(!existsSync(join(repo, 'docs', 'builds', `BUILD-${HASH}-s1.md`)));
		assert.ok(existsSync(join(repo, 'docs', 'reviews', '2026-07-20-audit.md')), 'non-artifact audit left in place');
		// relocated with git history followed
		const to = join(repo, 'docs', 'epics', `${SLUG}-${SEG}`, 'DEF.md');
		assert.ok(existsSync(to));
		const followed = execFileSync('git', ['log', '--follow', '--format=%s', '--', to], { cwd: repo, encoding: 'utf8' });
		assert.match(followed, /seed flat tree/, 'git log --follow shows the pre-move commit');
		// the JSON store is byte-unchanged
		assert.equal(readFileSync(join(repo, '.insrc', 'artifacts', `DEF-${HASH}.json`), 'utf8'), jsonBefore);
		// clean tree after (all committed)
		assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('applyMigration: a plan with a non-empty unmappable[] is REFUSED (throws, names files) before any move', () => {
	const repo = seedEpicRepo();
	try {
		gitInit(repo);
		const bad = { moves: [], linkRewrites: [], unmappable: [{ artifactId: `DEF-${HASH}`, reason: 'test' }] };
		assert.throws(() => applyMigration(repo, bad), /refusing to apply/);
		// nothing moved
		assert.ok(existsSync(join(repo, 'docs', 'defines', `DEF-${SLUG}.md`)));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('applyMigration: a commit failing on a LATER epic chunk rolls the WHOLE run back to the pre-run commit (no partial mix)', () => {
	const repo = seedEpicRepo();
	try {
		// Add a SECOND epic so there are >=2 per-epic chunk commits.
		const h2 = 'fedcba9876543210';
		seedJson(repo, `DEF-${h2}`, { createdAt: DEF_CREATED, epicHash: h2, epicSlug: 'other' });
		seedMd(repo, `docs/defines/DEF-other.md`, `DEF-${h2}`);
		gitInit(repo);
		const startSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
		// A pre-commit hook that FAILS on the 2nd commit (passes the 1st).
		const hookDir = join(repo, '.git', 'hooks');
		mkdirSync(hookDir, { recursive: true });
		const counter = join(repo, '.git', 'commit-count');
		writeFileSync(join(hookDir, 'pre-commit'),
			`#!/bin/sh\nn=$(cat "${counter}" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${counter}"; [ "$n" -ge 2 ] && exit 1; exit 0\n`);
		execFileSync('chmod', ['+x', join(hookDir, 'pre-commit')]);

		const plan = planMigration(repo);
		assert.ok(new Set(plan.moves.map(m => m.groupHash)).size >= 2, 'two epic chunks');
		assert.throws(() => applyMigration(repo, plan));
		// HEAD is back at the pre-run commit — the 1st chunk's commit was undone too.
		assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), startSha);
		assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '', 'clean, fully restored');
		assert.ok(existsSync(join(repo, 'docs', 'defines', `DEF-${SLUG}.md`)) && existsSync(join(repo, 'docs', 'defines', 'DEF-other.md')), 'both epics restored to flat');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('applyMigration: a git-mv failure rolls the run back and leaves no partial mix', () => {
	const repo = seedEpicRepo();
	try {
		gitInit(repo);
		const plan = planMigration(repo);
		// Corrupt one move's source so `git mv` fails mid-run.
		const broken = { ...plan, moves: [...plan.moves, { ...plan.moves[0]!, from: join(repo, 'docs', 'defines', 'DOES-NOT-EXIST.md') }] };
		assert.throws(() => applyMigration(repo, broken));
		// full rollback: the flat tree is intact, no nested folder committed
		assert.ok(existsSync(join(repo, 'docs', 'defines', `DEF-${SLUG}.md`)), 'flat DEF restored by rollback');
		assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '', 'working tree clean after rollback');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// S001/t6 — converge folders that ALREADY exist, scattered. Before t6 the
// migration only indexed FLAT md paths, so a nested-but-misplaced artifact was
// reported unmappable rather than moved — which is exactly a forked folder.
// ---------------------------------------------------------------------------

const T6_HASH = 'b7a6c5d4e3f20191';
const T6_ANCHOR = '2026-10-02T18:19:50.067Z';          // -> E20261002
const T6_SEG = `E20261002${T6_HASH.slice(0, 8)}`;
const GOOD = 'the-real-label';
const DRIFTED = 'a-drifted-label';

/** Reproduce the live four-folder condition: one work item, four artifacts, four
 *  folders, by three different drift mechanisms (label, top-level, raw hash). */
function seedFourFolders(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t6-converge-'));
	const wr = (rel: string, body: string): void => {
		const abs = join(repo, rel);
		mkdirSync(join(abs, '..'), { recursive: true });
		writeFileSync(abs, body);
	};
	const meta = (kind: string, storyId?: string): string => JSON.stringify({
		meta: {
			workflow: kind.toLowerCase(), epicHash: T6_HASH, epicSlug: GOOD, standalone: true,
			createdAt: T6_ANCHOR, epicCreatedAt: T6_ANCHOR,
			...(storyId !== undefined ? { storyId } : {}),
		},
		body: {},
	});
	const md = (id: string): string => `${artifactIdMarker(id)}\n\n# ${id}\n`;

	// The JSON store is the authoritative artifact set.
	wr(`.insrc/artifacts/ISSUE-${T6_HASH}.json`,        meta('ISSUE'));
	wr(`.insrc/artifacts/LLD-${T6_HASH}-S001.json`,     meta('LLD', 'S001'));
	wr(`.insrc/artifacts/PLAN-${T6_HASH}-S001.json`,    meta('PLAN', 'S001'));
	wr(`.insrc/artifacts/BUILD-${T6_HASH}-S001.json`,   meta('BUILD', 'S001'));

	// ...and the md files, scattered across FOUR folders.
	wr(`docs/standalone/${GOOD}-${T6_SEG}/ISSUE.md`,            md(`ISSUE-${T6_HASH}`));
	wr(`docs/standalone/${DRIFTED}-${T6_SEG}/S001/LLD.md`,      md(`LLD-${T6_HASH}-S001`));      // label drift
	wr(`docs/epics/${DRIFTED}-${T6_SEG}/S001/PLAN.md`,          md(`PLAN-${T6_HASH}-S001`));     // + top-level drift
	wr(`docs/epics/${T6_HASH}-${T6_SEG}/S001/BUILD.md`,         md(`BUILD-${T6_HASH}-S001`));    // + raw-hash label

	// applyMigration shells out to git, so the fixture must be a repo.
	gitInit(repo);
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

/** Every docs folder carrying the work item's identity segment. */
function foldersForSegment(repo: string): string[] {
	const out: string[] = [];
	for (const top of ['docs/standalone', 'docs/epics']) {
		const abs = join(repo, top);
		if (!existsSync(abs)) continue;
		for (const name of readdirSync(abs)) if (name.endsWith(T6_SEG)) out.push(`${top}/${name}`);
	}
	return out.sort();
}

test('t6 — a pre-seeded FOUR-folder work item converges onto ONE', () => {
	const r = seedFourFolders();
	try {
		// PRECONDITION asserted FIRST. Without this the end-state assertion would
		// pass on a fixture that only ever had one folder.
		assert.equal(foldersForSegment(r.repo).length, 4,
			`fixture must start with four folders, got ${JSON.stringify(foldersForSegment(r.repo))}`);

		const plan = planMigration(r.repo);
		assert.ok(plan.moves.length >= 3, `expected moves for the three misplaced artifacts, got ${plan.moves.length}`);
		applyMigration(r.repo, plan);

		const after = foldersForSegment(r.repo);
		assert.equal(after.length, 1, `expected one folder, got ${JSON.stringify(after)}`);
		assert.equal(after[0], `docs/standalone/${GOOD}-${T6_SEG}`,
			'and it is the one the definition artifact designates: standalone top-level, the ISSUE\'s label');
	} finally { r.cleanup(); }
});

test('t6 — the raw-hash-labelled folder and the wrong-top-level folder are both handled', () => {
	const r = seedFourFolders();
	try {
		applyMigration(r.repo, planMigration(r.repo));
		const dest = join(r.repo, `docs/standalone/${GOOD}-${T6_SEG}`);
		assert.ok(existsSync(join(dest, 'S001/BUILD.md')), 'the raw-hash-labelled BUILD moved');
		assert.ok(existsSync(join(dest, 'S001/PLAN.md')),  'the wrong-top-level PLAN moved');
		assert.ok(existsSync(join(dest, 'S001/LLD.md')),   'the label-drifted LLD moved');
		assert.ok(existsSync(join(dest, 'ISSUE.md')),      'and the already-correct ISSUE stayed');
		// Nothing left behind under the drifted names.
		assert.ok(!existsSync(join(r.repo, `docs/epics/${T6_HASH}-${T6_SEG}`)));
	} finally { r.cleanup(); }
});

test('t6 — planMigration is READ-ONLY: planning alone moves nothing', () => {
	const r = seedFourFolders();
	try {
		const before = foldersForSegment(r.repo);
		planMigration(r.repo);
		planMigration(r.repo);
		assert.deepEqual(foldersForSegment(r.repo), before, 'planning must not touch the tree');
		assert.equal(foldersForSegment(r.repo).length, 4, 'all four folders still present after planning twice');
	} finally { r.cleanup(); }
});

test('t6 — convergence is idempotent: a second plan after applying has nothing left to move', () => {
	const r = seedFourFolders();
	try {
		applyMigration(r.repo, planMigration(r.repo));
		const second = planMigration(r.repo);
		assert.equal(second.moves.length, 0, `a converged tree yields no moves, got ${JSON.stringify(second.moves)}`);
		assert.equal(second.unmappable.length, 0,
			`and nothing becomes unmappable: ${JSON.stringify(second.unmappable)}`);
	} finally { r.cleanup(); }
});

test('t6 — an artifact whose md is missing entirely is reported UNMAPPABLE, not guessed at', () => {
	const r = seedFourFolders();
	try {
		// A JSON artifact with no md anywhere, flat or nested.
		writeFileSync(
			join(r.repo, `.insrc/artifacts/CR-${T6_HASH}-S001.json`),
			JSON.stringify({ meta: { workflow: 'cr', epicHash: T6_HASH, storyId: 'S001', epicSlug: GOOD, standalone: true, createdAt: T6_ANCHOR, epicCreatedAt: T6_ANCHOR }, body: {} }),
		);
		const plan = planMigration(r.repo);
		assert.ok(plan.unmappable.some(u => u.artifactId === `CR-${T6_HASH}-S001`),
			`the md-less artifact must be reported, got ${JSON.stringify(plan.unmappable)}`);
		assert.ok(!plan.moves.some(m => m.kind === 'CR'), 'and no move is invented for it');
	} finally { r.cleanup(); }
});
