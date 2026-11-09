/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Assembling a divided answer (LLD-b9d5c5c40df5a574-s3, task t7): the bundle
 * adapter and the aggregate adapter. A combine reply gives the narrative
 * (system, focus and summary of a bundle; the summary of an aggregate); the
 * evidence layers and the findings are never read from it. They are
 * concatenated in code from the covered parts, by ordinal, so no evidence is
 * lost or invented by a combine. Pure: no model.
 */

import type { AggregateFinding } from '../runtimes/shared/aggregate-types.js';
import type { AnalyzeContextBundle } from './types.js';
import { DEDUPE_KEYS } from './dependency.js';
import type { RuleFacts } from './dependency.js';
import type { CoveredPart } from './handling-parts.js';
import type { SynthesizerPromptKey } from './synthesizer.js';

export type BundleLayers = Omit<AnalyzeContextBundle, 'meta' | 'report'>;

/** What a bundle combine reply holds: the narrative layers. */
export interface BundleNarrative {
	readonly system:  string;
	readonly focus:   string;
	readonly summary: string;
}

const EVIDENCE_LAYERS = ['structure', 'surface', 'artefacts', 'upstream'] as const;

/**
 * The key of a list entry: the whole file or path the entry names, not a part of it. An entry is
 * `<file> :: <heading>`, `<kind> — <path>`, `` `<path>` `` or the path alone, with or without a bullet; a path may hold
 * spaces. A line that is none of these (prose) is its own key, so only an identical line is ever dropped.
 */
function lineKey(line: string): string | undefined {
	const entry = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
	if (entry.length === 0) return undefined;
	// A `<file> :: <heading>` entry names its whole file, whatever characters the file holds. Only an entry without
	// that separator can start with a short kind word (`<kind> — <path>`), and the path after it is kept whole.
	if (entry.includes(' :: ')) return entry.slice(0, entry.indexOf(' :: ')).replace(/^`|`$/g, '').trim() || undefined;
	// A plain file name may hold the separator too, so a kind is taken off only where a real path (with a directory)
	// follows it; anything else is kept whole and only an identical entry is dropped.
	const kind = /^[A-Za-z][A-Za-z0-9_-]{0,30} — (.*\/.+)$/.exec(entry);
	return (kind?.[1] ?? entry).replace(/^`|`$/g, '').trim() || undefined;
}

/**
 * Lists a prompt dedupes (Related docs by file, Related modules by path, the
 * surface by file or path) are listed once in the concatenation of the parts,
 * the first occurrence winning. A `surface` entry covers the whole layer; any
 * other names a `## ` sub-section of the layer.
 */
export function dedupeLayer(text: string, layer: string, target: SynthesizerPromptKey, excluded?: ReadonlySet<string>): string {
	const keys = DEDUPE_KEYS[target];
	const lines = text.split('\n');
	const out: string[] = [];
	let section: string | undefined = layer === 'surface' ? 'surface' : undefined;
	const seen = new Map<string, Set<string>>();
	for (const line of lines) {
		// A `## ` heading names the sub-section; a `### ` heading (a part, a family) stays inside it.
		const heading = /^(#{2,3})\s+(.*)$/.exec(line);
		if (heading !== null && heading[1] === '##' && layer !== 'surface') section = heading[2];
		const rule = keys.find(k => (k.section === 'surface' ? layer === 'surface' : section !== undefined && section.includes(k.section)));
		const key = rule === undefined || heading !== null ? undefined : lineKey(line);
		if (rule === undefined || key === undefined) { out.push(line); continue; }
		// A module that is a reuse candidate is not listed among the other modules, whichever part saw it.
		if (rule.section === 'Related modules' && excluded !== undefined && isExcluded(key, excluded)) continue;
		const bucket = seen.get(rule.section) ?? new Set<string>();
		seen.set(rule.section, bucket);
		if (bucket.has(key)) continue;
		bucket.add(key);
		out.push(line);
	}
	return out.join('\n');
}

/**
 * True when the entry names a candidate module: its whole path, or the whole path followed by an annotation in
 * brackets or after a dash. A longer path that merely begins with a candidate's (`src/a b` for `src/a`) is another module.
 */
function isExcluded(key: string, excluded: ReadonlySet<string>): boolean {
	if (excluded.has(key)) return true;
	for (const p of excluded) if (key.startsWith(`${p} (`) || key.startsWith(`${p} — `) || key.startsWith(`${p} - `) || key.startsWith(`${p}: `)) return true;
	return false;
}

/** The bundle layers of a divided answer. */
export function assembleBundle(
	target: SynthesizerPromptKey,
	covered: readonly CoveredPart<BundleLayers>[],
	combine: BundleNarrative | undefined,
	facts?: RuleFacts | undefined,
	candidatePaths?: readonly string[] | undefined,
): BundleLayers {
	const first = covered[0]?.reply;
	const narrative: BundleNarrative = combine ?? {
		system: first?.system ?? '', focus: first?.focus ?? '',
		summary: covered.length > 1 ? covered.map(c => c.reply.summary).join('\n\n') : (first?.summary ?? ''),
	};
	const layers = Object.fromEntries(EVIDENCE_LAYERS.map(layer => {
		const joined = covered
			.filter(c => c.reply[layer].trim().length > 0)
			.map(c => (covered.length > 1 ? `### ${c.id}\n${c.reply[layer]}` : c.reply[layer]))
			.join('\n\n');
		return [layer, dedupeLayer(joined, layer, target, candidatePaths === undefined ? undefined : new Set(candidatePaths))];
	})) as Record<(typeof EVIDENCE_LAYERS)[number], string>;
	// The rule count and the rules themselves are counted from every lookup in code: a reply saw one round of the
	// reference at most, so what it states of them may be partial.
	const focus = target === 'adherence' && facts !== undefined && facts.count > 0
		? `${narrative.focus}\n\n${renderRuleFacts(facts)}`
		: narrative.focus;
	return { ...narrative, focus, ...layers };
}

/** The rule sources and their verbatim text, as counted from the whole reference. */
export function renderRuleFacts(facts: RuleFacts): string {
	return [
		`Rule sources checked (counted from every lookup): ${facts.count}`,
		...facts.rules.map(r => `- ${r.text} (${r.file}${r.heading.length > 0 ? ` :: ${r.heading}` : ''})`),
	].join('\n');
}

/** What an aggregate combine reply holds. */
export interface AggregateNarrative {
	readonly summary: string;
}

export interface AggregateParts {
	readonly summary:  string;
	readonly findings: readonly AggregateFinding[];
}

/** The summary and findings of a divided aggregate: the findings are the covered parts' own, in ordinal order, each keeping its sources. */
export function assembleAggregate(
	covered: readonly CoveredPart<AggregateParts>[],
	combine: AggregateNarrative | undefined,
): AggregateParts {
	const summary = combine?.summary ?? covered.map(c => c.reply.summary).join('\n\n');
	return { summary, findings: covered.flatMap(c => c.reply.findings) };
}
