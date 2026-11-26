/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * handleSecurityReviewStep (s3/t5), Epic add-dedicated-security-reviews.
 *
 * sc3's entry-point body: on a FRESH request, authorizes repoPath against the
 * real repo registry, validates targets are well-shaped and contained inside
 * repoPath, then checks the repo's graph-index freshness against
 * targets.entries and pauses with {next:'confirm_wait'} when stale, before
 * resolveSecurityModel, collectDependencyAdvisories or any round has run. The
 * confirm_wait `state` is an OPAQUE, daemon-minted token (the shared
 * step-state store, matching insrc_workflow_step's own pattern) -- never a
 * caller-decodable blob, so a resumed call can never substitute a different
 * repoPath/targets/identity than the one the original fresh request actually
 * authorized. A RESUMED call ({state, proceed}) re-authorizes the stored
 * repoPath (never trusted merely because it was authorized once, at pause
 * time) and either waits (unbounded, cancellable) for a fresh index
 * (proceed:true) or runs degraded against the index as-is (proceed:false) --
 * both reach {next:'done'} with a fully populated report (its OWN `degraded`
 * field, not bolted on afterward -- see run-security-review.ts), markdown and
 * a `degraded` flag recording which path was taken. epicHash/storyId named on
 * the original request are threaded straight into runSecurityReview's opts,
 * never re-derived here.
 */

import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { resolveRepoLastIndexedAt } from '../../analyze/context/driver.js';
import { loadAnalyzeConfig, resolveSecurityModel } from '../../config/analyze.js';
import { getModelRegistry } from '../../daemon/model-registry.js';
import { getStepStateStore } from '../../daemon/threads/step-state.js';
import type { ReviewTargets } from '../artifact-core/types.js';
import { assertTargetsCanonicallyContained, checkRepoRegistered } from './content-identity.js';
import { collectDependencyAdvisories } from './collect-dependency-advisories.js';
import { assertTargetsContained, runSecurityReview, type SecurityReviewReport } from './run-security-review.js';

const MODEL_PROBE_DEADLINE_MS = 15_000;
/** proceed:true genuinely WAITS for a fresh index -- unlike proceed:false, it
 *  never silently runs degraded. Polls at this interval with no attempt cap;
 *  the caller (a human, via confirm_wait) chose to wait, so this does not
 *  second-guess that choice with a hidden timeout. Bounded instead by three
 *  real stop conditions: cancellation (signal), a target that can never
 *  become fresh (permanently missing/unreadable -- see StatOutcome below),
 *  or the repo's own registration withdrawn mid-wait. */
const FRESHNESS_POLL_INTERVAL_MS = 2_000;

export interface SecurityReviewStepFreshRequest {
	readonly phase: 'start';
	readonly repoPath: string;
	readonly targets: ReviewTargets;
	readonly epicHash?: string;
	readonly storyId?: string;
}

export interface SecurityReviewStepResumedRequest {
	readonly phase: 'start';
	readonly state: string;
	readonly proceed: boolean;
}

export type SecurityReviewStepRequest = SecurityReviewStepFreshRequest | SecurityReviewStepResumedRequest;

export interface SecurityReviewStepConfirmWait {
	readonly next: 'confirm_wait';
	readonly state: string;
	readonly guidance: string;
}

export interface SecurityReviewStepDone {
	readonly next: 'done';
	readonly report: SecurityReviewReport;
	readonly markdown: string;
	/** Copied verbatim from report.degraded -- see SecurityReviewReport's own
	 *  doc for why the disposition lives on the report itself, not only here. */
	readonly degraded: boolean;
}

export type SecurityReviewStepResponse = SecurityReviewStepConfirmWait | SecurityReviewStepDone;

/** Thrown when a repoPath (fresh request, or loaded from a resumed call's own
 *  server-side state) does not name a currently-registered repository --
 *  checked before any stat, model probe, dependency audit or artifact write,
 *  on BOTH the fresh and the resumed path; a resumed call never merely trusts
 *  that its stored repoPath was authorized once, at pause time. */
export class SecurityReviewRepoNotRegisteredError extends Error {
	constructor(repoPath: string) {
		super(`handleSecurityReviewStep: '${repoPath}' is not a registered repo`);
		this.name = 'SecurityReviewRepoNotRegisteredError';
	}
}

/** Thrown when request.signal is already aborted, or becomes aborted while
 *  waiting for a fresh index. */
export class SecurityReviewCancelledError extends Error {
	constructor() {
		super('handleSecurityReviewStep: cancelled');
		this.name = 'SecurityReviewCancelledError';
	}
}

/** Thrown when proceed:true's wait can never succeed: at least one target is
 *  permanently missing/unreadable (not merely lagging the index), so looping
 *  would wait forever for a freshness signal that can never arrive. */
export class SecurityReviewTargetUnreachableError extends Error {
	constructor(path: string, reason: string) {
		super(`handleSecurityReviewStep: target '${path}' is permanently unreachable (${reason}) -- waiting for it to be indexed can never succeed`);
		this.name = 'SecurityReviewTargetUnreachableError';
	}
}

/** Thrown when a fresh request's targets.entries resolves outside repoPath --
 *  the SAME lexical containment check runSecurityReview itself later runs,
 *  but run HERE first, before this module's own earlier I/O (the freshness
 *  stat) ever touches the resolved path. */
export class SecurityReviewTargetOutOfScopeError extends Error {
	constructor(reason: string) {
		super(`handleSecurityReviewStep: ${reason}`);
		this.name = 'SecurityReviewTargetOutOfScopeError';
	}
}

interface StatePayload {
	readonly repoPath: string;
	readonly targets: ReviewTargets;
	readonly epicHash?: string;
	readonly storyId?: string;
}

/** True when `targets` is well-shaped: a non-empty `entries` array of objects
 *  each carrying a non-empty string `path`. Checked before minting state (a
 *  fresh request) and is therefore never re-checked on resume -- only ever
 *  WE write the server-side entry a resumed call reads back. */
function isWellShapedTargets(targets: unknown): targets is ReviewTargets {
	if (typeof targets !== 'object' || targets === null) return false;
	const entries = (targets as { entries?: unknown }).entries;
	return Array.isArray(entries) && entries.length > 0
		&& entries.every(e => typeof e === 'object' && e !== null && typeof (e as { path?: unknown }).path === 'string' && (e as { path: string }).path.length > 0);
}

/** Runs run-security-review.ts's OWN assertTargetsContained -- the SAME
 *  lexical containment check, never a second duplicated copy -- here BEFORE
 *  any I/O of this module's own (the freshness stat), not merely relying on
 *  runSecurityReview's later guard, which by then has already let this
 *  module's own stat calls touch an out-of-scope path. Re-thrown under this
 *  module's own error type so callers see one consistent class regardless of
 *  which layer's guard actually caught the escape. */
function assertTargetsContainedEarly(repoPath: string, targets: ReviewTargets): void {
	try {
		assertTargetsContained(repoPath, targets);
	} catch (err) {
		throw new SecurityReviewTargetOutOfScopeError((err as Error).message);
	}
}

/** Runs content-identity.ts's OWN assertTargetsCanonicallyContained -- the
 *  REAL (realpath-resolved) containment check, closing the gap the lexical
 *  check above cannot see: a symlinked path component, or the target itself
 *  being a symlink, pointing outside repoPath. Run on every fresh request
 *  AND on every resumed call (both proceed:true and proceed:false), before
 *  any model or advisory work -- a target can change between the original
 *  admission and a later resume, so the lexical pass at confirm_wait time is
 *  never treated as sufficient for the resumed call too. */
async function assertCanonicalContainment(repoPath: string, targets: ReviewTargets): Promise<void> {
	const check = testDeps.canonicallyContained ?? assertTargetsCanonicallyContained;
	try {
		await check(repoPath, targets);
	} catch (err) {
		throw new SecurityReviewTargetOutOfScopeError((err as Error).message);
	}
}

/** Mints an opaque, daemon-held confirm_wait token for `payload` -- never a
 *  caller-decodable blob. Matches insrc_workflow_step's own established
 *  pattern (src/daemon/steps/workflow-step/state-store.ts): the shared
 *  step-state store, under its own 'security-review' kind, so a resumed call
 *  can only ever replay EXACTLY what the original fresh request authorized --
 *  it cannot substitute a different repoPath, targets or identity pair, skip
 *  the paired-identity check, or manufacture a confirm_wait that was never
 *  actually issued. */
function mintState(payload: StatePayload): Promise<string> {
	return getStepStateStore().mint('security-review', payload);
}

/** Single-use: consumes (atomically reads AND deletes) the token, so a
 *  resumed call's decision can only ever be acted on ONCE -- a repeat or
 *  concurrent resume with the SAME token (sequential retry, or a genuine
 *  race between two callers) gets this same "not found" refusal on every
 *  attempt after the first, never a second independent review run. */
async function loadState(token: string): Promise<StatePayload> {
	const entry = await getStepStateStore().take<StatePayload>('security-review', token);
	if (entry === undefined) {
		throw new Error(
			`handleSecurityReviewStep: state token '${token}' not found: it was already resumed (a confirm_wait token is consumed on its first use), ` +
			`the insrc daemon was restarted (tokens are held in its memory and a restart loses them), or it went unused for an hour. ` +
			`Start again with a fresh request.`,
		);
	}
	return entry.payload;
}

/** 'missing': the target does not exist, will never exist by waiting, and
 *  waiting for it can never succeed (ENOENT). 'permanent': the target exists
 *  in principle but this process can never read it by waiting either (a
 *  permission refusal, a broken path component, a symlink loop, or anything
 *  else not explicitly known to be transient) -- treated the SAME as
 *  'missing' for the purpose of refusing rather than looping. 'transient': a
 *  genuinely retryable condition (too many open files, a resource
 *  temporarily unavailable, or a lock contest) -- the ONLY outcome that
 *  keeps the freshness wait looping rather than refusing outright. */
type StatOutcome =
	| { readonly kind: 'ok'; readonly mtimeMs: number }
	| { readonly kind: 'missing' }
	| { readonly kind: 'permanent'; readonly code: string }
	| { readonly kind: 'transient'; readonly code: string };

/** Codes that genuinely can clear up on their own without any index-freshness
 *  progress: resource exhaustion/contention, never a reason to refuse a
 *  review outright. Everything else observed on a stat failure is treated as
 *  permanent -- the conservative default, since a code this list does not
 *  yet know about is far more likely to be a real, permanent access problem
 *  than a transient one worth looping on. */
const TRANSIENT_STAT_CODES: ReadonlySet<string> = new Set(['EMFILE', 'ENFILE', 'EAGAIN', 'EBUSY']);

/** The step's own dependencies, injectable for tests (matching this codebase's
 *  established _set*DepsForTests convention). No argument resets to the real
 *  calls. */
export interface SecurityReviewStepDeps {
	readonly isRepoRegistered?:         (repoPath: string) => Promise<boolean>;
	readonly resolveRepoLastIndexedAt?: (repoPath: string) => Promise<number | undefined>;
	readonly statTarget?:               (absolutePath: string) => Promise<StatOutcome>;
	readonly canonicallyContained?:     (repoPath: string, targets: ReviewTargets) => Promise<void>;
	readonly sleep?:                    (ms: number) => Promise<void>;
	readonly resolveSecurityModel?:     (repoPath: string) => ReturnType<typeof resolveSecurityModel>;
	readonly collectDependencyAdvisories?: typeof collectDependencyAdvisories;
	readonly runSecurityReview?:        typeof runSecurityReview;
}

let testDeps: SecurityReviewStepDeps = {};
export function _setSecurityReviewStepDepsForTests(deps: SecurityReviewStepDeps = {}): void { testDeps = deps; }

async function defaultStatTarget(absolutePath: string): Promise<StatOutcome> {
	try {
		return { kind: 'ok', mtimeMs: (await stat(absolutePath)).mtimeMs };
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === 'ENOENT') return { kind: 'missing' };
		if (code !== undefined && TRANSIENT_STAT_CODES.has(code)) return { kind: 'transient', code };
		return { kind: 'permanent', code: code ?? 'unknown' };
	}
}

async function defaultResolveSecurityModel(repoPath: string) {
	const registry = getModelRegistry();
	const cfg = loadAnalyzeConfig(registry);
	return resolveSecurityModel(cfg, registry, { deadlineMs: MODEL_PROBE_DEADLINE_MS, repoPath });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted === true) throw new SecurityReviewCancelledError();
}

async function requireRegisteredRepo(repoPath: string): Promise<void> {
	const check = testDeps.isRepoRegistered ?? checkRepoRegistered;
	if (!isAbsolute(repoPath) || !(await check(repoPath))) {
		throw new SecurityReviewRepoNotRegisteredError(repoPath);
	}
}

/** Stats every target once. Throws SecurityReviewTargetUnreachableError on
 *  the FIRST permanently-unreachable target ('missing' or 'permanent') --
 *  distinct from "stale" (which a wait could resolve) and from a genuinely
 *  transient stat hiccup (kept as ordinary lag). Returns true (stale) when
 *  the index predates any target's mtime, false when every target is at or
 *  before the index watermark. */
async function isIndexStale(repoPath: string, targets: ReviewTargets): Promise<boolean> {
	const resolveLastIndexedAt = testDeps.resolveRepoLastIndexedAt ?? resolveRepoLastIndexedAt;
	const statTarget = testDeps.statTarget ?? defaultStatTarget;
	const indexedAt = await resolveLastIndexedAt(repoPath);
	let stale = indexedAt === undefined;
	for (const entry of targets.entries) {
		const outcome = await statTarget(resolve(repoPath, entry.path));
		if (outcome.kind === 'missing') throw new SecurityReviewTargetUnreachableError(entry.path, 'does not exist');
		if (outcome.kind === 'permanent') throw new SecurityReviewTargetUnreachableError(entry.path, outcome.code);
		if (outcome.kind === 'transient' || indexedAt === undefined || outcome.mtimeMs > indexedAt) stale = true;
	}
	return stale;
}

async function waitForFreshIndex(repoPath: string, targets: ReviewTargets, signal: AbortSignal | undefined): Promise<void> {
	const sleep = testDeps.sleep ?? ((ms: number) => new Promise<void>(res => setTimeout(res, ms)));
	for (;;) {
		throwIfAborted(signal);
		// Re-authorize on every iteration: a repo de-registered mid-wait must
		// stop the wait rather than spin on a target that can no longer be
		// reasoned about at all.
		await requireRegisteredRepo(repoPath);
		if (!(await isIndexStale(repoPath, targets))) return;
		await sleep(FRESHNESS_POLL_INTERVAL_MS);
		throwIfAborted(signal);
	}
}

async function runToDone(
	repoPath: string, targets: ReviewTargets, epicHash: string | undefined, storyId: string | undefined,
	degraded: boolean, signal: AbortSignal | undefined,
): Promise<SecurityReviewStepDone> {
	const resolveModel = testDeps.resolveSecurityModel ?? defaultResolveSecurityModel;
	const collectAdvisories = testDeps.collectDependencyAdvisories ?? collectDependencyAdvisories;
	const runReview = testDeps.runSecurityReview ?? runSecurityReview;

	throwIfAborted(signal);
	const modelSelection = await resolveModel(repoPath);
	throwIfAborted(signal);
	const advisoryEvidence = await collectAdvisories(repoPath, targets);
	throwIfAborted(signal);
	const report = await runReview(repoPath, targets, {
		reviewId: `security-review-${randomUUID()}`,
		modelSelection,
		advisoryEvidence,
		now: new Date().toISOString(),
		degraded,
		...(epicHash !== undefined ? { epicHash } : {}),
		...(storyId !== undefined ? { storyId } : {}),
	});
	const coverageStatus = report.degraded
		? '## Coverage status\n\nDEGRADED: this review ran against a KNOWN-STALE graph index (the caller chose proceed:false). Graph-grounded code-finding coverage may not reflect the repository\'s current content; dependency-advisory coverage above is unaffected by this flag.\n'
		: '## Coverage status\n\nFresh: this review ran against a graph index confirmed fresh for every reviewed target.\n';
	return {
		next:     'done',
		report,
		markdown: `${coverageStatus}\n${report.baseReportMarkdown}\n\n${report.supplementalMarkdown}`,
		degraded: report.degraded,
	};
}

export async function handleSecurityReviewStep(request: SecurityReviewStepRequest, signal?: AbortSignal): Promise<SecurityReviewStepResponse> {
	throwIfAborted(signal);
	if ('state' in request) {
		const { repoPath, targets, epicHash, storyId } = await loadState(request.state);
		await requireRegisteredRepo(repoPath);
		assertTargetsContainedEarly(repoPath, targets);
		await assertCanonicalContainment(repoPath, targets);
		if (request.proceed) {
			await waitForFreshIndex(repoPath, targets, signal);
			return runToDone(repoPath, targets, epicHash, storyId, false, signal);
		}
		return runToDone(repoPath, targets, epicHash, storyId, true, signal);
	}

	const { repoPath, targets, epicHash, storyId } = request;
	if (!isWellShapedTargets(targets)) {
		throw new Error("handleSecurityReviewStep: targets must be { entries: [{ path }, ...] } with at least one non-empty string path");
	}
	await requireRegisteredRepo(repoPath);
	assertTargetsContainedEarly(repoPath, targets);
	await assertCanonicalContainment(repoPath, targets);
	if (await isIndexStale(repoPath, targets)) {
		const state = await mintState({ repoPath, targets, ...(epicHash !== undefined ? { epicHash } : {}), ...(storyId !== undefined ? { storyId } : {}) });
		return {
			next:     'confirm_wait',
			state,
			guidance: `the repo's graph index is stale for one or more of the review's targets; ask the user whether to wait for a fresh index (proceed:true) or run a degraded review against the index as-is (proceed:false), then call insrc_security_review_step again with phase:'start', the same state, and proceed set accordingly`,
		};
	}
	return runToDone(repoPath, targets, epicHash, storyId, false, signal);
}
