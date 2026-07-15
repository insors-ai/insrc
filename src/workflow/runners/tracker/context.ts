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

import { readAmendment } from '../../amendments/store.js';
import { readBaseHld, readDefineArtifact, requireApprovedEpic } from '../../gates.js';
import { readLldArtifact } from '../../artifacts/lld-io.js';
import { renderEpicBody, renderTrackerHldSummary, renderTrackerLldSummary, renderTrackerAmendmentSummary } from '../../tracker/conventions.js';
import { resolveGithubConfig, type ResolvedGithubConfig } from '../../config/github.js';
import { assertEpicHash } from '../../hash.js';
import type { StepRunnerContext } from '../../types.js';
import type { PostContext, PushContext, SyncContext } from './schemas.js';

// ---------------------------------------------------------------------------
// tracker.push
// ---------------------------------------------------------------------------

export function assemblePushContext(ctx: StepRunnerContext): PushContext {
	const epicHash = requireEpicHash(ctx);
	const epic = requireApprovedEpic(ctx.intent.repoPath, epicHash);
	const epicSlug = epic.meta.epicSlug ?? epicHash;
	const gh   = requireGithubAdapter(resolveGithubConfig(ctx.intent.repoPath), ctx.intent.workflow);
	const force = ctx.intent.params['force'] === true;

	// Compose the Epic issue body via the SHARED renderer so a
	// coarse-handoff push matches a deterministic push byte-for-byte
	// (same task-list + slug-based doc links).
	const epicBodyMd = renderEpicBody(epic, epicSlug);

	const stories = epic.body.stories.map(s => ({
		id: s.id, title: s.title,
		bodyMd: [
			`## User value`, s.userValue, '',
			`## Acceptance criteria`,
			...s.acceptanceCriteria.map(ac => `- **${ac.id}:** Given ${ac.given}, when ${ac.when}, then ${ac.then}.`),
		].join('\n'),
	}));

	const existing: { epicRef?: string; storyRefs?: Record<string, string> } = {};
	const trackerMeta = (epic.meta as { tracker?: { epicRef?: string; storyRefs?: Record<string, string> } }).tracker;
	if (trackerMeta !== undefined) {
		if (typeof trackerMeta.epicRef === 'string') existing.epicRef = trackerMeta.epicRef;
		if (typeof trackerMeta.storyRefs === 'object' && trackerMeta.storyRefs !== null) existing.storyRefs = trackerMeta.storyRefs;
	}

	return {
		kind: 'push',
		epicHash,
		epicSlug,
		gh: { owner: gh.owner, repo: gh.repo, epicLabel: gh.epicLabel, storyLabel: gh.storyLabel, useMilestones: gh.useMilestones },
		epicTitle: firstSentence(epic.body.problem),
		epicBodyMd,
		stories,
		force,
		...(Object.keys(existing).length > 0 ? { existingRefs: existing } : {}),
	};
}

// ---------------------------------------------------------------------------
// tracker.sync
// ---------------------------------------------------------------------------

export function assembleSyncContext(ctx: StepRunnerContext): SyncContext {
	const epicHash = requireEpicHash(ctx);
	const epic = requireApprovedEpic(ctx.intent.repoPath, epicHash);
	const epicSlug = epic.meta.epicSlug ?? epicHash;
	const gh   = requireGithubAdapter(resolveGithubConfig(ctx.intent.repoPath), ctx.intent.workflow);
	const trackerMeta = (epic.meta as { tracker?: { epicRef?: string; storyRefs?: Record<string, string>; milestoneRef?: string } }).tracker;
	if (trackerMeta === undefined || typeof trackerMeta.epicRef !== 'string' || typeof trackerMeta.storyRefs !== 'object') {
		throw new Error(
			`tracker.sync: Epic '${epicSlug}' (${epicHash}) has no tracker refs to sync. ` +
			`Run \`tracker.push\` first.`,
		);
	}
	const refs: SyncContext['refs'] = {
		epicRef:   trackerMeta.epicRef,
		storyRefs: trackerMeta.storyRefs,
		...(typeof trackerMeta.milestoneRef === 'string' ? { milestoneRef: trackerMeta.milestoneRef } : {}),
	};
	return {
		kind: 'sync',
		epicHash,
		epicSlug,
		gh: { owner: gh.owner, repo: gh.repo, epicLabel: gh.epicLabel, storyLabel: gh.storyLabel, useMilestones: gh.useMilestones },
		refs,
	};
}

// ---------------------------------------------------------------------------
// tracker.post
// ---------------------------------------------------------------------------

export function assemblePostContext(ctx: StepRunnerContext): PostContext {
	const epicHash = requireEpicHash(ctx);
	const epic = requireApprovedEpic(ctx.intent.repoPath, epicHash);
	const epicSlug = epic.meta.epicSlug ?? epicHash;
	const gh   = requireGithubAdapter(resolveGithubConfig(ctx.intent.repoPath), ctx.intent.workflow);
	const targetKind = (ctx.intent.params['target'] as { kind?: unknown } | undefined)?.kind;
	if (targetKind !== 'hld' && targetKind !== 'lld' && targetKind !== 'amendment') {
		throw new Error(`tracker.post: params.target.kind must be 'hld' | 'lld' | 'amendment'`);
	}

	// Pull Epic's tracker refs (must already exist).
	const trackerMeta = (epic.meta as { tracker?: { epicRef?: string; storyRefs?: Record<string, string> } }).tracker;
	if (trackerMeta === undefined || typeof trackerMeta.epicRef !== 'string') {
		throw new Error(`tracker.post: Epic '${epicSlug}' (${epicHash}) has no tracker refs. Run \`tracker.push\` first.`);
	}

	let issueRef: string;
	let summaryMd: string;
	if (targetKind === 'hld') {
		const hld = readBaseHld(ctx.intent.repoPath, epicHash);
		issueRef  = trackerMeta.epicRef;
		summaryMd = renderTrackerHldSummary(hld);
	} else if (targetKind === 'lld') {
		const storyId = (ctx.intent.params['target'] as { storyId?: unknown } | undefined)?.storyId;
		if (typeof storyId !== 'string' || storyId.length === 0) {
			throw new Error(`tracker.post: target.kind='lld' requires target.storyId`);
		}
		const storyRef = trackerMeta.storyRefs?.[storyId];
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
		issueRef  = trackerMeta.epicRef;
		summaryMd = renderTrackerAmendmentSummary(rec);
	}

	return {
		kind: 'post',
		epicHash,
		epicSlug,
		gh: { owner: gh.owner, repo: gh.repo, epicLabel: gh.epicLabel, storyLabel: gh.storyLabel, useMilestones: gh.useMilestones },
		target: { kind: targetKind, issueRef, summaryMd },
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Narrow the resolved config to the github adapter or throw a clear
 *  refuse-message. Callers use this to reject `tracker.*` MCP flows
 *  when the user has opted out via `"type": "none"`. */
function requireGithubAdapter(cfg: ResolvedGithubConfig, workflow: string): Extract<ResolvedGithubConfig, { type: 'github' }> {
	if (cfg.type === 'none') {
		throw new Error(
			`${workflow}: tracker is disabled via config (type: none, source: ${cfg.source}). ` +
			`Remove or change the entry in ~/.insrc/github.json to enable.`,
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
