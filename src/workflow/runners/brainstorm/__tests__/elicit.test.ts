/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story S002 (Phase B — first elicitation turn) — plan tasks t1 (schema) + t2
 * (elicit llm-pause runner). Node isolates each test file in its own process,
 * so the runner registry starts fresh here.
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
// t1 — the elicit response schema
// ---------------------------------------------------------------------------

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(brainstormElicitSchema);

test('t1: schema accepts a valid { category, questions } payload', () => {
	assert.equal(validate({ category: 'requirements', questions: ['What is in scope?'] }), true);
});

test('t1: schema REJECTS an extra `spec` field (no spec on turn one)', () => {
	assert.equal(validate({ category: 'requirements', questions: ['q'], spec: 'a converged spec' }), false);
});

test('t1: schema REJECTS an empty or absent questions array', () => {
	assert.equal(validate({ category: 'design', questions: [] }), false);
	assert.equal(validate({ category: 'design' }), false);
});

test('t1: schema REJECTS a category outside the vocabulary', () => {
	assert.equal(validate({ category: 'spec', questions: ['q'] }), false);   // 'spec' is not a real id
});

test('t1: the category enum equals exactly the BRAINSTORM_CATEGORY_CLASSES ids', () => {
	const enumMembers = ((brainstormElicitSchema['properties'] as Record<string, { enum: string[] }>)['category']!).enum;
	assert.deepEqual([...enumMembers].sort(), [...CATEGORY_IDS].sort());
});

// ---------------------------------------------------------------------------
// t2 — the elicit llm-pause runner (driven through the real executor)
// ---------------------------------------------------------------------------

const intent = (focus: string): WorkflowIntent => ({
	workflow: 'brainstorm', focus, repoPath: '/tmp/x', repoIndexedAt: null, params: {},
});

const oneStepPlan: WorkflowPlan = {
	workflow: 'brainstorm',
	steps: [{ id: 's1', runner: 'elicit', params: {} }],
};

test('t2: the first brainstorm step PAUSES for the controller (an ask), carrying the elicit schema', async () => {
	registerBrainstormRunners();
	const tick = await startRun(intent('add a dark mode toggle'), oneStepPlan, 'run-bs-1', 'slug-bs-1');
	assert.equal(tick.type, 'paused');   // it asks, it does not self-resolve to an output/complete
	if (tick.type !== 'paused') return;
	assert.equal(tick.state.pause?.runner, 'elicit');
	assert.deepEqual(tick.state.pause?.schema, brainstormElicitSchema);   // the category+questions schema, not a spec/synthesize
});

test('t2: buildPrompt embeds the focus and the category vocabulary descriptions', async () => {
	registerBrainstormRunners();
	const tick = await startRun(intent('a widget that syncs offline'), oneStepPlan, 'run-bs-2', 'slug-bs-2');
	assert.equal(tick.type, 'paused');
	if (tick.type !== 'paused') return;
	assert.match(tick.state.pause!.userTurn, /a widget that syncs offline/);   // the rough idea reaches the prompt
	const requirementsDesc = BRAINSTORM_CATEGORY_CLASSES.find(c => c.id === 'requirements')!.description;
	assert.ok(tick.state.pause!.prompt.includes(requirementsDesc));           // reused vocabulary, no new taxonomy
});

test('t2: a valid controller answer resumes the run to completion, carrying { category, questions } forward', async () => {
	registerBrainstormRunners();
	const paused = await startRun(intent('a CLI flag'), oneStepPlan, 'run-bs-3', 'slug-bs-3');
	assert.equal(paused.type, 'paused');
	if (paused.type !== 'paused') return;
	const answer = { category: 'implementation', questions: ['Which subcommands does it apply to?'] };
	const resumed = await resumeRun(paused.state, answer, 'slug-bs-3');
	assert.equal(resumed.type, 'complete');
	if (resumed.type === 'complete') {
		assert.deepEqual(resumed.stepOutputs['s1'], answer);   // no spec produced; the questions turn is the output
	}
});
