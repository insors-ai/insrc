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

// ---------------------------------------------------------------------------
// jsonPathForMd
// ---------------------------------------------------------------------------

test('jsonPathForMd swaps docs/defines md → .insrc/artifacts json', () => {
	assert.equal(
		jsonPathForMd(`/repo/docs/defines/DEF-${HASH}.md`),
		`/repo/.insrc/artifacts/DEF-${HASH}.json`,
	);
});

test('jsonPathForMd swaps docs/designs md → .insrc/artifacts json', () => {
	assert.equal(
		jsonPathForMd(`/repo/docs/designs/HLD-${HASH}.md`),
		`/repo/.insrc/artifacts/HLD-${HASH}.json`,
	);
});

test('jsonPathForMd leaves docs/stub layout untouched', () => {
	assert.equal(jsonPathForMd('/repo/docs/stub/x.md'), '/repo/docs/stub/x.json');
});

test('jsonPathForMd returns json paths unchanged', () => {
	assert.equal(jsonPathForMd('/a/b/c.json'), '/a/b/c.json');
});

test('jsonPathForMd rejects unknown extensions', () => {
	assert.throws(() => jsonPathForMd('/a/b/c.txt'));
});

test('jsonPathForMd resolves a slug-named md to its hash-named json via the marker', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-marker-'));
	try {
		const mdPath = join(repo, 'docs/defines/DEF-add-tag-filter.md');
		mkdirSync(dirname(mdPath), { recursive: true });
		writeFileSync(mdPath, `<!-- insrc:artifact DEF-${HASH} -->\n\n# Epic: x\n`);
		assert.equal(
			jsonPathForMd(mdPath),
			join(repo, `.insrc/artifacts/DEF-${HASH}.json`),
		);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('jsonPathForMd falls back to dir+ext swap when no marker is present', () => {
	// Legacy / hand-written md with no marker (file does not exist).
	assert.equal(
		jsonPathForMd(`/repo/docs/designs/LLD-${HASH}-s3.md`),
		`/repo/.insrc/artifacts/LLD-${HASH}-s3.json`,
	);
});

// ---------------------------------------------------------------------------
// approve / reject round-trip
// ---------------------------------------------------------------------------

function writeFixture(repo: string): string {
	const paths = defineArtifactPaths(repo, HASH);
	mkdirSync(dirname(paths.json), { recursive: true });
	writeFileSync(paths.json, JSON.stringify({
		meta: {
			workflow: 'define', runId: 'r1',
			epicHash: HASH, epicSlug: 'x',
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
