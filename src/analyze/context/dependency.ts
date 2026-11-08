/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What an answer's evidence is judged against, and what a prompt dedupes
 * (LLD-b9d5c5c40df5a574-s3, task t5).
 *
 * The synthesizer prompts compare some outputs with others: an adherence check
 * classifies each code site against the rule text, a capability answer lists a
 * concept.resolve hit as a related module only when the reuse check did not
 * list it as a candidate, a code answer centres on the concept.resolve anchor.
 * When an input is divided into parts, that reference evidence has to be in
 * every part. The DEPENDENCY table records, per prompt, which outputs are the
 * reference and which sub-sections the prompt dedupes by file or path. Pure:
 * no model, no files.
 */

import type { ExecutedExploration, ExecutedPlan } from '../explore/types.js';
import { HandlingBudgetError } from './answer-step-error.js';
import type { AnswerStepFound } from './driver.js';
import { MIN_SECTION_ROOM, measureInput } from './handling.js';
import type { InputLimit } from './handling.js';
import { renderSection, sectionBlock, upstreamBlocks } from './sections.js';
import type { BlockSection, EvidenceBlock } from './sections.js';
import type { SynthesizerPromptKey } from './synthesizer.js';

type Unit = InputLimit['unit'];

/** A sub-section the prompt dedupes, and the key it dedupes by. */
export interface DedupeKey {
	readonly section: string;
	readonly key:     'file' | 'path';
}

export interface DependencyEntry {
	/** Exploration types whose whole outputs are the reference evidence (removed from the partition blocks). */
	readonly referenceTypes: readonly string[];
	/** True when the reference is the anchor record of concept.resolve, a small extract (the output itself stays evidence). */
	readonly anchorExtract:  boolean;
	readonly dedupe:         readonly DedupeKey[];
	/** What the prompt says, or why it says nothing that compares outputs. */
	readonly reason:         string;
}

/** Built by reading each synthesizer prompt (src/prompts/analyze/synthesize.*.system.md). */
export const DEPENDENCY: Readonly<Record<SynthesizerPromptKey, DependencyEntry>> = Object.freeze({
	adherence: {
		referenceTypes: ['doc.constraint.enumerate', 'doc.decision.trace'],
		anchorExtract:  false,
		dedupe:         [{ section: 'Related docs', key: 'file' }, { section: 'surface', key: 'file' }],
		reason:         'The prompt classifies each code site against the rule text and drops a site it cannot classify; the rule outputs are the reference.',
	},
	capability: {
		referenceTypes: ['capability.reuse-check'],
		anchorExtract:  false,
		dedupe:         [{ section: 'Related modules', key: 'path' }, { section: 'surface', key: 'path' }],
		reason:         'Related modules lists a concept.resolve hit only when it is not a reuse-check candidate, so each part with hits needs the candidates.',
	},
	code: {
		referenceTypes: [],
		anchorExtract:  true,
		dedupe:         [{ section: 'surface', key: 'file' }],
		reason:         'The bundle is centred on the concept.resolve anchor, even when a child hit ranks higher, so every part needs the anchor record.',
	},
	docs: {
		referenceTypes: [],
		anchorExtract:  false,
		dedupe:         [{ section: 'Related docs', key: 'file' }, { section: 'surface', key: 'file' }],
		reason:         'No comparison between outputs is stated; Related docs and surface are deduped by file.',
	},
	data: {
		referenceTypes: [],
		anchorExtract:  false,
		dedupe:         [],
		reason:         'No comparison between outputs is stated; the surface is deduped by connectionId, which is not a file or path key.',
	},
	infra: {
		referenceTypes: [],
		anchorExtract:  false,
		dedupe:         [{ section: 'By family', key: 'file' }, { section: 'surface', key: 'file' }],
		reason:         'No comparison between outputs is stated; the family lists and the surface list each manifest file once.',
	},
});

/** The sub-sections each prompt dedupes, by target. */
export const DEDUPE_KEYS: Readonly<Record<SynthesizerPromptKey, readonly DedupeKey[]>> = Object.freeze(
	Object.fromEntries(Object.entries(DEPENDENCY).map(([k, v]) => [k, v.dedupe])) as Record<SynthesizerPromptKey, readonly DedupeKey[]>,
);

// ---------------------------------------------------------------------------
// Reference context
// ---------------------------------------------------------------------------

function isReference(target: SynthesizerPromptKey, r: ExecutedExploration): boolean {
	return DEPENDENCY[target].referenceTypes.includes(r.output.type);
}

function blocksOf(r: ExecutedExploration): readonly EvidenceBlock[] {
	return upstreamBlocks({ taskId: r.exploration.id, template: r.output.type, params: r.exploration.params, value: r.output });
}

/**
 * The anchor record of the first concept.resolve: what the bundle is centred
 * on, with the top hit when the anchor was ranked.
 */
function anchorBlock(executed: ExecutedPlan): EvidenceBlock | undefined {
	const r = executed.results.find(x => x.output.type === 'concept.resolve');
	if (r === undefined || r.output.type !== 'concept.resolve') return undefined;
	const { anchor, hits } = r.output;
	if (anchor === undefined) return undefined;
	const extract = { anchor, ...(anchor.source === 'ranked' && hits[0] !== undefined ? { topHit: hits[0] } : {}) };
	return {
		key:      `${r.exploration.id}#anchor`,
		envelope: { taskId: r.exploration.id, template: 'concept.resolve', params: r.exploration.params },
		text:     JSON.stringify(extract),
	};
}

/**
 * The reference blocks of a synthesize target, in plan order: the rule outputs
 * for adherence, the reuse-check outputs for capability, the anchor extract for
 * code, none for the rest. Never sectioned here; see `planReference`.
 */
export function selectSharedContext(target: SynthesizerPromptKey, executed: ExecutedPlan): readonly EvidenceBlock[] {
	const entry = DEPENDENCY[target];
	const blocks = executed.results.filter(r => isReference(target, r)).flatMap(blocksOf);
	if (entry.anchorExtract) {
		const anchor = anchorBlock(executed);
		if (anchor !== undefined) blocks.push(anchor);
	}
	return blocks;
}

/** The results that are evidence to divide: the reference outputs are not among them. */
export function partitionResults(target: SynthesizerPromptKey, executed: ExecutedPlan): readonly ExecutedExploration[] {
	return executed.results.filter(r => !isReference(target, r));
}

/** The evidence to divide for a target: every result that is not reference, as blocks, in plan order. */
export function evidenceBlocks(target: SynthesizerPromptKey, executed: ExecutedPlan): readonly EvidenceBlock[] {
	return partitionResults(target, executed).flatMap(blocksOf);
}

/** What an adherence answer states about its rule sources, counted in code from the reference outputs. */
export interface RuleFacts {
	/** constraints + decisions across the rule outputs. */
	readonly count: number;
	/** Each rule, verbatim, with the citation that goes with it. */
	readonly rules: readonly { readonly text: string; readonly file: string; readonly heading: string }[];
}

export function ruleFacts(executed: ExecutedPlan): RuleFacts {
	const rules: { text: string; file: string; heading: string }[] = [];
	for (const r of executed.results) {
		if (r.output.type === 'doc.constraint.enumerate') {
			for (const c of r.output.constraints) rules.push({ text: c.constraint, file: c.file, heading: c.heading });
		} else if (r.output.type === 'doc.decision.trace') {
			for (const d of r.output.decisions) rules.push({ text: d.decision, file: d.file, heading: d.heading });
		}
	}
	return { count: rules.length, rules };
}

/**
 * What a call keeps for the evidence next to the reference: the minimum room for a
 * section plus an allowance for the section's own envelope and line.
 */
export const EVIDENCE_RESERVE = MIN_SECTION_ROOM + 1_000;

/** One round of reference: the sections every part is judged against in one call, rendered. */
export interface ReferenceRound {
	readonly sections: readonly BlockSection[];
	readonly rendered: string;
	/** Its size in the limit's unit. */
	readonly size:     number;
	/** What is left of the call's limit for the part's own evidence section, after the prompt and this round. */
	readonly evidenceRoom: number;
}

export interface ReferencePlan {
	/** One round when the whole reference fits next to the prompt and the minimum room; more when it has to be cut. */
	readonly rounds: readonly ReferenceRound[];
}

/**
 * Fits the reference into a call. When the whole reference leaves the minimum
 * room for evidence it is one round. When it does not (one rule record larger
 * than the room), it is cut into sections with their envelopes and packed into
 * consecutive rounds: every part is then judged against every round in
 * sequence, so the rule is read in full. Only a reference whose envelope alone
 * cannot fit ends in HandlingBudgetError, naming the reference context.
 */
export function planReference(args: {
	readonly blocks:     readonly EvidenceBlock[];
	readonly limit:      InputLimit;
	/** The size of the prompt and everything else fixed that is not the reference. */
	readonly promptSize: number;
	readonly found:      AnswerStepFound;
}): ReferencePlan {
	const { blocks, limit, promptSize, found } = args;
	const unit: Unit = limit.unit;
	const roundBudget = limit.limit - promptSize - EVIDENCE_RESERVE;
	const room = (size: number): number => limit.limit - promptSize - size;
	const make = (sections: readonly BlockSection[]): ReferenceRound => {
		const rendered = sections.map(renderSection).join('\n\n');
		const size = measureInput(rendered, unit);
		return { sections, rendered, size, evidenceRoom: room(size) };
	};
	if (blocks.length === 0) return { rounds: [make([])] };

	const whole = blocks.map(b => ({ blockKey: b.key, index: 1, count: 1, envelope: b.envelope, text: b.text }));
	const all = make(whole);
	if (all.size <= roundBudget) return { rounds: [all] };

	if (roundBudget < MIN_SECTION_ROOM) {
		throw new HandlingBudgetError(
			`the prompt takes ${promptSize} ${unit} of the ${limit.limit} ${unit} a part call may hold, leaving ${Math.max(0, roundBudget)} ${unit} for the reference context `
			+ `after the ${EVIDENCE_RESERVE} ${unit} kept for evidence; raise the model's context window or lower PART_MAX_OUTPUT_TOKENS`,
			found,
		);
	}
	const rounds: ReferenceRound[] = [];
	let current: BlockSection[] = [];
	const flush = (): void => {
		if (current.length > 0) rounds.push(make(current));
		current = [];
	};
	for (const block of blocks) {
		const cut = sectionBlock(block, roundBudget, unit);
		if (!cut.admissible) {
			throw new HandlingBudgetError(`the reference context cannot be read: ${cut.reason}; the reference is never summarised down`, found);
		}
		for (const section of cut.sections) {
			const next = [...current, section];
			if (current.length > 0 && measureInput(next.map(renderSection).join('\n\n'), unit) > roundBudget) {
				flush();
				current = [section];
			} else {
				current = next;
			}
		}
	}
	flush();
	return { rounds };
}

/** One call of a divided answer: a part of the evidence, judged against one round of the reference. */
export interface PartCall {
	readonly part:       string;
	/** 0-based position among the reference rounds. */
	readonly roundIndex: number;
	readonly round:      ReferenceRound;
}

/**
 * The calls that cover a divided answer when the reference is in rounds: every
 * part is paired with every round, part by part, round by round within a part,
 * so a part is judged against the whole reference in sequence and none is
 * left out. With a one-round reference this is one call per part.
 */
export function pairPartsWithReference(parts: readonly string[], reference: ReferencePlan): readonly PartCall[] {
	return parts.flatMap(part => reference.rounds.map((round, roundIndex): PartCall => ({ part, roundIndex, round })));
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

/** One entry of a deduped sub-section. */
export type SubSectionEntry = Readonly<Record<string, unknown>>;

/**
 * The entries with each key once, the first occurrence (by part ordinal, the
 * order the parts are concatenated in) winning and the order otherwise kept.
 * An entry without the key is kept as it is.
 */
export function dedupeByKey(entries: readonly SubSectionEntry[], key: 'file' | 'path'): readonly SubSectionEntry[] {
	const seen = new Set<string>();
	const out: SubSectionEntry[] = [];
	for (const entry of entries) {
		const value = entry[key];
		if (typeof value !== 'string') {
			out.push(entry);
			continue;
		}
		if (seen.has(value)) continue;
		seen.add(value);
		out.push(entry);
	}
	return out;
}

/** The prompt keys that have no entry in the table: a new prompt cannot be added without stating its cross-output clauses. */
export function missingDependencyKeys(promptKeys: readonly string[], table: Readonly<Record<string, unknown>> = DEPENDENCY): readonly string[] {
	return promptKeys.filter(k => !Object.hasOwn(table, k));
}
