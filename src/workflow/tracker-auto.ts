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
import { MissingAnchorError } from './artifact-ids.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths, requireEpicAnchor, writeAtomic } from './storage.js';
import { GithubConfigError, resolveGithubConfig, type ResolvedGithubConfig } from './config/github.js';
import { ghAuthOk } from './tracker/github.js';
import { createGithubTracker } from './tracker/github-adapter.js';
import type { IssueOps, PortResult, TrackerComment, TrackerPort } from './tracker/port.js';
import { renderTrackerHldSummary, renderTrackerLldSummary, updateEpicTaskList } from './tracker/conventions.js';
import { patchTrackerMeta, readTrackerMeta, type TrackerMeta, type UnitRef } from './tracker/refs.js';
import { ensureUnitIssueDetailed, postMarker, resolveUnitIssueLocal, runUnitExtras, type ExtraStep } from './tracker/unit-issue.js';
import { policyReader } from './team/policy-reader.js';
import type { PolicyReader } from './team/types.js';
import { renderReviewReport } from './review/index.js';
import type { ReviewReport } from './review/types.js';
import { renderResolvedQuestionsSection } from './questions.js';
import { renderCitationBlock } from './synthesizer.js';
import type { Citation, QuestionResolution } from './types.js';

const log = getLogger('workflow:tracker-auto');


/** An approve-time extra that did not run (the issue itself is fine; the next approve retries it). */
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

/** The Epic's anchor, or the failed result a push returns before it calls GitHub or writes a file. */
function anchorOrFailed(repoPath: string, epicHash: string): { readonly anchor: string } | { readonly failed: AutoPushResult } {
	try {
		return { anchor: requireEpicAnchor(repoPath, epicHash) };
	} catch (err) {
		if (err instanceof MissingAnchorError) return { failed: { status: 'failed', reason: err.message } };
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Mode: legacy (no policy, or teamMode false) or team
// ---------------------------------------------------------------------------

/** Seams for tests; the production call sites set none (the three exported signatures take only the path). */
export interface AutoPushDeps {
	readonly policy?: PolicyReader | undefined;
	/** A tracker port to use instead of the GitHub one (its auth check is skipped). */
	readonly port?:   TrackerPort | undefined;
}

let testDeps: AutoPushDeps = {};

/** Test seam: inject the policy reader and tracker port; call with no argument to reset. */
export function _setAutoPushDepsForTests(deps: AutoPushDeps = {}): void { testDeps = deps; }

type Mode = 'individual' | 'team' | { readonly failed: string };

/** Team mode when the repo's policy turns it on, else individual mode. The two share one push path; they differ only in how Task issues are chosen. */
function pickMode(repoPath: string, deps: AutoPushDeps): Mode {
	const p = (deps.policy ?? policyReader)(repoPath);
	if (!p.ok) return { failed: `the team policy cannot be read: ${p.reason}` };
	return p.value !== 'none' && p.value.teamMode ? 'team' : 'individual';
}

function modeFor(meta: MetaShape, deps: AutoPushDeps): Mode {
	return typeof meta.repoPath === 'string' ? pickMode(meta.repoPath, deps) : 'individual';
}

export function autoPushEpicOnHld(hldJsonPath: string): AutoPushResult {
	const deps = testDeps;
	const meta = readMeta(hldJsonPath);
	const mode = modeFor(meta, deps);
	if (typeof mode === 'object') return { status: 'failed', reason: mode.failed };
	return guardedPush(() => pushEpic(hldJsonPath, meta, deps));
}

export function autoPushStoryOnLld(lldJsonPath: string): AutoPushResult {
	const deps = testDeps;
	const meta = readMeta(lldJsonPath);
	const mode = modeFor(meta, deps);
	if (typeof mode === 'object') return { status: 'failed', reason: mode.failed };
	return guardedPush(() => pushStory(lldJsonPath, meta, deps));
}

export function autoPushTasksOnPlan(planJsonPath: string): AutoPushResult {
	const deps = testDeps;
	const meta = readMeta(planJsonPath);
	const mode = modeFor(meta, deps);
	if (typeof mode === 'object') return { status: 'failed', reason: mode.failed };
	return guardedPush(() => pushTasks(planJsonPath, meta, deps, mode));
}

// ---------------------------------------------------------------------------
// The push path of both modes: adopt what the draft hook created, create only what is
// missing, bind each unit's artifact to its issue and run each extra as its own once-only
// step (see tracker/unit-issue.ts). Team mode and individual mode differ only in the Task issues.
// ---------------------------------------------------------------------------

type GithubCfg = Extract<ResolvedGithubConfig, { type: 'github' }>;

/** The repository's GitHub tracker, or why there is none (config disabled, gh not signed in): the one way a push or an attach gets its port. */
export function openTracker(repoPath: string): { readonly cfg: GithubCfg; readonly port: TrackerPort } | { readonly skip: AutoPushResult } { return trackerGate(repoPath, testDeps); }

function trackerGate(repoPath: string, deps: AutoPushDeps): { cfg: GithubCfg; port: TrackerPort } | { skip: AutoPushResult } {
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

/** A local write that fails after the remote issue exists is a failed result, not an escaping error. */
function guardedPush(run: () => AutoPushResult): AutoPushResult {
	try { return run(); }
	catch (err) { return failedResult(`the issue exists but a local step failed: ${(err as Error).message}`); }
}

function withExtras<T extends object>(base: T, failed: ExtrasFailed): T & { extrasFailed?: ExtrasFailed } {
	return failed.length > 0 ? { ...base, extrasFailed: failed } : base;
}

/** A step whose runner throws (a summary renderer on a malformed body) fails as a step instead of escaping. */
function guarded(step: ExtraStep): ExtraStep {
	return { name: step.name, marker: step.marker, run: () => { try { return step.run(); } catch (err) { return { ok: false, reason: (err as Error).message, kind: 'rejected' }; } } };
}

/** The review comment step, only when the artifact carries a review. */
function reviewStep(ops: IssueOps, ref: string, jsonPath: string, unit: UnitRef): ExtraStep[] {
	const review = readReview(jsonPath);
	if (review === undefined) return [];
	const marker = postMarker(unit, 'reviewComment');
	return [{ name: 'reviewComment', marker, run: () => ops.comment(ref, `${marker}\n<!-- insrc:review -->\n${renderReviewReport(review)}`) }];
}

/** The unit's comment lister for runUnitExtras: the issue's comments, or a failure when the tracker cannot list them. */
const commentsOf = (port: TrackerPort, issue: string) => (): PortResult<TrackerComment[]> =>
	typeof port.listComments === 'function' ? port.listComments(issue) : { ok: false, kind: 'rejected', reason: 'this tracker cannot list comments' };

function milestoneStep(ops: IssueOps, cfg: GithubCfg, ref: string, epicSlug: string): ExtraStep[] {
	return cfg.useMilestones ? [{ name: 'milestone', run: () => { ops.ensureMilestone(epicSlug); return ops.attachMilestone(ref, epicSlug); } }] : [];
}

function pushEpic(hldJsonPath: string, meta: MetaShape, deps: AutoPushDeps): AutoPushResult {
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'HLD meta is missing epicHash / epicSlug / repoPath' };
	}
	const { epicHash, epicSlug, repoPath } = { epicHash: meta.epicHash, epicSlug: meta.epicSlug, repoPath: meta.repoPath };
	const g = trackerGate(repoPath, deps);
	if ('skip' in g) return g.skip;
	const { cfg, port } = g;
	const unit: UnitRef = { unit: 'epic', repoPath, epicHash };
	// The folder anchor first: a work item with none fails before an issue is created.
	const anchored = anchorOrFailed(repoPath, epicHash);
	if ('failed' in anchored) return anchored.failed;
	const anchor = anchored.anchor;

	const ensured = ensureUnitIssueDetailed(unit, port);
	if (!ensured.ok) return failedResult(`the Epic issue could not be ensured: ${ensured.reason}`);
	const epicRef = ensured.value.issue;

	const now = new Date().toISOString();
	patchTrackerMeta(hldJsonPath, { epicRef, pushedAt: now });
	const definePaths = defineArtifactPaths(repoPath, epicHash, anchor, 'epic', epicSlug);
	patchTrackerMeta(definePaths.json, { epicRef, pushedAt: now });
	relink(hldArtifactPaths(repoPath, epicHash, anchor, 'epic', epicSlug).md, () => { const a = readHldArtifact(repoPath, epicHash); return withResolvedTail(a.meta, a.citations, renderHldMarkdown(a)); });
	relink(definePaths.md, () => { const a = readDefineArtifact(repoPath, epicHash); return withResolvedTail(a.meta, a.citations, renderDefineMarkdown(a)); });

	const ops = port.issueOps;
	const designMarker = postMarker(unit, 'designComment');
	const out = runUnitExtras(unit, ([
		...milestoneStep(ops, cfg, epicRef, epicSlug),
		{ name: 'designComment', marker: designMarker, run: () => ops.comment(epicRef, `${designMarker}\n${renderTrackerHldSummary(readHldArtifact(repoPath, epicHash))}`) },
		...reviewStep(ops, epicRef, hldJsonPath, unit),
	] as ExtraStep[]).map(guarded), { comments: commentsOf(port, epicRef) });
	return withExtras(ensured.value.created ? { status: 'created' as const, epicRef } : { status: 'already-exists' as const, epicRef }, out.failed);
}

function pushStory(lldJsonPath: string, meta: MetaShape, deps: AutoPushDeps): AutoPushResult {
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.storyId !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'LLD meta is missing epicHash / epicSlug / storyId / repoPath' };
	}
	const { epicHash, epicSlug, storyId, repoPath } = { epicHash: meta.epicHash, epicSlug: meta.epicSlug, storyId: meta.storyId, repoPath: meta.repoPath };
	const g = trackerGate(repoPath, deps);
	if ('skip' in g) return g.skip;
	const { cfg, port } = g;

	let define: DefineArtifact;
	try { define = readDefineArtifact(repoPath, epicHash); }
	catch (err) { return failedResult(`cannot read parent Define: ${(err as Error).message}`); }
	const story = define.body.stories.find(s => s.id === storyId);
	if (story === undefined) return failedResult(`Story '${storyId}' not present in Define body`);
	const anchored = anchorOrFailed(repoPath, epicHash);
	if ('failed' in anchored) return anchored.failed;
	const anchor = anchored.anchor;

	const epic = ensureUnitIssueDetailed({ unit: 'epic', repoPath, epicHash }, port);
	if (!epic.ok) return failedResult(`the Epic issue could not be ensured: ${epic.reason}`);
	const epicRef = epic.value.issue;
	const unit: UnitRef = { unit: 'story', repoPath, epicHash, storyId };
	const ensured = ensureUnitIssueDetailed(unit, port);
	if (!ensured.ok) return failedResult(`the Story issue could not be ensured: ${ensured.reason}`);
	const storyRef = ensured.value.issue;

	patchTrackerMeta(lldJsonPath, { storyRef, pushedAt: new Date().toISOString() });
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
		{ name: 'designComment', marker: postMarker(unit, 'designComment'), run: () => ops.comment(storyRef, `${postMarker(unit, 'designComment')}\n${renderTrackerLldSummary(readLldArtifact(repoPath, epicHash, storyId))}`) },
		...reviewStep(ops, storyRef, lldJsonPath, unit),
	] as ExtraStep[]).map(guarded), { comments: commentsOf(port, storyRef) });
	return withExtras(ensured.value.created ? { status: 'created' as const, storyRef } : { status: 'already-exists' as const, storyRef }, out.failed);
}

function pushTasks(planJsonPath: string, meta: MetaShape, deps: AutoPushDeps, mode: 'individual' | 'team'): AutoPushResult {
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.storyId !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'Plan meta is missing epicHash / epicSlug / storyId / repoPath' };
	}
	const { epicHash, storyId, repoPath } = { epicHash: meta.epicHash, storyId: meta.storyId, repoPath: meta.repoPath };
	const g = trackerGate(repoPath, deps);
	if ('skip' in g) return g.skip;
	const { port, cfg } = g;
	// Team mode makes a Task issue for every Task whatever pushTasks says (forceTaskIssues); individual mode keeps the setting.
	if (mode === 'individual' && !cfg.pushTasks) {
		return { status: 'skipped', reason: 'task push disabled (set "pushTasks": true in ~/.insrc/github.json to enable)' };
	}

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
		{ name: 'planComment', marker: postMarker(storyUnit, 'planComment'), run: () => ops.comment(story.value.issue, `${postMarker(storyUnit, 'planComment')}\n<!-- insrc:review -->\n${renderReviewReport(review)}`) },
	] as ExtraStep[]).map(guarded), { comments: commentsOf(port, story.value.issue) });
	// each Task's issue, from its binding (or the plan's record for a Task with no artifact)
	const taskRefs: Record<string, string> = {};
	for (const task of tasks) {
		const ref = resolveUnitIssueLocal({ unit: 'task', repoPath, epicHash, storyId, taskId: task.id });
		if (ref !== null) taskRefs[task.id] = ref;
	}
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

/** Read `meta.review` off an artifact JSON, or undefined if absent/unreadable. */
function readReview(jsonPath: string): ReviewReport | undefined {
	try {
		const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { review?: ReviewReport } }).meta;
		return meta?.review;
	} catch { return undefined; }
}

