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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
