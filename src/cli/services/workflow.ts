/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Workflow service — thin wrappers over the LOCAL workflow modules
 * (no daemon involved). The Workflows pane drives these. Everything
 * here is synchronous file I/O, fast enough to call from key handlers.
 *
 * The one genuinely new piece is `listEpics`: there is no existing
 * Epic enumerator, so we scan the canonical artifacts dir for
 * `DEF-<hash>.json` files (mirroring the readdir pattern in
 * `amendments/staleness.ts`).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	buildChainReport,
	formatChainReport,
	type ChainReport,
} from '../../workflow/chain.js';
import {
	jsonPathForMd,
	approveArtifactByJsonPath,
	rejectArtifactByJsonPath,
	ackStaleArtifact,
	readBaseHld,
	type ApprovalResult,
	type RejectionResult,
} from '../../workflow/gates.js';
import {
	autoPushEpicOnHld,
	autoPushStoryOnLld,
	autoPushTasksOnPlan,
	type AutoPushResult,
} from '../../workflow/tracker-auto.js';
import {
	listAmendments,
	readAmendment,
	approveAmendment,
	rejectAmendment,
} from '../../workflow/amendments/store.js';
import { scanLldStaleness, type StaleLldEntry } from '../../workflow/amendments/staleness.js';
import { listDeferred, type DeferredQuestion } from '../../workflow/questions.js';
import type { AmendmentRecord } from '../../workflow/amendments/types.js';
import { deriveSlug } from '../../workflow/slug.js';
import {
	ARTIFACTS_DIR,
	defineArtifactPaths, hldArtifactPaths, lldArtifactPaths, planArtifactPaths,
} from '../../workflow/storage.js';
import { commitAndPushArtifacts, type CommitArtifactsResult } from '../../workflow/tracker/github.js';
import { runTrackerSetup, type TrackerSetupOptions, type TrackerSetupReport } from '../../workflow/tracker/setup.js';
import { resolveGithubConfig } from '../../workflow/config/github.js';
import { syncTracker, type SyncResult } from '../../workflow/tracker/sync.js';
import { getLogger } from '../../shared/logger.js';
import { CliProvider } from '../../agent/providers/cli-provider.js';
import { reviewArtifactFile, type ReviewArtifactResult } from '../../workflow/review/index.js';
import { runWorkflowStream } from '../../mcp/daemon-stream.js';
import type { ProgressEvent } from '../../shared/types.js';
import {
	effectiveReviewVerdict, listPendingReviewFindings, resolveReviewFinding,
	type ReviewAction, type ResolveReviewResult,
} from '../../workflow/review/index.js';
import type { Finding, ReviewReport, ReviewVerdict } from '../../workflow/review/types.js';
import type { ReviewResolution } from '../../workflow/types.js';

const log = getLogger('cli:workflow');

export interface EpicSummary {
	readonly epicHash: string;
	readonly epicSlug?: string;
}

export interface ApproveOutcome {
	readonly approval: ApprovalResult;
	readonly tracker?: AutoPushResult;
	readonly commit?:  CommitArtifactsResult;
}

/** Commit + push the artifact files this approval wrote/patched, so the chain
 *  is portable (anyone who pulls has the canonical JSON + MD the next stage
 *  reads). Gated on the github tracker being enabled with `commitArtifacts`
 *  (default true); best-effort — a git failure never breaks the approval. */
function commitApprovedArtifacts(approval: ApprovalResult): CommitArtifactsResult | undefined {
	let meta: { repoPath?: string; epicHash?: string; epicSlug?: string; storyId?: string };
	try { meta = ((JSON.parse(readFileSync(approval.path, 'utf8')) as { meta?: typeof meta }).meta) ?? {}; }
	catch { return undefined; }
	const { repoPath, epicHash, epicSlug, storyId } = meta;
	if (typeof repoPath !== 'string' || typeof epicHash !== 'string') return undefined;

	const cfg = resolveGithubConfig(repoPath);
	if (cfg.type !== 'github' || cfg.commitArtifacts === false) return undefined;

	// The files this approval touched: the approved artifact, plus the Define
	// (which aggregates the epic/story tracker refs on epic/story approvals).
	const files = new Set<string>();
	const add = (p: { md: string; json: string }) => { files.add(p.md); files.add(p.json); };
	if (approval.workflow === 'design.epic') { add(hldArtifactPaths(repoPath, epicHash, epicSlug)); add(defineArtifactPaths(repoPath, epicHash, epicSlug)); }
	else if (approval.workflow === 'design.story' && typeof storyId === 'string') { add(lldArtifactPaths(repoPath, epicHash, storyId, epicSlug)); add(defineArtifactPaths(repoPath, epicHash, epicSlug)); }
	else if (approval.workflow === 'plan' && typeof storyId === 'string') { add(planArtifactPaths(repoPath, epicHash, storyId, epicSlug)); }
	else { add(defineArtifactPaths(repoPath, epicHash, epicSlug)); }

	const result = commitAndPushArtifacts(repoPath, [...files], `chore(workflow): ${approval.workflow} approved — check in artifacts + tracker refs`);
	log.info({ workflow: approval.workflow, committed: result.committed, pushed: result.pushed, reason: result.reason }, 'approve: artifact check-in');
	return result;
}

const DEF_RE = /^DEF-([0-9a-f]{16})\.json$/;

/** Enumerate every Epic that has a Define artifact under
 *  `<repo>/.insrc/artifacts/`. Reads each DEF json's `meta.epicSlug`
 *  for display; returns hashes sorted for stable ordering. */
export function listEpics(repoPath: string): EpicSummary[] {
	const dir = join(repoPath, ARTIFACTS_DIR);
	if (!existsSync(dir)) return [];
	const out: EpicSummary[] = [];
	for (const name of readdirSync(dir).sort()) {
		const m = DEF_RE.exec(name);
		if (m === null) continue;
		const epicHash = m[1] as string;
		let epicSlug: string | undefined;
		try {
			const raw = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { meta?: { epicSlug?: string } };
			epicSlug = raw.meta?.epicSlug;
		} catch { /* malformed — still list by hash */ }
		out.push(epicSlug !== undefined ? { epicHash, epicSlug } : { epicHash });
	}
	return out;
}

/** Full cross-workflow status for one Epic. */
export function chain(repoPath: string, epicHash: string): ChainReport {
	return buildChainReport(repoPath, epicHash);
}

/** Rendered plain-text chain report (the old `insrc workflow chain` body). */
export function chainText(repoPath: string, epicHash: string): string {
	return formatChainReport(buildChainReport(repoPath, epicHash));
}

/** Approve an artifact by its `.md`/`.json` path. When `withTracker`
 *  is true (default), an approved HLD/LLD auto-pushes to the GitHub
 *  tracker — mirroring the old `insrc workflow approve` flow. */
export function approve(artifactPath: string, withTracker = true, overrideReview?: string): ApproveOutcome {
	const jsonPath = jsonPathForMd(artifactPath);
	const approval = approveArtifactByJsonPath(jsonPath, overrideReview !== undefined ? { overrideReview } : undefined);
	if (!withTracker) return { approval };
	let tracker: AutoPushResult | undefined;
	if (approval.workflow === 'design.epic')       tracker = autoPushEpicOnHld(approval.path);
	else if (approval.workflow === 'design.story') tracker = autoPushStoryOnLld(approval.path);
	else if (approval.workflow === 'plan')         tracker = autoPushTasksOnPlan(approval.path);
	// Commit + push AFTER the tracker push, so the checked-in MD carries the
	// re-rendered `**Tracker:**` link and the issue bodies link the committed blob.
	const commit = commitApprovedArtifacts(approval);
	const out: ApproveOutcome = { approval };
	return { ...out, ...(tracker !== undefined ? { tracker } : {}), ...(commit !== undefined ? { commit } : {}) };
}

export function reject(artifactPath: string, reason: string): RejectionResult {
	return rejectArtifactByJsonPath(jsonPathForMd(artifactPath), reason);
}

export interface ReviewFindingsResult {
	readonly verdict:  ReviewVerdict;
	readonly pending:  readonly Finding[];
}

/** The review findings still needing a human (R3), plus the effective verdict. */
export function reviewFindings(artifactPath: string): ReviewFindingsResult {
	const jsonPath = jsonPathForMd(artifactPath);
	const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { review?: ReviewReport; reviewResolutions?: Record<string, ReviewResolution> } }).meta ?? {};
	const review = meta.review;
	if (review === undefined) return { verdict: 'pass', pending: [] };
	return { verdict: effectiveReviewVerdict(review, meta.reviewResolutions), pending: listPendingReviewFindings(review, meta.reviewResolutions) };
}

/** Resolve one review finding (apply | accept | override | defer). */
export function resolveFinding(artifactPath: string, findingId: string, action: ReviewAction, note?: string): ResolveReviewResult {
	return resolveReviewFinding(artifactPath, jsonPathForMd(artifactPath), findingId, action, note);
}

export interface StreamRunResult {
	readonly path:    string;
	readonly runId:   string;
	readonly verdict?: string;
	readonly counts?: { readonly high: number; readonly med: number; readonly low: number };
}

/** Render one live progress frame as a TUI log line. */
function progressLine(stream: 'progress' | 'delta', data: unknown): string {
	const ev = data as ProgressEvent;
	if (ev !== null && typeof ev === 'object' && 'kind' in ev) {
		if (ev.kind === 'stage') return `▸ ${ev.stageLabel}`;
		if (ev.kind === 'token') return `  +${ev.tokensDelta} tok (${ev.tokensTotal})`;
	}
	return `${stream}: ${JSON.stringify(data).slice(0, 100)}`;
}

/** Run a workflow to completion via the daemon `workflow.run` stream,
 *  emitting each live progress frame to `onLine` (the TUI log). Returns the
 *  artifact path + the finalize review verdict. The daemon auto-reviews at
 *  finalize (R2), so `verdict` reflects the review gate. */
export async function runWorkflowStreaming(
	repoPath: string,
	workflow: string,
	focus: string,
	params: Record<string, unknown>,
	onLine: (line: string) => void,
): Promise<StreamRunResult> {
	const out = await runWorkflowStream(
		{ repo: repoPath, workflow, focus, params },
		{ onFrame: (stream, data) => onLine(progressLine(stream, data)) },
	);
	const review = out.review as { verdict?: string; counts?: { high: number; med: number; low: number } } | undefined;
	return {
		path: out.path,
		runId: out.runId,
		...(typeof review?.verdict === 'string' ? { verdict: review.verdict } : {}),
		...(review?.counts !== undefined ? { counts: review.counts } : {}),
	};
}

/** Run the grounded review cycle over an artifact: verify its premises
 *  against real source, auto-fix the fixable findings, re-review, and stamp
 *  `meta.review`. Uses the `claude` CLI provider (accuracy-first). The
 *  resulting `block` verdict is what `approve` then enforces. */
export async function reviewArtifact(repoPath: string, artifactPath: string): Promise<ReviewArtifactResult> {
	const provider = new CliProvider({ kind: 'claude' });
	return reviewArtifactFile({
		mdPath:     artifactPath,
		jsonPath:   jsonPathForMd(artifactPath),
		repo:       repoPath,
		provider,
		model:      'cli-claude',
		reviewedAt: new Date().toISOString(),
	});
}

export function ackStale(artifactPath: string, reason: string): { readonly path: string; readonly ackedAt: string; readonly reason: string } {
	return ackStaleArtifact(jsonPathForMd(artifactPath), reason);
}

export function amendments(repoPath: string, epicHash: string): readonly AmendmentRecord[] {
	return listAmendments(repoPath, epicHash);
}

export function showAmendment(repoPath: string, amendmentId: string): AmendmentRecord {
	return readAmendment(repoPath, amendmentId);
}

export function approveAmendmentById(repoPath: string, amendmentId: string, approvedBy: string): AmendmentRecord {
	return approveAmendment(repoPath, amendmentId, approvedBy);
}

export function rejectAmendmentById(repoPath: string, amendmentId: string, reason: string): AmendmentRecord {
	return rejectAmendment(repoPath, amendmentId, reason);
}

/** Staleness scan for an Epic's LLDs. Returns [] if no base HLD yet. */
export function staleness(repoPath: string, epicHash: string): readonly StaleLldEntry[] {
	let baseHld;
	try { baseHld = readBaseHld(repoPath, epicHash); }
	catch { return []; }
	return scanLldStaleness(repoPath, epicHash, baseHld);
}

export function slugFor(focus: string): string {
	return deriveSlug(focus);
}

/** Every `deferred` open question across an Epic's DEF + HLD + all LLDs — the
 *  deferred-review surface. Deferred questions never auto-resurface at a stage
 *  boundary; this is how they come back. */
export function deferredQuestions(repoPath: string, epicHash: string): readonly DeferredQuestion[] {
	return listDeferred(repoPath, epicHash);
}

/** Resolve an `<epicSlug|hash>` argument to a canonical 16-hex Epic hash, or
 *  undefined when neither a hash nor a known slug matches. */
export function resolveEpicHashArg(repoPath: string, hashOrSlug: string): string | undefined {
	if (/^[0-9a-f]{16}$/.test(hashOrSlug)) return hashOrSlug;
	return listEpics(repoPath).find(e => e.epicSlug === hashOrSlug)?.epicHash;
}

/** Pull GitHub issue state for an Epic + its Stories into meta.tracker
 *  (read by the chain report). Deterministic; read-only against GitHub. */
export function sync(repoPath: string, epicHash: string): SyncResult {
	return syncTracker(repoPath, epicHash);
}

/** Bootstrap the GitHub tracker for a repo — auth/scope preflight, config,
 *  labels, issue types, and (optionally) a Projects board. Returns a
 *  structured checklist; the command layer renders it. */
export function trackerSetup(repoPath: string, opts: TrackerSetupOptions = {}): TrackerSetupReport {
	return runTrackerSetup(repoPath, opts);
}
