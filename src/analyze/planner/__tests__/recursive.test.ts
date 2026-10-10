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
import { MaxPlanDepthExceededError, PlanBuilderExhausted } from '../driver.js';
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
import type { Entity, LLMProvider } from '../../../shared/types.js';
import { CANCELLED_BEFORE_MEASURE, _setMeasureDepsForTest } from '../../measure.js';

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

/**
 * A child plan's size is measured from the area its intent names. These tests
 * are about the tree and the depth cap, so a stand-in store gives each size a
 * repo that measures to it (`/r-xs` holds 1 file, `/r-s` 5, and so on), and
 * each fixture intent names the repo of its size.
 */
const FILES_PER_SIZE: Record<ClassifiedIntent['scope'], number> = { XS: 1, S: 5, M: 30, L: 300, XL: 2000 };
const repoOfSize = (scope: ClassifiedIntent['scope']): string => `/r-${scope.toLowerCase()}`;
function storedEntities(repo: string): Entity[] {
	const size = (Object.keys(FILES_PER_SIZE) as Array<ClassifiedIntent['scope']>).find(k => repoOfSize(k) === repo);
	if (size === undefined) return [];
	return Array.from({ length: FILES_PER_SIZE[size] }, (_, i) => ({ id: `${repo}#${i}`, repo, file: `${repo}/f${i}.ts`, kind: 'file', name: `f${i}.ts` }) as unknown as Entity);
}

test.before(() => {
	_resetAnalyzeConfigCacheForTests();
	_resetTemplateBootstrapLatchForTests();
	_resetTemplateRegistryForTests();
	registerBuiltinTemplates();
	_setMeasureDepsForTest({
		scope: {
			listRepos:           async () => (Object.keys(FILES_PER_SIZE) as Array<ClassifiedIntent['scope']>).map(k => ({ path: repoOfSize(k), name: k, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' as const })),
			findEntitiesByFile:  async () => [],
			listEntitiesForRepo: async repo => storedEntities(repo),
			loadConnections:     async () => ({ file: { connections: [] }, resolved: [], warnings: [] }) as never,
		},
		listEntities: async repo => storedEntities(repo),
	});
});

test.after(() => {
	_setMeasureDepsForTest(undefined);
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
		scopeRef:  { kind: 'repo', value: repoOfSize(scope) },
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

// ---------------------------------------------------------------------------
// The measured size (LLD-b9d5c5c40df5a574-s2, task t5)
// ---------------------------------------------------------------------------

/** A plan as the model returned it, with the size the model wrote in it. */
const statingSize = (plan: PlanTask, scope: ClassifiedIntent['scope']): PlanTask => ({ ...plan, scope });

test("a plan's task band and its depth cap both follow the measured size, and a child plan is measured from the area it names when it is spawned, with the planner model's figure kept as the hint (mutation: keep the model's figure as the child's size)", async () => {
	const ids: string[] = [];
	const runId = (tag: string): string => { const id = `recursive-measure-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`; ids.push(id); return id; };
	const build = (id: string, intent: ClassifiedIntent, queue: PlanTask[]) => runRecursivePlanner({
		input: { intent, contextBundle: EMPTY_BUNDLE, catalog: getTemplatesForTarget('code') },
		opts: { runId: id },
		provider: makeStubProvider(queue),
	});
	try {
		// --- The band is the intent's size, whatever size the model writes in its plan. ---
		// The intent is S (10 to 20 tasks). A plan of 12 tasks is accepted though the model wrote "XL" in it, and the
		// plan that is kept states the intent's size.
		const accepted = await build(runId('band'), rootIntent('S'), [statingSize(makeLeafOnlyPlan('S'), 'XL')]);
		assert.equal(accepted.plan.tasks.length, 12);
		assert.equal(accepted.plan.scope, 'S', "the plan's size is the intent's, not the model's");
		// A plan of 4 tasks, in which the model wrote "XS" (whose band would accept it), is refused for the intent's S.
		const four = statingSize(makeLeafOnlyPlan('XS'), 'XS');
		await assert.rejects(build(runId('band-refused'), rootIntent('S'), [four, four, four]), (err: Error) => {
			assert.ok(err instanceof PlanBuilderExhausted, err.message);
			assert.equal(err.lastFailure.invariantId, 'INV-13');
			assert.match(err.lastFailure.message, /task count 4 is outside the scope band for S/);
			return true;
		});

		// --- A child plan is measured from the area it names; the model's figure is the hint. ---
		// The root is M. Its planner task names the repo of one file and the model wrote "L" for it. The child is
		// measured XS, so its plan of 4 tasks is accepted: for the model's L (30 to 60 tasks) it would be refused.
		const childIntent: ClassifiedIntent = { ...rootIntent('XS'), scope: 'L' };
		const tree = await build(runId('child'), rootIntent('M'), [makeRootPlanWithOnePlannerTask('M', childIntent), statingSize(makeLeafOnlyPlan('XS'), 'L')]);
		assert.equal(tree.childErrors.size, 0, [...tree.childErrors.values()].map(e => e.message).join('; '));
		const child = tree.children.get('t02');
		assert.ok(child !== undefined);
		assert.deepEqual(child.measure, { source: 'named-area', items: 1, files: 1, characters: null, size: 'XS', determined: true, sizeHint: 'L' });
		assert.equal(child.plan.scope, 'XS');
		assert.equal(child.plan.tasks.length, 4);
		// The root's own measure is the run's: the tree does not hold one for it.
		assert.equal(tree.measure, undefined);

		// The model's figure is never the fallback. The child names a path the index does not hold and the model wrote
		// "XS" for it: the size is the largest, so only a plan in the band of XL (40 to 80 tasks) is accepted.
		const unknownArea: ClassifiedIntent = { ...rootIntent('XS'), scope: 'XS', scopeRef: { kind: 'repo', value: '/nowhere' } };
		const fallback = await build(runId('fallback'), rootIntent('M'), [makeRootPlanWithOnePlannerTask('M', unknownArea), statingSize(makeLeafOnlyPlan('XL'), 'XS')]);
		assert.equal(fallback.childErrors.size, 0, [...fallback.childErrors.values()].map(e => e.message).join('; '));
		const unmeasured = fallback.children.get('t02')!;
		assert.deepEqual([unmeasured.measure?.size, unmeasured.measure?.determined, unmeasured.measure?.sizeHint, unmeasured.measure?.items], ['XL', false, 'XS', 0]);
		assert.ok(unmeasured.measure!.note!.includes('/nowhere'), unmeasured.measure!.note);
		assert.equal(unmeasured.plan.scope, 'XL');
		assert.equal(unmeasured.plan.tasks.length, 45);

		// --- The depth cap is the root's measured size, at every level, whatever the children measure. ---
		// The root is XS (two levels). Its child names the largest repo and is measured XL, whose own cap would be
		// six; the child's planner task is still refused at the third level, for the root's XS.
		const large: ClassifiedIntent = rootIntent('XL');
		const deep = await build(runId('depth'), rootIntent('XS'), [
			makeRootPlanWithOnePlannerTask('XS', large),
			makeRootPlanWithOnePlannerTask('XL', rootIntent('XS')),
		]);
		const level2 = deep.children.get('t02')!;
		assert.equal(level2.measure?.size, 'XL');
		assert.equal(level2.plan.tasks.length, 45, "the child's band is its own measured size");
		const refused = level2.childErrors.get('t02');
		assert.ok(refused instanceof MaxPlanDepthExceededError, String(refused));
		assert.deepEqual([refused.rootScope, refused.cap, refused.currentDepth], ['XS', 2, 2]);
		// The same tree under a root measured XL goes one level further.
		const deeper = await build(runId('depth-xl'), rootIntent('XL'), [
			makeRootPlanWithOnePlannerTask('XL', large),
			makeRootPlanWithOnePlannerTask('XL', rootIntent('XS')),
			makeLeafOnlyPlan('XS'),
		]);
		assert.equal(deeper.children.get('t02')!.childErrors.size, 0);
		assert.equal(deeper.children.get('t02')!.children.get('t02')!.measure?.size, 'XS');
	} finally {
		for (const id of ids) {
			purgePlan({ runId: id });
			purgePlan({ runId: id, parentTaskPath: 't02' });
			purgePlan({ runId: id, parentTaskPath: 't02.t02' });
		}
	}
});

test("the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan", async () => {
	const ids: string[] = [];
	const runId = (tag: string): string => { const id = `recursive-signal-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`; ids.push(id); return id; };
	// The child names the repo of one file: measured, it is XS.
	const childIntent: ClassifiedIntent = { ...rootIntent('XS'), scope: 'XS' };
	const build = (id: string, signal: AbortSignal | undefined, childPlan: PlanTask) => runRecursivePlanner({
		input: { intent: rootIntent('M'), contextBundle: EMPTY_BUNDLE, catalog: getTemplatesForTarget('code') },
		opts: { runId: id, ...(signal !== undefined ? { signal } : {}) },
		provider: makeStubProvider([makeRootPlanWithOnePlannerTask('M', childIntent), childPlan]),
	});
	try {
		// A signal that has fired reaches the child's measure: it reads nothing and says the request was cancelled,
		// so the child is the largest size and only a plan in that band is accepted for it.
		const gone = new AbortController();
		gone.abort();
		const cancelled = await build(runId('aborted'), gone.signal, statingSize(makeLeafOnlyPlan('XL'), 'XS'));
		assert.equal(cancelled.childErrors.size, 0, [...cancelled.childErrors.values()].map(e => e.message).join('; '));
		const child = cancelled.children.get('t02')!;
		assert.deepEqual([child.measure?.determined, child.measure?.size, child.measure?.note], [false, 'XL', CANCELLED_BEFORE_MEASURE]);
		// A signal that has not fired, and no signal: the child is measured from the area it names.
		for (const signal of [new AbortController().signal, undefined]) {
			const tree = await build(runId('live'), signal, statingSize(makeLeafOnlyPlan('XS'), 'XS'));
			assert.equal(tree.childErrors.size, 0, [...tree.childErrors.values()].map(e => e.message).join('; '));
			assert.deepEqual([tree.children.get('t02')!.measure?.determined, tree.children.get('t02')!.measure?.size], [true, 'XS']);
		}
	} finally {
		for (const id of ids) {
			purgePlan({ runId: id });
			purgePlan({ runId: id, parentTaskPath: 't02' });
		}
	}
});
