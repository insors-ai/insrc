/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E202610138d4b90c9:S001 — one review decision from the review pane: approve,
 * reject or send feedback, with the comments the reviewer wrote.
 *
 * `handleReviewDecision` is the core the `workflow.reviewDecision` IPC handler
 * delegates to. It resolves the artifact from its .md exactly as
 * workflow.artifactContent does, validates the whole request before anything is
 * written, resolves the author itself, and then acts in a fixed order:
 *
 *   1. the decision: approve through approveWorkflowTarget, reject through
 *      rejectArtifactByJsonPath; feedback changes no state;
 *   2. the comments: one Feedback entry each, stored through the repository's
 *      FeedbackService under one batch id, by the request's actor or the current
 *      one. The kind follows the decision that took effect: send feedback (and so a
 *      withheld approval) is a revision request, approve and reject are comments.
 *
 * So a comment is never saved with a decision that did not happen. Every refusal
 * is a structured { error } and writes nothing. A comment write that fails after
 * the decision took effect is reported as `commentsError` beside the outcome.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { docPathOf, resolveDocsMarkdown } from './artifact-content.js';
import { resolveReviewer, type ReviewerDeps } from './artifacts/companion/header.js';
import {
	FEEDBACK_CONTEXT_MAX, FEEDBACK_DECISIONS, FEEDBACK_QUOTE_MAX,
	type FeedbackAnchor, type FeedbackDecision,
} from './artifacts/provenance/types.js';
import type { LifecycleService } from './artifact-core/lifecycle-service.js';
import type { Actor, Feedback } from './artifact-core/types.js';
import type { FeedbackService } from './feedback/feedback-service.js';
import { feedbackAnchorOf } from './feedback/legacy-anchor.js';
import { approvalActorOf } from './artifact-core/approval-actor.js';
import { approvalStateOf } from './artifact-core/approval-view.js';
import { createRepoLifecycle } from './artifact-core/repo-lifecycle.js';
import { approveWorkflowTarget, jsonPathForMd, rejectArtifactByJsonPath, type WorkflowApproveResult } from './gates.js';

const log = getLogger('workflow:review-decision');

/** The longest comment the pane may save. */
export const REVIEW_COMMENT_MAX = 10_000;
/** The most comments one decision may carry. */
export const REVIEW_COMMENTS_MAX = 200;

export interface ReviewDecisionComment {
	readonly comment:  string;
	/** Repo-relative path of the document commented on: the .md (the default) or
	 *  an .html companion listed in the artifact's body. */
	readonly file?:    string | undefined;
	/** The contentVersion the reviewer saw. */
	readonly version?: string | undefined;
	/** Present for an inline comment. */
	readonly anchor?:  FeedbackAnchor | undefined;
}

export interface ReviewDecisionRequest {
	readonly repo?:     string | undefined;
	readonly mdPath?:   string | undefined;
	readonly decision?: FeedbackDecision | undefined;
	readonly comments?: readonly ReviewDecisionComment[] | undefined;
}

export type ReviewDecisionOutcome = 'approved' | 'withheld' | 'rejected' | 'recorded';

export interface ReviewDecisionResult {
	readonly artifactId: string;
	readonly decision:   FeedbackDecision;
	readonly outcome:    ReviewDecisionOutcome;
	/** Why an approval was withheld, or the reason a rejection was recorded with. */
	readonly reason?:    string | undefined;
	/** How many comments were saved. */
	readonly recorded:   number;
	readonly entryIds:   string[];
	readonly author:     string;
	/** Set when the decision took effect and the comments could not be saved. */
	readonly commentsError?: string | undefined;
	/** What the approval of a bugfix issue set off, as 'workflow.approve' reports it. */
	readonly followOn?:  WorkflowApproveResult['followOn'];
}

export interface ReviewDecisionError { readonly error: string }

/** What the decision needs to save its comments: the repository's feedback service and the current actor. */
export interface DecisionFeedback {
	readonly feedback:     Pick<FeedbackService, 'add'>;
	readonly currentActor: (repoPath: string) => Promise<Actor>;
}

/** Seams for the writes and the machine lookups, so tests can pin them. */
export interface ReviewDecisionDeps {
	readonly reviewer?:    ReviewerDeps | undefined;
	readonly approve?:     typeof approveWorkflowTarget | undefined;
	/** The repository's durable LifecycleService; the daemon passes its registry. Without it one is built over the repository's files. */
	readonly lifecycleFor?: ((repoPath: string) => LifecycleService) | undefined;
	readonly reject?:      typeof rejectArtifactByJsonPath | undefined;
	/** The repository's feedback service; the daemon passes its registry's. Without it a decision's comments cannot be saved. */
	readonly feedbackFor?: ((repoPath: string) => DecisionFeedback) | undefined;
	/** What 'workflow.approve' runs over the artifacts it approved (the bugfix
	 *  advance). Bound by the daemon, which owns the graph it reads. */
	readonly followOn?:    ((approved: WorkflowApproveResult['approved'], repoPath: string) => Promise<WorkflowApproveResult['followOn']>) | undefined;
}

const P = 'workflow.reviewDecision';

interface ArtifactShape {
	readonly meta?: Record<string, unknown>;
	readonly body?: Record<string, unknown>;
}

export async function handleReviewDecision(
	params: ReviewDecisionRequest | undefined,
	repoEnv: string | undefined,
	deps: ReviewDecisionDeps = {},
): Promise<ReviewDecisionResult | ReviewDecisionError> {
	const p = (params ?? {}) as { repo?: unknown; mdPath?: unknown; decision?: unknown; comments?: unknown; actor?: unknown };
	const repoPath = (typeof p.repo === 'string' && p.repo.length > 0 ? p.repo : repoEnv) ?? '';
	if (repoPath.length === 0) return { error: `${P}: \`repo\` is required` };
	if (typeof p.mdPath !== 'string' || p.mdPath.length === 0) return { error: `${P}: \`mdPath\` is required` };
	if (typeof p.decision !== 'string' || !(FEEDBACK_DECISIONS as readonly string[]).includes(p.decision)) {
		return { error: `${P}: \`decision\` must be one of ${FEEDBACK_DECISIONS.join(', ')}` };
	}
	const decision = p.decision as FeedbackDecision;

	const located = resolveDocsMarkdown(repoPath, p.mdPath);
	if ('reason' in located) {
		switch (located.reason) {
			case 'outside-docs':   return { error: `${P}: mdPath must resolve under docs/ (got '${p.mdPath}')` };
			case 'not-md':         return { error: `${P}: mdPath must be a workflow artifact .md (got '${p.mdPath}')` };
			case 'unreadable':     return { error: `${P}: cannot read '${p.mdPath}': ${located.detail}` };
			case 'symlink-escape': return { error: `${P}: mdPath resolves outside docs/ via a symlink (got '${p.mdPath}')` };
		}
	}
	const realMd = located.realPath;

	let jsonPath: string;
	let art: ArtifactShape;
	try {
		jsonPath = jsonPathForMd(realMd);
		art = JSON.parse(readFileSync(jsonPath, 'utf8')) as ArtifactShape;
	} catch (err) {
		return { error: `${P}: artifact metadata unreadable: ${(err as Error).message}` };
	}
	if (typeof art !== 'object' || art === null) return { error: `${P}: artifact metadata unreadable: not an object` };
	const meta = art.meta ?? {};
	const body = art.body ?? {};
	const artifactId = basename(jsonPath).replace(/\.json$/, '');
	const docPath = docPathOf(repoPath, realMd);

	const checked = checkComments(p.comments, docPath, companionPaths(body));
	if ('error' in checked) return checked;
	const comments = checked.comments;

	if (decision === 'feedback' && comments.length === 0) {
		return { error: `${P}: send feedback needs at least one comment` };
	}
	if (decision !== 'feedback') {
		const state = approvalStateOf(meta);
		if (state !== 'pending') {
			return { error: `${P}: cannot ${decision} '${artifactId}': it is already ${state}, not awaiting review` };
		}
	}

	// The request's person, if it names one, is checked before anything is written.
	let named: Actor | undefined;
	if (p.actor !== undefined && p.actor !== null) {
		try { named = approvalActorOf(p.actor); } catch (err) { return { error: `${P}: ${(err as Error).message}` }; }
	}

	const author = resolveReviewer(repoPath, deps.reviewer ?? {}).name;

	// 1. The decision.
	let outcome: ReviewDecisionOutcome;
	let reason: string | undefined;
	let approved: WorkflowApproveResult['approved'] = [];
	try {
		if (decision === 'approve') {
			const lifecycle = deps.lifecycleFor?.(repoPath);
			const res = await (deps.approve ?? approveWorkflowTarget)({
				repoPath, artifactPath: jsonPath, actor: named ?? approvalActorOf(undefined),
				...(lifecycle !== undefined ? { lifecycle } : {}),
			});
			approved = res.approved;
			if (res.approved.length > 0) {
				outcome = 'approved';
			} else {
				outcome = 'withheld';
				reason = res.skipped[0]?.reason ?? 'the approval was not recorded';
			}
		} else if (decision === 'reject') {
			reason = comments.find(c => c.anchor === undefined)?.comment ?? `Rejected in the review pane by ${author}`;
			await (deps.reject ?? rejectArtifactByJsonPath)(jsonPath, reason, { lifecycle: deps.lifecycleFor?.(repoPath) ?? createRepoLifecycle(repoPath).service, actor: named ?? approvalActorOf(undefined) });
			outcome = 'rejected';
		} else {
			outcome = 'recorded';
		}
	} catch (err) {
		return { error: `${P}: cannot ${decision} '${artifactId}': ${(err as Error).message}` };
	}

	// 2. The comments, with the decision that took effect.
	const kind: Feedback['kind'] = outcome === 'approved' || outcome === 'rejected' ? 'comment' : 'revision-request';
	const entryIds: string[] = [];
	let commentsError: string | undefined;
	if (comments.length > 0) {
		const batchId = randomUUID().slice(0, 8);
		try {
			const through = deps.feedbackFor?.(repoPath);
			if (through === undefined) throw new Error('no feedback service is available to save the comments');
			const base = named ?? await through.currentActor(repoPath);
			const actor: Actor = { ...base, properties: { ...base.properties, name: author } };
			for (const c of comments) {
				const stored = await through.feedback.add(artifactId, {
					text: c.comment, kind, batchId,
					anchor: feedbackAnchorOf(c.anchor, { file: c.file }, c.file === docPath),
				}, actor);
				entryIds.push(stored.id);
			}
		} catch (err) {
			commentsError = (err as Error).message;
			log.warn({ artifactId, decision, outcome, saved: entryIds.length, err: commentsError }, 'the decision took effect but its comments were not saved');
		}
	}

	// The follow-on of an approval, as 'workflow.approve' runs it. It never fails the decision.
	let followOn: WorkflowApproveResult['followOn'];
	if (approved.length > 0 && deps.followOn !== undefined) {
		try {
			followOn = await deps.followOn(approved, repoPath);
		} catch (err) {
			log.warn({ artifactId, err: (err as Error).message }, 'the follow-on of the approval failed');
		}
	}

	log.info({ artifactId, decision, outcome, recorded: entryIds.length, author }, 'review decision recorded');
	return {
		artifactId,
		decision,
		outcome,
		...(reason !== undefined ? { reason } : {}),
		recorded: entryIds.length,
		entryIds,
		author,
		...(commentsError !== undefined ? { commentsError } : {}),
		...(followOn !== undefined && followOn.length > 0 ? { followOn } : {}),
	};
}

/** A comment after validation: trimmed, with the file it is on. */
interface CheckedComment {
	readonly comment:  string;
	readonly file:     string;
	readonly version?: string;
	readonly anchor?:  FeedbackAnchor;
}

function checkComments(
	raw: unknown,
	docPath: string,
	companions: readonly string[],
): { readonly comments: CheckedComment[] } | ReviewDecisionError {
	if (raw === undefined || raw === null) return { comments: [] };
	if (!Array.isArray(raw)) return { error: `${P}: \`comments\` must be a list` };
	if (raw.length > REVIEW_COMMENTS_MAX) {
		return { error: `${P}: at most ${REVIEW_COMMENTS_MAX} comments in one decision (got ${raw.length})` };
	}
	const out: CheckedComment[] = [];
	for (const [i, item] of raw.entries()) {
		const n = i + 1;
		if (typeof item !== 'object' || item === null) return { error: `${P}: comment ${n} is not an object` };
		const c = item as { comment?: unknown; file?: unknown; version?: unknown; anchor?: unknown };
		const comment = typeof c.comment === 'string' ? c.comment.trim() : '';
		if (comment.length === 0) return { error: `${P}: comment ${n} is blank` };
		if (comment.length > REVIEW_COMMENT_MAX) {
			return { error: `${P}: comment ${n} is longer than ${REVIEW_COMMENT_MAX} characters` };
		}
		let file = docPath;
		if (c.file !== undefined) {
			if (typeof c.file !== 'string' || c.file.length === 0) return { error: `${P}: comment ${n} has an invalid \`file\`` };
			file = c.file.split('\\').join('/').replace(/^\.\//, '');
			if (file !== docPath && !companions.includes(file)) {
				return { error: `${P}: comment ${n} is on '${c.file}', which is not this artifact's document or one of its companions` };
			}
		}
		if (c.version !== undefined && typeof c.version !== 'string') return { error: `${P}: comment ${n} has an invalid \`version\`` };
		let anchor: FeedbackAnchor | undefined;
		if (c.anchor !== undefined) {
			const a = checkAnchor(c.anchor);
			if (typeof a === 'string') return { error: `${P}: comment ${n} has an invalid \`anchor\`: ${a}` };
			anchor = a;
		}
		out.push({
			comment,
			file,
			...(typeof c.version === 'string' && c.version.length > 0 ? { version: c.version } : {}),
			...(anchor !== undefined ? { anchor } : {}),
		});
	}
	return { comments: out };
}

/** The anchor with only its known keys, or what is wrong with it. */
function checkAnchor(raw: unknown): FeedbackAnchor | string {
	if (typeof raw !== 'object' || raw === null) return 'not an object';
	const a = raw as { quote?: unknown; sectionSlug?: unknown; prefix?: unknown; suffix?: unknown };
	if (typeof a.quote !== 'string' || a.quote.trim().length === 0) return 'the quote is blank';
	if (a.quote.length > FEEDBACK_QUOTE_MAX) return `the quote is longer than ${FEEDBACK_QUOTE_MAX} characters`;
	for (const key of ['sectionSlug', 'prefix', 'suffix'] as const) {
		if (a[key] !== undefined && typeof a[key] !== 'string') return `\`${key}\` is not a string`;
	}
	for (const key of ['prefix', 'suffix'] as const) {
		if (typeof a[key] === 'string' && (a[key] as string).length > FEEDBACK_CONTEXT_MAX) {
			return `\`${key}\` is longer than ${FEEDBACK_CONTEXT_MAX} characters`;
		}
	}
	return {
		quote: a.quote,
		...(typeof a.sectionSlug === 'string' ? { sectionSlug: a.sectionSlug } : {}),
		...(typeof a.prefix === 'string' ? { prefix: a.prefix } : {}),
		...(typeof a.suffix === 'string' ? { suffix: a.suffix } : {}),
	};
}

/** The repo-relative paths of the companions the artifact's body lists. */
function companionPaths(body: Record<string, unknown>): string[] {
	const list = body['companions'];
	if (!Array.isArray(list)) return [];
	return list
		.map(c => (typeof c === 'object' && c !== null ? (c as { relPath?: unknown }).relPath : undefined))
		.filter((r): r is string => typeof r === 'string' && r.length > 0)
		.map(r => r.split('\\').join('/').replace(/^\.\//, ''));
}

