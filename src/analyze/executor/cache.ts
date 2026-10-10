/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-task output persistence.
 *
 * Each task's completion writes a record to
 *   ~/.insrc/analyze/<runId>/tasks/<taskId>.json
 * for a task of the root plan. A task of a child plan is stored in its own
 * plan's directory, under its full task path, so that the plans of one tree
 * (which share a run id, and whose task ids are unique only within a plan)
 * never share a file:
 *   ~/.insrc/analyze/<runId>/tasks/t02/tasks/t02.t01.json
 *
 * For planner-template tasks the OUTPUT is the child plan's
 * aggregator output (materialized under the `report` produces
 * name). The child plan itself lives at
 *   ~/.insrc/analyze/<runId>/tasks/<taskId>/plan.json
 * (handled by analyze/planner/cache.ts; the directory + the JSON
 * file coexist as sibling filesystem entries).
 *
 * On resume the executor walks tasks[] in order, reads each
 * <taskId>.json; if present + status='ok', the task is treated as
 * already-complete and its outputs are pulled from disk; otherwise
 * the task is re-run.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';
import { planDirFor } from '../planner/cache.js';

import { taskPath } from './plan-sources.js';
import type { TaskExecutionRecord } from './types.js';

const log = getLogger('analyze:executor:cache');

/**
 * Where a task's record is stored. `parentTaskPath` is the path of the
 * planner task whose child plan the task belongs to; leave it out for a task
 * of the root plan.
 */
export function taskOutputPathFor(runId: string, taskId: string, parentTaskPath?: string | undefined): string {
	if (parentTaskPath === undefined || parentTaskPath.length === 0) {
		return PATHS.analyzeTaskOutput(runId, taskId);
	}
	return join(planDirFor({ runId, parentTaskPath }), 'tasks', `${taskPath(parentTaskPath, taskId)}.json`);
}

export function writeTaskOutput(runId: string, record: TaskExecutionRecord, parentTaskPath?: string | undefined): string {
	const path = taskOutputPathFor(runId, record.taskId, parentTaskPath);
	atomicWriteJson(path, record);
	log.debug(
		{ runId, taskId: record.taskId, status: record.status, produces: record.produces },
		'wrote task output',
	);
	return path;
}

export function readTaskOutput(runId: string, taskId: string, parentTaskPath?: string | undefined): TaskExecutionRecord | null {
	const path = taskOutputPathFor(runId, taskId, parentTaskPath);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as TaskExecutionRecord;
	} catch (err) {
		log.warn({ path, err: (err as Error).message }, 'task output unreadable; treating as miss');
		return null;
	}
}

/** Best-effort cleanup of one task slot -- used by tests. */
export function purgeTaskOutput(runId: string, taskId: string): void {
	const path = taskOutputPathFor(runId, taskId);
	try { unlinkSync(path); }
	catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			log.debug({ path, err: (err as Error).message }, 'purgeTaskOutput: non-ENOENT');
		}
	}
}

/** Best-effort cleanup of every task slot in a run. */
export function purgeAllTaskOutputs(runId: string): void {
	// Just nuke the per-run tasks/ directory; the planner's child-plan
	// artifacts live in subdirs under it too, so this is destructive --
	// only use during teardown.
	const dir = dirname(taskOutputPathFor(runId, 'unused'));
	try { rmSync(dir, { recursive: true }); }
	catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			log.debug({ dir, err: (err as Error).message }, 'purgeAllTaskOutputs: non-ENOENT');
		}
	}
}

function atomicWriteJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	const json = JSON.stringify(value, null, '\t');
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
	writeFileSync(tmp, json, 'utf8');
	renameSync(tmp, path);
}
