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
import { chmodSync, existsSync, lstatSync, symlinkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { applyResume, resumeStage, type ResumeResult } from '../../../daemon/steps/workflow-step/resume.js';
import { handleWorkflowStep } from '../../../daemon/steps/workflow-step/handler.js';
import { _clearWorkflowStateStoreForTests, listStates, saveState } from '../../../daemon/steps/workflow-step/state-store.js';
import { STATE_VERSION, type WorkflowStepStatePayload } from '../../../daemon/steps/workflow-step/state.js';
import { registerWorkflowRunners } from '../../index.js';
import { _setGateDepsForTests } from '../gate.js';
import { resumeCheck } from '../handoff.js';
import {
	HASH, PLAN_STEPS, entryOf, git, handOver, mkWorld, park, parkDeps, parse, resumeDeps, s1Context, taskCore, team, treeOf, unitOf,
} from './helpers/handoff-world.js';
import '../../__tests__/helpers/converted-repos.js';

afterEach(() => { _setGateDepsForTests(); _clearWorkflowStateStoreForTests(); });

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
		const lldMd = join(w.parker, `docs/epics/tag-filtering-E20260718${HASH.slice(0, 8)}/S001/LLD.md`);
		// an older, executable LLD.md is already committed on both clones, so the restore overwrites a file that exists
		mkdirSync(dirname(lldMd), { recursive: true }); writeFileSync(lldMd, '# old\n'); chmodSync(lldMd, 0o755);
		git(w.parker, 'add', '-A'); git(w.parker, 'commit', '-qm', 'old LLD.md'); git(w.parker, 'push', '-q', 'origin', 'main'); git(w.recv, 'pull', '-q', 'origin', 'main');
		writeFileSync(lldMd, '# newer\n');
		mkdirSync(dirname(draft), { recursive: true }); writeFileSync(draft, '{"plan":"draft"}\n');
		mkdirSync(dirname(mdDraft), { recursive: true }); writeFileSync(mdDraft, '# the plan draft\n');
		await park(w, unitOf(w.parker));
		const rel = (p: string): string => p.slice(w.parker.length + 1);
		const here = (p: string): string => join(w.recv, rel(p));

		// a restore that fails on its second file puts the first back and saves nothing
		const check = await resumeCheck(w.recv, unitOf(w.recv), { workflow: 'plan' }, resumeDeps(w));
		assert.equal(check.kind, 'restart', JSON.stringify(check));
		chmodSync(here(lldMd), 0o555); // read-only and executable: the rollback must still put it back
		const before = treeOf(w.recv);
		const modeBefore = statSync(here(lldMd)).mode & 0o777;
		assert.notEqual(modeBefore & 0o100, 0, 'the clone has the file executable');
		const seen: string[] = [];
		const failed = await applyResume(check, w.recv, { failWrite: p => { seen.push(p); return seen.length === 3 ? 'disk full' : undefined; } });
		assert.deepEqual(seen.map(p => p.split('/').pop()), ['LLD.md', `PLAN-${HASH}-s1.json`, 'PLAN.md'], 'the existing file is overwritten before the third fails');
		assert.equal(failed.kind, 'refused', JSON.stringify(failed));
		assert.equal(treeOf(w.recv), before, 'the working tree is as it was');
		assert.equal(readFileSync(here(lldMd), 'utf8'), '# old\n', 'the file that was overwritten is back');
		assert.equal(statSync(here(lldMd)).mode & 0o777, modeBefore, 'with its mode');
		assert.equal(existsSync(here(draft)), false);
		assert.equal(existsSync(here(mdDraft)), false);
		assert.equal(readdirSync(join(w.recv, '.insrc', 'artifacts')).some(n => n.includes('.resume-')), false, 'no temporary file is left');
		assert.equal(listStates().length, 0, 'no state saved');

		// with the directories absent too, a failure removes the ones the restore made
		git(w.recv, 'rm', '-q', '-f', rel(lldMd)); git(w.recv, 'commit', '-qm', 'drop LLD.md here');
		assert.equal(existsSync(join(w.recv, 'docs')), false);
		const check2 = await resumeCheck(w.recv, unitOf(w.recv), { workflow: 'plan' }, resumeDeps(w));
		assert.equal(check2.kind, 'restart', JSON.stringify(check2));
		const seen2: string[] = [];
		const failed2 = await applyResume(check2, w.recv, { failWrite: p => { seen2.push(p); return seen2.length === 3 ? 'disk full' : undefined; } });
		assert.equal(failed2.kind, 'refused', JSON.stringify(failed2));
		assert.equal(existsSync(join(w.recv, 'docs')), false, 'the directories the restore made are removed');
		assert.equal(readdirSync(join(w.recv, '.insrc', 'artifacts')).some(n => n.includes(HASH) && n.startsWith('PLAN-')), false);

		// when the tracker cannot say who is resuming, a run is not handed over and nothing is written
		_setGateDepsForTests({ readPolicy: team, loadTracker: () => ({ ok: false, kind: 'unreachable', reason: 'offline' }) as never, resolveIssue: () => 'acme/demo#7', ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'x' }), artifactExists: () => true });
		const anon = await applyResume({ kind: 'resume', plan: { checkpoint: { upstream: [] } as never, files: [{ path: 'x.txt', content: 'x' }] } } as never, w.recv);
		assert.equal(anon.kind, 'refused', JSON.stringify(anon));
		assert.match((anon as { reason: string }).reason, /who you are/);
		assert.equal(existsSync(join(w.recv, 'x.txt')), false);
		assert.equal(listStates().length, 0);
		w.actor.who = 'bob';
		_setGateDepsForTests({ readPolicy: team, loadTracker: () => ({ ok: true, value: { whoAmI: () => ({ ok: true, value: 'bob' }), readAssignee: () => ({ ok: true, value: 'bob' }), addAssignee: () => ({ ok: true, value: ['bob'] }), issueOps: { comment: () => ({ ok: true, value: undefined }) } } as never }), resolveIssue: () => 'acme/demo#7', ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'x' }), artifactExists: () => true });

		// an existing symbolic link at a target is never replaced: the restore fails and the link is still there
		const linkTarget = join(w.recv, 'elsewhere.txt'); writeFileSync(linkTarget, 'keep\n');
		mkdirSync(dirname(here(mdDraft)), { recursive: true }); symlinkSync(linkTarget, here(mdDraft));
		const linked = await applyResume(check2, w.recv);
		assert.equal(linked.kind, 'refused', JSON.stringify(linked));
		assert.match((linked as { reason: string }).reason, /symbolic link/);
		assert.equal(lstatSync(here(mdDraft)).isSymbolicLink(), true);
		assert.equal(readFileSync(linkTarget, 'utf8'), 'keep\n');
		assert.equal(existsSync(here(draft)), false, 'files written before it are rolled back');
		rmSync(here(mdDraft)); rmSync(linkTarget);
		rmSync(join(w.recv, 'docs'), { recursive: true, force: true });

		// without the fault the draft is restored and the stage restarts
		const ok: ResumeResult = await resumeStage(w.recv, unitOf(w.recv), { workflow: 'plan' }, resumeDeps(w));
		assert.equal(ok.kind, 'restart', JSON.stringify(ok));
		if (ok.kind !== 'restart') return;
		assert.equal(ok.workflow, 'plan');
		assert.equal(ok.draftRestored, true);
		assert.equal(readFileSync(here(draft), 'utf8'), '{"plan":"draft"}\n');
		assert.equal(readFileSync(here(mdDraft), 'utf8'), '# the plan draft\n');
		assert.equal(readFileSync(here(lldMd), 'utf8'), '# newer\n');
		assert.equal(listStates().length, 0, 'a restart stores no run');
	} finally { rmSync(w.root, { recursive: true, force: true }); }
});
