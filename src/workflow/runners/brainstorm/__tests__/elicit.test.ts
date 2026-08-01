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

test('t1: workingStatement/openItems/confirmed are all required', () => {
	assert.equal(validate({ category: 'requirements', openItems: [], confirmed: true }), false);          // no workingStatement
	assert.equal(validate({ category: 'requirements', workingStatement: 'x', confirmed: true }), false);  // no openItems
	assert.equal(validate({ category: 'requirements', workingStatement: 'x', openItems: [] }), false);    // no confirmed
});

test('t1: the category enum equals exactly the BRAINSTORM_CATEGORY_CLASSES ids', () => {
	const enumMembers = ((brainstormElicitSchema['properties'] as Record<string, { enum: string[] }>)['category']!).enum;
	assert.deepEqual([...enumMembers].sort(), [...CATEGORY_IDS].sort());
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
	const premature = { category: 'implementation', workingStatement: 'A --json flag.', openItems: ['still deciding the scope'], confirmed: true };
	const resumed = await resumeRun(paused.state, premature, 'slug-bs-5');
	assert.equal(resumed.type, 'error');
	if (resumed.type === 'error') {
		assert.equal(resumed.code, 'convergence-incomplete');
		assert.equal(resumed.retryable, true);   // the run stays paused; controller re-prompts on the remaining openItems
		assert.equal(resumed.stepId, 's1');
	}
});
