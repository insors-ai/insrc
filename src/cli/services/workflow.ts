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
import { basename, join } from 'node:path';

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
	workItemAnchorCreatedAt, workItemKindOf,
} from '../../workflow/storage.js';
import { FileSidecarStore } from '../../workflow/artifact-core/sidecar-store.js';
import { unitHeadId } from '../../workflow/tracker/unit-head.js';
import { commitAndPushArtifacts, type CommitArtifactsResult } from '../../workflow/tracker/github.js';
import {
	configAlreadyDetail, configWrittenDetail, planTrackerConfig, runTrackerSetup,
	type ConfigOutcome, type TrackerConfigPlan, type TrackerSetupOptions, type TrackerSetupReport,
} from '../../workflow/tracker/setup.js';
import { githubConfigPath, resolveGithubConfig } from '../../workflow/config/github.js';
import { syncTracker, type SyncResult } from '../../workflow/tracker/sync.js';
import { openTracker } from '../../workflow/tracker-auto.js';
import { lifecycleFor, repoOfArtifactPath } from '../../daemon/lifecycle-registry.js';
import type { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
import { syncPlanTasks } from '../../daemon/tasks-sync.js';
import type { SyncResult as TaskSyncResult } from '../../workflow/tasks/task-set.js';
import { attachApprovedDocument } from '../../workflow/tracker/attach-unit.js';
import type { AttachUnitResult } from '../../workflow/tracker/attach-unit.js';
import { getLogger } from '../../shared/logger.js';
import { createRoleRouter } from '../../analyze/context/role-router.js';
import { runWithRoutingContext } from '../../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { shippedModelRegistry } from '../shipped-model-registry.js';
import { reviewArtifactFile, type ReviewArtifactResult } from '../../workflow/review/index.js';
import { readReviewRecordOf } from '../../workflow/review/report-file.js';
import { rpc } from '../client.js';
import type { Socket } from 'node:net';
import type { Entity } from '../../shared/types.js';
import { runWorkflowStream, type RunWorkflowStreamDeps } from '../../mcp/daemon-stream.js';
import type { ProgressEvent } from '../../shared/types.js';
import {
	effectiveReviewVerdict, listPendingReviewFindings, resolveReviewFinding,
	type ReviewAction, type ResolveReviewResult,
} from '../../workflow/review/index.js';
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

/** Commit + push the artifact files this approval wrote/patched, so the chain
 *  is portable (anyone who pulls has the canonical JSON + MD the next stage
 *  reads). Gated on the github tracker being enabled with `commitArtifacts`
 *  (default true); best-effort — a git failure never breaks the approval. */
function commitApprovedArtifacts(approval: ApprovalResult): CommitArtifactsResult | undefined {
	let meta: { repoPath?: string; epicHash?: string; epicSlug?: string; storyId?: string; createdAt?: string; epicCreatedAt?: string; standalone?: boolean };
	try { meta = ((JSON.parse(readFileSync(approval.path, 'utf8')) as { meta?: typeof meta }).meta) ?? {}; }
	catch { return undefined; }
	const { repoPath, epicHash, epicSlug, storyId } = meta;
	if (typeof repoPath !== 'string' || typeof epicHash !== 'string') return undefined;

	const cfg = resolveGithubConfig(repoPath);
	if (cfg.type !== 'github' || cfg.commitArtifacts === false) return undefined;

	// sc2 folder args from the approved artifact's own meta — its epicCreatedAt
	// anchor is the Epic's define createdAt, so the Define (added alongside on
	// epic/story approvals) resolves to the same work-item folder.
	const anchor = workItemAnchorCreatedAt(meta);
	const kind = workItemKindOf(meta);

	// The files this approval touched: the approved artifact, the Define on epic/story approvals, and the sidecar
	// log of each head written, plus the head of the unit whose issue the push bound (the EPIC or STORY head).
	const files = new Set<string>();
	const add = (p: { md: string; json: string }) => { files.add(p.md); files.add(p.json); };
	const addHead = (id: string | undefined): void => { if (id !== undefined) for (const f of headFiles(repoPath, id)) files.add(f); };
	if (approval.workflow === 'design.epic') { add(hldArtifactPaths(repoPath, epicHash, anchor, kind, epicSlug)); add(defineArtifactPaths(repoPath, epicHash, anchor, kind, epicSlug)); }
	else if (approval.workflow === 'design.story' && typeof storyId === 'string') { add(lldArtifactPaths(repoPath, epicHash, storyId, anchor, kind, epicSlug)); add(defineArtifactPaths(repoPath, epicHash, anchor, kind, epicSlug)); }
	else if (approval.workflow === 'plan' && typeof storyId === 'string') { add(planArtifactPaths(repoPath, epicHash, storyId, anchor, kind, epicSlug)); }
	else { add(defineArtifactPaths(repoPath, epicHash, anchor, kind, epicSlug)); }

	addHead(basename(approval.path).replace(/\.json$/, ''));
	addHead(unitHeadOf(approval.workflow, epicHash, storyId));
	const result = commitAndPushArtifacts(repoPath, [...files], `chore(workflow): ${approval.workflow} approved — check in artifacts + tracker refs`);
	log.info({ workflow: approval.workflow, committed: result.committed, pushed: result.pushed, reason: result.reason }, 'approve: artifact check-in');
	return result;
}

/** The files of the head `id` that exist: its json and its change log and feedback lines. */
function headFiles(repoPath: string, id: string): string[] {
	const sidecar = new FileSidecarStore(repoPath);
	return [`${ARTIFACTS_DIR}/${id}.json`, sidecar.filesOf(id).log, sidecar.filesOf(id).feedback].map(rel => join(repoPath, rel)).filter(f => existsSync(f));
}

/** The head of the unit an approval belongs to: the EPIC head for a design.epic approval or an Epic-level one, else the STORY head. */
function unitHeadOf(workflow: string, epicHash: string, storyId: unknown): string | undefined {
	return unitHeadId({ unit: workflow === 'design.epic' || typeof storyId !== 'string' ? 'epic' : 'story', epicHash, ...(typeof storyId === 'string' ? { storyId } : {}) });
}

/** After the check-in commit the approved files are clean, so their permalinks name that commit: attach the approved document (and its
 *  companions) to the unit's issue, then commit the unit head that records the attachments, in a second commit. Without a commit
 *  there is nothing to link to, and the reason is stated. */
function attachApprovedDocuments(approval: ApprovalResult, commit: CommitArtifactsResult | undefined): { attach: AttachUnitResult | { skipped: string }; commit?: CommitArtifactsResult } | undefined {
	if (approval.workflow !== 'design.epic' && approval.workflow !== 'design.story' && approval.workflow !== 'plan') return undefined;
	let meta: { repoPath?: string; epicHash?: string; epicSlug?: string; storyId?: string; epicCreatedAt?: string; createdAt?: string; standalone?: boolean };
	try { meta = ((JSON.parse(readFileSync(approval.path, 'utf8')) as { meta?: typeof meta }).meta) ?? {}; }
	catch { return undefined; }
	const { repoPath, epicHash, epicSlug, storyId } = meta;
	if (typeof repoPath !== 'string' || typeof epicHash !== 'string') return undefined;
	if (commit === undefined) return { attach: { skipped: 'attachments skipped: the artifacts are not committed' } };
	const gate = openTracker(repoPath);
	if ('skip' in gate) return undefined;
	const result = attachApprovedDocument(approval.workflow, { repoPath, epicHash, ...(storyId !== undefined ? { storyId } : {}) }, gate.port);
	if ('error' in result || result.attached.length + result.reconciled.length === 0) return { attach: result };
	// the attachments are recorded on the unit's head
	const headId = unitHeadOf(approval.workflow, epicHash, storyId);
	if (headId === undefined) return { attach: result };
	// the head, and the log and feedback lines recording the attachment on it
	const second = commitAndPushArtifacts(repoPath, headFiles(repoPath, headId), `chore(workflow): ${approval.workflow} approved — record the attached documents`);
	log.info({ workflow: approval.workflow, committed: second.committed, pushed: second.pushed, reason: second.reason }, 'approve: attachment records check-in');
	return { attach: result, commit: second };
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
export async function approve(artifactPath: string, withTracker = true, overrideReview?: string): Promise<ApproveOutcome> {
	const jsonPath = jsonPathForMd(artifactPath);
	// the approval is made in the lifecycle of the repository that holds the artifact
	const approval = await approveArtifactByJsonPath(jsonPath, { lifecycle: lifecycleOfArtifact(jsonPath), ...(overrideReview !== undefined ? { overrideReview } : {}) });
	// An approved plan makes the Story's Tasks artifacts, before their issues are pushed; never fails the approval
	const tasks = approval.workflow === 'plan' ? await syncPlanTasks(approval.path) : undefined;
	if (!withTracker) return { approval, ...(tasks !== undefined ? { tasks } : {}) };
	let tracker: AutoPushResult | undefined;
	if (approval.workflow === 'design.epic')       tracker = await autoPushEpicOnHld(approval.path);
	else if (approval.workflow === 'design.story') tracker = await autoPushStoryOnLld(approval.path);
	else if (approval.workflow === 'plan')         tracker = await autoPushTasksOnPlan(approval.path);
	// Commit + push AFTER the tracker push, so the checked-in MD carries the
	// re-rendered `**Tracker:**` link and the issue bodies link the committed blob.
	const commit = commitApprovedArtifacts(approval);
	let attached: ReturnType<typeof attachApprovedDocuments>;
	try { attached = attachApprovedDocuments(approval, commit); }
	catch (err) { log.warn({ workflow: approval.workflow, err: (err as Error).message }, 'approve: attaching the approved document failed'); attached = { attach: { error: (err as Error).message } }; }
	const out: ApproveOutcome = { approval };
	return {
		...out, ...(tasks !== undefined ? { tasks } : {}), ...(tracker !== undefined ? { tracker } : {}), ...(commit !== undefined ? { commit } : {}),
		...(attached !== undefined ? { attach: attached.attach, ...(attached.commit !== undefined ? { attachCommit: attached.commit } : {}) } : {}),
	};
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
export function resolveFinding(artifactPath: string, findingId: string, action: ReviewAction, note?: string): Promise<ResolveReviewResult> {
	return resolveReviewFinding(artifactPath, jsonPathForMd(artifactPath), findingId, action, note);
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
export async function reviewArtifact(
	repoPath: string,
	artifactPath: string,
	reviewFile: typeof reviewArtifactFile = reviewArtifactFile,
): Promise<ReviewArtifactResult> {
	// The TUI resolves from the shipped definitions only (never the user's store) until s5.
	const registry = shippedModelRegistry();
	const router = createRoleRouter({ registry });
	// Establish the sc6 routing seam so the review resolves through the same
	// choke point as the workflow runner, and any deep reasoning it triggers is
	// tiered per-role rather than falling through to the legacy provider.
	return runWithRoutingContext({ router, repoPath }, async () => {
		const { provider, resolution } = router.resolveProviderForRole('review', loadAnalyzeConfig(registry), repoPath);
		return reviewFile({
			mdPath:     artifactPath,
			jsonPath:   jsonPathForMd(artifactPath),
			repo:       repoPath,
			lifecycle:  lifecycleFor(repoPath).service,
			provider,
			model:      `${resolution.runner}:${resolution.model}`,
			reviewedAt: new Date().toISOString(),
			// This review runs in the CLI's process, which may not open the
			// store: the source roots come from the daemon.
			readEntitiesForRepo: readEntitiesForRepoFromDaemon,
		});
	});
}

/**
 * The repository's indexed file entities, asked of the daemon. Only the daemon
 * opens the store; a failure here (no daemon, an unknown request on an older
 * daemon) makes the review fall back to the repository root and say so.
 */
export async function readEntitiesForRepoFromDaemon(repoPath: string): Promise<Entity[]> {
	const reply = await rpc<Entity[] | { error: string }>('repo.entitiesForSourceRoots', { repoPath });
	if (!Array.isArray(reply)) throw new Error(reply.error);
	return reply;
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
export function sync(repoPath: string, epicHash: string): SyncResult {
	return syncTracker(repoPath, epicHash);
}

/** The deadline on the daemon call that writes the tracker config. It bounds only that call. */
export const TRACKER_CONFIG_TIMEOUT_MS = 15000;

/** Seams for the tracker setup wrapper; tests replace them, production uses the defaults. */
export interface TrackerSetupDeps {
	readonly connect?: (() => Socket) | undefined;
	readonly timeoutMs?: number | undefined;
	readonly plan?: ((repoPath: string) => TrackerConfigPlan) | undefined;
	readonly run?: ((repoPath: string, opts: TrackerSetupOptions) => TrackerSetupReport) | undefined;
}

type EnsureReply = { readonly ok: true; readonly changed: boolean } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

/** Asks the daemon, the only writer of github.json, to apply the plan; every failure becomes a failed outcome. */
async function ensureThroughDaemon(repoPath: string, plan: Extract<TrackerConfigPlan, { status: 'needs-write' }>, deps: TrackerSetupDeps): Promise<ConfigOutcome> {
	const path = githubConfigPath();
	try {
		const connect = deps.connect;
		const params = { repo: repoPath, owner: plan.owner, name: plan.name };
		const opts = { timeoutMs: deps.timeoutMs ?? TRACKER_CONFIG_TIMEOUT_MS };
		const reply = connect === undefined
			? await rpc<EnsureReply>('repo.trackerConfig.ensure', params, undefined, opts)
			: await rpc<EnsureReply>('repo.trackerConfig.ensure', params, connect, opts);
		if (!reply.ok) return { status: 'failed', detail: reply.error.message };
		return reply.changed
			? { status: 'done', detail: configWrittenDetail(path, plan.owner, plan.name) }
			: { status: 'already', detail: configAlreadyDetail(path, plan.owner, plan.name) };
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		return { status: 'failed', detail: `could not write ${path}: the daemon owns that file and must be running to change it (${reason})` };
	}
}

/** Bootstrap the GitHub tracker for a repo — auth/scope preflight, config,
 *  labels, issue types, and (optionally) a Projects board. Returns a
 *  structured checklist; the command layer renders it.
 *
 *  The config step never writes github.json from this process: it is planned here
 *  and, when a write is needed, requested from the daemon with a bounded call. The
 *  deadline covers only that call; the remaining steps run afterwards whatever its
 *  outcome, and are not bounded by it. */
export async function trackerSetup(repoPath: string, opts: TrackerSetupOptions = {}, deps: TrackerSetupDeps = {}): Promise<TrackerSetupReport> {
	const plan = (deps.plan ?? planTrackerConfig)(repoPath);
	const configOutcome: ConfigOutcome = plan.status === 'needs-write'
		? await ensureThroughDaemon(repoPath, plan, deps)
		: { status: plan.status, detail: plan.detail };
	const run = deps.run ?? runTrackerSetup;
	return run(repoPath, { ...opts, configOutcome });
}
