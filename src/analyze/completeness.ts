/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The completeness record and the answer report (LLD-b9d5c5c40df5a574-s1,
 * shared contracts sc1 + sc2).
 *
 * A lookup result or a plan-task result states its own completeness in ONE
 * record, built here at the place that knows what was left out. `complete` is
 * computed, never passed in, so a record that says "complete" while a limit
 * was reached cannot be constructed.
 *
 * The answer report is DERIVED from those records by code; a model never
 * writes it.
 */

// ---------------------------------------------------------------------------
// Completeness (sc1)
// ---------------------------------------------------------------------------

/** One limit that was reached. A result can reach several. */
export interface ReachedLimit {
	/** What the limit counts (e.g. `hits`, `fields per target`). */
	readonly what:   string;
	readonly limit:  number;
	/** `overall` bounds the whole result; `per-group` bounds each group in it. */
	readonly scope:  'overall' | 'per-group';
	readonly reason: string;
}

export interface SkippedItem {
	readonly what:   string;
	readonly reason: string;
}

export interface PartlyReadItem {
	readonly what:       string;
	readonly readChars:  number;
	/** null: the full length could not be established; `totalNote` says why. */
	readonly totalChars: number | null;
	readonly totalNote?: string | undefined;
}

export type CompletenessBasis =
	| 'text' | 'graph' | 'doc-index' | 'data-source' | 'filesystem' | 'model-directed';

export interface Completeness {
	readonly complete:    boolean;
	/** How many items exist; null when that is not known. */
	readonly total:       number | null;
	readonly returned:    number;
	readonly limited?:    readonly ReachedLimit[] | undefined;
	readonly skipped?:    readonly SkippedItem[] | undefined;
	readonly partlyRead?: readonly PartlyReadItem[] | undefined;
	readonly basis:       CompletenessBasis;
	readonly basisNote?:  string | undefined;
}

export interface WithCompleteness {
	readonly completeness: Completeness;
}

export interface CompletenessFacts {
	readonly returned:        number;
	/** Omitted: equal to `returned` when no limit was reached, else null. */
	readonly total?:          number | null | undefined;
	readonly limited?:        readonly ReachedLimit[] | undefined;
	readonly skipped?:        readonly SkippedItem[] | undefined;
	readonly partlyRead?:     readonly PartlyReadItem[] | undefined;
	readonly basis:           CompletenessBasis;
	readonly basisNote?:      string | undefined;
	/** The result cannot know whether it is complete. Sets `complete` false; adds no field. */
	readonly notEstablished?: boolean | undefined;
}

/**
 * Build the record from what the caller knows at the place it applied a
 * limit, skipped something or cut content.
 *
 * @throws RangeError when the facts contradict each other — a bug in the
 *   caller: a negative count, a total below the returned count, or an
 *   OVERALL limit below the returned count. A per-group limit is not
 *   compared with the overall count.
 */
export function buildCompleteness(facts: CompletenessFacts): Completeness {
	const { returned } = facts;
	if (!Number.isFinite(returned) || returned < 0) {
		throw new RangeError(`completeness: returned must be >= 0, got ${returned}`);
	}
	const limited    = facts.limited    ?? [];
	const skipped    = facts.skipped    ?? [];
	const partlyRead = facts.partlyRead ?? [];

	for (const l of limited) {
		if (l.scope === 'overall' && l.limit < returned) {
			throw new RangeError(
				`completeness: overall limit ${l.limit} on ${l.what} is below the returned count ${returned}`,
			);
		}
	}

	const total = facts.total !== undefined
		? facts.total
		: (limited.length === 0 ? returned : null);
	if (total !== null && total < returned) {
		throw new RangeError(`completeness: total ${total} is below the returned count ${returned}`);
	}

	const complete =
		limited.length === 0 &&
		skipped.length === 0 &&
		partlyRead.length === 0 &&
		facts.notEstablished !== true;

	return {
		complete,
		total,
		returned,
		...(limited.length    > 0 ? { limited }    : {}),
		...(skipped.length    > 0 ? { skipped }    : {}),
		...(partlyRead.length > 0 ? { partlyRead } : {}),
		basis: facts.basis,
		...(facts.basisNote !== undefined ? { basisNote: facts.basisNote } : {}),
	};
}

// ---------------------------------------------------------------------------
// Answer report (sc2)
// ---------------------------------------------------------------------------

export interface SourceNote {
	readonly sourceId:   string;
	readonly sourceKind: 'lookup' | 'plan-task';
	readonly reason:     string;
}

export interface AnswerReport {
	readonly completeness: {
		readonly complete:    boolean;
		readonly incomplete:  readonly SourceNote[];
		readonly failed:      readonly SourceNote[];
		/** Each distinct `basisNote` of the sources, once. */
		readonly basisNotes?: readonly string[] | undefined;
	};
	readonly answerFailure?: string | undefined;
	/** Typed by Story s2. */
	readonly measure?:  unknown;
	/** Typed by Story s3. */
	readonly handling?: unknown;
}

export interface ReportSource {
	readonly sourceId:      string;
	readonly sourceKind:    'lookup' | 'plan-task';
	/** Absent for a failed source. */
	readonly completeness?: Completeness | undefined;
	/** The failed source's reason. */
	readonly failure?:      string | undefined;
}

/** Fallback reason for a record that is incomplete without naming a limit, a skip or a cut. */
const NOT_ESTABLISHED_REASON = 'completeness could not be established';

function incompleteReason(c: Completeness): string {
	const parts: string[] = [];
	for (const l of c.limited ?? []) {
		const each = l.scope === 'per-group' ? ' each' : '';
		parts.push(`limit of ${l.limit} ${l.what}${each} reached (${l.reason})`);
	}
	const skipped = c.skipped ?? [];
	if (skipped.length > 0) {
		parts.push(`skipped ${skipped.map(s => `${s.what} (${s.reason})`).join(', ')}`);
	}
	const partly = c.partlyRead ?? [];
	if (partly.length > 0) {
		parts.push(`partly read ${partly.map(p => {
			const total = p.totalChars !== null
				? `${p.totalChars}`
				: `an unknown length${p.totalNote !== undefined ? ` (${p.totalNote})` : ''}`;
			return `${p.what} (${p.readChars} of ${total} characters)`;
		}).join(', ')}`);
	}
	if (parts.length === 0) {
		parts.push(c.basisNote !== undefined ? `${NOT_ESTABLISHED_REASON}: ${c.basisNote}` : NOT_ESTABLISHED_REASON);
	}
	return parts.join('; ');
}

/**
 * Derive the report from one entry per executed lookup (or per plan task).
 * `complete` is true only when every source is complete and none failed.
 *
 * @throws RangeError when a source has neither a completeness record nor a
 *   failure: every source must account for itself, so none can be counted
 *   as complete by default.
 */
export function deriveAnswerReport(sources: readonly ReportSource[]): AnswerReport {
	const incomplete: SourceNote[] = [];
	const failed:     SourceNote[] = [];
	const basisNotes: string[]     = [];

	for (const s of sources) {
		if (s.failure !== undefined) {
			failed.push({ sourceId: s.sourceId, sourceKind: s.sourceKind, reason: s.failure });
			continue;
		}
		const c = s.completeness;
		if (c === undefined) {
			throw new RangeError(
				`answer report: ${s.sourceKind} ${s.sourceId} has neither a completeness record nor a failure`,
			);
		}
		if (c.basisNote !== undefined && !basisNotes.includes(c.basisNote)) basisNotes.push(c.basisNote);
		if (!c.complete) {
			incomplete.push({ sourceId: s.sourceId, sourceKind: s.sourceKind, reason: incompleteReason(c) });
		}
	}

	return {
		completeness: {
			complete: incomplete.length === 0 && failed.length === 0,
			incomplete,
			failed,
			...(basisNotes.length > 0 ? { basisNotes } : {}),
		},
	};
}

/**
 * The one line written at the head of an answer: `Complete.` or
 * `Incomplete: …` naming every incomplete and every failed source. A basis
 * note shared by several sources is written once.
 */
export function renderCompletenessLine(report: AnswerReport): string {
	const { complete, incomplete, failed, basisNotes } = report.completeness;
	const notes = (basisNotes ?? []).length > 0 ? ` Note: ${(basisNotes ?? []).join(' ')}` : '';
	if (complete && report.answerFailure === undefined) return `Complete.${notes}`;

	const parts: string[] = [];
	if (report.answerFailure !== undefined) parts.push(`the answer could not be written (${report.answerFailure})`);
	if (incomplete.length > 0) {
		parts.push(`${incomplete.length} incomplete: ${incomplete.map(n => `${n.sourceId} — ${n.reason}`).join(' | ')}`);
	}
	if (failed.length > 0) {
		parts.push(`${failed.length} failed: ${failed.map(n => `${n.sourceId} — ${n.reason}`).join(' | ')}`);
	}
	return `Incomplete: ${parts.join('. ')}.${notes}`;
}
