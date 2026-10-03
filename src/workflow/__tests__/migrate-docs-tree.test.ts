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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
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

test('planMigration: a work item with NO slug source is placed under its HASH, mirroring the writer', () => {
	// BEHAVIOUR CHANGED DELIBERATELY (S001/t9). This previously asserted that such
	// an item went to unmappable[], and its title claimed the md was missing — it
	// was not; the fixture seeds a present flat md. Marking it unmappable diverged
	// from every writer in the path scheme, each of which composes with
	// `epicSlug ?? epicHash`, so the hash is already the documented label for an
	// unlabelled work item. It also made convergence all-or-nothing: applyMigration
	// refuses the whole plan while any entry is unmappable, so two ledger-only work
	// items with no definition head blocked the entire repo.
	//
	// Genuine fail-loud is unchanged and covered separately: no ANCHOR is still
	// unmappable, and so is an artifact whose md is missing entirely.
	const repo = mkdtempSync(join(tmpdir(), 'insrc-mig-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		// A lone BUILD: hash-named md gives no slug, and meta carries no epicSlug.
		const h = '00112233445566aa';
		seedJson(repo, `BUILD-${h}-s1`, { createdAt: DEF_CREATED, epicHash: h, storyId: 's1', standalone: false });
		seedMd(repo, `docs/builds/BUILD-${h}-s1.md`, null, '# build');
		const plan = planMigration(repo);
		assert.equal(plan.unmappable.length, 0, `expected no unmappable, got ${JSON.stringify(plan.unmappable)}`);
		assert.equal(plan.moves.length, 1);
		// The hash is the label, so the folder is `<hash>-E<date><hash8>`.
		assert.ok(plan.moves[0]!.to.includes(`${h}-E`), plan.moves[0]!.to);
		assert.ok(plan.moves[0]!.to.endsWith(join('S001', 'BUILD.md')), plan.moves[0]!.to);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('planMigration: a work item with no ANCHOR is still fail-loud unmappable', () => {
	// The hash fallback covers a missing LABEL only. Without an anchor createdAt
	// there is no identity SEGMENT to key a folder on, so there is nothing to
	// guess at and the item must be reported rather than placed.
	const repo = mkdtempSync(join(tmpdir(), 'insrc-mig-noanchor-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		const h = '00112233445566bb';
		seedJson(repo, `BUILD-${h}-s1`, { epicHash: h, storyId: 's1', standalone: false });   // no createdAt
		seedMd(repo, `docs/builds/BUILD-${h}-s1.md`, null, '# build');
		const plan = planMigration(repo);
		assert.equal(plan.moves.length, 0);
		assert.equal(plan.unmappable.length, 1);
		assert.match(plan.unmappable[0]!.reason, /no anchor createdAt/);
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

/** Every file under `docs/` plus the sha256 of its contents, so a comparison can
 *  detect a rewritten, added or deleted file — not just a renamed folder. */
function docsFingerprint(repo: string): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (rel: string): void => {
		const abs = join(repo, rel);
		if (!existsSync(abs)) return;
		for (const name of readdirSync(abs).sort()) {
			const childRel = `${rel}/${name}`;
			const childAbs = join(repo, childRel);
			if (statSync(childAbs).isDirectory()) walk(childRel);
			else out[childRel] = createHash('sha256').update(readFileSync(childAbs)).digest('hex');
		}
	};
	walk('docs');
	return out;
}

test('t6 — planMigration is READ-ONLY: planning leaves the docs tree BYTE-IDENTICAL', () => {
	const r = seedFourFolders();
	try {
		// CRITIQUE APPLIED — this used to compare only the list of folder NAMES, so a
		// planner that rewrote, added or deleted a file INSIDE a folder would still
		// have passed. The claim is byte-identity, so the comparison is now over every
		// file path under docs/ and the sha256 of each file's contents.
		const before = docsFingerprint(r.repo);
		assert.equal(Object.keys(before).length, 4, `the fixture's four md files must all be fingerprinted, got ${Object.keys(before).length}`);
		planMigration(r.repo);
		planMigration(r.repo);
		assert.deepEqual(docsFingerprint(r.repo), before, 'planning must leave every file and every byte untouched');
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

// ---------------------------------------------------------------------------
// S001/t6a — the three live-repo gaps the four-folder fixture did NOT reproduce.
//
// Run against the real repo, t6 converged nothing for the three in-flight
// bugfix items: all three kept an extra folder. seedFourFolders missed the
// mechanisms because it is too TIDY — it gives every member the SAME epicSlug
// and a marker on EVERY md. The live store does neither:
//
//   1. ISSUE was absent from parseArtifactId's kind alternation, so the
//      definition head of every bugfix item was discarded as "not a
//      relocatable artifact" and never joined its own group. (The tidy fixture
//      hid this: the ISSUE sat in the folder that won the vote anyway, so the
//      folder count still ended at 1 with the ISSUE invisible — a vacuity in
//      the original t6 test, now closed by HEAD_SLUG differing from the rest.)
//   2. Each stage re-derived its own epicSlug from its own focus, so members
//      disagree; the winner was whichever sorted first, and `BUILD-` sorts
//      before `ISSUE-`.
//   3. Rendered BUILD/CR md carries NO insrc:artifact marker, and a nested
//      filename is the bare `<KIND>.md`, so a marker-only index cannot see it.
// ---------------------------------------------------------------------------

const HEAD_SLUG  = 'the-definition-head-label';   // the ISSUE's own slug — must win
const DRIFT_SLUG = 'a-later-stage-label';         // what LLD/PLAN re-derived
const STALE_SLUG = 'a-stale-ledger-label';        // what the BUILD carries; sorts FIRST

/** Reproduces the live shape: a disagreeing slug per stage, and a markerless
 *  BUILD md in a raw-hash folder under the WRONG top-level. */
function seedDisagreeingSlugs(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t6a-'));
	const wr = (rel: string, body: string): void => {
		const abs = join(repo, rel);
		mkdirSync(join(abs, '..'), { recursive: true });
		writeFileSync(abs, body);
	};
	const meta = (slug: string | undefined, storyId?: string): string => JSON.stringify({
		meta: {
			epicHash: T6_HASH, standalone: true, createdAt: T6_ANCHOR, epicCreatedAt: T6_ANCHOR,
			...(slug !== undefined ? { epicSlug: slug } : {}),
			...(storyId !== undefined ? { storyId } : {}),
		},
		body: {},
	});
	const md = (id: string): string => `${artifactIdMarker(id)}\n\n# ${id}\n`;

	wr(`.insrc/artifacts/ISSUE-${T6_HASH}.json`,      meta(HEAD_SLUG));
	wr(`.insrc/artifacts/LLD-${T6_HASH}-S001.json`,   meta(DRIFT_SLUG, 'S001'));
	wr(`.insrc/artifacts/PLAN-${T6_HASH}-S001.json`,  meta(DRIFT_SLUG, 'S001'));
	wr(`.insrc/artifacts/BUILD-${T6_HASH}-S001.json`, meta(STALE_SLUG, 'S001'));

	wr(`docs/standalone/${HEAD_SLUG}-${T6_SEG}/ISSUE.md`,       md(`ISSUE-${T6_HASH}`));
	wr(`docs/standalone/${DRIFT_SLUG}-${T6_SEG}/S001/LLD.md`,   md(`LLD-${T6_HASH}-S001`));
	wr(`docs/epics/${DRIFT_SLUG}-${T6_SEG}/S001/PLAN.md`,       md(`PLAN-${T6_HASH}-S001`));
	// MARKERLESS, raw-hash label, wrong top-level — all three at once, as live.
	wr(`docs/epics/${T6_HASH}-${T6_SEG}/S001/BUILD.md`,         '# Build (plan-driven) — Story S001\n');

	gitInit(repo);
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('t6a — the ISSUE is enumerated as the work item definition head (not discarded as a non-artifact)', () => {
	const { repo, cleanup } = seedDisagreeingSlugs();
	try {
		const plan = planMigration(repo);
		// The ISSUE must appear in the group's resolution — neither unmappable nor
		// silently absent. It is already at its destination, so the proof that it
		// was SEEN is that its slug is the one every sibling moves TO.
		assert.equal(
			plan.unmappable.filter(u => u.artifactId.startsWith('ISSUE-')).length, 0,
			'the ISSUE must not be unmappable',
		);
		const lld = plan.moves.find(m => m.from.endsWith('LLD.md'));
		assert.ok(lld, 'the drifted LLD must be scheduled to move');
		assert.ok(
			lld.to.includes(`${HEAD_SLUG}-${T6_SEG}`),
			`LLD must converge onto the ISSUE's folder, got ${lld.to}`,
		);
	} finally { cleanup(); }
});

test('t6a — the definition head WINS the slug vote over a sorted-earlier ledger slug', () => {
	const { repo, cleanup } = seedDisagreeingSlugs();
	try {
		const plan = planMigration(repo);
		// `BUILD-` < `ISSUE-` < `LLD-` < `PLAN-`, so a first-wins scan over
		// sorted members would pick the BUILD's STALE_SLUG, and a majority vote
		// would pick DRIFT_SLUG (held by two members). Both must lose to the head.
		for (const m of plan.moves) {
			assert.ok(
				m.to.includes(`${HEAD_SLUG}-${T6_SEG}`),
				`every destination must use the head slug, got ${m.to}`,
			);
			assert.ok(!m.to.includes(STALE_SLUG), 'the ledger slug must not name the folder');
			assert.ok(!m.to.includes(DRIFT_SLUG), 'the later-stage slug must not name the folder');
		}
		assert.ok(plan.moves.length >= 3, `expected the three misplaced md to move, got ${plan.moves.length}`);
	} finally { cleanup(); }
});

test('t6a — a MARKERLESS nested BUILD md is located by its (kind, hash8, story) shape, not reported missing', () => {
	const { repo, cleanup } = seedDisagreeingSlugs();
	try {
		const plan = planMigration(repo);
		assert.equal(
			plan.unmappable.filter(u => u.artifactId.startsWith('BUILD-')).length, 0,
			'the markerless BUILD must not be unmappable — its path carries its identity',
		);
		const build = plan.moves.find(m => m.from.endsWith('BUILD.md'));
		assert.ok(build, 'the markerless BUILD must be scheduled to move');
		assert.ok(
			build.from.includes(`docs/epics/${T6_HASH}-${T6_SEG}`),
			`must be found at its raw-hash wrong-top-level path, got ${build.from}`,
		);
		assert.ok(build.to.includes(`docs/standalone/${HEAD_SLUG}-${T6_SEG}/S001/BUILD.md`), build.to);
	} finally { cleanup(); }
});

test('t6a — end to end: the disagreeing work item converges onto exactly ONE folder', () => {
	const { repo, cleanup } = seedDisagreeingSlugs();
	try {
		// PRECONDITION asserted first, so the end state cannot pass vacuously on a
		// fixture that only ever had one folder.
		assert.equal(foldersForSegment(repo).length, 4, `fixture must start forked, got ${foldersForSegment(repo).join(', ')}`);
		applyMigration(repo, planMigration(repo));
		assert.deepEqual(
			foldersForSegment(repo),
			[`docs/standalone/${HEAD_SLUG}-${T6_SEG}`],
			'exactly one folder, named for the definition head',
		);
	} finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// S001/t8 — link rewriting for CONVERGENCE.
//
// Found by the post-build validate gate: the rewrite scan only ever looked at
// files that were themselves moving. Convergence breaks exactly that assumption.
// When several folders merge, the artifact ALREADY in the destination folder does
// not move — and it is usually the ISSUE, the document most likely to link to its
// own Story's LLD and PLAN. Its links kept pointing at paths that no longer
// existed, and no test covered it.
// ---------------------------------------------------------------------------

/** The GOOD folder is the destination, so its ISSUE.md does NOT move — and it
 *  links to the LLD and PLAN, which do. */
function seedConvergenceWithLinks(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t8-links-'));
	const wr = (rel: string, body: string): void => {
		const abs = join(repo, rel);
		mkdirSync(join(abs, '..'), { recursive: true });
		writeFileSync(abs, body);
	};
	const meta = (storyId?: string): string => JSON.stringify({
		meta: {
			epicHash: T6_HASH, epicSlug: GOOD, standalone: true,
			createdAt: T6_ANCHOR, epicCreatedAt: T6_ANCHOR,
			...(storyId !== undefined ? { storyId } : {}),
		},
		body: {},
	});
	const md = (id: string, extra = ''): string => `${artifactIdMarker(id)}\n\n# ${id}\n\n${extra}\n`;

	wr(`.insrc/artifacts/ISSUE-${T6_HASH}.json`,    meta());
	wr(`.insrc/artifacts/LLD-${T6_HASH}-S001.json`, meta('S001'));
	wr(`.insrc/artifacts/PLAN-${T6_HASH}-S001.json`, meta('S001'));

	// The ISSUE is ALREADY at its destination — it will not move.
	const lldOld  = `docs/standalone/${DRIFTED}-${T6_SEG}/S001/LLD.md`;
	const planOld = `docs/epics/${DRIFTED}-${T6_SEG}/S001/PLAN.md`;
	wr(`docs/standalone/${GOOD}-${T6_SEG}/ISSUE.md`, md(`ISSUE-${T6_HASH}`,
		`See the [design](${lldOld}) and the [plan](${planOld}).`));
	wr(lldOld,  md(`LLD-${T6_HASH}-S001`));
	wr(planOld, md(`PLAN-${T6_HASH}-S001`));

	gitInit(repo);
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('t8 — a link in an UNMOVED file pointing at a moved path is rewritten', () => {
	const { repo, cleanup } = seedConvergenceWithLinks();
	const issueMd = join(repo, `docs/standalone/${GOOD}-${T6_SEG}/ISSUE.md`);
	try {
		const plan = planMigration(repo);
		// PRECONDITION: the ISSUE really does not move, so this cannot pass by the
		// old "scan the moved files" path.
		assert.ok(
			!plan.moves.some(m => m.from === issueMd),
			'the ISSUE must NOT be among the moves — that is the whole point',
		);
		const forIssue = plan.linkRewrites.filter(lr => lr.file === issueMd);
		assert.equal(forIssue.length, 2, `both links in the unmoved ISSUE must be rewritten, got ${JSON.stringify(forIssue)}`);

		applyMigration(repo, plan);

		const after = readFileSync(issueMd, 'utf8');
		assert.ok(!after.includes(DRIFTED), `no stale path may survive:\n${after}`);
		assert.ok(after.includes(`docs/standalone/${GOOD}-${T6_SEG}/S001/LLD.md`), after);
		assert.ok(after.includes(`docs/standalone/${GOOD}-${T6_SEG}/S001/PLAN.md`), after);
	} finally { cleanup(); }
});

test('t8 — a file never rewrites a reference to its OWN old path', () => {
	// Its move already relocates it; applyMigration reads it at the destination.
	const { repo, cleanup } = seedConvergenceWithLinks();
	try {
		const plan = planMigration(repo);
		for (const lr of plan.linkRewrites) {
			assert.notEqual(
				lr.from, relative(repo, lr.file),
				`a file must not rewrite its own old path: ${JSON.stringify(lr)}`,
			);
		}
	} finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// S001/t9 — COMPANION files travel with their artifact.
//
// Found by applying the migration to this repo: convergence reduced 33 forked
// segments to 13, and most of the survivors were folders kept alive by a single
// orphaned companion — an er-model.html or ux-mock.html whose LLD had moved out
// from under it. The migration indexed only `.md`, so companions never moved.
// ---------------------------------------------------------------------------

function seedWithCompanion(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t9-comp-'));
	const wr = (rel: string, body: string): void => {
		const abs = join(repo, rel);
		mkdirSync(join(abs, '..'), { recursive: true });
		writeFileSync(abs, body);
	};
	const meta = (storyId?: string): string => JSON.stringify({
		meta: {
			epicHash: T6_HASH, epicSlug: GOOD, standalone: true,
			createdAt: T6_ANCHOR, epicCreatedAt: T6_ANCHOR,
			...(storyId !== undefined ? { storyId } : {}),
		},
		body: {},
	});
	wr(`.insrc/artifacts/ISSUE-${T6_HASH}.json`,    meta());
	wr(`.insrc/artifacts/LLD-${T6_HASH}-S001.json`, meta('S001'));

	wr(`docs/standalone/${GOOD}-${T6_SEG}/ISSUE.md`, `${artifactIdMarker(`ISSUE-${T6_HASH}`)}\n\n# issue\n`);
	// The LLD is in the DRIFTED folder, with its companion beside it.
	wr(`docs/standalone/${DRIFTED}-${T6_SEG}/S001/LLD.md`, `${artifactIdMarker(`LLD-${T6_HASH}-S001`)}\n\n# lld\n`);
	wr(`docs/standalone/${DRIFTED}-${T6_SEG}/S001/er-model.html`, '<!doctype html><title>er</title>');
	wr(`docs/standalone/${DRIFTED}-${T6_SEG}/S001/ux-mock.html`,  '<!doctype html><title>ux</title>');
	gitInit(repo);
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('t9 — a companion moves WITH its artifact, so no folder survives on an orphaned html', () => {
	const { repo, cleanup } = seedWithCompanion();
	try {
		assert.equal(foldersForSegment(repo).length, 2, 'fixture must start forked');
		const plan = planMigration(repo);
		const companions = plan.moves.filter(m => m.kind === 'COMPANION');
		assert.equal(companions.length, 2, `both companions must move, got ${JSON.stringify(companions.map(c => c.from))}`);
		// A companion is chunked with its own work item, not orphaned into its own.
		for (const c of companions) assert.equal(c.groupHash, T6_HASH, 'a companion inherits its artifact\'s group');

		applyMigration(repo, plan);

		assert.deepEqual(
			foldersForSegment(repo), [`docs/standalone/${GOOD}-${T6_SEG}`],
			'exactly one folder — the companions must not strand the old one',
		);
		assert.ok(existsSync(join(repo, `docs/standalone/${GOOD}-${T6_SEG}/S001/er-model.html`)));
		assert.ok(existsSync(join(repo, `docs/standalone/${GOOD}-${T6_SEG}/S001/ux-mock.html`)));
	} finally { cleanup(); }
});

test('t9 — a companion is never overwritten at its destination', () => {
	const { repo, cleanup } = seedWithCompanion();
	try {
		// Pre-place a DIFFERENT er-model.html at the destination.
		const dest = join(repo, `docs/standalone/${GOOD}-${T6_SEG}/S001`);
		mkdirSync(dest, { recursive: true });
		writeFileSync(join(dest, 'er-model.html'), 'PRE-EXISTING — must survive');
		// applyMigration requires a clean tree, so the pre-placed file must be committed.
		execFileSync('git', ['add', '-A'], { cwd: repo, encoding: 'utf8' });
		execFileSync('git', ['commit', '-q', '-m', 'pre-existing companion'], { cwd: repo, encoding: 'utf8' });
		const plan = planMigration(repo);
		assert.ok(
			!plan.moves.some(m => m.kind === 'COMPANION' && m.to === join(dest, 'er-model.html')),
			'must not schedule a move onto an existing companion',
		);
		applyMigration(repo, plan);
		assert.equal(readFileSync(join(dest, 'er-model.html'), 'utf8'), 'PRE-EXISTING — must survive');
	} finally { cleanup(); }
});

test('t9 — a DUPLICATE render is skipped, not moved and not refused, and neither copy is lost', () => {
	// Applying to this repo aborted a 57-move run with `git mv: fatal: destination
	// exists` when one artifact turned out to be rendered at TWO paths. Refusing the
	// plan would re-introduce all-or-nothing blocking; moving fails hard; picking a
	// winner would destroy a render. So: skip, keep both, log.
	const { repo, cleanup } = seedFourFolders();
	try {
		// Give the LLD a second render at its own destination, with different content.
		const dest = join(repo, `docs/standalone/${GOOD}-${T6_SEG}/S001`);
		mkdirSync(dest, { recursive: true });
		writeFileSync(join(dest, 'LLD.md'), `${artifactIdMarker(`LLD-${T6_HASH}-S001`)}\n\n# a SECOND render\n`);
		execFileSync('git', ['add', '-A'], { cwd: repo, encoding: 'utf8' });
		execFileSync('git', ['commit', '-q', '-m', 'second render'], { cwd: repo, encoding: 'utf8' });

		const plan = planMigration(repo);
		assert.equal(plan.unmappable.length, 0, 'a duplicate must NOT block the plan');
		assert.ok(
			!plan.moves.some(m => m.to === join(dest, 'LLD.md')),
			'no move may target a path that already holds a different file',
		);
		// The rest of the plan still applies — this is the property the abort destroyed.
		applyMigration(repo, plan);
		assert.ok(existsSync(join(dest, 'LLD.md')), 'the destination render survives');
		assert.ok(
			existsSync(join(repo, `docs/standalone/${DRIFTED}-${T6_SEG}/S001/LLD.md`)),
			'and so does the other one — nothing is destroyed',
		);
	} finally { cleanup(); }
});

test('t9 — an ORPHANED companion is placed from its work item, with no sibling md move to follow', () => {
	// After a first convergence pass the artifact md has already moved, so there is
	// no sibling move left to inherit a destination from and the companion sits
	// alone keeping its old folder alive. Two such folders survived on this repo.
	const { repo, cleanup } = seedFourFolders();
	try {
		applyMigration(repo, planMigration(repo));               // pass 1: md converges
		assert.deepEqual(foldersForSegment(repo), [`docs/standalone/${GOOD}-${T6_SEG}`]);

		// Now strand a companion in a fresh, md-less folder for the SAME segment.
		const orphanDir = join(repo, `docs/standalone/${DRIFTED}-${T6_SEG}/S001`);
		mkdirSync(orphanDir, { recursive: true });
		writeFileSync(join(orphanDir, 'er-model.html'), '<!doctype html><title>stranded</title>');
		execFileSync('git', ['add', '-A'], { cwd: repo, encoding: 'utf8' });
		execFileSync('git', ['commit', '-q', '-m', 'stranded companion'], { cwd: repo, encoding: 'utf8' });
		assert.equal(foldersForSegment(repo).length, 2, 'precondition: the stranded companion forks the segment again');

		const plan = planMigration(repo);
		const comp = plan.moves.filter(m => m.kind === 'COMPANION');
		assert.equal(comp.length, 1, `the orphan must be scheduled, got ${JSON.stringify(plan.moves)}`);
		assert.ok(comp[0]!.to.includes(`${GOOD}-${T6_SEG}`), comp[0]!.to);

		applyMigration(repo, plan);
		assert.deepEqual(
			foldersForSegment(repo), [`docs/standalone/${GOOD}-${T6_SEG}`],
			'one folder again — a stranded companion must not keep a folder alive',
		);
		assert.ok(existsSync(join(repo, `docs/standalone/${GOOD}-${T6_SEG}/S001/er-model.html`)));
	} finally { cleanup(); }
});
