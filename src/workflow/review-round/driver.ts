/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one shared round-driver (HLD sc1, S001). Initial Review and
 * Correction-and-Re-review run through this exact same function, distinguished
 * purely by `round` -- no divergent steering/checklist logic beyond
 * reconciliation (a sibling Story's contract, not this one's).
 */

import type { ReviewTargets } from '../artifact-core/types.js';
import type { RoundDriverHooks, RoundResult } from './types.js';

/**
 * Runs one review round. `reviewId` is never read or derived here -- it exists
 * so the caller can thread the same value on to the review-report docgen call
 * and the checkpoint/finalize calls, both of which require it.
 *
 * Deliberately NOT `async`: an invalid round must throw synchronously, before
 * the caller even receives a Promise, not surface as a rejection from one.
 */
export function runReviewRound<F = unknown>(
	reviewId: string,
	hooks: RoundDriverHooks<F>,
	round: number,
	targets: ReviewTargets,
	opts?: { readonly runSecurityPass?: boolean },
): Promise<RoundResult<F>> {
	void reviewId;
	if (!Number.isInteger(round) || round < 1) {
		throw new RangeError(`round must be a positive integer, got ${round}`);
	}
	return runRound(hooks, round, targets, opts);
}

async function runRound<F>(
	hooks: RoundDriverHooks<F>,
	round: number,
	targets: ReviewTargets,
	opts: { readonly runSecurityPass?: boolean } | undefined,
): Promise<RoundResult<F>> {
	const groundFindings = await hooks.ground(targets, round);

	const security = hooks.security;
	if (opts?.runSecurityPass === false || security === undefined) {
		return { round, findings: groundFindings };
	}

	const securityFindings = await security.call(hooks, targets, round);
	return { round, findings: [...groundFindings, ...securityFindings] };
}
