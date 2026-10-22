/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (Epic ide-artifact-review-panel-jetbrains-plugin) — daemon tests.
 *
 * t1 units: listPendingArtifacts over a temp `.insrc/artifacts` fixture —
 * mixed-state filtering (an approved or rejected lifecycle excluded), descriptor mapping
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

import { deriveMdPath, listPendingArtifacts, handleWorkflowPending } from '../pending.js';
import { ARTIFACTS_DIR } from '../storage.js';
import { approvedMeta, draftMeta, lifecycleMeta, rejectedMeta, reviewedMeta } from './lifecycle-fixtures.js';

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

test('listPendingArtifacts returns ONLY pending artifacts (an approved or rejected lifecycle excluded) — ac1', () => {
	const repo = fixtureRepo({
		'LLD-238917216d8fd532-s1.json': pendingLld(),
		'DEF-238917216d8fd532.json':    { meta: { epicHash: HASH, epicCreatedAt: CREATED }, body: { title: 'Epic definition' } },
		'HLD-238917216d8fd532.json':    { meta: { epicHash: HASH, epicCreatedAt: CREATED, ...approvedMeta() }, body: { title: 'Approved HLD' } },
		'PLAN-238917216d8fd532-s1.json': { meta: { epicHash: HASH, epicCreatedAt: CREATED, storyId: 's1', ...rejectedMeta() }, body: { title: 'Rejected plan' } },
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
		// workItemId is the Story's artifact id.
		assert.equal(d.workItemId, 'STORY-238917216d8fd532-s1');
		// mdPath is a best-effort docs-relative render — story-scoped LLD lives under S001/.
		assert.match(d.mdPath, /S001[\\/]LLD\.md$/);
	} finally {
		cleanup(repo);
	}
});

// Story E20261013dd277f9c:S001 — a BUILD record is a listed kind, once its Story's code
// review has run. (Replaces 'excludes a non-union KIND even when unapproved (BUILD)'.)

const BUILD_ID = `BUILD-${HASH}-s1`;
const buildMeta = (extra: Record<string, unknown> = {}): Record<string, unknown> =>
	({ workflow: 'build', epicHash: HASH, epicCreatedAt: CREATED, epicSlug: 'review-panel', storyId: 's1', ...extra });
const buildRecord = (extra: Record<string, unknown> = {}): unknown => ({ meta: buildMeta(extra), body: { summary: 'built', tasks: [{ id: 't1' }] } });
const crRecord = (verdict = 'pass'): unknown => ({ meta: { workflow: 'code-review', epicHash: HASH, epicCreatedAt: CREATED, epicSlug: 'review-panel', storyId: 's1', reviewedBy: 'daemon' }, body: { verdict, findings: [] } });
/** Write the record's BUILD.md where its fields derive it, with the given head. */
function writeBuildMd(repo: string, meta: Record<string, unknown>, head: string): string {
	const md = deriveMdPath(repo, 'BUILD', meta);
	assert.notEqual(md, '', 'the fixture record derives a path');
	mkdirSync(join(md, '..'), { recursive: true });
	writeFileSync(md, head);
	return md;
}
const MARKER = `<!-- insrc:artifact ${BUILD_ID} -->`;

test("listPendingArtifacts lists a pending BUILD record whose Story has a code review record, with kind BUILD, its work item id and the path of its BUILD.md", () => {
	const repo = fixtureRepo({
		[`${BUILD_ID}.json`]: buildRecord(),
		[`CR-${HASH}-s1.json`]: crRecord(),
	});
	try {
		const md = writeBuildMd(repo, buildMeta(), `${MARKER}\n\n# Build — Story S001\n`);
		const list = listPendingArtifacts(repo);
		const b = list.find(a => a.artifactId === BUILD_ID);
		assert.ok(b, 'the build record is listed');
		assert.equal(b.kind, 'BUILD');
		assert.equal(b.state, 'pending');
		assert.equal(b.openQuestionCount, 0);
		assert.equal(b.workItemId, 'STORY-238917216d8fd532-s1');
		assert.equal(b.title, `BUILD ${b.workItemId}`, "a build record's body has no title: its kind and work item id");
		assert.equal(b.mdPath, md, 'the path of its BUILD.md');
		assert.match(b.mdPath, /S001[\\/]BUILD\.md$/);
		// Its code review record is listed as before, beside it.
		assert.deepEqual(list.map(a => a.kind), ['BUILD', 'CR']);
		// A code review that blocks still makes it a record awaiting a decision.
		writeFileSync(join(repo, ARTIFACTS_DIR, `CR-${HASH}-s1.json`), JSON.stringify(crRecord('block')));
		assert.ok(listPendingArtifacts(repo).some(a => a.artifactId === BUILD_ID));
		// So does a code review file that cannot be parsed: its presence by name is the condition
		// (the malformed file itself is skipped, as any malformed file is).
		writeFileSync(join(repo, ARTIFACTS_DIR, `CR-${HASH}-s1.json`), '{ not json');
		assert.deepEqual(listPendingArtifacts(repo).map(a => a.artifactId), [BUILD_ID]);
		// A standalone Story's record (upper-case story id) is matched by the same suffix.
		const solo = fixtureRepo({
			[`BUILD-${HASH}-S001.json`]: buildRecord({ storyId: 'S001', standalone: true }),
			[`CR-${HASH}-S001.json`]: crRecord(),
			[`CR-${HASH}-S002.json`]: crRecord(),
			[`BUILD-${HASH}-S003.json`]: buildRecord({ storyId: 'S003', standalone: true }),
		});
		try {
			assert.deepEqual(listPendingArtifacts(solo).map(a => a.artifactId), [`BUILD-${HASH}-S001`, `CR-${HASH}-S001`, `CR-${HASH}-S002`], "another Story's code review does not list S003's build");
		} finally { cleanup(solo); }
	} finally {
		cleanup(repo);
	}
});

test('listPendingArtifacts leaves out a BUILD record with no code review record, an approved or a rejected one, and EXT, STUB and AMD records as before', () => {
	// No code review record: a Story still being built.
	const building = fixtureRepo({
		[`${BUILD_ID}.json`]: buildRecord(),
		'LLD-238917216d8fd532-s1.json': pendingLld(),
	});
	try {
		assert.deepEqual(listPendingArtifacts(building).map(a => a.kind), ['LLD']);
	} finally { cleanup(building); }
	// Approved, and rejected: not pending, code review or not.
	for (const stamp of [approvedMeta(), rejectedMeta()]) {
		const done = fixtureRepo({ [`${BUILD_ID}.json`]: buildRecord(stamp), [`CR-${HASH}-s1.json`]: crRecord() });
		try {
			assert.deepEqual(listPendingArtifacts(done).map(a => a.kind), ['CR'], JSON.stringify(stamp));
		} finally { cleanup(done); }
	}
	// The kinds that stay out, unapproved and with a code review record of the same suffix.
	const others = fixtureRepo({
		[`EXT-${HASH}-s1.json`]: { meta: buildMeta(), body: {} },
		[`STUB-${HASH}-s1.json`]: { meta: buildMeta(), body: {} },
		[`AMD-${HASH}-1.json`]: { id: `AMD-${HASH}-1`, status: 'pending' },
		[`TESTS-${HASH}-s1.json`]: { meta: buildMeta(), body: {} },
		[`CR-${HASH}-s1.json`]: crRecord(),
	});
	try {
		assert.deepEqual(listPendingArtifacts(others).map(a => a.artifactId), [`CR-${HASH}-s1`]);
	} finally { cleanup(others); }
});

test("listPendingArtifacts gives a BUILD record an empty path when the BUILD.md its fields derive does not exist or does not carry this record's artifact marker, and lists the records in file-name order", () => {
	const repo = fixtureRepo({ [`${BUILD_ID}.json`]: buildRecord(), [`CR-${HASH}-s1.json`]: crRecord() });
	const pathOf = (): string => listPendingArtifacts(repo).find(a => a.artifactId === BUILD_ID)!.mdPath;
	try {
		// No file where the fields derive it (a build begun on a later day than its work item).
		assert.equal(pathOf(), '', 'listed by its id, with no path');
		// A file with no marker (written before the marker was introduced).
		const md = writeBuildMd(repo, buildMeta(), '# Build — Story S001\n\nNo marker here.\n');
		assert.equal(pathOf(), '');
		// Another record's marker is not this record's.
		writeFileSync(md, `<!-- insrc:artifact BUILD-${HASH}-s2 -->\n\n# Build\n`);
		assert.equal(pathOf(), '');
		writeFileSync(md, `<!-- insrc:artifact ${BUILD_ID}x -->\n\n# Build\n`);
		assert.equal(pathOf(), '');
		// The marker beyond the head that is read does not count.
		writeFileSync(md, `${'x'.repeat(600)}\n${MARKER}\n`);
		assert.equal(pathOf(), '');
		// This record's marker in the head: the path.
		writeFileSync(md, `${MARKER}\n\n# Build\n${'y'.repeat(5000)}`);
		assert.equal(pathOf(), md);
		writeFileSync(md, `\ufeff\n\n${MARKER}\n`);
		assert.equal(pathOf(), md, 'anywhere in the head');
		// The check is for a BUILD record only: an LLD keeps its derived path whether or not the file exists.
		writeFileSync(join(repo, ARTIFACTS_DIR, 'LLD-238917216d8fd532-s1.json'), JSON.stringify(pendingLld()));
		assert.match(listPendingArtifacts(repo).find(a => a.kind === 'LLD')!.mdPath, /S001[\\/]LLD\.md$/);
	} finally {
		cleanup(repo);
	}
	// File-name order, whatever order the files were written in.
	const mixed = fixtureRepo({
		'PLAN-238917216d8fd532-s1.json': { meta: { epicHash: HASH, epicCreatedAt: CREATED, storyId: 's1' }, body: { title: 'Plan' } },
		[`CR-${HASH}-s1.json`]: crRecord(),
		'LLD-238917216d8fd532-s1.json': pendingLld(),
		'DEF-238917216d8fd532.json': { meta: { epicHash: HASH, epicCreatedAt: CREATED }, body: { title: 'Epic definition' } },
		[`${BUILD_ID}.json`]: buildRecord(),
	});
	try {
		const ids = listPendingArtifacts(mixed).map(a => a.artifactId);
		assert.deepEqual(ids, [...ids].sort());
		assert.deepEqual(ids, [BUILD_ID, `CR-${HASH}-s1`, 'DEF-238917216d8fd532', 'LLD-238917216d8fd532-s1', 'PLAN-238917216d8fd532-s1'], 'the build record before its code review');
	} finally { cleanup(mixed); }
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
		assert.match(byId.get('DEF-238917216d8fd532')?.title ?? '', /^DEF EPIC-238917216d8fd532$/);
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
		'HLD-238917216d8fd532.json': { meta: { epicHash: HASH, epicCreatedAt: CREATED, ...approvedMeta() }, body: { title: 'x' } },
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

test('pending.test.ts: pending approvals read the lifecycle', () => {
	const lld = (storyId: string, meta: Record<string, unknown>) => ({ meta: { epicHash: HASH, epicCreatedAt: CREATED, storyId, ...meta }, body: { title: storyId } });
	const repo = fixtureRepo({
		'LLD-238917216d8fd532-s1.json': lld('s1', draftMeta()),
		'LLD-238917216d8fd532-s2.json': lld('s2', reviewedMeta()),                      // reviewed, still a draft
		'LLD-238917216d8fd532-s3.json': lld('s3', approvedMeta()),
		'LLD-238917216d8fd532-s4.json': lld('s4', rejectedMeta()),
		'LLD-238917216d8fd532-s5.json': lld('s5', lifecycleMeta({ status: 'completed', approval: true })),
		'LLD-238917216d8fd532-s6.json': lld('s6', lifecycleMeta({ status: 'in-signoff', approval: true })),
		'LLD-238917216d8fd532-s7.json': lld('s7', lifecycleMeta({ status: 'changes-requested', approval: true })),
		// a head with no lifecycle is pending whatever the old stamps say: the conversion removes them
		'LLD-238917216d8fd532-s8.json': lld('s8', { approvedAt: CREATED }),
	});
	try {
		assert.deepEqual(listPendingArtifacts(repo).map(a => a.artifactId).sort(), ['LLD-238917216d8fd532-s1', 'LLD-238917216d8fd532-s2', 'LLD-238917216d8fd532-s8']);
	} finally {
		cleanup(repo);
	}
});
