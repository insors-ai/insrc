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
import { artifactJsonPath, defineArtifactId, defineArtifactPaths, hldArtifactPaths, lldArtifactId, lldArtifactPaths, readEpicCreatedAt, writeAtomic } from './storage.js';
import { GithubConfigError, resolveGithubConfig, type ResolvedGithubConfig } from './config/github.js';
import { GhCommandError, ghAuthOk } from './tracker/github.js';
import { createGithubTracker } from './tracker/github-adapter.js';
import type { CreatedIssue, IssueOps, PortResult, TrackerPort } from './tracker/port.js';
import {
	allTrackerLabels, epicMembershipLabel, renderEpicBody, renderStoryBody, renderTaskBody,
	renderTrackerHldSummary, renderTrackerLldSummary, updateEpicTaskList,
} from './tracker/conventions.js';
import { patchTrackerMeta, readTrackerMeta, type TrackerMeta, type UnitRef } from './tracker/refs.js';
import { ensureUnitIssueDetailed, runUnitExtras, type ExtraStep } from './tracker/unit-issue.js';
import { policyReader } from './team/policy-reader.js';
import type { PolicyReader } from './team/types.js';
import { epicWorkflowId, storyWorkflowId, taskWorkflowId, safeCanonical } from './id.js';
import { renderReviewReport } from './review/index.js';
import type { ReviewReport } from './review/types.js';
import { renderResolvedQuestionsSection } from './questions.js';
import { renderCitationBlock } from './synthesizer.js';
import type { Citation, QuestionResolution } from './types.js';

const log = getLogger('workflow:tracker-auto');


/** Team mode only: an approve-time extra that did not run (the issue itself is fine; the next approve retries it). */
export type ExtrasFailed = readonly { readonly name: string; readonly reason: string }[];

export type AutoPushResult =
	| { readonly status: 'created';        readonly epicRef?: string; readonly storyRef?: string; readonly taskRefs?: Readonly<Record<string, string>>; readonly labelsCreated?: readonly string[]; readonly extrasFailed?: ExtrasFailed }
	| { readonly status: 'already-exists'; readonly epicRef?: string; readonly storyRef?: string; readonly taskRefs?: Readonly<Record<string, string>>; readonly extrasFailed?: ExtrasFailed }
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

function legacyPushEpic(hldJsonPath: string): AutoPushResult {
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
	const port = createGithubTracker(cfg.owner, cfg.repo);
	const ops = port.issueOps;

	let define: DefineArtifact;
	try { define = readDefineArtifact(repoPath, epicHash); }
	catch (err) { return { status: 'failed', reason: `cannot read parent Define: ${(err as Error).message}` }; }

	// Duplicate guard: adopt an existing Epic issue (unique by epic +
	// epic-membership labels) rather than creating a second one.
	const membership = epicMembershipLabel(epicSlug);
	// A failed lookup reads as "not found" (as before), so the Epic is created.
	const found = port.findIssue([cfg.epicLabel, membership]);
	const adopted = found.ok ? found.value ?? undefined : undefined;
	let epicRef: string;
	let created: string[] = [];
	if (adopted !== undefined) {
		epicRef = adopted;
	} else {
		for (const label of allTrackerLabels(cfg.epicLabel, cfg.storyLabel, epicSlug)) {
			if (ops.ensureLabel(label)) created.push(label);
		}
		try {
			const epicWid = safeCanonical(() => epicWorkflowId(epicHash, define.meta.createdAt));
			const title = epicWid !== undefined ? `${epicWid} — ${firstSentence(define.body.problem)}` : `Epic: ${firstSentence(define.body.problem)}`;
			// ghCreateIssueTyped applies the native `Epic` issue type (fail-open to
			// untyped if the org lacks it).
			epicRef = unwrap(ops.create({
				title, body: renderEpicBody(define, epicSlug, { owner: cfg.owner, repo: cfg.repo }, epicWid),
				labels: [cfg.epicLabel, membership], issueType: cfg.epicIssueType,
			})).ref;
		} catch (err) { return { status: 'failed', reason: `gh issue create failed: ${(err as Error).message}` }; }
		if (cfg.useMilestones) bestEffort('milestone', () => { ops.ensureMilestone(epicSlug); unwrap(ops.attachMilestone(epicRef, epicSlug)); });
	}

	// Persist the ref (firm): on the HLD (its own doc link) and on the
	// Define (the Epic-level aggregate the chain report + LLD flow read).
	const now = new Date().toISOString();
	// Epic docs — keyed on the Epic's define createdAt anchor (sc2), all 'epic'.
	const anchor = readEpicCreatedAt(repoPath, epicHash) ?? now;
	patchTrackerMeta(hldJsonPath, { epicRef, pushedAt: now, ...(created.length > 0 ? { labelsCreated: created } : {}) });
	const definePaths = defineArtifactPaths(repoPath, epicHash, anchor, 'epic', epicSlug);
	patchTrackerMeta(definePaths.json, { epicRef, pushedAt: now });
	// Re-render both docs so each shows the `**Tracker:** owner/repo#N` link.
	relink(hldArtifactPaths(repoPath, epicHash, anchor, 'epic', epicSlug).md, () => { const a = readHldArtifact(repoPath, epicHash); return withResolvedTail(a.meta, a.citations, renderHldMarkdown(a)); });
	relink(definePaths.md, () => { const a = readDefineArtifact(repoPath, epicHash); return withResolvedTail(a.meta, a.citations, renderDefineMarkdown(a)); });

	if (adopted === undefined) bestEffort('comment', () => unwrap(ops.comment(epicRef, renderTrackerHldSummary(readHldArtifact(repoPath, epicHash)))));
	postReviewComment(ops, epicRef, hldJsonPath);

	return adopted !== undefined ? { status: 'already-exists', epicRef } : { status: 'created', epicRef, labelsCreated: created };
}

// ---------------------------------------------------------------------------
// LLD → Story issue + Epic task-list splice
// ---------------------------------------------------------------------------

function legacyPushStory(lldJsonPath: string): AutoPushResult {
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
	const port = createGithubTracker(cfg.owner, cfg.repo);
	const ops = port.issueOps;

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
		let created: CreatedIssue;
		try {
			const storyWid = safeCanonical(() => storyWorkflowId(epicHash, define.meta.createdAt, storyId));
			const title = storyWid !== undefined ? `${storyWid} — ${story.title}` : `${storyId}: ${story.title}`;
			// ghCreateIssueTyped (REST) returns the DB id needed to link a
			// native sub-issue; stories stay untyped (no issueType passed).
			created = unwrap(ops.create({
				title, body: renderStoryBody(epicRef, story, epicSlug, epicHash, define.meta.createdAt, { owner: cfg.owner, repo: cfg.repo }, storyWid),
				labels: [cfg.storyLabel, epicMembershipLabel(epicSlug)], issueType: cfg.storyIssueType,
			}));
		} catch (err) { return { status: 'failed', reason: `gh issue create failed: ${(err as Error).message}` }; }
		storyRef = created.ref;
		// Link the Story as a NATIVE sub-issue of its Epic — mirrors the
		// Task→Story link, so the full Epic→Story→Task hierarchy + progress
		// rollups render in the issues UI and any Project (was previously only
		// the markdown task-list in the Epic body).
		bestEffort('epic sub-issue', () => unwrap(ops.linkSubIssue(epicRef, created.id)));
		if (cfg.useMilestones) bestEffort('milestone', () => unwrap(ops.attachMilestone(storyRef, epicSlug)));
	}

	// Persist: storyRef on the LLD (its doc link) + aggregate into the
	// Define's storyRefs map. Re-render the LLD doc with the issue link.
	patchTrackerMeta(lldJsonPath, { storyRef, pushedAt: new Date().toISOString() });
	const storyAnchor = readEpicCreatedAt(repoPath, epicHash) ?? new Date().toISOString();
	relink(lldArtifactPaths(repoPath, epicHash, storyId, storyAnchor, 'epic', epicSlug).md, () => { const a = readLldArtifact(repoPath, epicHash, storyId); return withResolvedTail(a.meta, a.citations, renderLldMarkdown(a)); });
	patchTrackerMeta(artifactJsonPath(repoPath, defineArtifactId(epicHash)), { storyRefs: { ...(defineTracker?.storyRefs ?? {}), [storyId]: storyRef } });

	if (adopted === undefined) {
		bestEffort('tasklist', () => {
			const current = unwrap(ops.readBody(epicRef));
			const updated = updateEpicTaskList(current, storyId, storyRef, story.title);
			if (updated !== current) unwrap(ops.writeBody(epicRef, updated));
		});
		bestEffort('comment', () => unwrap(ops.comment(storyRef, renderTrackerLldSummary(readLldArtifact(repoPath, epicHash, storyId)))));
	postReviewComment(ops, storyRef, lldJsonPath);
	}

	return adopted !== undefined ? { status: 'already-exists', storyRef } : { status: 'created', storyRef };
}

// ---------------------------------------------------------------------------
// Plan → Task issues (sub-issues of the Story, native issue type Task)
// ---------------------------------------------------------------------------

/** (Legacy mode.) On plan approve, create one GitHub issue per PlanTask — typed `Task`
 *  (best-effort) and linked as a sub-issue of the Story issue. Opt-in via
 *  `pushTasks` in the github config. Idempotent: adopts refs already in
 *  `meta.tracker.taskRefs`; requires the Story issue to exist first. */
function legacyPushTasks(planJsonPath: string): AutoPushResult {
	const meta = readMeta(planJsonPath);
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.storyId !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'Plan meta is missing epicHash / epicSlug / storyId / repoPath' };
	}
	const { epicHash, epicSlug, storyId, repoPath } = { epicHash: meta.epicHash, epicSlug: meta.epicSlug, storyId: meta.storyId, repoPath: meta.repoPath };

	const g = gate(repoPath);
	if ('skip' in g) return g.skip;
	const cfg = g.cfg;
	const port = createGithubTracker(cfg.owner, cfg.repo);
	const ops = port.issueOps;
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
		storyRef = readTrackerMeta(artifactJsonPath(repoPath, lldArtifactId(epicHash, storyId)))?.storyRef;
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

	// R4: the plan's review lands on its parent Story issue.
	postReviewComment(ops, storyRef, planJsonPath);

	// Ensure the task + membership labels exist (idempotent, best-effort).
	const membership = epicMembershipLabel(epicSlug);
	const created: string[] = [];
	for (const label of [cfg.taskLabel, membership]) {
		if (ops.ensureLabel(label)) created.push(label);
	}

	const taskRefs: Record<string, string> = { ...(meta.tracker?.taskRefs ?? {}) };
	let createdCount = 0;
	for (const task of [...tasks].sort((a, b) => a.order - b.order)) {
		const existing = taskRefs[task.id];
		if (typeof existing === 'string' && existing.length > 0) continue;   // adopt
		let issue: CreatedIssue;
		try {
			const taskWid = safeCanonical(() => taskWorkflowId(epicHash, define.meta.createdAt, storyId, task.id));
			const taskTitle = taskWid !== undefined ? `${taskWid} — ${task.title}` : `${storyId}/${task.id}: ${task.title}`;
			issue = unwrap(ops.create({
				title: taskTitle,
				body: renderTaskBody(parentStoryRef, storyId, task, epicSlug, epicHash, define.meta.createdAt, { owner: cfg.owner, repo: cfg.repo }, taskWid),
				labels: [cfg.taskLabel, membership], issueType: cfg.taskIssueType,
			}));
		} catch (err) { return { status: 'failed', reason: `gh issue create (task ${task.id}) failed: ${(err as Error).message}` }; }
		taskRefs[task.id] = issue.ref;
		createdCount += 1;
		bestEffort(`sub-issue ${task.id}`, () => unwrap(ops.linkSubIssue(parentStoryRef, issue.id)));
		if (!issue.typed) log.info({ task: task.id, type: cfg.taskIssueType }, 'task issue created untyped (org may not have the issue type)');
	}

	patchTrackerMeta(planJsonPath, { taskRefs, pushedAt: new Date().toISOString(), ...(created.length > 0 ? { labelsCreated: created } : {}) });

	return createdCount > 0
		? { status: 'created', taskRefs, ...(created.length > 0 ? { labelsCreated: created } : {}) }
		: { status: 'already-exists', taskRefs };
}

// ---------------------------------------------------------------------------
// Mode: legacy (no policy, or teamMode false) or team
// ---------------------------------------------------------------------------

/** Seams for tests; the production call sites set none (the three exported signatures take only the path). */
export interface AutoPushDeps {
	readonly policy?: PolicyReader;
	/** A tracker port to use instead of the GitHub one (its auth check is skipped). */
	readonly port?:   TrackerPort;
}

let testDeps: AutoPushDeps = {};

/** Test seam: inject the policy reader and tracker port; call with no argument to reset. */
export function _setAutoPushDepsForTests(deps: AutoPushDeps = {}): void { testDeps = deps; }

type Mode = 'legacy' | 'team' | { readonly failed: string };

/** A repo with no policy, or with teamMode off, keeps today's behaviour exactly (k4). */
function pickMode(repoPath: string, deps: AutoPushDeps): Mode {
	const p = (deps.policy ?? policyReader)(repoPath);
	if (!p.ok) return { failed: `the team policy cannot be read: ${p.reason}` };
	return p.value !== 'none' && p.value.teamMode ? 'team' : 'legacy';
}

function modeFor(meta: MetaShape, deps: AutoPushDeps): Mode {
	return typeof meta.repoPath === 'string' ? pickMode(meta.repoPath, deps) : 'legacy';
}

export function autoPushEpicOnHld(hldJsonPath: string): AutoPushResult {
	const deps = testDeps;
	const meta = readMeta(hldJsonPath);
	const mode = modeFor(meta, deps);
	if (typeof mode === 'object') return { status: 'failed', reason: mode.failed };
	return mode === 'team' ? teamPushEpic(hldJsonPath, meta, deps) : legacyPushEpic(hldJsonPath);
}

export function autoPushStoryOnLld(lldJsonPath: string): AutoPushResult {
	const deps = testDeps;
	const meta = readMeta(lldJsonPath);
	const mode = modeFor(meta, deps);
	if (typeof mode === 'object') return { status: 'failed', reason: mode.failed };
	return mode === 'team' ? teamPushStory(lldJsonPath, meta, deps) : legacyPushStory(lldJsonPath);
}

export function autoPushTasksOnPlan(planJsonPath: string): AutoPushResult {
	const deps = testDeps;
	const meta = readMeta(planJsonPath);
	const mode = modeFor(meta, deps);
	if (typeof mode === 'object') return { status: 'failed', reason: mode.failed };
	return mode === 'team' ? teamPushTasks(planJsonPath, meta, deps) : legacyPushTasks(planJsonPath);
}

// ---------------------------------------------------------------------------
// Team mode: adopt what the draft hook created, create only what is missing, and
// run each extra as its own marked step (see tracker/unit-issue.ts)
// ---------------------------------------------------------------------------

type GithubCfg = Extract<ResolvedGithubConfig, { type: 'github' }>;

function teamGate(repoPath: string, deps: AutoPushDeps): { cfg: GithubCfg; port: TrackerPort } | { skip: AutoPushResult } {
	const g = deps.port !== undefined ? gateNoAuth(repoPath) : gate(repoPath);
	if ('skip' in g) return g;
	return { cfg: g.cfg, port: deps.port ?? createGithubTracker(g.cfg.owner, g.cfg.repo) };
}

function gateNoAuth(repoPath: string): { cfg: GithubCfg } | { skip: AutoPushResult } {
	try {
		const cfg = resolveGithubConfig(repoPath);
		return cfg.type === 'none' ? { skip: { status: 'skipped', reason: `tracker disabled via config (source: ${cfg.source})` } } : { cfg };
	} catch (err) {
		if (err instanceof GithubConfigError) return { skip: { status: 'skipped', reason: err.message } };
		throw err;
	}
}

const failedResult = (reason: string): AutoPushResult => ({ status: 'failed', reason });

function withExtras<T extends object>(base: T, failed: ExtrasFailed): T & { extrasFailed?: ExtrasFailed } {
	return failed.length > 0 ? { ...base, extrasFailed: failed } : base;
}

/** A step whose runner throws (a summary renderer on a malformed body) fails as a step instead of escaping. */
function guarded(step: ExtraStep): ExtraStep {
	return { name: step.name, run: () => { try { return step.run(); } catch (err) { return { ok: false, reason: (err as Error).message, kind: 'rejected' }; } } };
}

/** The review comment step, only when the artifact carries a review. */
function reviewStep(ops: IssueOps, ref: string, jsonPath: string): ExtraStep[] {
	const review = readReview(jsonPath);
	return review === undefined ? [] : [{ name: 'reviewComment', run: () => ops.comment(ref, `<!-- insrc:review -->\n${renderReviewReport(review)}`) }];
}

function milestoneStep(ops: IssueOps, cfg: GithubCfg, ref: string, epicSlug: string): ExtraStep[] {
	return cfg.useMilestones ? [{ name: 'milestone', run: () => { ops.ensureMilestone(epicSlug); return ops.attachMilestone(ref, epicSlug); } }] : [];
}

function teamPushEpic(hldJsonPath: string, meta: MetaShape, deps: AutoPushDeps): AutoPushResult {
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'HLD meta is missing epicHash / epicSlug / repoPath' };
	}
	const { epicHash, epicSlug, repoPath } = { epicHash: meta.epicHash, epicSlug: meta.epicSlug, repoPath: meta.repoPath };
	const g = teamGate(repoPath, deps);
	if ('skip' in g) return g.skip;
	const { cfg, port } = g;
	const unit: UnitRef = { unit: 'epic', repoPath, epicHash };

	const ensured = ensureUnitIssueDetailed(unit, port);
	if (!ensured.ok) return failedResult(`the Epic issue could not be ensured: ${ensured.reason}`);
	const epicRef = ensured.value.issue;

	const now = new Date().toISOString();
	const anchor = readEpicCreatedAt(repoPath, epicHash) ?? now;
	patchTrackerMeta(hldJsonPath, { epicRef, pushedAt: now });
	const definePaths = defineArtifactPaths(repoPath, epicHash, anchor, 'epic', epicSlug);
	patchTrackerMeta(definePaths.json, { epicRef, pushedAt: now });
	relink(hldArtifactPaths(repoPath, epicHash, anchor, 'epic', epicSlug).md, () => { const a = readHldArtifact(repoPath, epicHash); return withResolvedTail(a.meta, a.citations, renderHldMarkdown(a)); });
	relink(definePaths.md, () => { const a = readDefineArtifact(repoPath, epicHash); return withResolvedTail(a.meta, a.citations, renderDefineMarkdown(a)); });

	const ops = port.issueOps;
	const out = runUnitExtras(unit, ([
		...milestoneStep(ops, cfg, epicRef, epicSlug),
		{ name: 'designComment', run: () => ops.comment(epicRef, renderTrackerHldSummary(readHldArtifact(repoPath, epicHash))) },
		...reviewStep(ops, epicRef, hldJsonPath),
	] as ExtraStep[]).map(guarded));
	return withExtras(ensured.value.created ? { status: 'created' as const, epicRef } : { status: 'already-exists' as const, epicRef }, out.failed);
}

function teamPushStory(lldJsonPath: string, meta: MetaShape, deps: AutoPushDeps): AutoPushResult {
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.storyId !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'LLD meta is missing epicHash / epicSlug / storyId / repoPath' };
	}
	const { epicHash, epicSlug, storyId, repoPath } = { epicHash: meta.epicHash, epicSlug: meta.epicSlug, storyId: meta.storyId, repoPath: meta.repoPath };
	const g = teamGate(repoPath, deps);
	if ('skip' in g) return g.skip;
	const { cfg, port } = g;

	let define: DefineArtifact;
	try { define = readDefineArtifact(repoPath, epicHash); }
	catch (err) { return failedResult(`cannot read parent Define: ${(err as Error).message}`); }
	const story = define.body.stories.find(s => s.id === storyId);
	if (story === undefined) return failedResult(`Story '${storyId}' not present in Define body`);

	const epic = ensureUnitIssueDetailed({ unit: 'epic', repoPath, epicHash }, port);
	if (!epic.ok) return failedResult(`the Epic issue could not be ensured: ${epic.reason}`);
	const epicRef = epic.value.issue;
	const unit: UnitRef = { unit: 'story', repoPath, epicHash, storyId };
	const ensured = ensureUnitIssueDetailed(unit, port);
	if (!ensured.ok) return failedResult(`the Story issue could not be ensured: ${ensured.reason}`);
	const storyRef = ensured.value.issue;

	patchTrackerMeta(lldJsonPath, { storyRef, pushedAt: new Date().toISOString() });
	const anchor = readEpicCreatedAt(repoPath, epicHash) ?? new Date().toISOString();
	relink(lldArtifactPaths(repoPath, epicHash, storyId, anchor, 'epic', epicSlug).md, () => { const a = readLldArtifact(repoPath, epicHash, storyId); return withResolvedTail(a.meta, a.citations, renderLldMarkdown(a)); });

	const ops = port.issueOps;
	const out = runUnitExtras(unit, ([
		...milestoneStep(ops, cfg, storyRef, epicSlug),
		{
			name: 'taskList',
			run: (): PortResult<void> => {
				const current = ops.readBody(epicRef);
				if (!current.ok) return current;
				const updated = updateEpicTaskList(current.value, storyId, storyRef, story.title);
				return updated === current.value ? { ok: true, value: undefined } : ops.writeBody(epicRef, updated);
			},
		},
		{ name: 'designComment', run: () => ops.comment(storyRef, renderTrackerLldSummary(readLldArtifact(repoPath, epicHash, storyId))) },
		...reviewStep(ops, storyRef, lldJsonPath),
	] as ExtraStep[]).map(guarded));
	return withExtras(ensured.value.created ? { status: 'created' as const, storyRef } : { status: 'already-exists' as const, storyRef }, out.failed);
}

function teamPushTasks(planJsonPath: string, meta: MetaShape, deps: AutoPushDeps): AutoPushResult {
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.storyId !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'Plan meta is missing epicHash / epicSlug / storyId / repoPath' };
	}
	const { epicHash, storyId, repoPath } = { epicHash: meta.epicHash, storyId: meta.storyId, repoPath: meta.repoPath };
	const g = teamGate(repoPath, deps);
	if ('skip' in g) return g.skip;
	const { port } = g;

	// Team mode makes a Task issue for every Task whatever pushTasks says (forceTaskIssues).
	let tasks: readonly PlanTask[];
	try { tasks = (JSON.parse(readFileSync(planJsonPath, 'utf8')) as PlanArtifact).body?.tasks ?? []; }
	catch (err) { return failedResult(`cannot read plan tasks: ${(err as Error).message}`); }
	if (tasks.length === 0) return { status: 'skipped', reason: 'plan has no tasks' };

	const epic = ensureUnitIssueDetailed({ unit: 'epic', repoPath, epicHash }, port);
	if (!epic.ok) return failedResult(`the Epic issue could not be ensured: ${epic.reason}`);
	const storyUnit: UnitRef = { unit: 'story', repoPath, epicHash, storyId };
	const story = ensureUnitIssueDetailed(storyUnit, port);
	if (!story.ok) return failedResult(`the Story issue could not be ensured: ${story.reason}`);

	let createdCount = 0;
	for (const task of [...tasks].sort((a, b) => a.order - b.order)) {
		const r = ensureUnitIssueDetailed({ unit: 'task', repoPath, epicHash, storyId, taskId: task.id }, port);
		if (!r.ok) return failedResult(`task ${task.id}: ${r.reason}`);
		if (r.value.created) createdCount += 1;
	}

	// The plan's review lands on its parent Story issue, once (marked on the Story's record).
	const review = readReview(planJsonPath);
	const ops = port.issueOps;
	const out = runUnitExtras(storyUnit, (review === undefined ? [] : [
		{ name: 'planComment', run: () => ops.comment(story.value.issue, `<!-- insrc:review -->\n${renderReviewReport(review)}`) },
	] as ExtraStep[]).map(guarded));
	const taskRefs = readTrackerMeta(planJsonPath)?.taskRefs ?? {};
	return withExtras(createdCount > 0 ? { status: 'created' as const, taskRefs } : { status: 'already-exists' as const, taskRefs }, out.failed);
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

/** Append the "## Resolved questions" + "## Citations" tail to a core render,
 *  matching the canonical full-md assembly in `questions.ts`. Without this a
 *  tracker relink re-renders with the bare renderer and silently drops both
 *  sections (the data stays in the JSON — this only restores the md view). */
function withResolvedTail(
	meta: { readonly questionResolutions?: Readonly<Record<string, QuestionResolution>> | undefined },
	citations: readonly Citation[],
	core: string,
): string {
	return core + renderResolvedQuestionsSection(meta.questionResolutions ?? {}) + renderCitationBlock(citations);
}

/** The one unwrapping rule: an adapter result that failed is thrown again, so the
 *  existing try/catch and bestEffort wrappers behave as they did when the gh
 *  wrappers themselves threw. */
function unwrap<T>(r: PortResult<T>): T {
	if (!r.ok) throw new GhCommandError(r.kind, r.reason);
	return r.value;
}

/** Run a non-critical side effect; log + swallow failures. */
function bestEffort(what: string, fn: () => void): void {
	try { fn(); } catch (err) { log.warn({ what, err: (err as Error).message }, 'tracker side-effect failed'); }
}

/** Read `meta.review` off an artifact JSON, or undefined if absent/unreadable. */
function readReview(jsonPath: string): ReviewReport | undefined {
	try {
		const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { review?: ReviewReport } }).meta;
		return meta?.review;
	} catch { return undefined; }
}

/** R4: post the finalize review report as an issue comment (best-effort). No
 *  comment when the artifact carries no review. */
function postReviewComment(ops: IssueOps, ref: string, jsonPath: string): void {
	const review = readReview(jsonPath);
	if (review === undefined) return;
	bestEffort('review-comment', () => unwrap(ops.comment(ref, `<!-- insrc:review -->\n${renderReviewReport(review)}`)));
}

function firstSentence(s: string): string {
	const m = /^(.+?[.!?])\s/.exec(s);
	if (m !== null) return m[1]!;
	return s.length > 80 ? s.slice(0, 77) + '...' : s;
}
