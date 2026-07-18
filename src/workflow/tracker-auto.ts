/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Approve-time GitHub tracker integration — the DETERMINISTIC path
 * (used when there's no capable LLM agent driving GitHub, e.g. Ollama
 * or a human `insrc workflow approve`). It shells out to `gh` directly
 * via the shared `tracker/` module (`github.ts` ops, `conventions.ts`
 * renderers) so it produces the same issues as the LLM coarse-handoff
 * path.
 *
 * On HLD approve → create/adopt the Epic issue; on LLD approve →
 * create/adopt the Story issue + splice it into the Epic task list.
 * In both cases the framework then:
 *   - writes the ref into the artifact's `meta.tracker` (nested; the
 *     chain report + coarse-handoff runners read there too),
 *   - RE-RENDERS the human-facing `.md` so the doc shows a
 *     `**Tracker:** owner/repo#N` link back to the issue (doc → issue),
 *   - posts the design summary as an issue comment.
 *
 * Idempotent + fail-open: an existing ref (in meta or discoverable by
 * label) is adopted, not duplicated; missing `gh`/config/auth → skip
 * without undoing the approve.
 */

import { readFileSync } from 'node:fs';

import { getLogger } from '../shared/logger.js';
import { readDefineArtifact, readHldArtifact } from './gates.js';
import { readLldArtifact } from './artifacts/lld-io.js';
import { renderDefineMarkdown, type DefineArtifact } from './artifacts/define.js';
import { renderHldMarkdown } from './artifacts/hld.js';
import { renderLldMarkdown } from './artifacts/lld.js';
import type { PlanArtifact, PlanTask } from './artifacts/plan.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths, writeAtomic } from './storage.js';
import { GithubConfigError, resolveGithubConfig, type ResolvedGithubConfig } from './config/github.js';
import {
	ghAttachMilestone, ghAuthOk, ghComment, ghCreateIssue, ghCreateIssueTyped, ghCreateLabel,
	ghEditIssueBody, ghEnsureMilestone, ghFindIssueByLabels, ghGetIssueBody, ghLinkSubIssue,
	type CreatedIssue,
} from './tracker/github.js';
import {
	allTrackerLabels, epicMembershipLabel, renderEpicBody, renderStoryBody, renderTaskBody,
	renderTrackerHldSummary, renderTrackerLldSummary, updateEpicTaskList,
} from './tracker/conventions.js';
import { patchTrackerMeta, readTrackerMeta, type TrackerMeta } from './tracker/refs.js';

const log = getLogger('workflow:tracker-auto');

export type AutoPushResult =
	| { readonly status: 'created';        readonly epicRef?: string; readonly storyRef?: string; readonly taskRefs?: Readonly<Record<string, string>>; readonly labelsCreated?: readonly string[] }
	| { readonly status: 'already-exists'; readonly epicRef?: string; readonly storyRef?: string; readonly taskRefs?: Readonly<Record<string, string>> }
	| { readonly status: 'skipped';        readonly reason: string }
	| { readonly status: 'failed';         readonly reason: string };

interface MetaShape {
	readonly repoPath?:  string;
	readonly epicHash?:  string;
	readonly epicSlug?:  string;
	readonly storyId?:   string;
	readonly tracker?:   TrackerMeta;
	readonly [k: string]: unknown;
}

function readMeta(path: string): MetaShape {
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as { meta?: MetaShape };
	if (typeof parsed !== 'object' || parsed === null || typeof parsed.meta !== 'object' || parsed.meta === null) {
		throw new Error(`file at ${path} has no meta object`);
	}
	return parsed.meta;
}

/** Resolve config + gh-auth gates shared by both entry points. Returns
 *  a github config or a skip result. */
function gate(repoPath: string): { cfg: Extract<ResolvedGithubConfig, { type: 'github' }> } | { skip: AutoPushResult } {
	let cfg: ResolvedGithubConfig;
	try {
		cfg = resolveGithubConfig(repoPath);
	} catch (err) {
		if (err instanceof GithubConfigError) return { skip: { status: 'skipped', reason: err.message } };
		throw err;
	}
	if (cfg.type === 'none') return { skip: { status: 'skipped', reason: `tracker disabled via config (source: ${cfg.source})` } };
	const auth = ghAuthOk();
	if (!auth.ok) return { skip: { status: 'skipped', reason: auth.reason } };
	return { cfg };
}

// ---------------------------------------------------------------------------
// HLD → Epic issue
// ---------------------------------------------------------------------------

export function autoPushEpicOnHld(hldJsonPath: string): AutoPushResult {
	const meta = readMeta(hldJsonPath);
	if (typeof meta.tracker?.epicRef === 'string' && meta.tracker.epicRef.length > 0) {
		return { status: 'already-exists', epicRef: meta.tracker.epicRef };
	}
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'HLD meta is missing epicHash / epicSlug / repoPath' };
	}
	const { epicHash, epicSlug, repoPath } = { epicHash: meta.epicHash, epicSlug: meta.epicSlug, repoPath: meta.repoPath };

	const g = gate(repoPath);
	if ('skip' in g) return g.skip;
	const cfg = g.cfg;

	let define: DefineArtifact;
	try { define = readDefineArtifact(repoPath, epicHash); }
	catch (err) { return { status: 'failed', reason: `cannot read parent Define: ${(err as Error).message}` }; }

	// Duplicate guard: adopt an existing Epic issue (unique by epic +
	// epic-membership labels) rather than creating a second one.
	const membership = epicMembershipLabel(epicSlug);
	const adopted = ghFindIssueByLabels(cfg.owner, cfg.repo, [cfg.epicLabel, membership]);
	let epicRef: string;
	let created: string[] = [];
	if (adopted !== undefined) {
		epicRef = adopted;
	} else {
		for (const label of allTrackerLabels(cfg.epicLabel, cfg.storyLabel, epicSlug)) {
			if (ghCreateLabel(cfg.owner, cfg.repo, label)) created.push(label);
		}
		try {
			epicRef = ghCreateIssue(cfg.owner, cfg.repo, `Epic: ${firstSentence(define.body.problem)}`,
				renderEpicBody(define, epicSlug, { owner: cfg.owner, repo: cfg.repo }), [cfg.epicLabel, membership]);
		} catch (err) { return { status: 'failed', reason: `gh issue create failed: ${(err as Error).message}` }; }
		if (cfg.useMilestones) bestEffort('milestone', () => { ghEnsureMilestone(cfg.owner, cfg.repo, epicSlug); ghAttachMilestone(cfg.owner, cfg.repo, epicRef, epicSlug); });
	}

	// Persist the ref (firm): on the HLD (its own doc link) and on the
	// Define (the Epic-level aggregate the chain report + LLD flow read).
	const now = new Date().toISOString();
	patchTrackerMeta(hldJsonPath, { epicRef, pushedAt: now, ...(created.length > 0 ? { labelsCreated: created } : {}) });
	const definePaths = defineArtifactPaths(repoPath, epicHash, epicSlug);
	patchTrackerMeta(definePaths.json, { epicRef, pushedAt: now });
	// Re-render both docs so each shows the `**Tracker:** owner/repo#N` link.
	relink(hldArtifactPaths(repoPath, epicHash, epicSlug).md, () => renderHldMarkdown(readHldArtifact(repoPath, epicHash)));
	relink(definePaths.md, () => renderDefineMarkdown(readDefineArtifact(repoPath, epicHash)));

	if (adopted === undefined) bestEffort('comment', () => ghComment(cfg.owner, cfg.repo, epicRef, renderTrackerHldSummary(readHldArtifact(repoPath, epicHash))));

	return adopted !== undefined ? { status: 'already-exists', epicRef } : { status: 'created', epicRef, labelsCreated: created };
}

// ---------------------------------------------------------------------------
// LLD → Story issue + Epic task-list splice
// ---------------------------------------------------------------------------

export function autoPushStoryOnLld(lldJsonPath: string): AutoPushResult {
	const meta = readMeta(lldJsonPath);
	if (typeof meta.tracker?.storyRef === 'string' && meta.tracker.storyRef.length > 0) {
		return { status: 'already-exists', storyRef: meta.tracker.storyRef };
	}
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.storyId !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'LLD meta is missing epicHash / epicSlug / storyId / repoPath' };
	}
	const { epicHash, epicSlug, storyId, repoPath } = { epicHash: meta.epicHash, epicSlug: meta.epicSlug, storyId: meta.storyId, repoPath: meta.repoPath };

	const g = gate(repoPath);
	if ('skip' in g) return g.skip;
	const cfg = g.cfg;

	let define: DefineArtifact;
	try { define = readDefineArtifact(repoPath, epicHash); }
	catch (err) { return { status: 'failed', reason: `cannot read parent Define: ${(err as Error).message}` }; }
	const story = define.body.stories.find(s => s.id === storyId);
	if (story === undefined) return { status: 'failed', reason: `Story '${storyId}' not present in Define body` };

	// The Define carries the Epic-level aggregate (epicRef + storyRefs),
	// written when the HLD was approved. It must have the Epic ref first.
	const defineTracker = (define.meta as { tracker?: TrackerMeta }).tracker;
	const epicRef = defineTracker?.epicRef;
	if (typeof epicRef !== 'string' || epicRef.length === 0) {
		return { status: 'skipped', reason: 'Epic not pushed yet; approve the HLD (with tracker) first' };
	}

	// Duplicate guard: adopt from the Epic's storyRefs map if present.
	const adopted = defineTracker?.storyRefs?.[storyId];
	let storyRef: string;
	if (typeof adopted === 'string' && adopted.length > 0) {
		storyRef = adopted;
	} else {
		try {
			storyRef = ghCreateIssue(cfg.owner, cfg.repo, `${storyId}: ${story.title}`,
				renderStoryBody(epicRef, story, epicSlug, { owner: cfg.owner, repo: cfg.repo }), [cfg.storyLabel, epicMembershipLabel(epicSlug)]);
		} catch (err) { return { status: 'failed', reason: `gh issue create failed: ${(err as Error).message}` }; }
		if (cfg.useMilestones) bestEffort('milestone', () => ghAttachMilestone(cfg.owner, cfg.repo, storyRef, epicSlug));
	}

	// Persist: storyRef on the LLD (its doc link) + aggregate into the
	// Define's storyRefs map. Re-render the LLD doc with the issue link.
	patchTrackerMeta(lldJsonPath, { storyRef, pushedAt: new Date().toISOString() });
	relink(lldArtifactPaths(repoPath, epicHash, storyId, epicSlug).md, () => renderLldMarkdown(readLldArtifact(repoPath, epicHash, storyId)));
	patchTrackerMeta(defineArtifactPaths(repoPath, epicHash, epicSlug).json, { storyRefs: { ...(defineTracker?.storyRefs ?? {}), [storyId]: storyRef } });

	if (adopted === undefined) {
		bestEffort('tasklist', () => {
			const current = ghGetIssueBody(cfg.owner, cfg.repo, epicRef);
			const updated = updateEpicTaskList(current, storyId, storyRef, story.title);
			if (updated !== current) ghEditIssueBody(cfg.owner, cfg.repo, epicRef, updated);
		});
		bestEffort('comment', () => ghComment(cfg.owner, cfg.repo, storyRef, renderTrackerLldSummary(readLldArtifact(repoPath, epicHash, storyId))));
	}

	return adopted !== undefined ? { status: 'already-exists', storyRef } : { status: 'created', storyRef };
}

// ---------------------------------------------------------------------------
// Plan → Task issues (sub-issues of the Story, native issue type Task)
// ---------------------------------------------------------------------------

/** On plan approve, create one GitHub issue per PlanTask — typed `Task`
 *  (best-effort) and linked as a sub-issue of the Story issue. Opt-in via
 *  `pushTasks` in the github config. Idempotent: adopts refs already in
 *  `meta.tracker.taskRefs`; requires the Story issue to exist first. */
export function autoPushTasksOnPlan(planJsonPath: string): AutoPushResult {
	const meta = readMeta(planJsonPath);
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.storyId !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'Plan meta is missing epicHash / epicSlug / storyId / repoPath' };
	}
	const { epicHash, epicSlug, storyId, repoPath } = { epicHash: meta.epicHash, epicSlug: meta.epicSlug, storyId: meta.storyId, repoPath: meta.repoPath };

	const g = gate(repoPath);
	if ('skip' in g) return g.skip;
	const cfg = g.cfg;
	if (!cfg.pushTasks) {
		return { status: 'skipped', reason: 'task push disabled (set "pushTasks": true in ~/.insrc/github.json to enable)' };
	}

	// Resolve the parent Story issue: prefer the Epic-level aggregate on the
	// Define, fall back to the LLD's own storyRef. Tasks can't be pushed
	// before their Story exists.
	let define: DefineArtifact;
	try { define = readDefineArtifact(repoPath, epicHash); }
	catch (err) { return { status: 'failed', reason: `cannot read parent Define: ${(err as Error).message}` }; }
	const defineTracker = (define.meta as { tracker?: TrackerMeta }).tracker;
	let storyRef = defineTracker?.storyRefs?.[storyId];
	if (typeof storyRef !== 'string' || storyRef.length === 0) {
		storyRef = readTrackerMeta(lldArtifactPaths(repoPath, epicHash, storyId).json)?.storyRef;
	}
	if (typeof storyRef !== 'string' || storyRef.length === 0) {
		return { status: 'skipped', reason: 'Story not pushed yet; approve the LLD (with tracker) first' };
	}
	const parentStoryRef = storyRef;

	// Read the finalized Tasks off the plan artifact.
	let tasks: readonly PlanTask[];
	try {
		const plan = JSON.parse(readFileSync(planJsonPath, 'utf8')) as PlanArtifact;
		tasks = plan.body?.tasks ?? [];
	} catch (err) { return { status: 'failed', reason: `cannot read plan tasks: ${(err as Error).message}` }; }
	if (tasks.length === 0) return { status: 'skipped', reason: 'plan has no tasks' };

	// Ensure the task + membership labels exist (idempotent, best-effort).
	const membership = epicMembershipLabel(epicSlug);
	const created: string[] = [];
	for (const label of [cfg.taskLabel, membership]) {
		if (ghCreateLabel(cfg.owner, cfg.repo, label)) created.push(label);
	}

	const taskRefs: Record<string, string> = { ...(meta.tracker?.taskRefs ?? {}) };
	let createdCount = 0;
	for (const task of [...tasks].sort((a, b) => a.order - b.order)) {
		const existing = taskRefs[task.id];
		if (typeof existing === 'string' && existing.length > 0) continue;   // adopt
		let issue: CreatedIssue;
		try {
			issue = ghCreateIssueTyped(
				cfg.owner, cfg.repo, `${storyId}/${task.id}: ${task.title}`,
				renderTaskBody(parentStoryRef, storyId, task, epicSlug, { owner: cfg.owner, repo: cfg.repo }),
				[cfg.taskLabel, membership], cfg.taskIssueType,
			);
		} catch (err) { return { status: 'failed', reason: `gh issue create (task ${task.id}) failed: ${(err as Error).message}` }; }
		taskRefs[task.id] = issue.ref;
		createdCount += 1;
		bestEffort(`sub-issue ${task.id}`, () => ghLinkSubIssue(cfg.owner, cfg.repo, parentStoryRef, issue.id));
		if (!issue.typed) log.info({ task: task.id, type: cfg.taskIssueType }, 'task issue created untyped (org may not have the issue type)');
	}

	patchTrackerMeta(planJsonPath, { taskRefs, pushedAt: new Date().toISOString(), ...(created.length > 0 ? { labelsCreated: created } : {}) });

	return createdCount > 0
		? { status: 'created', taskRefs, ...(created.length > 0 ? { labelsCreated: created } : {}) }
		: { status: 'already-exists', taskRefs };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Re-render + atomically write a doc's markdown (the JSON meta.tracker
 *  must already be patched so the render picks up the tracker link). */
function relink(mdPath: string, render: () => string): void {
	try { writeAtomic(mdPath, render()); }
	catch (err) { log.warn({ mdPath, err: (err as Error).message }, 'failed to re-render doc with tracker link'); }
}

/** Run a non-critical side effect; log + swallow failures. */
function bestEffort(what: string, fn: () => void): void {
	try { fn(); } catch (err) { log.warn({ what, err: (err as Error).message }, 'tracker side-effect failed'); }
}

function firstSentence(s: string): string {
	const m = /^(.+?[.!?])\s/.exec(s);
	if (m !== null) return m[1]!;
	return s.length > 80 ? s.slice(0, 77) + '...' : s;
}
