/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Quality's cross-chunk duplicate detection (Epic 8315a11f s3, plan task t6).
 *
 * In a divided review each quality chunk describes every symbol it holds (t3).
 * Two model stages follow the chunk stage, both issued per chunk by s1 and both
 * counted under pipelineCalls.relation (countAs):
 *
 *   compare  for a chunk, its descriptions against those of every symbol held in
 *            a LATER chunk, packed into batches of at most half of what the limit
 *            leaves beside the framing; every pair of batches is one call, which
 *            names candidate duplicates. So every two symbols in different chunks
 *            are compared exactly once.
 *   pair     for a chunk, each candidate whose first symbol it holds is judged on
 *            both full rows when they fit one call, else one full row against the
 *            other's description in each direction; it answers with today's
 *            quality findings, a duplication naming the other symbol in
 *            counterpartRef. A row that cannot fit even so is named, never cut.
 *
 * Under the limit the review is one call: neither stage makes a call.
 */

import type { LLMMessage, StructuredSchema } from '../../../shared/types.js';
import { envelopeMessages, promptChars } from '../envelope.js';
import { AtomTooLargeError, packIntoBatches } from '../pack-into-batches.js';
import type { AdapterStage, ChunkPrompt, ExecutionMode, ReviewAtom, ReviewCall, ReviewChunk, ReviewMaterial, StageAnswer, StageOutputs } from '../types.js';

/** A compare call's answer: candidate duplicates, `a` from the first list, `b` from the second. */
export const COMPARE_SCHEMA: StructuredSchema = {
	type: 'object', required: ['candidates'], additionalProperties: false,
	properties: {
		candidates: {
			type: 'array',
			items: {
				type: 'object', required: ['a', 'b', 'why'], additionalProperties: false,
				properties: { a: { type: 'string' }, b: { type: 'string' }, why: { type: 'string' } },
			},
		},
	},
};

export interface DuplicateStagesArgs {
	readonly material:   () => ReviewMaterial;
	readonly execution:  ExecutionMode;
	readonly limitChars: number;
	/** Today's quality findings schema: a pair call answers with it. */
	readonly schema:     StructuredSchema;
	/** The chunk stage's id, whose answers carry the descriptions. */
	readonly chunkStage: string;
}

interface Described { readonly atomId: string; readonly symbol: string; readonly description: string }

/** A call's size as sent, enveloped under an id of a real id's length. */
const sentChars = (messages: readonly LLMMessage[]): number => promptChars(envelopeMessages('00000000-0000-0000-0000-000000000000', messages));

/** A chunk id's place in the plan's order (c1 before c2 before c10). */
const order = (chunkId: string): number => Number.parseInt(chunkId.replace(/\D/g, ''), 10) || 0;

/** Each described symbol, with the chunk that described it. */
function descriptionsOf(prior: StageOutputs, stage: string, material: ReviewMaterial): Map<string, { readonly owner: string; readonly d: Described }> {
	const out = new Map<string, { owner: string; d: Described }>();
	for (const a of (prior[stage] ?? []) as readonly StageAnswer[]) {
		for (const d of (a.answer as { descriptions?: readonly { atomId: string; description: string }[] }).descriptions ?? []) {
			const atom = material.atoms.find(x => x.id === d.atomId);
			if (atom !== undefined && a.chunkId !== undefined) out.set(d.atomId, { owner: a.chunkId, d: { atomId: d.atomId, symbol: atom.label, description: d.description } });
		}
	}
	return out;
}

const nameOf = (a: ReviewAtom): string => (JSON.parse(a.text) as { name?: string }).name ?? a.id;
const fileOf = (location: string): string => { const i = location.indexOf(':'); return i >= 0 ? location.slice(0, i) : location; };
const fenced = (value: unknown): string => ['```json', JSON.stringify(value, null, 2), '```'].join('\n');

function compareCall(first: readonly Described[], second: readonly Described[], execution: ExecutionMode): ChunkPrompt {
	const system = [
		'You are an independent code reviewer looking for DUPLICATED LOGIC across a divided review: two changed symbols, held in different parts of the change, that do the same thing whatever their names.',
		'Compare every symbol in the first list with every symbol in the second, by what its description says it does. Name each likely duplicate as a candidate: `a` from the first list, `b` from the second, with a one-line reason. A candidate is checked afterwards on the full code, so name a plausible pair rather than miss one; return no candidates when no two do the same thing.',
		'Use only the atomIds listed.',
	].join('\n');
	const user = [
		'## First list', fenced(first),
		'## Second list', fenced(second),
		'## Output',
		'Return { "candidates": [ { "a": "<atomId from the first list>", "b": "<atomId from the second list>", "why": "..." } ] }.',
	].join('\n');
	return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema: COMPARE_SCHEMA, execution };
}

/** The two lists a compare call carried, read back from its own prompt. */
function compareLists(call: ReviewCall): { first: Set<string>; second: Set<string> } {
	const user = call.prompt.messages[1]?.content;
	const blocks = typeof user === 'string' ? [...user.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => JSON.parse(m[1]!) as Described[]) : [];
	return { first: new Set((blocks[0] ?? []).map(d => d.atomId)), second: new Set((blocks[1] ?? []).map(d => d.atomId)) };
}

export function compareStage(args: DuplicateStagesArgs): AdapterStage {
	return {
		id: 'compare', kind: 'model', after: [args.chunkStage], onCallFailure: 'fail-review', countAs: 'relation',
		// One call reviews the whole change: nothing to compare across.
		singleCalls: () => [],
		chunkCalls: (chunk: ReviewChunk, prior: StageOutputs) => {
			const material = args.material();
			const described = descriptionsOf(prior, args.chunkStage, material);
			const owners = chunk.atomIds.map(id => described.get(id)?.owner).filter((o): o is string => o !== undefined);
			if (owners.length === 0) return [];
			const mine = owners[0]!;
			const first = chunk.atomIds.flatMap(id => { const x = described.get(id); return x !== undefined ? [x.d] : []; });
			// Every symbol of a later chunk: each pair of chunks is compared once.
			const second = [...described.values()].filter(x => order(x.owner) > order(mine)).sort((p, q) => order(p.owner) - order(q.owner)).map(x => x.d);
			if (first.length === 0 || second.length === 0) return [];
			const overhead = sentChars(compareCall([], [], args.execution).messages);
			const half = Math.floor((args.limitChars - overhead) / 2);
			const size = (batch: readonly Described[]): number => JSON.stringify(batch, null, 2).length;
			const firsts = packIntoBatches(first, size, half, d => d.symbol);
			const seconds = packIntoBatches(second, size, half, d => d.symbol);
			return firsts.flatMap(a => seconds.map(b => compareCall(a, b, args.execution)));
		},
		validate: (answer: unknown, call: ReviewCall) => {
			if (call.role !== 'chunk') return [];
			const { first, second } = compareLists(call);
			const bad = ((answer as { candidates?: readonly { a: string; b: string }[] }).candidates ?? [])
				.flatMap((c, i) => first.has(c.a) && second.has(c.b) ? [] : [`candidates[${i}]`]);
			return bad.length > 0 ? [`${bad.length} candidates do not take \`a\` from the first list and \`b\` from the second (first: ${bad[0]})`] : [];
		},
	};
}

/** The pair a pair call judges, from its key. */
const pairOf = (key: string | undefined): readonly [string, string] | undefined => {
	const m = /^pair:(.+)\|(.+)$/.exec(key ?? '');
	return m === null ? undefined : [m[1]!, m[2]!];
};

export function pairStage(args: DuplicateStagesArgs): AdapterStage {
	const build = (full: readonly ReviewAtom[], described: { atom: ReviewAtom; description: string } | undefined, pair: readonly [ReviewAtom, ReviewAtom]): ChunkPrompt => {
		const [a, b] = pair;
		const system = [
			'You are an independent code reviewer judging QUALITY: whether two changed symbols held in different parts of a divided review DUPLICATE logic.',
			`A comparison of their descriptions named ${a.label} and ${b.label} as possible duplicates. Judge it on the code: if they do duplicate logic, report one finding located at \`file:line\` in the file of one of them, naming the other in counterpartRef; a matter of taste is LOW, a genuine duplication MED or HIGH as warranted. If they do not, return an EMPTY findings array.`,
			'Name only these two symbols.',
		].join('\n');
		const user = [
			...full.map(x => [`## ${x.label} (full structured summary)`, fenced(JSON.parse(x.text))].join('\n')),
			...(described !== undefined ? [`## ${described.atom.label} (its description; it is held in another part of the change)`, `- ${described.description}`] : []),
			'## Output',
			'Return { "findings": [ { "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "counterpartRef": "the other symbol", "confidence": "breach|observation" } ] }, or { "findings": [] }.',
		].join('\n');
		return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema: args.schema, execution: args.execution, key: `pair:${a.id}|${b.id}` };
	};
	return {
		id: 'pair', kind: 'model', after: ['compare'], onCallFailure: 'fail-review', countAs: 'relation',
		singleCalls: () => [],
		chunkCalls: (chunk: ReviewChunk, prior: StageOutputs) => {
			const material = args.material();
			const byId = new Map(material.atoms.map(x => [x.id, x] as const));
			const described = descriptionsOf(prior, args.chunkStage, material);
			const seen = new Set<string>();
			const calls: ChunkPrompt[] = [];
			for (const answer of (prior['compare'] ?? []) as readonly StageAnswer[]) {
				for (const c of (answer.answer as { candidates?: readonly { a: string; b: string }[] }).candidates ?? []) {
					if (!chunk.atomIds.includes(c.a) || seen.has(`${c.a}|${c.b}`)) continue;
					seen.add(`${c.a}|${c.b}`);
					const a = byId.get(c.a), b = byId.get(c.b);
					if (a === undefined || b === undefined) continue;
					const both = build([a, b], undefined, [a, b]);
					if (sentChars(both.messages) <= args.limitChars) { calls.push(both); continue; }
					// One full row against the other's description, in each direction; a row that cannot fit is named.
					for (const [full, other] of [[a, b], [b, a]] as const) {
						const half = build([full], { atom: other, description: described.get(other.id)?.d.description ?? other.label }, [a, b]);
						const chars = sentChars(half.messages);
						if (chars > args.limitChars) throw new AtomTooLargeError(`${full.label} (in the duplicate check of ${a.label} and ${b.label})`, chars, args.limitChars);
						calls.push(half);
					}
				}
			}
			return calls;
		},
		validate: (answer: unknown, call: ReviewCall) => {
			if (call.role !== 'chunk') return [];
			const ids = pairOf(call.carries.key);
			const material = args.material();
			const pair = (ids ?? []).map(id => material.atoms.find(x => x.id === id)).filter((x): x is ReviewAtom => x !== undefined);
			const names = new Set(pair.flatMap(x => [x.id, x.label, nameOf(x)]));
			const files = new Set(pair.flatMap(x => x.file !== undefined ? [x.file] : []));
			const findings = (answer as { findings?: readonly { location?: string; counterpartRef?: string }[] }).findings ?? [];
			// Every pair finding is a duplication, so it names the other symbol of the pair.
			const badCounterparts = findings.flatMap((f, i) => f.counterpartRef !== undefined && names.has(f.counterpartRef.trim()) ? [] : [`findings[${i}].counterpartRef`]);
			const badLocations = findings.flatMap((f, i) => files.has(fileOf(f.location ?? '')) ? [] : [`findings[${i}].location`]);
			const listed = pair.map(x => x.label).join(' and ');
			return [
				...(badCounterparts.length > 0 ? [`${badCounterparts.length} findings do not name the other symbol of the pair as counterpartRef (first: ${badCounterparts[0]}); name ${listed}`] : []),
				...(badLocations.length > 0 ? [`${badLocations.length} findings are located outside the two symbols judged (first: ${badLocations[0]}); locate it in the file of ${listed}`] : []),
			];
		},
	};
}
