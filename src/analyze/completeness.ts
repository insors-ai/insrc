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

import type { RequestMeasure } from './measure.js';

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

/**
 * The scope an analysis ran on. `named` says who chose it: `request` (the
 * caller named it), `prompt` (the caller sent only a prompt, so the whole
 * repository was the default) or `not-recorded` (an older payload). `anchor`
 * is how the lookups chose their centre, set only when an executed
 * concept.resolve result establishes it: `named-scope` (the scope itself) or
 * `ranked` (text matching over the repository).
 */
export interface AnswerReportScope {
	readonly kind:    string;
	readonly value:   string;
	readonly named:   'request' | 'prompt' | 'not-recorded';
	readonly anchor?: 'named-scope' | 'ranked' | undefined;
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
	/** What the request touched and its size; absent on a report made before the measure existed. */
	readonly measure?:  RequestMeasure | undefined;
	/** The scope the analysis ran on and who named it; absent on a report made before the scope was stated. */
	readonly scope?:    AnswerReportScope | undefined;
	/** How the answer step was handled (Story s3); read it with `parseHandling`, a stored value may be malformed. */
	readonly handling?: HandlingReport | undefined;
}

// ---------------------------------------------------------------------------
// Handling report (sc4)
// ---------------------------------------------------------------------------

/** One input budget an answer step was held to, in its own unit; the units are never compared. */
export interface HandlingBudget {
	readonly unit:      'chars' | 'bytes';
	readonly limit:     number;
	readonly source:    'provider' | 'context-window' | 'default';
	readonly basis:     'declared' | 'bytes-bound' | 'default';
	readonly inputSize: number;
}

/**
 * How a request was handled: at once or in parts, how many parts, and which
 * parts were not covered. `trigger` says why it was divided and is absent on a
 * single pass; `combineStages` counts the combine stages of a divided call.
 */
export interface HandlingReport {
	readonly method:         'single-pass' | 'partitioned';
	readonly parts:          number;
	readonly partitionedBy?: 'directory' | 'file' | 'section' | 'mixed' | undefined;
	readonly notCovered:     readonly { readonly part: string; readonly reason: string }[];
	readonly budgets:        readonly HandlingBudget[];
	readonly trigger?:       'size' | 'fit' | 'both' | undefined;
	readonly combineStages?: number | undefined;
}

const PARTITIONED_BY = ['directory', 'file', 'section', 'mixed'];
const TRIGGERS = ['size', 'fit', 'both'];

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A finite, non-negative number: NaN, Infinity and negatives are malformed. */
function isCount(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function parseBudget(v: unknown): HandlingBudget | undefined {
	if (!isRecord(v)) return undefined;
	const { unit, limit, source, basis, inputSize } = v;
	if (unit !== 'chars' && unit !== 'bytes') return undefined;
	if (!isCount(limit) || !isCount(inputSize)) return undefined;
	if (source !== 'provider' && source !== 'context-window' && source !== 'default') return undefined;
	if (basis !== 'declared' && basis !== 'bytes-bound' && basis !== 'default') return undefined;
	return { unit, limit, source, basis, inputSize };
}

/**
 * Reads a stored handling value. Anything that is not a well-formed record
 * (an empty object, a wrong type, a missing field) is read as absent, so a
 * report made before the handling existed, or a damaged one, never throws.
 */
export function parseHandling(value: unknown): HandlingReport | undefined {
	if (!isRecord(value)) return undefined;
	const { method, parts, partitionedBy, notCovered, budgets, trigger, combineStages } = value;
	if (method !== 'single-pass' && method !== 'partitioned') return undefined;
	if (!isCount(parts) || !Array.isArray(notCovered)) return undefined;
	const uncovered: { part: string; reason: string }[] = [];
	for (const n of notCovered) {
		if (!isRecord(n) || typeof n['part'] !== 'string' || typeof n['reason'] !== 'string') return undefined;
		uncovered.push({ part: n['part'], reason: n['reason'] });
	}
	const parsedBudgets: HandlingBudget[] = [];
	if (budgets !== undefined) {
		if (!Array.isArray(budgets)) return undefined;
		for (const b of budgets) {
			const parsed = parseBudget(b);
			if (parsed === undefined) return undefined;
			parsedBudgets.push(parsed);
		}
	}
	if (partitionedBy !== undefined && !PARTITIONED_BY.includes(partitionedBy as string)) return undefined;
	if (trigger !== undefined && !TRIGGERS.includes(trigger as string)) return undefined;
	if (combineStages !== undefined && !isCount(combineStages)) return undefined;
	return {
		method,
		parts,
		...(partitionedBy !== undefined ? { partitionedBy: partitionedBy as NonNullable<HandlingReport['partitionedBy']> } : {}),
		notCovered: uncovered,
		budgets:    parsedBudgets,
		...(trigger !== undefined ? { trigger: trigger as NonNullable<HandlingReport['trigger']> } : {}),
		...(combineStages !== undefined ? { combineStages } : {}),
	};
}

/**
 * One handling for two steps. An absent side is ignored. The method is
 * 'partitioned' if either is, parts add up (a single pass counts 1),
 * `prefix` qualifies the first side's part ids, budgets are joined and
 * de-duplicated in their own units (the largest input size of identical
 * entries is kept), combine stages add up, `partitionedBy` is the common
 * value or 'mixed', and the trigger is the union of both.
 */
export function mergeHandling(
	first:  HandlingReport | undefined,
	second: HandlingReport | undefined,
	prefix = '',
): HandlingReport | undefined {
	const qualify = (n: { readonly part: string; readonly reason: string }): { readonly part: string; readonly reason: string } =>
		(prefix.length > 0 ? { ...n, part: `${prefix}${n.part}` } : n);
	if (first === undefined) return second;
	if (second === undefined) return prefix.length > 0 ? { ...first, notCovered: first.notCovered.map(qualify) } : first;
	const budgets: HandlingBudget[] = [];
	for (const b of [...first.budgets, ...second.budgets]) {
		const i = budgets.findIndex(e => e.unit === b.unit && e.limit === b.limit && e.source === b.source && e.basis === b.basis);
		if (i < 0) budgets.push(b);
		else if (b.inputSize > (budgets[i] as HandlingBudget).inputSize) budgets[i] = b;
	}
	const by = first.partitionedBy === undefined ? second.partitionedBy
		: second.partitionedBy === undefined || second.partitionedBy === first.partitionedBy ? first.partitionedBy
			: 'mixed';
	const triggers = new Set([first.trigger, second.trigger].filter(t => t !== undefined));
	const trigger = triggers.size === 0 ? undefined : triggers.size > 1 || triggers.has('both') ? 'both' : [...triggers][0];
	const combineStages = first.combineStages === undefined && second.combineStages === undefined
		? undefined
		: (first.combineStages ?? 0) + (second.combineStages ?? 0);
	return {
		method: first.method === 'partitioned' || second.method === 'partitioned' ? 'partitioned' : 'single-pass',
		parts:  first.parts + second.parts,
		...(by !== undefined ? { partitionedBy: by } : {}),
		notCovered: [
			...first.notCovered.map(qualify),
			...second.notCovered,
		],
		budgets,
		...(trigger !== undefined ? { trigger } : {}),
		...(combineStages !== undefined ? { combineStages } : {}),
	};
}

/**
 * The report with the answer step's handling merged in, one incomplete source
 * note per part the answer did not cover, and `complete` false when there is
 * one. The input report is not changed.
 */
export function applyHandling(report: AnswerReport, handling: HandlingReport): AnswerReport {
	const merged = mergeHandling(parseHandling(report.handling), handling);
	const notes: SourceNote[] = handling.notCovered.map(n => ({
		sourceId: `answer step / ${n.part}`, sourceKind: 'lookup', reason: n.reason,
	}));
	return {
		...report,
		completeness: {
			...report.completeness,
			complete:   report.completeness.complete && notes.length === 0,
			incomplete: [...report.completeness.incomplete, ...notes],
		},
		...(merged !== undefined ? { handling: merged } : {}),
	};
}

/** The one line that says how the answer was handled. */
export function renderHandlingLine(handling: HandlingReport): string {
	const how = handling.method === 'single-pass'
		? 'Handling: answered in a single pass.'
		: `Handling: divided into ${handling.parts} part${handling.parts === 1 ? '' : 's'}`
			+ `${handling.partitionedBy !== undefined ? ` by ${handling.partitionedBy}` : ''}`
			+ `${handling.trigger !== undefined ? ` (${handling.trigger})` : ''}`
			+ `${handling.combineStages !== undefined ? `, ${handling.combineStages} combine stage${handling.combineStages === 1 ? '' : 's'}` : ''}.`;
	const budgets = handling.budgets.map(b => `${b.limit} ${b.unit}`);
	const uncovered = handling.notCovered.map(n => `${oneLine(n.part)} (${oneLine(n.reason)})`);
	return [
		how,
		...(budgets.length > 0 ? [`Input budget: ${budgets.join(', ')}.`] : []),
		...(uncovered.length > 0 ? [`Not covered: ${uncovered.join('; ')}.`] : []),
	].join(' ');
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

const SOURCE_PHRASE: Readonly<Record<RequestMeasure['source'], string>> = {
	'named-area':     'measured from the area the request names',
	'data-source':    'measured from the data source',
	'lookup-results': 'measured from what the lookups returned',
};

/** A count with its unit, in the singular for one. */
function counted(n: number, one: string, many: string): string {
	return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/**
 * The one line an answer carries about its size, under the completeness line:
 * the size, where the measure came from and the counts; the reason when it
 * could not be determined; and what a caller asked for.
 */
export function renderMeasureLine(measure: RequestMeasure): string {
	const hint = measure.sizeHint !== undefined ? ` The caller asked for ${measure.sizeHint}.` : '';
	if (!measure.determined) {
		return `Size: ${measure.size}, not determined: ${measure.note ?? 'no reason was recorded'}.${hint}`;
	}
	const counts: string[] = [];
	if (measure.source === 'data-source') {
		counts.push(counted(measure.items, 'object', 'objects'));
		if (measure.files > 0) counts.push(counted(measure.files, 'file', 'files'));
	} else {
		counts.push(counted(measure.files, 'file', 'files'));
		counts.push(counted(measure.items, measure.source === 'named-area' ? 'entity' : 'item', measure.source === 'named-area' ? 'entities' : 'items'));
	}
	if (measure.characters !== null) counts.push(counted(measure.characters, 'character', 'characters'));
	const note = measure.note !== undefined ? ` ${measure.note}.` : '';
	return `Size: ${measure.size}, ${SOURCE_PHRASE[measure.source]}: ${counts.join(', ')}.${note}${hint}`;
}

/**
 * The one line an answer carries about its scope, under the measure line: what
 * the analysis ran on and whether the caller named it. How the lookups chose
 * their centre is stated only when an executed concept.resolve result
 * established it; an analysis that ran no such lookup (a documents analysis
 * among them) is not described as text-matched.
 */
export function renderScopeLine(scope: AnswerReportScope): string {
	const what = `${scope.kind} ${oneLine(scope.value)}`;
	const lead = scope.named === 'request'
		? `Scope: ${what}, named by the request.`
		: scope.named === 'prompt'
			? `Scope: ${what}, the whole repository by default: the caller named no scope.`
			: `Scope: ${what}; whether the caller named it was not recorded.`;
	const anchor = scope.anchor === 'ranked'
		? ' The lookups centred on the best text match found over that scope.'
		: scope.anchor === 'named-scope'
			? ' The lookups centred on that scope itself.'
			: '';
	return `${lead}${anchor}`;
}

/**
 * The head of an answer's text: the completeness line and, when the report
 * has them, the measure line and the scope line under it. Every writer of an
 * answer's head goes through this, so the lines are never written apart.
 */
export function renderReportHead(report: AnswerReport): string {
	const lines = [renderCompletenessLine(report)];
	if (report.measure !== undefined) lines.push(renderMeasureLine(report.measure));
	if (report.scope !== undefined) lines.push(renderScopeLine(report.scope));
	const handling = parseHandling(report.handling);
	if (handling !== undefined) lines.push(renderHandlingLine(handling));
	return lines.join('\n');
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
	const handling = mergeHandling(parseHandling(first.handling), parseHandling(second.handling), prefix);
	return {
		completeness: {
			complete:   first.completeness.complete && second.completeness.complete,
			incomplete: [...first.completeness.incomplete.map(tag), ...second.completeness.incomplete],
			failed:     [...first.completeness.failed.map(tag), ...second.completeness.failed],
			...(basisNotes.length > 0 ? { basisNotes } : {}),
		},
		...(answerFailure !== undefined ? { answerFailure } : {}),
		...(handling !== undefined ? { handling } : {}),
	};
}

/** Written at the head of an answer that carries no report: one built before the report existed. */
export const COMPLETENESS_NOT_RECORDED = 'Completeness was not recorded for this answer.';

/**
 * The first line of an answer's text form.
 *
 * With a report it is the report's head: the completeness line and, when
 * the report has a measure, the measure line. Without one, a text an agent or
 * a person reads says that completeness was not recorded; a text that goes
 * into a model's prompt gets nothing, so no such sentence enters a prompt.
 */
export function completenessHeadLine(
	report: AnswerReport | undefined,
	whenAbsent: 'say-not-recorded' | 'nothing',
): string | undefined {
	if (report !== undefined) return renderReportHead(report);
	return whenAbsent === 'say-not-recorded' ? COMPLETENESS_NOT_RECORDED : undefined;
}
