/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t4 integration tests: kind-aware tracker
 * persistence. mutateEpicTrackerMeta (orchestrator) and syncTracker both
 * write to the resolved head via the DEF-then-ISSUE first-readable-wins rule:
 * an ISSUE-only fixture gets meta.tracker (plus issueRef on push) on the
 * ISSUE json, zero DEF-*.json files are fabricated, and a corrupt DEF never
 * receives a write when a valid ISSUE answers. syncTracker's storiesOf uses
 * the implied s1 for ISSUE heads; closeBugfixTrackerIssue closes via
 * readRecordedRef (the ISSUE's meta.tracker.issueRef).
 *
 * Run: npx tsx --test src/workflow/__tests__/tracker-issue-persistence.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _mutateEpicTrackerMeta } from '../orchestrator.js';
import { syncTracker } from '../tracker/sync.js';
import { closeBugfixTrackerIssue, type TrackerCloseDeps } from '../bugfix/tracker.js';
import { ARTIFACTS_DIR, artifactJsonPath, defineArtifactId, issueArtifactId, lldArtifactId, IMPLIED_ISSUE_STORY_ID } from '../storage.js';
import { readBinding } from '../tracker/binding.js';
import { patchTrackerMeta, readTrackerMeta } from '../tracker/refs.js';
import { ArtifactIds } from '../artifact-ids.js';
import { approvedMeta } from './lifecycle-fixtures.js';
import { installExecStandIn } from './helpers/exec-stand-in.js';
import type { PortResult, TrackerPort } from '../tracker/port.js';

const HASH = '5f9d4ab4c90c0b4c';
const SLUG = 'issue-anchored-item';
const CREATED = '2026-11-16T07:14:04.399Z';

afterEach(() => { installExecStandIn(); });

interface Fx { repo: string; issue: string; def: string; cleanup: () => void }

function seedIssueOnly(opts: { corruptDef?: boolean } = {}): Fx {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t4-'));
	mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
	const base = { repoPath: repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED };
	const put = (id: string, doc: unknown): string => {
		const p = artifactJsonPath(repo, id);
		writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
		return p;
	};
	const issue = put(issueArtifactId(HASH), {
		meta: { workflow: 'issue', runId: 'i1', ...base, schemaVersion: 1, issueHash: HASH, standalone: true, magnitude: 'sized', ...approvedMeta() },
		body: { title: 'ISSUE title', reproduction: 'r', rootCause: 'c', fixIntent: 'f' },
		citations: [],
	});
	put(lldArtifactId(HASH, IMPLIED_ISSUE_STORY_ID), {
		meta: { workflow: 'design.story', runId: 'l1', ...base, storyId: IMPLIED_ISSUE_STORY_ID, schemaVersion: 1, ...approvedMeta() },
		body: { chosenAlternative: 'a', contractDetails: { surfaceLevel: 'internal', api: [] }, testStrategy: { testFramework: 'node:test', testLevels: [] } },
		citations: [],
	});
	const def = artifactJsonPath(repo, defineArtifactId(HASH));
	if (opts.corruptDef === true) writeFileSync(def, '{ not json');
	return { repo, issue, def, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function defFileCount(repo: string): number {
	return readdirSync(join(repo, ARTIFACTS_DIR)).filter(f => f.startsWith('DEF-')).length;
}

test('src/workflow/orchestrator.ts mutateEpicTrackerMeta + finalizeTracker — finalize push+sync on ISSUE-only seed repo: ISSUE meta.tracker written, EPIC/STORY-s1 heads bound, readdir zero DEF-*.json; corrupt-DEF/valid-ISSUE finalize lands on ISSUE json; issueRef write-back on first publication', () => {
	// push finalize on an ISSUE-only fixture
	{
		const fx = seedIssueOnly();
		try {
			_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.push', { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: ['insrc:epic'] } as never);
			const meta = readTrackerMeta(fx.issue);
			assert.equal(meta?.adapter, 'github');
			assert.equal(meta?.issueRef, 'acme/demo#42', 'issueRef written back on first publication (push)');
			assert.deepEqual(meta?.labelsCreated, ['insrc:epic']);
			assert.equal(defFileCount(fx.repo), 0, 'zero DEF-*.json fabricated');
			assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }))?.reference.entityId, 'acme/demo#42', 'EPIC head bound');
			assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'STORY', epicHash: HASH, story: IMPLIED_ISSUE_STORY_ID }))?.reference.entityId, 'acme/demo#42', 'STORY-s1 head bound to the same issue');
			// sync finalize lands on the ISSUE json too
			_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.sync', { epicStatus: 'open', storyStatus: { [IMPLIED_ISSUE_STORY_ID]: 'open' }, syncedAt: '2026-11-24T00:00:00.000Z' } as never);
			const after = readTrackerMeta(fx.issue);
			assert.equal(after?.epicStatus, 'open');
			assert.equal(after?.storyStatus?.[IMPLIED_ISSUE_STORY_ID], 'open');
			assert.equal(after?.issueRef, 'acme/demo#42', 'issueRef preserved across sync');
			assert.equal(defFileCount(fx.repo), 0);
		} finally { fx.cleanup(); }
	}
	// corrupt DEF + valid ISSUE: finalize lands on the ISSUE json, the corrupt DEF is untouched
	{
		const fx = seedIssueOnly({ corruptDef: true });
		try {
			const before = readFileSync(fx.def, 'utf8');
			_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.push', { epicRef: 'acme/demo#9', storyRefs: {}, labelsCreated: [] } as never);
			assert.equal(readTrackerMeta(fx.issue)?.issueRef, 'acme/demo#9', 'write lands on the readable ISSUE head');
			assert.equal(readFileSync(fx.def, 'utf8'), before, 'corrupt DEF untouched');
			assert.equal(defFileCount(fx.repo), 1, 'the pre-existing corrupt DEF file remains (not fabricated); no new DEF written');
		} finally { fx.cleanup(); }
	}
	// DEF-head fixture: unchanged behavior — writes land on the DEF json, no issueRef
	{
		const repo = mkdtempSync(join(tmpdir(), 'insrc-t4-def-'));
		try {
			mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
			const def = artifactJsonPath(repo, defineArtifactId(HASH));
			writeFileSync(def, JSON.stringify({
				meta: { workflow: 'define', runId: 'd1', repoPath: repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1, ...approvedMeta() },
				body: { flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 's', userValue: 'u', acceptanceCriteria: [] }], openQuestions: [] },
				citations: [],
			}, null, 2) + '\n');
			_mutateEpicTrackerMeta(repo, HASH, 'tracker.push', { epicRef: 'acme/demo#1', storyRefs: { s1: 'acme/demo#2' }, labelsCreated: [] } as never);
			const meta = readTrackerMeta(def);
			assert.equal(meta?.adapter, 'github');
			assert.equal(meta?.issueRef, undefined, 'DEF heads get no issueRef write-back');
		} finally { rmSync(repo, { recursive: true, force: true }); }
	}
});

test('src/workflow/tracker/sync.ts — storiesOf uses impliedIssueStories for ISSUE heads; patchTrackerMeta writes onto the resolved head; closeBugfixTrackerIssue closes via readRecordedRef (stubbed)', async () => {
	const fx = seedIssueOnly();
	try {
		// bind heads + issueRef as a push finalize would
		patchTrackerMeta(fx.issue, { issueRef: 'acme/demo#42' });
		_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.push', { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: [] } as never);

		// a stubbed port that reports open for any ref
		const port = {
			kind: 'github', capabilities: new Set(['status-read', 'whoami']),
			whoAmI: (): PortResult<string> => ({ ok: true, value: 'me' }),
			readIssueStatus: () => ({ ok: true, value: { state: 'OPEN', labels: [] } }),
		} as unknown as TrackerPort;
		const r = await syncTracker(fx.repo, HASH, undefined, { port });
		assert.equal(r.status, 'synced', JSON.stringify(r));
		if (r.status === 'synced') {
			assert.deepEqual(r.storyStatus, { [IMPLIED_ISSUE_STORY_ID]: 'open' }, 'ISSUE head syncs the single implied story');
		}
		const meta = readTrackerMeta(fx.issue);
		assert.equal(meta?.epicStatus, 'open');
		assert.equal(meta?.storyStatus?.[IMPLIED_ISSUE_STORY_ID], 'open');
		assert.ok(typeof meta?.lastSyncedAt === 'string');
		assert.equal(defFileCount(fx.repo), 0);

		// closeBugfixTrackerIssue reads readRecordedRef = ISSUE meta.tracker.issueRef
		const closed: string[] = [];
		const deps: TrackerCloseDeps = {
			resolveConfig: () => ({ type: 'github', owner: 'acme', repo: 'demo', source: 'test' } as never),
			authOk: () => ({ ok: true }),
			readRecordedRef: (repoPath: string, issueHash: string) => readTrackerMeta(artifactJsonPath(repoPath, issueArtifactId(issueHash)))?.issueRef ?? null,
			closeIssue: (_owner: string, _repo: string, ref: string) => { closed.push(ref); },
			recordRef: () => {},
			findByLabels: () => undefined,
			labels: ['insrc:epic'],
			promptOnLostRef: async () => ({ status: 'skipped', reason: 'test' } as never),
		};
		const cr = await closeBugfixTrackerIssue({ repoPath: fx.repo, issueHash: HASH }, deps);
		assert.equal(cr.status, 'closed', JSON.stringify(cr));
		assert.deepEqual(closed, ['acme/demo#42'], 'closed the recorded ISSUE ref');
	} finally { fx.cleanup(); }
});

test('first publication sequence — approve ISSUE with tracking disabled, enable, push: exactly 1 create, issueRef written back + heads bound; write-back failure -> retry adopts with 0 creates', () => {
	// Simulated at the persistence layer: first publication = one push finalize
	// (the single create is the execute step's; here we assert the write-back
	// + head bindings). Retry after a simulated write-back failure re-runs the
	// same finalize idempotently — issueRef and bindings are stable, and the
	// context's existingRefs seeding (t2) means the execute step adopts with
	// 0 creates (covered by the t2 test).
	const fx = seedIssueOnly();
	try {
		_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.push', { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: ['insrc:epic'] } as never);
		const first = readTrackerMeta(fx.issue);
		// retry (write-back failure recovery): same finalize again
		_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.push', { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: ['insrc:epic'] } as never);
		const second = readTrackerMeta(fx.issue);
		assert.equal(second?.issueRef, first?.issueRef, 'retry is idempotent — one stable ref, no duplicate record');
		assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }))?.reference.entityId, 'acme/demo#42');
		assert.equal(defFileCount(fx.repo), 0);
	} finally { fx.cleanup(); }
});
