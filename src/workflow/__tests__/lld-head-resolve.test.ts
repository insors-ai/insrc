/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-c00559b7 S001/t2 — the tracker resolver reaches a work item headed by an LLD.
 *
 * A standalone feature writes an LLD and a PLAN and nothing above them. The
 * resolver used to enumerate only DEF and ISSUE hashes, so every task of such a
 * plan was `unresolved-target`. It now takes its identity from storage's shared
 * head reader and enumerates LLD-only hashes last; unscoped labels consult them
 * only when no DEF- or ISSUE-anchored work item evidences the label.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/lld-head-resolve.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { resolveWorkflowRef, workflowIdForIssue } from '../tracker/resolve.js';
import type { PlanTask } from '../artifacts/plan.js';

const LLD_HASH   = '0a1b2c3d4e5f6a7b';     // the standalone feature: LLD + PLAN only
const LLD_HASH_2 = '0a1b2c3d99999999';     // a second standalone feature
const DEF_HASH   = '1c2d3e4f5a6b7c8d';     // an epic holding s1
const ISSUE_HASH = '2d3e4f5a6b7c8d9e';     // a bugfix (implies S001)

const LLD_MADE   = '2026-10-10T08:00:00.000Z';
const LLD_ANCHOR = '2026-10-09T21:00:00.000Z';   // stamped epicCreatedAt → E20261009
const DEF_MADE   = '2026-07-01T08:00:00.000Z';
const ISSUE_MADE = '2026-08-01T08:00:00.000Z';

const TASK: PlanTask = {
	id: 't1', title: 'The standalone task', summary: 'Do it.', size: 'S', order: 1,
	dependsOn: [], acceptanceChecks: ['done'], derivedFrom: ['c1'],
	tests: [{ level: 'unit', name: 'unit: done' }],
};

function writeJson(path: string, obj: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

function mkRepo(): { repo: string; dir: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-lld-resolve-'));
	return { repo, dir: join(repo, '.insrc/artifacts'), cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

/** A standalone feature: an LLD (optionally unflagged, as legacy ones are) and its PLAN. */
function seedStandalone(dir: string, hash: string, slug: string, opts: { flagged?: boolean | undefined; storyId?: string | undefined } = {}): void {
	const storyId = opts.storyId ?? 'S001';
	writeJson(join(dir, `LLD-${hash}-${storyId}.json`), {
		meta: {
			workflow: 'design.story', epicHash: hash, epicSlug: slug, storyId,
			createdAt: LLD_MADE, epicCreatedAt: LLD_ANCHOR,
			...(opts.flagged !== false ? { standalone: true } : {}),
		},
		body: {},
	});
	writeJson(join(dir, `PLAN-${hash}-${storyId}.json`), {
		meta: { workflow: 'plan', epicHash: hash, epicSlug: slug, storyId, createdAt: LLD_MADE },
		body: { tasks: [TASK], testStrategyCoverage: [] },
	});
}

function seedEpic(dir: string): void {
	writeJson(join(dir, `DEF-${DEF_HASH}.json`), {
		meta: {
			workflow: 'define', epicHash: DEF_HASH, epicSlug: 'the-epic', createdAt: DEF_MADE,
			tracker: { epicRef: 'acme/demo#1', storyRefs: { s1: 'acme/demo#2' } },
		},
		body: { stories: [{ id: 's1', title: 'One' }] },
	});
	writeJson(join(dir, `PLAN-${DEF_HASH}-s1.json`), {
		meta: { workflow: 'plan', epicHash: DEF_HASH, epicSlug: 'the-epic', storyId: 's1', createdAt: DEF_MADE,
			tracker: { taskRefs: { t1: 'acme/demo#3' } } },
		body: { tasks: [{ ...TASK, title: 'The epic task' }], testStrategyCoverage: [] },
	});
}

function seedBugfix(dir: string): void {
	writeJson(join(dir, `ISSUE-${ISSUE_HASH}.json`), {
		meta: { workflow: 'issue', issueHash: ISSUE_HASH, epicSlug: 'the-bugfix', createdAt: ISSUE_MADE, standalone: true },
		body: {},
	});
}

// ---------------------------------------------------------------------------
// unit: readEpicIdentity and listEpicHashes over DEF/ISSUE/LLD fixtures
// ---------------------------------------------------------------------------

test('c00559b7 — an LLD-only work item is enumerated and its identity comes from the LLD head', () => {
	const r = mkRepo();
	try {
		seedStandalone(r.dir, LLD_HASH, 'standalone-feature');
		// An epic-level reference is minted from the identity alone, so it isolates
		// readEpicIdentity: slug from the LLD, anchor from its stamped epicCreatedAt.
		const story = resolveWorkflowRef(r.repo, 'S001', { epicHash: LLD_HASH });
		assert.equal(story?.epicSlug, 'standalone-feature');
		assert.equal(story?.createdAt, LLD_ANCHOR);
		assert.equal(story?.workflowId, `E20261009${LLD_HASH.slice(0, 8)}:S001`);
	} finally { r.cleanup(); }
});

test('c00559b7 — a hash with an ISSUE and an LLD is headed by the ISSUE and enumerated once', () => {
	const r = mkRepo();
	try {
		seedBugfix(r.dir);
		seedStandalone(r.dir, ISSUE_HASH, 'lld-own-label');
		const ref = resolveWorkflowRef(r.repo, 'S001/t1', { epicHash: ISSUE_HASH });
		assert.equal(ref?.epicSlug, 'the-bugfix', 'the ISSUE, not the LLD, names the work item');
		assert.equal(ref?.createdAt, ISSUE_MADE);
		// Listed once: an unscoped label finds exactly one candidate, not two.
		assert.equal(resolveWorkflowRef(r.repo, 'S001/t1')?.epicHash, ISSUE_HASH);
	} finally { r.cleanup(); }
});

test('c00559b7 — a DEF head keeps its tracker refs through the shared reader', () => {
	const r = mkRepo();
	try {
		seedEpic(r.dir);
		const ref = resolveWorkflowRef(r.repo, 's1', { epicHash: DEF_HASH });
		assert.equal(ref?.epicRef, 'acme/demo#1');
		assert.equal(ref?.storyRef, 'acme/demo#2', 'the DEF storyRefs still answer for a story with no LLD ref');
	} finally { r.cleanup(); }
});

test('c00559b7 — with no head at all a hash is not enumerated', () => {
	const r = mkRepo();
	try {
		// A PLAN alone heads nothing.
		writeJson(join(r.dir, `PLAN-${LLD_HASH}-S001.json`), { meta: { epicHash: LLD_HASH, storyId: 'S001', createdAt: LLD_MADE }, body: { tasks: [TASK] } });
		assert.equal(resolveWorkflowRef(r.repo, 'S001/t1', { epicHash: LLD_HASH }), null);
		assert.equal(resolveWorkflowRef(r.repo, 'S001/t1'), null);
	} finally { r.cleanup(); }
});

// ---------------------------------------------------------------------------
// unit: resolveWorkflowRef reaches an LLD+PLAN-only task by scoped label and hierarchical id
// ---------------------------------------------------------------------------

test('c00559b7 — S001/t1 and s1/t1 scoped by epicHash, and the hierarchical id, all reach the standalone task', () => {
	const r = mkRepo();
	try {
		seedStandalone(r.dir, LLD_HASH, 'standalone-feature');
		const upper = resolveWorkflowRef(r.repo, 'S001/t1', { epicHash: LLD_HASH });
		const lower = resolveWorkflowRef(r.repo, 's1/t1', { epicHash: LLD_HASH });
		assert.equal(upper?.task?.title, 'The standalone task');
		assert.equal(lower?.task?.title, 'The standalone task', 'the lowercase label finds the -S001 artifacts');
		assert.equal(upper?.workflowId, lower?.workflowId);

		const hier = resolveWorkflowRef(r.repo, upper!.workflowId);
		assert.equal(hier?.task?.title, 'The standalone task');
		assert.equal(resolveWorkflowRef(r.repo, upper!.slug)?.taskId, 't1', 'and the slug form');
	} finally { r.cleanup(); }
});

test('c00559b7 — a legacy UNFLAGGED standalone LLD is reached the same way', () => {
	const r = mkRepo();
	try {
		seedStandalone(r.dir, LLD_HASH, 'legacy-feature', { flagged: false });
		assert.equal(resolveWorkflowRef(r.repo, 'S001/t1', { epicHash: LLD_HASH })?.task?.id, 't1');
	} finally { r.cleanup(); }
});

// ---------------------------------------------------------------------------
// unit: unscoped label tiering over a mixed DEF + ISSUE + LLD-only fixture
// ---------------------------------------------------------------------------

test('c00559b7 — unscoped s1/t1 over DEF + ISSUE + LLD-only resolves to the DEF epic, exactly as before', () => {
	const r = mkRepo();
	try {
		seedEpic(r.dir);
		seedBugfix(r.dir);
		const before = resolveWorkflowRef(r.repo, 's1/t1');
		assert.equal(before?.epicHash, DEF_HASH, 'baseline without the standalone item');

		seedStandalone(r.dir, LLD_HASH, 'standalone-feature');
		const after = resolveWorkflowRef(r.repo, 's1/t1');
		assert.deepEqual(after, before, 'adding an LLD-only item changes nothing');
	} finally { r.cleanup(); }
});

test('c00559b7 — the bugfix\'s implied S001 still outranks an LLD-only item that built S001', () => {
	const r = mkRepo();
	try {
		seedBugfix(r.dir);
		writeJson(join(r.dir, `PLAN-${ISSUE_HASH}-S001.json`), {
			meta: { workflow: 'plan', epicHash: ISSUE_HASH, storyId: 'S001', createdAt: ISSUE_MADE },
			body: { tasks: [{ ...TASK, title: 'The bugfix task' }] },
		});
		// Without the PLAN the ISSUE's evidence would be 'implied'; with it,
		// 'artifact'. Either way it is a DEF/ISSUE-anchored candidate and wins.
		seedStandalone(r.dir, LLD_HASH, 'standalone-feature');
		assert.equal(resolveWorkflowRef(r.repo, 'S001/t1')?.task?.title, 'The bugfix task');

		rmSync(join(r.dir, `PLAN-${ISSUE_HASH}-S001.json`));
		assert.equal(resolveWorkflowRef(r.repo, 'S001')?.epicHash, ISSUE_HASH, 'the implied tier still ranks above LLD heads');
	} finally { r.cleanup(); }
});

test('c00559b7 — with only LLD-only items, a single one resolves unscoped and two refuse as ambiguous', () => {
	const r = mkRepo();
	try {
		seedStandalone(r.dir, LLD_HASH, 'standalone-feature');
		assert.equal(resolveWorkflowRef(r.repo, 'S001/t1')?.epicHash, LLD_HASH);

		seedStandalone(r.dir, LLD_HASH_2, 'another-feature');
		assert.equal(resolveWorkflowRef(r.repo, 'S001/t1'), null, 'two standalone items both hold S001');
		assert.equal(resolveWorkflowRef(r.repo, 'S001/t1', { epicHash: LLD_HASH_2 })?.epicSlug, 'another-feature', 'scoping disambiguates');
	} finally { r.cleanup(); }
});

// ---------------------------------------------------------------------------
// integration: workflowIdForIssue unchanged for a DEF epic with a tracker block
// ---------------------------------------------------------------------------

test('c00559b7 — workflowIdForIssue for a DEF epic with a tracker block is unchanged beside an LLD-only item', () => {
	const r = mkRepo();
	try {
		seedEpic(r.dir);
		seedStandalone(r.dir, LLD_HASH, 'standalone-feature');
		assert.equal(workflowIdForIssue(r.repo, 3), `E20260701${DEF_HASH.slice(0, 8)}:S001:T001`, 'task ref');
		assert.equal(workflowIdForIssue(r.repo, '1'), `E20260701${DEF_HASH.slice(0, 8)}`, 'epic ref');
		assert.equal(workflowIdForIssue(r.repo, 404), null);
	} finally { r.cleanup(); }
});
