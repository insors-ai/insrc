/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCodeReview, DEFAULT_DEPS, type CodeReviewRunnerDeps, type JudgeSlot, type CodeReviewProgress } from '../runner.js';
import type {
	CodeReviewGrounding,
	CodeReviewSubject,
	DimensionFinding,
	DimensionResult,
	ReviewDimension,
} from '../types.js';
import type { LLMProvider } from '../../../shared/types.js';

// ---- fixtures ----

const CHANGED = ['src/a.ts', 'src/b.ts'] as const;

const subject = (
	changedFiles: readonly string[] = CHANGED,
	epicHash = 'e1',
	storyId  = 's6',
): CodeReviewSubject => ({
	repoPath: '/repo', epicHash, storyId, changedFiles,
	approvedLld:  { body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});

const grounding: CodeReviewGrounding = { symbols: [] };

/** A finding at a fixed in-scope location for a given severity. */
const finding = (severity: DimensionFinding['severity'], dimension: ReviewDimension): DimensionFinding => ({
	dimension, severity, location: 'src/a.ts:1', message: `${dimension} ${severity}`,
});

/** A fake LLMProvider — never touched by the stub judges, only passed through. */
const fakeProvider = (): LLMProvider => ({}) as unknown as LLMProvider;

/** Build injected deps with ordered stub judges. Each stub records its call
 *  order, asserts no overlap via a shared in-flight flag, awaits a microtask
 *  tick, and returns a scripted DimensionResult. The write dep is a spy. */
function makeDeps(opts: {
	results?: Partial<Record<ReviewDimension, DimensionResult>>;
	throwOn?: ReviewDimension;
	// return a result tagged with the WRONG dimension for this slot (to force validation failure)
	mistagOn?: ReviewDimension;
	groundingThrows?: boolean;
} = {}): {
	deps: CodeReviewRunnerDeps;
	order: readonly ReviewDimension[];
	writes: ReadonlyArray<{ path: string; content: string }>;
	provider: LLMProvider;
} {
	const order: ReviewDimension[] = [];
	const writes: Array<{ path: string; content: string }> = [];
	let inFlight = false;

	const dims: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];
	const judges: JudgeSlot[] = dims.map((dimension) => ({
		dimension,
		judge: async (_s, _g, _p): Promise<DimensionResult> => {
			assert.equal(inFlight, false, `judge '${dimension}' overlapped another (not serial)`);
			inFlight = true;
			order.push(dimension);
			await Promise.resolve();   // a real await tick — a concurrent runner would overlap here
			inFlight = false;
			if (opts.throwOn === dimension) throw new Error(`judge ${dimension} exhausted retries`);
			const tag = opts.mistagOn === dimension ? otherDimension(dimension) : dimension;
			return opts.results?.[dimension] ?? { dimension: tag, findings: [] };
		},
	}));

	const deps: CodeReviewRunnerDeps = {
		judges,
		assembleGrounding: async (): Promise<CodeReviewGrounding> => {
			if (opts.groundingThrows) throw new Error('grounding failed');
			return grounding;
		},
		write: (path, content) => { writes.push({ path, content }); },
	};
	return { deps, order, writes, provider: fakeProvider() };
}

function otherDimension(d: ReviewDimension): ReviewDimension {
	return d === 'adherence' ? 'quality' : 'adherence';
}

/** Run opts with a progress spy. */
function runOpts(signal?: AbortSignal): { opts: Parameters<typeof runCodeReview>[2]; frames: CodeReviewProgress[] } {
	const frames: CodeReviewProgress[] = [];
	return {
		frames,
		opts: {
			runId: 'run-1', modelLabel: 'ollama:test',
			onProgress: (f) => frames.push(f),
			...(signal !== undefined ? { signal } : {}),
		},
	};
}

// ---- ac1: all four judges return findings => ONE record, dimensions:[four] + folded verdict ----

test('runCodeReview: all four judges returning findings persist ONE record with dimensions:[four] + folded verdict + counts (ac1)', async () => {
	const { deps, provider, writes } = makeDeps({
		results: {
			adherence:   { dimension: 'adherence',   findings: [finding('HIGH', 'adherence')] },
			conventions: { dimension: 'conventions', findings: [finding('MED',  'conventions')] },
			coverage:    { dimension: 'coverage',    findings: [finding('LOW',  'coverage')] },
			quality:     { dimension: 'quality',     findings: [finding('MED',  'quality')] },
		},
	});
	const { opts } = runOpts();
	const out = await runCodeReview(subject(), provider, opts, deps);
	assert.equal(out.ok, true);
	assert.ok(out.ok && out.artifact);
	const body = out.ok ? out.artifact.body : undefined!;
	assert.equal(body.dimensions.length, 4);
	assert.deepEqual(body.dimensions.map(d => d.dimension), ['adherence', 'conventions', 'coverage', 'quality']);
	assert.equal(body.verdict, 'block');   // one HIGH => block
	assert.deepEqual(body.counts, { high: 1, med: 2, low: 1 });
	// success writes both files
	assert.equal(writes.length, 2);
});

// ---- ac2: verdict-fold table + counts totals ----

test('runCodeReview: verdict fold matches the ReviewVerdict vocabulary (any-HIGH=>block, MED-no-HIGH=>warn, only-LOW/empty=>pass) (ac2)', async () => {
	const cases: Array<{ sev: readonly DimensionFinding['severity'][]; verdict: string; counts: [number, number, number] }> = [
		{ sev: [],                    verdict: 'pass',  counts: [0, 0, 0] },
		{ sev: ['LOW', 'LOW'],        verdict: 'pass',  counts: [0, 0, 2] },
		{ sev: ['MED', 'LOW'],        verdict: 'warn',  counts: [0, 1, 1] },
		{ sev: ['HIGH', 'MED', 'LOW'],verdict: 'block', counts: [1, 1, 1] },
	];
	for (const c of cases) {
		// pile all findings onto the adherence dimension; the rest empty
		const { deps, provider } = makeDeps({
			results: { adherence: { dimension: 'adherence', findings: c.sev.map(s => finding(s, 'adherence')) } },
		});
		const { opts } = runOpts();
		const out = await runCodeReview(subject(), provider, opts, deps);
		assert.ok(out.ok);
		assert.equal(out.artifact.body.verdict, c.verdict, `sev=${c.sev.join(',')}`);
		assert.deepEqual(
			[out.artifact.body.counts.high, out.artifact.body.counts.med, out.artifact.body.counts.low],
			c.counts,
		);
		assert.ok(['pass', 'warn', 'block'].includes(out.artifact.body.verdict));
	}
});

// ---- ac3: CR- id namespace + kind:'code-review' ----

test('runCodeReview: the record is written at CR-<epic>-<story> and carries kind:code-review (ac3)', async () => {
	const { deps, provider, writes } = makeDeps();
	const { opts } = runOpts();
	const out = await runCodeReview(subject(CHANGED, 'epicX', 'sZ'), provider, opts, deps);
	assert.ok(out.ok);
	assert.equal(out.artifact.body.kind, 'code-review');
	const json = writes.find(w => w.path.endsWith('.json'));
	assert.ok(json, 'a .json file was written');
	const base = json!.path.split('/').pop()!;
	assert.equal(base, 'CR-epicX-sZ.json');
	assert.ok(base.startsWith('CR-'), 'the id is in the CR- namespace, distinct from BUILD-/LLD-/PLAN-');
});

// ---- ac4: serial order, no overlap ----

test('runCodeReview: the four judges run SERIALLY in [adherence,conventions,coverage,quality] order, never concurrently (ac4)', async () => {
	const { deps, provider, order } = makeDeps();
	const { opts } = runOpts();
	const out = await runCodeReview(subject(), provider, opts, deps);
	assert.ok(out.ok);
	assert.deepEqual(order, ['adherence', 'conventions', 'coverage', 'quality']);
	// the in-flight assertion inside each stub judge already proves no overlap.
});

// ---- ac5: throwing judge => {ok:false}, no write, later judges not run ----

test('runCodeReview: a throwing 2nd judge aborts the run with {ok:false} and writes NOTHING; judges 3-4 do not run (ac5)', async () => {
	const { deps, provider, writes, order } = makeDeps({ throwOn: 'conventions' });
	const { opts, frames } = runOpts();
	const out = await runCodeReview(subject(), provider, opts, deps);
	assert.equal(out.ok, false);
	assert.ok(!out.ok && out.error.includes('conventions'));
	assert.equal(writes.length, 0, 'no record written on a throwing judge');
	assert.deepEqual(order, ['adherence', 'conventions'], 'coverage + quality never ran');
	assert.ok(frames.some(f => f.phase === 'error'));
});

// ---- ac5: in-memory validation failure => {ok:false}, no write ----

test('runCodeReview: an in-memory validation failure returns {ok:false} before any write (ac5)', async () => {
	// The coverage judge returns a result tagged with the WRONG dimension, so the
	// built record's dimension[2] !== 'coverage' — validation fails before writeAtomic.
	const { deps, provider, writes } = makeDeps({ mistagOn: 'coverage' });
	const { opts } = runOpts();
	const out = await runCodeReview(subject(), provider, opts, deps);
	assert.equal(out.ok, false);
	assert.ok(!out.ok && out.error.includes('invalid code-review record'));
	assert.equal(writes.length, 0, 'no record written on a validation failure');
});

// ---- ac5: pre-aborted signal => {ok:false}, no write, no judge runs ----

test('runCodeReview: a pre-aborted signal returns {ok:false} and writes nothing (ac5)', async () => {
	const ac = new AbortController();
	ac.abort();
	const { deps, provider, writes, order } = makeDeps();
	const { opts } = runOpts(ac.signal);
	const out = await runCodeReview(subject(), provider, opts, deps);
	assert.equal(out.ok, false);
	assert.ok(!out.ok && out.error === 'aborted');
	assert.equal(writes.length, 0);
	assert.deepEqual(order, [], 'no judge ran under a pre-aborted signal');
});

// ---- grounding failure => {ok:false}, no write ----

test('runCodeReview: a grounding failure returns {ok:false} and writes nothing (ac5)', async () => {
	const { deps, provider, writes, order } = makeDeps({ groundingThrows: true });
	const { opts, frames } = runOpts();
	const out = await runCodeReview(subject(), provider, opts, deps);
	assert.equal(out.ok, false);
	assert.ok(!out.ok && out.error.includes('grounding'));
	assert.equal(writes.length, 0);
	assert.deepEqual(order, [], 'no judge ran after grounding failed');
	assert.ok(frames.some(f => f.phase === 'error'));
});

// ---- success writes BOTH .json and .md ----

test('runCodeReview: a successful run writes BOTH the .json and the .md (two write-spy calls)', async () => {
	const { deps, provider, writes } = makeDeps();
	const { opts, frames } = runOpts();
	const out = await runCodeReview(subject(), provider, opts, deps);
	assert.ok(out.ok);
	assert.equal(writes.length, 2);
	assert.ok(writes.some(w => w.path.endsWith('.json')));
	const md = writes.find(w => w.path.endsWith('.md'));
	assert.ok(md, 'a .md was written');
	assert.match(md!.content, /<!-- insrc:artifact CR-/);   // the marker maps md -> json
	assert.ok(frames.some(f => f.phase === 'done'));
});

// ---- edge: all-empty => a vacuous but valid PASS record ----

test('runCodeReview: all four dimensions empty => a written PASS record (an empty review is a persisted PASS, not an absence)', async () => {
	const { deps, provider, writes } = makeDeps();
	const { opts } = runOpts();
	const out = await runCodeReview(subject(), provider, opts, deps);
	assert.ok(out.ok);
	assert.equal(out.artifact.body.verdict, 'pass');
	assert.deepEqual(out.artifact.body.counts, { high: 0, med: 0, low: 0 });
	assert.equal(out.artifact.body.dimensions.length, 4);
	assert.equal(writes.length, 2);
});

// ---- DEFAULT_DEPS wires the four shipped judges in fixed order ----

test('DEFAULT_DEPS: wires exactly the four shipped judges in [adherence,conventions,coverage,quality] order + writeAtomic', () => {
	assert.deepEqual(DEFAULT_DEPS.judges.map(j => j.dimension), ['adherence', 'conventions', 'coverage', 'quality']);
	assert.equal(typeof DEFAULT_DEPS.assembleGrounding, 'function');
	assert.equal(typeof DEFAULT_DEPS.write, 'function');
});

// ---------------------------------------------------------------------------
// s10 — groundingMode stamp + the warn-cap fold (RunCodeReviewOpts additions)
// ---------------------------------------------------------------------------

// ac3: opts.groundingMode:'degraded' is stamped verbatim on the record.
test('s10: runCodeReview with opts.groundingMode:degraded stamps body.groundingMode === degraded', async () => {
	const { deps, provider } = makeDeps();
	const { opts } = runOpts();
	const out = await runCodeReview(subject(), provider, { ...opts, groundingMode: 'degraded', capVerdictAtWarn: true }, deps);
	assert.ok(out.ok);
	assert.equal(out.artifact.body.groundingMode, 'degraded');
});

// ac4: capVerdictAtWarn promotes a would-be pass to warn (a degraded review can never pass).
test('s10: capVerdictAtWarn:true + all-empty findings (would fold pass) => verdict warn', async () => {
	const { deps, provider } = makeDeps();   // all judges return empty => would fold to pass
	const { opts } = runOpts();
	const out = await runCodeReview(subject(), provider, { ...opts, groundingMode: 'degraded', capVerdictAtWarn: true }, deps);
	assert.ok(out.ok);
	assert.equal(out.artifact.body.verdict, 'warn', 'a clean degraded fold is capped up to warn');
	assert.deepEqual(out.artifact.body.counts, { high: 0, med: 0, low: 0 }, 'the cap raises the verdict, not the counts');
});

// ac4: the cap NEVER lowers a block/warn.
test('s10: capVerdictAtWarn:true + a HIGH finding => verdict stays block (the cap never lowers block/warn)', async () => {
	const { deps, provider } = makeDeps({
		results: { adherence: { dimension: 'adherence', findings: [finding('HIGH', 'adherence')] } },
	});
	const { opts } = runOpts();
	const out = await runCodeReview(subject(), provider, { ...opts, groundingMode: 'degraded', capVerdictAtWarn: true }, deps);
	assert.ok(out.ok);
	assert.equal(out.artifact.body.verdict, 'block', 'a HIGH still blocks under the warn-cap');
});

// ac6: with NO opts the record stamps 'full' and the fold is unchanged (default parity with s9).
test('s10 ac6: runCodeReview with NO groundingMode/cap opts stamps full and the verdict fold is unchanged (default parity)', async () => {
	const { deps, provider } = makeDeps();   // all empty
	const { opts } = runOpts();
	const out = await runCodeReview(subject(), provider, opts, deps);
	assert.ok(out.ok);
	assert.equal(out.artifact.body.groundingMode, 'full', 'default groundingMode is full');
	assert.equal(out.artifact.body.verdict, 'pass', 'without the cap a clean fold is pass (unchanged)');
});
