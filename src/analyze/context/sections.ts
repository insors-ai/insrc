/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cutting a block of evidence that is larger than a call's room
 * (LLD-b9d5c5c40df5a574-s3, task t4).
 *
 * Only a block's sectionable text is cut, into consecutive sections each the
 * largest whole code-point prefix of the remainder that fits. The block's
 * envelope (its identifying and citation fields) heads every section and is
 * counted in the room, so a section never separates text from its citation.
 * An aggregate upstream value is cut by its nested records: each record's own
 * citation fields head every section of it. Pure: no model, no files.
 */

import { MIN_SECTION_ROOM, measureInput } from './handling.js';
import type { InputLimit } from './handling.js';

type Unit = InputLimit['unit'];

/** The identifying and citation fields that head every section of a block. */
export type Envelope = Readonly<Record<string, unknown>>;

/** A piece of evidence: its envelope and the one text that may be cut. */
export interface EvidenceBlock {
	/** Names the block, apart from its position among the others. */
	readonly key:      string;
	readonly envelope: Envelope;
	readonly text:     string;
}

/** One cut of a block. */
export interface BlockSection {
	readonly blockKey: string;
	/** 1-based position among the block's sections. */
	readonly index:    number;
	readonly count:    number;
	readonly envelope: Envelope;
	readonly text:     string;
}

/** The sections of a block, or why the block cannot be read at all. */
export type SectionResult =
	| { readonly admissible: true;  readonly sections: readonly BlockSection[] }
	| { readonly admissible: false; readonly reason: string };

/** The size one code point takes in `unit`: its UTF-8 bytes, or its UTF-16 code units. */
function cost(codePoint: number, unit: Unit): number {
	if (unit === 'chars') return codePoint > 0xffff ? 2 : 1;
	return codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
}

/**
 * `text` in consecutive pieces, each the largest whole code-point prefix of
 * what remains that fits `room`. No code point is split, the pieces do not
 * overlap, and joined they give `text` back. A piece may leave up to three
 * units unused. `room` must hold at least one code point.
 */
export function sectionText(text: string, room: number, unit: Unit = 'bytes'): readonly string[] {
	if (room < 4) throw new RangeError(`a section needs room for at least one code point, got ${room}`);
	const pieces: string[] = [];
	let start = 0;
	let used = 0;
	let at = 0;
	for (const ch of text) {
		const c = cost(ch.codePointAt(0) as number, unit);
		if (used + c > room) {
			pieces.push(text.slice(start, at));
			start = at;
			used = 0;
		}
		used += c;
		at += ch.length;
	}
	if (at > start || pieces.length === 0) pieces.push(text.slice(start, at));
	return pieces;
}

/** The envelope as the lines that head a section. */
export function renderEnvelope(envelope: Envelope): string {
	return Object.entries(envelope)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
		.join('\n');
}

/** A section as it is put into a prompt. */
export function renderSection(section: BlockSection): string {
	const head = `[${section.blockKey}, section ${section.index} of ${section.count}]`;
	const env = renderEnvelope(section.envelope);
	return `${head}\n${env.length > 0 ? `${env}\n` : ''}\n${section.text}`;
}

/**
 * The sections of a block for a call that holds `room` units. A block that
 * fits whole is one section. A block whose envelope leaves less than the
 * minimum room is not admissible: only that block is lost, never the call.
 */
export function sectionBlock(block: EvidenceBlock, room: number, unit: Unit = 'bytes'): SectionResult {
	const whole: BlockSection = { blockKey: block.key, index: 1, count: 1, envelope: block.envelope, text: block.text };
	if (measureInput(renderSection(whole), unit) <= room) return { admissible: true, sections: [whole] };
	// The section line, the key and the envelope are measured as rendered. The line's numbers have as many digits as the
	// section count, so the count is tried from one digit up until the cut gives a count that has no more digits.
	for (let digits = 1; digits <= 9; digits++) {
		const widest = 10 ** digits - 1;
		const probe: BlockSection = { blockKey: block.key, index: widest, count: widest, envelope: block.envelope, text: '' };
		const textRoom = room - measureInput(renderSection(probe), unit);
		if (textRoom < MIN_SECTION_ROOM) {
			return {
				admissible: false,
				reason: `the envelope of block '${block.key}' takes ${room - textRoom} ${unit} of the ${room} ${unit} a call may hold, `
					+ `leaving less than the ${MIN_SECTION_ROOM} ${unit} a section needs`,
			};
		}
		const pieces = sectionText(block.text, textRoom, unit);
		if (String(pieces.length).length <= digits) {
			return {
				admissible: true,
				sections: pieces.map((text, i): BlockSection => ({ blockKey: block.key, index: i + 1, count: pieces.length, envelope: block.envelope, text })),
			};
		}
	}
	return { admissible: false, reason: `block '${block.key}' would need more than 999999999 sections` };
}

// ---------------------------------------------------------------------------
// Records with citation fields
// ---------------------------------------------------------------------------

/** The fields that identify and cite a record: a doc record's, and a code or search hit's. */
const CITATION_FIELDS = ['sourceEntityId', 'file', 'heading', 'kind', 'line'] as const;

function isPlain(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** True for an object that cites a source: a doc record or a hit. */
export function isCitedRecord(v: unknown): v is Record<string, unknown> {
	return isPlain(v) && (typeof v['sourceEntityId'] === 'string' || (typeof v['file'] === 'string' && typeof v['line'] === 'number'));
}

function renderField(name: string, value: unknown): string {
	return `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
}

/**
 * A cited record as a block: its citation fields are the envelope (after
 * `lead`, the fields of whatever holds it), every other field is the text.
 */
export function recordBlock(key: string, record: Readonly<Record<string, unknown>>, lead: Envelope = {}): EvidenceBlock {
	const envelope: Record<string, unknown> = { ...lead };
	const rest: string[] = [];
	for (const [name, value] of Object.entries(record)) {
		if ((CITATION_FIELDS as readonly string[]).includes(name)) envelope[name] = value;
		else rest.push(renderField(name, value));
	}
	return { key, envelope, text: rest.join('\n') };
}

/** What an aggregate task was given from one upstream task. */
export interface UpstreamBlockInput {
	readonly taskId:   string;
	readonly template: string;
	readonly params:   Readonly<Record<string, unknown>>;
	readonly value:    unknown;
}

/**
 * An upstream output as blocks. Each cited record nested in its value is a
 * block of its own, under the output's taskId, template and params, so every
 * section of it repeats the record's sourceEntityId, file and heading. What is
 * left of the value, with each record replaced by a pointer to its block, is
 * one more block under the output's envelope alone. A value with no cited
 * record is a single block of its JSON.
 */
export function upstreamBlocks(output: UpstreamBlockInput): readonly EvidenceBlock[] {
	const lead: Envelope = { taskId: output.taskId, template: output.template, params: output.params };
	const records: EvidenceBlock[] = [];
	const walk = (v: unknown, path: string): unknown => {
		if (isCitedRecord(v)) {
			const key = `${output.taskId}${path}`;
			records.push(recordBlock(key, v, lead));
			return { $record: key };
		}
		if (Array.isArray(v)) return v.map((item, i) => walk(item, `${path}[${i}]`));
		if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, walk(item, `${path}.${k}`)]));
		return v;
	};
	const rest = walk(output.value, '');
	const restBlock: EvidenceBlock = { key: output.taskId, envelope: lead, text: JSON.stringify(rest) ?? '' };
	return records.length === 0 ? [restBlock] : [restBlock, ...records];
}
