/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Bringing a Story's Task set into line with its approved plan (s7), for the two places a plan is approved: the terminal's
 * approve flow calls `syncPlanTasks`, and the daemon's post-approval seam calls `followOnTasksSync`, which also pushes the Task
 * issues the sync made heads for. A failure never fails the approval: it is returned, and repeating the call finishes it.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { History } from '../workflow/artifact-core/history.js';
import { createFileSidecarStore } from '../workflow/artifact-core/sidecar-store.js';
import type { Actor } from '../workflow/artifact-core/types.js';
import type { FollowOnOutcome, WorkflowApproveResult } from '../workflow/gates.js';
import { TaskSets } from '../workflow/tasks/task-set.js';
import type { CloseIssue, SyncResult } from '../workflow/tasks/task-set.js';
import { autoPushTasksOnPlan, openTracker } from '../workflow/tracker-auto.js';
import { taskHeadIdOf } from '../workflow/tasks/lookup.js';
import type { BuildRound } from '../workflow/tasks/task-set.js';
import { BUILD_ACTOR, lifecycleFor } from './lifecycle-registry.js';

/** Who the Task heads and their approval are recorded as: the plan's approval, as the gate itself records it. */
const APPROVAL_ACTOR: Actor = { id: 'insrc:approval', kind: 'system', properties: {} };

/** The repository a plan artifact belongs to, from its own meta. */
function repoOf(planJsonPath: string): string | undefined {
	try {
		const repo = (JSON.parse(readFileSync(planJsonPath, 'utf8')) as { meta?: { repoPath?: unknown } }).meta?.repoPath;
		return typeof repo === 'string' && repo.length > 0 ? repo : undefined;
	} catch { return undefined; }
}

/**
 * Create, reconcile or leave the Task set of the approved plan at `planJsonPath`. A dropped Task's issue is closed through the
 * repository's tracker when there is one; with none the close is kept pending on the Task. Never throws.
 */
export async function syncPlanTasks(planJsonPath: string): Promise<SyncResult> {
	const repoPath = repoOf(planJsonPath);
	if (repoPath === undefined) return { error: `${basename(planJsonPath)} has no repoPath in its meta` };
	try {
		const entry = lifecycleFor(repoPath);
		// The terminal's approval stamps the plan's own approval fields only; the Task set is made from the plan's lifecycle, so the
		// approval is applied to it here, as the daemon's approval does, before the Tasks are made.
		const planId = basename(planJsonPath).replace(/\.json$/, '');
		const stamped = (JSON.parse(readFileSync(planJsonPath, 'utf8')) as { meta?: { approvedAt?: unknown } }).meta?.approvedAt;
		if (typeof stamped === 'string' && stamped.length > 0 && (await entry.service.inspect(planId))?.status === 'draft') {
			await entry.service.apply(planId, 'approve', APPROVAL_ACTOR);
		}
		const sets = new TaskSets({ repoPath, store: entry.store, service: entry.service, history: new History(createFileSidecarStore(repoPath)) });
		const gate = openTracker(repoPath);
		const closeIssue: CloseIssue | undefined = 'port' in gate
			? issue => { const r = gate.port.issueOps.close(issue); return r.ok ? { ok: true } : { ok: false, reason: r.reason }; }
			: undefined;
		return await sets.syncOnPlanApproval(planJsonPath, APPROVAL_ACTOR, { closeIssue });
	} catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}

/** The follow-on of a plan approval at the daemon: sync the Task set, then push the Tasks' issues. */
export async function followOnTasksSync(approved: WorkflowApproveResult['approved'], _repoPath: string): Promise<FollowOnOutcome[]> {
	const out: FollowOnOutcome[] = [];
	for (const { path } of approved) {
		if (!basename(path).startsWith('PLAN-') || !path.endsWith('.json')) continue;
		const sync = await syncPlanTasks(path);
		if ('error' in sync) { out.push({ kind: 'tasks-sync', artifactPath: path, ok: false, note: sync.error }); continue; }
		const push = autoPushTasksOnPlan(path);
		const failed = push.status === 'failed';
		out.push({
			kind: 'tasks-sync', artifactPath: path, ok: !failed && sync.closeFailed.length === 0,
			note: failed ? `the Task issues were not pushed: ${push.reason}` : sync.closeFailed.length > 0 ? `${sync.closeFailed.length} issue(s) of withdrawn Tasks could not be closed` : `Tasks synced; issues ${push.status}`,
			tasks: { created: sync.created, changed: sync.changed, withdrawn: sync.withdrawn, added: sync.added },
		});
	}
	return out;
}

/**
 * Record one build round on the Task artifact made from plan row `rowId`, in the Task's own log. Answers a note when the round
 * was not recorded (the Story has no Task artifact for that row, or the write failed); never throws, so a verdict is never
 * turned into an error by it.
 */
export async function recordTaskRound(repoPath: string, epicHash: string, storyId: string, rowId: string, round: BuildRound): Promise<string | undefined> {
	let head: string | undefined;
	try {
		head = taskHeadIdOf(repoPath, epicHash, storyId, rowId);
		if (head === undefined) return undefined;
		const entry = lifecycleFor(repoPath);
		await new TaskSets({ repoPath, store: entry.store, service: entry.service, history: new History(createFileSidecarStore(repoPath)) }).recordBuildRound(head, round, BUILD_ACTOR);
		return undefined;
	} catch (err) {
		const note = `the build round was not recorded on ${head ?? `the Task of ${rowId}`} (${err instanceof Error ? err.message : String(err)})`;
		return note;
	}
}
