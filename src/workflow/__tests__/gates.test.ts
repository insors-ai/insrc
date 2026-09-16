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
