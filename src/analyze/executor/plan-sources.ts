/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The sources of a plan tree's answer report.
 *
 * The report of a run is derived from what each task that looked something
 * up says about its own completeness. Two kinds of task are not such a
 * source:
 *
 *   - A planner-kind task has no runtime and no findings of its own. Its
 *     child plan's tasks stand in for it, each named by its path (the parent
 *     task id, then the child task id). A planner-kind task that failed has
 *     no child report: it is one failed source.
 *   - An aggregate-report task (the last task of every plan) writes a summary
 *     from the other tasks' results. It is left out, so it can neither hide
 *     an incomplete task nor be counted as one.
 *
 * A task that failed, or that was skipped because a task it depends on
 * failed, is a failed source with its reason.
 */

import type { ReportSource } from '../completeness.js';
import type { PlanTreeNode } from '../planner/recursive.js';
import type { ExecutorResult } from './types.js';

/** A task's path: its ancestors' task ids, then its own. The walk names a child plan's tasks the same way. */
export function taskPath(parent: string | undefined, taskId: string): string {
	return parent === undefined || parent.length === 0 ? taskId : `${parent}.${taskId}`;
}

/**
 * Gather the report's sources from an executed plan, in plan order.
 *
 * `tree` is the plan that was executed and `executed` what its walk returned.
 * A task of the plan with no record was never reached; it is reported as a
 * failed source, not left out.
 */
export function collectPlanSources(
	tree:       PlanTreeNode,
	executed:   ExecutorResult,
	parentPath?: string,
): ReportSource[] {
	const sources: ReportSource[] = [];
	const tasks = tree.plan.tasks;
	// The last task of a plan is its aggregate-report task (the walk takes its `report` as the plan's).
	const aggregateIndex = tasks.length - 1;

	for (let i = 0; i < tasks.length; i++) {
		if (i === aggregateIndex) continue;
		const task = tasks[i]!;
		const sourceId = taskPath(parentPath, task.taskId);
		const record = executed.root.perTask.get(task.taskId);

		if (record === undefined) {
			sources.push({ sourceId, sourceKind: 'plan-task', failure: 'the task has no record: the plan walk did not reach it' });
			continue;
		}
		if (record.status !== 'ok') {
			sources.push({ sourceId, sourceKind: 'plan-task', failure: record.error ?? record.status });
			continue;
		}
		if (record.kind === 'planner') {
			const childTree = tree.children.get(task.taskId);
			const childExecuted = executed.children.get(task.taskId);
			if (childTree === undefined || childExecuted === undefined) {
				// An 'ok' planner-kind task always has an executed child plan; one without is a defect of the walk.
				sources.push({ sourceId, sourceKind: 'plan-task', failure: 'the child plan of this task was not executed' });
				continue;
			}
			sources.push(...collectPlanSources(childTree, childExecuted, sourceId));
			continue;
		}
		// A task that ran: its runtime's own record. The walk fails a task whose
		// runtime returned none, so a missing record here makes the derivation throw.
		sources.push({ sourceId, sourceKind: 'plan-task', completeness: record.completeness });
	}
	return sources;
}
