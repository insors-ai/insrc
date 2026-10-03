/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the completion-side BUILD ledger hook
 * (ensureBuildRecordOnCompletion). Pure filesystem — a tmp repo with
 * .insrc/artifacts + docs/builds; no daemon. The changed-file seam is stubbed so
 * the change-log is deterministic without a real git repo.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/completion-record.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureBuildRecordOnCompletion } from '../completion-record.js';
import { persistStandaloneBuildRecord } from '../standalone-record.js';
import { artifactJsonPath, buildArtifactId } from '../../../storage.js';
import { parseBuildArtifactRef } from '../../../gates.js';

const HASH = 'e2c6705fd105d4ac';

async function withRepo(fn: (repo: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-completion-record-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	mkdirSync(join(repo, 'docs', 'builds'), { recursive: true });
	try { await fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

const readJson = (p: string): { meta: Record<string, unknown>; body: Record<string, unknown> } =>
	JSON.parse(readFileSync(p, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };

// ---------------------------------------------------------------------------
// create — no prior record + a changed set
// ---------------------------------------------------------------------------

test('create: no prior BUILD json + a changed set writes a plan-driven BUILD record with a 2-entry change-log', async () => {
	await withRepo(async (repo) => {
		const out = await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's2' }, async () => ['a.ts', 'b.ts']);
		assert.ok(out !== undefined, 'the hook returns the written paths');
		const json = artifactJsonPath(repo, buildArtifactId(HASH, 's2'));
		assert.ok(existsSync(json), 'the BUILD json exists');
		const rec = readJson(json);
		assert.equal(rec.meta['workflow'], 'build');
		// UPDATED by CR-2: this writer no longer asserts the route either. On a
		// first write with no prior the key is simply ABSENT, which every reader
		// treats as false (they all test `=== true`).
		// NARROWED by S001/t4: the key is absent HERE because this fixture has no
		// definition artifact to inherit from, not because the writer never writes
		// it. When a readable DEF/ISSUE says standalone, the writer now stamps true
		// — see the t4 test below. Without this narrowing the assertion reads as an
		// unconditional 'never writes it', which would be false.
		assert.ok(!('standalone' in rec.meta), 'absent with no definition artifact to inherit from');
		assert.notEqual(rec.meta['standalone'], true, 'and this plan-driven record is certainly not standalone');
		assert.equal(rec.meta['epicHash'], HASH);
		assert.equal(rec.meta['storyId'], 's2');
		assert.equal((rec.body['changeLog'] as unknown[]).length, 2);
	});
});

// ---------------------------------------------------------------------------
// merge / idempotent — a second call keeps exactly ONE record
// ---------------------------------------------------------------------------

test('merge/idempotent: calling twice keeps exactly ONE BUILD json for the id', async () => {
	await withRepo(async (repo) => {
		await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's2' }, async () => ['a.ts']);
		await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's2' }, async () => ['a.ts', 'c.ts']);
		const dir = join(repo, '.insrc', 'artifacts');
		const matches = readdirSync(dir).filter((f) => f === `${buildArtifactId(HASH, 's2')}.json`);
		assert.deepEqual(matches, [`${buildArtifactId(HASH, 's2')}.json`]);
		assert.equal(matches.length, 1, 'exactly one record for the id');
	});
});

// ---------------------------------------------------------------------------
// empty — an empty changed set omits the changeLog slot
// ---------------------------------------------------------------------------

test('empty: an empty changed set writes a record with NO changeLog key', async () => {
	await withRepo(async (repo) => {
		const out = await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's2' }, async () => []);
		assert.ok(out !== undefined);
		const rec = readJson(artifactJsonPath(repo, buildArtifactId(HASH, 's2')));
		assert.ok(!('changeLog' in rec.body), 'no changeLog key on an empty changed set');
	});
});

// ---------------------------------------------------------------------------
// failure swallow — the collector swallows a listChanged throw to []
// ---------------------------------------------------------------------------

test('failure swallow: a throwing listChanged still writes a record (no changeLog) and does NOT throw', async () => {
	await withRepo(async (repo) => {
		let out: { readonly md: string; readonly json: string } | undefined;
		await assert.doesNotReject(async () => {
			out = await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's2' }, async () => {
				throw new Error('boom');
			});
		});
		assert.ok(out !== undefined, 'a record is still written (collector swallows the throw to [])');
		const rec = readJson(artifactJsonPath(repo, buildArtifactId(HASH, 's2')));
		assert.ok(!('changeLog' in rec.body));
	});
});

// ---------------------------------------------------------------------------
// no-op — an unresolvable ref never writes a BUILD-undefined path
// ---------------------------------------------------------------------------

test('no-op: an empty epicHash returns undefined and writes no file', async () => {
	await withRepo(async (repo) => {
		const out = await ensureBuildRecordOnCompletion(repo, { epicHash: '', storyId: 's1' }, async () => ['a.ts']);
		assert.equal(out, undefined);
		assert.equal(readdirSync(join(repo, '.insrc', 'artifacts')).length, 0, 'no artifact written');
	});
});

// ---------------------------------------------------------------------------
// parse round-trip — buildArtifactId <-> parseBuildArtifactRef
// ---------------------------------------------------------------------------

test('parse round-trip: buildArtifactId round-trips through parseBuildArtifactRef (incl. a hyphen-bearing storyId)', () => {
	const dir = '/tmp/x';
	assert.deepEqual(
		parseBuildArtifactRef(join(dir, buildArtifactId(HASH, 's2') + '.json')),
		{ epicHash: HASH, storyId: 's2' },
	);
	assert.deepEqual(
		parseBuildArtifactRef(join(dir, buildArtifactId('abc', 's2-x') + '.json')),
		{ epicHash: 'abc', storyId: 's2-x' },
	);
	// a non-BUILD basename and a missing story component yield undefined
	assert.equal(parseBuildArtifactRef(join(dir, `LLD-${HASH}-s2.json`)), undefined);
	assert.equal(parseBuildArtifactRef(join(dir, 'BUILD-onlyhash.json')), undefined);
});

// ---------------------------------------------------------------------------
// CR-2 — code-review finding on this Story (cold review of 9b14d95..e15ef63).
//
// t9 stopped the SHARED VALIDATE persist writing `meta.standalone` because it
// could not know which route it served. This writer had the identical defect and
// t9's worded scope missed it: it hard-wrote `standalone: false` too, and since
// mergeWithPrior is new-wins on meta, completing a standalone Story FLIPPED its
// record — relocating BUILD.md from docs/standalone/ to docs/epics/ and orphaning
// the original, while the json ended up self-contradictory (`standalone:false`
// with `sizeClass:'trivial'`).
//
// Not hypothetical: this repo carries the evidence, committed at 4d9ef09 — both
// docs/standalone/013e816250937aa5-…/S001/BUILD.md and
// docs/epics/013e816250937aa5-…/S001/BUILD.md exist for one Story.
//
// The title survived the flip because t8 keys it on sizeClass rather than on this
// flag — the belt-and-braces split working as designed, and the reason no
// existing assertion caught it.
// ---------------------------------------------------------------------------

test('CR-2: completing a STANDALONE Story keeps meta.standalone true and leaves BUILD.md in docs/standalone/ — no second, divergent record', async () => {
	await withRepo(async (repo) => {
		// The implement-phase write: a real trivial standalone record.
		const first = persistStandaloneBuildRecord(repo, {
			meta: {
				workflow: 'build', standalone: true, sizeClass: 'trivial',
				triageRationale: 'one-line mechanical edit',
				epicHash: HASH, storyId: 's2', createdAt: '2026-01-01T00:00:00.000Z',
			},
			body: { focus: 'Add a --json flag to the status subcommand.', producesLld: false },
		});
		assert.match(first.md, /\/docs\/standalone\//, 'precondition: the standalone record starts under docs/standalone/');

		// Completion runs on EVERY build approval, including this route.
		const out = await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's2' }, async () => ['a.ts']);
		assert.ok(out !== undefined, 'the completion hook wrote a record');

		const rec = readJson(artifactJsonPath(repo, buildArtifactId(HASH, 's2')));
		assert.equal(rec.meta['standalone'], true, 'completion does not re-label the route');
		assert.equal(rec.meta['sizeClass'], 'trivial', 'and the size class it was keyed on survives');
		assert.match(out.md, /\/docs\/standalone\//, 'the record stays in docs/standalone/');
		assert.equal(out.md, first.md, 'the SAME md file — not a second one in another folder');
		// The orphan is what made this visible in the real repo: two BUILD.md files
		// for one Story. Assert the epics folder was never created at all.
		assert.ok(!existsSync(join(repo, 'docs', 'epics')),
			'no docs/epics/ record is written for a standalone Story');
	});
});


// ---------------------------------------------------------------------------
// S001/t4 — the completion hook INHERITS the placement from the definition
// artifact. Added because a mutation showed the stamp was otherwise untested:
// every existing fixture lacks a definition artifact, so dropping the stamp
// changed no outcome.
// ---------------------------------------------------------------------------

const T4_ISSUE_HASH = 'f3e2d1c0b9a87654';

test('t4 — an ISSUE-anchored work item gets standalone true and lands under docs/standalone', async () => {
	await withRepo(async (repo) => {
		// A bugfix work item: ISSUE only, declaring itself standalone.
		writeFileSync(
			join(repo, '.insrc', 'artifacts', `ISSUE-${T4_ISSUE_HASH}.json`),
			JSON.stringify({ meta: { createdAt: '2026-10-02T12:00:00.000Z', epicSlug: 'a-real-label', standalone: true } }),
		);

		const out = await ensureBuildRecordOnCompletion(repo, { epicHash: T4_ISSUE_HASH, storyId: 'S001' }, async () => ['x.ts']);
		assert.ok(out !== undefined);

		const rec = readJson(artifactJsonPath(repo, buildArtifactId(T4_ISSUE_HASH, 'S001')));
		assert.equal(rec.meta['standalone'], true, 'the placement is inherited from the ISSUE, not omitted');
		assert.ok(out.md.includes('/docs/standalone/'), `expected a standalone placement, got ${out.md}`);
		assert.ok(!out.md.includes('/docs/epics/'));
	});
});

test('t4 — an epic-parented work item is unaffected: a DEF without the flag stays epic', async () => {
	await withRepo(async (repo) => {
		writeFileSync(
			join(repo, '.insrc', 'artifacts', `DEF-${T4_ISSUE_HASH}.json`),
			JSON.stringify({ meta: { createdAt: '2026-10-02T12:00:00.000Z', epicSlug: 'an-epic' } }),
		);
		const out = await ensureBuildRecordOnCompletion(repo, { epicHash: T4_ISSUE_HASH, storyId: 's1' }, async () => ['x.ts']);
		assert.ok(out !== undefined);
		const rec = readJson(artifactJsonPath(repo, buildArtifactId(T4_ISSUE_HASH, 's1')));
		assert.ok(!('standalone' in rec.meta), 'no flag is manufactured for an epic work item');
		assert.ok(out.md.includes('/docs/epics/'));
	});
});

test('t4 — an explicit standalone FALSE on the definition artifact is not written through as false', async () => {
	await withRepo(async (repo) => {
		// The guard is `=== true`, so a false must be omitted rather than asserted.
		// Writing false is what relocated a standalone record's markdown and
		// orphaned the original, which is the regression this keeps shut.
		writeFileSync(
			join(repo, '.insrc', 'artifacts', `DEF-${T4_ISSUE_HASH}.json`),
			JSON.stringify({ meta: { createdAt: '2026-10-02T12:00:00.000Z', epicSlug: 'an-epic', standalone: false } }),
		);
		const out = await ensureBuildRecordOnCompletion(repo, { epicHash: T4_ISSUE_HASH, storyId: 's1' }, async () => ['x.ts']);
		assert.ok(out !== undefined);
		const rec = readJson(artifactJsonPath(repo, buildArtifactId(T4_ISSUE_HASH, 's1')));
		assert.ok(!('standalone' in rec.meta), 'false is OMITTED, never asserted');
	});
});
