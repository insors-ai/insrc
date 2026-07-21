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
import type { Finding, ReviewReport, ReviewVerdict, Severity } from './types.js';

const log = getLogger('review');

/** Phases surfaced through `onProgress`. */
export type ReviewPhase = 'extract' | 'probe' | `verify:${string}` | 'done';

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
}

const DEFAULT_BLOCK_ON: readonly Severity[] = ['HIGH', 'MED'];

/**
 * Run the full grounded review of an artifact and return a severity-rated
 * report.
 */
export async function runReview(
	artifactMarkdown: string,
	opts:             RunReviewOpts,
): Promise<ReviewReport> {
	const { repo, stage, provider, model, signal } = opts;
	const blockOn = opts.blockOn ?? DEFAULT_BLOCK_ON;
	const emit = opts.onProgress ?? (() => { /* no-op */ });

	throwIfAborted(signal);
	emit('extract');
	const claims = await extractClaims(artifactMarkdown, stage, provider, signal);

	throwIfAborted(signal);
	emit('probe');
	const evidence = await gatherEvidence(claims, repo);
	const evidenceById = new Map(evidence.map(e => [e.claimId, e] as const));

	const findings: Finding[] = [];
	for (const claim of claims) {
		throwIfAborted(signal);
		emit(`verify:${claim.id}`);
		const ev = evidenceById.get(claim.id) ?? { claimId: claim.id, grepResults: [], reads: [] };
		findings.push(await verifyClaim(claim, ev, provider, signal));
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

function tally(findings: readonly Finding[]): ReviewReport['counts'] {
	let high = 0, med = 0, low = 0;
	for (const f of findings) {
		if (f.severity === 'HIGH') high++;
		else if (f.severity === 'MED') med++;
		else low++;
	}
	return { high, med, low };
}

/**
 * `block` if any finding's severity is in `blockOn`; otherwise `warn` if
 * any finding is above LOW (i.e. a MED that `blockOn` chose not to block
 * on), otherwise `pass`.
 */
function computeVerdict(findings: readonly Finding[], blockOn: readonly Severity[]): ReviewVerdict {
	const block = findings.some(f => blockOn.includes(f.severity));
	if (block) return 'block';
	const warn = findings.some(f => f.severity !== 'LOW');
	return warn ? 'warn' : 'pass';
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted === true) {
		throw new Error('review: aborted');
	}
}
