/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story S003 (Phase B — convergence) — plan tasks t1 (evolved schema) + t2
 * (single-pause convergence runner + finalize gate). Node isolates each test file
 * in its own process, so the runner registry starts fresh here.
 *
 * Run: npx tsx --test src/workflow/runners/brainstorm/__tests__/elicit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ajv } from 'ajv';

import { registerBrainstormRunners } from '../index.js';
import { brainstormElicitSchema } from '../schemas.js';
import { startRun, resumeRun } from '../../../executor.js';
import { BRAINSTORM_CATEGORY_CLASSES } from '../../../../shared/brainstorm-classes.js';
import { encodeState, decodeState } from '../../../../mcp/workflow-step/state.js';
import { _clearWorkflowStateStoreForTests } from '../../../../mcp/workflow-step/state-store.js';
import type { WorkflowStepStatePayload } from '../../../../mcp/workflow-step/state.js';
import type { WorkflowIntent, WorkflowPlan } from '../../../types.js';

const CATEGORY_IDS = BRAINSTORM_CATEGORY_CLASSES.map(c => c.id);

// ---------------------------------------------------------------------------
// t1 — the evolved converged elicit response schema
// ---------------------------------------------------------------------------

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(brainstormElicitSchema);

const converged = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
	category: 'requirements',
	workingStatement: 'A dark-mode toggle in the settings pane, scoped to the editor only.',
	openItems: [],
	confirmed: true,
	decisions: [],
	nonGoals: [],
	...over,
});

test('t1: schema accepts a mid-convergence turn { confirmed:false, non-empty openItems }', () => {
	assert.equal(validate(converged({ confirmed: false, openItems: ['persist across restarts?'] })), true);
});

test('t1: schema accepts the agreed statement { confirmed:true, openItems:[] }', () => {
	assert.equal(validate(converged()), true);
});

test('t1: schema REJECTS an empty workingStatement (minLength:1)', () => {
	assert.equal(validate(converged({ workingStatement: '' })), false);
});

test('t1: schema REJECTS the retired `questions` field and any additionalProperties', () => {
	assert.equal(validate(converged({ questions: ['q'] })), false);
	assert.equal(validate(converged({ extra: 1 })), false);
});

test('t1: schema REJECTS a non-boolean confirmed and a category outside the vocabulary', () => {
	assert.equal(validate(converged({ confirmed: 'yes' })), false);
	assert.equal(validate(converged({ category: 'spec' })), false);   // 'spec' is not a real id
});

test('t1: category/workingStatement/openItems/confirmed/decisions/nonGoals are all required', () => {
	assert.equal(validate({ category: 'requirements', openItems: [], confirmed: true, decisions: [], nonGoals: [] }), false);          // no workingStatement
	assert.equal(validate({ category: 'requirements', workingStatement: 'x', confirmed: true, decisions: [], nonGoals: [] }), false);  // no openItems
	assert.equal(validate({ category: 'requirements', workingStatement: 'x', openItems: [], decisions: [], nonGoals: [] }), false);    // no confirmed
	assert.equal(validate({ category: 'requirements', workingStatement: 'x', openItems: [], confirmed: true, nonGoals: [] }), false);  // no decisions
	assert.equal(validate({ category: 'requirements', workingStatement: 'x', openItems: [], confirmed: true, decisions: [] }), false); // no nonGoals
});

test('t1: the category enum equals exactly the BRAINSTORM_CATEGORY_CLASSES ids', () => {
	const enumMembers = ((brainstormElicitSchema['properties'] as Record<string, { enum: string[] }>)['category']!).enum;
	assert.deepEqual([...enumMembers].sort(), [...CATEGORY_IDS].sort());
});

// ---------------------------------------------------------------------------
// s4/t1 — the additive decisions[] + nonGoals[] capture fields
// ---------------------------------------------------------------------------

test('s4/t1: schema accepts a well-formed decisions[] entry and a nonGoals[] list', () => {
	assert.equal(validate(converged({
		decisions: [{ chosen: 'editor-only', ruledOut: ['whole-app'], reason: 'smaller blast radius' }],
		nonGoals: ['whole-app'],
	})), true);
});

test('s4/t1: schema accepts a fork-free payload with decisions:[] and nonGoals:[]', () => {
	assert.equal(validate(converged({ decisions: [], nonGoals: [] })), true);
});

test('s4/t1: schema REJECTS a decisions entry missing a field or with empty chosen/reason', () => {
	assert.equal(validate(converged({ decisions: [{ chosen: 'x', ruledOut: [] }] })), false);              // no reason
	assert.equal(validate(converged({ decisions: [{ chosen: '', ruledOut: [], reason: 'r' }] })), false);  // empty chosen
	assert.equal(validate(converged({ decisions: [{ chosen: 'x', ruledOut: [], reason: '' }] })), false);  // empty reason
});

test('s4/t1: schema REJECTS additionalProperties in a decisions entry and a non-array nonGoals', () => {
	assert.equal(validate(converged({ decisions: [{ chosen: 'x', ruledOut: [], reason: 'r', extra: 1 }] })), false);
	assert.equal(validate(converged({ nonGoals: 'whole-app' })), false);
});

// ---------------------------------------------------------------------------
// t2 — the convergence llm-pause runner (driven through the real executor)
// ---------------------------------------------------------------------------

const intent = (focus: string): WorkflowIntent => ({
	workflow: 'brainstorm', focus, repoPath: '/tmp/x', repoIndexedAt: null, params: {},
});

const oneStepPlan: WorkflowPlan = {
	workflow: 'brainstorm',
	steps: [{ id: 's1', runner: 'elicit', params: {} }],
};

test('t2: the brainstorm step PAUSES for the controller, carrying the evolved schema', async () => {
	registerBrainstormRunners();
	const tick = await startRun(intent('add a dark mode toggle'), oneStepPlan, 'run-bs-1', 'slug-bs-1');
	assert.equal(tick.type, 'paused');   // it asks, it does not self-resolve to an output/complete
	if (tick.type !== 'paused') return;
	assert.equal(tick.state.pause?.runner, 'elicit');
	assert.deepEqual(tick.state.pause?.schema, brainstormElicitSchema);   // the converged schema, not a synthesize step
});

test('t2: buildPrompt embeds the focus, the category vocabulary, and the convergence/confirm rules', async () => {
	registerBrainstormRunners();
	const tick = await startRun(intent('a widget that syncs offline'), oneStepPlan, 'run-bs-2', 'slug-bs-2');
	assert.equal(tick.type, 'paused');
	if (tick.type !== 'paused') return;
	assert.match(tick.state.pause!.userTurn, /a widget that syncs offline/);   // the rough idea reaches the prompt
	const requirementsDesc = BRAINSTORM_CATEGORY_CLASSES.find(c => c.id === 'requirements')!.description;
	assert.ok(tick.state.pause!.prompt.includes(requirementsDesc));           // reused vocabulary, no new taxonomy
	const p = tick.state.pause!.prompt;
	assert.match(p, /workingStatement/);          // folds into a working statement
	assert.match(p, /confirm/i);                  // confirm-before-done
	assert.match(p, /openItems/);                 // re-ask only open items
	assert.match(p, /do NOT stop early|not stop early/i);   // no early stop (ac4)
});

test('s4/t2: buildPrompt embeds the fork rule and the decisions/nonGoals capture instructions', async () => {
	registerBrainstormRunners();
	const tick = await startRun(intent('add search'), oneStepPlan, 'run-bs-fork', 'slug-bs-fork');
	assert.equal(tick.type, 'paused');
	if (tick.type !== 'paused') return;
	const p = tick.state.pause!.prompt;
	assert.match(p, /more than one plausible scope|OPTIONS & TRADEOFFS/);   // fork detection (ac1)
	assert.match(p, /do NOT silently pick|not silently pick/i);             // present options, don't silently pick
	assert.match(p, /decisions/);                                          // structured decision capture (ac2/c32)
	assert.match(p, /ruledOut/);                                           // ruled-out alternatives
	assert.match(p, /nonGoals/);                                           // exclusions (ac3)
});

test('t2: a confirmed:false intermediate turn completes the step, carrying the converged shape forward', async () => {
	registerBrainstormRunners();
	const paused = await startRun(intent('a CLI flag'), oneStepPlan, 'run-bs-3', 'slug-bs-3');
	assert.equal(paused.type, 'paused');
	if (paused.type !== 'paused') return;
	const answer = { category: 'implementation', workingStatement: 'A --json CLI flag on the status subcommand.', openItems: ['which other subcommands?'], confirmed: false };
	const resumed = await resumeRun(paused.state, answer, 'slug-bs-3');
	assert.equal(resumed.type, 'complete');
	if (resumed.type === 'complete') {
		assert.deepEqual(resumed.stepOutputs['s1'], answer);   // the confirmed:false turn passes through as the step output
	}
});

test('t2: a clean confirmed:true (openItems:[]) resume completes the step', async () => {
	registerBrainstormRunners();
	const paused = await startRun(intent('a CLI flag'), oneStepPlan, 'run-bs-4', 'slug-bs-4');
	assert.equal(paused.type, 'paused');
	if (paused.type !== 'paused') return;
	const answer = { category: 'implementation', workingStatement: 'A --json flag on `status` only.', openItems: [], confirmed: true };
	const resumed = await resumeRun(paused.state, answer, 'slug-bs-4');
	assert.equal(resumed.type, 'complete');
	if (resumed.type === 'complete') {
		assert.deepEqual(resumed.stepOutputs['s1'], answer);
	}
});

test('t2: finalize REJECTS confirmed:true with non-empty openItems as a retryable error, leaving the run paused', async () => {
	registerBrainstormRunners();
	const paused = await startRun(intent('a CLI flag'), oneStepPlan, 'run-bs-5', 'slug-bs-5');
	assert.equal(paused.type, 'paused');
	if (paused.type !== 'paused') return;
	const premature = { category: 'implementation', workingStatement: 'A --json flag.', openItems: ['still deciding the scope'], confirmed: true, decisions: [], nonGoals: [] };
	const resumed = await resumeRun(paused.state, premature, 'slug-bs-5');
	assert.equal(resumed.type, 'error');
	if (resumed.type === 'error') {
		assert.equal(resumed.code, 'convergence-incomplete');
		assert.equal(resumed.retryable, true);   // the run stays paused; controller re-prompts on the remaining openItems
		assert.equal(resumed.stepId, 's1');
	}
});

// ---------------------------------------------------------------------------
// s4/t2 — the fork-integrity finalize gate (ruled-out must be recorded)
// ---------------------------------------------------------------------------

test('s4/t2: finalize REJECTS confirmed:true when a ruled-out direction is absent from nonGoals', async () => {
	registerBrainstormRunners();
	const paused = await startRun(intent('add search'), oneStepPlan, 'run-bs-6', 'slug-bs-6');
	assert.equal(paused.type, 'paused');
	if (paused.type !== 'paused') return;
	const dropped = {
		category: 'requirements', workingStatement: 'Full-text search over notes.', openItems: [], confirmed: true,
		decisions: [{ chosen: 'full-text', ruledOut: ['semantic', 'title-only'], reason: 'users search body text' }],
		nonGoals: ['semantic'],   // 'title-only' was ruled out but not recorded
	};
	const resumed = await resumeRun(paused.state, dropped, 'slug-bs-6');
	assert.equal(resumed.type, 'error');
	if (resumed.type === 'error') {
		assert.equal(resumed.code, 'ruled-out-not-recorded');
		assert.equal(resumed.retryable, true);
		assert.match(resumed.message, /title-only/);   // names the dropped direction
	}
});

test('s4/t2: finalize ACCEPTS confirmed:true when every ruled-out direction is recorded as a nonGoal', async () => {
	registerBrainstormRunners();
	const paused = await startRun(intent('add search'), oneStepPlan, 'run-bs-7', 'slug-bs-7');
	assert.equal(paused.type, 'paused');
	if (paused.type !== 'paused') return;
	const clean = {
		category: 'requirements', workingStatement: 'Full-text search over notes.', openItems: [], confirmed: true,
		decisions: [{ chosen: 'full-text', ruledOut: ['semantic', 'title-only'], reason: 'users search body text' }],
		nonGoals: ['semantic', 'title-only'],
	};
	const resumed = await resumeRun(paused.state, clean, 'slug-bs-7');
	assert.equal(resumed.type, 'complete');
	if (resumed.type === 'complete') {
		assert.deepEqual(resumed.stepOutputs['s1'], clean);   // both gates pass; the decision record is carried forward (ac2/ac3)
	}
});

test('s4/t2: a confirmed:false intermediate turn with partial decisions passes through (no gate)', async () => {
	registerBrainstormRunners();
	const paused = await startRun(intent('add search'), oneStepPlan, 'run-bs-8', 'slug-bs-8');
	assert.equal(paused.type, 'paused');
	if (paused.type !== 'paused') return;
	const midway = {
		category: 'requirements', workingStatement: 'Search over notes (scope TBD).', openItems: ['index cost?'], confirmed: false,
		decisions: [{ chosen: 'full-text', ruledOut: ['semantic'], reason: 'simpler' }],
		nonGoals: [],   // not yet reconciled — allowed while confirmed:false
	};
	const resumed = await resumeRun(paused.state, midway, 'slug-bs-8');
	assert.equal(resumed.type, 'complete');
	if (resumed.type === 'complete') {
		assert.deepEqual(resumed.stepOutputs['s1'], midway);
	}
});

// ---------------------------------------------------------------------------
// s5/t2 — resume parity: a paused brainstorm rehydrated from its opaque
// continuation token preserves answers (ac1) and converges byte-identically
// to an uninterrupted run (ac3).
// ---------------------------------------------------------------------------

/** Wrap a paused executor state in the MCP payload the same way the step phase
 *  does, so encodeState/decodeState exercises the real continuation carriage. */
const pausedPayload = (intentFocus: string, executor: unknown): WorkflowStepStatePayload => ({
	version:     1,
	runId:       'run-resume',
	epicKey:     'resume-key',
	startedAtMs: 1000,
	intent:      intent(intentFocus),
	executor:    executor as WorkflowStepStatePayload['executor'],
	stage:       'awaiting_llm_step',
});

test('s5/t2: a paused mid-convergence run round-trips through encodeState/decodeState with state intact (ac1)', async () => {
	registerBrainstormRunners();
	_clearWorkflowStateStoreForTests();
	const paused = await startRun(intent('a settings page'), oneStepPlan, 'run-bs-r1', 'slug-bs-r1');
	assert.equal(paused.type, 'paused');
	if (paused.type !== 'paused') return;

	// Encode the paused executor state to an opaque token, then decode it back.
	const token = encodeState(pausedPayload('a settings page', paused.state));
	const decoded = decodeState(token);
	assert.deepEqual(decoded.executor, paused.state);   // the folded state rehydrates identically (nothing dropped)

	// Resume from the rehydrated executor state — questioning continues, answer preserved.
	const answer = { category: 'requirements', workingStatement: 'A settings page scoped to notifications.', openItems: [], confirmed: true, decisions: [], nonGoals: [] };
	const resumed = await resumeRun(decoded.executor!, answer, 'slug-bs-r1');
	assert.equal(resumed.type, 'complete');
	if (resumed.type === 'complete') {
		assert.deepEqual(resumed.stepOutputs['s1'], answer);
	}
});

test('s5/t2: an interrupted-then-resumed run converges byte-identically to an uninterrupted one (ac3)', async () => {
	registerBrainstormRunners();
	const answer = { category: 'design', workingStatement: 'A dark-mode toggle in the editor pane only.', openItems: [], confirmed: true, decisions: [], nonGoals: [] };

	// Uninterrupted: start -> resume directly.
	const p1 = await startRun(intent('dark mode'), oneStepPlan, 'run-bs-r2a', 'slug-bs-r2a');
	assert.equal(p1.type, 'paused');
	if (p1.type !== 'paused') return;
	const uninterrupted = await resumeRun(p1.state, answer, 'slug-bs-r2a');

	// Interrupted: start -> encode/decode the pause -> resume from the rehydrated state.
	_clearWorkflowStateStoreForTests();
	const p2 = await startRun(intent('dark mode'), oneStepPlan, 'run-bs-r2b', 'slug-bs-r2b');
	assert.equal(p2.type, 'paused');
	if (p2.type !== 'paused') return;
	const decoded = decodeState(encodeState(pausedPayload('dark mode', p2.state)));
	const resumedAfterInterrupt = await resumeRun(decoded.executor!, answer, 'slug-bs-r2b');

	assert.equal(uninterrupted.type, 'complete');
	assert.equal(resumedAfterInterrupt.type, 'complete');
	if (uninterrupted.type === 'complete' && resumedAfterInterrupt.type === 'complete') {
		// Same answers on the same accumulated state -> byte-identical converged step output.
		assert.deepEqual(resumedAfterInterrupt.stepOutputs['s1'], uninterrupted.stepOutputs['s1']);
	}
});
