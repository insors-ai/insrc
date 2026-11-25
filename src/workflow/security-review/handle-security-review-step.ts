/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * handleSecurityReviewStep (s3/t5), Epic add-dedicated-security-reviews.
 *
 * sc3's entry-point body: on a FRESH request, authorizes repoPath against the
 * real repo registry, then checks the repo's graph-index freshness against
 * targets.entries and pauses with {next:'confirm_wait'} when stale, before
 * resolveSecurityModel, collectDependencyAdvisories or any round has run. A
 * RESUMED call ({state, proceed}) re-authorizes the state token's own
 * repoPath (never trusted merely because it was authorized once, at pause
 * time) and either waits (unbounded, cancellable) for a fresh index
 * (proceed:true) or runs degraded against the index as-is (proceed:false) --
 * both reach {next:'done'} with a fully populated report, markdown and a
 * `degraded` flag recording which path was taken. epicHash/storyId named on
 * the original request are threaded straight into runSecurityReview's opts,
 * never re-derived here.
 */

import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { resolveRepoLastIndexedAt } from '../../analyze/context/driver.js';
import { loadAnalyzeConfig, resolveSecurityModel } from '../../config/analyze.js';
import { getModelRegistry } from '../../daemon/model-registry.js';
import type { ReviewTargets } from '../artifact-core/types.js';
import { checkRepoRegistered } from './content-identity.js';
import { collectDependencyAdvisories } from './collect-dependency-advisories.js';
import { runSecurityReview, type SecurityReviewReport } from './run-security-review.js';

const MODEL_PROBE_DEADLINE_MS = 15_000;
/** proceed:true genuinely WAITS for a fresh index -- unlike proceed:false, it
 *  never silently runs degraded. Polls at this interval with no attempt cap;
 *  the caller (a human, via confirm_wait) chose to wait, so this does not
 *  second-guess that choice with a hidden timeout. Bounded instead by two
 *  real stop conditions: cancellation (signal) and a target that can never
 *  become fresh (permanently missing/unreadable, or the repo's own
 *  registration withdrawn mid-wait). */
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
	/** True when this run proceeded against a KNOWN-stale index (the
	 *  proceed:false branch) -- never inferred from the report's own content,
	 *  since dependency-advisory coverage can be complete while graph-grounded
	 *  code-finding coverage is still stale. False on a fresh request or a
	 *  proceed:true resume (which always waits until genuinely fresh first). */
	readonly degraded: boolean;
}

export type SecurityReviewStepResponse = SecurityReviewStepConfirmWait | SecurityReviewStepDone;

/** Thrown when a repoPath (fresh request, or decoded from a resumed call's
 *  own state token) does not name a currently-registered repository --
 *  checked before any stat, model probe, dependency audit or artifact write,
 *  on BOTH the fresh and the resumed path; a resumed call never merely trusts
 *  that its token's repoPath was authorized once, at pause time. */
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
	constructor(path: string) {
		super(`handleSecurityReviewStep: target '${path}' does not exist or is unreadable -- waiting for it to be indexed can never succeed`);
		this.name = 'SecurityReviewTargetUnreachableError';
	}
}

interface StatePayload {
	readonly repoPath: string;
	readonly targets: ReviewTargets;
	readonly epicHash?: string;
	readonly storyId?: string;
}

function encodeState(payload: StatePayload): string {
	return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeState(state: string): StatePayload {
	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
	} catch {
		throw new Error('handleSecurityReviewStep: state is not a valid token');
	}
	const p = parsed as Partial<StatePayload> | null;
	if (p === null || typeof p !== 'object' || typeof p.repoPath !== 'string' || p.targets === undefined) {
		throw new Error('handleSecurityReviewStep: state is not a valid token');
	}
	return p as StatePayload;
}

/** mtimeMs on success; 'missing' for ENOENT specifically (never indexable,
 *  however long one waits); undefined for any other stat failure (treated as
 *  ordinary lag, matching a transient permission/mount hiccup). */
type StatOutcome = { readonly kind: 'ok'; readonly mtimeMs: number } | { readonly kind: 'missing' } | { readonly kind: 'unknown' };

/** The step's own dependencies, injectable for tests (matching this codebase's
 *  established _set*DepsForTests convention). No argument resets to the real
 *  calls. */
export interface SecurityReviewStepDeps {
	readonly isRepoRegistered?:         (repoPath: string) => Promise<boolean>;
	readonly resolveRepoLastIndexedAt?: (repoPath: string) => Promise<number | undefined>;
	readonly statTarget?:               (absolutePath: string) => Promise<StatOutcome>;
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
		return (err as { code?: string }).code === 'ENOENT' ? { kind: 'missing' } : { kind: 'unknown' };
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

/** Stats every target once. Throws SecurityReviewTargetUnreachableError on the
 *  FIRST permanently-missing target -- distinct from "stale" (which a wait
 *  could resolve) and from an ordinary stat hiccup (treated as lag, matching
 *  prior behavior). Returns true (stale) when the index predates any target's
 *  mtime, false when every target is at or before the index watermark. */
async function isIndexStale(repoPath: string, targets: ReviewTargets): Promise<boolean> {
	const resolveLastIndexedAt = testDeps.resolveRepoLastIndexedAt ?? resolveRepoLastIndexedAt;
	const statTarget = testDeps.statTarget ?? defaultStatTarget;
	const indexedAt = await resolveLastIndexedAt(repoPath);
	let stale = indexedAt === undefined;
	for (const entry of targets.entries) {
		const outcome = await statTarget(resolve(repoPath, entry.path));
		if (outcome.kind === 'missing') throw new SecurityReviewTargetUnreachableError(entry.path);
		if (outcome.kind === 'unknown' || indexedAt === undefined || outcome.mtimeMs > indexedAt) stale = true;
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
		...(epicHash !== undefined ? { epicHash } : {}),
		...(storyId !== undefined ? { storyId } : {}),
	});
	const coverageStatus = degraded
		? '## Coverage status\n\nDEGRADED: this review ran against a KNOWN-STALE graph index (the caller chose proceed:false). Graph-grounded code-finding coverage may not reflect the repository\'s current content; dependency-advisory coverage above is unaffected by this flag.\n'
		: '## Coverage status\n\nFresh: this review ran against a graph index confirmed fresh for every reviewed target.\n';
	return {
		next:     'done',
		report,
		markdown: `${coverageStatus}\n${report.baseReportMarkdown}\n\n${report.supplementalMarkdown}`,
		degraded,
	};
}

export async function handleSecurityReviewStep(request: SecurityReviewStepRequest, signal?: AbortSignal): Promise<SecurityReviewStepResponse> {
	throwIfAborted(signal);
	if ('state' in request) {
		const { repoPath, targets, epicHash, storyId } = decodeState(request.state);
		await requireRegisteredRepo(repoPath);
		if (request.proceed) {
			await waitForFreshIndex(repoPath, targets, signal);
			return runToDone(repoPath, targets, epicHash, storyId, false, signal);
		}
		return runToDone(repoPath, targets, epicHash, storyId, true, signal);
	}

	const { repoPath, targets, epicHash, storyId } = request;
	await requireRegisteredRepo(repoPath);
	if (await isIndexStale(repoPath, targets)) {
		return {
			next:     'confirm_wait',
			state:    encodeState({ repoPath, targets, ...(epicHash !== undefined ? { epicHash } : {}), ...(storyId !== undefined ? { storyId } : {}) }),
			guidance: `the repo's graph index is stale for one or more of the review's targets; ask the user whether to wait for a fresh index (proceed:true) or run a degraded review against the index as-is (proceed:false), then call insrc_security_review_step again with phase:'start', the same state, and proceed set accordingly`,
		};
	}
	return runToDone(repoPath, targets, epicHash, storyId, false, signal);
}
