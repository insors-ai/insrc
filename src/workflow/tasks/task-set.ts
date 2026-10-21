/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TaskSets (sc7, owned by s7): the Tasks of a Story as artifacts. A plan's approval creates the Tasks file (the TASKS head: which
 * Task ids exist, which plan revision they were made from, the next number to hand out) and one TASK head per plan Task, each
 * with its own revision, status, log, feedback and issue binding. Every write goes through the store and the lifecycle service.
 */

import { ArtifactIds } from '../artifact-ids.js';
import { artifactJsonPath } from '../storage.js';
import type { PlanBody, PlanTask } from '../artifacts/plan.js';
import type { Citation } from '../types.js';
import type { HeadPayload } from '../artifact-core/codecs.js';
import type { LifecycleService } from '../artifact-core/lifecycle-service.js';
import type { ArtifactStore } from '../artifact-core/store.js';
import { ArtifactNotFoundError } from '../artifact-core/types.js';
import { emptyLifecycle } from '../artifact-core/decode.js';
import type { Actor, Artifact, Reference } from '../artifact-core/types.js';
import { bindArtifact, readBinding, setPendingLink } from '../tracker/binding.js';
import { readTrackerMeta } from '../tracker/refs.js';
import { unitKey } from '../tracker/unit-issue.js';
import { getLogger } from '../../shared/logger.js';
import { assertPlanRows, taskPayloadFromRow } from './pure.js';
import { TaskSetError } from './types.js';
import type { TaskPayload, TasksPayload } from './types.js';

const log = getLogger('workflow:tasks');

/** The Tasks of a Story: the Tasks file's id and the Task artifacts, in plan order. Each artifact's payload body is a TaskPayload. */
export interface TaskSet {
	readonly id:    string;
	readonly tasks: readonly Artifact<HeadPayload>[];
}

export interface TaskSetsDeps {
	readonly repoPath: string;
	readonly store:    ArtifactStore;
	readonly service:  LifecycleService;
}

/** What a plan head gave: its rows, citations, revision and the Story it belongs to. */
interface PlanRead {
	readonly planId:    string;
	readonly epicHash:  string;
	readonly storyId:   string;
	readonly revision:  number;
	readonly rows:      readonly PlanTask[];
	readonly citations: readonly Citation[];
}

const asBody = (a: Artifact<HeadPayload>): TasksPayload | TaskPayload => a.payload.body as unknown as TasksPayload | TaskPayload;

export class TaskSets {
	constructor(private readonly deps: TaskSetsDeps) {}

	/** The Task ids and the plan's row order, read from the plan; refuses a plan that is absent, not approved, or whose rows cannot become Tasks. */
	protected async readPlan(planId: string): Promise<PlanRead> {
		const key = ArtifactIds.parse(planId);
		if (key?.kind !== 'PLAN' || key.story === undefined) throw new TaskSetError(`'${planId}' is not a plan id`);
		let plan: Artifact<HeadPayload>;
		try { plan = await this.deps.store.read(planId); }
		catch (err) {
			if (err instanceof ArtifactNotFoundError) throw new TaskSetError(`${planId} has no head`);
			throw err;
		}
		if (plan.lifecycle.status !== 'approved') throw new TaskSetError(`${planId} is ${plan.lifecycle.status}, not approved: the Tasks are made from an approved plan`);
		const body = plan.payload.body as unknown as Partial<PlanBody>;
		if (!Array.isArray(body.tasks)) throw new TaskSetError(`${planId} has no Task rows`);
		const rows = [...body.tasks].sort((a, b) => a.order - b.order);
		const citations = plan.payload.citations as unknown as Citation[];
		assertPlanRows(rows, citations);
		return { planId, epicHash: key.epicHash, storyId: key.story, revision: plan.lifecycle.revision.number, rows, citations };
	}

	private tasksId(p: PlanRead): string { return ArtifactIds.make({ kind: 'TASKS', epicHash: p.epicHash, story: p.storyId }); }
	private taskId(p: PlanRead, taskId: string): string { return ArtifactIds.make({ kind: 'TASK', epicHash: p.epicHash, story: p.storyId, task: taskId }); }
	private storyRef(p: PlanRead): Reference { return { entityId: ArtifactIds.make({ kind: 'STORY', epicHash: p.epicHash, story: p.storyId }), type: 'STORY', relation: 'derived-from' }; }

	/** The Task heads that already exist for the Story, by the plan row each was made from. */
	private async existingTasks(p: PlanRead): Promise<Map<string, Artifact<HeadPayload>>> {
		const out = new Map<string, Artifact<HeadPayload>>();
		const story = ArtifactIds.make({ kind: 'STORY', epicHash: p.epicHash, story: p.storyId });
		for (const id of await this.deps.store.childrenOf(story)) {
			if (ArtifactIds.parse(id)?.kind !== 'TASK') continue;
			const head = await this.deps.store.read(id);
			out.set((asBody(head) as TaskPayload).planTaskId, head);
		}
		return out;
	}

	/**
	 * Create the Task set of an approved plan: one TASK head per plan row (parent the Story, a depends-on reference for each
	 * dependency, a derived-from reference to the plan at the revision it was made from), each approved as `by` (the plan's
	 * approval covers its Tasks; an edit returns a Task to draft), then the TASKS head last. A Task record found on the plan is
	 * moved onto its head's binding. A repeat for the same plan revision writes nothing; a part-way failure is finished by
	 * repeating the call, because the TASKS head that marks the set done is written last and heads already made are kept.
	 */
	async createFromPlan(planId: string, by: Actor): Promise<TaskSet> {
		const plan = await this.readPlan(planId);
		const tasksId = this.tasksId(plan);
		const done = await this.readTasksHead(tasksId);
		if (done !== undefined) {
			if (done.planRevision === plan.revision) return this.setOf(plan, done);
			throw new TaskSetError(`${tasksId} was made from plan revision ${done.planRevision}, not ${plan.revision}: use reconcile for a re-plan`);
		}

		const existing = await this.existingTasks(plan);
		// numbers are handed out in plan order; a head left by an earlier part-way run keeps the number it was given
		const taken = [...existing.values()].map(h => Number(ArtifactIds.parse(h.id)?.task?.slice(1) ?? 0));
		let next = Math.max(0, ...taken) + 1;
		const numbered = new Map<string, string>();
		for (const row of plan.rows) {
			const have = existing.get(row.id);
			numbered.set(row.id, have !== undefined ? ArtifactIds.parse(have.id)?.task ?? `t${next}` : `t${next++}`);
		}

		const tasks: Artifact<HeadPayload>[] = [];
		for (const row of plan.rows) {
			const id = this.taskId(plan, numbered.get(row.id) ?? row.id);
			tasks.push(await this.ensureTask(plan, row, id, numbered, by, existing.get(row.id)));
		}

		const payload: TasksPayload = { planRevision: plan.revision, taskIds: tasks.map(t => ArtifactIds.parse(t.id)?.task ?? ''), nextNumber: next };
		await this.deps.store.write({
			id: tasksId, description: `The Tasks of ${plan.storyId}`, parent: this.storyRef(plan), references: [this.planRef(plan)], attachments: [],
			lifecycle: emptyLifecycle(0), payload: { body: payload as unknown as Record<string, unknown>, citations: [] },
		}, by);
		log.info({ tasksId, tasks: tasks.length, planRevision: plan.revision }, 'tasks: created the Task set');
		return { id: tasksId, tasks };
	}

	private planRef(p: PlanRead): Reference { return { entityId: p.planId, type: 'PLAN', relation: 'derived-from', fragment: `revision ${p.revision}` }; }

	/** One Task head: written when absent, approved when draft, and given the issue record the plan held for its row. */
	private async ensureTask(p: PlanRead, row: PlanTask, id: string, numbered: ReadonlyMap<string, string>, by: Actor, have: Artifact<HeadPayload> | undefined): Promise<Artifact<HeadPayload>> {
		const store = this.deps.store;
		if (have === undefined) {
			const depends: Reference[] = row.dependsOn.map(dep => ({ entityId: this.taskId(p, numbered.get(dep) ?? dep), type: 'TASK', relation: 'depends-on' as const }));
			await store.write({
				id, description: row.title, parent: this.storyRef(p), references: [this.planRef(p), ...depends], attachments: [],
				lifecycle: emptyLifecycle(0), payload: { body: taskPayloadFromRow(row) as unknown as Record<string, unknown>, citations: [] },
			}, by);
		}
		let head = await store.read(id);
		if (head.lifecycle.status === 'draft') {
			await this.deps.service.apply(id, 'approve', by);
			head = await store.read(id);
		}
		this.moveRecord(p, row, id);
		return head;
	}

	/**
	 * A Task record the plan held for this row (a team-mode draft once claimed Task issues on the plan) goes onto the Task head's
	 * binding, with its pending link. The plan's copy is left where it is: nothing reads it once the head is bound, and s9 removes
	 * the fields. A head that is already bound is left as it is.
	 */
	private moveRecord(p: PlanRead, row: PlanTask, taskArtifactId: string): void {
		try {
			if (readBinding(this.deps.repoPath, taskArtifactId) !== undefined) return;
			const record = readTrackerMeta(artifactJsonPath(this.deps.repoPath, p.planId))?.units?.[unitKey({ unit: 'task', repoPath: this.deps.repoPath, epicHash: p.epicHash, storyId: p.storyId, taskId: row.id })];
			if (record === undefined || typeof record.issue !== 'string' || record.issue.length === 0) return;
			const bound = bindArtifact(this.deps.repoPath, taskArtifactId, record.issue);
			if (!bound.ok) { log.warn({ taskArtifactId, why: bound.kind, reason: bound.reason }, 'tasks: the plan\'s Task record was not moved'); return; }
			const link = record.pendingLink;
			if (link !== undefined) {
				const issueRef = (ref: string): Reference => ({ entityId: ref, type: 'github:issue', relation: 'tracked-by' });
				setPendingLink(this.deps.repoPath, taskArtifactId, { parent: issueRef(link.parent), ...(link.childId !== undefined ? { childId: link.childId } : {}), ...(link.child !== undefined ? { child: issueRef(link.child) } : {}) });
			}
		} catch (err) { log.warn({ taskArtifactId, err: (err as Error).message }, 'tasks: the plan\'s Task record was not moved'); }
	}

	private async readTasksHead(tasksId: string): Promise<TasksPayload | undefined> {
		try { return asBody(await this.deps.store.read(tasksId)) as TasksPayload; }
		catch (err) { if (err instanceof ArtifactNotFoundError) return undefined; throw err; }
	}

	private async setOf(p: PlanRead, tasks: TasksPayload): Promise<TaskSet> {
		const out: Artifact<HeadPayload>[] = [];
		for (const taskId of tasks.taskIds) out.push(await this.deps.store.read(this.taskId(p, taskId)));
		return { id: this.tasksId(p), tasks: out };
	}
}
