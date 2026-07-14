/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Recursive Plan-tree builder.
 *
 * Drives a single root plan + every planner-template task's child
 * plan, recursively. Returns the full Plan tree as a PlanTreeNode
 * (root + descendants), keyed by taskId.
 *
 * The executor (which actually runs leaf tasks + materialises
 * outputs) is a separate concern; this module only plans. Leaf
 * task execution lands in a follow-up phase with per-template
 * runtimes.
 *
 * Recursion stops at:
 *   - planner-template tasks whose child Plan Builder invocation
 *     hits MaxPlanDepthExceededError (the depth cap already
 *     enforced by runPlanner). The parent task is preserved in
 *     the tree but its `children` entry carries the typed error
 *     so the caller can surface it as `dependency-unavailable`.
 *   - planner-template tasks whose child plan fails for any other
 *     reason (PlanBuilderExhausted, etc). Same handling -- error
 *     is attached, recursion stops on that subtree.
 *
 * The persistence layer (cache.ts) already supports the nested
 * layout (tasks/<parentTaskPath>/plan.json + nested
 * tasks/<...>/tasks/<...>/plan.json). Every child plan is written
 * to disk by runPlanner as a side effect, regardless of recursion
 * success or failure.
 *
 * See: design/analyze-plan-builder.md "XL -> planner-template tasks"
 */

import { getLogger } from '../../shared/logger.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';

import { MaxPlanDepthExceededError, runPlanner } from './driver.js';
import { getTemplatesForTarget } from './templates/registry.js';
import type {
	PlanBuilderInput,
	PlanBuilderOpts,
	PlanTask,
	PlannedTask,
} from './types.js';

const log = getLogger('analyze:planner:recursive');

// ---------------------------------------------------------------------------
// Tree shape
// ---------------------------------------------------------------------------

export interface PlanTreeNode {
	readonly plan: PlanTask;
	/** taskId (within this plan) -> child node spawned by that planner-template task. */
	readonly children: ReadonlyMap<string, PlanTreeNode>;
	/**
	 * Planner-template tasks whose child build failed (max-plan-depth
	 * exceeded, planner exhausted, etc.). Mapped taskId -> typed
	 * error. Downstream executors see these as
	 * `dependency-unavailable`.
	 */
	readonly childErrors: ReadonlyMap<string, Error>;
}

// ---------------------------------------------------------------------------
// runRecursivePlanner
// ---------------------------------------------------------------------------

export interface RecursivePlannerArgs {
	readonly input: PlanBuilderInput;
	readonly opts:  PlanBuilderOpts;
	/**
	 * Optional provider passthrough (mainly for tests). Reused for
	 * every recursive invocation -- the same model handles the
	 * whole Plan tree.
	 */
	readonly provider?: PlanBuilderArgs['provider'];
}

// Re-import the driver's RunPlannerArgs.provider shape.
type PlanBuilderArgs = Parameters<typeof runPlanner>[0];

/**
 * Drive a root plan + every planner-template task's child plan.
 *
 * Each recursive level inherits the root's scope (via `rootScope`)
 * so the depth cap remains keyed on the original Run's scope per
 * the design. `currentDepth` increments by 1 per level; the depth
 * cap fires inside runPlanner before any LLM call.
 */
export async function runRecursivePlanner(args: RecursivePlannerArgs): Promise<PlanTreeNode> {
	const { input, opts } = args;
	const rootScope = input.rootScope ?? input.intent.scope;

	// Force rootScope to flow through every level.
	const rootInput: PlanBuilderInput = { ...input, rootScope };

	return walk(rootInput, opts, args.provider, rootScope);
}

async function walk(
	input:     PlanBuilderInput,
	opts:      PlanBuilderOpts,
	provider:  PlanBuilderArgs['provider'],
	rootScope: 'XS' | 'S' | 'M' | 'L' | 'XL',
): Promise<PlanTreeNode> {
	const planArgs: PlanBuilderArgs = provider !== undefined
		? { input, opts, provider }
		: { input, opts };
	const plan = await runPlanner(planArgs);

	const children:    Map<string, PlanTreeNode> = new Map();
	const childErrors: Map<string, Error>        = new Map();

	for (const task of plan.tasks) {
		if (task.kind !== 'planner') continue;

		const childIntent = extractChildIntent(task);
		if (childIntent === null) {
			// Schema/INV-5 should have caught this earlier; defensive.
			childErrors.set(task.taskId, new Error(
				`planner-template task ${task.taskId} (${task.template}) ` +
					'has no params.childIntent -- cannot recurse',
			));
			continue;
		}

		const parentTaskPath = buildParentTaskPath(input.parentTaskPath, task.taskId);
		const childInput: PlanBuilderInput = {
			intent:        childIntent,
			contextBundle: input.contextBundle,
			catalog:       getTemplatesForTarget(childIntent.target),
			parentTaskPath,
			currentDepth:  (input.currentDepth ?? 0) + 1,
			rootScope,
		};

		try {
			const childNode = await walk(childInput, opts, provider, rootScope);
			children.set(task.taskId, childNode);
		} catch (err) {
			if (err instanceof MaxPlanDepthExceededError) {
				log.info(
					{
						runId:        opts.runId,
						taskId:       task.taskId,
						currentDepth: err.currentDepth,
						cap:          err.cap,
					},
					'recursive planner: depth cap hit on planner-template subtree',
				);
			} else {
				log.warn(
					{
						runId:  opts.runId,
						taskId: task.taskId,
						err:    (err as Error).message,
					},
					'recursive planner: child plan build failed',
				);
			}
			childErrors.set(task.taskId, err as Error);
		}
	}

	return { plan, children, childErrors };
}

/**
 * Extract a ClassifiedIntent from a planner-template task's params.
 * Convention: every planner-kind template's inputSchema requires a
 * `childIntent` field carrying a fully-formed ClassifiedIntent
 * (target/scope/focused/scopeRef/reasoning + optional focus).
 *
 * Returns null when the convention isn't followed. INV-5 should have
 * already rejected such tasks; this is defense-in-depth.
 */
function extractChildIntent(task: PlannedTask): ClassifiedIntent | null {
	const ci = (task.params as Record<string, unknown>)['childIntent'];
	if (ci === null || typeof ci !== 'object') return null;
	const obj = ci as Record<string, unknown>;
	if (
		typeof obj['target']    !== 'string' ||
		typeof obj['scope']     !== 'string' ||
		typeof obj['focused']   !== 'boolean' ||
		typeof obj['reasoning'] !== 'string' ||
		typeof obj['scopeRef']  !== 'object' || obj['scopeRef'] === null
	) {
		return null;
	}
	// Cast through unknown -- the runtime check above guarantees the
	// required fields; the Ajv schema on code.subrun.deep-dive
	// validated the enum values + scopeRef sub-shape.
	return obj as unknown as ClassifiedIntent;
}

/**
 * Compose the new parentTaskPath when recursing into a planner-template
 * task. For the root plan walk, parent is undefined -> the child's
 * parentTaskPath is just the task's id. For deeper walks, append.
 */
function buildParentTaskPath(parent: string | undefined, taskId: string): string {
	return parent === undefined || parent.length === 0
		? taskId
		: `${parent}.${taskId}`;
}

// ---------------------------------------------------------------------------
// Tree-walking helpers (for callers that want to count nodes / list
// planner-template taskIds without re-implementing the walk).
// ---------------------------------------------------------------------------

/** Total node count in the tree (root + every descendant). */
export function countNodes(node: PlanTreeNode): number {
	let n = 1;
	for (const child of node.children.values()) {
		n += countNodes(child);
	}
	return n;
}

/** Total planner-template task count across the tree (incl errors). */
export function countPlannerTasks(node: PlanTreeNode): number {
	let n = 0;
	for (const t of node.plan.tasks) {
		if (t.kind === 'planner') n++;
	}
	for (const child of node.children.values()) {
		n += countPlannerTasks(child);
	}
	return n;
}

/** Maximum depth in the tree (root = 1). */
export function maxDepth(node: PlanTreeNode): number {
	let max = 1;
	for (const child of node.children.values()) {
		const d = 1 + maxDepth(child);
		if (d > max) max = d;
	}
	return max;
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _extractChildIntentForTest = extractChildIntent;
export const _buildParentTaskPathForTest = buildParentTaskPath;
