/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story S010 (adaptive elicit) — the reworked one-decision-per-turn `elicit`
 * loop, driven through the REAL executor with a FAKE mid-tier draftProvider
 * injected as the executor's `draftProvider` dep. Node isolates each test file in
 * its own process, so the runner registry starts fresh here.
 *
 * Covers ac1 (run drafts one decision + pauses / fail-closed), ac2 (finalize
 * folds + re-pauses next / reopen / unknown-decision), ac3 (converge +
 * final_confirm → assembled output / not-confirmed / nothing-until-confirm), and
 * ac4 (the assembled output is the UNCHANGED brainstormElicitSchema shape, so
 * synthesize consumes it byte-identically). The three schemas are validated
 * directly, proving brainstormElicitSchema is unchanged.
 *
 * Run: npx tsx --test src/workflow/runners/brainstorm/__tests__/elicit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ajv } from 'ajv';

import { registerBrainstormRunners } from '../index.js';
import { brainstormElicitSchema, decisionAnswerSchema, decisionDraftSchema } from '../schemas.js';
import { startRun, resumeRun, type ExecutorDeps } from '../../../executor.js';
import { BRAINSTORM_CATEGORY_CLASSES } from '../../../../shared/brainstorm-classes.js';
import type { LLMProvider } from '../../../../shared/types.js';
import type { WorkflowIntent, WorkflowPlan, ExecutorTickResult } from '../../../types.js';

const CATEGORY_IDS = BRAINSTORM_CATEGORY_CLASSES.map(c => c.id);
const ajv = new Ajv({ allErrors: true });

// ---------------------------------------------------------------------------
// Schema invariance — brainstormElicitSchema (the elicit OUTPUT) is UNCHANGED;
// the two new decision schemas are present and well-formed.
// ---------------------------------------------------------------------------

const validateElicit = ajv.compile(brainstormElicitSchema);

test('invariance: brainstormElicitSchema still accepts the confirmed converged shape and rejects a retired `questions` field', () => {
	const ok = { category: 'requirements', workingStatement: 'x', openItems: [], confirmed: true, decisions: [], nonGoals: [] };
	assert.equal(validateElicit(ok), true);
	assert.equal(validateElicit({ ...ok, questions: ['q'] }), false);
	assert.equal(validateElicit({ ...ok, workingStatement: '' }), false); // minLength:1 preserved
});

test('invariance: the elicit category enum equals exactly the BRAINSTORM_CATEGORY_CLASSES ids', () => {
	const enumMembers = ((brainstormElicitSchema['properties'] as Record<string, { enum: string[] }>)['category']!).enum;
	assert.deepEqual([...enumMembers].sort(), [...CATEGORY_IDS].sort());
});

test('decisionDraftSchema: accepts a folded draft with one decision + accepts a convergence draft', () => {
	const v = ajv.compile(decisionDraftSchema);
	assert.equal(v({
		category: 'requirements', workingStatement: 'so far', nonGoals: [], convergence: false,
		decision: { decisionId: 'd1', question: 'scope?', options: [{ label: 'a', tradeoff: 't', recommended: true }, { label: 'b', tradeoff: 't2' }], groundingNote: 'n' },
	}), true);
	assert.equal(v({ category: 'design', workingStatement: 'done', nonGoals: ['x'], convergence: true }), true);
	// a decision with <2 options is rejected
	assert.equal(v({ category: 'design', workingStatement: 'w', convergence: false, decision: { decisionId: 'd', question: 'q', options: [{ label: 'only', tradeoff: 't' }] } }), false);
});

test('decisionAnswerSchema: accepts each tagged action and rejects an unknown action / extra props', () => {
	const v = ajv.compile(decisionAnswerSchema);
	assert.equal(v({ action: 'choose', decisionId: 'd1', chosenOption: 'a' }), true);
	assert.equal(v({ action: 'reopen', decisionId: 'd1' }), true);
	assert.equal(v({ action: 'propose_converge' }), true);
	assert.equal(v({ action: 'final_confirm' }), true);
	assert.equal(v({ action: 'bogus' }), false);
	assert.equal(v({ action: 'choose', extra: 1 }), false);
});

// ---------------------------------------------------------------------------
// Fake mid-tier draftProvider — returns canned decisionDraft JSON off a queue.
// The runner only ever calls completeStructured; everything else is unused.
// ---------------------------------------------------------------------------

interface Fake { readonly provider: LLMProvider; calls(): number }

function makeFake(queue: readonly unknown[]): Fake {
	let n = 0;
	const provider = {
		async completeStructured(): Promise<unknown> {
			const v = queue[n++];
			if (v === undefined) throw new Error('fake draftProvider: queue exhausted');
			if (v instanceof Error) throw v;
			return v;
		},
	} as unknown as LLMProvider;
	return { provider, calls: () => n };
}

const deps = (f: Fake): ExecutorDeps => ({ draftProvider: f.provider });

const draftDecision = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
	category: 'requirements',
	workingStatement: `understanding after ${id}`,
	nonGoals: [],
	convergence: false,
	decision: {
		decisionId: id,
		question: `question ${id}?`,
		options: [
			{ label: 'opt-a', tradeoff: 'a-tradeoff', recommended: true },
			{ label: 'opt-b', tradeoff: 'b-tradeoff' },
		],
		groundingNote: `note ${id}`,
	},
	...over,
});

const draftConverge = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
	category: 'requirements',
	workingStatement: 'final converged understanding',
	nonGoals: ['some-exclusion'],
	convergence: true,
	...over,
});

const intent = (focus: string): WorkflowIntent => ({
	workflow: 'brainstorm', focus, repoPath: '/tmp/x', repoIndexedAt: null, params: {},
});

const oneStepPlan: WorkflowPlan = {
	workflow: 'brainstorm',
	steps: [{ id: 's1', runner: 'elicit', params: {} }],
};

function assertPaused(tick: ExecutorTickResult): asserts tick is Extract<ExecutorTickResult, { type: 'paused' }> {
	assert.equal(tick.type, 'paused');
}

// ---------------------------------------------------------------------------
// ac1 — run() drafts exactly ONE decision and pauses; fail-closed on no provider
// ---------------------------------------------------------------------------

test('ac1: run() drafts ONE decision via the draftProvider and pauses carrying the running-spec blob', async () => {
	registerBrainstormRunners();
	const f = makeFake([draftDecision('d1')]);
	const tick = await startRun(intent('add search'), oneStepPlan, 'r1', 's1', deps(f));
	assertPaused(tick);
	assert.equal(f.calls(), 1, 'exactly one decision drafted');
	assert.equal(tick.state.pause!.runner, 'elicit');
	assert.deepEqual(tick.state.pause!.schema, decisionAnswerSchema, 'the pause asks with the decision-answer schema');
	assert.match(tick.state.pause!.userTurn, /question d1\?/);
	assert.match(tick.state.pause!.userTurn, /opt-a/);
	assert.match(tick.state.pause!.userTurn, /recommended/i);
	const blob = tick.state.pause!.preparedBlob as { current: { decisionId: string }; answered: unknown[]; convergenceProposed: boolean };
	assert.equal(blob.current.decisionId, 'd1');
	assert.equal(blob.answered.length, 0);
	assert.equal(blob.convergenceProposed, false);
});

test('ac1: run() FAILS CLOSED (retryable draft-provider-unavailable) when no draftProvider is supplied — never cheap/local', async () => {
	registerBrainstormRunners();
	const tick = await startRun(intent('add search'), oneStepPlan, 'r2', 's2'); // no deps
	assert.equal(tick.type, 'error');
	if (tick.type === 'error') {
		assert.equal(tick.code, 'draft-provider-unavailable');
		assert.equal(tick.retryable, true);
		assert.equal(tick.stepId, 's1');
	}
});

test('ac1: a draftProvider failure surfaces as a retryable draft-failed (run stays paused-able)', async () => {
	registerBrainstormRunners();
	const f = makeFake([new Error('mid model exploded')]);
	const tick = await startRun(intent('add search'), oneStepPlan, 'r3', 's3', deps(f));
	assert.equal(tick.type, 'error');
	if (tick.type === 'error') {
		assert.equal(tick.code, 'draft-failed');
		assert.equal(tick.retryable, true);
	}
});

// ---------------------------------------------------------------------------
// ac2 — finalize() folds a chosen option and RE-PAUSES the next decision;
// reopen re-presents a prior decision; unknown decision id → retryable.
// ---------------------------------------------------------------------------

test('ac2: choose folds the answer and RE-PAUSES the next drafted decision (same step, nextStepIndex unchanged)', async () => {
	registerBrainstormRunners();
	const f = makeFake([draftDecision('d1'), draftDecision('d2')]);
	const p1 = await startRun(intent('add search'), oneStepPlan, 'r4', 's4', deps(f));
	assertPaused(p1);
	const idxBefore = p1.state.nextStepIndex;

	const p2 = await resumeRun(p1.state, { action: 'choose', decisionId: 'd1', chosenOption: 'opt-a' }, 's4', deps(f));
	assertPaused(p2);
	assert.equal(f.calls(), 2, 'a second decision was drafted on fold');
	assert.equal(p2.state.nextStepIndex, idxBefore, 're-paused on the SAME step');
	const blob = p2.state.pause!.preparedBlob as { current: { decisionId: string }; answered: { decisionId: string; chosenOption: string }[] };
	assert.equal(blob.current.decisionId, 'd2', 'the next decision is now open');
	assert.equal(blob.answered.length, 1);
	assert.deepEqual(blob.answered[0], { decisionId: 'd1', question: 'question d1?', options: [{ label: 'opt-a', tradeoff: 'a-tradeoff', recommended: true }, { label: 'opt-b', tradeoff: 'b-tradeoff' }], chosenOption: 'opt-a', groundingNote: 'note d1' });
});

test('ac2: choose with a stale/wrong decisionId → retryable unknown-decision', async () => {
	registerBrainstormRunners();
	const f = makeFake([draftDecision('d1')]);
	const p1 = await startRun(intent('add search'), oneStepPlan, 'r5', 's5', deps(f));
	assertPaused(p1);
	const r = await resumeRun(p1.state, { action: 'choose', decisionId: 'd9', chosenOption: 'opt-a' }, 's5', deps(f));
	assert.equal(r.type, 'error');
	if (r.type === 'error') { assert.equal(r.code, 'unknown-decision'); assert.equal(r.retryable, true); }
});

test('ac2: choose an option that was not presented → retryable unknown-option', async () => {
	registerBrainstormRunners();
	const f = makeFake([draftDecision('d1')]);
	const p1 = await startRun(intent('add search'), oneStepPlan, 'r6', 's6', deps(f));
	assertPaused(p1);
	const r = await resumeRun(p1.state, { action: 'choose', decisionId: 'd1', chosenOption: 'opt-z' }, 's6', deps(f));
	assert.equal(r.type, 'error');
	if (r.type === 'error') { assert.equal(r.code, 'unknown-option'); assert.equal(r.retryable, true); }
});

test('ac2: reopen re-presents a named prior decision; reopen of an unknown decision → retryable unknown-decision', async () => {
	registerBrainstormRunners();
	const f = makeFake([draftDecision('d1'), draftDecision('d2')]);
	const p1 = await startRun(intent('add search'), oneStepPlan, 'r7', 's7', deps(f));
	assertPaused(p1);
	const p2 = await resumeRun(p1.state, { action: 'choose', decisionId: 'd1', chosenOption: 'opt-a' }, 's7', deps(f));
	assertPaused(p2); // now open on d2, with d1 answered

	// reopen d1 — no new draft call; d1 becomes the open decision again.
	const callsBefore = f.calls();
	const p3 = await resumeRun(p2.state, { action: 'reopen', decisionId: 'd1' }, 's7', deps(f));
	assertPaused(p3);
	assert.equal(f.calls(), callsBefore, 'reopen does not draft a new decision');
	const blob = p3.state.pause!.preparedBlob as { current: { decisionId: string }; answered: unknown[] };
	assert.equal(blob.current.decisionId, 'd1', 'd1 is open again');
	assert.equal(blob.answered.length, 0, 'd1 was pulled back out of answered');

	// reopen a decision that was never answered → retryable.
	const r = await resumeRun(p2.state, { action: 'reopen', decisionId: 'nope' }, 's7', deps(f));
	assert.equal(r.type, 'error');
	if (r.type === 'error') { assert.equal(r.code, 'unknown-decision'); assert.equal(r.retryable, true); }
});

// ---------------------------------------------------------------------------
// ac3 — convergence + final_confirm → assembled output; not-confirmed guard;
// nothing is produced until the final confirm.
// ---------------------------------------------------------------------------

test('ac3: daemon-proposed convergence + final_confirm → COMPLETE with the assembled brainstormElicitSchema output', async () => {
	registerBrainstormRunners();
	const f = makeFake([draftDecision('d1'), draftConverge()]);
	const p1 = await startRun(intent('add search'), oneStepPlan, 'r8', 's8', deps(f));
	assertPaused(p1);
	// answer d1 → the next draft proposes convergence → re-pause at the convergence proposal.
	const p2 = await resumeRun(p1.state, { action: 'choose', decisionId: 'd1', chosenOption: 'opt-a' }, 's8', deps(f));
	assertPaused(p2);
	const blob = p2.state.pause!.preparedBlob as { convergenceProposed: boolean };
	assert.equal(blob.convergenceProposed, true, 'the daemon proposed convergence');
	assert.match(p2.state.pause!.userTurn, /CONVERGENCE PROPOSED/);

	// the user confirms → the step COMPLETES.
	const done = await resumeRun(p2.state, { action: 'final_confirm' }, 's8', deps(f));
	assert.equal(done.type, 'complete');
	if (done.type !== 'complete') return;
	const out = done.stepOutputs['s1'] as Record<string, unknown>;
	assert.equal(validateElicit(out), true, 'the assembled output is a valid (unchanged) brainstormElicitSchema payload');
	assert.equal(out['confirmed'], true);
	assert.deepEqual(out['openItems'], []);
	assert.equal(out['category'], 'requirements');
	assert.equal(out['workingStatement'], 'final converged understanding');
	assert.deepEqual(out['decisions'], [{ chosen: 'opt-a', ruledOut: ['opt-b'], reason: 'note d1' }]);
	// every ruled-out direction survives into nonGoals (the S004 invariant synthesize relies on).
	const nonGoals = out['nonGoals'] as string[];
	assert.ok(nonGoals.includes('opt-b') && nonGoals.includes('some-exclusion'));
});

test('ac3: controller-forced propose_converge then final_confirm also converges (controller override)', async () => {
	registerBrainstormRunners();
	const f = makeFake([draftDecision('d1')]);
	const p1 = await startRun(intent('add search'), oneStepPlan, 'r9', 's9', deps(f));
	assertPaused(p1);
	// force convergence WITHOUT answering d1 — no further draft is made.
	const p2 = await resumeRun(p1.state, { action: 'propose_converge' }, 's9', deps(f));
	assertPaused(p2);
	assert.equal(f.calls(), 1, 'propose_converge does not draft');
	const done = await resumeRun(p2.state, { action: 'final_confirm' }, 's9', deps(f));
	assert.equal(done.type, 'complete');
	if (done.type === 'complete') {
		const out = done.stepOutputs['s1'] as Record<string, unknown>;
		assert.equal(validateElicit(out), true);
		assert.deepEqual(out['decisions'], [], 'no decisions answered → empty decisions');
	}
});

test('ac3: final_confirm BEFORE convergence is proposed → retryable not-confirmed (nothing produced)', async () => {
	registerBrainstormRunners();
	const f = makeFake([draftDecision('d1')]);
	const p1 = await startRun(intent('add search'), oneStepPlan, 'r10', 's10', deps(f));
	assertPaused(p1);
	const r = await resumeRun(p1.state, { action: 'final_confirm' }, 's10', deps(f));
	assert.equal(r.type, 'error');
	if (r.type === 'error') { assert.equal(r.code, 'not-confirmed'); assert.equal(r.retryable, true); }
});

test('ac3/ac4: nothing is produced until final_confirm — a mid-loop pause has no step output', async () => {
	registerBrainstormRunners();
	const f = makeFake([draftDecision('d1'), draftDecision('d2')]);
	const p1 = await startRun(intent('add search'), oneStepPlan, 'r11', 's11', deps(f));
	assertPaused(p1);
	const p2 = await resumeRun(p1.state, { action: 'choose', decisionId: 'd1', chosenOption: 'opt-b' }, 's11', deps(f));
	// still paused (not complete) — the runner never writes a SpecArtifact; only final_confirm yields output.
	assert.equal(p2.type, 'paused');
	if (p2.type === 'paused') {
		assert.equal(p2.state.pause!.stepId, 's1');
		assert.equal(Object.prototype.hasOwnProperty.call(p2.state.stepOutputs, 's1'), false, 'no s1 output until convergence + confirm');
	}
});
