/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deterministic context.assemble step for tracker workflows.
 *
 * For `tracker.push`: reads the approved Epic + resolves GitHub
 * config + surfaces any prior tracker refs already on the Epic.
 *
 * For `tracker.sync`: reads the tracker refs off the approved Epic
 * (refuses if none — nothing to sync).
 *
 * For `tracker.post`: reads the target artifact (HLD / LLD /
 * amendment) and the Epic's tracker refs, computes the target
 * issue ref + a comment summary.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { approvalStateOf } from '../../artifact-core/approval-view.js';
import { readAmendment } from '../../amendments/store.js';
import { readBaseHld, readDefineArtifact, requireApprovedDefinition, requireApprovedEpic } from '../../gates.js';
import { readLldArtifact } from '../../artifacts/lld-io.js';
import type { IssueArtifact } from '../../artifacts/issue.js';
import { renderEpicBody, renderIssueEpicBody, renderTrackerHldSummary, renderTrackerLldSummary, renderTrackerAmendmentSummary } from '../../tracker/conventions.js';
import type { PlanArtifact } from '../../artifacts/plan.js';
import { resolveGithubConfig, type ResolvedGithubConfig } from '../../config/github.js';
import { artifactJsonPath, impliedIssueStories, issueArtifactId, planArtifactId, planMdRel, IMPLIED_ISSUE_STORY_ID } from '../../storage.js';
import { assertEpicHash } from '../../hash.js';
import { taskIssueRefsOf } from '../../tasks/lookup.js';
import { unitIssueOf } from '../../tracker/unit-head.js';
import { readTrackerMeta } from '../../tracker/refs.js';
import { createGithubTracker } from '../../tracker/github-adapter.js';
import { ArtifactIds } from '../../artifact-ids.js';
import type { StepRunnerContext } from '../../types.js';
import type { PostContext, PushContext, PushTaskInfo, SyncContext } from './schemas.js';

// ---------------------------------------------------------------------------
// tracker.push
// ---------------------------------------------------------------------------

export async function assemblePushContext(ctx: StepRunnerContext): Promise<PushContext> {
	const epicHash = requireEpicHash(ctx);
	// ISSUE-5f9d4ab4c90c0b4c s1/t2: read the head kind-aware. DEF heads take the
	// exact pre-change path below; ISSUE heads derive from the ISSUE artifact.
	const head = requireApprovedDefinition(ctx.intent.repoPath, epicHash);
	const headKind = head.kind;
	const epic = headKind === 'def' ? requireApprovedEpic(ctx.intent.repoPath, epicHash) : undefined;
	const issue = headKind === 'issue' ? (head.artifact as IssueArtifact) : undefined;
	const epicSlug = (epic?.meta.epicSlug ?? issue?.meta.epicSlug) ?? epicHash;
	const gh   = requireGithubAdapter(await resolveGithubConfig(ctx.intent.repoPath), ctx.intent.workflow);
	const force = ctx.intent.params['force'] === true;

	// Compose the Epic issue body via the SHARED renderer so a
	// coarse-handoff push matches a deterministic push byte-for-byte
	// (same task-list + slug-based doc links).
	// REVIEW-5f9d4ab4c90c0b4c HIGH-1: one canonical identity — the body carries the
	// `<!-- insrc:artifact ISSUE-<hash> -->` marker AND the title starts with the
	// same artifact id, so creation, discovery (title token) and verification
	// (body marker) all agree on the issue the normal push created.
	const epicBodyMd = epic !== undefined ? renderEpicBody(epic, epicSlug) : renderIssueEpicBody(issue!, epicSlug, undefined, issueArtifactId(epicHash));

	const stories = epic !== undefined ? epic.body.stories.map(s => ({
		id: s.id, title: s.title,
		bodyMd: [
			`## User value`, s.userValue, '',
			`## Acceptance criteria`,
			...s.acceptanceCriteria.map(ac => `- **${ac.id}:** Given ${ac.given}, when ${ac.when}, then ${ac.then}.`),
		].join('\n'),
	})) : impliedIssueStories(issue!).map(s => ({
		id: s.id, title: s.title,
		bodyMd: [`## User value`, issue!.body.title, ''].join('\n'),
	}));

	const storyIds = stories.map(s => s.id);
	const existing: { epicRef?: string; storyRefs?: Record<string, string>; taskRefs?: Record<string, Record<string, string>> } = {};
	// the issues already bound on the Epic's head and on its Stories' heads
	const boundEpic = unitIssueOf(ctx.intent.repoPath, epicHash);
	if (boundEpic !== undefined) existing.epicRef = boundEpic;
	// ISSUE-5f9d4ab4c90c0b4c s1/t2: for an ISSUE head the approval may already
	// have recorded meta.tracker.issueRef (the work-item root issue); that ref
	// is ALSO the single implied story's issue, so seed both from it.
	if (headKind === 'issue' && existing.epicRef === undefined) {
		const recorded = readTrackerMeta(head.jsonPath)?.issueRef;
		if (recorded !== undefined) existing.epicRef = recorded;
	}
	const boundStories = boundStoryRefs(ctx.intent.repoPath, epicHash, storyIds);
	if (headKind === 'issue' && existing.epicRef !== undefined && boundStories[IMPLIED_ISSUE_STORY_ID] === undefined) {
		boundStories[IMPLIED_ISSUE_STORY_ID] = existing.epicRef;
	}
	if (Object.keys(boundStories).length > 0) existing.storyRefs = boundStories;

	// Task tier (opt-in): for each Story that has an APPROVED plan, surface
	// its Tasks so the execute step can create typed Task sub-issues. Also
	// carry any Task issues already bound to the Story's Task artifacts (dedup on re-push).
	// ISSUE heads have no Stories-with-plans tier beyond the implied s1 only when
	// a plan exists for it; the loop below is unchanged and driven by `stories`.
	const plans: { storyId: string; planDocRel: string; tasks: PushTaskInfo[] }[] = [];
	if (gh.pushTasks) {
		const anchorCreatedAt = epic?.meta.createdAt ?? issue?.meta.createdAt ?? '';
		for (const s of stories) {
			const planJson = artifactJsonPath(ctx.intent.repoPath, planArtifactId(epicHash, s.id));
			if (!existsSync(planJson)) continue;
			let plan: PlanArtifact;
			try { plan = JSON.parse(readFileSync(planJson, 'utf8')) as typeof plan; } catch { continue; }
			if (approvalStateOf(plan.meta) !== 'approved') continue;   // unapproved plan → skip
			plans.push({
				storyId:    s.id,
				planDocRel: planMdRel(epicHash, anchorCreatedAt, 'epic', epicSlug, s.id),
				tasks: [...(plan.body?.tasks ?? [])].sort((a, b) => a.order - b.order).map(t => ({
					id: t.id, title: t.title, size: t.size, summary: t.summary,
					dependsOn: t.dependsOn, acceptanceChecks: t.acceptanceChecks,
					tests: t.tests.map(x => ({ level: x.level, name: x.name })),
				})),
			});
			const priorTaskRefs = taskIssueRefsOf(dirname(planJson), epicHash, s.id);
			if (Object.keys(priorTaskRefs).length > 0) {
				(existing.taskRefs ??= {})[s.id] = priorTaskRefs;
			}
		}
	}

	// ISSUE-5f9d4ab4c90c0b4c s1/t6: surface remote candidates matching the ISSUE
	// body title so a run that finds a pending-create claim can reconcile by
	// marker+target (verifyRecoveryCandidate) without injecting anything.
	let remoteCandidates: PushContext['remoteCandidates'];
	if (headKind === 'issue') {
		try {
			const port = createGithubTracker(gh.owner, gh.repo, { repoPath: ctx.intent.repoPath });
			const byTitle = await port.findIssuesByTitleToken(`${ArtifactIds.make({ kind: 'ISSUE', epicHash })}`);
			if (byTitle.ok) {
				const bodies = await Promise.all(byTitle.value.map(async ref => {
					const b = await port.issueOps.readBody(ref);
					return { ref, body: b.ok ? b.value : '' };
				}));
				// REVIEW HIGH-1: candidate titles are the actual remote titles (the
				// creation payload's ISSUE-<hash> — title), so verification matches
				// what the normal push actually created.
				remoteCandidates = byTitle.value.map((ref, i) => ({ title: bodies[i]!.body.split('\n')[1] ?? issue!.body.title, body: bodies[i]!.body, target: ctx.intent.repoPath, ref }));
			}
		} catch { remoteCandidates = undefined; }
	}

	return {
		kind: 'push',
		epicHash,
		epicSlug,
		...(headKind === 'issue' ? { headKind } : {}),
		gh: { owner: gh.owner, repo: gh.repo, epicLabel: gh.epicLabel, storyLabel: gh.storyLabel, taskLabel: gh.taskLabel, useMilestones: gh.useMilestones, pushTasks: gh.pushTasks, taskIssueType: gh.taskIssueType },
		// REVIEW-5f9d4ab4c90c0b4c HIGH-1: the ISSUE issue title carries the same
		// ISSUE-<hash> token the discovery lookup and the body marker use.
		epicTitle: epic !== undefined ? firstSentence(epic.body.problem) : `${ArtifactIds.make({ kind: 'ISSUE', epicHash })} — ${issue!.body.title}`,
		epicBodyMd,
		stories,
		...(plans.length > 0 ? { plans } : {}),
		force,
		...(Object.keys(existing).length > 0 ? { existingRefs: existing } : {}),
		...(remoteCandidates !== undefined ? { remoteCandidates } : {}),
	};
}

// ---------------------------------------------------------------------------
// tracker.sync
// ---------------------------------------------------------------------------

export async function assembleSyncContext(ctx: StepRunnerContext): Promise<SyncContext> {
	const epicHash = requireEpicHash(ctx);
	// ISSUE-5f9d4ab4c90c0b4c s1/t2: kind-aware head read; DEF path unchanged below.
	const head = requireApprovedDefinition(ctx.intent.repoPath, epicHash);
	const headKind = head.kind;
	const epic = headKind === 'def' ? requireApprovedEpic(ctx.intent.repoPath, epicHash) : undefined;
	const issue = headKind === 'issue' ? (head.artifact as IssueArtifact) : undefined;
	const epicSlug = (epic?.meta.epicSlug ?? issue?.meta.epicSlug) ?? epicHash;
	const gh   = requireGithubAdapter(await resolveGithubConfig(ctx.intent.repoPath), ctx.intent.workflow);
	const milestoneRef = readTrackerMeta(head.jsonPath)?.milestoneRef;
	const epicRef = unitIssueOf(ctx.intent.repoPath, epicHash) ?? (headKind === 'issue' ? readTrackerMeta(head.jsonPath)?.issueRef : undefined);
	if (epicRef === undefined) {
		throw new Error(
			`tracker.sync: Epic '${epicSlug}' (${epicHash}) has no tracker refs to sync. ` +
			`Run \`tracker.push\` first.`,
		);
	}
	const storyIds = epic !== undefined ? epic.body.stories.map(s => s.id) : impliedIssueStories(issue!).map(s => s.id);
	const storyRefs = boundStoryRefs(ctx.intent.repoPath, epicHash, storyIds);
	if (headKind === 'issue') storyRefs[IMPLIED_ISSUE_STORY_ID] ??= epicRef;
	const refs: SyncContext['refs'] = {
		epicRef,
		storyRefs,
		...(typeof milestoneRef === 'string' ? { milestoneRef } : {}),
	};
	return {
		kind: 'sync',
		epicHash,
		epicSlug,
		...(headKind === 'issue' ? { headKind } : {}),
		gh: { owner: gh.owner, repo: gh.repo, epicLabel: gh.epicLabel, storyLabel: gh.storyLabel, useMilestones: gh.useMilestones },
		refs,
	};
}

// ---------------------------------------------------------------------------
// tracker.post
// ---------------------------------------------------------------------------

export async function assemblePostContext(ctx: StepRunnerContext): Promise<PostContext> {
	const epicHash = requireEpicHash(ctx);
	// ISSUE-5f9d4ab4c90c0b4c s1/t2: kind-aware head read; DEF path unchanged below.
	const head = requireApprovedDefinition(ctx.intent.repoPath, epicHash);
	const headKind = head.kind;
	const epic = headKind === 'def' ? requireApprovedEpic(ctx.intent.repoPath, epicHash) : undefined;
	const issue = headKind === 'issue' ? (head.artifact as IssueArtifact) : undefined;
	const epicSlug = (epic?.meta.epicSlug ?? issue?.meta.epicSlug) ?? epicHash;
	const gh   = requireGithubAdapter(await resolveGithubConfig(ctx.intent.repoPath), ctx.intent.workflow);
	const targetKind = (ctx.intent.params['target'] as { kind?: unknown } | undefined)?.kind;
	if (targetKind !== 'hld' && targetKind !== 'lld' && targetKind !== 'amendment') {
		throw new Error(`tracker.post: params.target.kind must be 'hld' | 'lld' | 'amendment'`);
	}
	// ISSUE-5f9d4ab4c90c0b4c s1/t2: an ISSUE-anchored work item has no HLD and
	// no amendments; post targets refuse with clear errors (t5/chain-level).
	if (headKind === 'issue' && targetKind !== 'lld') {
		throw new Error(
			`tracker.post: target.kind='${targetKind}' is not supported for an ISSUE-anchored work item ` +
			`('${epicSlug}', ${epicHash}); only 'lld' posts (to the story issue).`,
		);
	}

	// Pull Epic's tracker refs (must already exist): the issues bound on its heads.
	const epicRef = unitIssueOf(ctx.intent.repoPath, epicHash) ?? (headKind === 'issue' ? readTrackerMeta(head.jsonPath)?.issueRef : undefined);
	if (epicRef === undefined) {
		throw new Error(`tracker.post: Epic '${epicSlug}' (${epicHash}) has no tracker refs. Run \`tracker.push\` first.`);
	}

	let issueRef: string;
	let summaryMd: string;
	if (targetKind === 'hld') {
		const hld = readBaseHld(ctx.intent.repoPath, epicHash);
		issueRef  = epicRef;
		summaryMd = renderTrackerHldSummary(hld);
	} else if (targetKind === 'lld') {
		const storyId = (ctx.intent.params['target'] as { storyId?: unknown } | undefined)?.storyId;
		if (typeof storyId !== 'string' || storyId.length === 0) {
			throw new Error(`tracker.post: target.kind='lld' requires target.storyId`);
		}
		// ISSUE-5f9d4ab4c90c0b4c s1/t2: the only story of an ISSUE work item is
		// the implied s1, and its issue IS the work-item root issue.
		if (headKind === 'issue' && storyId !== IMPLIED_ISSUE_STORY_ID) {
			throw new Error(`tracker.post: ISSUE-anchored work item '${epicSlug}' has only the implied story '${IMPLIED_ISSUE_STORY_ID}'; no story '${storyId}'.`);
		}
		const storyRef = unitIssueOf(ctx.intent.repoPath, epicHash, storyId) ?? (headKind === 'issue' ? epicRef : undefined);
		if (typeof storyRef !== 'string') {
			throw new Error(`tracker.post: no tracker ref for Story '${storyId}' (Epic may need a re-push)`);
		}
		const lld = readLldArtifact(ctx.intent.repoPath, epicHash, storyId);
		issueRef  = storyRef;
		summaryMd = renderTrackerLldSummary(lld);
	} else {
		const amendmentId = (ctx.intent.params['target'] as { amendmentId?: unknown } | undefined)?.amendmentId;
		if (typeof amendmentId !== 'string' || amendmentId.length === 0) {
			throw new Error(`tracker.post: target.kind='amendment' requires target.amendmentId`);
		}
		const rec = readAmendment(ctx.intent.repoPath, amendmentId);
		if (rec.status !== 'approved') {
			throw new Error(`tracker.post: amendment '${amendmentId}' has status '${rec.status}'; only approved amendments post to the tracker`);
		}
		issueRef  = epicRef;
		summaryMd = renderTrackerAmendmentSummary(rec);
	}

	return {
		kind: 'post',
		epicHash,
		epicSlug,
		...(headKind === 'issue' ? { headKind } : {}),
		gh: { owner: gh.owner, repo: gh.repo, epicLabel: gh.epicLabel, storyLabel: gh.storyLabel, useMilestones: gh.useMilestones },
		target: { kind: targetKind, issueRef, summaryMd },
	};
}

// ---------------------------------------------------------------------------
// Helpers

/** The issue bound on each listed Story's head, by Story id; a Story with none is left out. */
function boundStoryRefs(repoPath: string, epicHash: string, storyIds: readonly string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const id of storyIds) {
		const ref = unitIssueOf(repoPath, epicHash, id);
		if (ref !== undefined) out[id] = ref;
	}
	return out;
}
// ---------------------------------------------------------------------------

/** Narrow the resolved config to the github adapter or throw a clear
 *  refuse-message. Callers use this to reject `tracker.*` MCP flows
 *  when the user has opted out via `"type": "none"`. */
function requireGithubAdapter(cfg: ResolvedGithubConfig, workflow: string): Extract<ResolvedGithubConfig, { type: 'github' }> {
	if (cfg.type === 'none') {
		throw new Error(
			`${workflow}: tracker is disabled via config (type: none, source: ${cfg.source}). ` +
			`Remove or change the entry in ~/.insrc/repo-config.json to enable.`,
		);
	}
	return cfg;
}

function requireEpicHash(ctx: StepRunnerContext): string {
	const hash = ctx.intent.params['epicHash'];
	assertEpicHash(hash, `tracker.${ctx.intent.workflow.split('.')[1] ?? 'x'} requires intent.params.epicHash`);
	return hash;
}

function firstSentence(s: string): string {
	const m = /^(.+?[.!?])\s/.exec(s);
	if (m !== null) return m[1]!;
	return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

// Kept as a silence — `readDefineArtifact` may be used later when we
// add a `tracker.post` flavor for Define artifacts.
export { readDefineArtifact };
