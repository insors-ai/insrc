/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TaskSets (sc7, owned by s7): the Tasks of a Story as artifacts. A plan's approval creates the Tasks file (the TASKS head: which
 * Task ids exist, which plan revision they were made from, the next number to hand out) and one TASK head per plan Task, each
 * with its own revision, status, log, feedback and issue binding. Every write goes through the store and the lifecycle service.
 */

import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import { ArtifactIds } from '../artifact-ids.js';
import { artifactJsonPath } from '../storage.js';
import type { PlanBody, PlanTask } from '../artifacts/plan.js';
import type { Citation } from '../types.js';
import type { HeadPayload } from '../artifact-core/codecs.js';
import type { LifecycleService } from '../artifact-core/lifecycle-service.js';
import type { ArtifactStore } from '../artifact-core/store.js';
import type { History } from '../artifact-core/history.js';
import { ArtifactNotFoundError, LifecycleConflictError } from '../artifact-core/types.js';
import { emptyLifecycle } from '../artifact-core/decode.js';
import type { Actor, Artifact, Reference } from '../artifact-core/types.js';
import { bindArtifact, readBinding, setPendingLink } from '../tracker/binding.js';
import { readTrackerMeta } from '../tracker/refs.js';
import { isToolDenied, TaskSyncDenied } from '../tracker/tool-denied.js';
import { unitKey } from '../tracker/unit-issue.js';
import { getLogger } from '../../shared/logger.js';
import { allocateNumber, assertPlanRows, checkTaskEdit, diffTask, taskPayloadFromRow } from './pure.js';
import { TaskSetError, TaskStructureError } from './types.js';
import type { TaskPayload, TasksPayload } from './types.js';

const log = getLogger('workflow:tasks');

let entrySeq = 0;
/** A log entry id that sorts in the order entries were made in this process: the history orders entries of one time by id, and a round must follow the one before it. */
export function orderedEntryId(): string {
	entrySeq = (entrySeq + 1) % 46656;
	return `${Date.now().toString(36).padStart(10, '0')}${entrySeq.toString(36).padStart(3, '0')}-${randomUUID()}`;
}

/** The Tasks of a Story: the Tasks file's id and the Task artifacts, in plan order. Each artifact's payload body is a TaskPayload. */
export interface TaskSet {
	readonly id:    string;
	readonly tasks: readonly Artifact<HeadPayload>[];
}

export interface TaskSetsDeps {
	readonly repoPath: string;
	readonly store:    ArtifactStore;
	readonly service:  LifecycleService;
	/** The history the store writes through: a Task's pending issue close is logged on it. */
	readonly history:  History;
	readonly now?:     (() => Date) | undefined;
}

/** What a re-plan did to the Task set. `closeFailed` lists the issues of withdrawn Tasks that could not be closed; the next call retries them. */
export interface ReconcileResult {
	readonly changed:     string[];
	readonly withdrawn:   string[];
	readonly added:       string[];
	readonly closeFailed: { readonly taskId: string; readonly issue: string; readonly reason: string }[];
}

/** Closes a tracker issue by its `owner/repo#N` ref; supplied by the caller that has a tracker. */
export type CloseIssue = (issue: string) => CloseResult | Promise<CloseResult>;
export type CloseResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** One build round of a Task, as the gate judged it. */
export interface BuildRound {
	readonly passed:  boolean;
	readonly summary: string;
	readonly data?:   unknown;
}

/** The marker that tells a build round from the other revision-less entries a Task's log holds. */
export const BUILD_ROUND = 'build-round';

/** What a plan approval did to the Task set, or why nothing was attempted. */
export type SyncResult = (ReconcileResult & { readonly created: string[] }) | { readonly error: string };

export interface ReconcileOptions {
	readonly closeIssue?: CloseIssue | undefined;
	/** Called after each step with what has been done so far (a copy), so a caller that is stopped part-way knows how far it got. */
	readonly onProgress?: ((done: { readonly changed: readonly string[]; readonly withdrawn: readonly string[]; readonly added: readonly string[] }) => void) | undefined;
}
export interface EditOptions {
	/** The revision the caller read the Task at; the edit is refused when the head has moved on since. */
	readonly expectedRevision?: number | undefined;
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
		return { planId, epicHash: key.epicHash, storyId: key.story, // a plan written before revisions were stamped reads as revision 0; the Tasks file records revisions from 1
		revision: Math.max(1, plan.lifecycle.revision.number), rows, citations };
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
			// a withdrawn Task keeps its id and is never brought back: a row that returns is a new Task
			if (head.lifecycle.status === 'withdrawn') continue;
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

	/** The references of a Task: the plan at its revision, and the Tasks its row depends on. */
	private referencesFor(p: PlanRead, row: PlanTask, numbered: ReadonlyMap<string, string>): Reference[] {
		const depends = row.dependsOn.map((dep): Reference => ({ entityId: this.taskId(p, numbered.get(dep) ?? dep), type: 'TASK', relation: 'depends-on' }));
		return [this.planRef(p), ...depends];
	}

	private planRef(p: PlanRead): Reference { return { entityId: p.planId, type: 'PLAN', relation: 'derived-from', fragment: `revision ${p.revision}` }; }

	/** One Task head: written when absent, approved when draft, and given the issue record the plan held for its row. */
	private async ensureTask(p: PlanRead, row: PlanTask, id: string, numbered: ReadonlyMap<string, string>, by: Actor, have: Artifact<HeadPayload> | undefined): Promise<Artifact<HeadPayload>> {
		const store = this.deps.store;
		if (have === undefined) {
			await store.write({
				id, description: row.title, parent: this.storyRef(p), references: this.referencesFor(p, row, numbered), attachments: [],
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

	/**
	 * Bring the Tasks into line with a plan approved at a newer revision than the Tasks file records. The plan's rows are the
	 * source: a Task whose row differs gets a new revision and returns to draft (its re-approval is the local user's), a Task whose row is gone is
	 * withdrawn and its issue closed, a row with no Task becomes a new Task under the next number. Rows are matched to Tasks by
	 * `planTaskId`, a withdrawn Task is never matched again, and `nextNumber` only grows, so no Task id is reused. The Tasks file
	 * records the new plan revision last: a call that fails part-way is finished by repeating it.
	 */
	async reconcile(planId: string, by: Actor, opts: ReconcileOptions = {}): Promise<ReconcileResult> {
		const plan = await this.readPlan(planId);
		const tasksId = this.tasksId(plan);
		const tasks = await this.readTasksHead(tasksId);
		if (tasks === undefined) throw new TaskSetError(`${tasksId} does not exist: use createFromPlan for a plan with no Tasks yet`);
		if (plan.revision < tasks.planRevision) throw new TaskSetError(`${planId} is at revision ${plan.revision}, behind the ${tasks.planRevision} its Tasks were made from`);
		const result: ReconcileResult = { changed: [], withdrawn: [], added: [], closeFailed: [] };
		const progress = (): void => opts.onProgress?.({ changed: [...result.changed], withdrawn: [...result.withdrawn], added: [...result.added] });
		if (plan.revision === tasks.planRevision) { result.closeFailed.push(...await this.retryCloses(plan, tasks, by, opts)); return result; }

		// the closes an earlier call could not make are retried first, so a Task withdrawn by this call is attempted once
		result.closeFailed.push(...await this.retryCloses(plan, tasks, by, opts));
		const existing = await this.existingTasks(plan);
		const rowIds = new Set(plan.rows.map(r => r.id));
		let working = tasks;
		const numbered = new Map<string, string>();
		for (const row of plan.rows) {
			const have = existing.get(row.id);
			if (have !== undefined) { numbered.set(row.id, ArtifactIds.parse(have.id)?.task ?? row.id); continue; }
			const a = allocateNumber(working);
			working = a.next;
			numbered.set(row.id, a.taskId);
		}

		// changed Tasks: the plan's row replaces the Task's content; references follow the plan whether or not the content moved
		for (const row of plan.rows) {
			const have = existing.get(row.id);
			if (have === undefined) continue;
			const short = numbered.get(row.id) ?? row.id;
			const references = this.referencesFor(plan, row, numbered);
			const moved = !diffTask(asBody(have) as TaskPayload, row).unchanged;
			if (!moved && JSON.stringify(have.references) === JSON.stringify(references)) continue;
			await this.deps.store.update(have.id, by, current => {
				this.assertRevision(current.lifecycle.revision.number, have.lifecycle.revision.number, have.id);
				const { changeLog: _log, ...head } = current;
				const body = moved ? taskPayloadFromRow(row) as unknown as Record<string, unknown> : head.payload.body;
				return { next: { ...head, description: moved ? row.title : head.description, references, payload: { ...head.payload, body } }, options: { operation: 'update' } };
			});
			if (moved) { result.changed.push(short); progress(); }
		}

		// dropped Tasks: withdrawn with the plan's approval; the issue is closed, or the failed close is kept for the next call
		for (const [rowId, have] of existing) {
			if (rowIds.has(rowId)) continue;
			await this.deps.service.apply(have.id, 'withdraw', by, { reason: `dropped by the re-plan (${planId} at revision ${plan.revision})` });
			const short = ArtifactIds.parse(have.id)?.task ?? rowId;
			result.withdrawn.push(short);
			progress();
			const failed = await this.closeIssueOf(have.id, short, by, opts);
			if (failed !== undefined) result.closeFailed.push(failed);
		}

		// new Tasks under the numbers allocated above
		for (const row of plan.rows) {
			if (existing.has(row.id)) continue;
			const short = numbered.get(row.id) ?? row.id;
			await this.ensureTask(plan, row, this.taskId(plan, short), numbered, by, undefined);
			result.added.push(short);
			progress();
		}

		await this.deps.store.update(tasksId, by, current => {
			const { changeLog: _log, ...head } = current;
			const body: TasksPayload = { planRevision: plan.revision, taskIds: working.taskIds, nextNumber: working.nextNumber };
			return { next: { ...head, references: [this.planRef(plan)], payload: { ...head.payload, body: body as unknown as Record<string, unknown> } }, options: { operation: 'update' } };
		});
		return result;
	}

	/**
	 * Change a Task's own content: its title, summary, size, acceptance checks or tests. The Task moves to a new revision and
	 * returns to draft (its re-approval is the local user's, and no signoff is opened); the plan and the other Tasks are not touched.
	 * A patch that names order, a dependency or anything else the plan owns is refused with a pointer to a re-plan, as is a Task that
	 * is completed, withdrawn or superseded. A patch that changes nothing writes nothing. With `expectedRevision` the edit is refused
	 * (LifecycleConflictError) when the Task moved on after the caller read it.
	 */
	async edit(taskId: string, patch: Partial<TaskPayload>, by: Actor, opts: EditOptions = {}): Promise<void> {
		if (ArtifactIds.parse(taskId)?.kind !== 'TASK') throw new TaskStructureError(`'${taskId}' is not a Task id`);
		await this.deps.store.update(taskId, by, current => {
			checkTaskEdit(patch as Record<string, unknown>, current.lifecycle.status);
			if (opts.expectedRevision !== undefined) this.assertRevision(current.lifecycle.revision.number, opts.expectedRevision, taskId);
			const { changeLog: _log, ...head } = current;
			const body = { ...head.payload.body, ...patch } as Record<string, unknown>;
			if (JSON.stringify(body) === JSON.stringify(head.payload.body)) return undefined;
			return { next: { ...head, payload: { ...head.payload, body } }, options: { operation: 'update' } };
		});
	}

	/** Refuses a write made from a read that is no longer the head. */
	private assertRevision(current: number, read: number, id: string): void {
		if (current !== read) throw new LifecycleConflictError(id, 'head-changed-after-stage', `${id} is at revision ${current}, not the ${read} this change was made from; read it again and retry`);
	}

	/** Close the issue of a Task that has one. Returns what failed, after logging it on the Task so a later call retries it. */
	private async closeIssueOf(id: string, short: string, by: Actor, opts: ReconcileOptions): Promise<ReconcileResult['closeFailed'][number] | undefined> {
		let issue: string | undefined;
		try { issue = readBinding(this.deps.repoPath, id)?.reference.entityId; } catch { return undefined; }
		if (issue === undefined) return undefined;
		let closed: CloseResult;
		try { closed = (await opts.closeIssue?.(issue)) ?? { ok: false as const, reason: 'no tracker to close the issue on' }; }
		catch (err) {
			// A close that threw is not a close that ran (a denial, or any error of the closer): the Task keeps a pending-close entry, written
			// before the error is rethrown, so the next reconciliation closes the still-open issue instead of losing it (a withdrawn Task is
			// not matched again).
			const why = isToolDenied(err) ? `the call was denied (${err.reason})` : `the close failed (${err instanceof Error ? err.message : String(err)})`;
			await this.logClose(id, by, { result: 'pending-close', summary: `${issue} could not be closed: ${why}`, data: { issue } });
			log.warn({ taskId: id, issue, reason: why }, 'tasks: closing a withdrawn Task\'s issue did not run; the next call retries it');
			throw err;
		}
		await this.logClose(id, by, closed.ok ? { result: 'closed', summary: `closed ${issue}`, data: { issue } } : { result: 'pending-close', summary: `${issue} could not be closed: ${closed.reason}`, data: { issue } });
		if (closed.ok) return undefined;
		log.warn({ taskId: id, issue, reason: closed.reason }, 'tasks: a withdrawn Task\'s issue was not closed; the next call retries it');
		return { taskId: short, issue, reason: closed.reason };
	}

	private async logClose(id: string, by: Actor, outcome: { result: string; summary: string; data: unknown }): Promise<void> {
		await this.deps.store.exclusive(id, () => this.deps.history.appendLog(id, {
			id: orderedEntryId(), actor: by, timestamp: (this.deps.now ?? (() => new Date()))().toISOString(), operation: 'update', outcome,
		}));
	}

	/** Retry the closes that failed earlier: a withdrawn Task whose latest close entry is a pending one. */
	private async retryCloses(p: PlanRead, tasks: TasksPayload, by: Actor, opts: ReconcileOptions): Promise<ReconcileResult['closeFailed']> {
		const failed: ReconcileResult['closeFailed'] = [];
		if (opts.closeIssue === undefined) return failed;
		for (const short of tasks.taskIds) {
			const id = this.taskId(p, short);
			const head = await this.deps.store.read(id).catch(() => undefined);
			if (head?.lifecycle.status !== 'withdrawn') continue;
			const latest = [...await this.deps.history.log(id)].reverse().find(e => e.outcome?.result === 'pending-close' || e.outcome?.result === 'closed');
			if (latest?.outcome?.result !== 'pending-close') continue;
			const f = await this.closeIssueOf(id, short, by, opts);
			if (f !== undefined) failed.push(f);
		}
		return failed;
	}

	/**
	 * Record one build round on a Task: a log entry that moves no revision (a round is not content, so a round never changes
	 * what the Task says). It is appended under the Task's write queue, and `taskBuildPassed` answers from the latest one.
	 * Refuses a Task that has no head.
	 */
	async recordBuildRound(taskId: string, round: BuildRound, by: Actor): Promise<void> {
		if (ArtifactIds.parse(taskId)?.kind !== 'TASK') throw new TaskStructureError(`'${taskId}' is not a Task id`);
		await this.deps.store.exclusive(taskId, async () => {
			await this.deps.store.read(taskId);
			await this.deps.history.appendLog(taskId, {
				id: orderedEntryId(), actor: by, timestamp: (this.deps.now ?? (() => new Date()))().toISOString(), operation: 'update',
				outcome: { result: round.passed ? 'pass' : 'fail', summary: round.summary, data: { kind: BUILD_ROUND, ...(round.data !== undefined ? { round: round.data } : {}) } },
			});
		});
	}

	/**
	 * What the approval of a plan does to the Task set: create it for a plan that has none, reconcile a plan at a newer revision,
	 * do nothing when they agree. Never throws for a plan that is not usable or a write that fails: that comes back as `{ error }` so the
	 * approval it follows is never failed by it (repeating the call finishes a part-way run). A tracker call the user denied is the one
	 * exception: it stops the reconciliation and is thrown as a TaskSyncDenied that carries what had been done.
	 */
	async syncOnPlanApproval(planJsonPath: string, by: Actor, opts: ReconcileOptions = {}): Promise<SyncResult> {
		let done: { changed: readonly string[]; withdrawn: readonly string[]; added: readonly string[] } = { changed: [], withdrawn: [], added: [] };
		const tracked: ReconcileOptions = { ...opts, onProgress: d => { done = d; opts.onProgress?.(d); } };
		try {
			const planId = basename(planJsonPath).replace(/\.json$/, '');
			const plan = await this.readPlan(planId);
			const tasks = await this.readTasksHead(this.tasksId(plan));
			if (tasks === undefined) {
				const set = await this.createFromPlan(planId, by);
				return { created: set.tasks.map(t => ArtifactIds.parse(t.id)?.task ?? t.id), changed: [], withdrawn: [], added: [], closeFailed: [] };
			}
			return { created: [], ...(await this.reconcile(planId, by, tracked)) };
		} catch (err) {
			if (isToolDenied(err)) throw new TaskSyncDenied(err, { created: [], ...done });
			const reason = err instanceof Error ? err.message : String(err);
			log.warn({ planJsonPath, reason }, 'tasks: the Task set was not brought into line with the approved plan');
			return { error: reason };
		}
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
