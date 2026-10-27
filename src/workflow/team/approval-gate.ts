/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Which stage unit does approving this artifact change, and may the actor change it?
 * (sc4, action approve-local.) A Define or HLD belongs to the Epic, an LLD or plan to
 * its Story, and a BUILD record to the Tasks of its Story: a Story-wide BUILD is
 * authorized against every Task claim of the Story (or the Story when it has no Tasks)
 * and refused naming the first one held by someone else. Artifacts that are not a claim
 * unit (an issue, a spec, a record) are not guarded.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import type { UnitRef } from '../tracker/refs.js';
import { artifactJsonPath, inheritedStoryStandalone, planArtifactId } from '../storage.js';
import { parseBuildArtifactRef } from '../gates.js';
import { isToolDenied } from '../tracker/tool-denied.js';
import { claimsEnforcedFor, reviewFixDecision, teamGate, type GateOutcome, type GuardedAction, type RefusedOutcome, type ReviewFixMode } from './gate.js';

export interface ApprovalRefusal {
	readonly outcome: RefusedOutcome;
	/** What was refused, for the message: for example "task t2". */
	readonly subject: string | undefined;
}

interface Meta { workflow?: string | undefined; repoPath?: string | undefined; epicHash?: string | undefined; storyId?: string | undefined; standalone?: boolean | undefined }

/** The workflow a claim-unit artifact belongs to, from its file name, for an artifact whose meta does not say. */
const WORKFLOW_BY_PREFIX: Readonly<Record<string, string>> = { 'DEF-': 'define', 'HLD-': 'design.epic', 'LLD-': 'design.story', 'PLAN-': 'plan' };

const EPIC_WORKFLOWS: ReadonlySet<string> = new Set(['define', 'design.epic']);
const STORY_WORKFLOWS: ReadonlySet<string> = new Set(['design.story', 'plan']);

function readMeta(jsonPath: string): Meta | undefined {
	try {
		const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: Meta | undefined }).meta;
		return typeof meta === 'object' && meta !== null ? meta : undefined;
	} catch { return undefined; }
}

/**
 * The Story's Task ids from its plan artifact, in plan order. No plan file means no Tasks; a plan
 * that exists but cannot be read is an error, never "no Tasks" (that would skip the Task claims).
 */
function taskIdsOf(repoPath: string, epicHash: string, storyId: string): { ok: true; ids: string[] } | { ok: false; reason: string } {
	const path = artifactJsonPath(repoPath, planArtifactId(epicHash, storyId));
	if (!existsSync(path)) return { ok: true, ids: [] };
	try {
		const tasks = (JSON.parse(readFileSync(path, 'utf8')) as { body?: { tasks?: Array<{ id?: unknown; order?: unknown }> } }).body?.tasks;
		if (!Array.isArray(tasks)) return { ok: false, reason: `the plan of Story ${storyId} has no task list` };
		// every Task needs a usable id: dropping one would skip its claim
		if (tasks.some(t => typeof t?.id !== 'string' || t.id.length === 0)) return { ok: false, reason: `the plan of Story ${storyId} has a task with no id` };
		return { ok: true, ids: [...tasks].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)).map(t => t.id as string) };
	} catch (err) {
		return { ok: false, reason: `the plan of Story ${storyId} cannot be read: ${err instanceof Error ? err.message : String(err)}` };
	}
}

/** How the gate is asked about one unit. */
type Decide = (repo: string, unit: UnitRef) => GateOutcome | Promise<GateOutcome>;

const asking = (action: GuardedAction): Decide => (repo, unit) => teamGate(repo, unit, action);

/** The refusal for approving this artifact, or undefined when it may be approved (or is not guarded). Never throws. */
export function authorizeApproval(jsonPath: string, metaOverride?: Meta): Promise<ApprovalRefusal | undefined> {
	return authorizeStageChange(jsonPath, asking('approve-local'), metaOverride);
}

/** The refusal for applying a review finding to this artifact (changes its content), or undefined. Never throws. */
export function authorizeFindingApply(jsonPath: string): Promise<ApprovalRefusal | undefined> {
	return authorizeStageChange(jsonPath, asking('review-fix'));
}

/**
 * Whether an automatic review may write fixes to this artifact: through reviewFixDecision for the
 * stage unit(s) the artifact belongs to. A review is never refused; only its fix mode changes.
 */
export async function reviewFixModeFor(jsonPath: string): Promise<ReviewFixMode> {
	const decide: Decide = async (repo, unit) => ((await reviewFixDecision(repo, unit)) === 'apply-auto-fixes' ? { kind: 'allowed', implicitClaim: false } : { kind: 'refused', reason: 'report-only' });
	try { return (await authorizeStageChange(jsonPath, decide)) === undefined ? 'apply-auto-fixes' : 'report-only'; }
	catch (err) {
		// a denied tracker call stops the review; it does not continue as a report-only review
		if (isToolDenied(err)) throw err;
		return 'report-only';
	}
}

/** Map the artifact to its stage unit(s) and ask `decide` about each; the first refusal wins. */
async function authorizeStageChange(jsonPath: string, decide: Decide, metaOverride?: Meta): Promise<ApprovalRefusal | undefined> {
	const check = async (repo: string, unit: UnitRef, subject: string | undefined): Promise<ApprovalRefusal | undefined> => {
		const o = await decide(repo, unit);
		return o.kind === 'allowed' ? undefined : { outcome: o, subject };
	};
	try {
		const meta = metaOverride ?? readMeta(jsonPath);
		const isBuild = basename(jsonPath).startsWith('BUILD-') || meta?.workflow === 'build';
		const prefix = Object.keys(WORKFLOW_BY_PREFIX).find(p => basename(jsonPath).startsWith(p));
		// meta.workflow wins; an artifact whose meta does not say is read from its file name, never waved through
		const workflow = meta?.workflow ?? (prefix !== undefined ? WORKFLOW_BY_PREFIX[prefix] : undefined);
		if (!isBuild && (workflow === undefined || !(EPIC_WORKFLOWS.has(workflow) || STORY_WORKFLOWS.has(workflow)))) return undefined;   // not a claim unit

		// Artifacts live at <repo>/.insrc/artifacts/<id>.json, so the repo can be recovered when the meta lacks it
		const repoPath = typeof meta?.repoPath === 'string' ? meta.repoPath : dirname(dirname(dirname(jsonPath)));
		// A BUILD record that does not exist yet has no meta: its epic and story are in its file name
		const fromName = isBuild ? parseBuildArtifactRef(jsonPath) : undefined;
		const epicHash = meta?.epicHash ?? fromName?.epicHash;
		const storyId = meta?.storyId ?? fromName?.storyId;
		if (typeof epicHash !== 'string' || (!EPIC_WORKFLOWS.has(workflow ?? '') && typeof storyId !== 'string')) {
			// The stage cannot be told: only a repo that enforces claims (or whose policy cannot be read) refuses
			const enforced = await claimsEnforcedFor(repoPath);
			if (enforced === 'no') return undefined;
			return { outcome: { kind: 'refused', reason: enforced === 'yes' ? 'cannot tell which stage this approval is for (the artifact has no epic or story)' : enforced }, subject: undefined };
		}
		const epic: UnitRef = { unit: 'epic', repoPath, epicHash };
		if (!isBuild && EPIC_WORKFLOWS.has(workflow ?? '')) return await check(repoPath, epic, undefined);
		const story: UnitRef = { unit: 'story', repoPath, epicHash, storyId: storyId as string };
		if (!isBuild) return await check(repoPath, story, undefined);

		// BUILD: the Story's Tasks, or the Story itself when it has none (a standalone BUILD is such a Story)
		// Standalone-ness is what the BUILD record will inherit from its upstream (the record may not exist yet)
		const standalone = meta?.standalone === true || inheritedStoryStandalone(repoPath, epicHash, storyId as string) === true;
		const tasks = standalone ? { ok: true as const, ids: [] as string[] } : taskIdsOf(repoPath, epicHash, storyId as string);
		if (!tasks.ok) {
			// Cannot tell which Tasks the Story has: refuse where claims are enforced, so a Task claim is never skipped
			const enforced = await claimsEnforcedFor(repoPath);
			if (enforced === 'no') return undefined;
			return { outcome: { kind: 'refused', reason: enforced === 'yes' ? tasks.reason : enforced }, subject: undefined };
		}
		if (tasks.ids.length === 0) return await check(repoPath, story, undefined);
		for (const taskId of tasks.ids) {
			const refusal = await check(repoPath, { unit: 'task', repoPath, epicHash, storyId: storyId as string, taskId }, `task ${taskId}`);
			if (refusal !== undefined) return refusal;
		}
		return undefined;
	} catch (err) {
		// a denied tracker call stops the stage; it is never a generic refusal
		if (isToolDenied(err)) throw err;
		return { outcome: { kind: 'refused', reason: `cannot authorize this approval: ${err instanceof Error ? err.message : String(err)}` }, subject: undefined };
	}
}
