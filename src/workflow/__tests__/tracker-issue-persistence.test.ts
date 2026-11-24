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

import { _mutateEpicTrackerMeta, _finalizeTracker } from '../orchestrator.js';
import { syncTracker } from '../tracker/sync.js';
import { closeBugfixTrackerIssue, createBugfixTrackerIssue, type TrackerCloseDeps, type TrackerCreateDeps } from '../bugfix/tracker.js';
import { renderIssueMarkdown } from '../artifacts/issue.js';
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
	// push finalize on an ISSUE-only fixture, driven through finalizeTracker
	// (the real finalize path: checklist gate -> refs narrow -> mutateEpicTrackerMeta)
	{
		const fx = seedIssueOnly();
		try {
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue' };
			const res = _finalizeTracker(intent, { s1 }, 'run-1', 5, {
				refs: { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: ['insrc:epic'] },
				checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
			}, 'm');
			assert.equal(res.ok, true, JSON.stringify(res));
			_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.push', { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: ['insrc:epic'] } as never);
			const meta = readTrackerMeta(fx.issue);
			assert.equal(meta?.adapter, 'github');
			assert.equal(meta?.issueRef, 'acme/demo#42', 'issueRef written back on first publication (push)');
			assert.deepEqual(meta?.labelsCreated, ['insrc:epic']);
			assert.equal(defFileCount(fx.repo), 0, 'zero DEF-*.json fabricated');
			assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }))?.reference.entityId, 'acme/demo#42', 'EPIC head bound');
			assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'STORY', epicHash: HASH, story: IMPLIED_ISSUE_STORY_ID }))?.reference.entityId, 'acme/demo#42', 'STORY-s1 head bound to the same issue');
			// sync finalize lands on the ISSUE json too (through finalizeTracker)
			const syncIntent = { workflow: 'tracker.sync', focus: 'sync', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const fSync = _finalizeTracker(syncIntent, { s1 }, 'run-s', 5, {
				refs: { epicStatus: 'open', storyStatus: { [IMPLIED_ISSUE_STORY_ID]: 'open' }, syncedAt: '2026-11-24T00:00:00.000Z' },
				checklist: { items: [{ itemId: 'epicMapping', verdict: 'passed' }], failedCount: 0 },
			}, 'm');
			assert.equal(fSync.ok, true, JSON.stringify(fSync));
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
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const f = _finalizeTracker(intent, { s1: { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue' } }, 'run-c', 5, {
				refs: { epicRef: 'acme/demo#9', storyRefs: {}, labelsCreated: [] },
				checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
			}, 'm');
			assert.equal(f.ok, true, JSON.stringify(f));
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

test('first publication sequence — approve ISSUE with tracking disabled, enable, push: exactly 1 create, issueRef written back + heads bound; write-back failure -> retry adopts with 0 creates', async () => {
	// The REAL production sequence, driven through createBugfixTrackerIssue
	// (the approve-time bugfix tracker create, gated on repo config) and
	// _finalizeTracker (the push finalize):
	//  1. approve with tracking DISABLED (cfg type 'none') -> createBugfixTrackerIssue skips, NO create, no issueRef.
	//  2. enable tracking -> push: createBugfixTrackerIssue creates exactly ONE
	//     issue and records the ref (issueRef write-back); push finalize binds heads.
	//  3. simulated write-back failure on the create (recordRef throws) -> the
	//     recovery branch runs; the NEXT run re-reads the recorded ref -> 'reused',
	//     0 creates, and push finalize adopts the same ref idempotently.
	const fx = seedIssueOnly();
	try {
		const NONE = { type: 'none', reason: 'disabled at approve time', source: 'test' } as never;
		const GITHUB = { type: 'github', owner: 'acme', repo: 'demo', source: 'test' } as never;
		const issue = JSON.parse(readFileSync(fx.issue, 'utf8'));
		let creates = 0;
		const deps = (cfg: never): TrackerCreateDeps => ({
			resolveConfig: () => cfg,
			authOk: () => ({ ok: true }),
			readIssue: () => issue,
			readRecordedRef: (repoPath: string, issueHash: string) => readTrackerMeta(artifactJsonPath(repoPath, issueArtifactId(issueHash)))?.issueRef ?? null,
			renderBody: renderIssueMarkdown,
			createIssue: () => { creates += 1; return { ref: 'acme/demo#42', id: 9001, typed: true }; },
			resolveParentIssueRef: () => null,
			linkSubIssue: () => {},
			recordRef: (repoPath: string, issueHash: string, ref: string) => {
				patchTrackerMeta(artifactJsonPath(repoPath, issueArtifactId(issueHash)), { issueRef: ref });
			},
			labels: [],
			promptOnLostRef: async () => ({ status: 'skipped', reason: 'test' } as never),
		});

		// (1) tracking disabled at approve time: skipped, 0 creates, no ref
		const r0 = await createBugfixTrackerIssue({ repoPath: fx.repo, issueHash: HASH }, deps(NONE));
		assert.equal(r0.status, 'skipped');
		assert.equal(creates, 0, 'disabled tracker creates nothing');
		assert.equal(readTrackerMeta(fx.issue)?.issueRef, undefined, 'no issueRef with tracking disabled');

		// (2) enable + first push: exactly ONE create; the push finalize writes
		// the issueRef back and binds the EPIC + STORY-s1 heads (t4 production path).
		const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
		const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue' };
		const r1 = await createBugfixTrackerIssue({ repoPath: fx.repo, issueHash: HASH }, deps(GITHUB));
		assert.equal(r1.status, 'created', JSON.stringify(r1));
		assert.equal(creates, 1, 'first publication creates exactly one issue');
		assert.equal(readTrackerMeta(fx.issue)?.issueRef, 'acme/demo#42', 'issueRef written back');
		const f1 = _finalizeTracker(intent, { s1 }, 'run-1', 5, {
			refs: { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: ['insrc:epic'] },
			checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
		}, 'm');
		assert.equal(f1.ok, true, JSON.stringify(f1));
		assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }))?.reference.entityId, 'acme/demo#42');
		assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'STORY', epicHash: HASH, story: IMPLIED_ISSUE_STORY_ID }))?.reference.entityId, 'acme/demo#42');

		// (3) write-back failure + retry, all through production code: make the
		// finalize's write-back fail on a second fixture by having recordRef throw
		// once, then re-run the full push sequence against the SAME remote state.
		// The retry's create gate (readRecordedRef) and the push context's
		// existingRefs both read only persisted state — so the proof of
		// "0 duplicate creates on retry" is that creates stays at its count while
		// both production adoption reads fire.
		{
			const fx2 = seedIssueOnly();
			try {
				let failOnce = true;
				const depsF = (cfg: never): TrackerCreateDeps => ({ ...deps(cfg), recordRef: (repoPath: string, issueHash: string, ref: string) => {
					if (failOnce) { failOnce = false; throw new Error('simulated write-back failure'); }
					patchTrackerMeta(artifactJsonPath(repoPath, issueArtifactId(issueHash)), { issueRef: ref });
				} });
				// first enabled run: create happens, write-back FAILS (ref-unrecorded)
				const rf = await createBugfixTrackerIssue({ repoPath: fx2.repo, issueHash: HASH }, depsF(GITHUB));
				assert.equal(rf.status, 'created');
				assert.equal((rf as { reason?: string }).reason, 'ref-unrecorded', JSON.stringify(rf));
				const createsAfterFail = creates;
				assert.equal(createsAfterFail, 2, 'one create for fx2');
				assert.equal(readTrackerMeta(fx2.issue)?.issueRef, undefined, 'nothing persisted after the failed write-back');
				// retry: the PUSH finalize re-runs first (its own write-back onto the
				// ISSUE json succeeds now) and binds the heads; the bugfix create's
				// recorded-ref gate then reads that persisted ref and adopts.
				const intent2 = { workflow: 'tracker.push', focus: 'push', repoPath: fx2.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
				const fRetry = _finalizeTracker(intent2, { s1 }, 'run-f2', 5, {
					refs: { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: ['insrc:epic'] },
					checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
				}, 'm');
				assert.equal(fRetry.ok, true, JSON.stringify(fRetry));
				assert.equal(readTrackerMeta(fx2.issue)?.issueRef, 'acme/demo#42', 'push finalize wrote the issueRef back on retry');
				// NOW the recorded ref exists: the next create run adopts with 0 creates
				const rr2 = await createBugfixTrackerIssue({ repoPath: fx2.repo, issueHash: HASH }, depsF(GITHUB));
				assert.equal(rr2.status, 'reused', JSON.stringify(rr2));
				assert.equal(creates, createsAfterFail, 'adoption run creates nothing — 0 duplicate creates');
				// and the push context surfaces the recorded ref as existingRefs (t2):
				const cfgPath = join(fx2.repo, 'repo-config.json');
				writeFileSync(cfgPath, JSON.stringify({ repos: { [fx2.repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
				const priorCfg = process.env['INSRC_REPO_CONFIG'];
				process.env['INSRC_REPO_CONFIG'] = cfgPath;
				try {
					const { assemblePushContext } = await import('../runners/tracker/context.js');
					const c = await assemblePushContext({ intent: { repoPath: fx2.repo, workflow: 'tracker.push', params: { epicHash: HASH } } } as never);
					assert.equal(c.existingRefs?.epicRef, 'acme/demo#42', 'push context adopts the recorded ref');
				} finally { process.env['INSRC_REPO_CONFIG'] = priorCfg; }
				assert.equal(defFileCount(fx2.repo), 0);
			} finally { fx2.cleanup(); }
		}

		// (4) steady state on fx: with the ref recorded + heads bound, both the
		// create gate and the push context adopt — 0 further creates.
		const r2 = await createBugfixTrackerIssue({ repoPath: fx.repo, issueHash: HASH }, deps(GITHUB));
		assert.equal(r2.status, 'reused', JSON.stringify(r2));
		const createsAtEnd = creates;
		assert.equal(createsAtEnd, 2, 'steady-state retry adopts — total creates = fx first publication (1) + fx2 failed-run create (1), 0 duplicates');
		const f3 = _finalizeTracker(intent, { s1 }, 'run-3', 5, {
			refs: { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: ['insrc:epic'] },
			checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
		}, 'm');
		assert.equal(f3.ok, true, JSON.stringify(f3));
		assert.equal(readTrackerMeta(fx.issue)?.issueRef, 'acme/demo#42');
		assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }))?.reference.entityId, 'acme/demo#42');
		assert.equal(defFileCount(fx.repo), 0);
	} finally { fx.cleanup(); }
});
