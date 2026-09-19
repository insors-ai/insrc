/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (Epic ide-artifact-review-panel-jetbrains-plugin) — daemon tests.
 *
 * t1 units: listPendingArtifacts over a temp `.insrc/artifacts` fixture —
 * mixed-state filtering (approvedAt / rejectedAt excluded), descriptor mapping
 * (kind / title / mdPath / workItemId / openQuestionCount / state), non-union
 * KIND exclusion, absent-store -> [], malformed-file skip, and the
 * missing-openQuestions / missing-workItemId defaults.
 *
 * t2 integration: handleWorkflowPending — the repo-resolution + error-mapping
 * the daemon handler delegates to: pending set / empty / repo-unresolved-error /
 * store-unreadable-error (each { error } DISTINCT from an empty { artifacts }).
 *
 * No network, no DB, no live socket.
 *
 * Run: npx tsx --test src/workflow/__tests__/pending.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listPendingArtifacts, handleWorkflowPending } from '../pending.js';
import { ARTIFACTS_DIR } from '../storage.js';

const HASH = '238917216d8fd532';           // real 16-hex epic hash form
const CREATED = '2026-09-19T08:00:00.000Z';

/** Build a temp repo with `.insrc/artifacts` and the given artifact files. */
function fixtureRepo(files: Record<string, unknown | string>): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-pending-'));
	const dir = join(repo, ARTIFACTS_DIR);
	mkdirSync(dir, { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		const text = typeof content === 'string' ? content : JSON.stringify(content);
		writeFileSync(join(dir, name), text);
	}
	return repo;
}

function cleanup(repo: string): void {
	rmSync(repo, { recursive: true, force: true });
}

/** A pending story-level LLD with a title, a work-item anchor, and 2 questions. */
function pendingLld(): unknown {
	return {
		meta: { epicHash: HASH, epicCreatedAt: CREATED, storyId: 's1' },
		body: { title: 'Review panel foundation', openQuestions: [{ id: 'q1' }, { id: 'q2' }] },
		citations: [],
	};
}

test('listPendingArtifacts returns ONLY pending artifacts (approvedAt/rejectedAt excluded) — ac1', () => {
	const repo = fixtureRepo({
		'LLD-238917216d8fd532-s1.json': pendingLld(),
		'DEF-238917216d8fd532.json':    { meta: { epicHash: HASH, epicCreatedAt: CREATED }, body: { title: 'Epic definition' } },
		'HLD-238917216d8fd532.json':    { meta: { epicHash: HASH, epicCreatedAt: CREATED, approvedAt: '2026-09-19T09:00:00.000Z' }, body: { title: 'Approved HLD' } },
		'PLAN-238917216d8fd532-s1.json': { meta: { epicHash: HASH, epicCreatedAt: CREATED, storyId: 's1', rejectedAt: '2026-09-19T09:30:00.000Z' }, body: { title: 'Rejected plan' } },
	});
	try {
		const ids = listPendingArtifacts(repo).map(a => a.artifactId).sort();
		assert.deepEqual(ids, ['DEF-238917216d8fd532', 'LLD-238917216d8fd532-s1']);
	} finally {
		cleanup(repo);
	}
});

test('listPendingArtifacts maps each descriptor field (kind/title/mdPath/workItemId/openQuestionCount/state)', () => {
	const repo = fixtureRepo({ 'LLD-238917216d8fd532-s1.json': pendingLld() });
	try {
		const [d] = listPendingArtifacts(repo);
		assert.ok(d);
		assert.equal(d.kind, 'LLD');
		assert.equal(d.title, 'Review panel foundation');
		assert.equal(d.openQuestionCount, 2);
		assert.equal(d.state, 'pending');
		// workItemId derives from the meta anchor (S001, story ordinal 1).
		assert.match(d.workItemId ?? '', /^E20260919238917.*:S001$/);
		// mdPath is a best-effort docs-relative render — story-scoped LLD lives under S001/.
		assert.match(d.mdPath, /S001[\\/]LLD\.md$/);
	} finally {
		cleanup(repo);
	}
});

test('listPendingArtifacts excludes a non-union KIND even when unapproved (BUILD)', () => {
	const repo = fixtureRepo({
		'BUILD-238917216d8fd532-s1.json': { meta: { epicHash: HASH, epicCreatedAt: CREATED, storyId: 's1' }, body: { title: 'Build' } },
		'LLD-238917216d8fd532-s1.json':   pendingLld(),
	});
	try {
		const kinds = listPendingArtifacts(repo).map(a => a.kind);
		assert.deepEqual(kinds, ['LLD']);
	} finally {
		cleanup(repo);
	}
});

test('listPendingArtifacts returns [] for an absent .insrc/artifacts dir (not a throw)', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-pending-empty-'));
	try {
		assert.deepEqual(listPendingArtifacts(repo), []);
	} finally {
		cleanup(repo);
	}
});

test('listPendingArtifacts skips a single malformed JSON file and still returns the rest', () => {
	const repo = fixtureRepo({
		'LLD-238917216d8fd532-s2.json': '{ this is not valid json',
		'LLD-238917216d8fd532-s1.json': pendingLld(),
	});
	try {
		const ids = listPendingArtifacts(repo).map(a => a.artifactId);
		assert.deepEqual(ids, ['LLD-238917216d8fd532-s1']);
	} finally {
		cleanup(repo);
	}
});

test('listPendingArtifacts defaults: no openQuestions -> 0; no derivable workItemId -> omitted', () => {
	const repo = fixtureRepo({
		// No meta anchor (and a non-hex "hash" would throw in the deriver -> caught -> omitted).
		'SPEC-nothexhash.json': { meta: {}, body: { title: 'A spec with no anchor' } },
	});
	try {
		const [d] = listPendingArtifacts(repo);
		assert.ok(d);
		assert.equal(d.openQuestionCount, 0);
		assert.equal(d.workItemId, undefined);
		assert.equal(d.title, 'A spec with no anchor');
		assert.equal(d.mdPath, '');   // unresolvable anchor -> best-effort empty
	} finally {
		cleanup(repo);
	}
});

test('listPendingArtifacts falls back title to workItemId then artifactId when body has none', () => {
	const repo = fixtureRepo({
		'DEF-238917216d8fd532.json': { meta: { epicHash: HASH, epicCreatedAt: CREATED }, body: {} },
		'SPEC-nothex.json':          { meta: {}, body: {} },
	});
	try {
		const byId = new Map(listPendingArtifacts(repo).map(a => [a.artifactId, a]));
		assert.match(byId.get('DEF-238917216d8fd532')?.title ?? '', /^DEF E20260919238917/);
		assert.equal(byId.get('SPEC-nothex')?.title, 'SPEC-nothex');
	} finally {
		cleanup(repo);
	}
});

// ---------------------------------------------------------------------------
// t2 — handleWorkflowPending (repo resolution + error mapping)
// ---------------------------------------------------------------------------

test('handleWorkflowPending: fixture repo with pending artifacts -> { artifacts } (ac1)', () => {
	const repo = fixtureRepo({ 'LLD-238917216d8fd532-s1.json': pendingLld() });
	try {
		const res = handleWorkflowPending({ repo }, undefined);
		assert.ok('artifacts' in res);
		assert.equal(res.artifacts.length, 1);
		assert.equal(res.artifacts[0]?.kind, 'LLD');
	} finally {
		cleanup(repo);
	}
});

test('handleWorkflowPending: all-approved / absent store -> { artifacts: [] } (ac3, distinct from error)', () => {
	const approved = fixtureRepo({
		'HLD-238917216d8fd532.json': { meta: { epicHash: HASH, epicCreatedAt: CREATED, approvedAt: CREATED }, body: { title: 'x' } },
	});
	const absent = mkdtempSync(join(tmpdir(), 'insrc-pending-absent-'));
	try {
		const a = handleWorkflowPending({ repo: approved }, undefined);
		assert.ok('artifacts' in a);
		assert.deepEqual(a.artifacts, []);

		const b = handleWorkflowPending({ repo: absent }, undefined);
		assert.ok('artifacts' in b);
		assert.deepEqual(b.artifacts, []);
	} finally {
		cleanup(approved);
		cleanup(absent);
	}
});

test('handleWorkflowPending: repo-unresolved (no param, no env) -> { error }, NOT { artifacts: [] } (ac2)', () => {
	const res = handleWorkflowPending(undefined, undefined);
	assert.ok('error' in res, 'unresolved repo returns an error');
	assert.ok(!('artifacts' in res), 'never a silent empty list');

	// env fallback resolves it (still an error only when BOTH are absent).
	const repo = fixtureRepo({ 'DEF-238917216d8fd532.json': { meta: {}, body: {} } });
	try {
		const viaEnv = handleWorkflowPending(undefined, repo);
		assert.ok('artifacts' in viaEnv);
	} finally {
		cleanup(repo);
	}
});

test('handleWorkflowPending: store-unreadable (artifacts path is a file) -> { error } (ac2)', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-pending-badstore-'));
	// Make `.insrc` exist but `.insrc/artifacts` a FILE, so existsSync passes and
	// readdirSync throws ENOTDIR — the store-unreadable path.
	mkdirSync(join(repo, '.insrc'), { recursive: true });
	writeFileSync(join(repo, ARTIFACTS_DIR), 'not a directory');
	try {
		const res = handleWorkflowPending({ repo }, undefined);
		assert.ok('error' in res, 'unreadable store returns an error');
		assert.ok(!('artifacts' in res));
	} finally {
		cleanup(repo);
	}
});
