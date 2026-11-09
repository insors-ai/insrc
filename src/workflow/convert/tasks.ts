/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Task heads for the Stories planned before the Task model. `TaskSets.createFromPlan` runs for each approved PLAN that has no TASKS
 * head; it alone moves the Plan's Task tracker record onto each head's binding, so the conversion writes no Task record of its own.
 * Each BUILD task result that passed is back-filled as one revision-less build-round entry on its Task, so `taskBuildPassed` can
 * answer from the Task alone and the BUILD-record branch can go. The entry has a fixed id, and a Task that already holds a round
 * (from the Task model's own flow, or from an earlier run) is left alone, so a repeat appends nothing.
 *
 * A PLAN that is not approved gets no Task heads, and a task result that did not pass gets no round.
 */

import { ArtifactIds } from '../artifact-ids.js';
import { APPROVED_OR_BEYOND } from '../artifact-core/approval-view.js';
import { History } from '../artifact-core/history.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import { BUILD_ROUND } from '../tasks/task-set.js';
import { TaskSetError } from '../tasks/types.js';
import type { TaskPayload } from '../tasks/types.js';
import type { PlanRule, RulePlan } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import type { ConversionChange, ConversionDeps, RawHead, UnitOutcome } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined => typeof v === 'string' && v.length > 0 ? v : undefined;
const storyOf = (s: string): string => `s${Number(/\d+/.exec(s)?.[0] ?? '0')}`;

/** The id of the round back-filled for a Task. */
export const roundEntryId = (taskId: string): string => `migrated-${taskId}-round`;

interface PlannedStory { readonly planId: string; readonly epicHash: string; readonly story: string; readonly rows: number; readonly head: RawHead }

const metaOf = (h: RawHead): Obj => (isObj(h.json) && isObj(h.json['meta']) ? h.json['meta'] : {});
const bodyOf = (h: RawHead): Obj => (isObj(h.json) && isObj(h.json['body']) ? h.json['body'] : {});

/** A PLAN counts as approved when its lifecycle says so, or (before the migration) it carries an approval stamp and no rejection. */
function isApproved(h: RawHead, acceptLaterStatus: boolean): boolean {
	const meta = metaOf(h);
	if (isObj(meta['lifecycle'])) return meta['lifecycle']['status'] === 'approved' || (acceptLaterStatus && APPROVED_OR_BEYOND.includes(meta['lifecycle']['status'] as string));
	return text(meta['approvedAt']) !== undefined && text(meta['rejectedAt']) === undefined && meta['status'] !== 'rejected';
}

function plannedStories(heads: readonly RawHead[], acceptLaterStatus = false): PlannedStory[] {
	const out: PlannedStory[] = [];
	for (const head of heads) {
		const m = /^PLAN-([0-9a-f]{16})-([sS]\d+)$/.exec(head.artifactId);
		if (m === null || !isApproved(head, acceptLaterStatus)) continue;
		const rows = bodyOf(head)['tasks'];
		out.push({ planId: `PLAN-${m[1]!}-${storyOf(m[2]!)}`, epicHash: m[1]!, story: storyOf(m[2]!), rows: Array.isArray(rows) ? rows.length : 0, head });
	}
	return out.sort((a, b) => (a.planId < b.planId ? -1 : 1));
}

/** The BUILD task results of a Story that passed, by the id the result names. */
function passedResults(heads: readonly RawHead[], p: PlannedStory): { id: string; at: string | undefined }[] {
	const build = heads.find(h => { const m = /^BUILD-([0-9a-f]{16})-([sS]\d+)$/.exec(h.artifactId); return m !== null && m[1] === p.epicHash && storyOf(m[2]!) === p.story; });
	if (build === undefined) return [];
	const tasks = bodyOf(build)['tasks'];
	const at = text(metaOf(build)['createdAt']);
	return (Array.isArray(tasks) ? tasks : []).flatMap(t => isObj(t) && t['passed'] === true && text(t['id']) !== undefined ? [{ id: t['id'] as string, at }] : []);
}

/** The plan rule: which approved PLANs have no TASKS head, and how many rounds would be back-filled. */
export const tasksRule: PlanRule = (ctx): RulePlan => {
	const have = new Set(ctx.heads.map(h => h.artifactId));
	const changes: ConversionChange[] = [];
	for (const p of plannedStories(ctx.heads)) {
		if (have.has(ArtifactIds.make({ kind: 'TASKS', epicHash: p.epicHash, story: p.story }))) continue;
		changes.push({ rule: 'create-tasks', artifactId: p.planId, detail: `${p.rows} tasks, ${passedResults(ctx.heads, p).length} passed rounds` });
	}
	return { changes };
};

/** A Task head stored for a Story that can still hold a round, by the plan row it was made from. */
function activeTaskHeads(heads: readonly RawHead[], p: PlannedStory): Map<string, string> {
	const out = new Map<string, string>();
	for (const head of heads) {
		const key = ArtifactIds.parse(head.artifactId);
		if (key?.kind !== 'TASK' || key.epicHash !== p.epicHash || key.story !== p.story) continue;
		const status = metaOf(head)['lifecycle'];
		if (isObj(status) && (status['status'] === 'withdrawn' || status['status'] === 'superseded')) continue;
		const row = text(bodyOf(head)['planTaskId']);
		if (row !== undefined) out.set(row, head.artifactId);
	}
	return out;
}

/** The plan rule of a repair: a plan past approved qualifies, and a Task set that exists is checked for rounds it never got. */
export const repairTasksRule: PlanRule = async (ctx): Promise<RulePlan> => {
	const history = new History(new FileSidecarStore(ctx.repo));
	const have = new Set(ctx.heads.map(h => h.artifactId));
	const changes: ConversionChange[] = [];
	for (const p of plannedStories(ctx.heads, true)) {
		if (!have.has(ArtifactIds.make({ kind: 'TASKS', epicHash: p.epicHash, story: p.story }))) {
			changes.push({ rule: 'create-tasks', artifactId: p.planId, detail: `${p.rows} tasks, ${passedResults(ctx.heads, p).length} passed rounds` });
			continue;
		}
		const tasks = activeTaskHeads(ctx.heads, p);
		for (const result of passedResults(ctx.heads, p)) {
			const task = tasks.get(result.id);
			if (task === undefined) continue;
			if (!(await history.log(task)).some(e => (e.outcome?.data as { kind?: unknown } | undefined)?.kind === BUILD_ROUND)) {
				changes.push({ rule: 'backfill-round', artifactId: task, detail: `passed as plan row ${result.id} in the BUILD record` });
			}
		}
	}
	return { changes };
};

export interface TasksResult {
	/** The ids of the TASKS heads created. */
	readonly sets:   readonly string[];
	/** The Task ids that were given a round. */
	readonly rounds: readonly string[];
	/** Repair only: the Stories whose Task set could not be made. */
	readonly failed?: readonly UnitOutcome[] | undefined;
}

export interface ApplyTasksOptions {
	/** A repair: a plan past approved qualifies, and a Story whose Task set cannot be made is reported while the others continue. */
	readonly repair?:      boolean | undefined;
	/** Test seam: called before each round is written. */
	readonly beforeRound?: ((taskId: string) => void) | undefined;
}

/** Whether any Task set a repair would visit is unusable as it stands, which it has to report even when nothing else needs doing. Reads only. */
export function hasUnusableTaskSet(heads: readonly RawHead[]): boolean {
	return plannedStories(heads, true).some(p => {
		const tasksId = ArtifactIds.make({ kind: 'TASKS', epicHash: p.epicHash, story: p.story });
		const tasks = heads.find(h => h.artifactId === tasksId);
		if (tasks === undefined) return false;
		const lifecycle = metaOf(p.head)['lifecycle'];
		const number = isObj(lifecycle) && isObj(lifecycle['revision']) ? lifecycle['revision']['number'] : undefined;
		return listedTaskMissing(heads, p, tasksId) !== undefined || (typeof number === 'number' && bodyOf(tasks)['planRevision'] !== Math.max(1, number));
	});
}

/** Why the Task set of a Story cannot be used as it stands: its head lists a Task that has no head, or it answers an error of the Task set's own. */
function listedTaskMissing(heads: readonly RawHead[], p: PlannedStory, tasksId: string): string | undefined {
	const listed = bodyOf(heads.find(h => h.artifactId === tasksId) ?? { artifactId: tasksId, json: {} })['taskIds'];
	const missing = (Array.isArray(listed) ? listed : []).filter((t): t is string => typeof t === 'string' && !heads.some(h => h.artifactId === ArtifactIds.make({ kind: 'TASK', epicHash: p.epicHash, story: p.story, task: t })));
	return missing.length > 0 ? `${tasksId} lists ${missing.join(', ')}, which has no head` : undefined;
}

/** Create the Task set of each approved PLAN without one, then back-fill the passed build rounds. Safe to run again. */
export async function applyTasks(repo: string, deps: ConversionDeps, options: ApplyTasksOptions = {}): Promise<TasksResult> {
	const heads = readRawHeads(repo).heads;
	const sets: string[] = [];
	const rounds: string[] = [];
	const failed: UnitOutcome[] = [];
	for (const p of plannedStories(heads, options.repair === true)) {
		const tasksId = ArtifactIds.make({ kind: 'TASKS', epicHash: p.epicHash, story: p.story });
		const existed = heads.some(h => h.artifactId === tasksId);
		const story = ArtifactIds.make({ kind: 'STORY', epicHash: p.epicHash, story: p.story });
		const unusable = options.repair === true && existed ? listedTaskMissing(heads, p, tasksId) : undefined;
		if (unusable !== undefined) { failed.push({ artifactId: story, reason: unusable, completedMembers: [] }); continue; }
		let set: Awaited<ReturnType<ConversionDeps['taskSets']['createFromPlan']>>;
		try { set = await deps.taskSets.createFromPlan(p.planId, deps.actor, { acceptLaterStatus: options.repair === true }); }
		catch (err) {
			if (options.repair !== true || !(err instanceof TaskSetError)) throw err;
			failed.push({ artifactId: story, reason: err.message, completedMembers: [] });
			continue;
		}
		if (!existed) sets.push(set.id);
		for (const result of passedResults(heads, p)) {
			// by the plan row alone: a Task's number can equal another Task's row
			const task = set.tasks.find(t => (t.payload.body as unknown as TaskPayload).planTaskId === result.id);
			if (task === undefined) continue;
			options.beforeRound?.(task.id);
			const wrote = await deps.store.exclusive(task.id, async () => {
				const log = await deps.history.log(task.id);
				if (log.some(e => (e.outcome?.data as { kind?: unknown } | undefined)?.kind === BUILD_ROUND)) return false;
				await deps.history.appendLog(task.id, {
					id: roundEntryId(task.id), actor: deps.actor, timestamp: result.at ?? deps.now().toISOString(), operation: 'update',
					outcome: { result: 'pass', summary: 'the task passed in the BUILD record of the Story (back-filled by the conversion)', data: { kind: BUILD_ROUND, migrated: true } },
				});
				return true;
			});
			if (wrote) rounds.push(task.id);
		}
	}
	return { sets, rounds, ...(options.repair === true ? { failed } : {}) };
}
