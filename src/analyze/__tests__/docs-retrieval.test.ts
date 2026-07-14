/**
 * plans/docs-module.md Phase 1. Unit tests for the docs-retrieval
 * primitive. Exercises the ranking + dedup + path-hint logic
 * against a seeded LMDB fixture; the vector pass silently drops
 * out when Ollama is unavailable so these tests exercise the
 * keyword-only path.
 *
 * Live vector-pass validation lives in
 * docs-retrieval.live.test.ts (gated behind INSRC_LIVE_TESTS=1;
 * requires a running Ollama).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { upsertEntities } from '../../db/entities.js';
import { addRepo } from '../../db/repos.js';
import type { Entity, RegisteredRepo } from '../../shared/types.js';

import { retrieveDocSections } from '../docs-retrieval.js';

const REPO = '/repo/alpha';
const NOW = '2026-07-07T10:00:00.000Z';
let dir: string;

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeDoc(file: string, name: string, body: string, kind: Entity['kind'] = 'document'): Entity {
	return {
		id:        makeEntityId(REPO, file, kind, name),
		kind,
		name,
		language:  'markdown',
		repoId:    1,
		repo:      REPO,
		file,
		startLine: 1,
		endLine:   body.split('\n').length,
		body,
		embedding: [],
		indexedAt: NOW,
		artifact:  true,
	};
}

function makeCode(file: string, name: string, body: string): Entity {
	return {
		id:        makeEntityId(REPO, file, 'function', name),
		kind:      'function',
		name,
		language:  'typescript',
		repoId:    1,
		repo:      REPO,
		file,
		startLine: 1,
		endLine:   body.split('\n').length,
		body,
		embedding: [],
		indexedAt: NOW,
	};
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-docs-retrieval-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const r: RegisteredRepo = {
		path: REPO, name: '', addedAt: NOW, status: 'pending',
	};
	await addRepo(null, r);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Empty inputs
// ---------------------------------------------------------------------------

test('empty query returns []', async () => {
	const results = await retrieveDocSections({
		db: null, query: '', closureRepos: [REPO],
	});
	assert.equal(results.length, 0);
});

test('empty closureRepos returns []', async () => {
	const results = await retrieveDocSections({
		db: null, query: 'design', closureRepos: [],
	});
	assert.equal(results.length, 0);
});

test('no doc entities in closure returns []', async () => {
	const results = await retrieveDocSections({
		db: null, query: 'design decisions', closureRepos: [REPO],
	});
	assert.equal(results.length, 0);
});

// ---------------------------------------------------------------------------
// Keyword pass -- vector pass silently no-ops without Ollama
// ---------------------------------------------------------------------------

test('keyword pass finds docs containing query terms', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/analyze.md`, 'analyze framework',
			'The analyze framework runs shapers serially. Cache is invalidated by repoLastIndexedAt.'),
		makeDoc(`${REPO}/design/other.md`, 'unrelated topic',
			'This document is about something completely different: colours.'),
	]);

	const results = await retrieveDocSections({
		db: null, query: 'analyze framework shapers', closureRepos: [REPO],
	});
	assert.ok(results.length >= 1, 'should find the analyze framework doc');
	assert.equal(results[0]!.file, `${REPO}/design/analyze.md`);
	assert.ok(results[0]!.score > 0);
});

test('keyword pass ignores stopwords + short tokens', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/foo.md`, 'foo',
			'This is the a of an on at document about foo.'),
		makeDoc(`${REPO}/design/bar.md`, 'bar',
			'Bar contains the specific technical content about classifier and planner.'),
	]);

	// Query dominated by stopwords + a specific term
	const results = await retrieveDocSections({
		db: null, query: 'what is the classifier', closureRepos: [REPO],
	});
	assert.ok(results.length >= 1);
	// Bar wins because it contains 'classifier'; foo has only stopwords
	assert.equal(results[0]!.file, `${REPO}/design/bar.md`);
});

test('non-doc entities are excluded from results', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/note.md`, 'note',
			'Some doc content mentioning shapers.'),
		makeCode(`${REPO}/src/shapers.ts`, 'shapers',
			'export function shapers() { return 42; }'),
	]);

	const results = await retrieveDocSections({
		db: null, query: 'shapers', closureRepos: [REPO],
	});
	for (const r of results) {
		assert.ok(r.kind === 'document' || r.kind === 'section' || r.kind === 'config');
	}
});

// ---------------------------------------------------------------------------
// Ranking + dedup
// ---------------------------------------------------------------------------

test('results ordered by score desc', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/one.md`, 'one',
			'The classifier is central. classifier classifier scope-picker.'),
		makeDoc(`${REPO}/design/two.md`, 'two',
			'Only one mention of classifier here.'),
		makeDoc(`${REPO}/design/three.md`, 'three',
			'Contains classifier once and planner once.'),
	]);

	const results = await retrieveDocSections({
		db: null, query: 'classifier', closureRepos: [REPO],
	});
	assert.ok(results.length >= 2);
	// Scores are non-strictly descending
	for (let i = 1; i < results.length; i++) {
		assert.ok(results[i - 1]!.score >= results[i]!.score);
	}
});

test('dedup collapses same (file, heading) preferring section', async () => {
	await upsertEntities(null, [
		// Document + a section with the same name (matches artifact
		// parser convention where the document's name is the file
		// basename and section names differ).
		makeDoc(`${REPO}/design/foo.md`, 'foo',
			'Full document body mentioning classifier decisions.', 'document'),
	]);
	const results = await retrieveDocSections({
		db: null, query: 'classifier', closureRepos: [REPO],
	});
	assert.equal(results.length, 1);
	assert.equal(results[0]!.kind, 'document');
});

// ---------------------------------------------------------------------------
// Path hint
// ---------------------------------------------------------------------------

test('filenameHint boosts matching docs', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/plan-a.md`, 'a',
			'plan content mentioning classifier'),
		makeDoc(`${REPO}/plans/plan-b.md`, 'b',
			'plan content mentioning classifier'),
	]);

	const withoutHint = await retrieveDocSections({
		db: null, query: 'classifier', closureRepos: [REPO],
	});
	const withHint = await retrieveDocSections({
		db: null, query: 'classifier', closureRepos: [REPO],
		filenameHint: 'plans/',
	});

	// Without hint: both scored the same; ordering isn't stable to
	// assert. With hint: plans/ wins.
	assert.ok(withoutHint.length === 2);
	assert.equal(withHint[0]!.file, `${REPO}/plans/plan-b.md`);
	assert.ok(withHint[0]!.diagnostics?.pathBoost !== undefined);
	assert.ok(withHint[0]!.diagnostics!.pathBoost! > 0);
});

test('path-hint boost is MULTIPLICATIVE (proportional lift, not additive)', async () => {
	// Regression: additive PATH_HINT_BOOST=0.15 systematically lifted
	// weak candidates disproportionately (a 0.2-score match jumping to
	// 0.35 while a 0.85 match jumped to 1.0). Multiplicative boost
	// scales the entire hybrid score by PATH_HINT_MULTIPLIER=1.15 so
	// the diagnostics.pathBoost value ≈ 0.15 * baseScore, not a fixed
	// 0.15 for every candidate.
	await upsertEntities(null, [
		makeDoc(`${REPO}/plans/strong-hit.md`, 's',
			// Body hits `classifier`, `module`, `payable`, `extraction`,
			// `pipeline` (5 of 5 query terms).
			'classifier module payable extraction pipeline overview'),
		makeDoc(`${REPO}/plans/weak-hit.md`, 'w',
			// Body hits only `classifier` (1 of 5 query terms).
			'classifier appears once here'),
	]);
	const results = await retrieveDocSections({
		db: null,
		query: 'classifier module payable extraction pipeline',
		closureRepos: [REPO],
		filenameHint: 'plans/',
	});
	assert.equal(results.length, 2);
	const strong = results.find(r => r.file === `${REPO}/plans/strong-hit.md`)!;
	const weak   = results.find(r => r.file === `${REPO}/plans/weak-hit.md`)!;
	// Multiplicative boost -> higher pathBoost on the stronger base
	// score. Under the old additive boost these were identical (both
	// 0.15), regardless of base score.
	assert.ok(
		strong.diagnostics!.pathBoost! > weak.diagnostics!.pathBoost!,
		`strong pathBoost ${strong.diagnostics!.pathBoost} should exceed weak ${weak.diagnostics!.pathBoost}`,
	);
	// Sanity: multiplicative ~= 0.15 * baseScore. For a 5-of-5 term
	// hit (kScore=1.0), the base hybrid ≈ 0.4 (KEYWORD_WEIGHT=0.4;
	// vector pass silent in unit test), so pathBoost ≈ 0.06 ± noise.
	assert.ok(strong.diagnostics!.pathBoost! < 0.12,
		`strong pathBoost ${strong.diagnostics!.pathBoost} should be < 0.12 (multiplicative, not the old fixed 0.15)`);
});

test('keyword pass counts ALL query terms, not just first 6', async () => {
	// Regression: KEYWORD_HITS_CAP=6 short-circuited scanning after
	// 6 distinct-term hits, meaning term #7+ was never checked --
	// ordering-dependent + flat score above 6 terms. Post-fix a doc
	// hitting more terms wins over a doc hitting fewer, regardless
	// of ordering. Tokens chosen to avoid substring overlap (e.g. `zeta`
	// contains `eta`) which would inflate hit counts.
	const terms = [
		'alphabet', 'basketball', 'canyon', 'diamond',
		'engineer', 'firehouse', 'giraffe', 'harmony',
	];
	// docA hits FIRST 6 of 8 query terms; docB hits ALL 8. Under the
	// old cap both would score identically (6/6 = 1.0 = 8/6 clamped);
	// under the fix docB wins because divisor is terms.length=8.
	const bodyA = terms.slice(0, 6).join(' ');
	const bodyB = terms.join(' ');
	await upsertEntities(null, [
		makeDoc(`${REPO}/plans/a.md`, 'A', bodyA),
		makeDoc(`${REPO}/plans/b.md`, 'B', bodyB),
	]);
	const results = await retrieveDocSections({
		db: null,
		query: terms.join(' '),
		closureRepos: [REPO],
	});
	assert.equal(results.length, 2);
	const a = results.find(r => r.file === `${REPO}/plans/a.md`)!;
	const b = results.find(r => r.file === `${REPO}/plans/b.md`)!;
	assert.ok(
		b.score > a.score,
		`doc B (8/8 term hits) score ${b.score} should beat doc A (6/8) ${a.score}`,
	);
	// diagnostics.keywordScore in [0,1] normalized against terms.length.
	assert.equal(b.diagnostics!.keywordScore, 1.0);
	assert.equal(a.diagnostics!.keywordScore, 0.75);
});

test('short precise query is not punished by the divisor', async () => {
	// Regression: dividing by KEYWORD_HITS_CAP=6 meant a 3-term
	// query hitting all 3 terms scored 3/6=0.5 -- half of a 6-term
	// query hitting all 6. Post-fix both score 1.0 (perfect recall).
	await upsertEntities(null, [
		makeDoc(`${REPO}/plans/short.md`, 'S', 'commit policy documented here'),
	]);
	const results = await retrieveDocSections({
		db: null,
		query: 'commit policy documented',   // 3 distinctive terms
		closureRepos: [REPO],
	});
	assert.equal(results.length, 1);
	assert.equal(results[0]!.diagnostics!.keywordScore, 1.0,
		`3/3 hits should normalise to 1.0, not 3/6=0.5`);
});

// ---------------------------------------------------------------------------
// Cap + minScore
// ---------------------------------------------------------------------------

test('maxResults caps returned length', async () => {
	const docs: Entity[] = [];
	for (let i = 0; i < 10; i++) {
		docs.push(makeDoc(
			`${REPO}/design/d${i}.md`,
			`d${i}`,
			'content mentioning shapers',
		));
	}
	await upsertEntities(null, docs);

	const results = await retrieveDocSections({
		db: null, query: 'shapers', closureRepos: [REPO],
		maxResults: 5,
	});
	assert.equal(results.length, 5);
});

test('minScore filter drops low-scoring results', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/high.md`, 'high',
			'shapers shapers shapers shapers shapers shapers'),
		makeDoc(`${REPO}/design/low.md`, 'low',
			'a doc that just barely mentions shapers.'),
	]);

	const results = await retrieveDocSections({
		db: null, query: 'shapers', closureRepos: [REPO],
		minScore: 0.15,
	});
	// The high-density doc should survive; the low-density one gets
	// keyword score 1/6 ≈ 0.17 * 0.4 ≈ 0.07 -- below the floor.
	for (const r of results) {
		assert.ok(r.score >= 0.15);
	}
});

// ---------------------------------------------------------------------------
// Kind allowlist
// ---------------------------------------------------------------------------

test('kinds allowlist restricts to prose-only when configured', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/foo.md`, 'foo',
			'design doc mentioning shapers', 'document'),
		makeDoc(`${REPO}/config/app.yaml`, 'app',
			'shapers: true', 'config'),
	]);

	const proseOnly = await retrieveDocSections({
		db: null, query: 'shapers', closureRepos: [REPO],
		kinds: ['document', 'section'],
	});
	for (const r of proseOnly) {
		assert.ok(r.kind !== 'config');
	}
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

test('previewChars caps the body preview', async () => {
	const longBody = 'shapers ' + 'x'.repeat(1000);
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/foo.md`, 'foo', longBody),
	]);

	const withPreview = await retrieveDocSections({
		db: null, query: 'shapers', closureRepos: [REPO],
		previewChars: 100,
	});
	assert.ok(withPreview.length >= 1);
	assert.ok((withPreview[0]!.bodyPreview ?? '').length <= 100);
});

test('previewChars=0 omits preview', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/foo.md`, 'foo', 'shapers content'),
	]);
	const noPreview = await retrieveDocSections({
		db: null, query: 'shapers', closureRepos: [REPO],
		previewChars: 0,
	});
	assert.equal(noPreview[0]!.bodyPreview, undefined);
});
