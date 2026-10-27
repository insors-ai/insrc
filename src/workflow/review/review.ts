/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Review-cycle orchestrator.
 *
 * Flow: extractClaims → gatherEvidence → verifyClaim (SERIAL per claim —
 * NEVER `Promise.all` over a provider, CLAUDE.md rule; local Ollama counts).
 * Aggregates severity counts and computes a verdict.
 *
 * Determinism: the timestamp is injected (`reviewedAt` opt or a `now()`
 * clock fn) — no `Date.now()` / `new Date()` inside the flow, so tests
 * stay reproducible.
 */

import { resolveReviewBudgetPolicy } from '../../agent/providers/review-budget.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMProvider } from '../../shared/types.js';
import { runReviewJob } from '../review-pipeline/driver.js';
import { designReviewSnapshot, premiseAdapter } from '../review-pipeline/design-review.js';
import { createReviewJob, pipelineCallsOf } from '../review-pipeline/job.js';
import { readReviewChunkTokens, reviewLimitChars } from '../review-pipeline/limit.js';
import type { PipelineCalls, ReviewAdapter } from '../review-pipeline/types.js';
import { isDesignStage } from './template.js';
import { runTemplateReview } from './template-review.js';
import type { DesignIntent } from './template.js';
import type { EntitiesForRepoReader } from './source-roots.js';
import type { Finding, ReviewReport, ReviewVerdict, Severity } from './types.js';
import { computeVerdict, DEFAULT_BLOCK_ON, severityForOutcome, tally } from './verdict.js';

export { severityForOutcome };

const log = getLogger('review');

/** Phases surfaced through `onProgress`. `template` is the one reviewer
 *  session of a design review; the other three are the pipeline's stages. */
export type ReviewPhase = 'extract' | 'probe' | `verify:${string}` | 'template' | 'done';

export interface RunReviewOpts {
	readonly repo: string;
	readonly stage: string;
	readonly provider: LLMProvider;
	readonly model: string;
	/** Severities that force `block`. Default `['HIGH','MED']`. */
	readonly blockOn?: readonly Severity[] | undefined;
	/** A short label for the reviewed artifact. Default `stage`. */
	readonly artifact?: string | undefined;
	/** Injected timestamp. Takes precedence over `now`. */
	readonly reviewedAt?: string | undefined;
	/** Injected clock. Used when `reviewedAt` is absent. Default epoch-0 ISO. */
	readonly now?: (() => string) | undefined;
	readonly onProgress?: ((phase: ReviewPhase) => void) | undefined;
	readonly signal?: AbortSignal | undefined;
	/** Design stages only: which template applies. `reviewArtifactFile` resolves
	 *  it from the artifact store; default `spec`. */
	readonly intent?: DesignIntent | undefined;
	/** Design stages only: the deadline for the WHOLE review, in ms. Default: the
	 *  configured limit for the intent. Never more than the 10 minute hard cap. */
	readonly deadlineMs?: number | undefined;
	/** Design stages only: millisecond clock for the deadline (test seam). */
	readonly nowMs?: (() => number) | undefined;
	/** Reads a repository's indexed entities for the source roots. Passed by a
	 *  review that runs outside the daemon (the CLI's), which may not open the
	 *  store; absent, the default reader is used. */
	readonly readEntitiesForRepo?: EntitiesForRepoReader | undefined;
}


/**
 * Run the full grounded review of an artifact and return a severity-rated
 * report.
 */
export async function runReview(
	artifactMarkdown: string,
	opts:             RunReviewOpts,
): Promise<ReviewReport> {
	// A design document is reviewed against a template in ONE reviewer session;
	// every other artifact keeps the pipeline below, untouched.
	if (isDesignStage(opts.stage)) return runTemplateReview(artifactMarkdown, opts);

	const { repo, stage, provider, model, signal } = opts;
	const blockOn = opts.blockOn ?? DEFAULT_BLOCK_ON;
	const emit = opts.onProgress ?? (() => { /* no-op */ });

	throwIfAborted(signal);
	// One review-pipeline job (Epic 8315a11f): extract, probe, then one verify call
	// per premise; the pipeline re-issues a failed call once, and a premise whose
	// call fails twice is recorded as not judged (MED), the rest kept.
	let sourceRootFallback: string | undefined;
	const snapshot = designReviewSnapshot(artifactMarkdown);
	const adapter = premiseAdapter(snapshot, {
		stage, repo, readEntitiesForRepo: opts.readEntitiesForRepo,
		onSourceRootFallback: reason => { sourceRootFallback = reason; },
	}) as unknown as ReviewAdapter<unknown>;
	const budgetPolicy = resolveReviewBudgetPolicy(opts.provider as LLMProvider, 'structured', readReviewChunkTokens());
	const job = createReviewJob(adapter, 'daemon', snapshot, budgetPolicy.totalTokens * 3, { budgetPolicy });
	let findings: Finding[];
	let pipelineCalls: PipelineCalls | undefined;
	try {
		findings = [...await runReviewJob(job, adapter, provider, {
			signal,
			onDone: done => { pipelineCalls = pipelineCallsOf(done); },
			onStage: s => { if (s === 'probe') emit('probe'); },
			onCall: c => emit(c.stage === 'extract' ? 'extract' : `verify:${c.carries.key ?? ''}`),
		}) as readonly Finding[]];
	} catch (err) {
		// A cancel of this review keeps today's message; a provider's own abort propagates as it was.
		if (signal?.aborted === true) throw new Error('review: aborted');
		throw err;
	}

	const counts = tally(findings);
	const verdict = computeVerdict(findings, blockOn);
	const reviewedAt = opts.reviewedAt ?? (opts.now !== undefined ? opts.now() : new Date(0).toISOString());

	emit('done');
	log.info({ stage, verdict, counts }, 'review: completed grounded review');

	return {
		artifact: opts.artifact ?? stage,
		stage,
		verdict,
		findings,
		counts,
		reviewedAt,
		model,
		...(sourceRootFallback !== undefined ? { sourceRootFallback } : {}),
		...(pipelineCalls !== undefined ? { pipelineCalls } : {}),
	};
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export const DEFAULT_BLOCK_ON_SEVERITIES: readonly Severity[] = DEFAULT_BLOCK_ON;

/** Tally findings by severity. Exposed for controller-driven surfaces that
 *  assemble a `ReviewReport` from externally-produced findings. */
export function tallyFindings(findings: readonly Finding[]): ReviewReport['counts'] {
	return tally(findings);
}

/** The engine's verdict policy: `block` if any finding is in `blockOn`,
 *  else `warn` if any is above LOW, else `pass`. Exposed for reuse. */
export function computeReviewVerdict(
	findings: readonly Finding[],
	blockOn:  readonly Severity[] = DEFAULT_BLOCK_ON,
): ReviewVerdict {
	return computeVerdict(findings, blockOn);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted === true) {
		throw new Error('review: aborted');
	}
}
