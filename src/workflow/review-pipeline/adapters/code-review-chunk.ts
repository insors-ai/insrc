/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A divided code review's chunk calls (Epic 8315a11f s3, plan task t2).
 *
 * Adherence, functional coverage and conventions read a chunk and write NOTES
 * only: for each obligation the chunk's code bears on, how it realises, partly
 * realises or departs from it. Their chunk schema has no findings field, so no
 * chunk can record a missing clause, an unrealized FR or a module verdict from
 * the part of the change it saw; every finding of these dimensions comes from the
 * gather's judgement of each obligation over the notes of every chunk.
 *
 * A chunk call carries the chunk's rows (in today's array form), its neighbour
 * lines, the dimension's obligations and their context atoms, with the
 * dimension's framing; the structural reference trails, per the prompt rule.
 */

import type { LLMMessage, StructuredSchema } from '../../../shared/types.js';
import type { ExecutionMode, ReviewCall, ReviewChunk, ReviewMaterial, StageAnswer } from '../types.js';

/** What a notes-only dimension supplies for its chunk calls. */
export interface NotesChunkSpec {
	/** The dimension's framing: what it judges, in today's words. */
	readonly framing:    string;
	/** Reference the dimension's prompt carries today beside the code (conventions: its documented rules). */
	readonly reference?: string | undefined;
}

/** A chunk answer: notes only. There is no findings field. */
export const NOTES_CHUNK_SCHEMA: StructuredSchema = {
	type: 'object', required: ['notes'], additionalProperties: false,
	properties: {
		notes: {
			type: 'array',
			items: {
				type: 'object', required: ['key', 'atomIds', 'note'], additionalProperties: false,
				properties: {
					key:     { type: 'string' },
					atomIds: { type: 'array', items: { type: 'string' } },
					note:    { type: 'string' },
				},
			},
		},
	},
};

interface ChunkNote { readonly key: string; readonly atomIds: readonly string[]; readonly note: string }

/** The rows a chunk holds, as today's prompt lists the changed symbols. */
function rowsOf(chunk: ReviewChunk, material: ReviewMaterial): unknown[] {
	return chunk.atomIds.map(id => {
		const atom = material.atoms.find(a => a.id === id);
		if (atom === undefined) throw new Error(`code review: chunk ${chunk.id} names atom ${id}, which the material does not hold`);
		return JSON.parse(atom.text) as unknown;
	});
}

/** One notes-only chunk call. */
export function notesChunkCall(spec: NotesChunkSpec, chunk: ReviewChunk, material: ReviewMaterial, execution: ExecutionMode): { readonly messages: LLMMessage[]; readonly schema: StructuredSchema; readonly execution: ExecutionMode } {
	const system = [
		spec.framing,
		'This review is DIVIDED: you are given ONE part of the Story\'s changed code (a chunk). Other chunks hold the rest, and each related symbol held elsewhere is named below by a one-line summary.',
		'Write NOTES only, never findings. For each obligation listed below that this chunk\'s code bears on, write one note under the obligation\'s exact `key`, naming in `atomIds` the entityIds of the symbols in THIS chunk it is about, and stating how that code realises, partly realises or departs from the obligation, with the evidence you see.',
		'Do NOT judge an obligation as a whole and do NOT report anything as missing: the gather judges every obligation on the notes from every chunk. An obligation this chunk does not bear on gets no note.',
		'Use only the keys listed and only the entityIds of the symbols in this chunk. Reason only over the structured symbol summaries provided.',
	].join('\n');
	const user = [
		'## Obligations (write notes under these keys only)',
		'```json', JSON.stringify(material.obligations.map(o => ({ key: o.key, text: o.text })), null, 2), '```',
		...((material.context?.length ?? 0) > 0
			? ['## Their context', ...material.context!.map(a => `### ${a.label}\n${a.text}`)]
			: []),
		...(spec.reference !== undefined ? [spec.reference] : []),
		'## The changed symbols in this chunk (structured summaries — the code under review)',
		'```json', JSON.stringify(rowsOf(chunk, material), null, 2), '```',
		'## Related changed symbols held in other chunks',
		...(chunk.neighbours.length > 0 ? chunk.neighbours.map(n => `- ${n.summary} (in ${n.heldInChunk})`) : ['(none)']),
		'## Output',
		'Return { "notes": [ { "key": "<an obligation key above>", "atomIds": ["<entityId of a symbol in this chunk>"], "note": "how this code realises, partly realises or departs from it" } ] }. Return { "notes": [] } when the chunk bears on no obligation.',
	].join('\n');
	return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema: NOTES_CHUNK_SCHEMA, execution };
}

/** A notes-only chunk answer's problems: a key that is not an obligation, an atom the call did not carry. */
export function validateNotesChunk(answer: unknown, call: ReviewCall, material: ReviewMaterial): string[] {
	const keys = new Set(material.obligations.map(o => o.key));
	const carried = new Set(call.carries.atomIds);
	const reasons: string[] = [];
	for (const [i, n] of ((answer as { notes?: readonly ChunkNote[] }).notes ?? []).entries()) {
		if (!keys.has(n.key)) reasons.push(`notes[${i}].key "${n.key}" is not one of the listed obligation keys`);
		for (const id of n.atomIds) if (!carried.has(id)) reasons.push(`notes[${i}].atomIds names "${id}", which is not a symbol in this chunk`);
	}
	return reasons;
}

/** The keyed notes a chunk answer carries, for the gather. */
export function chunkNotesFrom(answer: StageAnswer): readonly { readonly key: string; readonly text: string; readonly atomIds: readonly string[] }[] {
	return ((answer.answer as { notes?: readonly ChunkNote[] }).notes ?? []).map(n => ({ key: n.key, text: n.note, atomIds: n.atomIds }));
}
