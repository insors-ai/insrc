/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Which Task artifact a plan row became, read synchronously from the Task heads on disk. The tracker's unit bookkeeping is
 * synchronous and is keyed by the plan row id (t1, t2, ...); a Task's own id comes from the Tasks file's numbering, which can
 * differ after a re-plan, so a row is matched to its Task by the `planTaskId` the Task carries.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ARTIFACTS_DIR } from '../storage.js';

interface HeadShape {
	readonly meta?: { readonly lifecycle?: { readonly status?: unknown }; readonly envelope?: { readonly binding?: { readonly reference?: { readonly entityId?: unknown } } } } | undefined;
	readonly body?: { readonly planTaskId?: unknown } | undefined;
}

/** What the tracker's readers need to know of a Task head: its id and number, the plan row it was made from, its status and its issue. */
export interface TaskHeadInfo {
	readonly id:         string;
	/** The Task's own number, such as t4. */
	readonly number:     string;
	readonly planTaskId: string;
	readonly status:     string | undefined;
	/** The issue ref (`owner/repo#N`) on the Task's binding, when it has one. */
	readonly issue:      string | undefined;
}

/**
 * Every Task head of Story `storyId` under `artifactsDir`, read synchronously and in id order. Never throws: an unreadable
 * head is skipped.
 */
export function taskHeadsIn(artifactsDir: string, epicHash: string, storyId: string): TaskHeadInfo[] {
	if (!existsSync(artifactsDir)) return [];
	const prefix = `TASK-${epicHash.toLowerCase()}-${storyId.toLowerCase()}-t`;
	const out: TaskHeadInfo[] = [];
	for (const name of readdirSync(artifactsDir).sort()) {
		if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
		try {
			const head = JSON.parse(readFileSync(join(artifactsDir, name), 'utf8')) as HeadShape;
			const planTaskId = head.body?.planTaskId;
			if (typeof planTaskId !== 'string') continue;
			const id = name.slice(0, -'.json'.length);
			const issue = head.meta?.envelope?.binding?.reference?.entityId;
			out.push({ id, number: name.slice(prefix.length - 1, -'.json'.length), planTaskId, status: typeof head.meta?.lifecycle?.status === 'string' ? head.meta.lifecycle.status : undefined, issue: typeof issue === 'string' && issue.length > 0 ? issue : undefined });
		} catch { /* an unreadable head is not a Task */ }
	}
	return out;
}

/**
 * The id of the live Task artifact (not withdrawn) of Story `storyId` that was made from plan row `rowId`, or undefined when the
 * Story has no Task for that row (it was planned before Tasks were artifacts, or its Task set is not created yet).
 */
export function taskHeadIdOf(repoPath: string, epicHash: string, storyId: string, rowId: string): string | undefined {
	const want = rowId.toLowerCase();
	return taskHeadsIn(join(repoPath, ARTIFACTS_DIR), epicHash, storyId).filter(h => h.status !== 'withdrawn').find(h => h.planTaskId.toLowerCase() === want)?.id;
}

/** The issue ref of each live Task of the Story that has one, by the plan row it was made from. */
export function taskIssueRefsOf(artifactsDir: string, epicHash: string, storyId: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const h of taskHeadsIn(artifactsDir, epicHash, storyId)) if (h.status !== 'withdrawn' && h.issue !== undefined) out[h.planTaskId] = h.issue;
	return out;
}
