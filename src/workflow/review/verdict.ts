/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How findings become counts and a verdict. Shared by the extract → probe →
 * verify pipeline and by the design-review template, so both gate identically.
 */

import type { Finding, FindingOutcome, ReviewReport, ReviewVerdict, Severity } from './types.js';

export const DEFAULT_BLOCK_ON: readonly Severity[] = ['HIGH', 'MED'];

export function tally(findings: readonly Finding[]): ReviewReport['counts'] {
	let high = 0, med = 0, low = 0;
	for (const f of findings) {
		if (f.severity === 'HIGH') high++;
		else if (f.severity === 'MED') med++;
		else low++;
	}
	// The fourth count appears only when the review used a template, so the
	// counts of a pipeline review are byte-identical to what they were.
	if (!findings.some(f => f.outcome !== undefined)) return { high, med, low };
	return { high, med, low, unverified: findings.filter(f => f.outcome === 'could-not-verify').length };
}

/**
 * The severity a template finding carries, derived from its outcome so that
 * every reader that gates on severity keeps working unchanged: a premise that
 * does not hold is HIGH or MED (as the reviewer judged how much it breaks) and
 * blocks; one that holds, or that could not be verified, is LOW and never does.
 */
export function severityForOutcome(outcome: FindingOutcome, judged?: Severity): Severity {
	if (outcome !== 'does-not-hold') return 'LOW';
	return judged === 'HIGH' ? 'HIGH' : 'MED';
}

/**
 * `block` if any finding's severity is in `blockOn`; otherwise `warn` if
 * any finding is above LOW (i.e. a MED that `blockOn` chose not to block
 * on), otherwise `pass`.
 */
export function computeVerdict(findings: readonly Finding[], blockOn: readonly Severity[]): ReviewVerdict {
	const block = findings.some(f => blockOn.includes(f.severity));
	if (block) return 'block';
	// An unverified premise is LOW (it never blocks) but it is not a clean pass.
	const warn = findings.some(f => f.severity !== 'LOW' || f.outcome === 'could-not-verify');
	return warn ? 'warn' : 'pass';
}
