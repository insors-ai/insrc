/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Ajv schema tests for PlanTask + PlannedTask.
 *
 * Pins every wire-layer constraint the semantic validator depends on.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/planner/__tests__/schema.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	PLAN_SCHEMA_VERSION,
	PLAN_SCOPE_BUCKET_ENUM,
	PLAN_TARGET_ENUM,
	TASK_ID_PATTERN,
	TASK_KIND_ENUM,
	validatePlanShape,
	validatePlanShapeWithErrors,
	validatePlannedTaskShape,
	validatePlannedTaskShapeWithErrors,
} from '../index.js';
import type { PlanTask, PlannedTask } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_TASK: PlannedTask = {
	taskId:    't01',
	template:  'code.surface.exports',
	kind:      'leaf',
	params:    { scopeRef: { kind: 'repo', value: '/r' } },
	produces:  ['exports'],
	rationale: 'enumerate the repo exports for downstream tasks',
};

const VALID_PLAN: PlanTask = {
	planId:    'p-root',
	goal:      'understand this repo',
	target:    'code',
	scope:     'M',
	reasoning: 'M-bucket understanding pass: discovery + per-module summary + aggregator',
	tasks:     [VALID_TASK],
};

// ---------------------------------------------------------------------------
// Enum + version sanity
// ---------------------------------------------------------------------------

test('PLAN_SCHEMA_VERSION is a positive integer', () => {
	assert.ok(Number.isInteger(PLAN_SCHEMA_VERSION));
	assert.ok(PLAN_SCHEMA_VERSION >= 1);
});

test('PLAN_TARGET_ENUM matches the four documented targets', () => {
	assert.deepEqual([...PLAN_TARGET_ENUM].sort(), ['code', 'data', 'generic', 'infra']);
});

test('PLAN_SCOPE_BUCKET_ENUM matches the five buckets in size order', () => {
	assert.deepEqual([...PLAN_SCOPE_BUCKET_ENUM], ['XS', 'S', 'M', 'L', 'XL']);
});

test('TASK_KIND_ENUM is exactly leaf | planner', () => {
	assert.deepEqual([...TASK_KIND_ENUM].sort(), ['leaf', 'planner']);
});

test('TASK_ID_PATTERN matches t01 / t99 / t100 / t999 but not t1 / tabc / T01', () => {
	const re = new RegExp(TASK_ID_PATTERN);
	assert.ok(re.test('t01'));
	assert.ok(re.test('t99'));
	assert.ok(re.test('t100'));
	assert.ok(re.test('t999'));
	assert.equal(re.test('t1'),    false);
	assert.equal(re.test('t1234'), false);
	assert.equal(re.test('tabc'),  false);
	assert.equal(re.test('T01'),   false);
	assert.equal(re.test(''),      false);
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('validatePlanShape accepts a minimal valid plan', () => {
	assert.ok(validatePlanShape(VALID_PLAN));
});

test('validatePlannedTaskShape accepts a minimal valid task', () => {
	assert.ok(validatePlannedTaskShape(VALID_TASK));
});

test('validatePlanShape accepts a plan with parentTaskPath (child plan)', () => {
	const child = { ...VALID_PLAN, parentTaskPath: 't02' };
	assert.ok(validatePlanShape(child));
});

test('validatePlannedTaskShape accepts a task with consumes + taskPath', () => {
	const t2: PlannedTask = {
		...VALID_TASK,
		taskId:   't02',
		consumes: ['exports'],
		taskPath: 't01.t02',
	};
	assert.ok(validatePlannedTaskShape(t2));
});

// ---------------------------------------------------------------------------
// Required-field rejection
// ---------------------------------------------------------------------------

for (const field of ['planId', 'goal', 'target', 'scope', 'tasks', 'reasoning'] as const) {
	test(`validatePlanShape rejects a plan missing '${field}'`, () => {
		const partial = { ...VALID_PLAN } as Partial<PlanTask>;
		delete partial[field];
		const r = validatePlanShapeWithErrors(partial);
		assert.equal(r.ok, false);
		assert.ok(r.errors.some(e => e.includes(field)),
			`expected error mentioning '${field}', got: ${r.errors.join('; ')}`);
	});
}

for (const field of ['taskId', 'template', 'kind', 'params', 'produces', 'rationale'] as const) {
	test(`validatePlannedTaskShape rejects a task missing '${field}'`, () => {
		const partial = { ...VALID_TASK } as Partial<PlannedTask>;
		delete partial[field];
		assert.equal(validatePlannedTaskShape(partial), false);
	});
}

// ---------------------------------------------------------------------------
// Enum + pattern rejection
// ---------------------------------------------------------------------------

test('validatePlanShape rejects unknown target', () => {
	assert.equal(validatePlanShape({ ...VALID_PLAN, target: 'unknown' }), false);
});

test('validatePlanShape rejects unknown scope', () => {
	assert.equal(validatePlanShape({ ...VALID_PLAN, scope: 'XXL' }), false);
});

test('validatePlannedTaskShape rejects taskId not matching the pattern', () => {
	assert.equal(validatePlannedTaskShape({ ...VALID_TASK, taskId: 't1' }), false);
	assert.equal(validatePlannedTaskShape({ ...VALID_TASK, taskId: 'task01' }), false);
});

test('validatePlannedTaskShape rejects kind outside leaf|planner', () => {
	assert.equal(validatePlannedTaskShape({ ...VALID_TASK, kind: 'aggregator' }), false);
});

// ---------------------------------------------------------------------------
// additionalProperties:false
// ---------------------------------------------------------------------------

test('validatePlanShape rejects unknown top-level properties', () => {
	assert.equal(validatePlanShape({ ...VALID_PLAN, mystery: 1 }), false);
});

test('validatePlannedTaskShape rejects unknown task properties', () => {
	assert.equal(validatePlannedTaskShape({ ...VALID_TASK, mystery: 1 }), false);
});

// ---------------------------------------------------------------------------
// Length + minItems rules
// ---------------------------------------------------------------------------

test('validatePlanShape rejects empty tasks array (minItems:1)', () => {
	assert.equal(validatePlanShape({ ...VALID_PLAN, tasks: [] }), false);
});

test('validatePlannedTaskShape rejects empty produces array (minItems:1)', () => {
	assert.equal(validatePlannedTaskShape({ ...VALID_TASK, produces: [] }), false);
});

test('validatePlannedTaskShape rejects duplicate produces entries (uniqueItems)', () => {
	assert.equal(validatePlannedTaskShape({ ...VALID_TASK, produces: ['x', 'x'] }), false);
});

test('validatePlannedTaskShape rejects too-short rationale (minLength 20)', () => {
	assert.equal(validatePlannedTaskShape({ ...VALID_TASK, rationale: 'too short' }), false);
});

test('validatePlanShape rejects too-short plan reasoning (minLength 50)', () => {
	assert.equal(validatePlanShape({ ...VALID_PLAN, reasoning: 'too short' }), false);
});

test('validatePlanShape rejects too-long goal (maxLength 200)', () => {
	assert.equal(validatePlanShape({ ...VALID_PLAN, goal: 'x'.repeat(201) }), false);
});
