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
 *   - An aggregate-report task writes a summary from the other tasks'
 *     results. It is left out, so it can neither hide an incomplete task nor
 *     be counted as one. It is the last task of every plan: plan validation
 *     rejects a plan with none, with more than one, or with one that is not
 *     last (INV-12).
 *
 * A task that failed, or that was skipped because a task it depends on
 * failed, is a failed source with its reason.
 */

import { mergeHandling, parseHandling } from '../completeness.js';
import type { HandlingReport, ReportSource } from '../completeness.js';
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
	// The aggregate-report task is found by position: it is the last task.
	// Plan validation guarantees it (INV-12 in planner/validate.ts: exactly one
	// aggregator, and it is the last task), and a plan that breaks the rule is
	// rejected before it runs. The plan walk uses the same rule to take the
	// plan's final report, so the two cannot disagree about which task it is.
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
			// A planner task that failed keeps its child's records: what the child plan could not do is still read, so a
			// failed nested aggregate and the tasks around it are named and not only the planner task that stood for them.
			if (record.kind === 'planner') {
				const childTree = tree.children.get(task.taskId);
				const childExecuted = executed.children.get(task.taskId);
				if (childTree !== undefined && childExecuted !== undefined) sources.push(...collectPlanSources(childTree, childExecuted, sourceId));
			}
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

	// The aggregate task is not a source of its own completeness, but what it could not cover is: a part of its report
	// that was not written, or the aggregate task itself failing, is named by the aggregate task's path.
	const aggregate = tasks[aggregateIndex];
	const aggregateRecord = aggregate === undefined ? undefined : executed.root.perTask.get(aggregate.taskId);
	if (aggregate !== undefined && aggregateRecord !== undefined) {
		const aggregateId = taskPath(parentPath, aggregate.taskId);
		if (aggregateRecord.status === 'failed') {
			sources.push({ sourceId: aggregateId, sourceKind: 'plan-task', failure: aggregateRecord.error ?? 'the aggregate task failed' });
		}
		for (const n of aggregateHandling(aggregateRecord)?.notCovered ?? []) {
			sources.push({ sourceId: `${aggregateId} / ${n.part}`, sourceKind: 'plan-task', failure: n.reason });
		}
	}
	return sources;
}

/** How an aggregate task's report was written: read from the report it stored, or from the failure it kept. */
function aggregateHandling(record: { readonly outputs?: Readonly<Record<string, unknown>> | undefined; readonly data?: unknown }): HandlingReport | undefined {
	const report = record.outputs?.['report'] as { metadata?: { handling?: unknown } } | undefined;
	const fromReport = parseHandling(report?.metadata?.handling);
	if (fromReport !== undefined) return fromReport;
	const data = record.data as { kind?: string; handling?: unknown } | undefined;
	return data?.kind === 'answer-step' ? parseHandling(data.handling) : undefined;
}

/**
 * How every aggregate report of the plan tree was written, as one handling: the
 * plan's own, then each nested plan's with its part ids qualified by the planner
 * task's path. A planner task that failed still contributes the child it kept.
 */
export function collectPlanHandling(tree: PlanTreeNode, executed: ExecutorResult, parentPath?: string): HandlingReport | undefined {
	const tasks = tree.plan.tasks;
	const aggregateIndex = tasks.length - 1;
	let handling: HandlingReport | undefined;
	const own = tasks[aggregateIndex];
	const ownRecord = own === undefined ? undefined : executed.root.perTask.get(own.taskId);
	if (ownRecord !== undefined) handling = aggregateHandling(ownRecord);
	if (handling !== undefined && parentPath !== undefined) handling = mergeHandling(handling, undefined, `${parentPath} / `);
	for (let i = 0; i < aggregateIndex; i++) {
		const task = tasks[i]!;
		if (task.kind !== 'planner') continue;
		const childTree = tree.children.get(task.taskId);
		const childExecuted = executed.children.get(task.taskId);
		if (childTree === undefined || childExecuted === undefined) continue;
		const nested = collectPlanHandling(childTree, childExecuted, taskPath(parentPath, task.taskId));
		handling = mergeHandling(handling, nested);
	}
	return handling;
}
