/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plan executor.
 *
 * Walks a PlanTreeNode (output of runRecursivePlanner) and runs every
 * leaf task against its registered runtime; descends into child plans
 * for planner-template tasks. Per-task persistence + upstream-output
 * injection + dependency-unavailable propagation handled here.
 *
 * Algorithm (per Plan):
 *
 *   outputs : Map<producesName, value>   // accumulated across this plan
 *   failed  : Set<taskId>                // for downstream cascade
 *
 *   for task in plan.tasks (serial order, INV-11 guarantees topo sort):
 *     1. Check `consumes` -- every name must be in `outputs`. If any
 *        consumed name's producer is in `failed`, this task is
 *        skipped with status='skipped-dependency-unavailable'.
 *     2. If kind='planner': look up the child plan in tree.children
 *        by taskId. Recurse into it via this same walk. The child's
 *        aggregator output (its terminal task's `report`) becomes
 *        this task's `report` produces.
 *     3. If kind='leaf': look up the registered TemplateRuntime,
 *        call execute({task, intent, upstreamOutputs, runId}).
 *        Validate the returned outputs cover exactly the template's
 *        produces (ExecutorOutputShapeError if not).
 *     4. Persist the task record to <runRoot>/tasks/<taskId>.json.
 *     5. Merge the task's outputs into `outputs`.
 *     6. If the aggregator (last task) succeeded, its `report` is
 *        the plan's finalReport.
 *
 * See: design/analyze-framework.md "Flow / Task list -- iterate"
 *      design/analyze-plan-builder.md "Failure surface"
 */

import { isCompletenessRecord } from '../completeness.js';
import { scopeErrorMapping, type ScopeErrorCode } from '../context/invariants.js';
import { getLogger } from '../../shared/logger.js';

import { writeTaskOutput } from './cache.js';
import { getRuntime } from './registry.js';
import {
	ExecutorOutputShapeError,
	ExecutorRuntimeMissingError,
	type ClassifiedIntent,
	type ExecutorResult,
	type FailedTask,
	type PlanExecutionResult,
	type PlannedTask,
	type PlanTreeNode,
	type RunExecutorArgs,
	type TaskExecutionEvent,
	type TaskExecutionRecord,
	type TemplateExecuteResult,
} from './types.js';
import { taskPath } from './plan-sources.js';

const log = getLogger('analyze:executor:walker');

interface WalkOpts {
	readonly onTaskEvent?:    ((event: TaskExecutionEvent) => void) | undefined;
	readonly parentTaskPath?: string | undefined;
}

// ---------------------------------------------------------------------------
// runExecutor -- public entry point
// ---------------------------------------------------------------------------

export async function runExecutor(args: RunExecutorArgs): Promise<ExecutorResult> {
	return executePlan(args.tree, args.intent, args.runId, {
		onTaskEvent: args.onTaskEvent,
	});
}

/**
 * Execute a single plan (one PlanTreeNode's tasks[]). Returns the
 * full ExecutorResult including any child plans dispatched by
 * planner-template tasks.
 *
 * SINGLE-PASS: child plans execute exactly once, via the
 * planner-template task's dispatch -> recursive executePlan call.
 * The prior implementation walked node.children a second time at
 * the top level (executePlanNode loop), which double-executed
 * every child plan. That second pass is removed; child results
 * bubble up through executePlannerTask's return value instead.
 *
 * Per-task events (S2): for every task in plan.tasks[], emits a
 * task-started before dispatch + a task-completed after the
 * record is finalised. For planner-template tasks, the child
 * plan's events fire BETWEEN the parent's started + completed
 * events. `parentTaskPath` accumulates as we recurse.
 */
async function executePlan(
	node:   PlanTreeNode,
	intent: ClassifiedIntent,
	runId:  string,
	opts:   WalkOpts,
): Promise<ExecutorResult> {
	const outputs     = new Map<string, unknown>();
	const failed      = new Set<string>();
	const perTask     = new Map<string, TaskExecutionRecord>();
	const tasksFailed: FailedTask[] = [];
	const children    = new Map<string, ExecutorResult>();
	let   tasksCompleted = 0;
	let   finalReport: unknown = undefined;

	// The aggregator is the last task: plan validation guarantees it (INV-12).
	// collectPlanSources finds it by the same rule.
	const aggregatorIndex = node.plan.tasks.length - 1;
	const total = node.plan.tasks.length;
	const parentTaskPath = opts.parentTaskPath;

	for (let i = 0; i < total; i++) {
		const task = node.plan.tasks[i]!;
		const isAggregator = i === aggregatorIndex;
		const index = i + 1;

		// Emit task-started BEFORE the dependency check / dispatch.
		// Even skipped tasks emit a started/completed pair so the IDE
		// can render every plan slot uniformly.
		emit(opts, {
			type:     'task-started',
			taskId:   task.taskId,
			template: task.template,
			index,
			total,
			...(parentTaskPath !== undefined ? { parentTaskPath } : {}),
		});

		// Step 1: dependency check
		const unmet = unmetDependencies(task, outputs, failed);
		if (unmet !== null) {
			const record: TaskExecutionRecord = {
				taskId:      task.taskId,
				template:    task.template,
				kind:        task.kind,
				produces:    [...task.produces],
				status:      'skipped-dependency-unavailable',
				error:       `dependency-unavailable: ${unmet}`,
				completedAt: nowIso(),
			};
			writeTaskOutput(runId, record);
			perTask.set(task.taskId, record);
			failed.add(task.taskId);
			tasksFailed.push({ taskId: task.taskId, reason: record.error! });
			log.info({ runId, taskId: task.taskId, reason: unmet }, 'task skipped (dependency-unavailable)');

			emit(opts, {
				type:   'task-completed',
				taskId: task.taskId,
				status: 'skipped-dependency-unavailable',
				...(parentTaskPath !== undefined ? { parentTaskPath } : {}),
			});
			continue;
		}

		// Step 2 + 3: dispatch
		let result: TaskExecutionRecord;
		if (task.kind === 'planner') {
			const childOpts: WalkOpts = {
				onTaskEvent:    opts.onTaskEvent,
				parentTaskPath: appendTaskPath(parentTaskPath, task.taskId),
			};
			const planRes = await executePlannerTask(task, node, intent, runId, childOpts);
			result = planRes.record;
			if (planRes.childResult !== undefined) {
				children.set(task.taskId, planRes.childResult);
			}
		} else {
			result = await executeLeafTask(task, intent, runId, outputs);
		}

		// Step 4 + 5: persist + accumulate
		writeTaskOutput(runId, result);
		perTask.set(task.taskId, result);

		if (result.status === 'ok') {
			tasksCompleted++;
			if (result.outputs !== undefined) {
				for (const [name, value] of Object.entries(result.outputs)) {
					outputs.set(name, value);
				}
			}
			if (isAggregator) {
				finalReport = result.outputs?.['report'];
			}
		} else {
			failed.add(task.taskId);
			tasksFailed.push({ taskId: task.taskId, reason: result.error ?? 'unknown', ...(result.code !== undefined ? { code: result.code } : {}) });
		}

		emit(opts, {
			type:   'task-completed',
			taskId: task.taskId,
			status: result.status,
			...(parentTaskPath !== undefined ? { parentTaskPath } : {}),
		});
	}

	const root: PlanExecutionResult = {
		perTask,
		...(finalReport !== undefined ? { finalReport } : {}),
		tasksCompleted,
		tasksFailed,
	};
	return { root, children };
}

// ---------------------------------------------------------------------------
// Per-task execution
// ---------------------------------------------------------------------------

async function executeLeafTask(
	task:    PlannedTask,
	intent:  ClassifiedIntent,
	runId:   string,
	outputs: ReadonlyMap<string, unknown>,
): Promise<TaskExecutionRecord> {
	const runtime = getRuntime(task.template);
	if (runtime === undefined) {
		const err = new ExecutorRuntimeMissingError(task.template);
		log.error({ runId, taskId: task.taskId, template: task.template }, err.message);
		return failedRecord(task, err.message);
	}

	const upstreamOutputs = projectUpstream(task, outputs);

	let result: TemplateExecuteResult;
	try {
		result = await runtime.execute({ task, intent, upstreamOutputs, runId });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		// A refused scope is a failure the caller can act on: it keeps the scope
		// error's code and its own message, with no 'runtime-threw:' in front.
		const scoped = scopeErrorMapping(err);
		if (scoped !== undefined) {
			log.warn({ runId, taskId: task.taskId, code: scoped.code, err: msg }, 'leaf task refused its scope');
			return failedRecord(task, scoped.message, scoped.code);
		}
		log.warn({ runId, taskId: task.taskId, err: msg }, 'leaf task runtime threw');
		return failedRecord(task, `runtime-threw: ${msg}`);
	}

	// Output shape check: every produces name must be present; no extras.
	const shapeError = checkOutputShape(task, result);
	if (shapeError !== null) {
		log.warn({ runId, taskId: task.taskId, err: shapeError.message }, 'leaf task output shape mismatch');
		return failedRecord(task, `output-shape-mismatch: ${shapeError.message}`);
	}

	// Every result states its own completeness. A runtime that returns none
	// cannot be counted as complete by default: the task is recorded as failed.
	const completeness = (result as { completeness?: unknown }).completeness;
	if (!isCompletenessRecord(completeness)) {
		const reason = 'no-completeness-record: the runtime returned a result that does not state its completeness';
		log.warn({ runId, taskId: task.taskId, template: task.template }, reason);
		return failedRecord(task, reason);
	}

	const outputsObj: Record<string, unknown> = {};
	for (const [k, v] of result.outputs.entries()) {
		outputsObj[k] = v;
	}

	return {
		taskId:      task.taskId,
		template:    task.template,
		kind:        task.kind,
		produces:    [...task.produces],
		status:      'ok',
		outputs:     outputsObj,
		completedAt: nowIso(),
		completeness,
	};
}

interface PlannerTaskResult {
	readonly record:       TaskExecutionRecord;
	readonly childResult?: ExecutorResult;
}

async function executePlannerTask(
	task:   PlannedTask,
	parent: PlanTreeNode,
	intent: ClassifiedIntent,
	runId:  string,
	opts:   WalkOpts,
): Promise<PlannerTaskResult> {
	// Look up the child plan in the tree.
	const childNode = parent.children.get(task.taskId);
	if (childNode === undefined) {
		const childErr = parent.childErrors.get(task.taskId);
		const reason   = childErr !== undefined
			? `child-plan-unavailable: ${childErr.message}`
			: 'child-plan-unavailable: tree has no child for this planner task';
		log.warn({ runId, taskId: task.taskId }, reason);
		return { record: failedRecord(task, reason) };
	}

	// Recursively execute the child plan. Threads opts through so the
	// child's per-task events fire with parentTaskPath populated.
	const childResult = await executePlan(childNode, intent, runId, opts);

	if (childResult.root.finalReport === undefined) {
		const reason = 'child-plan-unavailable: child aggregator produced no report';
		log.warn({ runId, taskId: task.taskId }, reason);
		return { record: failedRecord(task, reason), childResult };
	}

	// Planner-template tasks always produce ['report'] (INV-6 +
	// template registration check). Materialize the child's report
	// under the parent's produces name.
	const record: TaskExecutionRecord = {
		taskId:      task.taskId,
		template:    task.template,
		kind:        task.kind,
		produces:    [...task.produces],
		status:      'ok',
		outputs:     { [task.produces[0]!]: childResult.root.finalReport },
		completedAt: nowIso(),
	};
	return { record, childResult };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns null when every consumed name is in outputs and no
 * dependency is in `failed`. Returns the FIRST unmet consume name
 * otherwise (so the cascade message is single-actionable).
 */
function unmetDependencies(
	task:    PlannedTask,
	outputs: ReadonlyMap<string, unknown>,
	failed:  ReadonlySet<string>,
): string | null {
	for (const name of task.consumes ?? []) {
		if (!outputs.has(name)) {
			// Either the producer never ran, or the producer task failed.
			// We don't know which; just say the name is unavailable.
			return name;
		}
	}
	// The above is sufficient given INV-11 (topological order): if a
	// producer earlier in the list failed, its outputs aren't in the
	// map. We don't need to walk `failed` explicitly.
	void failed;
	return null;
}

/**
 * Pull just the upstream names this task `consumes` out of the
 * full outputs map. Aggregator tasks (with `consumes` listing
 * everything they need) get the projected subset; the runtime
 * decides how to stitch.
 */
function projectUpstream(
	task:    PlannedTask,
	outputs: ReadonlyMap<string, unknown>,
): ReadonlyMap<string, unknown> {
	const out = new Map<string, unknown>();
	for (const name of task.consumes ?? []) {
		if (outputs.has(name)) {
			out.set(name, outputs.get(name));
		}
	}
	return out;
}

function checkOutputShape(
	task:   PlannedTask,
	result: TemplateExecuteResult,
): ExecutorOutputShapeError | null {
	const expected = new Set(task.produces);
	const got      = new Set(result.outputs.keys());

	const missing: string[] = [];
	for (const name of expected) {
		if (!got.has(name)) missing.push(name);
	}
	const extra: string[] = [];
	for (const name of got) {
		if (!expected.has(name)) extra.push(name);
	}

	if (missing.length === 0 && extra.length === 0) return null;
	return new ExecutorOutputShapeError(task.template, task.taskId, missing, extra);
}

function failedRecord(task: PlannedTask, error: string, code?: ScopeErrorCode): TaskExecutionRecord {
	return {
		taskId:      task.taskId,
		template:    task.template,
		kind:        task.kind,
		produces:    [...task.produces],
		status:      'failed',
		error,
		...(code !== undefined ? { code } : {}),
		completedAt: nowIso(),
	};
}

/**
 * Returns the current time as an ISO string -- intentionally NOT
 * calling Date.now()/new Date() directly so this stays mockable in
 * the rare case a test wants to pin timestamps.
 */
function nowIso(): string {
	return new Date().toISOString();
}

/**
 * Invoke the optional task-event subscriber, catching exceptions so
 * a broken subscriber can't crash the walker. Mirrors the
 * orchestrator's emit() helper.
 */
function emit(opts: WalkOpts, event: TaskExecutionEvent): void {
	if (opts.onTaskEvent === undefined) return;
	try { opts.onTaskEvent(event); }
	catch (err) {
		log.warn(
			{ eventType: event.type, err: (err as Error).message },
			'executor: onTaskEvent subscriber threw; ignoring',
		);
	}
}

/**
 * Compose nested taskPaths for recursive plan execution.
 * Root plan tasks get parentTaskPath=undefined; the first
 * planner-template task at level 1 sets it to its own taskId;
 * further nested levels join with '.'.
 */
/** One rule for a task's path, shared with the answer report's sources. */
const appendTaskPath = taskPath;

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _unmetDependenciesForTest = unmetDependencies;
export const _projectUpstreamForTest   = projectUpstream;
export const _checkOutputShapeForTest  = checkOutputShape;
