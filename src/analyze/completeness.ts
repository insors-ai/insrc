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
	/**
	 * `overall` bounds the items returned; `per-group` bounds each group of
	 * them; `source` bounds what the result was built FROM (sections read,
	 * keys sampled), which is not counted in `returned`.
	 */
	readonly scope:  'overall' | 'per-group' | 'source';
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

/** Something a lookup had found before it failed: where it came from, and what it was. */
export interface PartialFinding {
	readonly source:  string;
	readonly content: string;
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

/** True for a value with the shape `buildCompleteness` returns. */
export function isCompletenessRecord(v: unknown): v is Completeness {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	return typeof r['complete'] === 'boolean'
		&& typeof r['returned'] === 'number'
		&& (r['total'] === null || typeof r['total'] === 'number')
		&& typeof r['basis'] === 'string';
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
 *   caller: a negative count or limit, a total below the returned count
 *   (or not a number), an OVERALL limit below the returned count, or a
 *   partly read item whose full length is below what was read. A per-group
 *   limit and a limit on a result's sources are not compared with the
 *   returned count: they count something else.
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
		if (!Number.isFinite(l.limit) || l.limit < 0) {
			throw new RangeError(`completeness: limit on ${l.what} must be >= 0, got ${l.limit}`);
		}
		if (l.scope === 'overall' && l.limit < returned) {
			throw new RangeError(
				`completeness: overall limit ${l.limit} on ${l.what} is below the returned count ${returned}`,
			);
		}
	}

	for (const p of partlyRead) {
		if (!Number.isFinite(p.readChars) || p.readChars < 0) {
			throw new RangeError(`completeness: readChars of ${p.what} must be >= 0, got ${p.readChars}`);
		}
		if (p.totalChars !== null && !(p.totalChars >= p.readChars)) {
			throw new RangeError(
				`completeness: totalChars ${p.totalChars} of ${p.what} is below the ${p.readChars} characters read`,
			);
		}
	}

	const total = facts.total !== undefined
		? facts.total
		: (limited.length === 0 ? returned : null);
	if (total !== null && !(total >= returned)) {
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

/** True for a value with the shape `deriveAnswerReport` returns. */
export function isAnswerReport(v: unknown): v is AnswerReport {
	if (typeof v !== 'object' || v === null) return false;
	const c = (v as Record<string, unknown>)['completeness'];
	if (typeof c !== 'object' || c === null) return false;
	const r = c as Record<string, unknown>;
	return typeof r['complete'] === 'boolean' && Array.isArray(r['incomplete']) && Array.isArray(r['failed']);
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
		const each = l.scope === 'per-group' ? ' each' : l.scope === 'source' ? ' read' : '';
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
	const notes = (basisNotes ?? []).length > 0 ? ` Note: ${(basisNotes ?? []).map(oneLine).join(' ')}` : '';
	if (complete && report.answerFailure === undefined) return `Complete.${notes}`;

	const parts: string[] = [];
	if (report.answerFailure !== undefined) parts.push(`the answer could not be written (${oneLine(report.answerFailure)})`);
	if (incomplete.length > 0) {
		parts.push(`${incomplete.length} incomplete: ${incomplete.map(n => `${oneLine(n.sourceId)} — ${oneLine(n.reason)}`).join(' | ')}`);
	}
	if (failed.length > 0) {
		parts.push(`${failed.length} failed: ${failed.map(n => `${oneLine(n.sourceId)} — ${oneLine(n.reason)}`).join(' | ')}`);
	}
	return `Incomplete: ${parts.join('. ')}.${notes}`;
}

/**
 * A reason is often a raw error message (a CLI's stderr, a search tool's
 * failure) and may span lines. The completeness line is ONE line, read as the
 * head of an answer's text: every run of whitespace becomes one space. The
 * report itself keeps the reason as it was given.
 */
function oneLine(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** Written in the report's place for a run whose stored record carries none: one made before the report existed. */
export const RUN_COMPLETENESS_NOT_RECORDED = 'Completeness was not recorded for this run.';

/**
 * One report for an answer built in two steps, each with its own report (a
 * plan tree's run: the run context, then the plan's tasks). It is complete
 * only when both are; the notes of both are kept, in the order given.
 * `prefix` is put before each source id of `first`, so a reader can tell the
 * two steps' sources apart.
 */
export function mergeAnswerReports(first: AnswerReport, second: AnswerReport, prefix = ''): AnswerReport {
	const tag = (n: SourceNote): SourceNote => (prefix.length > 0 ? { ...n, sourceId: `${prefix}${n.sourceId}` } : n);
	const basisNotes: string[] = [];
	for (const note of [...(first.completeness.basisNotes ?? []), ...(second.completeness.basisNotes ?? [])]) {
		if (!basisNotes.includes(note)) basisNotes.push(note);
	}
	const answerFailure = first.answerFailure ?? second.answerFailure;
	return {
		completeness: {
			complete:   first.completeness.complete && second.completeness.complete,
			incomplete: [...first.completeness.incomplete.map(tag), ...second.completeness.incomplete],
			failed:     [...first.completeness.failed.map(tag), ...second.completeness.failed],
			...(basisNotes.length > 0 ? { basisNotes } : {}),
		},
		...(answerFailure !== undefined ? { answerFailure } : {}),
	};
}

/** Written at the head of an answer that carries no report: one built before the report existed. */
export const COMPLETENESS_NOT_RECORDED = 'Completeness was not recorded for this answer.';

/**
 * The first line of an answer's text form.
 *
 * With a report it is the completeness line. Without one, a text an agent or
 * a person reads says that completeness was not recorded; a text that goes
 * into a model's prompt gets nothing, so no such sentence enters a prompt.
 */
export function completenessHeadLine(
	report: AnswerReport | undefined,
	whenAbsent: 'say-not-recorded' | 'nothing',
): string | undefined {
	if (report !== undefined) return renderCompletenessLine(report);
	return whenAbsent === 'say-not-recorded' ? COMPLETENESS_NOT_RECORDED : undefined;
}
