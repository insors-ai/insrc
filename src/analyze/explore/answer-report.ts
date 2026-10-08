/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The answer report of a set of executed lookups (LLD-b9d5c5c40df5a574-s1,
 * shared contract sc2). Derived by code from each lookup's own completeness
 * record; a model never writes it.
 */

import { deriveAnswerReport } from '../completeness.js';
import type { AnswerReport, Completeness, ReportSource } from '../completeness.js';
import type { ExecutedExploration } from './types.js';

/** How a lookup is named in the report: its type, then the id the plan gave it. */
export function lookupSourceId(e: ExecutedExploration): string {
	return `${e.exploration.type} [${e.exploration.id}]`;
}

/**
 * One source per executed lookup. A `failed` or `unsupported` output is a
 * failed source with its reason; every other output carries its record.
 *
 * @throws RangeError (from `deriveAnswerReport`) when a lookup's output has
 *   neither: no result is counted as complete by default.
 */
export function reportFromLookups(results: readonly ExecutedExploration[]): AnswerReport {
	const sources: ReportSource[] = results.map((r): ReportSource => {
		const base = { sourceId: lookupSourceId(r), sourceKind: 'lookup' as const };
		const out = r.output;
		if (out.type === 'failed')      return { ...base, failure: out.message };
		if (out.type === 'unsupported') return { ...base, failure: `the lookup is not supported: ${out.reason}` };
		const completeness = (out as { completeness?: Completeness }).completeness;
		return completeness !== undefined ? { ...base, completeness } : base;
	});
	return deriveAnswerReport(sources);
}
