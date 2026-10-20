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
 * A changed symbol calling one held in another chunk (quality, adherence) is judged
 * in a relation call: both full rows when they fit one call, else (or within a size
 * a refusal reported) two calls, each one full row against the other's neighbour
 * summary. A mismatch is located at the caller; an answer naming a location or a
 * counterpart outside the two symbols is rejected.
 *
 * partOf maps an obligation or relation answer to a part of today's DimensionResult; merge
 * joins the chunk result with the parts in order, keeps each identical finding once, and
 * applies the dimension's own result filters once over the whole (finalize).
 */

import type { LLMMessage, StructuredSchema } from '../../../shared/types.js';
import type { DimensionFinding, DimensionResult, ReviewDimension } from '../../code-review/types.js';
import { envelopeMessages, promptChars } from '../envelope.js';
import { AtomTooLargeError } from '../pack-into-batches.js';
import type { EvidenceNote, ExecutionMode, GatherAnswer, GatherPlan, ReviewAtom, ReviewCall, ReviewMaterial, ReviewObligation } from '../types.js';
import { chunkNotesFrom, type ChunkSpec } from './code-review-chunk.js';
import { neighbourSummary } from './code-review-material.js';

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
	/** Today's result filters over the merged findings (the dimension's toResult: changed-set
	 *  filter, known-FR filter, coverage normalised once); the path decides out-of-set findings. */
	readonly finalize:     (findings: readonly DimensionFinding[]) => DimensionResult;
}

/** A finding's identity: every field, in a fixed order. */
function findingKey(f: DimensionFinding): string {
	return JSON.stringify(Object.keys(f).sort().map(k => [k, (f as unknown as Record<string, unknown>)[k]]));
}

/** The parts in order (chunk results, then obligations, then relations), each identical finding once. */
export function mergeFindings(parts: readonly DimensionResult[]): DimensionFinding[] {
	const seen = new Set<string>();
	const out: DimensionFinding[] = [];
	for (const f of parts.flatMap(p => p.findings)) {
		const k = findingKey(f);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(f);
	}
	return out;
}

/** The expectationRef an obligation's findings carry, as today's filters and rules read it:
 *  an FR's id, a promised test's exact name, a clause's text. A module's conventions have
 *  no single ref: each finding names the breached documented rule's id (or the idiom), as today. */
export function expectationRefOf(o: Pick<ReviewObligation, 'key' | 'kind' | 'text'>): string | undefined {
	if (o.kind === 'module-conventions') return undefined;
	for (const prefix of ['fr:', 'test:']) if (o.key.startsWith(prefix)) return o.key.slice(prefix.length);
	return o.text;
}

/** The rule a finding's expectationRef follows in an obligation call. */
function refRule(ref: string | undefined): string {
	return ref !== undefined
		? `Every finding carries expectationRef ${JSON.stringify(ref)} exactly`
		: 'Every finding names in expectationRef the breached documented-rule id, or the label of the module idiom it departs from';
}

/** A call's size as sent, enveloped under an id of a real id's length. */
const sentChars = (messages: readonly LLMMessage[]): number => promptChars(envelopeMessages('00000000-0000-0000-0000-000000000000', messages));

const fileOfLocation = (location: string): string => {
	const i = location.indexOf(':');
	return i >= 0 ? location.slice(0, i) : location;
};

/** A relation answer's problems: a finding not located at the caller (the first symbol: its file, and its
 *  name in the message, since a row carries no line range), or naming a counterpart that is neither of
 *  the two. Fixed-size reasons: made-up values are located, not quoted. */
function relationReasons(answer: unknown, call: ReviewCall, material: ReviewMaterial): string[] {
	if (call.role !== 'relation') return [];
	const pair = call.carries.atomIds.map(id => material.atoms.find(a => a.id === id)).filter((a): a is ReviewAtom => a !== undefined);
	// A mismatch is located at the caller: relationCall's pair is [caller, callee].
	const callerFile = pair[0]?.file;
	const callerName = pair[0] !== undefined ? (JSON.parse(pair[0].text) as { name?: string }).name ?? pair[0].id : '';
	const names = new Set(pair.flatMap(a => [a.id, a.label, (JSON.parse(a.text) as { name?: string }).name ?? a.id]));
	const findings = (answer as { findings?: readonly { location?: string; message?: string; counterpartRef?: string }[] }).findings ?? [];
	const badLocations = findings.flatMap((f, i) => fileOfLocation(f.location ?? '') === callerFile && (f.message ?? '').includes(callerName) ? [] : [`findings[${i}]`]);
	const badCounterparts = findings.flatMap((f, i) => f.counterpartRef === undefined || names.has(f.counterpartRef.trim()) ? [] : [`findings[${i}].counterpartRef`]);
	const listed = pair.map(a => a.label).join(' and ');
	return [
		...(badLocations.length > 0 ? [`${badLocations.length} findings are not located at the caller (first: ${badLocations[0]}); locate a mismatch at the caller: in ${JSON.stringify(callerFile ?? '')}, naming ${JSON.stringify(callerName)} in the message`] : []),
		...(badCounterparts.length > 0 ? [`${badCounterparts.length} findings name a counterpart that is not one of the two symbols judged (first: ${badCounterparts[0]}); name only ${listed}`] : []),
	];
}

/** A promised test's judgement may report only promised-test findings: symbol coverage is
 *  graded in the chunks that hold the symbols, never at gather (and not at all with zero atoms). */
function obligationReasons(answer: unknown, call: ReviewCall, material: ReviewMaterial): string[] {
	const o = material.obligations.find(x => x.key === call.carries.key);
	if (call.role !== 'obligation' || o?.kind !== 'promised-test') return [];
	const kinds = ((answer as { findings?: readonly { findingKind?: string }[] }).findings ?? []).map(f => f.findingKind ?? '(none)').filter(k => k !== 'promised-test');
	return kinds.length > 0 ? [`a promised test's judgement may report only findingKind "promised-test" findings about that test; found ${[...new Set(kinds)].map(k => JSON.stringify(k)).join(', ')}`] : [];
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
		const ref = expectationRefOf(obligation);
		const system = [
			chunk.obligationFraming ?? chunk.framing,
			'This review was DIVIDED into chunks. You judge ONE obligation, once, on the evidence notes every chunk wrote about it and on its own context below. The notes are the whole evidence: a part of the change no note mentions did not bear on this obligation.',
			chunk.judge ?? '',
			`${refRule(ref)}, and is located at \`file:line\` in one of the Story's changed files (prefer the file of a symbol the notes name).`,
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
			`Return today's findings shape, { "findings": [ ... ] }. ${refRule(ref)}. Return an empty findings array if the obligation is met.`,
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
	/** A cut call relation, judged once: both full rows in one call when they fit, else (or within a
	 *  refused size) one full row against the other's neighbour summary, in each direction. A cut
	 *  relation that is not a call (same file, same module) is not judged here: no calls. */
	const relationCall = (pair: readonly [ReviewAtom, ReviewAtom], maxChars?: number): { messages: LLMMessage[]; schema: StructuredSchema; execution: ExecutionMode; key: string }[] => {
		const material = args.material();
		const [caller, callee] = pair;
		if (!material.relations.some(r => r.kind === 'calls' && r.from === caller.id && r.to === callee.id)) return [];
		const key = `${caller.id}->${callee.id}`;
		const obligations = dimension === 'adherence' && material.obligations.length > 0
			? ['## The approved clauses and plan tasks either symbol may carry', '```json', JSON.stringify(material.obligations.map(o => ({ key: o.key, text: o.text })), null, 2), '```']
			: [];
		const build = (full: readonly ReviewAtom[], summarised: ReviewAtom | undefined): { messages: LLMMessage[]; schema: StructuredSchema; execution: ExecutionMode; key: string } => {
			const system = [
				chunk.framing,
				`This review was DIVIDED into chunks. You judge ONE call that crosses chunks: ${caller.label} calls ${callee.label}. Judge whether the caller's use matches the callee: the arguments it passes, how it uses the return value, and the callee's error contract.`,
				chunk.relation ?? '',
				`A mismatch is a finding located at the CALLER: \`file:line\` in its file, ${JSON.stringify(caller.file ?? caller.label)}, with its name, ${JSON.stringify((JSON.parse(caller.text) as { name?: string }).name ?? caller.id)}, in the message. Name a counterpart (counterpartRef) only as one of the two symbols. If the call matches, return an EMPTY findings array.`,
			].filter(x => x.length > 0).join('\n');
			const user = [
				...full.map(a => [`## ${a === caller ? 'The caller' : 'The callee'} (full structured summary): ${a.label}`, '```json', JSON.stringify(JSON.parse(a.text), null, 2), '```'].join('\n')),
				...(summarised !== undefined ? [`## ${summarised === caller ? 'The caller' : 'The callee'} (its one-line summary; it is held in another chunk)`, `- ${neighbourSummary(summarised, material)}`] : []),
				...obligations,
				'## Output',
				'Return today\'s findings shape, { "findings": [ ... ] }, each located in the caller\'s file. Return an empty findings array if the call matches.',
			].join('\n');
			return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema, execution, key };
		};
		// After a refusal s1 passes a size below the refused call's, so both rows never fit it again.
		const both = build([caller, callee], undefined);
		if (sentChars(both.messages) <= (maxChars ?? args.limitChars)) return [both];
		// One full row against the other's summary line, in each direction. A row that does not fit even so
		// is never cut: it is named as too large, as s1 names an atom no call can hold.
		const halves = [{ full: caller, call: build([caller], callee) }, { full: callee, call: build([callee], caller) }];
		const budget = maxChars ?? args.limitChars;
		for (const h of halves) {
			const chars = sentChars(h.call.messages);
			if (chars > budget) throw new AtomTooLargeError(`${h.full.label} (in the relation ${caller.label} calls ${callee.label})`, chars, budget);
		}
		return halves.map(h => h.call);
	};
	return {
		obligationCall,
		reduceCall,
		noteCapChars: Math.floor(args.limitChars / 4),
		notesFrom: chunkNotesFrom,
		validate: (answer, call) => [...obligationReasons(answer, call, args.material()), ...relationReasons(answer, call, args.material())],
		...(chunk.relation !== undefined ? { relationCall } : {}),
		partOf: (g: GatherAnswer): DimensionResult => ({
			dimension,
			findings: ((g.answer as { findings?: readonly Omit<DimensionFinding, 'dimension'>[] }).findings ?? []).map(f => ({ ...f, dimension })),
		}),
		merge: (parts: readonly DimensionResult[]): DimensionResult => args.finalize(mergeFindings(parts)),
	};
}
