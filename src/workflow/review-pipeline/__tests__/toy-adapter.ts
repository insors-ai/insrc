/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test fixtures for the review pipeline: a toy adapter built only from its
 * snapshot, a model that answers from what each prompt holds, and a serial
 * test driver over the pure step functions.
 */

import { InputTooLargeError } from '../../../agent/providers/cli-provider.js';
import type { LLMMessage, StructuredSchema } from '../../../shared/types.js';
import { applyFailure, applyOutput, nextCalls, runStage } from '../job.js';
import type {
	AdapterStage, EvidenceNote, ExecutionMode, FailurePolicy, GatherAnswer, NeighbourSummary, ReviewAdapter, ReviewAtom, ReviewCall, ReviewMaterialSnapshot,
	ReviewPipelineJob, ReviewRelation, StageAnswer,
} from '../types.js';

export const TOY_SCHEMA = {
	type: 'object', required: ['seen'], additionalProperties: false,
	properties: {
		seen: { type: 'array', items: { type: 'string' } },
		notes: { type: 'array', items: { type: 'object', required: ['key', 'text'], properties: { key: { type: 'string' }, text: { type: 'string' } } } },
	},
} as unknown as StructuredSchema;

export const atom = (i: number, size = 400, file = `src/f${i}.ts`, module = 'src'): ReviewAtom =>
	({ id: `a${i}`, label: `src/f${i}.ts#fn${i}`, text: `body-${i}-${'x'.repeat(size)}`, file, module });

/** An obligation: its key, or its key with the context atoms it names. */
export type ToyObligation = string | { readonly key: string; readonly atomIds: readonly string[] };

export function toySnapshot(atoms: readonly ReviewAtom[], relations: readonly ReviewRelation[] = [], obligations: readonly ToyObligation[] = [], context: readonly ReviewAtom[] = []): ReviewMaterialSnapshot {
	return { kind: 'code-review', documentText: JSON.stringify({ atoms, relations, obligations, context }) };
}

/** Today's single prompt for the toy review. */
export const todayMessages = (atoms: readonly ReviewAtom[]): LLMMessage[] => [
	{ role: 'system', content: 'Judge the whole Story.' },
	{ role: 'user', content: JSON.stringify(atoms.map(a => ({ id: a.id, text: a.text }))) },
];

export interface ToyOpts {
	readonly onCallFailure?: FailurePolicy | undefined;
	readonly validate?: AdapterStage['validate'] | undefined;
	readonly execution?: ExecutionMode | undefined;
	readonly deadlineMessage?: boolean | undefined;
	/** Give the adapter a gather plan whose note calls render the notes they carry. */
	readonly gatherLimit?: number | undefined;
	/** Calls relationCall returns per relation (absent: no relation checks). */
	readonly relationCalls?: 1 | 2 | undefined;
	/** Counts relationCall invocations. */
	readonly onRelationCall?: ((pair: readonly [ReviewAtom, ReviewAtom]) => void) | undefined;
}

export const RELATION_SCHEMA = { type: 'object', required: ['holds'], properties: { holds: { type: 'boolean' } } } as unknown as StructuredSchema;

export const NOTE_SCHEMA = { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } as unknown as StructuredSchema;
export const VERDICT_SCHEMA = { type: 'object', required: ['verdict'], properties: { verdict: { type: 'string' } } } as unknown as StructuredSchema;
const renderNotes = (key: string, notes: readonly EvidenceNote[]): string => JSON.stringify({ key, notes: notes.map(n => ({ noteId: n.noteId, text: n.text })) });

export interface ToyResult {
	readonly seen: readonly string[];
	readonly notJudged: readonly unknown[];
	readonly divided: boolean;
	readonly pipelineCalls?: unknown;
	/** The obligation and relation answers merged in, in merge order. */
	readonly gatheredParts?: readonly GatherAnswer[] | undefined;
}

/** One model stage, 'judge', reading the atoms in the snapshot's document text. */
export function toyAdapter(snapshot: ReviewMaterialSnapshot, opts: ToyOpts = {}): ReviewAdapter<ToyResult> {
	const { atoms, relations, obligations = [], context = [] } = JSON.parse(snapshot.documentText ?? '{"atoms":[],"relations":[]}') as { atoms: ReviewAtom[]; relations: ReviewRelation[]; obligations?: ToyObligation[]; context?: ReviewAtom[] };
	const byId = new Map(atoms.map(a => [a.id, a] as const));
	const material = {
		atoms, relations,
		obligations: obligations.map(o => typeof o === 'string'
			? { key: o, kind: 'clause' as const, text: `obligation ${o}` }
			: { key: o.key, kind: 'clause' as const, text: `obligation ${o.key}`, atomIds: o.atomIds }),
		...(context.length > 0 ? { context } : {}),
	};
	const execution = opts.execution ?? { mode: 'structured', cwd: '/repo' };
	const render = (ids: readonly string[], neighbours: readonly NeighbourSummary[]): string => JSON.stringify({
		atoms: ids.map(id => ({ id, text: byId.get(id)!.text })),
		neighbours: neighbours.map(n => ({ nid: n.atomId, summary: n.summary, heldIn: n.heldInChunk })),
	});
	const judge: AdapterStage = {
		id: 'judge', kind: 'model', after: [], onCallFailure: opts.onCallFailure ?? 'fail-review',
		singleCalls: () => [{ messages: todayMessages(atoms), schema: TOY_SCHEMA, execution }],
		chunkCalls: chunk => [{
			messages: [{ role: 'system', content: 'Judge these atoms; report only what you see.' }, { role: 'user', content: render(chunk.atomIds, chunk.neighbours) }],
			schema: TOY_SCHEMA, execution,
		}],
		...(opts.validate !== undefined ? { validate: opts.validate } : {}),
	};
	return {
		kind: 'code-review', dimension: 'quality',
		material: () => material,
		stagesFor: () => [judge],
		finish: (outputs, ctx) => ({
			seen: ((outputs['judge'] ?? []) as StageAnswer[]).flatMap(a => (a.answer as { seen: string[] }).seen),
			notJudged: ctx.notJudged, divided: ctx.divided,
		}),
		neighbourSummary: a => `summary of ${a.label}`,
		...(opts.gatherLimit !== undefined ? { gather: {
			obligationCall: (key, ev, ctx) => ({ messages: [{ role: 'system', content: 'Judge the obligation on this evidence.' }, { role: 'user', content: `${renderNotes(key, ev)}\n${JSON.stringify({ context: ctx.map(a => ({ contextId: a.id, text: a.text })) })}` }], schema: VERDICT_SCHEMA, execution }),
			reduceCall: (key, batch) => ({ messages: [{ role: 'system', content: 'Reduce this evidence to one note.' }, { role: 'user', content: renderNotes(key, batch) }], schema: NOTE_SCHEMA, execution }),
			noteCapChars: Math.floor(opts.gatherLimit / 4),
			notesFrom: (a: StageAnswer) => (a.answer as { notes?: { key: string; text: string }[] }).notes ?? [],
			...(opts.relationCalls !== undefined ? { relationCall: (pair: readonly [ReviewAtom, ReviewAtom]) => {
				opts.onRelationCall?.(pair);
				const one = (a: ReviewAtom, b: ReviewAtom, dir: string) => ({ messages: [{ role: 'system' as const, content: `Does ${a.id} use ${b.id} correctly (${dir})?` }, { role: 'user' as const, content: JSON.stringify({ a: a.text, b: b.text }) }], schema: RELATION_SCHEMA, execution });
				return opts.relationCalls === 1 ? [one(pair[0], pair[1], 'both')] : [one(pair[0], pair[1], 'forward'), one(pair[1], pair[0], 'backward')];
			} } : {}),
			partOf: (g: GatherAnswer): ToyResult => ({ seen: [], notJudged: [], divided: true, gatheredParts: [g] }),
			merge: (parts: readonly ToyResult[]): ToyResult => ({
				seen: parts.flatMap(p => p.seen), notJudged: parts[0]!.notJudged, divided: true, gatheredParts: parts.flatMap(p => p.gatheredParts ?? []),
			}),
		} } : {}),
		...(opts.deadlineMessage === true ? { deadlineError: (ms: number) => new Error(`The design review passed its time limit of ${ms / 60_000} minutes. No review was recorded.`) } : {}),
	};
}

/** The prompt as the CLI receives it (cli-provider serialiseMessages). */
export const asSent = (messages: readonly LLMMessage[]): string =>
	messages.map(m => (m.role === 'system' ? '## System\n' : '') + (m.content as string)).join('\n\n');

/** The call id the envelope instruction names. */
export const callIdIn = (messages: readonly LLMMessage[]): string => /This request's id is "([^"]+)"/.exec(asSent(messages))![1]!;

/** The atom ids a prompt holds (neighbour summaries name theirs under another key). */
export const atomIdsIn = (text: string): string[] => [...text.matchAll(/"id":"(a\d+)"/g)].map(m => m[1]!);

/** A model that sees the atoms in each prompt and echoes the call id; refuses prompts over `refuseOver`. */
export function seeingModel(refuseOver?: number, silent = false): { answer: (call: ReviewCall) => unknown; prompts: string[] } {
	const prompts: string[] = [];
	return {
		prompts,
		answer: (call: ReviewCall) => {
			const text = asSent(call.messages);
			prompts.push(text);
			if (refuseOver !== undefined && text.length > refuseOver) {
				throw new InputTooLargeError('too large', 'input_too_large', silent ? {} : { maxChars: refuseOver, actualChars: text.length });
			}
			return { callId: callIdIn(call.messages), answer: { seen: atomIdsIn(text) } };
		},
	};
}

/** Drive a job to the end serially, rebuilding the adapter from the job's snapshot every turn. */
export async function drive(
	job: ReviewPipelineJob, rebuild: (snapshot: ReviewMaterialSnapshot) => ReviewAdapter<unknown>, answer: (call: ReviewCall) => unknown,
): Promise<{ job: ReviewPipelineJob; sent: ReviewCall[] }> {
	const sent: ReviewCall[] = [];
	for (let guard = 0; job.phase !== 'done'; guard++) {
		if (guard > 10_000) throw new Error('drive: no progress');
		const adapter = rebuild(job.snapshot);
		const calls = nextCalls(job, adapter);
		if (calls.length === 0) { job = await runStage(job, adapter); continue; }
		const call = calls[0]!;
		sent.push(call);
		try {
			job = applyOutput(job, adapter, call.callId, await answer(call));
		} catch (err) {
			if (err instanceof InputTooLargeError) { job = applyFailure(job, adapter, call.callId, 'size-refusal', err.maxChars); continue; }
			throw err;
		}
	}
	return { job, sent };
}
