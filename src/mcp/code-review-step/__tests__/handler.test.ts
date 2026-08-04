/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleCodeReviewStep, type CodeReviewStepDeps } from '../handler.js';
import { _clearCodeReviewStateStoreForTests } from '../state-store.js';
import { runCodeReview } from '../../../workflow/code-review/runner.js';
import type { CodeReviewStepOutput } from '../types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult, ReviewDimension } from '../../../workflow/code-review/types.js';

// ---- fixtures ----

const EPIC = 'e1';
const STORY = 's8';
const CHANGED = ['src/a.ts', 'src/b.ts'];

const subject = (): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: EPIC, storyId: STORY, changedFiles: CHANGED,
	approvedLld:  { body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});

const grounding: CodeReviewGrounding = { symbols: [] };

/** A well-formed judgements payload: one DimensionResult per dimension. */
function judgements(
	perDim: Partial<Record<ReviewDimension, DimensionResult['findings']>> = {},
): { judgements: DimensionResult[] } {
	const dims: ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];
	return { judgements: dims.map(d => ({ dimension: d, findings: perDim[d] ?? [] })) };
}

/** Parse the JSON envelope back into the CodeReviewStepOutput. */
function parse(env: { content: readonly { text: string }[] }): CodeReviewStepOutput {
	return JSON.parse(env.content[0]!.text) as CodeReviewStepOutput;
}

/** Injected deps: canned subject + grounding, a REAL runCodeReview, a write spy. */
function makeDeps(overrides: Partial<CodeReviewStepDeps> = {}): { deps: CodeReviewStepDeps; writes: { path: string; content: string }[] } {
	const writes: { path: string; content: string }[] = [];
	const deps: CodeReviewStepDeps = {
		resolveSubject: async () => ({ ok: true, subject: subject() }),
		fetchGrounding: async () => ({ ok: true, grounding }),
		runReview:      runCodeReview,
		write:          (path, content) => { writes.push({ path, content }); },
		...overrides,
	};
	return { deps, writes };
}

/** Drive start → judgements and return both outputs + the writes. */
async function runFullFlow(
	depsOverrides: Partial<CodeReviewStepDeps> = {},
	j: { judgements: DimensionResult[] } = judgements(),
): Promise<{ start: CodeReviewStepOutput; done: CodeReviewStepOutput; writes: { path: string; content: string }[] }> {
	const { deps, writes } = makeDeps(depsOverrides);
	const startEnv = await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps);
	const start = parse(startEnv);
	assert.equal(start.next, 'emit_judgements');
	const state = start.next === 'emit_judgements' ? start.state : '';
	const doneEnv = await handleCodeReviewStep({ phase: 'judgements', judgements: j, state }, deps);
	return { start, done: parse(doneEnv), writes };
}

// reset the shared state-store between tests (module-level Map)
const reset = (): void => _clearCodeReviewStateStoreForTests();

// ---- ac1: start => emit_judgements ----

test('start => next:emit_judgements with the four prompts + a file:line-pinned DimensionResult[] schema + grounding + an opaque token (ac1)', async () => {
	reset();
	const { deps } = makeDeps();
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.equal(start.next, 'emit_judgements');
	assert.ok(start.next === 'emit_judgements');
	assert.equal(start.prompts.length, 4, 'the four per-dimension prompts');
	assert.ok(typeof start.state === 'string' && start.state.length > 0, 'an opaque token');
	assert.deepEqual(start.grounding, grounding);
	// the schema pins the finding location
	const findingProps = (start.schema as { properties: { judgements: { items: { properties: { findings: { items: { properties: Record<string, unknown> } } } } } } })
		.properties.judgements.items.properties.findings.items.properties;
	assert.ok('location' in findingProps && 'severity' in findingProps);
});

// ---- ac2 + ac3: opaque resume => done, persists a CR record via runCodeReview ----

test('the opaque token resumes to next:done and persists a CR- record via runCodeReview (ac2/ac3)', async () => {
	reset();
	const { done, writes } = await runFullFlow({}, judgements({
		adherence: [{ dimension: 'adherence', severity: 'MED', location: 'src/a.ts:1', message: 'x' }],
	}));
	assert.equal(done.next, 'done');
	assert.ok(done.next === 'done');
	assert.equal(done.verdict, 'warn');   // one MED => warn
	assert.deepEqual(done.counts, { high: 0, med: 1, low: 0 });
	// both .json + .md written; the json is CR-<epic>-<story>
	const json = writes.find(w => w.path.endsWith('.json'));
	assert.ok(json, 'a .json record was written');
	assert.equal(json!.path.split('/').pop(), `CR-${EPIC}-${STORY}.json`);
	const body = (JSON.parse(json!.content) as { body: { kind: string } }).body;
	assert.equal(body.kind, 'code-review');
});

// ---- ac3 parity: out-of-changedFiles finding is dropped ----

test('an out-of-changedFiles finding is DROPPED so the persisted record matches the daemon path (ac3 parity)', async () => {
	reset();
	const { done, writes } = await runFullFlow({}, judgements({
		adherence: [
			{ dimension: 'adherence', severity: 'HIGH', location: 'src/a.ts:1',     message: 'in scope' },
			{ dimension: 'adherence', severity: 'HIGH', location: 'src/other.ts:9', message: 'out of scope' },
		],
	}));
	assert.ok(done.next === 'done');
	// only the in-scope HIGH survives => verdict block, counts {1,0,0}
	assert.equal(done.verdict, 'block');
	assert.deepEqual(done.counts, { high: 1, med: 0, low: 0 });
	const json = writes.find(w => w.path.endsWith('.json'))!;
	const body = JSON.parse(json.content) as { body: { dimensions: DimensionResult[] } };
	const adh = body.body.dimensions.find(d => d.dimension === 'adherence')!;
	assert.equal(adh.findings.length, 1, 'the out-of-scope finding was dropped');
	assert.equal(adh.findings[0]!.location, 'src/a.ts:1');
});

// ---- ac4: grounding only via the injected fetch ----

test('fetchGrounding (injected) is the sole grounding source; the emit_judgements frame surfaces it (ac4)', async () => {
	reset();
	let fetchCalls = 0;
	const { deps } = makeDeps({ fetchGrounding: async () => { fetchCalls++; return { ok: true, grounding }; } });
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(start.next === 'emit_judgements');
	assert.equal(fetchCalls, 1, 'grounding fetched exactly once, over the injected IPC seam');
	assert.deepEqual(start.grounding, grounding);
});

// ---- vacuous pass: all-empty judgements ----

test('all-empty judgements => a written PASS record (vacuous but valid, ac3)', async () => {
	reset();
	const { done, writes } = await runFullFlow();
	assert.ok(done.next === 'done');
	assert.equal(done.verdict, 'pass');
	assert.deepEqual(done.counts, { high: 0, med: 0, low: 0 });
	assert.equal(writes.length, 2);   // .json + .md
});

// ---- ac5: malformed turns => error, no write ----

test('ac5: non-object input / unknown phase / missing state / unknown token => next:error, no write', async () => {
	reset();
	const { deps, writes } = makeDeps();
	assert.equal(parse(await handleCodeReviewStep(42, deps)).next, 'error');
	assert.equal(parse(await handleCodeReviewStep({ phase: 'nope' }, deps)).next, 'error');
	assert.equal(parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements() }, deps)).next, 'error'); // missing state
	const unknownTok = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: 'nope' }, deps));
	assert.ok(unknownTok.next === 'error' && unknownTok.error.code === 'state-not-found');
	assert.equal(writes.length, 0);
});

test('ac5: missing/empty judgements, wrong-dimension set, malformed finding, malformed location => bad-judgements, no write', async () => {
	reset();
	const cases: Array<{ label: string; j: unknown }> = [
		{ label: 'empty',            j: { judgements: [] } },
		{ label: 'missing dim',      j: { judgements: [{ dimension: 'adherence', findings: [] }, { dimension: 'conventions', findings: [] }, { dimension: 'coverage', findings: [] }] } },
		{ label: 'duplicate dim',    j: { judgements: [{ dimension: 'adherence', findings: [] }, { dimension: 'adherence', findings: [] }, { dimension: 'coverage', findings: [] }, { dimension: 'quality', findings: [] }] } },
		{ label: 'unknown dim',      j: { judgements: [{ dimension: 'adherence', findings: [] }, { dimension: 'conventions', findings: [] }, { dimension: 'coverage', findings: [] }, { dimension: 'bogus', findings: [] }] } },
		{ label: 'malformed finding',j: judgements({ adherence: [{ dimension: 'adherence', severity: 'NOPE' as unknown as 'HIGH', location: 'src/a.ts:1', message: 'x' }] }) },
		{ label: 'malformed loc',    j: judgements({ adherence: [{ dimension: 'adherence', severity: 'HIGH', location: 'src/a.ts', message: 'x' }] }) },
	];
	for (const c of cases) {
		const { deps, writes } = makeDeps();
		const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
		assert.ok(start.next === 'emit_judgements');
		const out = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: c.j, state: start.state }, deps));
		assert.ok(out.next === 'error' && out.error.code === 'bad-judgements', `${c.label} => bad-judgements`);
		assert.equal(writes.length, 0, `${c.label} writes nothing`);
	}
});

// ---- ac5: declined subject + grounding unavailable => error at start ----

test('ac5: a declined subject (no-subject) and a grounding-unavailable start => next:error, no state saved', async () => {
	reset();
	const declined = makeDeps({ resolveSubject: async () => ({ ok: false, reason: 'no-build-record' }) });
	const d1 = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, declined.deps));
	assert.ok(d1.next === 'error' && d1.error.code === 'no-subject');

	const noGround = makeDeps({ fetchGrounding: async () => ({ ok: false, reason: 'daemon is not running' }) });
	const d2 = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, noGround.deps));
	assert.ok(d2.next === 'error' && d2.error.code === 'grounding-unavailable');
});

// ---- double-submit: token consumed on done ----

test('resending the same judgements token after done fails loadState (no double-write)', async () => {
	reset();
	const { deps, writes } = makeDeps();
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(start.next === 'emit_judgements');
	const first = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: start.state }, deps));
	assert.equal(first.next, 'done');
	const writesAfterFirst = writes.length;
	const second = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: start.state }, deps));
	assert.ok(second.next === 'error' && second.error.code === 'state-not-found');
	assert.equal(writes.length, writesAfterFirst, 'no second write on the consumed token');
});
