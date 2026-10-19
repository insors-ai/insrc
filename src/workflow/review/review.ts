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

import { getLogger } from '../../shared/logger.js';
import type { LLMProvider } from '../../shared/types.js';
import { extractClaims } from './extract.js';
import { gatherEvidence } from './probe.js';
import { verifyClaim } from './verify.js';
import { isDesignStage } from './template.js';
import { runTemplateReview } from './template-review.js';
import type { DesignIntent } from './template.js';
import type { EntitiesForRepoReader } from './source-roots.js';
import type { Claim, Evidence, Finding, ReviewReport, ReviewVerdict, Severity } from './types.js';
import { computeVerdict, DEFAULT_BLOCK_ON, severityForOutcome, tally } from './verdict.js';

export { severityForOutcome };

/** The codex session a failed call ran in, when its error names one, so a stall can be followed up. */
function codexSessionOf(message: string): string | undefined {
	return /"thread_id":"([^"]+)"/.exec(message)?.[1];
}

/**
 * Judge one premise; a failed or stalled call is retried once as a fresh call.
 * One that fails again is recorded as not judged (MED, never a pass) with its
 * cause, so the premises already judged and the rest of the review are kept
 * (ISSUE-d4b2cd1c). A cancelled review still ends at once.
 */
async function verifyOrRecord(claim: Claim, ev: Evidence, provider: LLMProvider, signal: AbortSignal | undefined): Promise<Finding> {
	let cause = '';
	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			return await verifyClaim(claim, ev, provider, signal);
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') throw err;
			throwIfAborted(signal);
			cause = err instanceof Error ? err.message : String(err);
			const session = (err as { sessionId?: string | undefined }).sessionId ?? codexSessionOf(cause);
			log.warn({ claimId: claim.id, attempt, codexSession: session, error: cause }, 'review:verify: the premise call failed');
		}
	}
	return {
		claimId: claim.id,
		...(claim.ref !== undefined ? { ref: claim.ref } : {}),
		kind: claim.kind,
		severity: 'MED',
		premise: claim.text,
		evidence: `Not judged: the reviewing model call failed twice. Last error: ${cause}`,
		action: 'Re-run the review, or judge this premise by hand.',
		fixability: 'manual',
	};
}

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
	emit('extract');
	const claims = await extractClaims(artifactMarkdown, stage, provider, signal);

	throwIfAborted(signal);
	emit('probe');
	let sourceRootFallback: string | undefined;
	const evidence = await gatherEvidence(claims, repo, {
		readEntitiesForRepo: opts.readEntitiesForRepo,
		onSourceRootFallback: reason => { sourceRootFallback = reason; },
	});
	const evidenceById = new Map(evidence.map(e => [e.claimId, e] as const));

	const findings: Finding[] = [];
	for (const claim of claims) {
		throwIfAborted(signal);
		emit(`verify:${claim.id}`);
		const ev = evidenceById.get(claim.id) ?? { claimId: claim.id, grepResults: [], reads: [] };
		findings.push(await verifyOrRecord(claim, ev, provider, signal));
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
