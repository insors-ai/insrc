/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-93081bff91ae5108 / S001 / t6 — the Story range-base resolver.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/range-base.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { resolveStoryRangeBase } from '../range-base.js';
import { ARTIFACTS_DIR, lldArtifactId, planArtifactId } from '../../../storage.js';

const HASH = 'abc123def4567890';
const SHA40 = /^[0-9a-f]{40}$/;

function mkRepo(): { repo: string; git: (...a: string[]) => string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-rangebase-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
	git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
	writeFileSync(join(repo, 'seed.ts'), 'export const s = 1;\n');
	git('add', '.'); git('commit', '-qm', 'seed');
	return { repo, git, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

/** Write an artifact json with the given meta. */
function seedArtifact(repo: string, artifactId: string, meta: Record<string, unknown>): string {
	const rel = `${ARTIFACTS_DIR}/${artifactId}.json`;
	const abs = join(repo, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, JSON.stringify({ meta, body: {} }, null, 2) + '\n');
	return rel;
}

// ---------------------------------------------------------------------------
// 1. the STAMPED base wins
// ---------------------------------------------------------------------------

test('t6: the STAMPED base on the PLAN is used, without needing the artifact committed', () => {
	const s = mkRepo();
	try {
		const stamped = 'a'.repeat(40);
		seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan', rangeBase: stamped });
		// Deliberately NOT committed — this is the state that defeats a
		// history-based lookup, and the stamp exists precisely for it.
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 's1'), stamped);
	} finally { s.cleanup(); }
});

test('t6: a STANDALONE story resolves from its LLD stamp when there is no PLAN', () => {
	const s = mkRepo();
	try {
		const stamped = 'b'.repeat(40);
		seedArtifact(s.repo, lldArtifactId(HASH, 'S001'), { workflow: 'design.story', standalone: true, rangeBase: stamped });
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), stamped);
	} finally { s.cleanup(); }
});

test('t6: the PLAN stamp takes PRECEDENCE over the LLD stamp — one chain, one base', () => {
	const s = mkRepo();
	try {
		seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan', rangeBase: 'c'.repeat(40) });
		seedArtifact(s.repo, lldArtifactId(HASH, 's1'), { workflow: 'design.story', rangeBase: 'd'.repeat(40) });
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 's1'), 'c'.repeat(40),
			'the PLAN is the nearer upstream, so its base wins');
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// 2. the PLAN-INTRODUCING-COMMIT fallback (the pre-stamp records)
// ---------------------------------------------------------------------------

test('t6: a LEGACY record with NO stamp resolves via the PLAN-INTRODUCING COMMIT — the bfe98ff7 s4 repair method', () => {
	const s = mkRepo();
	try {
		// A plan with no rangeBase, COMMITTED — exactly the shape of the 648
		// artifacts written before the stamp existed.
		const rel = seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan' });
		s.git('add', '-A'); s.git('commit', '-qm', 'docs(workflow): PLAN approved');
		const planCommit = s.git('rev-parse', 'HEAD');
		// The Story's work lands AFTER.
		writeFileSync(join(s.repo, 'work.ts'), 'export const w = 1;\n');
		s.git('add', '-A'); s.git('commit', '-qm', 'the Story work');

		const base = resolveStoryRangeBase(s.repo, HASH, 's1');
		assert.match(String(base), SHA40);
		assert.equal(base, planCommit,
			'the base is the introducing commit ITSELF, not its parent: base..HEAD excludes base, and the work lands after the plan was committed');
		// And it genuinely bounds the Story's work.
		const ranged = s.git('diff', '--name-only', `${base}..HEAD`).split('\n').filter(Boolean);
		assert.deepEqual(ranged, ['work.ts'], 'base..HEAD is exactly the Story\'s work');
		assert.ok(rel.length > 0);
	} finally { s.cleanup(); }
});

test('t6: an APPROVED-BUT-UNCOMMITTED plan with no stamp yields UNDEFINED, not an error — the state this Story\'s own LLD was in', () => {
	const s = mkRepo();
	try {
		seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan', approvedAt: '2026-10-02T00:00:00.000Z' });
		// Never committed, and no stamp (a pre-t5 approval).
        let out: string | undefined | 'threw';
        try { out = resolveStoryRangeBase(s.repo, HASH, 's1'); } catch { out = 'threw'; }
		assert.equal(out, undefined, 'no stamp + never committed → undefined, and emphatically not a throw');
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// 3. honest absence — the deliberate divergence from the HEAD^ chain
// ---------------------------------------------------------------------------

test('t6: NO upstream at all (the TRIVIAL route) yields undefined — the specified outcome, not a failure', () => {
	const s = mkRepo();
	try {
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), undefined,
			'a trivial build has no plan and no LLD, so there is nothing to stamp or locate');
	} finally { s.cleanup(); }
});

test('t6: the resolver NEVER substitutes HEAD^ or the empty-tree object — the divergence from the code-review chain', () => {
	const s = mkRepo();
	try {
		writeFileSync(join(s.repo, 'later.ts'), 'export const l = 1;\n');
		s.git('add', '-A'); s.git('commit', '-qm', 'a second commit, so HEAD^ EXISTS and would resolve');
		const headParent = s.git('rev-parse', 'HEAD^');
		const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

		const base = resolveStoryRangeBase(s.repo, HASH, 's1');
		assert.equal(base, undefined, 'still undefined');
		assert.notEqual(base, headParent, 'NOT HEAD^ — that would silently describe the last commit as the Story\'s work');
		assert.notEqual(base, emptyTree, 'NOT the empty-tree object — that would describe the whole history');
	} finally { s.cleanup(); }
});

test('t6: git UNAVAILABLE / a non-git directory yields undefined without throwing', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-nogit-rb-'));
	try {
		seedArtifact(dir, planArtifactId(HASH, 's1'), { workflow: 'plan' });   // no stamp
		let out: string | undefined | 'threw';
		try { out = resolveStoryRangeBase(dir, HASH, 's1'); } catch { out = 'threw'; }
		assert.equal(out, undefined, 'the git lookup failing must not throw out of the resolver');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// 4. malformed / empty inputs
// ---------------------------------------------------------------------------

test('t6: an EMPTY-STRING stamp is treated as absent and falls through to the commit lookup', () => {
	const s = mkRepo();
	try {
		seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan', rangeBase: '' });
		s.git('add', '-A'); s.git('commit', '-qm', 'PLAN approved');
		const planCommit = s.git('rev-parse', 'HEAD');
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 's1'), planCommit,
			'an empty stamp is not a base — fall through rather than persist a malformed range');
	} finally { s.cleanup(); }
});

test('t6: a MALFORMED artifact json is treated as absent rather than throwing', () => {
	const s = mkRepo();
	try {
		const abs = join(s.repo, ARTIFACTS_DIR, `${planArtifactId(HASH, 's1')}.json`);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, '{ not valid json');
		let out: string | undefined | 'threw';
		try { out = resolveStoryRangeBase(s.repo, HASH, 's1'); } catch { out = 'threw'; }
		assert.equal(out, undefined);
	} finally { s.cleanup(); }
});

test('t6: an empty epicHash or storyId yields undefined without touching the filesystem or git', () => {
	const s = mkRepo();
	try {
		assert.equal(resolveStoryRangeBase(s.repo, '', 's1'), undefined);
		assert.equal(resolveStoryRangeBase(s.repo, HASH, ''), undefined);
	} finally { s.cleanup(); }
});
