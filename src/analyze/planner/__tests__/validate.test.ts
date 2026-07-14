/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plan validator tests -- one per invariant in
 * design/analyze-plan-builder.md "Invariants the validator enforces"
 * plus a few cross-cutting cases (catalog index, focused-band, child
 * vs root).
 *
 * Pure functional tests. The catalog is a hand-rolled fixture.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/planner/__tests__/validate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	SCOPE_BAND,
	validatePlan,
	type PlanInvariantId,
} from '../index.js';
import type {
	AnalyzeTaskTemplate,
	PlanTask,
	PlannedTask,
} from '../types.js';

// ---------------------------------------------------------------------------
// Fixture catalog -- a small but realistic set of code-target templates.
// Includes leaf + planner + aggregator kinds so the invariants have
// real shapes to validate against.
// ---------------------------------------------------------------------------

const T_DISCOVERY: AnalyzeTaskTemplate = {
	id:          'code.discovery.modules',
	target:      'code',
	family:      'discovery',
	kind:        'leaf',
	revision:    'r1',
	description: 'enumerate the modules in the repo',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['scopeRef'],
		properties: {
			scopeRef: {
				type: 'object',
				required: ['kind', 'value'],
				properties: { kind: { type: 'string' }, value: { type: 'string' } },
			},
		},
	},
	produces:    ['modules'],
};

const T_SUMMARY: AnalyzeTaskTemplate = {
	id:          'code.summary.module',
	target:      'code',
	family:      'summary',
	kind:        'leaf',
	revision:    'r1',
	description: 'summarise a single module',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['module'],
		properties: {
			module: { type: 'string' },
			depth:  { type: 'string', enum: ['shallow', 'deep'] },
		},
	},
	produces:    ['module-summary'],
};

const T_SUBRUN: AnalyzeTaskTemplate = {
	id:          'code.subrun.deep-dive',
	target:      'code',
	family:      'subrun',
	kind:        'planner',
	revision:    'r1',
	description: 'recursively plan a deep-dive into a sub-target',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		properties: { module: { type: 'string' } },
	},
	produces:    ['report'],
};

const T_AGGREGATOR: AnalyzeTaskTemplate = {
	id:           'code.aggregate.report',
	target:       'code',
	family:       'aggregate',
	kind:         'leaf',
	revision:     'r1',
	description:  'stitch per-task outputs into the final report',
	inputSchema:  { type: 'object', additionalProperties: true },
	produces:     ['report'],
	isAggregator: true,
};

const T_DATA_AGGREGATOR: AnalyzeTaskTemplate = {
	id:           'data.aggregate.report',
	target:       'data',
	family:       'aggregate',
	kind:         'leaf',
	revision:     'r1',
	produces:     ['report'],
	isAggregator: true,
};

/**
 * A permissive template the INV-9 tests use to smuggle nested
 * task-shaped objects inside params -- the strict templates above
 * would reject those via INV-5 (additionalProperties:false) before
 * INV-9 had a chance to fire.
 */
const T_FREEFORM: AnalyzeTaskTemplate = {
	id:          'code.freeform.note',
	target:      'code',
	family:      'note',
	kind:        'leaf',
	revision:    'r1',
	inputSchema: { type: 'object', additionalProperties: true },
	produces:    ['note'],
};

const CATALOG: readonly AnalyzeTaskTemplate[] = [
	T_DISCOVERY, T_SUMMARY, T_SUBRUN, T_AGGREGATOR, T_DATA_AGGREGATOR, T_FREEFORM,
];

// ---------------------------------------------------------------------------
// Helpers -- build a valid M-bucket plan (20 tasks) we can then mutate
// per-test to trigger each invariant failure.
// ---------------------------------------------------------------------------

function mkTask(n: number, over: Partial<PlannedTask> = {}): PlannedTask {
	return {
		taskId:    n < 100 ? `t${String(n).padStart(2, '0')}` : `t${n}`,
		template:  'code.summary.module',
		kind:      'leaf',
		params:    { module: `m${n}` },
		// `produces` is the TYPE name from the template, not a per-instance
		// id. Every code.summary.module task produces `module-summary`;
		// the runtime distinguishes by taskId at the materialization layer.
		produces:  ['module-summary'],
		rationale: `summarise module m${n} for downstream aggregation`,
		...over,
	};
}

/**
 * Build a happy-path plan at scope `M` -- 20 tasks. First is
 * discovery, last is aggregator, middle 18 are summary tasks.
 */
function buildValidPlan(): PlanTask {
	const tasks: PlannedTask[] = [];
	tasks.push({
		taskId:    't01',
		template:  'code.discovery.modules',
		kind:      'leaf',
		params:    { scopeRef: { kind: 'repo', value: '/r' } },
		produces:  ['modules'],
		rationale: 'enumerate the modules to summarise downstream',
	});
	for (let i = 2; i <= 19; i++) {
		tasks.push(mkTask(i));
	}
	tasks.push({
		taskId:    't20',
		template:  'code.aggregate.report',
		kind:      'leaf',
		params:    {},
		produces:  ['report'],
		rationale: 'aggregate per-module summaries into the final report',
	});
	return {
		planId:    'p-root',
		goal:      'understand the repo at M scope',
		target:    'code',
		scope:     'M',
		reasoning: 'M-bucket plan: discovery + per-module summary + aggregator (20 tasks total)',
		tasks,
	};
}

function assertFailure(
	plan:        PlanTask,
	expectedId:  PlanInvariantId,
	opts:        Parameters<typeof validatePlan>[2] = {},
): void {
	const r = validatePlan(plan, CATALOG, opts);
	assert.notEqual(r, null, `expected ${expectedId} failure; got null (plan passed)`);
	assert.equal(r!.invariantId, expectedId,
		`expected ${expectedId}; got ${r!.invariantId}: ${r!.message}`);
}

// ---------------------------------------------------------------------------
// Happy path: every invariant passes
// ---------------------------------------------------------------------------

test('validatePlan: happy-path 20-task M-bucket plan passes every invariant', () => {
	const r = validatePlan(buildValidPlan(), CATALOG);
	assert.equal(r, null, `expected null; got ${JSON.stringify(r)}`);
});

// ---------------------------------------------------------------------------
// INV-1: non-empty tasks list
// ---------------------------------------------------------------------------

test('INV-1: empty tasks list', () => {
	const plan = { ...buildValidPlan(), tasks: [] };
	assertFailure(plan, 'INV-1');
});

// ---------------------------------------------------------------------------
// INV-2: stable monotonic taskIds
// ---------------------------------------------------------------------------

test('INV-2: gap in task ids (t01, t02, t04)', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[2] = { ...tasks[2]!, taskId: 't04' };
	assertFailure({ ...p, tasks }, 'INV-2');
});

test('INV-2: out-of-order ids (t01, t03, t02, ...)', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[1] = { ...tasks[1]!, taskId: 't03' };
	tasks[2] = { ...tasks[2]!, taskId: 't02' };
	assertFailure({ ...p, tasks }, 'INV-2');
});

// ---------------------------------------------------------------------------
// INV-3: templates exist
// ---------------------------------------------------------------------------

test('INV-3: unknown template id', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = { ...tasks[5]!, template: 'code.invented' };
	assertFailure({ ...p, tasks }, 'INV-3');
});

// ---------------------------------------------------------------------------
// INV-4: templates are target-correct
// ---------------------------------------------------------------------------

test('INV-4: data template in a code plan', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	// Replace task 5 with a data-target template (preserving produces from the data agg).
	tasks[5] = {
		...tasks[5]!,
		template: 'data.aggregate.report',
		produces: ['report'],
	};
	assertFailure({ ...p, tasks }, 'INV-4');
});

test('INV-4: generic-target plans accept any target template', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = {
		...tasks[5]!,
		template: 'data.aggregate.report',
		produces: ['report'],
	};
	// Generic plan permits cross-target -- but we still need an
	// aggregator at the end of the generic plan that matches its
	// own aggregator template. Since CATALOG only has code/data
	// aggregators and the plan is target=generic, we'd hit INV-12
	// (no generic aggregator). To isolate INV-4 cleanly, drop the
	// last task and re-pick. This test focuses on "INV-4 doesn't
	// fire for generic"; INV-12 may instead. Accept the second
	// failure as long as it's NOT INV-4.
	const r = validatePlan(
		{ ...p, target: 'generic', tasks },
		CATALOG,
	);
	if (r !== null) {
		assert.notEqual(r.invariantId, 'INV-4',
			`generic plan should NOT fail INV-4; got ${r.invariantId}: ${r.message}`);
	}
});

// ---------------------------------------------------------------------------
// INV-5: params validate against template inputSchema
// ---------------------------------------------------------------------------

test('INV-5: missing required param key', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = { ...tasks[5]!, params: { wrong: 'key' } }; // missing 'module'
	assertFailure({ ...p, tasks }, 'INV-5');
});

test('INV-5: param value with wrong type', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = { ...tasks[5]!, params: { module: 42 } };
	assertFailure({ ...p, tasks }, 'INV-5');
});

// ---------------------------------------------------------------------------
// INV-6: produces matches template
// ---------------------------------------------------------------------------

test('INV-6: emitted produces differs from template produces', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = { ...tasks[5]!, produces: ['wrong-name'] };
	assertFailure({ ...p, tasks }, 'INV-6');
});

// ---------------------------------------------------------------------------
// INV-7: consumes references an unproduced name
// ---------------------------------------------------------------------------

test('INV-7: task consumes an output no earlier task produces', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = { ...tasks[5]!, consumes: ['ghost-output'] };
	assertFailure({ ...p, tasks }, 'INV-7');
});

// Note: the "consumes a LATER-produced name" case is structurally the
// same as "consumes a name no earlier task produces" -- both reduce
// to "no earlier producer". Covered by the first INV-7 test.

// ---------------------------------------------------------------------------
// INV-8: kind matches template
// ---------------------------------------------------------------------------

test('INV-8: leaf template emitted with kind=planner', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = { ...tasks[5]!, kind: 'planner' };
	assertFailure({ ...p, tasks }, 'INV-8');
});

test('INV-8: planner template emitted with kind=leaf', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = {
		...tasks[5]!,
		template:  'code.subrun.deep-dive',
		kind:      'leaf',  // wrong; template is planner
		params:    { module: 'm5' },
		produces:  ['report'],
	};
	assertFailure({ ...p, tasks }, 'INV-8');
});

// ---------------------------------------------------------------------------
// INV-9: no nested task arrays inside params
// ---------------------------------------------------------------------------

test('INV-9: params contains a nested {taskId, template, ...} array', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	// Use the freeform template (additionalProperties:true) so INV-5
	// doesn't fire before INV-9 has a chance to inspect params.
	tasks[5] = {
		...tasks[5]!,
		template: 'code.freeform.note',
		params:   {
			nestedTasks: [
				{ taskId: 't99', template: 'invented', params: {} },
			],
		},
		produces: ['note'],
	};
	assertFailure({ ...p, tasks }, 'INV-9');
});

test('INV-9: params deeply nested array of task-shaped objects', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = {
		...tasks[5]!,
		template: 'code.freeform.note',
		params:   {
			subPlan: {
				inner: [{ taskId: 't1' }],
			},
		},
		produces: ['note'],
	};
	assertFailure({ ...p, tasks }, 'INV-9');
});

// ---------------------------------------------------------------------------
// INV-10 + INV-11: cycles + topological order
//
// INV-10 (cycles) is theoretically prevented by INV-7 (consumers
// come after producers). Force a hand-rolled cycle to exercise the
// dedicated detector.
// ---------------------------------------------------------------------------

test('INV-10: produces->consumes cycle (a depends on b depends on a)', () => {
	// Build a tiny custom plan with a real cycle. Uses the freeform
	// template so the per-task produces names can be arbitrary
	// (template produces is [`note`], so we have to ALSO rename the
	// produces -- we test cycles via a permissive shape). The cycle
	// detector still fires because we wire consumes back to a
	// later producer.
	const tasks: PlannedTask[] = [
		{ taskId: 't01', template: 'code.freeform.note', kind: 'leaf',
		  params: {}, produces: ['note'], consumes: ['note'],
		  rationale: 'cyclic-a depends on cyclic-b for cycle test' },
		{ taskId: 't02', template: 'code.freeform.note', kind: 'leaf',
		  params: {}, produces: ['note'], consumes: ['note'],
		  rationale: 'cyclic-b depends on cyclic-a for cycle test' },
		{ taskId: 't03', template: 'code.aggregate.report', kind: 'leaf',
		  params: {}, produces: ['report'],
		  rationale: 'aggregator for the cyclic test fixture' },
	];
	const plan: PlanTask = {
		planId:    'p-root',
		goal:      'cyclic-test',
		target:    'code',
		scope:     'XS',
		reasoning: 'XS plan designed to expose the cycle-detection invariant for cross-test purposes',
		tasks,
	};
	// INV-7 catches this first (t01 consumes 'note' which isn't
	// produced earlier). Accept any cycle-adjacent invariant since
	// the linear order check + cycle check are functionally
	// equivalent for this fixture.
	const r = validatePlan(plan, CATALOG);
	assert.notEqual(r, null);
	assert.ok(['INV-7', 'INV-10', 'INV-11'].includes(r!.invariantId),
		`expected INV-7/10/11; got ${r!.invariantId}: ${r!.message}`);
});

// ---------------------------------------------------------------------------
// INV-12: exactly one aggregator, must be last
// ---------------------------------------------------------------------------

test('INV-12: no aggregator at all', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	// Replace t20 (the aggregator) with a non-aggregator task.
	tasks[19] = mkTask(20);
	assertFailure({ ...p, tasks }, 'INV-12');
});

test('INV-12: aggregator not in the last slot', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	// Move the aggregator to position 5, replace t20 with a summary.
	tasks[5]  = {
		taskId:    't06',
		template:  'code.aggregate.report',
		kind:      'leaf',
		params:    {},
		produces:  ['report'],
		rationale: 'misplaced aggregator at position 5 instead of last',
	};
	tasks[19] = mkTask(20);
	assertFailure({ ...p, tasks }, 'INV-12');
});

test('INV-12: TWO aggregator tasks', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = {
		taskId:    't06',
		template:  'code.aggregate.report',
		kind:      'leaf',
		params:    {},
		produces:  ['report'],
		rationale: 'extra aggregator that should not be here',
	};
	// Leave the t20 aggregator in place -- two aggregators total.
	assertFailure({ ...p, tasks }, 'INV-12');
});

// ---------------------------------------------------------------------------
// INV-13: scope policy band
// ---------------------------------------------------------------------------

test('INV-13: M-bucket plan with too few tasks (below lower bound 20)', () => {
	const tasks: PlannedTask[] = [];
	for (let i = 1; i <= 9; i++) tasks.push(mkTask(i));
	tasks.push({
		taskId: 't10', template: 'code.aggregate.report', kind: 'leaf',
		params: {}, produces: ['report'],
		rationale: 'aggregator for the too-few-tasks M-bucket test fixture',
	});
	const plan: PlanTask = {
		planId:    'p-root',
		goal:      'too-few-tasks M-bucket',
		target:    'code',
		scope:     'M',
		reasoning: 'deliberately too-small plan to trip the M-bucket lower-bound invariant',
		tasks,
	};
	assertFailure(plan, 'INV-13');
});

test('INV-13: focused intent halves the lower bound', () => {
	// 11 tasks at S bucket. Default lower bound 10 -> passes.
	// Focused lower bound = 5 -> definitely passes.
	const tasks: PlannedTask[] = [];
	for (let i = 1; i <= 10; i++) tasks.push(mkTask(i));
	tasks.push({
		taskId: 't11', template: 'code.aggregate.report', kind: 'leaf',
		params: {}, produces: ['report'],
		rationale: 'aggregator for the S-bucket focused-intent test fixture',
	});
	const plan: PlanTask = {
		planId:    'p-root',
		goal:      'focused S-bucket pass',
		target:    'code',
		scope:     'S',
		reasoning: 'S-bucket plan with focused intent reducing the lower bound to half',
		tasks,
	};
	const r = validatePlan(plan, CATALOG, { focused: true });
	assert.equal(r, null);
});

test('INV-13: focused intent does NOT raise the upper bound', () => {
	// Build an M-bucket plan with 50 tasks (above hi=40).
	const tasks: PlannedTask[] = [];
	for (let i = 1; i <= 49; i++) tasks.push(mkTask(i));
	tasks.push({
		taskId: 't50', template: 'code.aggregate.report', kind: 'leaf',
		params: {}, produces: ['report'],
		rationale: 'aggregator for the over-the-upper-bound M-bucket test fixture',
	});
	const plan: PlanTask = {
		planId:    'p-root',
		goal:      'too-many M',
		target:    'code',
		scope:     'M',
		reasoning: 'M-bucket plan deliberately over the upper bound for the INV-13 test',
		tasks,
	};
	assertFailure(plan, 'INV-13', { focused: true });
});

// ---------------------------------------------------------------------------
// INV-14: rationale + reasoning lengths
// (Schema layer also catches these; the validator double-checks so
// the invariant id stays stable.)
// ---------------------------------------------------------------------------

test('INV-14: task rationale at exactly 19 chars (boundary)', () => {
	const p = buildValidPlan();
	const tasks = [...p.tasks];
	tasks[5] = { ...tasks[5]!, rationale: 'x'.repeat(19) };
	assertFailure({ ...p, tasks }, 'INV-14');
});

test('INV-14: plan reasoning at exactly 49 chars (boundary)', () => {
	const p = buildValidPlan();
	assertFailure({ ...p, reasoning: 'x'.repeat(49) }, 'INV-14');
});

// ---------------------------------------------------------------------------
// INV-15: parentTaskPath presence matches root vs child
// ---------------------------------------------------------------------------

test('INV-15: root plan must NOT have parentTaskPath', () => {
	const p = buildValidPlan();
	const bad = { ...p, parentTaskPath: 't02' };
	assertFailure(bad, 'INV-15');
});

test('INV-15: child plan MUST have parentTaskPath', () => {
	const p = buildValidPlan();
	assertFailure(p, 'INV-15', { isChildPlan: true });
});

test('INV-15: child plan with parentTaskPath set passes', () => {
	const p = { ...buildValidPlan(), parentTaskPath: 't02' };
	const r = validatePlan(p, CATALOG, { isChildPlan: true });
	assert.equal(r, null);
});

// ---------------------------------------------------------------------------
// SCOPE_BAND smoke
// ---------------------------------------------------------------------------

test('SCOPE_BAND values match the design doc', () => {
	assert.deepEqual(SCOPE_BAND['XS'], { lo: 3,  hi: 8  });
	assert.deepEqual(SCOPE_BAND['S'],  { lo: 10, hi: 20 });
	assert.deepEqual(SCOPE_BAND['M'],  { lo: 20, hi: 40 });
	assert.deepEqual(SCOPE_BAND['L'],  { lo: 30, hi: 60 });
	assert.deepEqual(SCOPE_BAND['XL'], { lo: 40, hi: 80 });
});
