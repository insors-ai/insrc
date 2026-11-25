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
import { ArtifactIds as _AI } from '../artifact-ids.js';
import { titleMatchesToken, type IssueRef, type PortResult, type TrackerPort as _TP } from '../tracker/port.js';
import { ensureUnitIssueDetailed } from '../tracker/unit-issue.js';
import { ArtifactIds } from '../artifact-ids.js';
import { approvedMeta } from './lifecycle-fixtures.js';
import { installExecStandIn } from './helpers/exec-stand-in.js';
import type { PortResult, TrackerPort } from '../tracker/port.js';
import { claimCreateIntent, heartbeatClaim, markClaimCreatedFence, readClaim } from '../tracker/pending-create-claim.js';
import { bindUnitIssue } from '../tracker/link.js';
import { unitIssueOf } from '../tracker/unit-head.js';
import { readDefinitionHead } from '../gates.js';

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

test('src/workflow/orchestrator.ts mutateEpicTrackerMeta + finalizeTracker — finalize push+sync on ISSUE-only seed repo: ISSUE meta.tracker written, EPIC/STORY-s1 heads bound, readdir zero DEF-*.json; corrupt-DEF/valid-ISSUE finalize lands on ISSUE json; issueRef write-back on first publication', async () => {
	// push finalize on an ISSUE-only fixture, driven through finalizeTracker
	// (the real finalize path: checklist gate -> refs narrow -> mutateEpicTrackerMeta)
	{
		const fx = seedIssueOnly();
		try {
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue' };
			const res = await _finalizeTracker(intent, { s1 }, 'run-1', 5, {
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
			const fSync = await _finalizeTracker(syncIntent, { s1 }, 'run-s', 5, {
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
			const f = await _finalizeTracker(intent, { s1: { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue' } }, 'run-c', 5, {
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
		// Production defaults verbatim: defaultTrackerCreateDeps uses labels: []
		// and the plain ISSUE title (bugfix/tracker.ts:460,171) — the remote issue
		// run A creates carries NO discovery labels and NO artifact-id title token.
		const createLabels: readonly string[] = [];
		// One shared remote: the issue run A creates is the SAME object the retry sees.
		const remoteIssues: Array<{ ref: IssueRef; title: string; labels: string[] }> = [];
		const deps = (cfg: never): TrackerCreateDeps => ({
			resolveConfig: () => cfg,
			authOk: () => ({ ok: true }),
			readIssue: () => issue,
			readRecordedRef: (repoPath: string, issueHash: string) => readTrackerMeta(artifactJsonPath(repoPath, issueArtifactId(issueHash)))?.issueRef ?? null,
			renderBody: renderIssueMarkdown,
			createIssue: (_owner: string, _repo: string, title: string, _body: string, labels: readonly string[]) => {
				creates += 1;
				const ref = `acme/demo#${40 + creates}`;
				remoteIssues.push({ ref, title, labels: [...labels] });
				return { ref, id: 9000 + creates, typed: true };
			},
			resolveParentIssueRef: () => null,
			linkSubIssue: () => {},
			recordRef: (repoPath: string, issueHash: string, ref: string) => {
				patchTrackerMeta(artifactJsonPath(repoPath, issueArtifactId(issueHash)), { issueRef: ref });
			},
			labels: createLabels,
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
		const FIRST_REF = remoteIssues[0]!.ref;
		assert.equal(readTrackerMeta(fx.issue)?.issueRef, FIRST_REF, 'issueRef written back');
		const f1 = await _finalizeTracker(intent, { s1 }, 'run-1', 5, {
			refs: { epicRef: FIRST_REF, storyRefs: { [IMPLIED_ISSUE_STORY_ID]: FIRST_REF }, labelsCreated: ['insrc:epic'] },
			checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
		}, 'm');
		assert.equal(f1.ok, true, JSON.stringify(f1));
		assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }))?.reference.entityId, FIRST_REF);
		assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'STORY', epicHash: HASH, story: IMPLIED_ISSUE_STORY_ID }))?.reference.entityId, FIRST_REF);

		// (3) write-back failure + retry on a second fixture, with NO hand-seeded
		// recovery state. The real production sequence after a lost write-back is:
		//   run A: create succeeds (counted), recordRef throws -> 'ref-unrecorded',
		//          nothing persisted locally.
		//   run B (retry): the push context is assembled FIRST — with no recorded
		//          ref and no head binding it finds nothing to adopt
		//          (existingRefs absent); the execute step would then re-create.
		//          The claim under test is the PUSH-side adoption: once the remote
		//          issue exists and is discoverable, the retry adopts with 0 creates.
		//          We model the remote side with the counted stub: run B's create
		//          gate only fires 'reused' when a ref IS persisted, so we drive the
		//          push finalize (the production write-back) and then assert the
		//          adoption reads — never patching the ref by hand.
		{
			// fx2: the deterministic push path (tracker.push via ensureUnitIssueDetailed)
			// with the EPIC artifact-id title + unit/membership labels — the exact
			// discoverability the production title-token guard uses.
			const fx2 = seedIssueOnly();
			try {
				const token = _AI.make({ kind: 'EPIC', epicHash: HASH });
				const fx2Remote: Array<{ ref: IssueRef; title: string; labels: string[] }> = [];
				const remotePort = {
					kind: 'github', capabilities: new Set(['issue-create']),
					findIssues: (labels: string[]): PortResult<IssueRef[]> => ({ ok: true, value: fx2Remote.filter(i => labels.every(l => i.labels.includes(l))).map(i => i.ref) }),
					findIssue: (labels: string[]): PortResult<IssueRef | null> => ({ ok: true, value: fx2Remote.find(i => labels.every(l => i.labels.includes(l)))?.ref ?? null }),
					findIssuesByTitleToken: (t: string): PortResult<IssueRef[]> => ({ ok: true, value: fx2Remote.filter(i => titleMatchesToken(i.title, t)).map(i => i.ref) }),
					issueOps: {
						create: (spec: { title: string; labels?: string[] }): PortResult<{ ref: IssueRef; id: number }> => {
							creates += 1;
							const ref = `acme/demo#${100 + creates}`;
							fx2Remote.push({ ref, title: spec.title, labels: [...(spec.labels ?? [])] });
							return { ok: true, value: { ref, id: 9000 + creates } };
						},
						linkSubIssue: (): PortResult<void> => ({ ok: true, value: undefined }),
						ensureLabel: () => true,
						comment: (): PortResult<void> => ({ ok: true, value: undefined }),
						close: (): PortResult<void> => ({ ok: true, value: undefined }),
						resolveIssueId: (): PortResult<number> => ({ ok: true, value: 1 }),
					},
				} as unknown as _TP;
				const unit = { unit: 'epic', repoPath: fx2.repo, epicHash: HASH } as const;

				// run A: the deterministic push creates ONE issue (EPIC-token title +
				// unit/membership labels). Stage a journal write for the EPIC head FIRST,
				// so the post-create recordUnit is refused by the staged-write guard
				// (kind 'staged') — the write-back genuinely fails; the remote issue
				// exists but no local record does.
				mkdirSync(join(fx2.repo, '.insrc', 'journal'), { recursive: true });
				writeFileSync(join(fx2.repo, '.insrc', 'journal', `${token}.json`), '{}');
				const runA = await ensureUnitIssueDetailed(unit, remotePort, { readConfig: () => GITHUB });
				assert.equal(runA.ok, true, JSON.stringify(runA));
				if (runA.ok) assert.equal(runA.value.created, true);
				const createsAfterA = creates;
				const FAIL_REF = runA.ok ? runA.value.issue : '';
				assert.ok(FAIL_REF.length > 0);
				assert.equal(readBinding(fx2.repo, token), undefined, 'write-back failed: staged write blocks the binding');
				assert.equal(readTrackerMeta(fx2.issue)?.issueRef, undefined, 'no issueRef persisted');

				// run B (retry): the SAME production ensure — local record absent (the
				// staged-write guard still blocks a rebind until the journal is cleared),
				// so it falls through to the remote lookups and the title-token guard
				// finds the issue run A created (EPIC-token title), adopting created:false:
				rmSync(join(fx2.repo, '.insrc', 'journal', `${token}.json`), { force: true });
				const runB = await ensureUnitIssueDetailed(unit, remotePort, { readConfig: () => GITHUB });
				assert.equal(runB.ok, true, JSON.stringify(runB));
				if (runB.ok) {
					assert.equal(runB.value.created, false, 'retry ADOPTS the remote issue — no duplicate create');
					assert.equal(runB.value.issue, FAIL_REF, 'adopts exactly the issue run A created');
				}
				assert.equal(creates, createsAfterA, 'the production retry made 0 duplicate creates');
				assert.equal(readBinding(fx2.repo, token)?.reference.entityId, FAIL_REF, 'adoption recorded on the EPIC head binding');
				// the ISSUE-side write-back + STORY-s1 binding: run the push finalize
				// (the production tracker.push writer) on the adopted ref:
				const intent2 = { workflow: 'tracker.push', focus: 'push', repoPath: fx2.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
				const s1b = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue' };
				const fB = await _finalizeTracker(intent2, { s1: s1b }, 'run-f2', 5, {
					refs: { epicRef: FAIL_REF, storyRefs: { [IMPLIED_ISSUE_STORY_ID]: FAIL_REF }, labelsCreated: ['insrc:epic'] },
					checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
				}, 'm');
				assert.equal(fB.ok, true, JSON.stringify(fB));
				assert.equal(readTrackerMeta(fx2.issue)?.issueRef, FAIL_REF, 'ISSUE issueRef written back on the retry push');
				assert.equal(readBinding(fx2.repo, _AI.make({ kind: 'STORY', epicHash: HASH, story: IMPLIED_ISSUE_STORY_ID }))?.reference.entityId, FAIL_REF, 'STORY-s1 head bound to the same issue');
				assert.equal(defFileCount(fx2.repo), 0);
			} finally { fx2.cleanup(); }
		}

		// (4) steady state on fx: with the ref recorded + heads bound, both the
		// create gate and the push context adopt — 0 further creates.
		const r2 = await createBugfixTrackerIssue({ repoPath: fx.repo, issueHash: HASH }, deps(GITHUB));
		assert.equal(r2.status, 'reused', JSON.stringify(r2));
		const createsAtEnd = creates;
		assert.equal(createsAtEnd, 2, 'steady-state: fx publication (1) + fx2 deterministic run-A create (1); run B adopted with 0 more');
		const f3 = await _finalizeTracker(intent, { s1 }, 'run-3', 5, {
			refs: { epicRef: FIRST_REF, storyRefs: { [IMPLIED_ISSUE_STORY_ID]: FIRST_REF }, labelsCreated: ['insrc:epic'] },
			checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
		}, 'm');
		assert.equal(f3.ok, true, JSON.stringify(f3));
		assert.equal(readTrackerMeta(fx.issue)?.issueRef, FIRST_REF);
		assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }))?.reference.entityId, FIRST_REF);
		assert.equal(defFileCount(fx.repo), 0);
	} finally { fx.cleanup(); }
});

test('REVIEW HIGH-2/HIGH-3 — reconciled adoption returns TrackerPushRefs shape and finalize persists; a stale-fence finalize is rejected before any write', async () => {
	const fx = seedIssueOnly();
	try {
		const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
		const c = claimCreateIntent(fx.repo, HASH, 'run-A', { title: 'ISSUE title', marker: `<!-- insrc:artifact ISSUE-${HASH} -->` });
		assert.equal(c.claimed, true);
		const refs = { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: [] };
		const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', claimFence: c.claim.fence, claimRunId: 'run-A' };
		const fr = await _finalizeTracker(intent, { s1 }, 'run-x', 5, { refs, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
		assert.equal(fr.ok, true, `finalize accepts the adopted refs shape: ${JSON.stringify(fr)}`);
		assert.equal(readTrackerMeta(fx.issue)?.issueRef, 'acme/demo#42', 'issueRef persisted by finalize');
		assert.equal(readClaim(fx.repo, HASH), undefined, 'claim released inside the finalize mutex after persistence');
	} finally { fx.cleanup(); }

	const fx2 = seedIssueOnly();
	try {
		writeFileSync(
			artifactJsonPath(fx2.repo, `PENDING-CREATE-${HASH}`),
			JSON.stringify({ epicHash: HASH, runId: 'run-B', owner: 'run:run-B', repo: fx2.repo, title: 't', marker: `<!-- insrc:artifact ISSUE-${HASH} -->`, state: 'created', fence: 2, createdAt: '2026-11-24T00:00:00.000Z', heartbeatAt: '2026-11-24T00:00:00.000Z' }),
		);
		const before = readFileSync(fx2.issue, 'utf8');
		const staleS1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', claimFence: 1, claimRunId: 'run-B' };
		const intent2 = { workflow: 'tracker.push', focus: 'push', repoPath: fx2.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
		const fr2 = await _finalizeTracker(intent2, { s1: staleS1 }, 'run-stale', 5, { refs: { epicRef: 'acme/demo#9', storyRefs: { s1: 'acme/demo#9' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
		assert.equal(fr2.ok, false, 'stale-fence finalize rejected');
		assert.match(JSON.stringify(fr2), /stale fence/i);
		assert.equal(readFileSync(fx2.issue, 'utf8'), before, 'no write happened — displaced owner fenced before its first write');
	} finally { fx2.cleanup(); }
});

test('REVIEW round-3 — stale-context run adopts the durable ref (HIGH-1); carried-fence run with a deleted claim and a DIFFERENT ref is refused (HIGH-2); retained claim + persisted ref completes idempotently (MED-3); failed STORY binding fails finalization and retains the claim (MED-4)', async () => {
	{
		const fx = seedIssueOnly();
		try {
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const c = claimCreateIntent(fx.repo, HASH, 'run-A', { title: 'ISSUE title', marker: `<!-- insrc:artifact ISSUE-${HASH} -->` });
			const committed = await heartbeatClaim(fx.repo, HASH, c.claim.fence);
			const refs = { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, labelsCreated: [] };
			const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', claimFence: committed, claimRunId: 'run-A' };
			const fr = await _finalizeTracker(intent, { s1 }, 'run-A', 5, { refs, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
			assert.equal(fr.ok, true, JSON.stringify(fr));
			assert.equal(readClaim(fx.repo, HASH), undefined, 'A completed: claim released');
			const head = readDefinitionHead(fx.repo, HASH);
			const durableRef = unitIssueOf(fx.repo, HASH) ?? (head?.kind === 'issue' ? readTrackerMeta(artifactJsonPath(fx.repo, issueArtifactId(HASH)))?.issueRef : undefined);
			assert.equal(durableRef, 'acme/demo#42', 'HIGH-1: durable re-read picks up A\'s publication for a stale-context run');
		} finally { fx.cleanup(); }
	}
	{
		const fx = seedIssueOnly();
		try {
			bindUnitIssue({ unit: 'epic', repoPath: fx.repo, epicHash: HASH }, 'acme/demo#42');
			patchTrackerMeta(fx.issue, { issueRef: 'acme/demo#42' });
			const staleS1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', claimFence: 2 };
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const fr = await _finalizeTracker(intent, { s1: staleS1 }, 'run-A-stale', 5, { refs: { epicRef: 'acme/demo#99', storyRefs: { s1: 'acme/demo#99' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
			assert.equal(fr.ok, false, 'HIGH-2: stale owner with a different ref is refused');
			// round-16 self-review: the durable-ref rebind check fires before the
			// displaced-owner check — both refuse before any write
			assert.match(JSON.stringify(fr), /displaced\/completed owner refused|refusing to rebind/i);
			assert.equal(readTrackerMeta(fx.issue)?.issueRef, 'acme/demo#42', 'completed publication not replaced');
			const fr2 = await _finalizeTracker(intent, { s1: staleS1 }, 'run-A-idem', 5, { refs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
			assert.equal(fr2.ok, true, 'HIGH-2: idempotent completion with the same durable ref is allowed: ' + JSON.stringify(fr2));
		} finally { fx.cleanup(); }
	}
	{
		const fx = seedIssueOnly();
		try {
			claimCreateIntent(fx.repo, HASH, 'run-A', { title: 'ISSUE title', marker: `<!-- insrc:artifact ISSUE-${HASH} -->` });
			bindUnitIssue({ unit: 'epic', repoPath: fx.repo, epicHash: HASH }, 'acme/demo#42');
			patchTrackerMeta(fx.issue, { issueRef: 'acme/demo#42' });
			const claim = readClaim(fx.repo, HASH);
			const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', claimFence: claim!.fence, claimRunId: 'run-A' };
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const fr = await _finalizeTracker(intent, { s1 }, 'run-recover', 5, { refs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
			assert.equal(fr.ok, true, 'MED-3: retained-claim recovery with the verified fence completes: ' + JSON.stringify(fr));
			assert.equal(readClaim(fx.repo, HASH), undefined, 'cleanup completed inside the mutex');
		} finally { fx.cleanup(); }
	}
	{
		const fx = seedIssueOnly();
		try {
			const c = claimCreateIntent(fx.repo, HASH, 'run-A', { title: 'ISSUE title', marker: `<!-- insrc:artifact ISSUE-${HASH} -->` });
			mkdirSync(join(fx.repo, '.insrc', 'journal'), { recursive: true });
			writeFileSync(join(fx.repo, '.insrc', 'journal', `STORY-${HASH}-s1.json`), '{}');
			const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', claimFence: c.claim.fence, claimRunId: 'run-A' };
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const fr = await _finalizeTracker(intent, { s1 }, 'run-bindfail', 5, { refs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
			assert.equal(fr.ok, false, 'MED-4: failed required binding fails finalization');
			assert.match(JSON.stringify(fr), /required head bindings failed/i);
			assert.ok(readClaim(fx.repo, HASH) !== undefined, 'claim retained as recovery evidence');
			assert.equal(readBinding(fx.repo, ArtifactIds.make({ kind: 'STORY', epicHash: HASH, story: 's1' })), undefined, 'STORY-s1 binding absent (staged)');
		} finally { fx.cleanup(); }
	}
});

test('REVIEW round-6 HIGH-3 — finalize validates the recovered ref, the configured gh repo and the single-issue mapping BEFORE any write; MED-5 — sync reuses the root status for the implied s1 when only the root ref is recorded', async () => {
	// HIGH-3a: the claim recorded marker-verified issueRef #42; the model returns #99 -> refused, zero writes
	{
		const fx = seedIssueOnly();
		try {
			claimCreateIntent(fx.repo, HASH, 'run-A', { title: 'ISSUE title', marker: `<!-- insrc:artifact ISSUE-${HASH} -->`, ghOwner: 'acme', ghRepo: 'demo' });
			const fence = await markClaimCreatedFence(fx.repo, HASH, 1, 'acme/demo#42', undefined, 'run-A');
			const before = readFileSync(fx.issue, 'utf8');
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', claimFence: fence, claimRunId: 'run-A' };
			const fr = await _finalizeTracker(intent, { s1 }, 'run-A', 5, { refs: { epicRef: 'acme/demo#99', storyRefs: { s1: 'acme/demo#99' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
			assert.equal(fr.ok, false, 'a different issue than the recovered one is refused');
			assert.match(JSON.stringify(fr), /recovered claim ref acme\/demo#42 != returned epicRef acme\/demo#99/);
			assert.equal(readFileSync(fx.issue, 'utf8'), before, 'no write happened before the refusal');
		} finally { fx.cleanup(); }
	}
	// HIGH-3b: epicRef targets a different GitHub repository than the configured one
	{
		const fx = seedIssueOnly();
		try {
			const before = readFileSync(fx.issue, 'utf8');
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue' };
			const fr = await _finalizeTracker(intent, { s1 }, 'run-1', 5, { refs: { epicRef: 'other/repo#5', storyRefs: { s1: 'other/repo#5' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
			assert.equal(fr.ok, false);
			assert.match(JSON.stringify(fr), /does not target the configured GitHub repository acme\/demo/);
			assert.equal(readFileSync(fx.issue, 'utf8'), before, 'no write happened');
		} finally { fx.cleanup(); }
	}
	// HIGH-3c: storyRefs.s1 differs from the root epicRef — the implied story IS the root issue
	{
		const fx = seedIssueOnly();
		try {
			const before = readFileSync(fx.issue, 'utf8');
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue' };
			const fr = await _finalizeTracker(intent, { s1 }, 'run-1', 5, { refs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#43' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
			assert.equal(fr.ok, false);
			assert.match(JSON.stringify(fr), /single-issue mapping/);
			assert.equal(readFileSync(fx.issue, 'utf8'), before, 'no write happened; s1 is derived from the validated root, never overridden');
		} finally { fx.cleanup(); }
	}
	// MED-5: only the root issueRef recorded (no STORY-s1 binding) — the deterministic
	// refresh reuses the ROOT status for the implied s1 instead of persisting an empty storyStatus
	{
		const fx = seedIssueOnly();
		try {
			patchTrackerMeta(fx.issue, { issueRef: 'acme/demo#42' });   // root ref only; no head bindings at all
			const port = {
				kind: 'github', capabilities: new Set(['status-read', 'whoami']),
				whoAmI: (): PortResult<string> => ({ ok: true, value: 'me' }),
				readIssueStatus: () => ({ ok: true, value: { state: 'OPEN', labels: [] } }),
			} as unknown as TrackerPort;
			const r = await syncTracker(fx.repo, HASH, undefined, { port });
			assert.equal(r.status, 'synced', JSON.stringify(r));
			if (r.status === 'synced') {
				assert.deepEqual(r.storyStatus, { [IMPLIED_ISSUE_STORY_ID]: 'open' }, 's1 reuses the root issue status on an ISSUE head with only the root ref recorded');
			}
			assert.equal(readTrackerMeta(fx.issue)?.storyStatus?.[IMPLIED_ISSUE_STORY_ID], 'open', 'persisted onto the ISSUE json');
			assert.equal(readTrackerMeta(fx.issue)?.epicStatus, 'open');
		} finally { fx.cleanup(); }
	}
});

test('REVIEW round-7 HIGH-3 — a reused fence from a different run is refused: replacement claim (delete-and-retry) reaches the same fence number, but the carried claimRunId does not match; zero writes, claim retained', async () => {
	const fx = seedIssueOnly();
	try {
		// original run A claimed (fence 1) and carried fence 1 + runId 'run-A'
		claimCreateIntent(fx.repo, HASH, 'run-A', { title: 'ISSUE title', marker: `<!-- insrc:artifact ISSUE-${HASH} -->`, ghOwner: 'acme', ghRepo: 'demo' });
		// operator "recovers" by deleting the claim; run B wins a FRESH claim — also fence 1
		rmSync(artifactJsonPath(fx.repo, `PENDING-CREATE-${HASH}`), { force: true });
		const b = claimCreateIntent(fx.repo, HASH, 'run-B', { title: 'ISSUE title', marker: `<!-- insrc:artifact ISSUE-${HASH} -->`, ghOwner: 'acme', ghRepo: 'demo' });
		assert.equal(b.claimed, true);
		assert.equal(b.claim.fence, 1, 'the replacement claim restarts at fence 1 — same number as the original');
		const before = readFileSync(fx.issue, 'utf8');
		const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
		// the RESUMED original run carries fence 1 + its own runId 'run-A'
		const s1 = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', claimFence: 1, claimRunId: 'run-A' };
		const fr = await _finalizeTracker(intent, { s1 }, 'run-A-resumed', 5, { refs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
		assert.equal(fr.ok, false, 'same fence from a different run is refused');
		assert.match(JSON.stringify(fr), /not the claim owner.*run-B/s, 'the refusal names the actual owner of the replacement claim');
		assert.equal(readFileSync(fx.issue, 'utf8'), before, 'zero writes — the resumed run cannot persist into the replacement claim');
		assert.ok(readClaim(fx.repo, HASH) !== undefined, 'the replacement claim is NOT unlinked by the refused run');
		assert.equal(readClaim(fx.repo, HASH)?.runId, 'run-B');
		// and the replacement owner's own finalize (fence 1 + runId run-B) succeeds
		const s1b = { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', claimFence: 1, claimRunId: 'run-B' };
		const frB = await _finalizeTracker(intent, { s1: s1b }, 'run-B', 5, { refs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }, 'm');
		assert.equal(frB.ok, true, JSON.stringify(frB));
		assert.equal(readTrackerMeta(fx.issue)?.issueRef, 'acme/demo#42');
		assert.equal(readClaim(fx.repo, HASH), undefined, 'the rightful owner releases the claim after persistence');
	} finally { fx.cleanup(); }
});

test('SELF-REVIEW round-16 — finalize rereads the live ISSUE head: durable-ref rebind refused without a claim; unapproved head refused on push AND sync; changed approved content refused on push', async () => {
	const { renderIssueEpicBody } = await import('../tracker/conventions.js');
	const BODY = renderIssueEpicBody({ body: { title: 'ISSUE title', reproduction: 'r', rootCause: 'c', fixIntent: 'f' } } as never, SLUG, undefined, issueArtifactId(HASH));
	const pushIntentOf = (repo: string) => ({ workflow: 'tracker.push', focus: 'push', repoPath: repo, repoIndexedAt: null, params: { epicHash: HASH } }) as never;
	const refsOf = (ref: string) => ({ refs: { epicRef: ref, storyRefs: { [IMPLIED_ISSUE_STORY_ID]: ref }, labelsCreated: [] }, checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 } }) as never;
	const s1Of = (extra: Record<string, unknown> = {}) => ({ gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue', epicBodyMd: BODY, ...extra });

	// (a) durable ref recorded, NO claim, model returns a different in-repo ref -> refused; same ref -> allowed
	{
		const fx = seedIssueOnly();
		try {
			bindUnitIssue({ unit: 'epic', repoPath: fx.repo, epicHash: HASH }, 'acme/demo#42');
			patchTrackerMeta(fx.issue, { issueRef: 'acme/demo#42' });
			const fr = await _finalizeTracker(pushIntentOf(fx.repo), { s1: s1Of() }, 'run-X', 5, refsOf('acme/demo#99'), 'm');
			assert.equal(fr.ok, false, 'a different returned ref is refused even with no claim');
			assert.match(JSON.stringify(fr), /refusing to rebind/);
			assert.equal(readTrackerMeta(fx.issue)?.issueRef, 'acme/demo#42', 'durable ref not rebound');
			const fr2 = await _finalizeTracker(pushIntentOf(fx.repo), { s1: s1Of() }, 'run-X', 5, refsOf('acme/demo#42'), 'm');
			assert.equal(fr2.ok, true, 'adopting the recorded ref persists: ' + JSON.stringify(fr2));
		} finally { fx.cleanup(); }
	}
	// (b) head loses approval between execute and finalize -> refused on push
	{
		const fx = seedIssueOnly();
		try {
			const j = JSON.parse(readFileSync(fx.issue, 'utf8')) as { meta: Record<string, unknown> };
			delete j.meta['lifecycle'];
			writeFileSync(fx.issue, JSON.stringify(j));
			const fr = await _finalizeTracker(pushIntentOf(fx.repo), { s1: s1Of() }, 'run-X', 5, refsOf('acme/demo#42'), 'm');
			assert.equal(fr.ok, false);
			assert.match(JSON.stringify(fr), /not approved at finalize/);
		} finally { fx.cleanup(); }
	}
	// (b2) same gate on sync
	{
		const fx = seedIssueOnly();
		try {
			const j = JSON.parse(readFileSync(fx.issue, 'utf8')) as { meta: Record<string, unknown> };
			delete j.meta['lifecycle'];
			writeFileSync(fx.issue, JSON.stringify(j));
			const syncIntent = { workflow: 'tracker.sync', focus: 'sync', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: HASH } } as never;
			const fr = await _finalizeTracker(syncIntent, { s1: { gh: { owner: 'acme', repo: 'demo' }, epicHash: HASH, epicSlug: SLUG, headKind: 'issue' } }, 'run-S', 5, { refs: { epicStatus: 'open', storyStatus: { [IMPLIED_ISSUE_STORY_ID]: 'open' }, syncedAt: '2026-11-24T00:00:00.000Z' }, checklist: { items: [], failedCount: 0 } } as never, 'm');
			assert.equal(fr.ok, false);
			assert.match(JSON.stringify(fr), /not approved at finalize/);
		} finally { fx.cleanup(); }
	}
	// (c) approved but content changed since context assembly -> refused on push (stale context)
	{
		const fx = seedIssueOnly();
		try {
			const j = JSON.parse(readFileSync(fx.issue, 'utf8')) as { body: unknown };
			j.body = { title: 'ISSUE title v2', reproduction: 'r2', rootCause: 'c2', fixIntent: 'f2' };
			writeFileSync(fx.issue, JSON.stringify(j));
			const fr = await _finalizeTracker(pushIntentOf(fx.repo), { s1: s1Of() }, 'run-X', 5, refsOf('acme/demo#42'), 'm');
			assert.equal(fr.ok, false);
			assert.match(JSON.stringify(fr), /stale context/);
		} finally { fx.cleanup(); }
	}
});
