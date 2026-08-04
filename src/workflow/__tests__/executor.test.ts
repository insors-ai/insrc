/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Executor unit tests: sequential loop, placeholder substitution,
 * pause/resume, error propagation.
 *
 * Uses a hand-registered runner set so tests are isolated from
 * the stub runners. Every test calls _clearRunnerRegistryForTests()
 * at start.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/executor.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	_clearRunnerRegistryForTests,
	registerRunner,
	resumeRun,
	startRun,
	substitutePlaceholders,
} from '../executor.js';
import type { StepRunner, WorkflowIntent, WorkflowPlan } from '../types.js';
import type { LLMProvider } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const intent: WorkflowIntent = {
	workflow: 'stub',
	focus:    'test',
	repoPath: '/tmp/insrc-test-fixture-repo',
	repoIndexedAt: null,
	params:   {},
};

function det(id: string, out: unknown): StepRunner {
	return {
		id, workflow: 'stub',
		async run() { return { type: 'output', output: out }; },
	};
}

function llmRunner(id: string): StepRunner {
	return {
		id, workflow: 'stub',
		async run() {
			return {
				type: 'llm-pause',
				prompt: `stub-${id}`, userTurn: 'go',
				schema: { type: 'object' },
				preparedBlob: { id },
			};
		},
		async finalize(resp) {
			return { type: 'output', output: { fromLlm: resp } };
		},
	};
}

// ---------------------------------------------------------------------------
// Substitution
// ---------------------------------------------------------------------------

test('substitutePlaceholders returns params unchanged when no $sN', () => {
	const params = { a: 1, b: 'hello', nested: { c: [1, 2] } };
	const out = substitutePlaceholders(params, {});
	assert.deepEqual(out, params);
});

test('substitutePlaceholders resolves $s1 whole output', () => {
	const out = substitutePlaceholders({ x: '$s1' }, { s1: { a: 1 } });
	assert.deepEqual(out, { x: { a: 1 } });
});

test('substitutePlaceholders resolves $s1.foo.bar', () => {
	const out = substitutePlaceholders({ x: '$s1.foo.bar' }, { s1: { foo: { bar: 42 } } });
	assert.deepEqual(out, { x: 42 });
});

test('substitutePlaceholders resolves $s1.arr[0]', () => {
	const out = substitutePlaceholders({ x: '$s1.arr[1]' }, { s1: { arr: ['a', 'b', 'c'] } });
	assert.deepEqual(out, { x: 'b' });
});

test('substitutePlaceholders throws on unknown step', () => {
	assert.throws(() => substitutePlaceholders({ x: '$s7.foo' }, { s1: {} }));
});

test('substitutePlaceholders throws on unknown key', () => {
	assert.throws(() => substitutePlaceholders({ x: '$s1.missing' }, { s1: {} }));
});

// ---------------------------------------------------------------------------
// Sequential execution
// ---------------------------------------------------------------------------

test('startRun runs deterministic steps to completion', async () => {
	_clearRunnerRegistryForTests();
	registerRunner(det('r1', { hello: 'world' }));
	registerRunner(det('r2', { count: 42 }));

	const plan: WorkflowPlan = {
		workflow: 'stub',
		steps: [
			{ id: 's1', runner: 'r1', params: {} },
			{ id: 's2', runner: 'r2', params: {} },
		],
	};
	const tick = await startRun(intent, plan, 'run-1', 'slug-1');
	assert.equal(tick.type, 'complete');
	if (tick.type === 'complete') {
		assert.deepEqual(tick.stepOutputs, {
			s1: { hello: 'world' },
			s2: { count: 42 },
		});
	}
});

test('startRun threads $sN.<accessor> substitutions between steps', async () => {
	_clearRunnerRegistryForTests();
	registerRunner(det('r1', { a: { b: 'nested' } }));
	registerRunner({
		id: 'reads', workflow: 'stub',
		async run(ctx) {
			return { type: 'output', output: { echoed: ctx.params['picked'] } };
		},
	});

	const plan: WorkflowPlan = {
		workflow: 'stub',
		steps: [
			{ id: 's1', runner: 'r1', params: {} },
			{ id: 's2', runner: 'reads', params: { picked: '$s1.a.b' } },
		],
	};
	const tick = await startRun(intent, plan, 'run-2', 'slug-2');
	assert.equal(tick.type, 'complete');
	if (tick.type === 'complete') {
		assert.deepEqual(tick.stepOutputs['s2'], { echoed: 'nested' });
	}
});

test('startRun errors when a runner is missing', async () => {
	_clearRunnerRegistryForTests();
	const plan: WorkflowPlan = {
		workflow: 'stub',
		steps: [{ id: 's1', runner: 'missing', params: {} }],
	};
	const tick = await startRun(intent, plan, 'run-3', 'slug-3');
	assert.equal(tick.type, 'error');
	if (tick.type === 'error') {
		assert.equal(tick.code, 'no-runner');
		assert.equal(tick.stepId, 's1');
	}
});

// ---------------------------------------------------------------------------
// Pause + resume
// ---------------------------------------------------------------------------

test('startRun pauses on an llm-pause runner + resumeRun continues', async () => {
	_clearRunnerRegistryForTests();
	registerRunner(det('r1', { pre: true }));
	registerRunner(llmRunner('r2'));
	registerRunner(det('r3', { post: true }));

	const plan: WorkflowPlan = {
		workflow: 'stub',
		steps: [
			{ id: 's1', runner: 'r1', params: {} },
			{ id: 's2', runner: 'r2', params: {} },
			{ id: 's3', runner: 'r3', params: {} },
		],
	};
	const paused = await startRun(intent, plan, 'run-4', 'slug-4');
	assert.equal(paused.type, 'paused');
	if (paused.type !== 'paused') return;
	assert.equal(paused.state.pause?.stepId, 's2');
	assert.equal(paused.state.pause?.runner, 'r2');

	const resumed = await resumeRun(paused.state, { userAnswer: 'yes' }, 'slug-4');
	assert.equal(resumed.type, 'complete');
	if (resumed.type === 'complete') {
		assert.deepEqual(resumed.stepOutputs['s1'], { pre: true });
		assert.deepEqual(resumed.stepOutputs['s2'], { fromLlm: { userAnswer: 'yes' } });
		assert.deepEqual(resumed.stepOutputs['s3'], { post: true });
	}
});

// ---------------------------------------------------------------------------
// S010 — the additive finalize `llm-pause` re-pause contract + draftProvider dep
// ---------------------------------------------------------------------------

/** A runner whose finalize() re-pauses the SAME step for `turns-1` turns, then
 *  outputs — the executor shape the brainstorm adaptive elicit loop relies on. */
function multiTurnRunner(id: string, turns: number): StepRunner {
	let seen = 0;
	return {
		id, workflow: 'stub',
		async run() {
			return { type: 'llm-pause', prompt: 'p', userTurn: 'u0', schema: { type: 'object' }, preparedBlob: { turn: 0 } };
		},
		async finalize() {
			seen += 1;
			if (seen < turns) {
				return { type: 'llm-pause', prompt: 'p', userTurn: `u${seen}`, schema: { type: 'object' }, preparedBlob: { turn: seen } };
			}
			return { type: 'output', output: { turns: seen } };
		},
	};
}

test('S010: a finalize returning llm-pause RE-PAUSES the same step (nextStepIndex unchanged), then completes', async () => {
	_clearRunnerRegistryForTests();
	registerRunner(multiTurnRunner('m', 3));
	const plan: WorkflowPlan = { workflow: 'stub', steps: [{ id: 's1', runner: 'm', params: {} }] };

	let tick = await startRun(intent, plan, 'run-mt', 'slug-mt');
	assert.equal(tick.type, 'paused');
	if (tick.type !== 'paused') return;
	const idx = tick.state.nextStepIndex;

	// resume #1 + #2 both RE-PAUSE the same step, index unchanged.
	for (let i = 0; i < 2; i++) {
		tick = await resumeRun(tick.state, {}, 'slug-mt');
		assert.equal(tick.type, 'paused', `resume #${i + 1} re-pauses`);
		if (tick.type !== 'paused') return;
		assert.equal(tick.state.nextStepIndex, idx, 'nextStepIndex UNCHANGED on re-pause');
		assert.equal(tick.state.pause!.stepId, 's1');
	}

	// resume #3 outputs → the run completes.
	tick = await resumeRun(tick.state, {}, 'slug-mt');
	assert.equal(tick.type, 'complete');
	if (tick.type === 'complete') assert.deepEqual(tick.stepOutputs['s1'], { turns: 3 });
});

test('S010: the executor threads draftProvider into BOTH run() and finalize() ctx; absent → undefined (byte-identical)', async () => {
	_clearRunnerRegistryForTests();
	const seen: { run?: boolean; finalize?: boolean } = {};
	registerRunner({
		id: 'probe', workflow: 'stub',
		async run(ctx) {
			seen.run = ctx.draftProvider !== undefined;
			return { type: 'llm-pause', prompt: 'p', userTurn: 'u', schema: { type: 'object' }, preparedBlob: {} };
		},
		async finalize(_r, _b, ctx) {
			seen.finalize = ctx.draftProvider !== undefined;
			return { type: 'output', output: {} };
		},
	});
	const plan: WorkflowPlan = { workflow: 'stub', steps: [{ id: 's1', runner: 'probe', params: {} }] };
	const fakeProvider = {} as unknown as LLMProvider;

	// supplied → present in BOTH contexts.
	const p1 = await startRun(intent, plan, 'run-dp', 'slug-dp', { draftProvider: fakeProvider });
	assert.equal(p1.type, 'paused');
	if (p1.type !== 'paused') return;
	await resumeRun(p1.state, {}, 'slug-dp', { draftProvider: fakeProvider });
	assert.equal(seen.run, true, 'draftProvider reached run() ctx');
	assert.equal(seen.finalize, true, 'draftProvider reached finalize() ctx');

	// absent → undefined in both (the pre-S010 behaviour).
	seen.run = undefined; seen.finalize = undefined;
	const p2 = await startRun(intent, plan, 'run-dp2', 'slug-dp2');
	assert.equal(p2.type, 'paused');
	if (p2.type !== 'paused') return;
	await resumeRun(p2.state, {}, 'slug-dp2');
	assert.equal(seen.run, false, 'no draftProvider → undefined in run()');
	assert.equal(seen.finalize, false, 'no draftProvider → undefined in finalize()');
});
