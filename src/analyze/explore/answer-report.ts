/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The answer report of a set of executed lookups (LLD-b9d5c5c40df5a574-s1,
 * shared contract sc2). Derived by code from each lookup's own completeness
 * record; a model never writes it.
 */

import { deriveAnswerReport, isCompletenessRecord } from '../completeness.js';
import type { AnswerReport, AnswerReportScope, ReportSource } from '../completeness.js';
import type { AnalyzeScopeRef } from '../../shared/analyze-types.js';
import type { RequestMeasure } from '../measure.js';
import type { ExecutedExploration } from './types.js';

/** How a lookup is named in the report: its type, then the id the plan gave it. */
export function lookupSourceId(e: ExecutedExploration): string {
	return `${e.exploration.type} [${e.exploration.id}]`;
}

/** The reason given for a lookup whose output does not state its completeness. */
export const NO_COMPLETENESS_RECORD = 'the lookup returned no completeness record';

/**
 * One source per executed lookup. A `failed` or `unsupported` output is a
 * failed source with its reason; every other output carries its record.
 *
 * An output with no record (or with a value that is not a record) is a
 * defect of that lookup. It is listed as a failed source, as the plan walk
 * lists a task whose runtime returned none: the answer is still written from
 * the other lookups, it cannot read as complete, and it names the lookup.
 *
 * A measure of the request, when one is given, goes into the report as it is;
 * a report built without one is exactly the report of the lookups.
 */
export interface ReportScopeInput {
	readonly ref:    AnalyzeScopeRef;
	/** Who named the scope: absent on an intent from before the field existed. */
	readonly source: 'request' | 'prompt' | undefined;
}

/** How the executed lookups chose their centre, when a concept.resolve result says. */
function anchorSourceOf(results: readonly ExecutedExploration[]): 'named-scope' | 'ranked' | undefined {
	for (const r of results) {
		if (r.exploration.type !== 'concept.resolve') continue;
		const anchor = (r.output as { anchor?: { source?: unknown } }).anchor;
		if (anchor?.source === 'named-scope' || anchor?.source === 'ranked') return anchor.source;
	}
	return undefined;
}

export function reportFromLookups(results: readonly ExecutedExploration[], measure?: RequestMeasure, scope?: ReportScopeInput): AnswerReport {
	const sources: ReportSource[] = results.map((r): ReportSource => {
		const base = { sourceId: lookupSourceId(r), sourceKind: 'lookup' as const };
		const out = r.output;
		if (out.type === 'failed')      return { ...base, failure: out.message };
		if (out.type === 'unsupported') return { ...base, failure: `the lookup is not supported: ${out.reason}` };
		const completeness = (out as { completeness?: unknown }).completeness;
		return isCompletenessRecord(completeness) ? { ...base, completeness } : { ...base, failure: NO_COMPLETENESS_RECORD };
	});
	const report = deriveAnswerReport(sources);
	const anchor = scope !== undefined ? anchorSourceOf(results) : undefined;
	const stated: AnswerReportScope | undefined = scope === undefined ? undefined
		: { kind: scope.ref.kind, value: scope.ref.value, named: scope.source ?? 'not-recorded', ...(anchor !== undefined ? { anchor } : {}) };
	return { ...report, ...(measure !== undefined ? { measure } : {}), ...(stated !== undefined ? { scope: stated } : {}) };
}
