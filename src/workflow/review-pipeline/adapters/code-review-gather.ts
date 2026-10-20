/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A divided code review's gather plan (Epic 8315a11f s3, plan task t4).
 *
 * Every obligation of a dimension is judged once, in its own call, on the notes
 * every chunk wrote under its key and on its own context atoms, with today's
 * rules for that dimension and today's findings schema. A key no chunk wrote a
 * note for is judged on the statement that no chunk showed evidence for it, so a
 * missing clause, FR or promised test is reported as one call would report it.
 * With zero atoms (s1's divided-with-no-atoms rule) every key is judged on its
 * context alone. Evidence too large for one call is reduced by s1, a batch at a
 * time, into notes of at most a quarter of the limit (reduceCall).
 *
 * partOf maps an obligation answer to a part of today's DimensionResult; merge
 * joins the chunk result with the parts (t7 adds its de-duplication and today's
 * per-dimension filters).
 */

import type { LLMMessage, StructuredSchema } from '../../../shared/types.js';
import type { DimensionFinding, DimensionResult, ReviewDimension } from '../../code-review/types.js';
import type { EvidenceNote, ExecutionMode, GatherAnswer, GatherPlan, ReviewAtom, ReviewMaterial } from '../types.js';
import { chunkNotesFrom, type ChunkSpec } from './code-review-chunk.js';

/** A reduction answers with one note. */
export const REDUCE_NOTE_SCHEMA: StructuredSchema = {
	type: 'object', required: ['text'], additionalProperties: false,
	properties: { text: { type: 'string' } },
};

/** The statement an obligation with no notes is judged on. */
export const NO_EVIDENCE = 'No chunk of the divided review showed evidence for this obligation: no part of the Story\'s changed code was noted as bearing on it.';

export interface CodeReviewGatherArgs {
	readonly dimension:    ReviewDimension;
	readonly chunk:        ChunkSpec;
	/** Today's findings schema: an obligation call answers with it. */
	readonly schema:       StructuredSchema;
	readonly material:     () => ReviewMaterial;
	readonly execution:    ExecutionMode;
	/** The review's chunk limit; a reduced note is at most a quarter of it. */
	readonly limitChars:   number;
	/** The Story's changed files: a finding is located in one of them, as today. */
	readonly changedFiles: readonly string[];
}

/** The expectationRef an obligation's findings carry, as today's filters read it:
 *  an FR's id, a promised test's exact name, otherwise the obligation's text. */
export function expectationRefOf(key: string, text: string): string {
	for (const prefix of ['fr:', 'test:']) if (key.startsWith(prefix)) return key.slice(prefix.length);
	return text;
}

/** The labels of the atoms a set of notes names, so a finding can be located at them. */
function namedAtoms(notes: readonly EvidenceNote[], material: ReviewMaterial): string[] {
	const ids = [...new Set(notes.flatMap(n => n.atomIds))];
	return ids.flatMap(id => {
		const a = material.atoms.find(x => x.id === id);
		return a === undefined ? [] : [`- ${id}: ${a.label}`];
	});
}

export function codeReviewGather(args: CodeReviewGatherArgs): GatherPlan<DimensionResult> {
	const { dimension, chunk, schema, execution } = args;
	const obligationCall = (key: string, evidence: readonly EvidenceNote[], context: readonly ReviewAtom[]): { messages: LLMMessage[]; schema: StructuredSchema; execution: ExecutionMode; key: string } => {
		const material = args.material();
		const obligation = material.obligations.find(o => o.key === key);
		if (obligation === undefined) throw new Error(`code review ${dimension}: no obligation ${key}`);
		const ref = expectationRefOf(key, obligation.text);
		const system = [
			chunk.framing,
			'This review was DIVIDED into chunks. You judge ONE obligation, once, on the evidence notes every chunk wrote about it and on its own context below. The notes are the whole evidence: a part of the change no note mentions did not bear on this obligation.',
			chunk.judge ?? '',
			`Every finding carries expectationRef ${JSON.stringify(ref)} exactly, and is located at \`file:line\` in one of the Story's changed files (prefer the file of a symbol the notes name).`,
			'If the obligation is met, return an EMPTY findings array. Never manufacture findings.',
		].filter(s => s.length > 0).join('\n');
		const user = [
			'## The obligation',
			'```json', JSON.stringify({ key: obligation.key, kind: obligation.kind, text: obligation.text }, null, 2), '```',
			...(context.length > 0 ? ['## Its context', ...context.map(a => `### ${a.label}\n${a.text}`)] : []),
			...(chunk.reference !== undefined ? [chunk.reference] : []),
			'## Evidence notes from the chunks',
			...(evidence.length > 0
				? ['```json', JSON.stringify(evidence.map(n => ({ noteId: n.noteId, atomIds: n.atomIds, note: n.text })), null, 2), '```',
					'## The symbols the notes name', ...namedAtoms(evidence, material)]
				: [NO_EVIDENCE]),
			'## The Story\'s changed files',
			...args.changedFiles.map(f => `- ${f}`),
			'## Output',
			`Return today's findings shape, { "findings": [ ... ] }, each finding with expectationRef ${JSON.stringify(ref)}. Return an empty findings array if the obligation is met.`,
		].join('\n');
		return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema, execution, key };
	};
	const reduceCall = (key: string, batch: readonly EvidenceNote[]): { messages: LLMMessage[]; schema: StructuredSchema; execution: ExecutionMode; key: string } => {
		const cap = Math.floor(args.limitChars / 4);
		const system = [
			`You condense evidence notes from a divided ${dimension} code review into ONE note, at most ${cap} characters.`,
			'Keep every fact a judgement of the obligation needs: what the code does, where (the symbols named), and anything that departs from or only partly meets it. Drop repetition, never a departure.',
		].join('\n');
		const user = [
			`## Obligation ${key}`,
			'## Notes to condense',
			'```json', JSON.stringify(batch.map(n => ({ noteId: n.noteId, atomIds: n.atomIds, note: n.text })), null, 2), '```',
			'## Output',
			`Return { "text": "the one condensed note, at most ${cap} characters" }.`,
		].join('\n');
		return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema: REDUCE_NOTE_SCHEMA, execution, key };
	};
	return {
		obligationCall,
		reduceCall,
		noteCapChars: Math.floor(args.limitChars / 4),
		notesFrom: chunkNotesFrom,
		partOf: (g: GatherAnswer): DimensionResult => ({
			dimension,
			findings: ((g.answer as { findings?: readonly Omit<DimensionFinding, 'dimension'>[] }).findings ?? []).map(f => ({ ...f, dimension })),
		}),
		merge: (parts: readonly DimensionResult[]): DimensionResult => ({ dimension, findings: parts.flatMap(p => p.findings) }),
	};
}
