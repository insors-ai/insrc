/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deciding what to park: every refusal, the choice of run, and the checkpoint that is assembled. Nothing is changed.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/handoff-park-plan.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { _clearWorkflowStateStoreForTests, listStates, loadState, saveState, type RunEntryMeta } from '../../../daemon/steps/workflow-step/state-store.js';
import { STATE_VERSION, type WorkflowStepStatePayload } from '../../../daemon/steps/workflow-step/state.js';
import { artifactJsonPath, lldArtifactId } from '../../storage.js';
import type { IssueRef, PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import { _setGateDepsForTests } from '../gate.js';
import { parkPlan, validateCheckpoint, type ParkDeps } from '../handoff.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });
const UPSTREAM = [{ artifactId: `DEF-${HASH}`, revision: 3 }, { artifactId: `HLD-${HASH}@x`, revision: 5 }];

afterEach(() => { _setGateDepsForTests(); _clearWorkflowStateStoreForTests(); });

interface Env { repo: string; git: (...a: string[]) => string; unit: UnitRef; root: string; head: string }

function mkRepo(): Env {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-park-plan-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(repo, 'README.md'), 'x'); git('add', '-A'); git('commit', '-qm', 'init');
	writeFileSync(join(repo, 'two.txt'), 'y'); git('add', '-A'); git('commit', '-qm', 'second');
	return { repo, git, unit: { unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's1' }, root: git('rev-list', '--max-parents=0', 'HEAD'), head: git('rev-parse', 'HEAD') };
}

/** The gate sees `holder` as the holder of the issue (null: nobody) and alice as the actor. */
const WRITES: string[] = [];

function inject(holder: string | null, over: { readPolicy?: PolicyReader | undefined; issue?: IssueRef | null | undefined } = {}): { loads: () => number; ensures: () => number } {
	let loads = 0;
	let ensures = 0;
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: holder }),
		addAssignee: (): PortResult<string[]> => { WRITES.push('addAssignee'); return { ok: true, value: ['alice'] }; },
		setAssignee: (): PortResult<void> => { WRITES.push('setAssignee'); return { ok: true, value: undefined }; },
		get issueOps(): never { WRITES.push('issueOps'); throw new Error('park planning must not touch issueOps'); },
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy: over.readPolicy ?? team,
		loadTracker: () => { loads += 1; return { ok: true, value: port }; },
		resolveIssue: () => (over.issue === undefined ? 'acme/demo#7' : over.issue),
		ensureIssue: () => { ensures += 1; return { ok: true, value: 'acme/demo#99' }; },
		artifactExists: () => true,
	});
	return { loads: () => loads, ensures: () => ensures };
}

function payload(repo: string, runId: string, stage: WorkflowStepStatePayload['stage'] = 'awaiting_llm_step', storyId = 's1'): WorkflowStepStatePayload {
	return {
		version: STATE_VERSION, runId, epicKey: HASH, startedAtMs: 1, stage,
		intent: { workflow: 'design.story', focus: `work in ${repo}`, repoPath: repo, repoIndexedAt: 99, params: { epicHash: HASH, storyId, dir: repo } },
		...(stage === 'awaiting_llm_step' ? { executor: { runId, nextStepIndex: 1, plan: { workflow: 'design.story', steps: [] }, stepOutputs: { s1: { text: `see ${repo}/src/a.ts` } }, intent: { workflow: 'design.story', focus: 'f', repoPath: repo, repoIndexedAt: 99, params: {} } } } : {}),
		...(stage === 'awaiting_synthesize' ? { stepOutputs: { s1: 1 } } : {}),
	};
}

const owned = (owner: string | undefined): RunEntryMeta => ({ ...(owner !== undefined ? { owner } : {}), upstream: UPSTREAM });
const deps = (over: Partial<ParkDeps> = {}): ParkDeps => ({ branchPattern: () => undefined, now: () => '2026-10-18T12:00:00.000Z', ...over });
const reasonOf = (r: ReturnType<typeof parkPlan>): string => (r.ok ? 'OK' : r.reason);

function withClock<T>(times: readonly number[], fn: () => T): T {
	const real = Date.now; let i = 0;
	Date.now = () => times[Math.min(i++, times.length - 1)] ?? real();
	try { return fn(); } finally { Date.now = real; }
}

test('parkPlan refuses when the actor holds the unit, for a Task, with no issue or holder, with nothing to park, and for a supplied token of another unit, actor or no owner, and assembles a run or draft-only checkpoint otherwise', () => {
	const env = mkRepo();
	try {
		const { repo, unit } = env;
		WRITES.length = 0;
		const before = { status: env.git('status', '--porcelain'), branches: env.git('branch', '--list'), refs: env.git('for-each-ref'), runs: listStates().length };
		const plan = (u: UnitRef = unit, opts: { runToken?: string } = {}, d: ParkDeps = deps()) => parkPlan(repo, u, opts, d);

		// a bad branch pattern is refused before the tracker or git is touched
		const early = inject('bob');
		assert.match(reasonOf(plan(unit, {}, deps({ branchPattern: () => 'no-id-{type}' }))), /does not identify the unit/);
		assert.equal(early.loads(), 0, 'no tracker context was built');

		// a Task has no run: refused before the tracker is even asked
		const seen = inject('bob');
		assert.match(reasonOf(plan({ ...unit, unit: 'task', taskId: 't1' })), /a Task has no run/);
		assert.equal(seen.loads(), 0);

		// the tracker side
		inject('bob', { readPolicy: none });
		assert.match(reasonOf(plan()), /does not enforce claims/);
		const noIssue = inject('bob', { issue: null });
		assert.match(reasonOf(plan()), /no tracker issue yet/);
		assert.equal(noIssue.ensures(), 0, 'planning a park never creates an issue (the stubbed ensure would have succeeded)');
		inject(null);
		assert.match(reasonOf(plan()), /nobody holds this stage/);
		inject('alice');
		assert.match(reasonOf(plan()), /you hold this stage; there is nothing to hand over/);
		inject('ALICE');
		assert.match(reasonOf(plan()), /you hold this stage/, 'the login compares case-insensitively');

		// held by bob, but nothing of ours to hand over
		inject('bob');
		assert.match(reasonOf(plan()), /no draft or run to hand over/);

		// a supplied token must be the actor's own run for this unit
		const mine = saveState(payload(repo, 'wf-mine'), owned('alice'));
		const other = saveState(payload(repo, 'wf-other-story', 'awaiting_plan', 's2'), owned('alice'));
		const stranger = saveState(payload(repo, 'wf-carols'), owned('carol'));
		const ownerless = saveState(payload(repo, 'wf-ownerless'), undefined);
		assert.match(reasonOf(plan(unit, { runToken: 'no-such-token' })), /not a live run/);
		assert.match(reasonOf(plan(unit, { runToken: other })), /belongs to another unit/);
		assert.match(reasonOf(plan(unit, { runToken: stranger })), /belongs to carol/);
		assert.match(reasonOf(plan(unit, { runToken: ownerless })), /no recorded owner/);
		assert.equal(plan(unit, { runToken: mine }).ok, true);

		// the branch name must be valid
		for (const bad of ['/lead-{id}', 'no-id-{type}', 'a..{id}', 'foo.lock/{id}', 'x/y.lock/{id}', '-{id}']) {
			assert.match(reasonOf(plan(unit, {}, deps({ branchPattern: () => bad }))), /branch pattern|branch name/, bad);
		}

		// a bad branch pattern is refused before any git command runs: in a directory that is not a repository the answer is the pattern's,
		// where a good pattern would have run on to fail reading the history
		const bare = mkdtempSync(join(tmpdir(), 'insrc-park-plan-nogit-'));
		try {
			inject('bob');
			saveState(payload(bare, 'wf-nogit'), owned('alice'));
			const nogit: UnitRef = { ...unit, repoPath: bare };
			assert.match(reasonOf(parkPlan(bare, nogit, {}, deps({ branchPattern: () => 'no-id-{type}' }))), /does not identify the unit/);
			assert.match(reasonOf(parkPlan(bare, nogit, {}, deps())), /cannot read the repository's history/);
		} finally { rmSync(bare, { recursive: true, force: true }); _clearWorkflowStateStoreForTests(); }
		inject('bob');

		// an owned live run becomes a run checkpoint carrying the owner, the upstream snapshot and the repository identity
		_clearWorkflowStateStoreForTests();
		saveState(payload(repo, 'wf-1'), owned('alice'));
		const run = plan();
		assert.equal(run.ok, true);
		if (!run.ok) return;
		assert.equal(run.variant, 'run');
		assert.equal(run.branch, `insrc/handoff/story-${HASH}-s1`);
		assert.equal(run.runId, 'wf-1');
		assert.equal(run.actor, 'alice');
		assert.equal(run.holder, 'bob');
		assert.equal(run.issue, 'acme/demo#7');
		assert.equal(run.checkpoint.kind, 'run');
		if (run.checkpoint.kind !== 'run') return;
		assert.equal(run.checkpoint.owner, 'alice');
		assert.deepEqual(run.checkpoint.upstream, UPSTREAM);
		assert.equal(run.checkpoint.repositoryId, env.root);
		assert.equal(run.checkpoint.sourceHead, env.head);
		assert.equal(run.checkpoint.parkedBy, 'alice');
		assert.equal(run.checkpoint.parkedAt, '2026-10-18T12:00:00.000Z');
		assert.equal(run.checkpoint.stage, 'awaiting_llm_step');
		assert.equal(JSON.stringify(run.checkpoint).includes(repo), false, 'the parker path is nowhere in the checkpoint');
		assert.equal(validateCheckpoint(JSON.parse(JSON.stringify(run.checkpoint)), { epicHash: HASH, storyId: 's1' }).ok, true, 'what park plans is what resume accepts');

		// the repo's branch pattern is used
		const custom = plan(unit, {}, deps({ branchPattern: () => 'team/{type}/{id}' }));
		assert.equal(custom.ok && custom.branch, `team/story/${HASH}-s1`);

		// two owned runs: the most recently touched one is chosen and named
		_clearWorkflowStateStoreForTests();
		const base = Date.now();
		const first = withClock([base + 1000], () => saveState(payload(repo, 'wf-older'), owned('alice')));
		withClock([base + 2000], () => saveState(payload(repo, 'wf-newer'), owned('alice')));
		assert.equal((plan() as { runId?: string }).runId, 'wf-newer');
		withClock([base + 3000], () => loadState(first));   // touching the older one makes it the newest
		assert.equal((plan() as { runId?: string }).runId, 'wf-older');
		assert.equal(plan(unit, { runToken: first }).ok && (plan(unit, { runToken: first }) as { runId?: string }).runId, 'wf-older', 'a supplied token wins');

		// only a draft: a draft-only checkpoint listing the draft file
		_clearWorkflowStateStoreForTests();
		const json = artifactJsonPath(repo, lldArtifactId(HASH, 's1'));
		mkdirSync(dirname(json), { recursive: true });
		writeFileSync(json, '{"draft":true}');
		const draft = plan();
		assert.equal(draft.ok, true);
		if (!draft.ok) return;
		assert.equal(draft.variant, 'draft');
		assert.equal(draft.runId, undefined);
		assert.deepEqual(draft.files, [`.insrc/artifacts/${lldArtifactId(HASH, 's1')}.json`]);
		assert.equal(draft.checkpoint.kind, 'draft');
		assert.equal(draft.checkpoint.repositoryId, env.root);
		assert.deepEqual(draft.checkpoint.artifactPaths, draft.files);
		assert.equal(validateCheckpoint(JSON.parse(JSON.stringify(draft.checkpoint)), { epicHash: HASH, storyId: 's1' }).ok, true);

		// a run and a draft together: the run checkpoint lists the draft as parked with it
		saveState(payload(repo, 'wf-with-draft', 'awaiting_synthesize'), owned('alice'));
		const both = plan();
		assert.equal(both.ok && both.variant, 'run');
		assert.deepEqual(both.ok && both.checkpoint.artifactPaths, [`.insrc/artifacts/${lldArtifactId(HASH, 's1')}.json`]);

		// planning changed nothing: no tracker write, no file, no branch, no ref, no stored run
		assert.deepEqual(WRITES, [], 'no assignee change, no issue operation');
		rmSync(json);
		assert.equal(env.git('status', '--porcelain'), before.status);
		assert.equal(env.git('branch', '--list'), before.branches);
		assert.equal(env.git('for-each-ref'), before.refs);
		assert.equal(listStates().length, 1, 'only the run this test saved last; planning stored nothing');
	} finally { rmSync(env.repo, { recursive: true, force: true }); }
});
