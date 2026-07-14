/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Executor types -- the contract between the task walker (this
 * module's `runExecutor`) and per-template runtimes (registered via
 * `registerTemplateRuntime`).
 *
 * The executor:
 *   - walks a PlanTask's tasks[] in serial order
 *   - for each leaf task: looks up the registered runtime, calls it
 *     with the task's params + materialized upstream outputs, persists
 *     the result to <runRoot>/tasks/<taskId>.json
 *   - for each planner-template task: descends into the matching
 *     PlanTreeNode child, executes recursively; the child's
 *     aggregator output becomes the parent task's `report` output
 *   - propagates failures as `dependency-unavailable` -- downstream
 *     tasks that consumed a failed producer's output also fail, but
 *     unrelated tasks continue
 *
 * See: design/analyze-framework.md "Flow / Task list -- iterate"
 *      design/analyze-plan-builder.md "Failure surface"
 */

import type {
	ClassifiedIntent,
	PlanTask,
	PlannedTask,
} from '../../shared/analyze-types.js';
import type { PlanTreeNode } from '../planner/recursive.js';

// ---------------------------------------------------------------------------
// Per-template runtime contract
// ---------------------------------------------------------------------------

/**
 * Arguments handed to a template runtime's execute() call.
 *
 * `upstreamOutputs` is a Map from produces-name to materialized
 * value. Names come from the task's declared `consumes` array; the
 * executor injects only the names this specific task consumes (NOT
 * the full upstream output set).
 *
 * For aggregator tasks (which typically consume every prior task's
 * produces), the executor passes the union of every preceding
 * task's outputs since the aggregator's `consumes` is by convention
 * "*" or the explicit per-task names. Aggregators decide how to
 * stitch.
 */
export interface TemplateExecuteArgs {
	readonly task:            PlannedTask;
	readonly intent:          ClassifiedIntent;
	readonly upstreamOutputs: ReadonlyMap<string, unknown>;
	readonly runId:           string;
}

export interface TemplateExecuteResult {
	/** Map of produces-name -> output value. Must cover every name in template.produces. */
	readonly outputs: ReadonlyMap<string, unknown>;
}

/**
 * A registered runtime for a single template id. Stateless --
 * registered once at boot, called per-task-instance.
 */
export interface TemplateRuntime {
	readonly templateId: string;
	execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult>;
}

// ---------------------------------------------------------------------------
// Executor public surface
// ---------------------------------------------------------------------------

export interface RunExecutorArgs {
	readonly tree:   PlanTreeNode;
	readonly intent: ClassifiedIntent;
	readonly runId:  string;
	/**
	 * Optional per-task progress callback. Fires synchronously at the
	 * start + completion of every task across the whole recursive plan
	 * tree, including tasks inside child plans dispatched by
	 * planner-template tasks (parentTaskPath set in that case).
	 *
	 * Subscriber exceptions are caught + logged at the walker layer;
	 * a broken subscriber cannot crash the executor.
	 */
	readonly onTaskEvent?: (event: TaskExecutionEvent) => void;
}

/**
 * Per-task event the executor walker emits. The orchestrator wraps
 * these as AnalyzeRunEvent { task-started | task-completed } so the
 * daemon's streaming RPC layer can forward them to IDE widgets.
 *
 * Ordering invariants:
 *   - For each task, `task-started` fires BEFORE `task-completed`.
 *   - Events within a single plan come in plan.tasks[] order.
 *   - When a planner-template task at the parent level recurses into
 *     its child plan, the child plan's events fire BETWEEN the
 *     parent task's `task-started` and `task-completed`.
 *   - `parentTaskPath` is undefined for the root plan's tasks;
 *     set to the dotted path (e.g. "t02" or "t02.t05") for tasks
 *     inside child plans -- so consumers can render nested
 *     progress.
 *   - `index` is 1-based; `total` is the local plan's task count.
 */
export type TaskExecutionEvent =
	| {
		readonly type:            'task-started';
		readonly taskId:          string;
		readonly template:        string;
		readonly index:           number;
		readonly total:           number;
		readonly parentTaskPath?: string;
	}
	| {
		readonly type:            'task-completed';
		readonly taskId:          string;
		readonly status:          'ok' | 'failed' | 'skipped-dependency-unavailable';
		readonly parentTaskPath?: string;
	};

/** Result of walking a single Plan (the root or any child). */
export interface PlanExecutionResult {
	/** Per-task status keyed by taskId. */
	readonly perTask:        ReadonlyMap<string, TaskExecutionRecord>;
	/** The aggregator task's `report` output (or undefined if aggregator failed). */
	readonly finalReport?:   unknown;
	/** Total tasks that completed without error. */
	readonly tasksCompleted: number;
	/** Tasks that failed (template runtime threw, upstream unavailable, etc.). */
	readonly tasksFailed:    ReadonlyArray<{ taskId: string; reason: string }>;
}

export interface TaskExecutionRecord {
	readonly taskId:       string;
	readonly template:     string;
	readonly kind:         'leaf' | 'planner';
	readonly produces:     readonly string[];
	readonly status:       'ok' | 'failed' | 'skipped-dependency-unavailable';
	readonly outputs?:     Readonly<Record<string, unknown>>;
	readonly error?:       string;
	readonly completedAt?: string;
}

/** Top-level result: root plan execution + every recursive subtree's. */
export interface ExecutorResult {
	readonly root:         PlanExecutionResult;
	readonly children:     ReadonlyMap<string, ExecutorResult>;
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class ExecutorRuntimeMissingError extends Error {
	readonly templateId: string;

	constructor(templateId: string) {
		super(
			`No runtime registered for template '${templateId}'. ` +
				`Register one via registerTemplateRuntime() before running an executor pass.`,
		);
		this.name = 'ExecutorRuntimeMissingError';
		this.templateId = templateId;
	}
}

export class ExecutorOutputShapeError extends Error {
	readonly templateId: string;
	readonly taskId:     string;
	readonly missing:    readonly string[];
	readonly extra:      readonly string[];

	constructor(
		templateId: string,
		taskId:     string,
		missing:    readonly string[],
		extra:      readonly string[],
	) {
		super(
			`Template '${templateId}' runtime returned wrong outputs for task ${taskId}. ` +
				`Missing: ${missing.join(', ') || '(none)'}. ` +
				`Extra: ${extra.join(', ') || '(none)'}.`,
		);
		this.name = 'ExecutorOutputShapeError';
		this.templateId = templateId;
		this.taskId = taskId;
		this.missing = missing;
		this.extra = extra;
	}
}

export type ExecutorErrorCode =
	| 'runtime-missing'
	| 'runtime-threw'
	| 'output-shape-mismatch'
	| 'dependency-unavailable'
	| 'child-plan-unavailable'
	| 'internal-error';

/** Re-export PlanTask for consumers. */
export type { PlanTask, PlannedTask, ClassifiedIntent, PlanTreeNode };
