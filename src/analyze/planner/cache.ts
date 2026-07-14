/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plan persistence -- on-disk audit trail + final accepted plan per
 * (runId, parentTaskPath?) pair.
 *
 * Layout per design/analyze-plan-builder.md "Persisted plan layout":
 *
 *   Root plan:
 *     ~/.insrc/analyze/<runId>/plan.json
 *     ~/.insrc/analyze/<runId>/plan.attempts/01.plan.json
 *     ~/.insrc/analyze/<runId>/plan.attempts/01.feedback.json
 *     ~/.insrc/analyze/<runId>/plan.attempts/02.plan.json
 *     ...
 *
 *   Child plan for parent-task path t02:
 *     ~/.insrc/analyze/<runId>/tasks/t02/plan.json
 *     ~/.insrc/analyze/<runId>/tasks/t02/plan.attempts/01.plan.json
 *     ...
 *
 *   Nested child plan for t02.t05:
 *     ~/.insrc/analyze/<runId>/tasks/t02/tasks/t02.t05/plan.json
 *     ...
 *
 * Every attempt is persisted as it happens (not just on success), so
 * a crash mid-retry still leaves diagnosable artifacts. On success
 * the final accepted attempt is mirrored to `plan.json`.
 *
 * Cleanup: not handled here. The framework's `analyze.run.purge` IPC
 * (future) is the canonical purge path; manual deletion of the
 * per-run directory works too.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';

import type { PlanTask } from './types.js';
import type { PlanValidationFailure } from './validate.js';

const log = getLogger('analyze:planner:cache');

/** Common identifier for a plan-persistence target. */
export interface PersistArgs {
	readonly runId:           string;
	/**
	 * Present for child plans (taskPath of the parent planner-template
	 * task, e.g. "t02" or "t02.t05"). Undefined for the root plan.
	 */
	readonly parentTaskPath?: string | undefined;
}

/**
 * Returns the directory holding the plan + plan.attempts/ for a
 * given (runId, parentTaskPath?) pair.
 *
 * Root plan         -> ~/.insrc/analyze/<runId>/
 * Child t02         -> ~/.insrc/analyze/<runId>/tasks/t02/
 * Nested t02.t05    -> ~/.insrc/analyze/<runId>/tasks/t02/tasks/t02.t05/
 */
export function planDirFor(args: PersistArgs): string {
	const runRoot = PATHS.analyzeRun(args.runId);
	if (args.parentTaskPath === undefined || args.parentTaskPath.length === 0) {
		return runRoot;
	}
	// taskPath like "t02.t05" -> ["t02", "t02.t05"]. Each segment
	// nests another level under the previous segment's `tasks/`.
	// E.g. taskPath "t02.t05.t01" walks tasks/t02/ -> tasks/t02.t05/ ->
	//   tasks/t02.t05.t01/.
	const segments = expandTaskPathSegments(args.parentTaskPath);
	let dir = runRoot;
	for (const seg of segments) {
		dir = join(dir, 'tasks', seg);
	}
	return dir;
}

/**
 * Expand "t02.t05.t01" into ["t02", "t02.t05", "t02.t05.t01"] --
 * each prefix-segment maps to a `tasks/<segment>/` directory in
 * the persisted layout.
 */
function expandTaskPathSegments(taskPath: string): string[] {
	const ids = taskPath.split('.');
	const out: string[] = [];
	for (let i = 1; i <= ids.length; i++) {
		out.push(ids.slice(0, i).join('.'));
	}
	return out;
}

export function planFinalPathFor(args: PersistArgs): string {
	return join(planDirFor(args), 'plan.json');
}

export function planAttemptsDirFor(args: PersistArgs): string {
	return join(planDirFor(args), 'plan.attempts');
}

/** Filename for an attempt's plan (zero-padded NN.plan.json). */
export function planAttemptPathFor(args: PersistArgs, attemptNumber: number): string {
	return join(planAttemptsDirFor(args), `${pad2(attemptNumber)}.plan.json`);
}

/** Filename for an attempt's validator feedback (NN.feedback.json). */
export function planFeedbackPathFor(args: PersistArgs, attemptNumber: number): string {
	return join(planAttemptsDirFor(args), `${pad2(attemptNumber)}.feedback.json`);
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

/**
 * Persist an attempt's PlanTask (regardless of validation result).
 * Returns the absolute file path written.
 */
export function writeAttempt(
	args:          PersistArgs,
	attemptNumber: number,
	plan:          PlanTask,
): string {
	const path = planAttemptPathFor(args, attemptNumber);
	atomicWriteJson(path, plan);
	log.debug({ runId: args.runId, attempt: attemptNumber, parentTaskPath: args.parentTaskPath, path }, 'wrote plan attempt');
	return path;
}

/**
 * Persist an attempt's validator feedback (the failure that triggered
 * the corrective retry). Pairs with writeAttempt for the same number.
 */
export function writeFeedback(
	args:          PersistArgs,
	attemptNumber: number,
	failure:       PlanValidationFailure,
): string {
	const path = planFeedbackPathFor(args, attemptNumber);
	atomicWriteJson(path, failure);
	log.debug({ runId: args.runId, attempt: attemptNumber, invariantId: failure.invariantId, path }, 'wrote plan feedback');
	return path;
}

/**
 * Promote a plan to the final accepted slot. Writes `plan.json` in
 * the per-(runId, parentTaskPath?) dir; overwrites any prior final
 * (resume cases re-build the plan, which is intended).
 */
export function writePlanFinal(args: PersistArgs, plan: PlanTask): string {
	const path = planFinalPathFor(args);
	atomicWriteJson(path, plan);
	log.info({ runId: args.runId, parentTaskPath: args.parentTaskPath, taskCount: plan.tasks.length, path }, 'wrote final plan');
	return path;
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/**
 * Read the final accepted plan for a (runId, parentTaskPath?) pair.
 * Returns null when no plan.json exists at the slot.
 *
 * NB: shape validation is NOT performed here -- callers that need it
 * pass the result through validatePlanShape (schema.ts). Persisted
 * plans were validated by the driver before they hit disk, so a
 * cached read is trustworthy unless a human hand-edited the file.
 */
export function readPlanFinal(args: PersistArgs): PlanTask | null {
	const path = planFinalPathFor(args);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as PlanTask;
	} catch (err) {
		log.warn({ path, err: (err as Error).message }, 'plan.json unreadable; treating as miss');
		return null;
	}
}

/**
 * Best-effort cleanup of one (runId, parentTaskPath?) plan slot --
 * removes both plan.json AND plan.attempts/. Used by tests for
 * isolation; production cleanup goes through a future
 * `analyze.run.purge` IPC.
 */
export function purgePlan(args: PersistArgs): void {
	const dir = planDirFor(args);
	const finalPath  = planFinalPathFor(args);
	const attemptDir = planAttemptsDirFor(args);
	safeRm(finalPath);
	safeRmDir(attemptDir);
	// Don't remove the run dir itself (it may have peer context-cache
	// files); only the plan-specific artifacts.
	void dir;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function atomicWriteJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	const json = JSON.stringify(value, null, '\t');
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
	writeFileSync(tmp, json, 'utf8');
	renameSync(tmp, path);
}

function safeRm(path: string): void {
	try {
		rmSync(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			log.debug({ path, err: (err as Error).message }, 'safeRm: non-ENOENT error');
		}
	}
}

function safeRmDir(path: string): void {
	try {
		rmSync(path, { recursive: true });
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			log.debug({ path, err: (err as Error).message }, 'safeRmDir: non-ENOENT error');
		}
	}
}
