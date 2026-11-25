/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * handleSecurityReviewStep (s3/t5), Epic add-dedicated-security-reviews.
 *
 * sc3's entry-point body: on a FRESH request, checks the repo's graph-index
 * freshness against targets.entries and pauses with {next:'confirm_wait'}
 * when stale, before resolveSecurityModel, collectDependencyAdvisories or any
 * round has run. A RESUMED call ({state, proceed}) either waits (bounded) for
 * a fresh index (proceed:true) or runs degraded against the index as-is
 * (proceed:false) -- both reach {next:'done'} with a fully populated report.
 * epicHash/storyId named on the original request are threaded straight into
 * runSecurityReview's opts, never re-derived here.
 */

import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveRepoLastIndexedAt } from '../../analyze/context/driver.js';
import { loadAnalyzeConfig, resolveSecurityModel } from '../../config/analyze.js';
import { getModelRegistry } from '../../daemon/model-registry.js';
import type { ReviewTargets } from '../artifact-core/types.js';
import { collectDependencyAdvisories } from './collect-dependency-advisories.js';
import { runSecurityReview, type SecurityReviewReport } from './run-security-review.js';

const MODEL_PROBE_DEADLINE_MS = 15_000;
/** Bounded wait for proceed:true -- a handful of short polls, never an
 *  unbounded loop; if the index is still stale when exhausted, the review
 *  still runs (degraded), exactly as a proceed:false call would. */
const FRESHNESS_POLL_ATTEMPTS = 5;
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
}

export type SecurityReviewStepResponse = SecurityReviewStepConfirmWait | SecurityReviewStepDone;

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

/** The step's own dependencies, injectable for tests (matching this codebase's
 *  established _set*DepsForTests convention). No argument resets to the real
 *  calls. */
export interface SecurityReviewStepDeps {
	readonly resolveRepoLastIndexedAt?: (repoPath: string) => Promise<number | undefined>;
	readonly statMtimeMs?:              (absolutePath: string) => Promise<number | undefined>;
	readonly sleep?:                    (ms: number) => Promise<void>;
	readonly resolveSecurityModel?:     (repoPath: string) => ReturnType<typeof resolveSecurityModel>;
	readonly collectDependencyAdvisories?: typeof collectDependencyAdvisories;
	readonly runSecurityReview?:        typeof runSecurityReview;
}

let testDeps: SecurityReviewStepDeps = {};
export function _setSecurityReviewStepDepsForTests(deps: SecurityReviewStepDeps = {}): void { testDeps = deps; }

async function defaultStatMtimeMs(absolutePath: string): Promise<number | undefined> {
	try {
		return (await stat(absolutePath)).mtimeMs;
	} catch {
		return undefined;
	}
}

async function defaultResolveSecurityModel(repoPath: string) {
	const registry = getModelRegistry();
	const cfg = loadAnalyzeConfig(registry);
	return resolveSecurityModel(cfg, registry, { deadlineMs: MODEL_PROBE_DEADLINE_MS, repoPath });
}

/** True when any of targets.entries is newer than the repo's last graph-index
 *  watermark, or the repo has never been indexed at all. */
async function isIndexStale(repoPath: string, targets: ReviewTargets): Promise<boolean> {
	const resolveLastIndexedAt = testDeps.resolveRepoLastIndexedAt ?? resolveRepoLastIndexedAt;
	const statMtimeMs = testDeps.statMtimeMs ?? defaultStatMtimeMs;
	const indexedAt = await resolveLastIndexedAt(repoPath);
	if (indexedAt === undefined) return true;
	for (const entry of targets.entries) {
		const mtimeMs = await statMtimeMs(resolve(repoPath, entry.path));
		if (mtimeMs === undefined || mtimeMs > indexedAt) return true;
	}
	return false;
}

async function waitForFreshIndex(repoPath: string, targets: ReviewTargets): Promise<void> {
	const sleep = testDeps.sleep ?? ((ms: number) => new Promise<void>(res => setTimeout(res, ms)));
	for (let attempt = 0; attempt < FRESHNESS_POLL_ATTEMPTS; attempt++) {
		if (!(await isIndexStale(repoPath, targets))) return;
		await sleep(FRESHNESS_POLL_INTERVAL_MS);
	}
	// Exhausted the bounded wait -- proceed anyway, same as proceed:false.
}

async function runToDone(repoPath: string, targets: ReviewTargets, epicHash: string | undefined, storyId: string | undefined): Promise<SecurityReviewStepDone> {
	const resolveModel = testDeps.resolveSecurityModel ?? defaultResolveSecurityModel;
	const collectAdvisories = testDeps.collectDependencyAdvisories ?? collectDependencyAdvisories;
	const runReview = testDeps.runSecurityReview ?? runSecurityReview;

	const modelSelection = await resolveModel(repoPath);
	const advisoryEvidence = await collectAdvisories(repoPath, targets);
	const report = await runReview(repoPath, targets, {
		reviewId: `security-review-${randomUUID()}`,
		modelSelection,
		advisoryEvidence,
		now: new Date().toISOString(),
		...(epicHash !== undefined ? { epicHash } : {}),
		...(storyId !== undefined ? { storyId } : {}),
	});
	return {
		next:     'done',
		report,
		markdown: `${report.baseReportMarkdown}\n\n${report.supplementalMarkdown}`,
	};
}

export async function handleSecurityReviewStep(request: SecurityReviewStepRequest): Promise<SecurityReviewStepResponse> {
	if ('state' in request) {
		const { repoPath, targets, epicHash, storyId } = decodeState(request.state);
		if (request.proceed) {
			await waitForFreshIndex(repoPath, targets);
		}
		return runToDone(repoPath, targets, epicHash, storyId);
	}

	const { repoPath, targets, epicHash, storyId } = request;
	if (await isIndexStale(repoPath, targets)) {
		return {
			next:     'confirm_wait',
			state:    encodeState({ repoPath, targets, ...(epicHash !== undefined ? { epicHash } : {}), ...(storyId !== undefined ? { storyId } : {}) }),
			guidance: `the repo's graph index is stale for one or more of the review's targets; ask the user whether to wait for a fresh index (proceed:true) or run a degraded review against the index as-is (proceed:false), then call insrc_security_review_step again with phase:'start', the same state, and proceed set accordingly`,
		};
	}
	return runToDone(repoPath, targets, epicHash, storyId);
}
