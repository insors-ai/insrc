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
