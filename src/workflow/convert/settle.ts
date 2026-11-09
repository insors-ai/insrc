/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The last step of a repair: units whose BUILD is approved are completed. A BUILD approved before the completion rule existed passed the
 * gate of its time, so it settles with an override attributed to the migration. Anything approved since is settled only by the live rule,
 * and a unit that rule holds is reported. A unit that fails part-way is reported with the members it had already completed, and the
 * next run finishes it.
 */

import { ArtifactIds } from '../artifact-ids.js';
import { APPROVED_OR_BEYOND, approvalStateOf, approvedAtOf } from '../artifact-core/approval-view.js';
import { createCompletionEvidence } from '../artifact-core/completion-evidence.js';
import { History } from '../artifact-core/history.js';
import { LifecycleService } from '../artifact-core/lifecycle-service.js';
import type { EvidenceContext } from '../artifact-core/lifecycle-service.js';
import { rollUp } from '../artifact-core/lifecycle.js';
import type { ChildStatusReader, CompletionEvidence, StoryTasks } from '../artifact-core/lifecycle.js';
import { createFileSidecarStore, FileSidecarStore } from '../artifact-core/sidecar-store.js';
import type { Status } from '../artifact-core/types.js';
import { signoffHoldsCompletion } from '../team/signoff.js';
import type { PlanRule, RulePlan } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import { passedResults, plannedStories, unusableStories } from './tasks.js';
import type { PlannedStory } from './tasks.js';
import type { ConversionChange, ConversionDeps, RawHead, UnitOutcome } from './types.js';
import { knownEpicsOf, storyId } from './units.js';

/** When the completion rule took effect. Fixed, so the attribution of an old approval cannot move between releases. */
export const COMPLETION_RULE_FROM = '2026-11-09T16:00:00.000Z';

const SETTLED_OVERRIDE = 'settled from an approved BUILD';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const metaOf = (h: RawHead): Obj => (isObj(h.json) && isObj(h.json['meta']) ? h.json['meta'] : {});
const bodyOf = (h: RawHead): Obj => (isObj(h.json) && isObj(h.json['body']) ? h.json['body'] : {});
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const SETTLED: readonly unknown[] = ['completed', 'withdrawn', 'superseded'];
const BUILD_ID = /^BUILD-([0-9a-f]{16})-([sS]\d+)$/;
const storyOf = (raw: string): string => `s${Number(/\d+/.exec(raw)?.[0] ?? '0')}`;

/** The approval of a BUILD head as stored, whether or not it has been migrated yet. */
function buildApproval(head: RawHead): { readonly approved: boolean; readonly at: string | undefined } {
	const meta = metaOf(head);
	if (isObj(meta['lifecycle'])) return { approved: approvalStateOf(meta) === 'approved', at: approvedAtOf(meta) };
	const at = text(meta['approvedAt']);
	return { approved: at !== undefined && text(meta['rejectedAt']) === undefined, at };
}

const isOldApproval = (at: string | undefined): boolean => at !== undefined && Date.parse(at) < Date.parse(COMPLETION_RULE_FROM);

/** The evidence a settlement of an old approval uses: the Task rounds still count, but the review and the override are the approval's own. */
function oldApprovalEvidence(real: CompletionEvidence): CompletionEvidence {
	return { ...real, storyCodeReview: async () => ({ kind: 'overridden', overrideReason: SETTLED_OVERRIDE }), storyApprovalOverride: async () => SETTLED_OVERRIDE };
}

const holdsOf = (repo: string): NonNullable<EvidenceContext['holds']> => unitId => signoffHoldsCompletion(repo, unitId);

/**
 * What the live rule will see once the earlier steps of a repair have run: a plan with no Task set has its rows as Tasks, and a Task with no
 * round has the result the BUILD record gives its row. Reads only.
 */
function plannedRollUp(repo: string, heads: readonly RawHead[], unit: string, status: ReadonlyMap<string, Status>): Promise<Status | undefined> {
	const real = createCompletionEvidence(repo, { history: new History(new FileSidecarStore(repo)) });
	const find = (id: string): RawHead | undefined => heads.find(h => h.artifactId === id);
	const planOf = (epicHash: string, story: string): PlannedStory | undefined => plannedStories(heads, true).find(p => p.epicHash === epicHash && p.story === story);
	const rowOf = (taskId: string): string | undefined => {
		const key = ArtifactIds.parse(taskId);
		const head = find(taskId);
		return head !== undefined ? text(bodyOf(head)['planTaskId']) : key?.task;
	};
	const reader: ChildStatusReader = {
		childrenOfStrict: async () => ({ children: [], unreadable: [] }),
		statusOf: async id => status.get(id) ?? (find(id) === undefined && ArtifactIds.parse(id)?.kind === 'TASK' ? 'approved' : undefined),
	};
	const evidence: CompletionEvidence = {
		...real,
		storyTasks: async (epicHash, story): Promise<StoryTasks> => {
			if (find(ArtifactIds.make({ kind: 'TASKS', epicHash, story })) !== undefined) return real.storyTasks(epicHash, story);
			const plan = planOf(epicHash, story);
			if (plan === undefined) return real.storyTasks(epicHash, story);
			const rows = bodyOf(plan.head)['tasks'];
			return { kind: 'listed', taskIds: (Array.isArray(rows) ? rows : []).flatMap(r => (isObj(r) && text(r['id']) !== undefined ? [ArtifactIds.make({ kind: 'TASK', epicHash, story, task: r['id'] as string })] : [])) };
		},
		taskBuildPassed: async taskId => {
			const rounds = find(taskId) === undefined ? [] : (await new History(new FileSidecarStore(repo)).log(taskId)).filter(e => (e.outcome?.data as { kind?: unknown } | undefined)?.kind === 'build-round');
			if (rounds.length > 0) return rounds.at(-1)?.outcome?.result === 'pass';
			const key = ArtifactIds.parse(taskId);
			const plan = key?.story === undefined ? undefined : planOf(key.epicHash, key.story);
			const row = rowOf(taskId);
			return plan !== undefined && passedResults(heads, plan).some(r => r.id === row);
		},
	};
	return rollUp(unit, reader, evidence);
}

/** Whether a Story's BUILD or code review still has an uppercase id or no lifecycle, so the evidence the live rule reads is not there yet. */
function awaitsMigration(heads: readonly RawHead[], epicHash: string, story: string): boolean {
	return heads.some(h => {
		const m = /^(BUILD|CR)-([0-9a-f]{16})-([sS]\d+)$/.exec(h.artifactId);
		return m !== null && m[2] === epicHash && storyOf(m[3]!) === story && (m[3] !== story || !isObj(metaOf(h)['lifecycle']));
	});
}

/** Whether the live rule would complete a Story; one whose records the rule cannot read is not proposed, and the run reports it. */
async function liveRuleCompletes(repo: string, heads: readonly RawHead[], unit: string, status: ReadonlyMap<string, Status>): Promise<boolean> {
	try { return (await plannedRollUp(repo, heads, unit, status)) === 'completed'; } catch { return false; }
}

/** The plan rule: the units a repair would complete, so a held one is listed by no run and a second repair has nothing to say. */
export const repairSettleRule: PlanRule = async (ctx): Promise<RulePlan> => {
	const statusMap = new Map<string, Status>();
	for (const head of ctx.heads) {
		const lifecycle = metaOf(head)['lifecycle'];
		if (isObj(lifecycle) && typeof lifecycle['status'] === 'string') statusMap.set(head.artifactId, lifecycle['status'] as Status);
	}
	const unusable = unusableStories(ctx.heads);
	const changes: ConversionChange[] = [];
	const settled = new Set<string>();
	const walked = new Set<string>();
	const holds = holdsOf(ctx.repo);
	for (const head of ctx.heads) {
		const m = BUILD_ID.exec(head.artifactId);
		if (m === null) continue;
		const approval = buildApproval(head);
		if (!approval.approved) continue;
		const story = storyId(m[1]!, storyOf(m[2]!));
		// a completed Story's settle walk still goes on to its Epic
		if (statusMap.get(story) === 'completed' && !unusable.has(story)) walked.add(story);
		if (SETTLED.includes(statusMap.get(story)) || unusable.has(story) || (await holds(story))) continue;
		const old = isOldApproval(approval.at);
		// records the earlier steps have yet to rename or migrate cannot be judged now: propose the Story, and the run settles it if the live rule then holds
		const pending = awaitsMigration(ctx.heads, m[1]!, storyOf(m[2]!));
		if (!old && !pending && !(await liveRuleCompletes(ctx.repo, ctx.heads, story, statusMap))) continue;
		settled.add(story);
		changes.push({ rule: 'settle-unit', artifactId: story, detail: old ? `the BUILD was approved before the completion rule (${approval.at})` : pending ? 'by the live rule, if it holds once these records are migrated' : 'by the live rule' });
	}
	for (const epic of knownEpicsOf(ctx.heads)) {
		const id = ArtifactIds.make({ kind: 'EPIC', epicHash: epic.hash });
		const stories = epic.stories.map(s => storyId(epic.hash, s.id));
		const completes = stories.some(s => settled.has(s) || walked.has(s)) && stories.every(s => settled.has(s) || SETTLED.includes(statusMap.get(s)));
		if (completes && !SETTLED.includes(statusMap.get(id)) && !(await holds(id))) changes.push({ rule: 'settle-unit', artifactId: id, detail: 'every Story is settled' });
	}
	return { changes };
};

/** Complete what the rules allow. Every other unit keeps going whatever one of them does, and each outcome names the unit it is about. */
export async function applySettle(repo: string, deps: ConversionDeps, service: LifecycleService, failed: UnitOutcome[], held: UnitOutcome[]): Promise<void> {
	const blocked = new Set(failed.map(f => f.artifactId));
	const old = new LifecycleService({
		store: deps.store,
		evidence: ctx => oldApprovalEvidence(createCompletionEvidence(repo, { ...ctx, history: new History(createFileSidecarStore(repo)) })),
	});
	const ctx: EvidenceContext = { holds: holdsOf(repo) };
	const holdsUnit = ctx.holds as NonNullable<EvidenceContext['holds']>;
	const heldUnits = new Map<string, UnitOutcome>();
	const failedUnits = new Map<string, UnitOutcome>();
	for (const head of readRawHeads(repo).heads) {
		const m = BUILD_ID.exec(head.artifactId);
		if (m === null) continue;
		const approval = buildApproval(head);
		if (!approval.approved || !APPROVED_OR_BEYOND.includes(String((metaOf(head)['lifecycle'] as Obj | undefined)?.['status']))) continue;
		const story = storyId(m[1]!, m[2]!);
		if (blocked.has(story)) continue;
		const epic = ArtifactIds.make({ kind: 'EPIC', epicHash: m[1]! });
		// the head as it stands: inspecting it would finish a staged write and hide which unit failed
		const statusOf = async (id: string): Promise<Status | undefined> => (await deps.store.read(id).catch(() => undefined))?.lifecycle.status;
		try {
			await (isOldApproval(approval.at) ? old : service).completeIfRolledUp(story, deps.actor, ctx);
			const status = await statusOf(story);
			if (status === 'completed') {
				// the walk went on to the Epic: one a signoff holds is reported, and one that is only waiting for other Stories is not
				if ((await statusOf(epic)) !== 'completed' && (await holdsUnit(epic)) === true) heldUnits.set(epic, { artifactId: epic, reason: await service.holdReason(epic, ctx), completedMembers: [] });
			} else if (status !== 'withdrawn' && status !== 'superseded') {
				heldUnits.set(story, { artifactId: story, reason: await service.holdReason(story, ctx), completedMembers: [] });
			}
		} catch (err) {
			// a Story that completed before the throw means it was its Epic that failed
			const unit = (await statusOf(story)) === 'completed' ? epic : story;
			failedUnits.set(unit, { artifactId: unit, reason: err instanceof Error ? err.message : String(err), completedMembers: await service.completedMembersOf(unit).catch(() => []) });
		}
	}
	held.push(...heldUnits.values());
	failed.push(...failedUnits.values());
}
