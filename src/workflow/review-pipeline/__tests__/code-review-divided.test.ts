/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A divided code review end to end through runCodeReview (Epic 8315a11f s3, plan
 * task t8), against the same material reviewed in one call under a raised limit.
 *
 * The runner, its fold and record, the dimension specs, adapters and s1's driver
 * are production code. The judge slots mirror runDimensionJob with the test's
 * limit (the configured limit is read from ~/.insrc, which a test must not touch).
 * The model is scripted, and it judges only from what each call carries: markers
 * in the symbols' signatures (`@impl:<contract>`, `@fr:<id>`, `@breaks:<rule>`,
 * `@risk`, `@does:<what>`) and the test-record evidence in the call. The same
 * rules answer today's single prompt and the divided calls, so equal verdicts
 * mean the division lost nothing the single call saw.
 *
 * Run: npx tsx --test src/workflow/review-pipeline/__tests__/code-review-divided.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { adherenceSpec } from '../../code-review/dimensions/adherence.js';
import { conventionsSpec } from '../../code-review/dimensions/conventions.js';
import { coverageSpec } from '../../code-review/dimensions/coverage.js';
import { functionalCoverageSpec } from '../../code-review/dimensions/functional-coverage.js';
import { qualitySpec } from '../../code-review/dimensions/quality.js';
import { runCodeReview, type CodeReviewRunnerDeps, type JudgeSlot } from '../../code-review/runner.js';
import type { ChangedSymbolSummary, CodeReviewGrounding, CodeReviewSubject, DimensionResult } from '../../code-review/types.js';
import { codeReviewSnapshot, modelDimensionAdapter, type ModelDimensionSpec } from '../code-review.js';
import { runReviewJob } from '../driver.js';
import { promptChars } from '../envelope.js';
import { createReviewJob } from '../job.js';
import type { ReviewAdapter } from '../types.js';

// -- fixture ---------------------------------------------------------------------

const UNIT = "src/order/__tests__/order.test.ts: 'places an order'";
const SMOKE = 'Installed daemon: an order placed through the RPC is stored';
const CANCEL = "src/order/__tests__/cancel.test.ts: 'cancels an order'";

const LLD_BODY = {
	contractDetails: { surfaceLevel: 'internal', api: [{ name: 'placeOrder', signature: 'placeOrder(): Order' }, { name: 'cancelOrder', signature: 'cancelOrder(): void' }] },
	dataModelChanges: [], interactionWithShared: [],
	errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
	functionalDefinition: { requirements: [{ id: 'FR1', statement: 'A customer can place an order.', scope: 'doc' }, { id: 'FR2', statement: 'A placed order can be cancelled.', scope: 'doc' }] },
};
const PLAN_BODY = { tasks: [{ id: 't1', title: 'Orders', tests: [{ level: 'unit', name: UNIT }, { level: 'smoke', name: SMOKE }, { level: 'unit', name: CANCEL }] }] };
const RECORD = { meta: {}, body: { tasks: [
	{ taskId: 't1', ranAt: '2026-10-20T10:00:00.000Z', files: [{ file: 'src/order/__tests__/order.test.ts', titles: [{ title: 'places an order', result: 'pass' }], exitCode: 0, timedOut: false }], tests: [{ name: SMOKE, reported: { result: 'pass', evidence: 'docs/smoke.txt' } }] },
] } };

const FILES = ['src/order/order.ts', 'src/order/cancel.ts', 'src/basket/basket.ts', 'src/basket/empty.ts', 'src/price/price.ts', 'src/price/discount.ts'];
const subject = (over: Partial<CodeReviewSubject> = {}): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', changedFiles: FILES,
	approvedLld:  { meta: { epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', epicSlug: 'orders', createdAt: '2026-10-20T00:00:00.000Z', epicCreatedAt: '2026-10-20T00:00:00.000Z' }, body: LLD_BODY } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: PLAN_BODY } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord:  { body: { tasks: [{ id: 't1', passed: true }] } } as unknown as CodeReviewSubject['buildRecord'],
	testRecord:   RECORD as unknown as CodeReviewSubject['testRecord'],
	...over,
});
const sym = (name: string, file: string, markers: string, callees: string[] = [], chars = 2_500): ChangedSymbolSummary =>
	({ entityId: `id-${name}`, file, kind: 'function', name, signature: `${name}() /* ${markers} */ ${'p'.repeat(chars)}`, callers: [], callees, testsReaching: [] });
/** cancelOrder and discount do the same thing in different directories; cancelOrder implements no contract; discount breaks a rule; price is risky. */
const GROUNDING: CodeReviewGrounding = { symbols: [
	sym('placeOrder', 'src/order/order.ts', '@impl:placeOrder @fr:FR1 @does:places', ['fill'], 5_500),
	sym('cancelOrder', 'src/order/cancel.ts', '@does:totals'),
	sym('fill', 'src/basket/basket.ts', '@does:fills', [], 5_500),
	sym('empty', 'src/basket/empty.ts', '@does:empties'),
	sym('price', 'src/price/price.ts', '@risk @does:prices'),
	sym('discount', 'src/price/discount.ts', '@breaks:logger-not-console @does:totals'),
] };
const SMALL = 14_000;
const RAISED = 384_000;

// -- judge slots: runDimensionJob's steps with the test's limit -----------------------

const SPECS = [['adherence', adherenceSpec], ['conventions', conventionsSpec], ['coverage', coverageSpec], ['quality', qualitySpec], ['functional-coverage', functionalCoverageSpec]] as const;
function deps(limit: number, grounding: CodeReviewGrounding, written: string[]): CodeReviewRunnerDeps {
	const judges: JudgeSlot[] = SPECS.map(([dimension, spec]) => ({
		dimension,
		judge: async (s, g, provider, ctx) => {
			const snapshot = ctx?.snapshot ?? codeReviewSnapshot(s, g, ctx?.groundingMode ?? 'full');
			const adapter = modelDimensionAdapter((spec as (x: CodeReviewSubject) => ModelDimensionSpec<unknown>)(s), s, snapshot, limit) as unknown as ReviewAdapter<unknown>;
			return await runReviewJob(createReviewJob(adapter, 'daemon', snapshot, limit), adapter, provider, { signal: ctx?.signal }) as DimensionResult;
		},
	}));
	return { judges, assembleGrounding: async () => grounding, write: (path: string) => { written.push(path); } };
}

// -- the scripted model ----------------------------------------------------------------

interface Sym { entityId: string; name: string; file: string; signature: string }
const text = (messages: readonly LLMMessage[]): string => messages.map(m => m.content as string).join('\n');
const blocks = (s: string): unknown[] => [...s.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => JSON.parse(m[1]!) as unknown);
function symbolsIn(value: unknown, out: Sym[] = []): Sym[] {
	if (Array.isArray(value)) { for (const v of value) symbolsIn(v, out); return out; }
	if (value !== null && typeof value === 'object') {
		const o = value as Record<string, unknown>;
		if (typeof o['entityId'] === 'string' && typeof o['signature'] === 'string') out.push(o as unknown as Sym);
		else for (const v of Object.values(o)) symbolsIn(v, out);
	}
	return out;
}
const marked = (s: Sym, marker: string): boolean => s.signature.includes(marker);
const doesOf = (s: Sym): string => /@does:(\w+)/.exec(s.signature)?.[1] ?? s.name;
const AT = 'src/order/order.ts:1';

/** A promised test is met when the evidence shows it passing: a reported pass, or a passing file that names it. */
function testMet(name: string, reported: readonly { name: string; result: string }[], files: readonly { file: string; state: string; titles: { title: string }[] }[]): boolean {
	if (reported.some(r => r.name === name && r.result === 'pass')) return true;
	const m = /^(\S+): '(.*)'$/.exec(name);
	return files.some(f => f.state === 'passing' && (f.file === m?.[1] || f.titles.some(t => t.title === m?.[2])));
}

const contractFinding = (name: string) => ({ severity: 'HIGH', location: AT, message: `${name} is not implemented` });
const frFinding = (id: string) => ({ severity: 'HIGH', location: AT, message: `${id} is not realized`, expectationRef: id, confidence: 'breach' });
const testFinding = (name: string) => ({ severity: 'HIGH', location: AT, message: `${name} is missing`, findingKind: 'promised-test', expectationRef: name, confidence: 'breach' });
const breachFinding = (s: Sym, rule: string) => ({ severity: 'MED', location: `${s.file}:1`, message: `${s.name} breaks ${rule}`, expectationRef: rule, confidence: 'breach' });
const riskFinding = (s: Sym) => ({ severity: 'MED', location: `${s.file}:1`, message: `${s.name} carries a risk`, confidence: 'breach' });
const dupFinding = (a: Sym, b: Sym) => ({ severity: 'MED', location: `${a.file}:1`, message: `${[a.name, b.name].sort().join(' and ')} duplicate logic`, counterpartRef: b.name, confidence: 'breach' });

interface Judged { answer: (messages: readonly LLMMessage[]) => unknown; sent: { kind: string; chars: number }[] }

function scriptedModel(opts: { failObligationTwice?: boolean } = {}): Judged {
	const sent: { kind: string; chars: number }[] = [];
	const failures = new Map<string, number>();
	const answer = (messages: readonly LLMMessage[]): unknown => {
		const all = text(messages);
		const system = messages[0]!.content as string;
		const kind =
			system.includes('You condense evidence notes') ? 'reduce'
			: system.includes('You judge ONE obligation, once') ? 'obligation'
			: system.includes('You judge ONE call that crosses chunks') ? 'relation'
			: system.includes('looking for DUPLICATED LOGIC across a divided review') ? 'compare'
			: system.includes('DUPLICATE logic') ? 'pair'
			: system.includes('This review is DIVIDED: you are given ONE part') ? 'chunk'
			: 'single';
		sent.push({ kind, chars: promptChars(messages) });
		const dim = system.includes('FUNCTIONAL COVERAGE') ? 'fc' : system.includes('ADHERENCE') ? 'adherence' : system.includes('CONVENTIONS') ? 'conventions' : system.includes('COVERAGE') ? 'coverage' : 'quality';
		const syms = symbolsIn(blocks(all));
		switch (kind) {
			case 'reduce': return { text: 'condensed' };
			case 'chunk': {
				const user = messages[1]!.content as string;
				const rows = symbolsIn(blocks(user.slice(user.indexOf('## The changed symbols in this chunk'))));
				const obligations = (user.includes('## Obligations') ? blocks(user)[0] : []) as { key: string; text: string }[];
				if (dim === 'quality') return { findings: rows.filter(s => marked(s, '@risk')).map(riskFinding), descriptions: rows.map(s => ({ atomId: s.entityId, description: `it ${doesOf(s)}` })) };
				if (dim === 'coverage') return { findings: [], notes: [] };
				const notes = obligations.flatMap(o => rows.flatMap(s => {
					const contract = /^LLD contract \d+: (\w+)/.exec(o.text)?.[1];
					if (dim === 'adherence' && contract !== undefined && marked(s, `@impl:${contract}`)) return [{ key: o.key, atomIds: [s.entityId], note: `${s.name} @impl:${contract}` }];
					if (dim === 'fc' && o.key.startsWith('fr:') && marked(s, `@fr:${o.key.slice(3)}`)) return [{ key: o.key, atomIds: [s.entityId], note: `${s.name} @fr:${o.key.slice(3)}` }];
					const rule = /@breaks:([\w-]+)/.exec(s.signature)?.[1];
					if (dim === 'conventions' && o.key === `module:${s.file.slice(0, s.file.lastIndexOf('/'))}` && rule !== undefined) return [{ key: o.key, atomIds: [s.entityId], note: `${s.name} breaks ${rule}` }];
					return [];
				}));
				return { notes };
			}
			case 'obligation': {
				const o = blocks(messages[1]!.content as string)[0] as { key: string; kind: string; text: string };
				// The cancelOrder clause's judgement answers at a note id, on its call and on its one re-issue.
				if (opts.failObligationTwice === true && dim === 'adherence' && o.text.includes('cancelOrder') && (failures.get(o.key) ?? 0) < 2) {
					failures.set(o.key, (failures.get(o.key) ?? 0) + 1);
					return { findings: [{ ...contractFinding('cancelOrder'), location: 'n1' }] };
				}
				const notes = all.slice(all.indexOf('## Evidence notes from the chunks'));
				if (dim === 'adherence') {
					const contract = /^LLD contract \d+: (\w+)/.exec(o.text)?.[1];
					return { findings: contract !== undefined && !notes.includes(`@impl:${contract}`) ? [contractFinding(contract)] : [] };
				}
				if (dim === 'fc') return { findings: notes.includes(`@fr:${o.key.slice(3)}`) ? [] : [frFinding(o.key.slice(3))] };
				if (dim === 'coverage') {
					const name = o.key.slice('test:'.length);
					const ctx = [...all.matchAll(/### [^\n]+\n(\{[\s\S]*?\n\})/g)].map(m => JSON.parse(m[1]!) as Record<string, unknown>);
					const reported = ctx.filter(c => typeof c['name'] === 'string' && typeof c['result'] === 'string') as unknown as { name: string; result: string }[];
					const files = ctx.filter(c => typeof c['file'] === 'string' && typeof c['state'] === 'string') as unknown as { file: string; state: string; titles: { title: string }[] }[];
					return { findings: testMet(name, reported, files) ? [] : [testFinding(name)] };
				}
				// conventions: each breach a chunk noted, located at the symbol the note names.
				const named = new Map([...all.matchAll(/^- (id-\w+): ([^#\n]+)#(\w+)$/gm)].map(m => [m[3]!, m[2]!] as const));
				return { findings: [...notes.matchAll(/(\w+) breaks ([\w-]+)/g)].map(m => breachFinding({ entityId: '', name: m[1]!, file: named.get(m[1]!) ?? '', signature: '' }, m[2]!)) };
			}
			case 'relation': {
				const caller = /located at the CALLER: `file:line` in its file, "([^"]+)", with its name, "([^"]+)"/.exec(system);
				// Quality judges the call's contract; adherence's relation check finds no approved clause broken here.
				const disagree = dim === 'quality' && all.includes('Basket | undefined') && all.includes('reads fill(basket).total');
				return { findings: disagree && caller !== null ? [{ severity: 'HIGH', location: `${caller[1]}:1`, message: `${caller[2]} reads .total from fill, which may return undefined`, counterpartRef: 'fill', confidence: 'breach' }] : [] };
			}
			case 'compare': {
				const [first, second] = blocks(messages[1]!.content as string) as { atomId: string; description: string }[][];
				return { candidates: first!.flatMap(a => second!.filter(b => b.description === a.description).map(b => ({ a: a.atomId, b: b.atomId, why: 'same description' }))) };
			}
			case 'pair': {
				const [a, b] = [/named (\S+)#(\w+) and/.exec(system)!, /and (\S+)#(\w+) as possible duplicates/.exec(system)!];
				const pa = { entityId: '', name: a[2]!, file: a[1]!, signature: '' }, pb = { entityId: '', name: b[2]!, file: b[1]!, signature: '' };
				return { findings: [dupFinding(pa, pb)] };
			}
			default: {
				// Today's single prompt, judged by the same rules over the whole material.
				if (dim === 'adherence') return { findings: LLD_BODY.contractDetails.api.map(c => c.name).filter(n => !syms.some(s => marked(s, `@impl:${n}`))).map(contractFinding) };
				if (dim === 'fc') return { findings: ['FR1', 'FR2'].filter(id => !syms.some(s => marked(s, `@fr:${id}`))).map(frFinding) };
				if (dim === 'conventions') return { findings: syms.flatMap(s => { const r = /@breaks:([\w-]+)/.exec(s.signature)?.[1]; return r !== undefined ? [breachFinding(s, r)] : []; }) };
				if (dim === 'coverage') {
					const view = (blocks(all).find(b => b !== null && typeof b === 'object' && 'files' in (b as object)) ?? { files: [], reportedTests: [] }) as { files: { file: string; state: string; titles: { title: string }[] }[]; reportedTests?: { name: string; result: string }[] };
					return { findings: [UNIT, SMOKE, CANCEL].filter(n => !testMet(n, view.reportedTests ?? [], view.files)).map(testFinding) };
				}
				const dups = syms.flatMap((a, i) => syms.slice(i + 1).filter(b => doesOf(a) === doesOf(b)).map(b => dupFinding(a, b)));
				return { findings: [...syms.filter(s => marked(s, '@risk')).map(riskFinding), ...dups] };
			}
		}
	};
	return { answer, sent };
}

function provider(model: Judged): LLMProvider {
	return {
		completeStructured: async (messages: LLMMessage[], _schema: StructuredSchema) => {
			const callId = /This request's id is "([^"]+)"/.exec(text(messages))![1]!;
			return { callId, answer: model.answer(messages) };
		},
	} as unknown as LLMProvider;
}

async function review(limit: number, opts: { grounding?: CodeReviewGrounding; subject?: CodeReviewSubject; model?: Judged; mode?: 'full' | 'degraded' } = {}) {
	const model = opts.model ?? scriptedModel();
	const written: string[] = [];
	const outcome = await runCodeReview(opts.subject ?? subject(), provider(model), { runId: 'r1', modelLabel: 'scripted', ...(opts.mode !== undefined ? { groundingMode: opts.mode } : {}) }, deps(limit, opts.grounding ?? GROUNDING, written));
	return { outcome, sent: model.sent, written };
}
type Dims = readonly (DimensionResult & { pipelineCalls?: Record<string, number> })[];
const dimsOf = (o: Awaited<ReturnType<typeof review>>['outcome']): Dims => {
	assert.ok(o.ok, o.ok ? '' : o.error);
	return (o as { artifact: { body: { dimensions: Dims } } }).artifact.body.dimensions;
};
const verdicts = (dims: Dims): Record<string, string[]> => Object.fromEntries(dims.map(d => [d.dimension, d.findings.map(f => f.message).sort()]));

// -- tests ----------------------------------------------------------------------------

test('a divided review and the same material in one call under a raised limit give the same obligation verdicts for every dimension, on fixtures that fit both ways', async () => {
	const one = await review(RAISED);
	const many = await review(SMALL);
	assert.ok(one.sent.every(c => c.kind === 'single'), 'under the raised limit: today\'s single calls only');
	for (const kind of ['chunk', 'obligation', 'compare', 'pair']) assert.ok(many.sent.some(c => c.kind === kind), `the small limit divides: ${kind} calls made`);
	const single = verdicts(dimsOf(one.outcome));
	const divided = verdicts(dimsOf(many.outcome));
	assert.deepEqual(divided, single, 'the same verdicts per dimension');
	// And the verdicts are not empty: each dimension found what the fixture plants.
	assert.deepEqual(single['adherence'], ['cancelOrder is not implemented']);
	assert.deepEqual(single['functional-coverage'], ['FR2 is not realized']);
	assert.deepEqual(single['coverage'], [`${CANCEL} is missing`]);
	assert.deepEqual(single['conventions'], ['discount breaks logger-not-console']);
	assert.deepEqual(single['quality'], ['cancelOrder and discount duplicate logic', 'price carries a risk']);
	// The same verdict too.
	assert.equal((many.outcome as { artifact: { body: { verdict: string } } }).artifact.body.verdict, (one.outcome as { artifact: { body: { verdict: string } } }).artifact.body.verdict);
	// Every call the divided review sent fits the limit; the divided dimensions record their calls.
	for (const c of many.sent) assert.ok(c.chars <= SMALL, `a ${c.kind} call of ${c.chars}`);
	assert.ok(dimsOf(many.outcome).every(d => d.pipelineCalls !== undefined), 'pipelineCalls on every divided dimension');
	assert.ok(dimsOf(one.outcome).every(d => d.pipelineCalls === undefined), 'none on one call');
});

test('a caller and callee in different chunks whose contract disagrees are judged in a relation call and the mismatch is reported at the caller', async () => {
	const g: CodeReviewGrounding = { symbols: GROUNDING.symbols.map(s =>
		s.entityId === 'id-fill' ? { ...s, signature: `fill(basket: Basket): Basket | undefined /* @does:fills */ ${'p'.repeat(5_400)}` }
		: s.entityId === 'id-placeOrder' ? { ...s, signature: `placeOrder(basket: Basket): Order /* @impl:placeOrder @fr:FR1 @does:places reads fill(basket).total directly */ ${'p'.repeat(5_400)}` }
		: s) };
	const { outcome, sent } = await review(SMALL, { grounding: g });
	assert.ok(sent.some(c => c.kind === 'relation'), 'judged in a relation call');
	const quality = dimsOf(outcome).find(d => d.dimension === 'quality')!;
	const mismatch = quality.findings.find(f => /reads \.total from fill/.test(f.message))!;
	assert.ok(mismatch !== undefined, 'reported');
	assert.equal(mismatch.location, 'src/order/order.ts:1', 'at the caller');
	assert.match(mismatch.message, /^placeOrder /);
	for (const c of sent) assert.ok(c.chars <= SMALL);
});

test('two duplicate symbols in different chunks are named by compare and reported by pair with counterpartRef', async () => {
	const { outcome, sent } = await review(SMALL);
	assert.ok(sent.some(c => c.kind === 'compare') && sent.some(c => c.kind === 'pair'), 'named by compare, judged by pair');
	const quality = dimsOf(outcome).find(d => d.dimension === 'quality')!;
	const dup = quality.findings.find(f => f.message === 'cancelOrder and discount duplicate logic')!;
	assert.ok(dup !== undefined, 'reported');
	assert.ok(['cancelOrder', 'discount'].includes(dup.counterpartRef!), `with counterpartRef: ${dup.counterpartRef}`);
	assert.ok(['src/order/cancel.ts:1', 'src/price/discount.ts:1'].includes(dup.location), 'located at one of the two');
	assert.ok(quality.pipelineCalls!['relation']! >= 2, 'compare and pair counted under relation');
});

test('a degraded review whose single call is over the limit is divided with zero atoms and judges every promised test at gather on its full record evidence', async () => {
	// A record large enough that today's coverage call does not fit: unrelated passing files.
	const big = structuredClone(RECORD) as { body: { tasks: { files: unknown[] }[] } };
	big.body.tasks[0]!.files.push(...Array.from({ length: 80 }, (_, i) => ({ file: `src/other/__tests__/o${i}.test.ts`, titles: [{ title: `other ${i} ${'t'.repeat(120)}`, result: 'pass' }], exitCode: 0, timedOut: false })));
	const s = subject({ testRecord: big as unknown as CodeReviewSubject['testRecord'] });
	const model = scriptedModel();
	const { outcome } = await review(SMALL, { subject: s, mode: 'degraded', model });
	const coverage = dimsOf(outcome).find(d => d.dimension === 'coverage')!;
	assert.deepEqual(coverage.pipelineCalls, { chunk: 0, obligation: 3, relation: 0, merge: 0 }, 'divided with zero atoms: one judgement per promised test, no chunk');
	// Each judgement saw that test's evidence: the reported smoke pass and the passing unit file are met; CANCEL is missing.
	assert.deepEqual(coverage.findings.map(f => f.message), [`${CANCEL} is missing`]);
	assert.ok(coverage.findings.every(f => f.findingKind === 'promised-test'), 'nothing reported as symbol coverage');
	assert.equal((outcome as { artifact: { body: { groundingMode: string } } }).artifact.body.groundingMode, 'degraded');
});

test('a gather call failing twice fails the review and records nothing', async () => {
	// An adherence obligation answered at a note id twice: re-asked once, then the review fails.
	const { outcome, written, sent } = await review(SMALL, { model: scriptedModel({ failObligationTwice: true }) });
	assert.equal(outcome.ok, false);
	assert.match((outcome as { error: string }).error, /invalid-answer/);
	assert.deepEqual(written, [], 'nothing recorded');
	assert.ok(sent.filter(c => c.kind === 'obligation').length >= 2);
	assert.match((outcome as { error: string }).error, /not located at `file:line`/, 'failed on the location rule, after its one re-issue');
});
