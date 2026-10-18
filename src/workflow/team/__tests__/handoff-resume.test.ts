/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Taking over parked work, end to end: a real workflow run is parked by one clone and resumed on another at a different absolute path.
 * Real bare origin, real git, the real plan workflow and state store.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/handoff-resume.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { applyResume, resumeStage, type ResumeResult } from '../../../daemon/steps/workflow-step/resume.js';
import { handleWorkflowStep } from '../../../daemon/steps/workflow-step/handler.js';
import { _clearWorkflowStateStoreForTests, listStates, saveState } from '../../../daemon/steps/workflow-step/state-store.js';
import { STATE_VERSION, type WorkflowStepStatePayload } from '../../../daemon/steps/workflow-step/state.js';
import { registerWorkflowRunners } from '../../index.js';
import { computeHldEffectiveHash } from '../../artifacts/lld.js';
import { approveArtifactByJsonPath } from '../../gates.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactId, lldArtifactPaths } from '../../storage.js';
import { stampOtherPartyReview } from '../../__tests__/helpers/other-party-review.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import { _setGateDepsForTests } from '../gate.js';
import { parkDraft, resumeCheck } from '../handoff.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-18T00:00:00.000Z';
const HLD_RUN = 'hld-run-1';
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
afterEach(() => { _setGateDepsForTests(); _clearWorkflowStateStoreForTests(); });

const git = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** An approved Define, HLD and Story LLD as the plan workflow reads them (each with a non-zero revision). */
function seedChain(repo: string): void {
	const dp = defineArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering');
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED, revision: 3 },
		body: { flavor: 'enhancement', problem: 'x', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'a', when: 'b', then: 'c', operationalizes: [] }], dependsOn: [] }], openQuestions: [] },
		citations: [],
	}));
	stampOtherPartyReview(dp.json); approveArtifactByJsonPath(dp.json);
	const hp = hldArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering');
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: HLD_RUN, schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED, revision: 5 },
		body: {
			frameworkSummary: 'x', architectureShape: 'x [[c1]]',
			sharedContracts: [{ id: 'sc1', name: 'A', purpose: 'p', interfaceSketch: 'interface A {}', ownedByStory: 's1', consumedByStories: [], assumptions: [] }],
			storyBoundaries: [{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'x' }], nonFunctional: {},
			rolloutOverview: { phases: [{ name: 'A', includesStories: ['s1'], rationale: 'x', backwardCompat: '', featureFlag: null }], orderingRationale: 'x', riskyBits: [] },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }], chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}));
	stampOtherPartyReview(hp.json); approveArtifactByJsonPath(hp.json);
	const lp = lldArtifactPaths(repo, HASH, 's1', CREATED, 'epic', 'tag-filtering');
	writeFileSync(lp.json, JSON.stringify({
		meta: { workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', createdAt: CREATED, revision: 7, hldBaseRunId: HLD_RUN, hldEffectiveHash: computeHldEffectiveHash(HLD_RUN, []), hldAmendmentsApplied: [] },
		body: {
			hldContextSlice: {}, contractDetails: { surfaceLevel: 'internal', api: [] }, dataModelChanges: [], interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [{ level: 'unit', purpose: 'x', subjects: ['unit: filter by tag'] }], acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit: filter by tag'] }], testFramework: 'node:test' },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: [], cons: [], costEstimate: 'S' }], chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [],
	}));
	stampOtherPartyReview(lp.json); approveArtifactByJsonPath(lp.json);
}

const PLAN_STEPS = [
	{ id: 's1', runner: 'context.assemble', params: {} }, { id: 's2', runner: 'tasks.enumerate', params: {} }, { id: 's3', runner: 'tasks.critique', params: {} },
	{ id: 's4', runner: 'tasks.finalize', params: {} }, { id: 's5', runner: 'test-strategy.write', params: {} }, { id: 's6', runner: 'checklist.verify', params: {} },
];
const taskCore = { id: 't1', title: 'Implement the tag filter', summary: 'Add the filter path.', size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['filter returns tagged todos'], derivedFrom: ['c1'] };
const s1Context = { analyzeBundles: [{ kind: 'symbol.locate', focus: 'filter', summary: 'new path', pathsCited: ['src/todos/filter.ts'] }] };

interface World { root: string; origin: string; parker: string; recv: string; tmp: string; actor: { who: string; holder: string | null } }

function mkWorld(): World {
	const root = mkdtempSync(join(tmpdir(), 'insrc-resume-'));
	const origin = join(root, 'origin.git'), parker = join(root, 'parker-machine', 'repo'), recv = join(root, 'new-owner', 'deeper', 'clone'), tmp = join(root, 'tmp');
	mkdirSync(tmp); mkdirSync(parker, { recursive: true }); mkdirSync(dirname(recv), { recursive: true });
	git(root, 'init', '--bare', '-q', '-b', 'main', origin);
	git(parker, 'init', '-q', '-b', 'main'); git(parker, 'config', 'user.email', 'a@t'); git(parker, 'config', 'user.name', 'alice'); git(parker, 'config', 'commit.gpgsign', 'false');
	seedChain(parker);
	git(parker, 'add', '-A'); git(parker, 'commit', '-qm', 'approved upstream chain'); git(parker, 'remote', 'add', 'origin', origin); git(parker, 'push', '-q', 'origin', 'main');
	git(root, 'clone', '-q', origin, recv); git(recv, 'config', 'user.email', 'b@t'); git(recv, 'config', 'user.name', 'bob'); git(recv, 'config', 'commit.gpgsign', 'false');
	const actor = { who: 'alice', holder: 'alice' as string | null };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: actor.who }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: actor.holder }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: [actor.who] }),
		issueOps: { comment: (): PortResult<void> => ({ ok: true, value: undefined }) },
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy: team, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7', ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'x' }), artifactExists: () => true });
	return { root, origin, parker, recv, tmp, actor };
}

const unitOf = (repo: string, story = 's1'): UnitRef => ({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: story });
const parse = (env: { content: readonly { text: string }[] }): Record<string, any> => JSON.parse(env.content[0]!.text) as Record<string, any>;
const parkDeps = (w: World) => ({ branchPattern: () => undefined, tmpRoot: w.tmp });
const resumeDeps = (w: World) => ({ branchPattern: () => undefined, tmpRoot: w.tmp, listRepos: async () => [{ path: w.parker }, { path: w.recv }] });
/** After the park: bob holds the Story and acts. */
const handOver = (w: World): void => { w.actor.who = 'bob'; w.actor.holder = 'bob'; };
/** Park as alice while bob already holds the Story. */
async function park(w: World, unit: UnitRef): Promise<void> {
	w.actor.who = 'alice'; w.actor.holder = 'bob';
	const r = await parkDraft(w.parker, unit, {}, parkDeps(w));
	assert.equal(r.ok, true, r.ok ? '' : r.reason);
	_clearWorkflowStateStoreForTests();
	handOver(w);
}
const entryOf = (token: string) => listStates().find(e => e.token === token);
const treeOf = (dir: string): string => `${git(dir, 'status', '--porcelain', '--untracked-files=all')}\n${git(dir, 'ls-files', '-s')}`;

test('a new assignee on a clone at another absolute path resumes a run parked before the plan, and one parked mid-steps at its next step with its earlier step outputs, rebound to that clone', async () => {
	registerWorkflowRunners();
	const w = mkWorld();
	try {
		// ---- parked before the plan was submitted -------------------------------------------------
		const started = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'plan s1', repo: w.parker, params: { epicHash: HASH, storyId: 's1' } }));
		assert.equal(started.next, 'emit_plan', JSON.stringify(started));
		await park(w, unitOf(w.parker));
		assert.equal(listStates().length, 0, 'the parker\'s daemon state is gone: the new owner has only the branch');

		const early = await resumeStage(w.recv, unitOf(w.recv), {}, resumeDeps(w));
		assert.equal(early.kind, 'resumed', JSON.stringify(early));
		if (early.kind !== 'resumed') return;
		assert.equal(early.turn.next, 'emit_plan');
		assert.equal(early.turn.prompt, started.prompt, 'the decomposer prompt is the one the parker saw');
		assert.equal(early.turn.userTurn.replaceAll(w.recv, '<R>'), started.userTurn.replaceAll(w.parker, '<R>'));
		const e0 = entryOf(early.turn.state);
		assert.equal(e0?.payload.intent.repoPath, w.recv, 'rebound to the receiving clone');
		assert.equal(e0?.payload.stage, 'awaiting_plan');
		assert.equal(e0?.meta?.owner, 'bob', 'the new owner owns the resumed run');
		assert.deepEqual(e0?.meta?.upstream?.map(u => u.revision), [7, 5, 3], 'the upstream snapshot travelled with the run');
		assert.equal(JSON.stringify(e0?.payload).includes(w.parker), false, 'nothing of the parker\'s machine is in the stored run');
		// and it runs on this clone: submitting the plan walks the executor against the receiving clone's artifacts
		const planned = parse(await handleWorkflowStep({ phase: 'plan', plan: { workflow: 'plan', steps: PLAN_STEPS }, state: early.turn.state } as never));
		assert.equal(planned.next, 'emit_step', JSON.stringify(planned));
		assert.equal(planned.stepId, 's1');

		// ---- parked mid-steps ------------------------------------------------------------------------
		_clearWorkflowStateStoreForTests();
		w.actor.who = 'alice'; w.actor.holder = 'alice';
		const s0 = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'plan s1', repo: w.parker, params: { epicHash: HASH, storyId: 's1' } }));
		const s1 = parse(await handleWorkflowStep({ phase: 'plan', plan: { workflow: 'plan', steps: PLAN_STEPS }, state: s0.state } as never));
		const s2 = parse(await handleWorkflowStep({ phase: 'step', stepId: 's1', response: s1Context, state: s1.state } as never));
		assert.equal(s2.next, 'emit_step', JSON.stringify(s2));
		assert.equal(s2.stepId, 's2');
		await park(w, unitOf(w.parker));

		const mid = await resumeStage(w.recv, unitOf(w.recv), {}, resumeDeps(w));
		assert.equal(mid.kind, 'resumed', JSON.stringify(mid));
		if (mid.kind !== 'resumed') return;
		assert.equal(mid.turn.next, 'emit_step');
		if (mid.turn.next !== 'emit_step') return;
		assert.equal(mid.turn.stepId, 's2', 'the next unfinished step');
		assert.equal(mid.turn.runner, 'tasks.enumerate');
		assert.equal(mid.turn.prompt, s2.prompt);
		const e1 = entryOf(mid.turn.state);
		assert.equal(e1?.payload.stage, 'awaiting_llm_step');
		assert.equal(e1?.payload.executor?.nextStepIndex, 1);
		assert.deepEqual(e1?.payload.executor?.stepOutputs['s1'], s1Context, 'the earlier step output is carried');
		assert.equal(e1?.payload.executor?.intent.repoPath, w.recv, 'the executor\'s own intent is rebound too');
		assert.equal(e1?.payload.intent.repoPath, w.recv);
		assert.equal(JSON.stringify(e1?.payload).includes(w.parker), false);
		assert.equal(e1?.meta?.owner, 'bob');
		// and the run continues: the next step answers on the receiving clone
		const next = parse(await handleWorkflowStep({ phase: 'step', stepId: 's2', response: { tasks: [taskCore] }, state: mid.turn.state } as never));
		assert.equal(next.next, 'emit_step', JSON.stringify(next));
		assert.equal(next.stepId, 's3');
		assert.match(next.userTurn as string, /Implement the tag filter/, 'the critique step sees the tasks the first owner enumerated');

		// a run parked at synthesis resumes at the synthesis turn
		_clearWorkflowStateStoreForTests();
		w.actor.who = 'alice'; w.actor.holder = 'alice';
		const late: WorkflowStepStatePayload = {
			version: STATE_VERSION, runId: 'wf-late', epicKey: HASH, startedAtMs: 1, stage: 'awaiting_synthesize',
			intent: { workflow: 'plan', focus: 'f', repoPath: w.parker, repoIndexedAt: null, params: { epicHash: HASH, storyId: 's1' } },
			stepOutputs: { s1: s1Context, s2: { tasks: [taskCore] }, s3: { critiques: [], overallOk: true }, s4: { tasks: [taskCore] }, s5: { tasks: [{ ...taskCore, tests: [{ level: 'unit', name: 'unit: filter by tag' }] }], testStrategyCoverage: [{ lldStrategyItem: 'unit: filter by tag', coveredByTaskIds: ['t1'] }] }, s6: { results: [] } },
		};
		saveState(late, { owner: 'alice', upstream: [] });
		await park(w, unitOf(w.parker));
		const synth = await resumeStage(w.recv, unitOf(w.recv), {}, resumeDeps(w));
		assert.equal(synth.kind, 'refused', 'the empty upstream snapshot differs from the real one, so this run is not resumed');
		assert.match((synth as { reason: string }).reason, /the upstream moved/);
	} finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('a draft-only checkpoint restores the draft and returns restart, and a restore that fails part way leaves the working tree as it was and saves no state', async () => {
	registerWorkflowRunners();
	const w = mkWorld();
	try {
		const draft = join(w.parker, '.insrc', 'artifacts', `PLAN-${HASH}-s1.json`);
		const mdDraft = join(w.parker, `docs/epics/tag-filtering-E20260718${HASH.slice(0, 8)}/S001/PLAN.md`);
		mkdirSync(dirname(draft), { recursive: true }); writeFileSync(draft, '{"plan":"draft"}\n');
		mkdirSync(dirname(mdDraft), { recursive: true }); writeFileSync(mdDraft, '# the plan draft\n');
		await park(w, unitOf(w.parker));
		const rel = (p: string): string => p.slice(w.parker.length + 1);
		const here = (p: string): string => join(w.recv, rel(p));

		// a restore that fails on its second file puts the first back and saves nothing
		const check = await resumeCheck(w.recv, unitOf(w.recv), { workflow: 'plan' }, resumeDeps(w));
		assert.equal(check.kind, 'restart', JSON.stringify(check));
		const before = treeOf(w.recv);
		let writes = 0;
		const failed = await applyResume(check, w.recv, { failWrite: () => (++writes === 2 ? 'disk full' : undefined) });
		assert.equal(failed.kind, 'refused', JSON.stringify(failed));
		assert.equal(treeOf(w.recv), before, 'the working tree is as it was');
		assert.equal(existsSync(here(draft)), false);
		assert.equal(existsSync(here(mdDraft)), false);
		assert.equal(existsSync(dirname(here(mdDraft))), false, 'the directories the restore made are removed');
		assert.equal(existsSync(join(w.recv, 'docs')), false);
		assert.equal(readdirSync(join(w.recv, '.insrc', 'artifacts')).some(n => n.includes('.resume-')), false, 'no temporary file is left');
		assert.equal(listStates().length, 0, 'no state saved');

		// without the fault the draft is restored and the stage restarts
		const ok: ResumeResult = await resumeStage(w.recv, unitOf(w.recv), { workflow: 'plan' }, resumeDeps(w));
		assert.equal(ok.kind, 'restart', JSON.stringify(ok));
		if (ok.kind !== 'restart') return;
		assert.equal(ok.workflow, 'plan');
		assert.equal(ok.draftRestored, true);
		assert.equal(readFileSync(here(draft), 'utf8'), '{"plan":"draft"}\n');
		assert.equal(readFileSync(here(mdDraft), 'utf8'), '# the plan draft\n');
		assert.equal(listStates().length, 0, 'a restart stores no run');
	} finally { rmSync(w.root, { recursive: true, force: true }); }
});
