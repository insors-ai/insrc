/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared pieces the lookups use to build their completeness record
 * (LLD-b9d5c5c40df5a574-s1). Each lookup still builds its OWN record, at the
 * place it applies a limit; this module only holds what several of them say
 * in the same words.
 */

import type { SearchGrepData } from '../../daemon/tools/builtins/search/grep.js';
import { buildCompleteness } from '../completeness.js';
import type { Completeness, PartlyReadItem, ReachedLimit, SkippedItem } from '../completeness.js';

/**
 * Carried by every result that rests on the stored code graph. The graph's
 * own coverage of the code is not established (ISSUE-12f70133491114c9), so a
 * graph-based result that holds everything the graph has is complete with
 * respect to the graph, and says so.
 */
export const GRAPH_BASIS_NOTE =
	"this result holds what the stored code graph has; the graph's own coverage of the code is not established";

/**
 * Carried by every result that rests on the document index. The index keeps
 * the first 8,192 characters of a document or a section, so a longer one is
 * found by, and matched on, that much of it.
 */
export const DOC_INDEX_RULE =
	'A document or section longer than 8,192 characters is indexed, and so searched, by its first 8,192 characters only.';

/** A count limit that was reached: `kept` items were returned out of `found`. */
export function reachedLimit(
	what:  string,
	limit: number,
	scope: ReachedLimit['scope'],
	found: number | null,
): ReachedLimit {
	return {
		what, limit, scope,
		reason: found !== null
			? `${found} ${what} were found and ${limit} are kept`
			: `the lookup stops at ${limit} ${what}; how many exist is not known`,
	};
}

/**
 * The record of a graph-based lookup: `returned` items kept, `found` items in
 * the graph (when known), and the limits reached.
 */
export function graphCompleteness(args: {
	readonly returned:  number;
	readonly found?:    number | null | undefined;
	readonly limited?:  readonly ReachedLimit[] | undefined;
	readonly skipped?:  readonly SkippedItem[] | undefined;
	readonly partlyRead?: readonly PartlyReadItem[] | undefined;
	/** A rule of this lookup that bounds what it looks at, added to the basis note. */
	readonly rule?:     string | undefined;
}): Completeness {
	return buildCompleteness({
		returned:  args.returned,
		...(args.found   !== undefined ? { total: args.found }     : {}),
		...(args.limited !== undefined ? { limited: args.limited } : {}),
		...(args.skipped !== undefined ? { skipped: args.skipped } : {}),
		...(args.partlyRead !== undefined ? { partlyRead: args.partlyRead } : {}),
		basis:     'graph',
		basisNote: args.rule !== undefined ? `${GRAPH_BASIS_NOTE}. ${args.rule}` : GRAPH_BASIS_NOTE,
	});
}

/**
 * The record of a text lookup, from what the search primitive says it left
 * out: files and directories it skipped, matching lines it shortened, the
 * limits it reached and output it dropped. The backend's exclusion rule and
 * a failed ripgrep run go in the basis note.
 */
export function textSearchCompleteness(data: SearchGrepData, limit: number): Completeness {
	const o = data.omitted;
	const limited: ReachedLimit[] = [];
	if (data.truncated) {
		limited.push({
			what: 'hits', limit, scope: 'overall',
			reason: `the search stops at ${limit} hits; how many more lines match is not known`,
		});
	}
	if (o.perFileLimitReached) {
		limited.push({
			what: 'hits per file', limit, scope: 'per-group',
			reason: `ripgrep stops at ${limit} matches in each file; a file that reached it may hold more`,
		});
	}
	const skipped: SkippedItem[] = o.skippedFiles.map(f => ({
		what:   f.path,
		reason: f.reason === 'too-large' ? 'the file is over the 2 MB size limit' : 'it could not be read',
	}));
	if (o.outputDiscarded) {
		skipped.push({ what: "part of the search's output", reason: "it passed the 4 MB the search keeps and was dropped" });
	}
	const partlyRead: PartlyReadItem[] = o.shortenedLines.map(l => ({
		what:       `${l.path}:${l.line}`,
		readChars:  Math.min(500, l.totalChars),
		totalChars: l.totalChars,
	}));
	const notes = [`Not searched, by rule: ${o.excludedByRule}.`];
	if (o.backendFallback !== undefined) {
		notes.push(`ripgrep did not finish (${o.backendFallback.detail}); the result is the Node search's.`);
	}
	return buildCompleteness({
		returned: data.hits.length,
		limited, skipped, partlyRead,
		basis:     'text',
		basisNote: notes.join(' '),
	});
}

/**
 * What a lookup that pauses for a model call knows in `prepare`, where it
 * applies its limit and cuts content, carried to `finalize`, where the output
 * is built on a later turn.
 */
export interface CarriedCompletenessFacts {
	readonly limited?:    readonly ReachedLimit[] | undefined;
	readonly skipped?:    readonly SkippedItem[] | undefined;
	readonly partlyRead?: readonly PartlyReadItem[] | undefined;
}

/**
 * The record `finalize` builds from the facts `prepare` carried. A prepared
 * value minted before the facts existed carries none: the record then says
 * its completeness is not established, so an in-flight run finishes honestly.
 */
export function carriedCompleteness(
	returned: number,
	basis:    Completeness['basis'],
	facts:    CarriedCompletenessFacts | undefined,
	note?:    string,
): Completeness {
	if (facts === undefined) {
		const missing = 'what the lookup left out was not carried from its first step, so its completeness is not established';
		return buildCompleteness({
			returned, basis, notEstablished: true,
			basisNote: note !== undefined ? `${note}. ${missing}` : missing,
		});
	}
	return buildCompleteness({
		returned, basis,
		...(facts.limited    !== undefined ? { limited: facts.limited }       : {}),
		...(facts.skipped    !== undefined ? { skipped: facts.skipped }       : {}),
		...(facts.partlyRead !== undefined ? { partlyRead: facts.partlyRead } : {}),
		...(note !== undefined ? { basisNote: note } : {}),
	});
}
