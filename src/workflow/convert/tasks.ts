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
import { BUILD_ROUND } from '../tasks/task-set.js';
import type { TaskPayload } from '../tasks/types.js';
import type { PlanRule, RulePlan } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import type { ConversionChange, ConversionDeps, RawHead } from './types.js';

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
function isApproved(h: RawHead): boolean {
	const meta = metaOf(h);
	if (isObj(meta['lifecycle'])) return meta['lifecycle']['status'] === 'approved';
	return text(meta['approvedAt']) !== undefined && text(meta['rejectedAt']) === undefined && meta['status'] !== 'rejected';
}

function plannedStories(heads: readonly RawHead[]): PlannedStory[] {
	const out: PlannedStory[] = [];
	for (const head of heads) {
		const m = /^PLAN-([0-9a-f]{16})-([sS]\d+)$/.exec(head.artifactId);
		if (m === null || !isApproved(head)) continue;
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

export interface TasksResult {
	/** The ids of the TASKS heads created. */
	readonly sets:   readonly string[];
	/** The Task ids that were given a round. */
	readonly rounds: readonly string[];
}

/** Create the Task set of each approved PLAN without one, then back-fill the passed build rounds. Safe to run again. */
export async function applyTasks(repo: string, deps: ConversionDeps): Promise<TasksResult> {
	const heads = readRawHeads(repo).heads;
	const sets: string[] = [];
	const rounds: string[] = [];
	for (const p of plannedStories(heads)) {
		const tasksId = ArtifactIds.make({ kind: 'TASKS', epicHash: p.epicHash, story: p.story });
		const existed = heads.some(h => h.artifactId === tasksId);
		const set = await deps.taskSets.createFromPlan(p.planId, deps.actor);
		if (!existed) sets.push(set.id);
		for (const result of passedResults(heads, p)) {
			const task = set.tasks.find(t => (t.payload.body as unknown as TaskPayload).planTaskId === result.id || ArtifactIds.parse(t.id)?.task === result.id || t.id === result.id);
			if (task === undefined) continue;
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
	return { sets, rounds };
}
