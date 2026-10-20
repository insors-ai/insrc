/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A divided code review's chunk calls (Epic 8315a11f s3, plan tasks t2 and t3).
 *
 * A chunk call carries the chunk's rows (in today's array form), its neighbour
 * lines, the dimension's obligations and their context, with the dimension's
 * framing; the structural reference trails, per the prompt rule. What a chunk may
 * answer depends on the dimension:
 *
 *   notes     adherence, functional coverage, conventions: NOTES only, keyed by
 *             obligation. The schema has no findings field, so no chunk can record
 *             a missing clause, an unrealized FR or a module verdict from the part
 *             of the change it saw; every finding comes from the gather's judgement
 *             of each obligation over the notes of every chunk.
 *   coverage  symbol-coverage findings about the symbols the chunk holds, and notes
 *             per promised test. A promised-test finding comes only from gather.
 *   quality   today's findings, plus one description per symbol the chunk holds, so
 *             every symbol reaches the cross-chunk duplicate comparison.
 *
 * Each validator gives at most one reason per kind of problem, naming each distinct
 * value once, so the correction stays small beside the call.
 */

import type { LLMMessage, StructuredSchema } from '../../../shared/types.js';
import type { ExecutionMode, ReviewCall, ReviewChunk, ReviewMaterial, StageAnswer } from '../types.js';

/** What a dimension supplies for its chunk calls. */
export interface ChunkSpec {
	readonly kind:       'notes' | 'coverage' | 'quality';
	/** The dimension's framing: what it judges, in today's words. */
	readonly framing:    string;
	/** Reference the dimension's prompt carries today beside the code (conventions: its documented rules). */
	readonly reference?: string | undefined;
	/** Today's findings schema (coverage, quality): its finding item is the chunk's. */
	readonly findings?:  StructuredSchema | undefined;
	/** Today's rules for judging one obligation at gather (absent for quality, which has none). */
	readonly judge?:     string | undefined;
}

const NOTES_PROPERTY = {
	type: 'array',
	items: {
		type: 'object', required: ['key', 'atomIds', 'note'], additionalProperties: false,
		properties: {
			key:     { type: 'string' },
			atomIds: { type: 'array', items: { type: 'string' } },
			note:    { type: 'string' },
		},
	},
} as const;

/** A notes-only chunk answer. There is no findings field. */
export const NOTES_CHUNK_SCHEMA: StructuredSchema = {
	type: 'object', required: ['notes'], additionalProperties: false,
	properties: { notes: NOTES_PROPERTY },
};

/** Today's findings array property of a dimension's schema. */
function findingsProperty(schema: StructuredSchema | undefined): Record<string, unknown> {
	const p = (schema as { properties?: { findings?: Record<string, unknown> } } | undefined)?.properties?.findings;
	if (p === undefined) throw new Error('code review: a coverage or quality chunk needs the dimension\'s findings schema');
	return p;
}

/** The chunk answer schema for `spec`. */
export function chunkSchema(spec: ChunkSpec): StructuredSchema {
	switch (spec.kind) {
		case 'notes':
			return NOTES_CHUNK_SCHEMA;
		case 'coverage': {
			// Today's finding item, with the symbol it is about required.
			const findings = findingsProperty(spec.findings) as { items: { required: readonly string[] } };
			const items = { ...findings.items, required: [...findings.items.required, 'symbolId'] };
			return {
				type: 'object', required: ['findings', 'notes'], additionalProperties: false,
				properties: { findings: { ...findings, items }, notes: NOTES_PROPERTY },
			};
		}
		case 'quality':
			return {
				type: 'object', required: ['findings', 'descriptions'], additionalProperties: false,
				properties: {
					findings: findingsProperty(spec.findings),
					descriptions: {
						type: 'array',
						items: {
							type: 'object', required: ['atomId', 'description'], additionalProperties: false,
							properties: { atomId: { type: 'string' }, description: { type: 'string' } },
						},
					},
				},
			};
	}
}

interface ChunkNote { readonly key: string; readonly atomIds: readonly string[]; readonly note: string }

/** The rows a chunk holds, as today's prompt lists the changed symbols. */
function rowsOf(chunk: ReviewChunk, material: ReviewMaterial): unknown[] {
	return chunk.atomIds.map(id => {
		const atom = material.atoms.find(a => a.id === id);
		if (atom === undefined) throw new Error(`code review: chunk ${chunk.id} names atom ${id}, which the material does not hold`);
		return JSON.parse(atom.text) as unknown;
	});
}

const DIVIDED = 'This review is DIVIDED: you are given ONE part of the Story\'s changed code (a chunk). Other chunks hold the rest, and each related symbol held elsewhere is named below by a one-line summary.';
const NOTES_RULE = 'For each obligation listed below that this chunk\'s code bears on, write one note under the obligation\'s exact `key`, naming in `atomIds` the entityIds of the symbols in THIS chunk it is about, and stating how that code realises, partly realises or departs from the obligation, with the evidence you see. Do NOT judge an obligation as a whole and do NOT report anything as missing: the gather judges every obligation on the notes from every chunk. An obligation this chunk does not bear on gets no note.';

const RULES: Record<ChunkSpec['kind'], readonly string[]> = {
	notes: ['Write NOTES only, never findings.', NOTES_RULE],
	coverage: [
		'Report findings ONLY about the symbols in this chunk, each with findingKind "symbol-coverage" and its `symbolId` (the symbol\'s entityId), graded by its coverageEvidence as today\'s rules say. Never report a promised test as missing or failing here: other chunks hold the rest of the change, and each promised test is judged at gather on all the notes and its full record evidence.',
		'For each promised test listed below that this chunk\'s code bears on, write one note under the test\'s exact `key`, naming in `atomIds` the entityIds of the symbols in THIS chunk it is about, and stating how that code is exercised by the test and what the test record says about it. A promised test this chunk does not bear on gets no note.',
	],
	quality: [
		'Report today\'s findings about the code in this chunk. For duplication, name a counterpart only among the symbols in this chunk or the related symbols named below; duplication across chunks is found by comparing descriptions afterwards.',
		'Also give exactly ONE `descriptions` entry for EVERY symbol in this chunk, and no other: its `atomId` (the symbol\'s entityId) and one line saying what the symbol does, in plain terms independent of its name.',
	],
};

const OUTPUT: Record<ChunkSpec['kind'], string> = {
	notes: 'Return { "notes": [ { "key": "<an obligation key above>", "atomIds": ["<entityId of a symbol in this chunk>"], "note": "how this code realises, partly realises or departs from it" } ] }. Return { "notes": [] } when the chunk bears on no obligation.',
	coverage: 'Return { "findings": [ { "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "findingKind": "symbol-coverage", "symbolId": "<entityId of a symbol in this chunk>", "confidence": "breach|observation" } ], "notes": [ { "key": "<a promised-test key above>", "atomIds": ["<entityId>"], "note": "..." } ] }.',
	quality: 'Return { "findings": [ { "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "counterpartRef": "the duplicated symbol (duplication findings only)", "confidence": "breach|observation" } ], "descriptions": [ { "atomId": "<entityId>", "description": "what it does" } ] } with one description per symbol in this chunk.',
};

/** One chunk call. */
export function chunkCall(spec: ChunkSpec, chunk: ReviewChunk, material: ReviewMaterial, execution: ExecutionMode): { readonly messages: LLMMessage[]; readonly schema: StructuredSchema; readonly execution: ExecutionMode } {
	const system = [
		spec.framing, DIVIDED, ...RULES[spec.kind],
		'Use only the keys listed and only the entityIds of the symbols in this chunk. Reason only over the structured symbol summaries provided.',
	].join('\n');
	const user = [
		...(material.obligations.length > 0
			? ['## Obligations (write notes under these keys only)', '```json', JSON.stringify(material.obligations.map(o => ({ key: o.key, text: o.text })), null, 2), '```']
			: []),
		...((material.context?.length ?? 0) > 0
			? ['## Their context', ...material.context!.map(a => `### ${a.label}\n${a.text}`)]
			: []),
		...(spec.reference !== undefined ? [spec.reference] : []),
		'## The changed symbols in this chunk (structured summaries — the code under review)',
		'```json', JSON.stringify(rowsOf(chunk, material), null, 2), '```',
		'## Related changed symbols held in other chunks',
		...(chunk.neighbours.length > 0 ? chunk.neighbours.map(n => `- ${n.summary} (in ${n.heldInChunk})`) : ['(none)']),
		'## Output',
		OUTPUT[spec.kind],
	].join('\n');
	return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema: chunkSchema(spec), execution };
}

const quoted = (values: readonly string[]): string => [...new Set(values)].map(v => JSON.stringify(v)).join(', ');

/** The notes' problems: keys that are not obligations, atoms the call did not carry. */
function noteReasons(notes: readonly ChunkNote[], call: ReviewCall, material: ReviewMaterial): string[] {
	const keys = new Set(material.obligations.map(o => o.key));
	const carried = new Set(call.carries.atomIds);
	const badKeys = notes.map(n => n.key).filter(k => !keys.has(k));
	const badAtoms = notes.flatMap(n => n.atomIds).filter(id => !carried.has(id));
	return [
		...(badKeys.length > 0 ? [`notes use keys that are not listed obligation keys: ${quoted(badKeys)}`] : []),
		...(badAtoms.length > 0 ? [`notes name atomIds that are not symbols in this chunk: ${quoted(badAtoms)}`] : []),
	];
}

/** A chunk answer's problems, beyond its schema. Empty: valid. */
export function validateChunk(spec: ChunkSpec, answer: unknown, call: ReviewCall, material: ReviewMaterial): string[] {
	const a = answer as { notes?: readonly ChunkNote[]; findings?: readonly { findingKind?: string; symbolId?: string }[]; descriptions?: readonly { atomId: string }[] };
	const carried = new Set(call.carries.atomIds);
	switch (spec.kind) {
		case 'notes':
			return noteReasons(a.notes ?? [], call, material);
		case 'coverage': {
			const findings = a.findings ?? [];
			const kinds = findings.map(f => f.findingKind ?? '(none)').filter(k => k !== 'symbol-coverage');
			const symbols = findings.filter(f => f.findingKind === 'symbol-coverage').map(f => f.symbolId ?? '(none)').filter(id => !carried.has(id));
			return [
				...(kinds.length > 0 ? [`a chunk may report only symbol-coverage findings (each promised test is judged at gather); found findingKind ${quoted(kinds)}`] : []),
				...(symbols.length > 0 ? [`symbol-coverage findings name symbolIds that are not symbols in this chunk: ${quoted(symbols)}`] : []),
				...noteReasons(a.notes ?? [], call, material),
			];
		}
		case 'quality': {
			const ids = (a.descriptions ?? []).map(d => d.atomId);
			const missing = call.carries.atomIds.filter(id => !ids.includes(id));
			const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
			const foreign = ids.filter(id => !carried.has(id));
			return [
				...(missing.length > 0 ? [`descriptions are missing for symbols in this chunk: ${quoted(missing)}`] : []),
				...(repeated.length > 0 ? [`descriptions repeat symbols: ${quoted(repeated)}`] : []),
				...(foreign.length > 0 ? [`descriptions name atomIds that are not symbols in this chunk: ${quoted(foreign)}`] : []),
			];
		}
	}
}

/** The keyed notes a chunk answer carries, for the gather. */
export function chunkNotesFrom(answer: StageAnswer): readonly { readonly key: string; readonly text: string; readonly atomIds: readonly string[] }[] {
	return ((answer.answer as { notes?: readonly ChunkNote[] }).notes ?? []).map(n => ({ key: n.key, text: n.note, atomIds: n.atomIds }));
}
