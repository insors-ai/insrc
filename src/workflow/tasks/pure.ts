/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The pure rules of the Task set (sc7): mapping a plan row to a Task payload, diffing a Task against a row, validating
 * the plan's rows, checking a direct edit, and handing out the next Task number. Nothing here reads or writes a store.
 */

import { checkPlanTaskGraph } from '../artifacts/plan.js';
import type { PlanTask } from '../artifacts/plan.js';
import { TERMINAL } from '../artifact-core/lifecycle.js';
import type { Status } from '../artifact-core/types.js';
import type { Citation } from '../types.js';
import { TaskSetError, TaskStructureError } from './types.js';
import type { TaskPayload, TasksPayload } from './types.js';

/** The fields of a Task a person may edit directly; everything else is the plan's. */
export const EDITABLE_TASK_FIELDS = ['title', 'summary', 'size', 'acceptanceChecks', 'tests'] as const;
export type EditableTaskField = typeof EDITABLE_TASK_FIELDS[number];

const REPLAN = 'Adding, dropping or reordering Tasks, or changing what depends on what, is done by re-planning the Story: run the plan workflow and approve the new plan.';

/** The payload a plan row becomes. Dependencies are not payload: they are References on the Task's envelope. */
export function taskPayloadFromRow(row: PlanTask): TaskPayload {
	return {
		title: row.title, summary: row.summary, size: row.size, order: row.order,
		acceptanceChecks: [...row.acceptanceChecks], tests: row.tests.map(t => ({ level: t.level, name: t.name })),
		planTaskId: row.id,
	};
}

export interface TaskDiff {
	readonly unchanged: boolean;
	/** The payload fields that differ, in payload order. */
	readonly changed:   readonly (keyof TaskPayload)[];
}

const FIELDS: readonly (keyof TaskPayload)[] = ['title', 'summary', 'size', 'order', 'acceptanceChecks', 'tests', 'planTaskId'];

/** How a Task's payload differs from the one its plan row would give it. */
export function diffTask(current: TaskPayload, row: PlanTask): TaskDiff {
	const next = taskPayloadFromRow(row);
	const changed = FIELDS.filter(f => JSON.stringify(current[f]) !== JSON.stringify(next[f]));
	return { unchanged: changed.length === 0, changed };
}

/**
 * Every problem with the plan's rows that would make a Task set wrong: a size outside S, M, L, a duplicate id, an order that
 * is not 1..n without gaps or repeats, and the graph checks of the plan itself (unknown dependency, cycle, order against
 * dependencies, grounding), which need the plan's citations. An empty list means the rows can become Tasks.
 */
export function validatePlanRows(rows: readonly PlanTask[], citations: readonly Citation[]): string[] {
	const issues: string[] = [];
	for (const r of rows) {
		if (r.size !== 'S' && r.size !== 'M' && r.size !== 'L') issues.push(`Task '${r.id}' has size '${String(r.size)}', not S, M or L`);
	}
	const ids = new Set<string>();
	for (const r of rows) {
		if (ids.has(r.id)) issues.push(`duplicate Task id '${r.id}'`);
		ids.add(r.id);
	}
	const orders = rows.map(r => r.order).sort((a, b) => a - b);
	orders.forEach((o, i) => { if (o !== i + 1) issues.push(`order is not 1..${rows.length} without gaps or repeats (position ${i + 1} holds ${o})`); });
	for (const issue of checkPlanTaskGraph(rows, citations)) if (!issues.includes(issue)) issues.push(issue);
	return issues;
}

/** Throws TaskSetError listing the problems of the plan's rows, if any. */
export function assertPlanRows(rows: readonly PlanTask[], citations: readonly Citation[]): void {
	const issues = validatePlanRows(rows, citations);
	if (issues.length > 0) throw new TaskSetError(`the plan's Task rows cannot become Tasks: ${issues.join('; ')}`);
}

/**
 * Refuses an edit a person may not make directly: a patch that names anything but the editable fields (order, dependencies, the
 * plan row key or an unknown field), or a Task that is completed, withdrawn or superseded. The message points to a re-plan.
 */
export function checkTaskEdit(patch: Readonly<Record<string, unknown>>, status: Status): void {
	const keys = Object.keys(patch);
	const refused = keys.filter(k => !(EDITABLE_TASK_FIELDS as readonly string[]).includes(k));
	if (refused.length > 0) throw new TaskStructureError(`'${refused.join("', '")}' cannot be edited on a Task directly. ${REPLAN}`);
	if (TERMINAL.includes(status)) throw new TaskStructureError(`a ${status} Task cannot be edited; reopen it through its lifecycle first, or re-plan the Story. ${REPLAN}`);
}

export interface Allocation {
	/** The Task id's number part, such as t3. */
	readonly taskId: string;
	/** The Tasks payload after the number is taken. */
	readonly next:   TasksPayload;
}

/**
 * Hands out the number the next new Task takes. `nextNumber` only moves forward, and a number already listed in `taskIds` (a
 * withdrawn Task keeps its id there) is never given again, even if `nextNumber` were behind it.
 */
export function allocateNumber(tasks: TasksPayload): Allocation {
	const taken = new Set(tasks.taskIds);
	let n = tasks.nextNumber;
	while (taken.has(`t${n}`)) n += 1;
	return { taskId: `t${n}`, next: { ...tasks, taskIds: [...tasks.taskIds, `t${n}`], nextNumber: n + 1 } };
}
