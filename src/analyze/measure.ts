/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The request measure (LLD-b9d5c5c40df5a574-s2, shared contract sc3).
 *
 * A request's size is counted from what the request touches and mapped to one
 * of the five sizes by ONE table, here. Nothing else in the analyzer maps a
 * count to a size, and no size is picked by a model or assumed.
 *
 * A measure has one of three sources:
 *   - 'named-area'     the stored entities of the area a scope names;
 *   - 'data-source'    the objects of a live data source;
 *   - 'lookup-results' what the lookups of an executed plan returned.
 *
 * A request that cannot be counted is the largest size, with `determined`
 * false and the reason in `note`. A size a caller states is kept as
 * `sizeHint` and never changes `size`.
 *
 * This file holds the type, the table and the functions that work on what
 * they are given. They read no store and call no model.
 */

import type { AnalyzeScope, ClassifiedIntent } from '../shared/analyze-types.js';
import type { Entity } from '../shared/types.js';
import type { ResolvedScope } from './context/scope.js';
import { isCompletenessRecord } from './completeness.js';
import { filesNamedBy } from './explore/types.js';
import type { ExecutedExploration } from './explore/types.js';
import { inAreaOf } from './runtimes/shared/task-scope.js';

/** What a request touched, and the size it maps to. */
export interface RequestMeasure {
	readonly source:     'lookup-results' | 'named-area' | 'data-source';
	/** Entities of the named area, objects of the data source, or items the lookups returned. */
	readonly items:      number;
	/** Distinct files those items lie in; 0 for a relational or key-value source. */
	readonly files:      number;
	/** Length of the lookup results as the answer step is given them; null for the other two sources. */
	readonly characters: number | null;
	readonly size:       AnalyzeScope;
	/** False: no count could be taken. `size` is then 'XL', `items` and `files` are 0, and `note` says why. */
	readonly determined: boolean;
	/** What a caller, a slash command or the planner model stated. Never affects `size`. */
	readonly sizeHint?:  AnalyzeScope | undefined;
	readonly note?:      string | undefined;
}

/** An intent with no size yet: what the classifier returns and what a caller of the context builder passes. */
export type UnsizedIntent = Omit<ClassifiedIntent, 'scope'>;

/**
 * The one table from counts to sizes: the upper bounds of XS, S, M and L for
 * each of the two counts. A count above the last bound is XL.
 */
export const SIZE_THRESHOLDS = {
	files: [1, 20, 200, 1500],
	items: [50, 500, 5000, 20000],
} as const;

const SIZES: readonly AnalyzeScope[] = ['XS', 'S', 'M', 'L', 'XL'];

/** The position of a count among a column's bounds: 0 for XS up to 4 for XL. */
function rank(count: number, bounds: readonly number[], what: string): number {
	if (!Number.isInteger(count) || count < 0) {
		throw new RangeError(`sizeOfCounts: ${what} must be a whole number that is not negative; got ${count}`);
	}
	const at = bounds.findIndex(bound => count <= bound);
	return at === -1 ? bounds.length : at;
}

/**
 * The size of two counts: the larger of the two sizes the table gives, so that
 * a few very large files, or many small ones, are not sized too small.
 *
 * @throws RangeError a count is negative or not a whole number
 */
export function sizeOfCounts(counts: { readonly files: number; readonly items: number }): AnalyzeScope {
	const byFiles = rank(counts.files, SIZE_THRESHOLDS.files, 'files');
	const byItems = rank(counts.items, SIZE_THRESHOLDS.items, 'items');
	return SIZES[Math.max(byFiles, byItems)]!;
}

/** A measure of a count that was taken. */
function determined(
	source:     RequestMeasure['source'],
	counts:     { readonly files: number; readonly items: number },
	characters: number | null,
	sizeHint:   AnalyzeScope | undefined,
): RequestMeasure {
	return {
		source,
		items:      counts.items,
		files:      counts.files,
		characters,
		size:       sizeOfCounts(counts),
		determined: true,
		...(sizeHint !== undefined ? { sizeHint } : {}),
	};
}

/**
 * The measure of a request whose count could not be taken: the largest size,
 * with the reason. A count taken of part of the area goes in the note, never
 * in `items` or `files`.
 */
export function notDetermined(
	source:   RequestMeasure['source'],
	note:     string,
	sizeHint?: AnalyzeScope,
): RequestMeasure {
	return {
		source,
		items:      0,
		files:      0,
		characters: null,
		size:       'XL',
		determined: false,
		...(sizeHint !== undefined ? { sizeHint } : {}),
		note,
	};
}

/**
 * The measure of the area a scope names, from the stored entities of the repo
 * that was read.
 *
 * @param scope    the request's scope, resolved by the one scope function
 * @param entities ALL stored entities of that repo; they are narrowed here with
 *                 the scope's area predicate, so a module, file or symbol scope
 *                 counts its own area and not the whole repo
 */
export function measureNamedArea(
	scope:     ResolvedScope,
	entities:  readonly Entity[],
	sizeHint?: AnalyzeScope,
): RequestMeasure {
	const inArea = inAreaOf(scope);
	const files = new Set<string>();
	let items = 0;
	for (const e of entities) {
		if (!inArea(e)) continue;
		items += 1;
		// By path, so the count does not depend on a parser storing a 'file' entity.
		if (e.file.length > 0) files.add(e.file);
	}
	return determined('named-area', { files: files.size, items }, null, sizeHint);
}

/** Said when no lookup of an executed plan returned a result to count. */
export const NO_LOOKUP_RESULT_TO_COUNT = 'no lookup returned a result to count: every lookup failed or is not supported';

/**
 * The measure of a request from what its lookups returned.
 *
 * `items` is the sum of the returned counts of the outputs that carry a
 * completeness record; a failed or unsupported lookup adds nothing, also when
 * it carries partial findings. `files` is the distinct paths the outputs name,
 * through `filesNamedBy`. `characters` is the length of those outputs as the
 * answer step is given them; it is recorded for the handling of large results
 * and does not take part in the size.
 */
export function measureLookupResults(
	results:   readonly ExecutedExploration[],
	sizeHint?: AnalyzeScope,
): RequestMeasure {
	const files = new Set<string>();
	let items = 0;
	let characters = 0;
	let counted = 0;
	for (const r of results) {
		const output = r.output;
		if (output.type === 'failed' || output.type === 'unsupported') continue;
		if (!isCompletenessRecord(output.completeness)) continue;
		counted += 1;
		items += output.completeness.returned;
		for (const file of filesNamedBy(output)) files.add(file);
		// The answer step is given each output as indented JSON.
		characters += JSON.stringify(output, null, 2).length;
	}
	if (counted === 0) return notDetermined('lookup-results', NO_LOOKUP_RESULT_TO_COUNT, sizeHint);
	return determined('lookup-results', { files: files.size, items }, characters, sizeHint);
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
