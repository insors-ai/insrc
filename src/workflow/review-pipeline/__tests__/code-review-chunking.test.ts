/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The code review's material through s1's prepare (Epic 8315a11f s2/t3): the
 * real code-review adapter (its material and neighbour summaries) planned
 * against a small limit. A dimension's real chunk prompt is Story s3's, so the
 * chunk call here is a fixture that renders a chunk's rows in the prompt's array
 * form, a context block and the neighbour lines, as s3's will.
 *
 * Run: npx tsx --test src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildQualityPrompt, qualitySpec, QUALITY_FINDINGS_SCHEMA } from '../../code-review/dimensions/quality.js';
import type { ChangedSymbolSummary, CodeReviewGrounding, CodeReviewSubject } from '../../code-review/types.js';
import { neighbourSummary } from '../adapters/code-review-material.js';
import { codeReviewSnapshot, modelDimensionAdapter } from '../code-review.js';
import { promptChars } from '../envelope.js';
import { createReviewJob } from '../job.js';
import { AtomTooLargeError } from '../pack-into-batches.js';
import type { ReviewAdapter, ReviewChunk, ReviewPipelineJob } from '../types.js';

const subject: CodeReviewSubject = {
	repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', changedFiles: [],
	approvedLld: null, approvedPlan: null, buildRecord: null,
};
const row = (entityId: string, file: string, sigChars: number, callees: string[] = []): ChangedSymbolSummary =>
	({ entityId, file, kind: 'function', name: entityId, signature: `${entityId}(${'p'.repeat(sigChars)})`, callers: [], callees, testsReaching: [] });
const grounding = (...symbols: ChangedSymbolSummary[]): CodeReviewGrounding => ({ symbols });

/** The real quality adapter, its chunk call a fixture: context, the chunk's rows as a JSON array, its neighbour lines. */
function adapterFor(g: CodeReviewGrounding, contextChars = 300): { adapter: ReviewAdapter<unknown>; snapshot: ReturnType<typeof codeReviewSnapshot> } {
	const snapshot = codeReviewSnapshot(subject, g);
	const base = modelDimensionAdapter(qualitySpec(subject), subject, snapshot) as unknown as ReviewAdapter<unknown>;
	const material = base.material();
	const rows = (chunk: ReviewChunk): unknown[] => chunk.atomIds.map(id => JSON.parse(material.atoms.find(a => a.id === id)!.text));
	const context = `Judge the quality of these changed symbols. ${'c'.repeat(contextChars)}`;
	return {
		snapshot,
		adapter: {
			...base,
			stagesFor: path => base.stagesFor(path).map(s => ({
				...s,
				chunkCalls: (chunk: ReviewChunk) => [{
					messages: [
						{ role: 'system' as const, content: context },
						{ role: 'user' as const, content: ['## Changed symbols', JSON.stringify(rows(chunk), null, 2), '## Held in other chunks', ...chunk.neighbours.map(n => `- ${n.summary} (in ${n.heldInChunk})`)].join('\n') },
					],
					schema: QUALITY_FINDINGS_SCHEMA, execution: { mode: 'structured' as const, cwd: '/repo' },
				}],
			})),
		},
	};
}

const plan = (g: CodeReviewGrounding, limit: number, contextChars?: number): ReviewPipelineJob => {
	const { adapter, snapshot } = adapterFor(g, contextChars);
	return createReviewJob(adapter, 'daemon', snapshot, limit);
};
const chunkOf = (job: ReviewPipelineJob, id: string): ReviewChunk => job.plan.chunks.find(c => c.atomIds.includes(id))!;
const LIMIT = 8_000;

test('over the limit, symbols that call each other share a chunk before symbols that only share a file, and those before symbols that only share a directory', () => {
	// One directory, two files: a, b in f1; c, d in f2. a calls e, in another directory.
	// The whole group does not fit; calls + same-file groups ({a, b, e} and {c, d}) do.
	const g = grounding(row('a', 'src/d/f1.ts', 1_500, ['e']), row('b', 'src/d/f1.ts', 1_500), row('c', 'src/d/f2.ts', 1_500), row('d', 'src/d/f2.ts', 1_500), row('e', 'src/e/g.ts', 1_500));
	const job = plan(g, LIMIT);
	assert.equal(job.plan.single, false, 'divided');
	assert.equal(chunkOf(job, 'a').id, chunkOf(job, 'e').id, 'a calls e across directories: kept together');
	assert.equal(chunkOf(job, 'a').id, chunkOf(job, 'b').id, 'a and b share a file');
	assert.equal(chunkOf(job, 'c').id, chunkOf(job, 'd').id, 'c and d share a file');
	assert.notEqual(chunkOf(job, 'a').id, chunkOf(job, 'c').id, 'the directory, the weakest bond, is the one cut');
});

test('a call relation cut between two chunks gives each chunk a neighbour summary of the other symbol', () => {
	// x calls y calls z, each in its own directory: the call group does not fit, so a call relation is cut.
	const g = grounding(row('x', 'src/x/x.ts', 2_800, ['y']), row('y', 'src/y/y.ts', 2_800, ['z']), row('z', 'src/z/z.ts', 2_800));
	const job = plan(g, LIMIT);
	const material = adapterFor(g).adapter.material();
	const atom = (id: string) => material.atoms.find(a => a.id === id)!;
	const cut = job.plan.crossRelations.filter(r => r.kind === 'calls');
	assert.ok(cut.length >= 1, 'a call relation is cut');
	for (const r of cut) {
		const from = chunkOf(job, r.from), to = chunkOf(job, r.to);
		assert.deepEqual(from.neighbours.filter(n => n.atomId === r.to).map(n => [n.summary, n.heldInChunk]), [[neighbourSummary(atom(r.to), material), to.id]]);
		assert.deepEqual(to.neighbours.filter(n => n.atomId === r.from).map(n => [n.summary, n.heldInChunk]), [[neighbourSummary(atom(r.from), material), from.id]]);
		// And the call a chunk sends carries the line.
		const sent = job.pending.find(c => c.carries.chunkId === from.id)!;
		assert.ok((sent.messages[1]!.content as string).includes(neighbourSummary(atom(r.to), material)));
	}
});

test('every changed symbol is whole in exactly one chunk and every chunk fits the limit', () => {
	const rows = Array.from({ length: 24 }, (_, i) => row(`s${i}`, `src/m${i % 4}/f${i % 7}.ts`, 400 + (i * 97) % 900, i % 5 === 0 ? [`s${(i + 3) % 24}`] : []));
	const g = grounding(...rows);
	const job = plan(g, LIMIT);
	assert.equal(job.plan.single, false);
	assert.deepEqual(job.plan.chunks.flatMap(c => c.atomIds).sort(), rows.map(r => r.entityId).sort(), 'each symbol in exactly one chunk');
	for (const r of rows) {
		const whole = JSON.stringify(r, null, 2).split('\n').map(l => l.trim()).filter(l => l.includes('"signature"'))[0]!;
		const holders = job.pending.filter(c => (c.messages[1]!.content as string).includes(whole));
		assert.equal(holders.length, 1, `${r.entityId} is read whole in exactly one call`);
	}
	for (const c of job.pending) assert.ok(c.chars <= LIMIT, `a ${c.chars}-character call`);
});

test('a summary larger than the limit on its own raises AtomTooLargeError naming its file#name', () => {
	const g = grounding(row('small', 'src/a/a.ts', 300), row('huge', 'src/big/huge.ts', 9_000), row('other', 'src/a/b.ts', 300));
	assert.throws(() => plan(g, LIMIT), (e: unknown) => e instanceof AtomTooLargeError && e.message.includes('src/big/huge.ts#huge'));
});

test('under the limit the plan is one chunk and the dimension prompt is unchanged', () => {
	const g = grounding(row('a', 'src/d/f1.ts', 200, ['b']), row('b', 'src/d/f2.ts', 200));
	const job = plan(g, 384_000);
	assert.equal(job.plan.single, true);
	assert.equal(job.pending.length, 1);
	assert.equal(job.pending[0]!.role, 'single');
	assert.deepEqual(job.pending[0]!.prompt.messages, buildQualityPrompt(subject, g, undefined), "today's prompt, byte for byte");
	assert.deepEqual(job.plan.chunks, [], 'no chunk plan, no neighbour lines');
});

test('every rendered chunk call, with array formatting, neighbours, context and envelope, measures within limitChars', () => {
	const g = grounding(row('x', 'src/x/x.ts', 2_800, ['y']), row('y', 'src/y/y.ts', 2_800, ['z']), row('z', 'src/z/z.ts', 2_800), row('w', 'src/y/w.ts', 1_200));
	const job = plan(g, LIMIT);
	assert.ok(job.pending.length >= 2);
	for (const c of job.pending) {
		assert.equal(c.chars, promptChars(c.messages), 'measured on the call as sent');
		assert.ok(c.chars <= LIMIT, `a ${c.chars}-character call`);
		const user = c.messages[1]!.content as string;
		assert.ok(user.includes('[\n  {\n    "entityId"'), 'the rows in the prompt\'s array form');
		assert.ok((c.messages[0]!.content as string).startsWith('Judge the quality'), 'the context');
		assert.ok(user.includes('## Held in other chunks'));
		assert.ok((c.messages.at(-1)!.content as string).includes(c.callId), 'the envelope');
	}
	assert.ok(job.pending.some(c => (c.messages[1]!.content as string).includes(' (in c')), 'some call carries neighbour lines');
});

test('a row whose JSON fits the limit but whose rendered singleton call does not raises AtomTooLargeError before any provider call', () => {
	const big = row('wide', 'src/w/wide.ts', 6_300);
	assert.ok(JSON.stringify(big).length < LIMIT, 'the row alone fits');
	// A large context makes the call holding it alone too large. No provider exists here: the error comes at prepare.
	assert.throws(() => plan(grounding(row('a', 'src/a/a.ts', 300), big), LIMIT, 2_000), (e: unknown) => e instanceof AtomTooLargeError && e.message.includes('src/w/wide.ts#wide'));
});

test('an atom whose singleton call with neighbour summaries exceeds the limit, but fits once its related atoms share the chunk, is packed and not reported as too large', () => {
	// hub fills most of a call; 25 small symbols share its directory, so alone it would carry 25 neighbour lines.
	const mates = Array.from({ length: 25 }, (_, i) => row(`m${i}`, `src/hub/m${i}.ts`, 20));
	const hub = row('hub', 'src/hub/hub.ts', 5_000);
	const g = grounding(hub, ...mates);
	const { adapter } = adapterFor(g);
	const material = adapter.material();
	const lines = mates.map(m => neighbourSummary(material.atoms.find(a => a.id === m.entityId)!, material)).join('\n').length;
	assert.ok(JSON.stringify(hub, null, 2).length + lines > LIMIT - 1_000, 'with every neighbour line the hub would not fit');
	const job = plan(g, LIMIT);
	const holder = chunkOf(job, 'hub');
	assert.ok(holder !== undefined, 'packed, not reported as too large');
	assert.ok(holder.chars <= LIMIT);
	assert.ok(job.pending.every(c => c.chars <= LIMIT));
	assert.deepEqual(job.plan.chunks.flatMap(c => c.atomIds).sort(), g.symbols.map(s => s.entityId).sort());
});
