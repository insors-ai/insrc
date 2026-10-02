/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Approval / rejection gate helpers.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/gates.test.ts
 */

import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
	approveArtifactByJsonPath,
	ArtifactMissingError,
	ArtifactNotApprovedError,
	jsonPathForMd,
	rejectArtifactByJsonPath,
	requireApprovedEpic,
} from '../gates.js';
import { defineArtifactPaths } from '../storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-17T07:42:28.275Z';   // → E20260717a3f4b8c9
const EPIC_SEGMENT = 'E20260717a3f4b8c9';

// ---------------------------------------------------------------------------
// jsonPathForMd — the nested (sc2) scheme resolves the hash-flat json ONLY via
// the embedded insrc:artifact marker; the bare <KIND>.md filename no longer
// encodes the id. Stub stays the side-by-side exception; json is a passthrough.
// ---------------------------------------------------------------------------

/** Seed a nested work-item md carrying its insrc:artifact marker, return its abs path. */
function seedNestedMd(repo: string, relFolder: string, kind: string, id: string): string {
	const md = join(repo, relFolder, `${kind}.md`);
	mkdirSync(dirname(md), { recursive: true });
	writeFileSync(md, `<!-- insrc:artifact ${id} -->\n\n# ${kind}\n`);
	return md;
}

test('jsonPathForMd resolves a nested epic DEF md → its hash-named json via the marker', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-marker-'));
	try {
		const md = seedNestedMd(repo, `docs/epics/add-tag-filter-${EPIC_SEGMENT}`, 'DEF', `DEF-${HASH}`);
		assert.equal(jsonPathForMd(md), join(repo, `.insrc/artifacts/DEF-${HASH}.json`));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('jsonPathForMd resolves a nested epic HLD md → its hash-named json via the marker', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-marker-'));
	try {
		const md = seedNestedMd(repo, `docs/epics/x-${EPIC_SEGMENT}`, 'HLD', `HLD-${HASH}`);
		assert.equal(jsonPathForMd(md), join(repo, `.insrc/artifacts/HLD-${HASH}.json`));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('jsonPathForMd resolves a nested story-scoped LLD md → its hash-named json via the marker', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-marker-'));
	try {
		const md = seedNestedMd(repo, `docs/epics/x-${EPIC_SEGMENT}/S003`, 'LLD', `LLD-${HASH}-s3`);
		assert.equal(jsonPathForMd(md), join(repo, `.insrc/artifacts/LLD-${HASH}-s3.json`));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('jsonPathForMd leaves docs/stub layout untouched', () => {
	assert.equal(jsonPathForMd('/repo/docs/stub/x.md'), '/repo/docs/stub/x.json');
});

test('jsonPathForMd returns json paths unchanged', () => {
	assert.equal(jsonPathForMd('/a/b/c.json'), '/a/b/c.json');
});

// SpecArtifact + code-review records live under the SAME nested tree — a SPEC is
// its own standalone work item, a CR is a story-scoped artifact — and resolve
// via the marker like every other nested md.

test('jsonPathForMd resolves a nested standalone SPEC md → its hash-named json via the marker', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gates-spec-'));
	try {
		const specHash = 'b77e3f38969bc8f4';
		const md = seedNestedMd(repo, `docs/standalone/redesign-brainstorm-E20260717b77e3f38`, 'SPEC', `SPEC-${specHash}`);
		assert.equal(jsonPathForMd(md), join(repo, '.insrc/artifacts', `SPEC-${specHash}.json`));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('jsonPathForMd resolves a nested story-scoped CR md → its hash-named json via the marker', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gates-cr-'));
	try {
		const md = seedNestedMd(repo, `docs/epics/x-${EPIC_SEGMENT}/S001`, 'CR', `CR-${HASH}-s1`);
		assert.equal(jsonPathForMd(md), join(repo, '.insrc/artifacts', `CR-${HASH}-s1.json`));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('jsonPathForMd recognises both docs/epics and docs/standalone top-levels, stub stays the side-by-side exception', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gates-tops-'));
	try {
		const epicMd = seedNestedMd(repo, `docs/epics/e-${EPIC_SEGMENT}`, 'DEF', `DEF-${HASH}`);
		const saMd   = seedNestedMd(repo, `docs/standalone/s-${EPIC_SEGMENT}/S001`, 'LLD', `LLD-${HASH}-s1`);
		assert.equal(jsonPathForMd(epicMd), join(repo, `.insrc/artifacts/DEF-${HASH}.json`));
		assert.equal(jsonPathForMd(saMd),   join(repo, `.insrc/artifacts/LLD-${HASH}-s1.json`));
		// Stub is NOT under the nested tree — it keeps the side-by-side md↔json swap.
		assert.equal(jsonPathForMd('/repo/docs/stub/demo.md'), '/repo/docs/stub/demo.json');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('jsonPathForMd rejects unknown extensions', () => {
	assert.throws(() => jsonPathForMd('/a/b/c.txt'));
});

test('jsonPathForMd throws for a nested md with no insrc:artifact marker (path no longer encodes the id)', () => {
	// A nested work-item md's bare <KIND>.md filename carries no hash id, so with
	// no marker there is nothing to resolve against — the resolver must refuse
	// rather than guess (file does not exist → no marker).
	assert.throws(() => jsonPathForMd(`/repo/docs/epics/x-${EPIC_SEGMENT}/S003/LLD.md`));
});

// ---------------------------------------------------------------------------
// approve / reject round-trip
// ---------------------------------------------------------------------------

function writeFixture(repo: string): string {
	const paths = defineArtifactPaths(repo, HASH, CREATED, 'epic');
	mkdirSync(dirname(paths.json), { recursive: true });
	writeFileSync(paths.json, JSON.stringify({
		meta: {
			workflow: 'define', runId: 'r1',
			epicHash: HASH, epicSlug: 'x', createdAt: CREATED,
		},
		body: { flavor: 'new-capability', problem: 'x', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [] }], openQuestions: [] },
		citations: [],
	}, null, 2));
	return paths.json;
}

test('approveArtifactByJsonPath sets meta.approvedAt', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const path = writeFixture(repo);
		const r = approveArtifactByJsonPath(path);
		assert.equal(r.workflow, 'define');
		assert.match(r.approvedAt, /^\d{4}-\d{2}-\d{2}T/);
		const raw = JSON.parse(readFileSync(path, 'utf8'));
		assert.ok(raw.meta.approvedAt);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('rejectArtifactByJsonPath sets meta.rejectedAt + reason', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const path = writeFixture(repo);
		const r = rejectArtifactByJsonPath(path, 'not enough stories');
		assert.equal(r.workflow, 'define');
		const raw = JSON.parse(readFileSync(path, 'utf8'));
		assert.equal(raw.meta.rejectReason, 'not enough stories');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('rejectArtifactByJsonPath refuses empty reason', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const path = writeFixture(repo);
		assert.throws(() => rejectArtifactByJsonPath(path, ''));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('reject then approve clears the rejection', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const path = writeFixture(repo);
		rejectArtifactByJsonPath(path, 'try again');
		approveArtifactByJsonPath(path);
		const raw = JSON.parse(readFileSync(path, 'utf8'));
		assert.ok(raw.meta.approvedAt);
		assert.equal(raw.meta.rejectedAt, undefined);
		assert.equal(raw.meta.rejectReason, undefined);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// requireApprovedEpic
// ---------------------------------------------------------------------------

test('requireApprovedEpic throws ArtifactMissingError when no Define exists', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		assert.throws(
			() => requireApprovedEpic(repo, HASH),
			(err: Error) => err instanceof ArtifactMissingError,
		);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('requireApprovedEpic throws ArtifactNotApprovedError when Define is not approved', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		writeFixture(repo);
		assert.throws(
			() => requireApprovedEpic(repo, HASH),
			(err: Error) => err instanceof ArtifactNotApprovedError,
		);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('requireApprovedEpic returns the Define artifact after approval', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const path = writeFixture(repo);
		approveArtifactByJsonPath(path);
		const epic = requireApprovedEpic(repo, HASH);
		assert.equal(epic.body.flavor, 'new-capability');
		assert.equal(epic.body.stories[0]!.id, 's1');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// t5 (ISSUE-93081bff91ae5108 / S001) — meta.rangeBase stamped at approval.
//
// The approval site is GENERIC across every artifact kind, so the gating is the
// substance of this feature, not an afterthought: an ungated stamp would write a
// base onto records no build will ever read. Asserted per kind.
// ---------------------------------------------------------------------------

const FULL_SHA = /^[0-9a-f]{40}$/;

/** A real git repo with one commit, plus an artifact json of the given meta. */
function seedGitArtifact(meta: Record<string, unknown>): { repo: string; json: string; head: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-rangebase-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
	git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
	writeFileSync(join(repo, 'f.ts'), 'export const f = 1;\n');
	git('add', '.'); git('commit', '-qm', 'base');
	const head = git('rev-parse', 'HEAD');
	const json = join(repo, '.insrc', 'artifacts', 'ART-test.json');
	mkdirSync(dirname(json), { recursive: true });
	writeFileSync(json, JSON.stringify({ meta, body: {} }, null, 2) + '\n');
	return { repo, json, head, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const metaOf = (json: string): Record<string, unknown> =>
	(JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown> }).meta;

test('t5: approving a PLAN stamps meta.rangeBase as a FULL 40-hex sha alongside meta.approvedAt', () => {
	const s = seedGitArtifact({ workflow: 'plan', epicHash: HASH, storyId: 's1', createdAt: CREATED });
	try {
		const out = approveArtifactByJsonPath(s.json);
		const m = metaOf(s.json);
		assert.equal(typeof m['approvedAt'], 'string', 'approvedAt still stamped');
		assert.equal(out.approvedAt, m['approvedAt']);
		assert.match(String(m['rangeBase']), FULL_SHA,
			'a FULL sha — the length check is the only thing that mechanically distinguishes it from revParse\'s --short form');
		assert.equal(m['rangeBase'], s.head, 'and it is HEAD at approval time');
	} finally { s.cleanup(); }
});

test('t5: the GENERIC stamp site is GATED — DEF, HLD, AMD and BUILD each stamp NO rangeBase', () => {
	for (const workflow of ['define', 'design.epic', 'amendment', 'build']) {
		const s = seedGitArtifact({ workflow, epicHash: HASH, storyId: 's1', createdAt: CREATED });
		try {
			approveArtifactByJsonPath(s.json);
			const m = metaOf(s.json);
			assert.equal(typeof m['approvedAt'], 'string', `${workflow}: still approved`);
			assert.ok(!('rangeBase' in m), `${workflow}: must NOT be stamped — no build reads it`);
		} finally { s.cleanup(); }
	}
});

test('t5: a STANDALONE design.story LLD IS stamped (the only upstream the no-plan route has), an EPIC-route LLD is NOT', () => {
	const standalone = seedGitArtifact({ workflow: 'design.story', standalone: true, epicHash: HASH, storyId: 'S001', createdAt: CREATED });
	try {
		approveArtifactByJsonPath(standalone.json);
		assert.match(String(metaOf(standalone.json)['rangeBase']), FULL_SHA,
			'a standalone LLD is a build\'s upstream, so it carries the base');
	} finally { standalone.cleanup(); }

	// The epic route reaches build through a PLAN, which is where its base lives —
	// stamping the LLD too would put a second, staler base on the same chain.
	const epic = seedGitArtifact({ workflow: 'design.story', epicHash: HASH, storyId: 's4', createdAt: CREATED });
	try {
		approveArtifactByJsonPath(epic.json);
		assert.ok(!('rangeBase' in metaOf(epic.json)), 'an epic-route LLD is NOT stamped — its PLAN is');
	} finally { epic.cleanup(); }
});

test('t5: an UNREADABLE HEAD leaves rangeBase ABSENT and still completes the approval — never throws, never an empty string', () => {
	// A non-git directory: `git rev-parse HEAD` fails.
	const repo = mkdtempSync(join(tmpdir(), 'insrc-nogit-'));
	try {
		const json = join(repo, '.insrc', 'artifacts', 'ART-test.json');
		mkdirSync(dirname(json), { recursive: true });
		writeFileSync(json, JSON.stringify({ meta: { workflow: 'plan', epicHash: HASH, storyId: 's1' }, body: {} }, null, 2) + '\n');

		let out: ReturnType<typeof approveArtifactByJsonPath> | undefined;
		assert.doesNotThrow(() => { out = approveArtifactByJsonPath(json); }, 'approval must not depend on git');
		const m = metaOf(json);
		assert.equal(typeof out?.approvedAt, 'string', 'the approval completed');
		assert.ok(!('rangeBase' in m), 'ABSENT, not present-and-empty — an empty string would be a falsy base that reads as "no range" by accident');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t5: a git repo with NO COMMITS leaves rangeBase ABSENT (HEAD does not resolve yet)', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-nocommit-'));
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		const json = join(repo, '.insrc', 'artifacts', 'ART-test.json');
		mkdirSync(dirname(json), { recursive: true });
		writeFileSync(json, JSON.stringify({ meta: { workflow: 'plan', epicHash: HASH, storyId: 's1' }, body: {} }, null, 2) + '\n');
		approveArtifactByJsonPath(json);
		assert.ok(!('rangeBase' in metaOf(json)), 'an unborn HEAD yields no base rather than a bogus one');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t5: rangeBase SURVIVES a write-read-write round trip, and the two deliberate key deletions do not take it with them', () => {
	const s = seedGitArtifact({
		workflow: 'plan', epicHash: HASH, storyId: 's1', createdAt: CREATED,
		// Pre-existing rejection, which the approve path DELETES — the neighbouring
		// behaviour that makes "does the spread keep my key?" worth pinning.
		rejectedAt: '2026-01-01T00:00:00.000Z', rejectReason: 'an earlier rejection',
	});
	try {
		approveArtifactByJsonPath(s.json);
		const first = metaOf(s.json);
		assert.match(String(first['rangeBase']), FULL_SHA);
		assert.ok(!('rejectedAt' in first), 'rejection cleared, as before');
		assert.ok(!('rejectReason' in first), 'and its reason');

		// Re-approve: the stamp is re-read, and the key survives the round trip.
		approveArtifactByJsonPath(s.json);
		const second = metaOf(s.json);
		assert.equal(second['rangeBase'], first['rangeBase'], 'same HEAD, same base, not dropped by the re-write');
		assert.equal(second['epicHash'], HASH, 'and unrelated meta is untouched');
	} finally { s.cleanup(); }
});
