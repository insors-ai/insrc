/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The PRIVATE `BuildRunProgress` / `BuildHaltInfo` projection (Story s4, t5).
 *
 * Implements the winning alt a1: `BuildRunProgress` (sc6) is a PURE READ-TIME
 * PROJECTION folded on demand from the accumulated sc4 `BuildTaskOutcome[]`
 * plus the approved plan's `PlanTask[]` DEPENDS_ON graph — NEVER a second,
 * separately-writeable stored record. Because every field is derived from the
 * single authoritative outcome array (plus the live plan graph), progress can
 * never skew from the persisted outcomes, and two reads with no intervening
 * outcome write return an identical frame (no time- or random-derived field).
 *
 *   - `runState`          — 'halted' iff some row is 'failed'; 'complete' iff
 *                           every Task reached a terminal status and none
 *                           failed; else 'running'.
 *   - `completedTaskIds`  — the 'completed' rows, in array order.
 *   - `inFlightTaskId`    — the single 'running' slot, or undefined.
 *   - `filesTouchedSoFar` — the deduped set-union of completed rows' filesTouched.
 *   - `halt.blockedTaskIds` — the transitive DEPENDS_ON dependent closure of
 *                           the failed Task, RECOMPUTED against the live graph
 *                           (never snapshotted), so it cannot go stale.
 *
 * The halt-detection and blocked-vs-not-reached distinction is PRIVATE to
 * `runners/build/`; siblings consume only the resulting `BuildRunProgress`
 * frame. The projection THROWS the defined invariant errors rather than
 * fabricating a frame from an inconsistent array (see `BuildProgressError`).
 */

import type { PlanTask } from '../../artifacts/plan.js';
import type {
	BuildHaltInfo,
	BuildRunProgress,
	BuildRunState,
	BuildTaskOutcome,
	BuildTaskReached,
	BuildTaskStatus,
} from './schemas.js';

/** The closed set of legal outcome statuses. A row carrying anything else was
 *  written by a newer/older schema version and is a hard error (never treated
 *  as non-terminal, which would pin the run at 'running' forever). */
const VALID_STATUSES: ReadonlySet<string> = new Set<BuildTaskStatus>([
	'running', 'completed', 'failed', 'blocked', 'not-reached',
]);

/** Statuses that count as TERMINAL for the 'complete' determination. A
 *  'running' row is deliberately NOT terminal. */
const TERMINAL_STATUSES: ReadonlySet<BuildTaskStatus> = new Set<BuildTaskStatus>([
	'completed', 'failed', 'blocked', 'not-reached',
]);

/** A projection-invariant violation. The projection refuses to fabricate a
 *  frame from an inconsistent outcome array / plan graph and throws this
 *  instead, with a machine-readable `code`. */
export class BuildProgressError extends Error {
	readonly code:
		| 'multiple-failed'
		| 'multiple-running'
		| 'plan-outcome-drift'
		| 'unknown-status'
		| 'undecodable-outcomes';
	constructor(code: BuildProgressError['code'], message: string) {
		super(message);
		this.name = 'BuildProgressError';
		this.code = code;
	}
}

function isReached(o: BuildTaskOutcome): o is BuildTaskReached {
	return 'testVerdict' in o;
}

/**
 * Decode a persisted outcome-array envelope, throwing an `undecodable-outcomes`
 * error on a missing / corrupt / non-array payload rather than manufacturing an
 * empty `{ runState:'complete', totalTasks:0 }` projection from absent data.
 * The interrupted per-Task-boundary write is the recovery point for a re-run.
 */
export function decodeOutcomeEnvelope(raw: string | undefined | null): readonly BuildTaskOutcome[] {
	if (raw === undefined || raw === null || raw.trim() === '') {
		throw new BuildProgressError('undecodable-outcomes', 'outcome envelope is missing or empty');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new BuildProgressError('undecodable-outcomes', `outcome envelope is not decodable JSON: ${msg}`);
	}
	if (!Array.isArray(parsed)) {
		throw new BuildProgressError('undecodable-outcomes', `outcome envelope is not an array`);
	}
	return parsed as readonly BuildTaskOutcome[];
}

/**
 * Fold the accumulated `BuildTaskOutcome[]` plus the approved plan's
 * `PlanTask[]` graph into a `BuildRunProgress` frame. Pure + deterministic:
 * no time- or random-derived field, so a recompute can never disagree with
 * itself or with the persisted outcomes (winning alt a1).
 *
 * @throws {BuildProgressError} on more than one 'failed' row, more than one
 *   'running' row, a row whose taskId is absent from the live plan graph
 *   (failed or non-failed), or an out-of-union status string.
 */
export function projectBuildRunProgress(
	outcomes: readonly BuildTaskOutcome[],
	tasks:    readonly PlanTask[],
	storyId:  string,
): BuildRunProgress {
	const taskById = new Map<string, PlanTask>();
	for (const t of tasks) taskById.set(t.id, t);

	// --- Validate every row: known status + resolves to a live plan node. ---
	for (const o of outcomes) {
		if (!VALID_STATUSES.has(o.status)) {
			throw new BuildProgressError(
				'unknown-status',
				`outcome for Task '${o.taskId}' carries status '${String(o.status)}' outside the BuildTaskStatus union`,
			);
		}
		if (!taskById.has(o.taskId)) {
			throw new BuildProgressError(
				'plan-outcome-drift',
				`outcome row names Task '${o.taskId}' which is absent from the approved plan graph ` +
				`(plan re-approved while a stale outcome array is on disk?)`,
			);
		}
	}

	// --- Fold membership sets in array order (deterministic). ---
	const failed: BuildTaskOutcome[]  = [];
	const running: BuildTaskOutcome[] = [];
	const completedTaskIds: string[]  = [];
	const filesSeen = new Set<string>();
	const filesTouchedSoFar: string[] = [];
	const statusByTaskId = new Map<string, BuildTaskStatus>();

	for (const o of outcomes) {
		statusByTaskId.set(o.taskId, o.status);
		if (o.status === 'failed')  failed.push(o);
		if (o.status === 'running') running.push(o);
		if (o.status === 'completed') {
			completedTaskIds.push(o.taskId);
			if (isReached(o)) {
				for (const f of o.filesTouched) {
					if (!filesSeen.has(f)) { filesSeen.add(f); filesTouchedSoFar.push(f); }
				}
			}
		}
	}

	// --- Invariants: at most one 'failed' (halt-on-first-failure), at most
	//     one 'running' (serial by construction, never Promise.all). ---
	if (failed.length > 1) {
		throw new BuildProgressError(
			'multiple-failed',
			`the outcome array has ${failed.length} 'failed' rows (${failed.map(o => o.taskId).join(', ')}) — ` +
			`impossible under halt-on-first-failure; the array is corrupt or written by a buggy drive loop`,
		);
	}
	if (running.length > 1) {
		throw new BuildProgressError(
			'multiple-running',
			`the outcome array has ${running.length} 'running' rows (${running.map(o => o.taskId).join(', ')}) — ` +
			`concurrency is structurally impossible; at most one Task is ever in flight`,
		);
	}

	// --- runState: 'halted' iff a 'failed' row; 'complete' iff every Task
	//     reached a terminal status and none failed; else 'running'. ---
	const hasFailed = failed.length === 1;
	const allTerminal = tasks.every(t => {
		const s = statusByTaskId.get(t.id);
		return s !== undefined && TERMINAL_STATUSES.has(s);
	});
	const runState: BuildRunState = hasFailed ? 'halted' : (allTerminal ? 'complete' : 'running');

	const inFlightTaskId = running[0]?.taskId;

	const base: BuildRunProgress = {
		storyId,
		runState,
		totalTasks: tasks.length,
		completedTaskIds,
		filesTouchedSoFar,
		...(inFlightTaskId !== undefined ? { inFlightTaskId } : {}),
		...(hasFailed ? { halt: computeHaltInfo(failed[0]!, taskById, tasks) } : {}),
	};
	return base;
}

/**
 * Compute the `BuildHaltInfo` frame for the single failed outcome. The failed
 * Task's node is looked up in the live plan graph (already validated present by
 * the caller) to walk its transitive dependents; `blockedTaskIds` is recomputed
 * here, never read off the outcome rows — so it stays consistent with the plan
 * even when the sequencer's own blocked/not-reached rows drift.
 */
function computeHaltInfo(
	failedRow: BuildTaskOutcome,
	taskById:  ReadonlyMap<string, PlanTask>,
	tasks:     readonly PlanTask[],
): BuildHaltInfo {
	const node = taskById.get(failedRow.taskId)!;   // validated present upstream
	const reason = isReached(failedRow)
		? failedRow.testVerdict.summary
		: (failedRow.note ?? `Task '${failedRow.taskId}' failed`);
	return {
		failedTaskId:    failedRow.taskId,
		failedTaskTitle: node.title,
		reason,
		blockedTaskIds:  transitiveDependents(failedRow.taskId, tasks),
	};
}

/**
 * The transitive DEPENDS_ON dependent closure of `rootId`: every Task that
 * (directly or transitively) depends on it. Walks the REVERSE dependency graph
 * (dep → dependents) with a BFS, then returns the ids sorted by plan `order`
 * for a deterministic frame. `rootId` itself is excluded.
 */
export function transitiveDependents(rootId: string, tasks: readonly PlanTask[]): readonly string[] {
	const dependentsOf = new Map<string, string[]>();
	for (const t of tasks) {
		for (const dep of t.dependsOn) {
			const arr = dependentsOf.get(dep);
			if (arr === undefined) dependentsOf.set(dep, [t.id]);
			else arr.push(t.id);
		}
	}
	const orderOf = new Map<string, number>();
	for (const t of tasks) orderOf.set(t.id, t.order);

	const blocked = new Set<string>();
	const queue: string[] = [rootId];
	while (queue.length > 0) {
		const cur = queue.shift()!;
		for (const dep of dependentsOf.get(cur) ?? []) {
			if (dep === rootId || blocked.has(dep)) continue;
			blocked.add(dep);
			queue.push(dep);
		}
	}
	return [...blocked].sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0));
}
