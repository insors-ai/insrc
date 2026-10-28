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
import { jsonPathForMd, rejectArtifactByJsonPath, ackStaleArtifact, readBaseHld, type ApprovalResult, type RejectionResult } from '../../workflow/gates.js';
import type { AutoPushResult } from '../../workflow/tracker-auto.js';
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
import { ARTIFACTS_DIR } from '../../workflow/storage.js';
import type { CommitArtifactsResult } from '../../workflow/tracker/github.js';
import type { TrackerSetupOptions, TrackerSetupReport } from '../../workflow/tracker/setup.js';
import type { SyncResult } from '../../workflow/tracker/sync.js';
import { lifecycleFor, repoOfArtifactPath } from '../../daemon/lifecycle-registry.js';
import type { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
import type { SyncResult as TaskSyncResult } from '../../workflow/tasks/task-set.js';
import type { AttachUnitResult } from '../../workflow/tracker/attach-unit.js';
import { getLogger } from '../../shared/logger.js';
import type { ReviewArtifactResult } from '../../workflow/review/index.js';
import { readReviewRecordOf } from '../../workflow/review/report-file.js';
import { rpc } from '../client.js';
import type { Socket } from 'node:net';
import { runWorkflowStream, type RunWorkflowStreamDeps } from '../../mcp/daemon-stream.js';
import type { ProgressEvent } from '../../shared/types.js';
import { effectiveReviewVerdict, listPendingReviewFindings, type ReviewAction, type ResolveReviewResult } from '../../workflow/review/index.js';
import type { Finding, ReviewVerdict } from '../../workflow/review/types.js';

const log = getLogger('cli:workflow');

export interface EpicSummary {
	readonly epicHash: string;
	readonly epicSlug?: string;
}

export interface ApproveOutcome {
	readonly approval: ApprovalResult;
	readonly tracker?: AutoPushResult;
	readonly commit?:  CommitArtifactsResult;
	/** What a plan approval did to the Story's Task set, or why it could not (the approval stands either way). */
	readonly tasks?:   TaskSyncResult;
	/** The approved document's links on its unit's issue, or why none were attached. */
	readonly attach?:  AttachUnitResult | { readonly skipped: string };
	/** The second commit, of the unit head that records the attachments. */
	readonly attachCommit?: CommitArtifactsResult;
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

/** The error of a daemon answer `{ error }`; a refusal keeps the name the terminal's commands print it by (the error crossed the socket as text). */
export function refusalErrorOf(failed: { readonly error: string; readonly refusal?: { readonly kind: string; readonly text: string } | undefined }): Error {
	const error = new Error(failed.error);
	if (failed.refusal?.kind === 'review-blocked') Object.assign(error, { name: 'ReviewBlockedError', summary: failed.refusal.text });
	if (failed.refusal?.kind === 'team-refused') Object.assign(error, { name: 'TeamGateRefusedError', reason: failed.refusal.text });
	return error;
}

/**
 * The call of a daemon method (Story s10): `rpc` that rejects on a premature close and sets no timer. An older daemon that does not know the
 * method is a clear error and nothing runs locally in its place. A `{ error }` answer is thrown as the error it names.
 */
export async function callDaemon<T>(method: string, params: unknown, connect?: () => Socket): Promise<T> {
	let reply: T | { readonly error: string };
	try {
		reply = connect === undefined
			? await rpc<T | { error: string }>(method, params, undefined, { closeAware: true })
			: await rpc<T | { error: string }>(method, params, connect, { closeAware: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (/^unknown method: /.test(message)) {
			throw new Error(`the daemon does not support ${method} (it is older than this client): restart it from this checkout and repeat the command; nothing was run or changed`);
		}
		if (/closed the connection before replying/.test(message)) {
			throw new Error(`${message}; the daemon carries on with ${method} by itself, so check the result before repeating it`);
		}
		throw err;
	}
	if (reply !== null && typeof reply === 'object' && 'error' in reply && typeof (reply as { error: unknown }).error === 'string') {
		throw refusalErrorOf(reply as { error: string; refusal?: { kind: string; text: string } });
	}
	return reply as T;
}

/** What `workflow.approvePipeline` answers: the approval and every follow-on entry. */
interface PipelineReply {
	readonly approval: ApprovalResult;
	readonly followOn: readonly import('../../workflow/gates.js').FollowOnOutcome[];
}

/** Rebuild the terminal's ApproveOutcome from the pipeline's follow-on entries; an entry stopped by a denial becomes the failed outcome of its step. */
export function approveOutcomeOf(reply: PipelineReply): ApproveOutcome {
	const entry = (kind: import('../../workflow/gates.js').FollowOnOutcome['kind']) => reply.followOn.find(e => e.kind === kind);
	const sync = entry('tasks-sync'), push = entry('tracker-push'), commit = entry('artifact-commit'), attach = entry('document-attach'), second = entry('attach-commit');
	const failedPush = (note: string | undefined): AutoPushResult => ({ status: 'failed', reason: note ?? 'the publication stopped' });
	return {
		approval: reply.approval,
		...(sync !== undefined ? { tasks: (sync.taskSync ?? { error: sync.note ?? 'the Task reconciliation stopped' }) as TaskSyncResult } : {}),
		...(push !== undefined ? { tracker: (push.tracker ?? failedPush(push.note)) as AutoPushResult } : {}),
		...(commit !== undefined ? { commit: commit.commit ?? { committed: false, pushed: false, reason: commit.note ?? 'the check-in commit stopped' } } : {}),
		...(attach !== undefined ? { attach: (attach.attach ?? { error: attach.note ?? 'the attachment stopped' }) as AttachUnitResult | { readonly skipped: string } } : {}),
		...(second !== undefined ? { attachCommit: second.commit ?? { committed: false, pushed: false, reason: second.note ?? 'the commit of the attachment records stopped' } } : {}),
	};
}

/** Approve an artifact by its `.md`/`.json` path through the daemon's approve pipeline. When `withTracker` is true (default) an approved
 *  HLD/LLD/plan is published to the GitHub tracker, checked in and attached; false stops after the approval and the Task reconciliation. */
export async function approve(artifactPath: string, withTracker = true, overrideReview?: string, connect?: () => Socket): Promise<ApproveOutcome> {
	const reply = await callDaemon<PipelineReply>('workflow.approvePipeline', { artifactPath, withTracker, ...(overrideReview !== undefined ? { overrideReview } : {}) }, connect);
	return approveOutcomeOf(reply);
}

/** The service of the repository that holds the artifact at `jsonPath`. */
function lifecycleOfArtifact(jsonPath: string): LifecycleService {
	const repoPath = repoOfArtifactPath(jsonPath);
	if (repoPath === undefined) throw new Error(`no repository holds ${jsonPath}: it is not under a .insrc/artifacts folder`);
	return lifecycleFor(repoPath).service;
}

export async function reject(artifactPath: string, reason: string): Promise<RejectionResult> {
	const jsonPath = jsonPathForMd(artifactPath);
	return rejectArtifactByJsonPath(jsonPath, reason, { lifecycle: lifecycleOfArtifact(jsonPath) });
}

export interface ReviewFindingsResult {
	readonly verdict:  ReviewVerdict;
	readonly pending:  readonly Finding[];
}

/** The review findings still needing a human (R3), plus the effective verdict. */
export function reviewFindings(artifactPath: string): ReviewFindingsResult {
	// the report and its resolutions are the review entry and the later entries of the artifact's log
	const stored = readReviewRecordOf(jsonPathForMd(artifactPath));
	if (stored === undefined) return { verdict: 'pass', pending: [] };
	return { verdict: effectiveReviewVerdict(stored.report, stored.resolutions), pending: listPendingReviewFindings(stored.report, stored.resolutions) };
}

/** Resolve one review finding (apply | accept | override | defer). */
export async function resolveFinding(artifactPath: string, findingId: string, action: ReviewAction, note?: string, connect?: () => Socket): Promise<ResolveReviewResult> {
	return await callDaemon<ResolveReviewResult>('workflow.resolveFinding', { artifactPath, findingId, action, ...(note !== undefined ? { note } : {}) }, connect);
}

export interface StreamRunResult {
	readonly path:    string;
	readonly runId:   string;
	readonly verdict?: string;
	readonly counts?: { readonly high: number; readonly med: number; readonly low: number };
	/** Team repos only: whether every unit of the draft has its tracker issue. */
	readonly issueReadiness?: unknown;
	/** Team repos only, when the draft is not ready: what the author is told. */
	readonly notice?: string | undefined;
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
	deps?: RunWorkflowStreamDeps,
): Promise<StreamRunResult> {
	const out = await runWorkflowStream(
		{ repo: repoPath, workflow, focus, params },
		{ onFrame: (stream, data) => onLine(progressLine(stream, data)) },
		deps,
	);
	const review = out.review as { verdict?: string; counts?: { high: number; med: number; low: number } } | undefined;
	return {
		path: out.path,
		runId: out.runId,
		...(typeof review?.verdict === 'string' ? { verdict: review.verdict } : {}),
		...(review?.counts !== undefined ? { counts: review.counts } : {}),
		...(out.issueReadiness !== undefined ? { issueReadiness: out.issueReadiness } : {}),
		...(typeof out.notice === 'string' ? { notice: out.notice } : {}),
	};
}

/** Run the grounded review cycle over an artifact: verify its premises
 *  against real source, auto-fix the fixable findings, re-review, and stamp
 *  the lifecycle review. Review is a critical (`review`) role → resolves the HIGH
 *  (core) tier via the RoleRouter (default: claude opus; whatever the operator
 *  pinned core to otherwise). The resulting `block` verdict is what `approve`
 *  then enforces. */
export async function reviewArtifact(repoPath: string, artifactPath: string, connect?: () => Socket): Promise<ReviewArtifactResult> {
	return await callDaemon<ReviewArtifactResult>('workflow.reviewArtifact', { repoPath, artifactPath }, connect);
}

export async function ackStale(artifactPath: string, reason: string): Promise<{ readonly path: string; readonly ackedAt: string; readonly reason: string }> {
	const jsonPath = jsonPathForMd(artifactPath);
	return ackStaleArtifact(jsonPath, reason, { lifecycle: lifecycleOfArtifact(jsonPath) });
}

export function amendments(repoPath: string, epicHash: string): readonly AmendmentRecord[] {
	return listAmendments(repoPath, epicHash);
}

export function showAmendment(repoPath: string, amendmentId: string): AmendmentRecord {
	return readAmendment(repoPath, amendmentId);
}

export function approveAmendmentById(repoPath: string, amendmentId: string, approvedBy: string): Promise<AmendmentRecord> {
	return approveAmendment(repoPath, amendmentId, approvedBy);
}

export function rejectAmendmentById(repoPath: string, amendmentId: string, reason: string): Promise<AmendmentRecord> {
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
export async function sync(repoPath: string, epicHash: string, connect?: () => Socket): Promise<SyncResult> {
	return await callDaemon<SyncResult>('tracker.sync', { repoPath, epicHash }, connect);
}

/** Seams for the tracker setup wrapper; tests replace them, production uses the defaults. */
export interface TrackerSetupDeps {
	readonly connect?: (() => Socket) | undefined;
}

/** Bootstrap the GitHub tracker for a repo — auth/scope preflight, config, labels, issue types, and (optionally) a Projects board — in the
 *  daemon, which owns github.json and reaches gh and git through the registry. Returns the structured checklist; the command layer renders it. */
export async function trackerSetup(repoPath: string, opts: TrackerSetupOptions = {}, deps: TrackerSetupDeps = {}): Promise<TrackerSetupReport> {
	return await callDaemon<TrackerSetupReport>('tracker.setup', { repoPath, opts }, deps.connect);
}
