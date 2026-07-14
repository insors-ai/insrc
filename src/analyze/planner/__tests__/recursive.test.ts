/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Recursive Plan-tree builder tests.
 *
 * Uses a stub LLM provider whose completeStructured returns hand-
 * built PlanTask objects keyed by call sequence -- this gives us
 * deterministic, multi-level recursion without paying for real
 * Ollama calls. The persistence layer (P3) writes plans to disk
 * as a side effect; tests pin the in-memory tree shape + verify
 * the depth-cap behavior.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/planner/__tests__/recursive.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import {
	_buildParentTaskPathForTest,
	_extractChildIntentForTest,
	countNodes,
	countPlannerTasks,
	maxDepth,
	runRecursivePlanner,
} from '../recursive.js';
import { MaxPlanDepthExceededError } from '../driver.js';
import {
	_resetTemplateRegistryForTests,
	getTemplatesForTarget,
} from '../templates/registry.js';
import {
	_resetTemplateBootstrapLatchForTests,
	registerBuiltinTemplates,
} from '../templates/bootstrap.js';
import { purgePlan } from '../cache.js';
import type {
	PlanBuilderInput,
	PlanBuilderOpts,
	PlanTask,
	PlannedTask,
} from '../types.js';
import type { AnalyzeContextBundle } from '../../context/types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMProvider } from '../../../shared/types.js';

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.before(() => {
	_resetAnalyzeConfigCacheForTests();
	_resetTemplateBootstrapLatchForTests();
	_resetTemplateRegistryForTests();
	registerBuiltinTemplates();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('extractChildIntent: well-formed childIntent -> returns it', () => {
	const task: PlannedTask = {
		taskId:    't02',
		template:  'code.subrun.deep-dive',
		kind:      'planner',
		params:    {
			childIntent: {
				target:    'code',
				scope:     'S',
				focused:   false,
				scopeRef:  { kind: 'module', value: '/r/m' },
				reasoning: 'sub',
			},
		},
		produces:  ['report'],
		rationale: 'recurse',
	};
	const ci = _extractChildIntentForTest(task);
	assert.notEqual(ci, null);
	assert.equal(ci!.target, 'code');
	assert.equal(ci!.scope,  'S');
});

test('extractChildIntent: missing childIntent -> null', () => {
	const task: PlannedTask = {
		taskId:    't02',
		template:  'code.subrun.deep-dive',
		kind:      'planner',
		params:    {},
		produces:  ['report'],
		rationale: 'recurse',
	};
	assert.equal(_extractChildIntentForTest(task), null);
});

test('extractChildIntent: malformed childIntent (missing required field) -> null', () => {
	const task: PlannedTask = {
		taskId:    't02',
		template:  'code.subrun.deep-dive',
		kind:      'planner',
		params:    {
			childIntent: { target: 'code' }, // missing scope, etc.
		},
		produces:  ['report'],
		rationale: 'recurse',
	};
	assert.equal(_extractChildIntentForTest(task), null);
});

test('buildParentTaskPath: root parent (undefined) -> taskId verbatim', () => {
	assert.equal(_buildParentTaskPathForTest(undefined, 't02'), 't02');
});

test('buildParentTaskPath: empty parent string -> taskId verbatim', () => {
	assert.equal(_buildParentTaskPathForTest('', 't02'), 't02');
});

test('buildParentTaskPath: nested -> parent.taskId', () => {
	assert.equal(_buildParentTaskPathForTest('t02', 't05'), 't02.t05');
	assert.equal(_buildParentTaskPathForTest('t02.t05', 't01'), 't02.t05.t01');
});

// ---------------------------------------------------------------------------
// Tree helpers (pure, no LLM)
// ---------------------------------------------------------------------------

const SAMPLE_PLAN: PlanTask = {
	planId:    'p-root',
	goal:      'sample',
	target:    'code',
	scope:     'XS',
	reasoning: 'sample plan for tree-helper tests; just a discovery + aggregator combo',
	tasks: [
		{ taskId: 't01', template: 'code.discovery.modules', kind: 'leaf',
		  params: { scopeRef: { kind: 'repo', value: '/r' } },
		  produces: ['modules'], rationale: 'discover modules in scope' },
		{ taskId: 't02', template: 'code.aggregate.report', kind: 'leaf',
		  params: {}, produces: ['report'], rationale: 'final aggregator for the sample' },
	],
};

test('countNodes / countPlannerTasks / maxDepth on a single-node tree', () => {
	const node = { plan: SAMPLE_PLAN, children: new Map(), childErrors: new Map() };
	assert.equal(countNodes(node), 1);
	assert.equal(countPlannerTasks(node), 0);
	assert.equal(maxDepth(node), 1);
});

test('countNodes / countPlannerTasks / maxDepth on a 3-level tree', () => {
	const grandchild = { plan: SAMPLE_PLAN, children: new Map(), childErrors: new Map() };
	const child      = { plan: SAMPLE_PLAN, children: new Map([['t02', grandchild]]), childErrors: new Map() };
	const root       = { plan: SAMPLE_PLAN, children: new Map([['t02', child]]),      childErrors: new Map() };
	assert.equal(countNodes(root), 3);
	assert.equal(maxDepth(root), 3);
});

// ---------------------------------------------------------------------------
// End-to-end recursion via a stub provider
// ---------------------------------------------------------------------------

/**
 * Stub provider that returns hand-built plans keyed by call order.
 * Each call pops the next plan off `queue`. Throws when the queue
 * is drained -- which lets the test assert "exactly N runPlanner
 * calls happened."
 */
function makeStubProvider(queue: PlanTask[]): LLMProvider {
	let i = 0;
	return {
		supportsTools: false,
		capabilities:  {
			structuredOutput: true, toolCalling: false, vision: false,
			webSearch: false, streaming: false, embeddings: false,
		},
		complete:        async () => { throw new Error('stub: complete not used'); },
		stream:          async function* () { yield ''; throw new Error('stub: stream not used'); },
		embed:           async () => [],
		completeStructured: async <T>() => {
			if (i >= queue.length) {
				throw new Error(`stub: out of queued plans at call ${i + 1}`);
			}
			return queue[i++]! as T;
		},
	};
}

const EMPTY_BUNDLE: AnalyzeContextBundle = {
	system: '', focus: '', summary: '', structure: '', surface: '',
	artefacts: '', upstream: '',
};

function rootIntent(scope: ClassifiedIntent['scope']): ClassifiedIntent {
	return {
		target:    'code',
		scope,
		focused:   false,
		scopeRef:  { kind: 'repo', value: '/r' },
		reasoning: 'recursive planner test root intent',
	};
}

function makeRootPlanWithOnePlannerTask(scope: ClassifiedIntent['scope'], childIntent: ClassifiedIntent): PlanTask {
	// Pick a count that falls within the scope's INV-13 band so the
	// validator accepts the hand-built fixture.
	const TASK_COUNT_PER_SCOPE: Record<ClassifiedIntent['scope'], number> = {
		XS: 5,
		S:  12,
		M:  25,
		L:  35,
		XL: 45,
	};
	const taskCount = TASK_COUNT_PER_SCOPE[scope];
	const tasks: PlannedTask[] = [
		{ taskId: 't01', template: 'code.discovery.modules', kind: 'leaf',
		  params: { scopeRef: { kind: 'repo', value: '/r' } },
		  produces: ['modules'], rationale: 'discover modules for the deep-dive plan' },
		{ taskId: 't02', template: 'code.subrun.deep-dive', kind: 'planner',
		  params: { childIntent }, produces: ['report'],
		  rationale: 'recursively plan the deep-dive sub-target' },
	];
	for (let i = 3; i < taskCount; i++) {
		const n = i < 10 ? `0${i}` : `${i}`;
		tasks.push({
			taskId:    `t${n}`,
			template:  'code.surface.functional',
			kind:      'leaf',
			params:    { module: `m${i}` },
			produces:  ['functional-surface'],
			rationale: `surface scan of module m${i} for downstream aggregation`,
		});
	}
	tasks.push({
		taskId:    `t${taskCount < 10 ? `0${taskCount}` : `${taskCount}`}`,
		template:  'code.aggregate.report',
		kind:      'leaf',
		params:    {},
		produces:  ['report'],
		rationale: 'aggregate per-module summaries + the deep-dive child report',
	});
	return {
		planId:    `p-${scope.toLowerCase()}`,
		goal:      `recursive test ${scope}`,
		target:    'code',
		scope,
		reasoning: `${scope}-bucket root plan with one planner-template task driving recursion`,
		tasks,
	};
}

function makeLeafOnlyPlan(scope: ClassifiedIntent['scope']): PlanTask {
	const TASK_COUNT_PER_SCOPE: Record<ClassifiedIntent['scope'], number> = {
		XS: 4,
		S:  12,
		M:  22,
		L:  35,
		XL: 45,
	};
	const taskCount = TASK_COUNT_PER_SCOPE[scope];
	const tasks: PlannedTask[] = [
		{ taskId: 't01', template: 'code.discovery.modules', kind: 'leaf',
		  params: { scopeRef: { kind: 'repo', value: '/r' } },
		  produces: ['modules'], rationale: 'discover modules in the leaf-only sub-plan' },
	];
	for (let i = 2; i < taskCount; i++) {
		const n = i < 10 ? `0${i}` : `${i}`;
		tasks.push({
			taskId:    `t${n}`,
			template:  'code.surface.functional',
			kind:      'leaf',
			params:    { module: `m${i}` },
			produces:  ['functional-surface'],
			rationale: `surface scan of module m${i} in the leaf-only sub-plan`,
		});
	}
	tasks.push({
		taskId:    `t${taskCount < 10 ? `0${taskCount}` : `${taskCount}`}`,
		template:  'code.aggregate.report',
		kind:      'leaf',
		params:    {},
		produces:  ['report'],
		rationale: 'aggregator for the leaf-only sub-plan',
	});
	return {
		planId:    `p-leaf-${scope.toLowerCase()}`,
		goal:      `leaf-only ${scope}`,
		target:    'code',
		scope,
		reasoning: `leaf-only ${scope}-bucket plan; no planner-template tasks -> recursion terminates`,
		tasks,
	};
}

// ---------------------------------------------------------------------------
// Recursion happy path: root -> child -> done
// ---------------------------------------------------------------------------

test('runRecursivePlanner: root with one planner-template task spawns a child plan; tree has 2 nodes', async () => {
	const runId = `recursive-happy-${Math.floor(Math.random() * 1e9).toString(16)}`;
	const childIntent = rootIntent('XS');
	const rootPlan  = makeRootPlanWithOnePlannerTask('S', childIntent);
	const childPlan = makeLeafOnlyPlan('XS');

	const provider = makeStubProvider([rootPlan, childPlan]);

	try {
		const tree = await runRecursivePlanner({
			input: {
				intent:        rootIntent('S'),
				contextBundle: EMPTY_BUNDLE,
				catalog:       getTemplatesForTarget('code'),
			},
			opts: { runId },
			provider,
		});

		assert.equal(countNodes(tree), 2);
		assert.equal(maxDepth(tree), 2);
		assert.equal(countPlannerTasks(tree), 1);

		// Root carries the rootPlan; t02 spawned the child.
		assert.equal(tree.plan.planId, 'p-s');
		assert.equal(tree.children.size, 1);
		const child = tree.children.get('t02');
		assert.ok(child);
		assert.equal(child!.plan.planId, 'p-leaf-xs');
		assert.equal(child!.children.size, 0);
		assert.equal(child!.childErrors.size, 0);
	} finally {
		purgePlan({ runId });
		purgePlan({ runId, parentTaskPath: 't02' });
	}
});

// ---------------------------------------------------------------------------
// Recursion terminator: planner task with no childIntent -> tracked as childError
// ---------------------------------------------------------------------------

// Defense-in-depth: "planner task missing childIntent" is caught
// by INV-5 inside runPlanner before the recursive helper sees the
// plan; the helper's `extractChildIntent === null -> childError`
// branch is unreachable in production. Unit-tested directly via
// `_extractChildIntentForTest` above.

// ---------------------------------------------------------------------------
// Depth cap: child planner task whose recursion would exceed the cap
// is tracked as childError (MaxPlanDepthExceededError).
// ---------------------------------------------------------------------------

test('runRecursivePlanner: depth-cap hit on a deeper subtree -> childError = MaxPlanDepthExceededError', async () => {
	const runId = `recursive-depth-${Math.floor(Math.random() * 1e9).toString(16)}`;

	// Root scope = XS -> cap = 2. Root currentDepth = 0. Root invocation
	// uses 0+1=1, ok. Recursing into t02's child uses 1+1=2, ok. The
	// CHILD plan ALSO has a planner-template task. Recursing into THAT
	// would use 2+1=3, exceeding XS cap=2 -> child plan build refused
	// at the depth check; the GRANDCHILD attempt fails with
	// MaxPlanDepthExceededError. The CHILD plan succeeded, so it lives
	// in the tree; its t02 entry carries the error.
	const childIntent      = rootIntent('XS');
	const grandchildIntent = rootIntent('XS');

	const rootPlan  = makeRootPlanWithOnePlannerTask('XS', childIntent);
	const childPlan = makeRootPlanWithOnePlannerTask('XS', grandchildIntent);

	const provider = makeStubProvider([rootPlan, childPlan]);

	try {
		const tree = await runRecursivePlanner({
			input: {
				intent:        rootIntent('XS'),
				contextBundle: EMPTY_BUNDLE,
				catalog:       getTemplatesForTarget('code'),
			},
			opts: { runId },
			provider,
		});

		// Root + child = 2 nodes; grandchild attempt failed.
		assert.equal(countNodes(tree), 2);
		const child = tree.children.get('t02');
		assert.ok(child);
		// Child plan also has a t02 planner-template task; its child
		// attempt hit the depth cap and is in childErrors.
		assert.equal(child!.children.size, 0);
		assert.equal(child!.childErrors.size, 1);
		const err = child!.childErrors.get('t02');
		assert.ok(err instanceof MaxPlanDepthExceededError);
		assert.equal((err as MaxPlanDepthExceededError).rootScope, 'XS');
		assert.equal((err as MaxPlanDepthExceededError).cap, 2);
	} finally {
		purgePlan({ runId });
		purgePlan({ runId, parentTaskPath: 't02' });
	}
});

// ---------------------------------------------------------------------------
// rootScope propagation: a child plan's local scope doesn't change the cap
// ---------------------------------------------------------------------------

test('runRecursivePlanner: child plans inherit rootScope for the depth cap', async () => {
	const runId = `recursive-rootscope-${Math.floor(Math.random() * 1e9).toString(16)}`;

	// Root XL (cap=6). Child plan is "S" (cap=3) locally but the
	// recursive helper carries XL as rootScope, so depth-cap math
	// stays on 6. We can recurse 5 levels deep before tripping it.
	const childIntent = rootIntent('S');
	const rootPlan    = makeRootPlanWithOnePlannerTask('XL', childIntent);
	const childPlan   = makeLeafOnlyPlan('S');

	const provider = makeStubProvider([rootPlan, childPlan]);

	try {
		const tree = await runRecursivePlanner({
			input: {
				intent:        rootIntent('XL'),
				contextBundle: EMPTY_BUNDLE,
				catalog:       getTemplatesForTarget('code'),
				// rootScope omitted -> defaults to intent.scope = XL
			},
			opts: { runId },
			provider,
		});

		// Both root + child should build; no depth-cap failure.
		assert.equal(countNodes(tree), 2);
		assert.equal(tree.childErrors.size, 0);
		assert.equal(tree.children.get('t02')!.childErrors.size, 0);
	} finally {
		purgePlan({ runId });
		purgePlan({ runId, parentTaskPath: 't02' });
	}
});
