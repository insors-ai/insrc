/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The typed payloads of the Tasks file and of a Task (sc7, owned by s7), and the errors the Task set raises. A Task's
 * dependencies are References on the envelope, not payload; `planTaskId` is the plan row the Task was made from, so a
 * re-plan matches a row to its Task without the Task's own number (which comes from `nextNumber` and never repeats).
 */

export type TaskSize = 'S' | 'M' | 'L';
export type TaskTestLevel = 'unit' | 'integration' | 'live' | 'smoke';

export interface TaskTest {
	readonly level: TaskTestLevel;
	readonly name:  string;
}

/** The body of a TASK head. */
export interface TaskPayload {
	readonly title:            string;
	readonly summary:          string;
	readonly size:             TaskSize;
	/** 1-based execution position in the plan. */
	readonly order:            number;
	readonly acceptanceChecks: readonly string[];
	readonly tests:            readonly TaskTest[];
	/** The id of the plan row this Task was made from (t1, t2, ...). */
	readonly planTaskId:       string;
}

/** The body of the TASKS head of a Story. */
export interface TasksPayload {
	/** The revision of the PLAN these Tasks were last made or reconciled from. */
	readonly planRevision: number;
	/** Every Task id of the Story in plan order, withdrawn ones included. */
	readonly taskIds:      readonly string[];
	/** The number the next new Task takes; only ever grows, so an id is never reused. */
	readonly nextNumber:   number;
}

/** The plan is not usable (not approved, no head, malformed rows) or the Task set is not in a state the call needs. */
export class TaskSetError extends Error {
	constructor(message: string) { super(message); this.name = 'TaskSetError'; }
}

/** An edit that is not allowed on a Task directly; the message points to a re-plan. */
export class TaskStructureError extends Error {
	constructor(message: string) { super(message); this.name = 'TaskStructureError'; }
}
