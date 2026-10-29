/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateJudgements, type CodeReviewStepDeps } from '../handler.js';
import { fixtureCodeReviewClient as handleCodeReviewStep, rawControllerCall, CONTROLLER_DECLARATION } from './controller-client.js';
import { _clearCodeReviewStateStoreForTests } from '../state-store.js';
import { runCodeReview } from '../../../../workflow/code-review/runner.js';
import { LEDGER_EXCLUDE_GLOBS } from '../../../../workflow/runners/build/changed-files.js';
import { buildStartRelPath } from '../../../../workflow/runners/build/range-base.js';
import type { CodeReviewStepOutput } from '../types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult, ReviewDimension } from '../../../../workflow/code-review/types.js';
import { noopRoundWriter } from '../../../../workflow/__tests__/helpers/round-writer.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

// ---- fixtures ----

// Under the S002 nested docs-tree, the CR record's md path is derived from the
// work-item key, which requires a >=8-char lowercase-hex epicHash (see
// path-scheme.ts `folderSegment`). The hash-flat `CR-<epic>-<story>.json` id is unaffected.
const EPIC = 'e1a2b3c4d5e6f7a8';
const STORY = 's8';
const CHANGED = ['src/a.ts', 'src/b.ts'];
// The CR record's nested md path is anchored on the approved LLD's meta (S002
// `codeReviewSubjectPathArgs`), so the fixture LLD carries a realistic meta
// (valid createdAt + epicSlug) as a real LldArtifact always does.
const CREATED = '2026-07-18T00:00:00.000Z';

const subject = (): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: EPIC, storyId: STORY, changedFiles: CHANGED,
	approvedLld:  { meta: { epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});

/** A real (non-hollow) fresh grounding: >=1 changed-symbol summary. The full
 *  graph-review path runs only when the grounding actually carries symbols; an
 *  empty symbols[] is the hollow-PASS the auto-diff-fallback story diverts to
 *  the diff review (see `hollowGrounding` + the fresh-but-hollow tests below). */
const grounding: CodeReviewGrounding = {
	symbols: [{
		entityId: 'sym:src/a.ts#f', file: 'src/a.ts', kind: 'function', name: 'f',
		signature: 'f(): void', callers: [], callees: [], testsReaching: [],
	}],
};

/** A fresh-but-hollow grounding: the graph reports fresh but has zero
 *  changed-symbol summaries (grounding.symbols.length === 0). */
const hollowGrounding: CodeReviewGrounding = { symbols: [] };

/** A canned diff-only grounding: one per-file pseudo-symbol for a changed file
 *  recovered from the diff (kind:'file', hunks in signature). */
const DIFF_CHANGED = ['src/a.ts'];
const diffGrounding: CodeReviewGrounding = {
	symbols: [{
		entityId: 'diff:src/a.ts', file: 'src/a.ts', kind: 'file', name: 'src/a.ts',
		signature: '@@ -1 +1 @@\n-old\n+new', callers: [], callees: [], testsReaching: [],
	}],
};

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

/** Injected deps: canned subject + grounding, a REAL runCodeReview, a write spy.
 *  The s9 freshness seam defaults to FRESH (isProcessing:false, no stale files)
 *  so a plain start flows straight to emit_judgements as before; sleep is a no-op
 *  and now/timeout are fixed unless a test overrides them. */
function makeDeps(overrides: Partial<CodeReviewStepDeps> = {}): { deps: CodeReviewStepDeps; writes: { path: string; content: string }[] } {
	const writes: { path: string; content: string }[] = [];
	const deps: CodeReviewStepDeps = {
		resolveSubject: async () => ({ ok: true, subject: subject() }),
		fetchGrounding: async () => ({ ok: true, grounding }),
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: [] }),
		assembleDiffGrounding: async () => ({ grounding: diffGrounding, changedFiles: DIFF_CHANGED }),
		runReview:      runCodeReview,
		write:          (path, content) => { writes.push({ path, content }); },
		roundWriterFor: () => noopRoundWriter(),
		sleep:          async () => {},
		now:            () => 0,
		freshnessTimeoutMs: () => 120000,
		// The Story's BUILD record names the DAEMON as author, so this tool's own
		// judgements phase (the controller's review) is the path under test. Code
		// the controller wrote is sent to the daemon: see routing.test.ts.
		readBuildAuthor: () => 'daemon',
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
	assert.equal(start.next, 'emit_judgements', JSON.stringify(start));
	const state = start.next === 'emit_judgements' ? start.state : '';
	const doneEnv = await handleCodeReviewStep({ phase: 'judgements', judgements: j, state }, deps);
	return { start, done: parse(doneEnv), writes };
}

// reset the shared state-store between tests (module-level Map)
const reset = (): Promise<void> => _clearCodeReviewStateStoreForTests();

// ---- ac1: start => emit_judgements ----

test('start emits one assigned prompt and versioned answer schema without whole grounding (ac1)', async () => {
	await reset();
	const { deps } = makeDeps();
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.equal(start.next, 'emit_judgements', JSON.stringify(start));
	assert.ok(start.next === 'emit_judgements');
	assert.equal(start.prompts.length, 1, 'one admitted request per turn');
	assert.ok(typeof start.state === 'string' && start.state.length > 0, 'an opaque token');
	assert.equal(start.grounding, undefined, 'whole grounding is retained server-side, not appended to the frame');
	// the schema pins the finding location
	const findingProps = (start.schema as { properties: { answer: { properties: { findings: { items: { properties: Record<string, unknown> } } } } } }).properties.answer.properties.findings.items.properties;
	assert.ok('location' in findingProps && 'severity' in findingProps);
});

// ---- ac2 + ac3: opaque resume => done, persists a CR record via runCodeReview ----

test('the opaque token resumes to next:done and persists a CR- record via runCodeReview (ac2/ac3)', async () => {
	await reset();
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
	// T4 (LLD-1716f77ba9ba017b-S001): this tool's judgements are the controller's review.
	assert.equal((JSON.parse(json!.content) as { meta: { reviewedBy?: string | undefined } }).meta.reviewedBy, 'controller');
});

// ---- ac3 parity: out-of-changedFiles finding is dropped ----

test('an out-of-changedFiles finding is DROPPED so the persisted record matches the daemon path (ac3 parity)', async () => {
	await reset();
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
	await reset();
	let fetchCalls = 0;
	const { deps } = makeDeps({ fetchGrounding: async () => { fetchCalls++; return { ok: true, grounding }; } });
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(start.next === 'emit_judgements');
	assert.equal(fetchCalls, 1, 'grounding fetched exactly once, over the injected IPC seam');
	assert.equal(start.grounding, undefined, 'whole grounding is retained server-side, not appended to the frame');
});

// ---- vacuous pass: all-empty judgements ----

test('all-empty judgements => a written PASS record (vacuous but valid, ac3)', async () => {
	await reset();
	const { done, writes } = await runFullFlow();
	assert.ok(done.next === 'done');
	assert.equal(done.verdict, 'pass');
	assert.deepEqual(done.counts, { high: 0, med: 0, low: 0 });
	assert.equal(writes.length, 2);   // .json + .md
});

// ---- ac5: malformed turns => error, no write ----

test('ac5: non-object input / unknown phase / missing state / unknown token => next:error, no write', async () => {
	await reset();
	const { deps, writes } = makeDeps();
	assert.equal(parse(await handleCodeReviewStep(42, deps)).next, 'error');
	assert.equal(parse(await handleCodeReviewStep({ phase: 'nope' }, deps)).next, 'error');
	assert.equal(parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements() }, deps)).next, 'error'); // missing state
	const unknownTok = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: 'nope' }, deps));
	assert.ok(unknownTok.next === 'error' && unknownTok.error.code === 'review-budget-state-stale');
	assert.equal(writes.length, 0);
});

test('ac5: missing/empty judgements, wrong-dimension set, malformed finding, malformed location => bad-judgements, no write', async () => {
	await reset();
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
		assert.equal(validateJudgements((c.j as { judgements: DimensionResult[] }).judgements, subject()).ok, false, `${c.label} fails final exact-set/finding validation`);
		const out = parse(await rawControllerCall({ phase: 'judgements', judgements: c.j, state: start.state, reviewBudget: CONTROLLER_DECLARATION }, deps));
		assert.ok(out.next === 'error' && out.error.code === 'controller-budget-incompatible', `${c.label}: legacy raw arrays cannot bypass the versioned envelope`);
		assert.equal(writes.length, 0, `${c.label} writes nothing`);
	}
});

// ---- ac5: declined subject + grounding unavailable => error at start ----

test('ac5: a declined subject (no-subject) and a grounding-unavailable start => next:error, no state saved', async () => {
	await reset();
	const declined = makeDeps({ resolveSubject: async () => ({ ok: false, reason: 'no-build-record' }) });
	const d1 = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, declined.deps));
	assert.ok(d1.next === 'error' && d1.error.code === 'no-subject');

	const noGround = makeDeps({ fetchGrounding: async () => ({ ok: false, reason: 'daemon is not running' }) });
	const d2 = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, noGround.deps));
	assert.ok(d2.next === 'error' && d2.error.code === 'grounding-unavailable');
});

// ---- double-submit: token consumed on done ----

test('resending the same judgements token after done fails loadState (no double-write)', async () => {
	await reset();
	const { deps, writes } = makeDeps();
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(start.next === 'emit_judgements');
	const first = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: start.state }, deps));
	assert.equal(first.next, 'done');
	const writesAfterFirst = writes.length;
	const second = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: start.state }, deps));
	assert.ok(second.next === 'error' && second.error.code === 'review-budget-state-stale');
	assert.equal(writes.length, writesAfterFirst, 'no second write on the consumed token');
});

test("a superseded code-review token fails with today's not-found message", async () => {
	await reset();
	const { deps } = makeDeps();
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(start.next === 'emit_judgements');
	const first = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: start.state }, deps));
	assert.equal(first.next, 'done');
	const resend = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: start.state }, deps));
	assert.ok(resend.next === 'error');
	assert.equal(resend.error.code, 'review-budget-state-stale');
	assert.equal(resend.error.message, 'review-budget-state-stale');
});

// ---------------------------------------------------------------------------
// s9 — the indexing-readiness freshness gate
// ---------------------------------------------------------------------------

// ac1: stale (staleFiles non-empty) and no proceed => confirm_wait, no grounding.
test('s9: start with a stale index (staleFiles) => next:confirm_wait with the stale list + state, and fetchGrounding is NEVER called', async () => {
	await reset();
	let groundingCalls = 0;
	const { deps } = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
		fetchGrounding: async () => { groundingCalls++; return { ok: true, grounding }; },
	});
	const out = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(out.next === 'confirm_wait', 'stale => confirm_wait');
	assert.deepEqual(out.staleFiles, ['src/a.ts']);
	assert.ok(typeof out.state === 'string' && out.state.length > 0, 'a resume token');
	assert.equal(groundingCalls, 0, 'grounding is NOT fetched against a stale graph');
});

// ac1: isProcessing (empty staleFiles) also gates.
test('s9: start with isProcessing:true (empty staleFiles) => confirm_wait too', async () => {
	await reset();
	const { deps } = makeDeps({ fetchFreshness: async () => ({ ok: true, isProcessing: true, staleFiles: [] }) });
	const out = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(out.next === 'confirm_wait');
	assert.equal(out.isProcessing, true);
});

// ac4: fresh => straight to emit_judgements; the persisted record is groundingMode:'full'.
test('s9: a fresh index proceeds directly to emit_judgements and the persisted record is groundingMode:full (ac4)', async () => {
	await reset();
	const { done, writes } = await runFullFlow();   // makeDeps defaults to fresh
	assert.ok(done.next === 'done');
	const json = writes.find(w => w.path.endsWith('.json'))!;
	const body = (JSON.parse(json.content) as { body: { groundingMode: string } }).body;
	assert.equal(body.groundingMode, 'full', 'the graph-grounded record is stamped full');
});

// ac2: proceed:true block-and-polls until fresh, never reindexes, then continues.
test('s9: proceed:true block-and-polls the freshness IPC (stale twice then fresh) then continues to emit_judgements', async () => {
	await reset();
	let ticks = 0;
	let sleeps = 0;
	const { deps } = makeDeps({
		fetchFreshness: async () => {
			ticks += 1;
			return ticks < 3
				? { ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }
				: { ok: true, isProcessing: false, staleFiles: [] };
		},
		sleep: async () => { sleeps += 1; },
	});
	// initial stale → confirm_wait
	const cw = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(cw.next === 'confirm_wait');
	ticks = 0;   // reset the counter for the resume poll
	// resume proceed:true → polls until fresh (3rd tick) then emit_judgements
	const resumed = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: true }, deps));
	assert.ok(resumed.next === 'emit_judgements', 'fresh after polling → emit_judgements');
	assert.ok(ticks >= 3, 'the poll looped until fresh');
	assert.ok(sleeps >= 1, 'it slept between poll ticks (never reindexed)');
});

// S001 ac1: timeout during the poll => auto-fall-back to the DIFF-ONLY review,
// NOT an endless confirm_wait re-prompt (a wedged index never freshens). This
// flips the pre-S001 behaviour where the timeout re-prompted confirm_wait.
test('S001: proceed:true that never becomes fresh before the timeout auto-falls-back to the diff review (emit_judgements over diff), not a confirm_wait re-prompt', async () => {
	await reset();
	let clock = 0;
	let diffCalls = 0;
	const { deps, writes } = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
		assembleDiffGrounding: async () => { diffCalls++; return { grounding: diffGrounding, changedFiles: DIFF_CHANGED }; },
		now: () => clock,
		sleep: async () => { clock += 1000; },   // advance the fake clock each poll
		freshnessTimeoutMs: () => 2500,
	});
	const cw = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(cw.next === 'confirm_wait');
	const out = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: true }, deps));
	assert.ok(out.next === 'emit_judgements', 'timeout => diff-only emit_judgements, not confirm_wait');
	assert.equal(diffCalls, 1, 'the diff grounding was assembled on timeout');
	assert.equal(out.grounding, undefined, 'only assigned prompt evidence is exposed');
	assert.match(JSON.stringify(out.prompts), /new/);
	assert.equal(writes.length, 0, 'nothing written yet — the write happens on the judgements turn');
});

// S001 ac1 (token hygiene): the confirm_wait token is consumed before the diff
// fallback runs, so a resend of it fails loadState (no leaked/double-usable token).
test('S001: the timeout auto-diff releases the confirm_wait token before the diff review', async () => {
	await reset();
	let clock = 0;
	const { deps } = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
		now: () => clock,
		sleep: async () => { clock += 1000; },
		freshnessTimeoutMs: () => 2500,
	});
	const cw = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(cw.next === 'confirm_wait');
	const out = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: true }, deps));
	assert.ok(out.next === 'emit_judgements');
	// resending the now-consumed confirm_wait token fails loadState
	const resend = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: true }, deps));
	assert.ok(resend.next === 'error' && resend.error.code === 'review-budget-state-stale', 'the confirm_wait token was released');
});

// S001 ac2: a FRESH index whose grounding is hollow (symbols:[]) auto-falls-back
// to the diff review instead of emitting a full-mode review over nothing.
test('S001: a fresh-but-hollow grounding (symbols:[]) auto-falls-back to the diff review, NOT a hollow full emit', async () => {
	await reset();
	let diffCalls = 0;
	const { deps } = makeDeps({
		fetchGrounding: async () => ({ ok: true, grounding: hollowGrounding }),   // fresh but empty
		assembleDiffGrounding: async () => { diffCalls++; return { grounding: diffGrounding, changedFiles: DIFF_CHANGED }; },
	});
	const out = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(out.next === 'emit_judgements', 'hollow grounding => diff-only emit_judgements');
	assert.equal(diffCalls, 1, 'the diff grounding was assembled for the hollow case');
	assert.equal(out.grounding, undefined, 'only assigned prompt evidence is exposed');
	assert.match(JSON.stringify(out.prompts), /new/);
});

// S001 ac2 (regression): a FRESH index with real (non-empty) grounding still
// uses the FULL graph path — the auto-diff fallback does NOT fire.
test('S001: a fresh index with >=1 changed-symbol still uses the FULL graph review (auto-diff does not fire)', async () => {
	await reset();
	let diffCalls = 0;
	const { done, writes } = await runFullFlow({
		assembleDiffGrounding: async () => { diffCalls++; return { grounding: diffGrounding, changedFiles: DIFF_CHANGED }; },
	});   // makeDeps defaults to fresh + the non-empty `grounding`
	assert.ok(done.next === 'done');
	assert.equal(diffCalls, 0, 'assembleDiffGrounding was never called for a real fresh grounding');
	const json = writes.find(w => w.path.endsWith('.json'))!;
	const body = (JSON.parse(json.content) as { body: { groundingMode: string } }).body;
	assert.equal(body.groundingMode, 'full', 'a real fresh grounding stamps full');
});

// error: freshness IPC failure => error frame, no confirm_wait, no write.
test('s9: a freshness-IPC failure on the initial check => next:error (freshness-unavailable), no confirm_wait, no write', async () => {
	await reset();
	const { deps, writes } = makeDeps({ fetchFreshness: async () => ({ ok: false, reason: 'daemon is not running' }) });
	const out = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(out.next === 'error' && out.error.code === 'freshness-unavailable');
	assert.equal(writes.length, 0);
});

// ---------------------------------------------------------------------------
// s10 — the diff-only (degraded) fallback on the decline branch
// ---------------------------------------------------------------------------

/** A runReview spy that records the opts each call received, then delegates to
 *  the real runCodeReview so a record is actually persisted. */
function reviewSpy(): { runReview: CodeReviewStepDeps['runReview']; opts: Parameters<typeof runCodeReview>[2][] } {
	const opts: Parameters<typeof runCodeReview>[2][] = [];
	const runReview: CodeReviewStepDeps['runReview'] = async (s, p, o, d) => { opts.push(o); return runCodeReview(s, p, o, d); };
	return { runReview, opts };
}

/** Drive start (stale) → confirm_wait → resume proceed:false (decline). */
async function declineTo(deps: CodeReviewStepDeps): Promise<CodeReviewStepOutput> {
	const cw = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(cw.next === 'confirm_wait', 'stale index => confirm_wait');
	return parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: false }, deps));
}

// ac1: decline no longer fails closed — it runs the diff-only path.
test('s10: proceed:false (decline) calls assembleDiffGrounding and returns emit_judgements over the diff grounding — NO review-declined error', async () => {
	await reset();
	let diffCalls = 0;
	const { deps } = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
		assembleDiffGrounding: async () => { diffCalls++; return { grounding: diffGrounding, changedFiles: DIFF_CHANGED }; },
	});
	const declined = await declineTo(deps);
	assert.ok(declined.next === 'emit_judgements', 'decline => diff-only emit_judgements, not an error');
	assert.equal(diffCalls, 1, 'the diff grounding was assembled');
	assert.equal(declined.grounding, undefined, 'only assigned prompt evidence is exposed');
	assert.match(JSON.stringify(declined.prompts), /new/);
});

// ac3 + ac4: the degraded judgements turn drives runReview with the degraded+cap opts and persists a record.
test('s10: the degraded judgements turn drives runReview with groundingMode:degraded + capVerdictAtWarn:true and persists a degraded record', async () => {
	await reset();
	const { runReview, opts } = reviewSpy();
	const { deps, writes } = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
		runReview,
	});
	const declined = await declineTo(deps);
	assert.ok(declined.next === 'emit_judgements');
	// a clean set of judgements (no findings) — would fold to pass, but the cap raises it to warn.
	const done = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: declined.state }, deps));
	assert.ok(done.next === 'done', 'the degraded review persists a record');
	assert.equal(done.verdict, 'warn', 'a clean degraded fold is warn-capped, never pass (ac4)');
	assert.equal(opts.length, 1);
	assert.equal(opts[0]!.groundingMode, 'degraded', 'runReview got groundingMode:degraded (ac3)');
	assert.equal(opts[0]!.capVerdictAtWarn, true, 'runReview got capVerdictAtWarn:true (ac4)');
	const json = writes.find(w => w.path.endsWith('.json'))!;
	const body = (JSON.parse(json.content) as { body: { groundingMode: string; verdict: string } }).body;
	assert.equal(body.groundingMode, 'degraded', 'the persisted record is stamped degraded');
	assert.equal(body.verdict, 'warn');
	// T4 (LLD-1716f77ba9ba017b-S001): the degraded route is the controller's review too.
	assert.equal(opts[0]!.reviewedBy, 'controller');
	assert.equal((JSON.parse(json.content) as { meta: { reviewedBy?: string | undefined } }).meta.reviewedBy, 'controller');
});

// ISSUE-5f7a7cb9 S001/t7 (T48): the degraded path hands the assembler the Story's
// resolved base and the ledger globs. Driven against a REAL repo carrying a
// build-start file for this Story, so "the resolved base" is what the shipping
// resolver returns and not a value the test invented.
test('T48: the degraded review passes the Story\'s resolved range base and LEDGER_EXCLUDE_GLOBS to the diff assembler', async () => {
	await reset();
	const repo = mkdtempSync(join(tmpdir(), 'cr-handler-base-'));
	try {
		const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
		git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
		writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
		git('add', '-A'); git('commit', '-qm', 'base');
		const base = git('rev-parse', 'HEAD');
		mkdirSync(join(repo, '.insrc', 'build-start'), { recursive: true });
		writeFileSync(join(repo, buildStartRelPath(EPIC, STORY)), JSON.stringify({ epicHash: EPIC, storyId: STORY, rangeBase: base, stampedAt: '2026-10-04T10:00:00.000Z' }) + '\n');

		const seen: unknown[][] = [];
		const { deps } = makeDeps({
			fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
			assembleDiffGrounding: async (...a: unknown[]) => { seen.push(a); return { grounding: diffGrounding, changedFiles: DIFF_CHANGED }; },
		});
		const cw = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo }, deps));
		assert.ok(cw.next === 'confirm_wait');
		const declined = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: false }, deps));
		assert.ok(declined.next === 'emit_judgements');

		assert.equal(seen.length, 1);
		assert.deepEqual(seen[0], [repo, undefined, { base, excludeGlobs: LEDGER_EXCLUDE_GLOBS, storyKey: `${EPIC}/${STORY}` }]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T48: with no resolvable base the degraded review still passes the ledger globs, and an undefined base', async () => {
	await reset();
	const seen: unknown[][] = [];
	const { deps } = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
		assembleDiffGrounding: async (...a: unknown[]) => { seen.push(a); return { grounding: diffGrounding, changedFiles: DIFF_CHANGED }; },
	});
	await declineTo(deps);
	assert.deepEqual(seen, [['/repo', undefined, { base: undefined, excludeGlobs: LEDGER_EXCLUDE_GLOBS, storyKey: `${EPIC}/${STORY}` }]]);
});

// error: the diff cannot be read => diff-unavailable, nothing written.
test('s10: a diff-unavailable failure (assembleDiffGrounding rejects) => next:error (diff-unavailable), no write', async () => {
	await reset();
	const { DiffUnavailableError } = await import('../../../../workflow/code-review/grounding.js');
	const { deps, writes } = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
		assembleDiffGrounding: async () => { throw new DiffUnavailableError('not a git repo'); },
	});
	const out = await declineTo(deps);
	assert.ok(out.next === 'error' && out.error.code === 'diff-unavailable', 'unreadable diff => diff-unavailable error');
	assert.ok(out.next === 'error' && out.error.retryable === true);
	assert.equal(writes.length, 0, 'no record written when the diff cannot be read');
});

// ac6 regression: the fresh graph path is byte-identical to s9 — runReview gets the DEFAULT opts (no degraded, no cap).
test('s10 ac6: a fresh index (no decline) still drives runReview with the DEFAULT opts (no groundingMode, no cap) and stamps full', async () => {
	await reset();
	const { runReview, opts } = reviewSpy();
	const { deps, writes } = await (async () => {
		const m = makeDeps({ runReview });   // makeDeps defaults to a fresh index
		const startEnv = await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, m.deps);
		const start = parse(startEnv);
		assert.ok(start.next === 'emit_judgements');
		const doneEnv = await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: start.state }, m.deps);
		return { deps: m.deps, writes: m.writes, done: parse(doneEnv) };
	})();
	void deps;
	assert.equal(opts.length, 1);
	assert.equal(opts[0]!.groundingMode, undefined, 'fresh path passes no groundingMode (⇒ full)');
	assert.equal(opts[0]!.capVerdictAtWarn, undefined, 'fresh path passes no cap');
	const json = writes.find(w => w.path.endsWith('.json'))!;
	const body = (JSON.parse(json.content) as { body: { groundingMode: string } }).body;
	assert.equal(body.groundingMode, 'full', 'the fresh path still stamps full');
});

// ---------------------------------------------------------------------------
// ISSUE-11e4fa88 — a finding dropped on scope is VISIBLE: carried on the record,
// rendered in the markdown, and reported on the response. The filter itself and
// the verdict are unchanged.
// ---------------------------------------------------------------------------

/** The flow from the issue's own measurement: findings about real source files
 *  submitted against a changed set that does not contain them. */
async function droppedFlow(): Promise<{ done: CodeReviewStepOutput; writes: { path: string; content: string }[] }> {
	await reset();
	return runFullFlow({}, judgements({
		adherence: [
			{ dimension: 'adherence', severity: 'MED', confidence: 'breach', location: 'src/elsewhere.ts:12', message: 'breaks the contract' },
			{ dimension: 'adherence', severity: 'HIGH', confidence: 'breach', location: 'src/elsewhere.ts:40', message: 'a | piped message' },
		],
		coverage: [
			{ dimension: 'coverage', severity: 'LOW', location: 'src/a.ts:3',      message: 'kept' },
			{ dimension: 'coverage', severity: 'MED', location: 'src/gone.ts:7',   message: 'untested branch' },
		],
	}));
}

test('11e4fa88 — dropped findings are carried on the record as outOfScope, verbatim, and never counted', async () => {
	const { done, writes } = await droppedFlow();
	assert.ok(done.next === 'done');
	// The verdict folds over the KEPT findings only: one LOW => pass. A HIGH and two
	// MEDs were submitted and dropped; none of them may move this.
	assert.equal(done.verdict, 'pass');
	assert.deepEqual(done.counts, { high: 0, med: 0, low: 1 });

	const body = (JSON.parse(writes.find(w => w.path.endsWith('.json'))!.content) as { body: { dimensions: DimensionResult[]; counts: unknown; verdict: string } }).body;
	assert.equal(body.verdict, 'pass');
	assert.deepEqual(body.counts, { high: 0, med: 0, low: 1 });
	const dim = (d: ReviewDimension): DimensionResult => body.dimensions.find(x => x.dimension === d)!;

	assert.deepEqual(dim('adherence').findings, [], 'nothing in scope for adherence');
	assert.deepEqual(dim('adherence').outOfScope, [
		{ dimension: 'adherence', severity: 'MED', confidence: 'breach', location: 'src/elsewhere.ts:12', message: 'breaks the contract' },
		{ dimension: 'adherence', severity: 'HIGH', confidence: 'breach', location: 'src/elsewhere.ts:40', message: 'a | piped message' },
	], 'both dropped findings are on the record exactly as submitted');
	assert.deepEqual(dim('coverage').findings.map(f => f.location), ['src/a.ts:3']);
	assert.deepEqual(dim('coverage').outOfScope?.map(f => f.location), ['src/gone.ts:7']);
	// A dimension with nothing dropped carries NO key — not an empty array.
	assert.ok(!('outOfScope' in dim('quality')), 'absent, so an untouched dimension is byte-identical to before');
	assert.ok(!('outOfScope' in dim('conventions')));
});

test('11e4fa88 — the response says how many were dropped, per dimension, and against how large a set', async () => {
	const { done } = await droppedFlow();
	assert.ok(done.next === 'done');
	assert.deepEqual(done.scopeDropped, {
		count: 3,
		changedFiles: CHANGED.length,
		byDimension: { adherence: 2, coverage: 1 },
	});
});

test('11e4fa88 — the markdown lists the dropped findings and says they are not counted', async () => {
	const { writes } = await droppedFlow();
	const md = writes.find(w => w.path.endsWith('.md'))!.content;
	assert.match(md, /\*\*Dropped as out of scope:\*\* 3 finding\(s\) named a file outside the 2 changed file\(s\)\. They are listed under their dimension and are NOT counted in the verdict above\./);
	assert.match(md, /^## adherence — 0 finding\(s\), 2 dropped as out of scope$/m);
	assert.match(md, /^_No findings in scope\._$/m, 'a dimension emptied by the filter no longer reads as a clean one');
	assert.match(md, /^## coverage — 1 finding\(s\), 1 dropped as out of scope$/m);
	assert.match(md, /^\| MED \| src\/elsewhere\.ts:12 \| breaks the contract \|$/m);
	assert.match(md, /^\| HIGH \| src\/elsewhere\.ts:40 \| a \\\| piped message \|$/m, 'dropped rows are cell-escaped like kept ones');
	assert.match(md, /^## quality — 0 finding\(s\)$/m, 'a dimension with no drops is rendered as before');
	// The headline still reports only what was counted.
	assert.match(md, /\*\*PASS\*\* — HIGH 0 · MED 0 · LOW 1 ·/);
});

test('11e4fa88 — with nothing dropped the response, the record and the markdown carry no trace of the feature', async () => {
	await reset();
	const { done, writes } = await runFullFlow({}, judgements({
		adherence: [{ dimension: 'adherence', severity: 'MED', location: 'src/a.ts:1', message: 'x' }],
	}));
	assert.ok(done.next === 'done');
	assert.ok(!('scopeDropped' in done), 'no key on the response');
	const json = writes.find(w => w.path.endsWith('.json'))!.content;
	const md = writes.find(w => w.path.endsWith('.md'))!.content;
	assert.ok(!json.includes('outOfScope'), 'no key anywhere on the record');
	assert.ok(!/out of scope|in scope/i.test(md), 'no dropped-findings wording in the markdown');
	assert.match(md, /^## conventions — 0 finding\(s\)\n\n_No findings\._$/m);
});

// ---- ISSUE-1102dc71 S001/t5: every diff fallback records why ----

/** A start that waits on stale freshness and times out on the resume. */
async function timedOutFallback(fresh: { inFlight: boolean; pendingCodeIndexJobs: number }, over: Partial<CodeReviewStepDeps> = {}) {
	let clock = 0;
	const made = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: true, ...fresh, staleFiles: ['src/a.ts'] }),
		now: () => clock,
		sleep: async () => { clock += 1000; },
		freshnessTimeoutMs: () => 2500,
		...over,
	});
	const cw = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, made.deps));
	assert.ok(cw.next === 'confirm_wait');
	const out = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: true }, made.deps));
	return { ...made, out };
}
/** Finish a controller-reviewed emit_judgements and return the done frame and the record body. */
async function finish(deps: CodeReviewStepDeps, writes: { path: string; content: string }[], out: CodeReviewStepOutput) {
	assert.ok(out.next === 'emit_judgements', JSON.stringify(out));
	const done = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: out.state }, deps));
	assert.ok(done.next === 'done', JSON.stringify(done));
	const json = writes.find(w => w.path.endsWith('.json'))!;
	return { done, body: (JSON.parse(json.content) as { body: { groundingMode: string; fallbackReason?: unknown | undefined } }).body };
}

test('a proceed:true wait that times out falls back with fallbackReason freshness-timeout carrying waitedMs, pendingCodeIndexJobs and staleFiles; proceed:false gives declined; a hollow grounding gives hollow-grounding; a fresh full review carries none; the daemon-reviewed path forwards the reason', async () => {
	// Timed out: the record and the done frame carry what the wait was still on.
	await reset();
	let t = await timedOutFallback({ inFlight: false, pendingCodeIndexJobs: 4 });
	let r = await finish(t.deps, t.writes, t.out);
	const timedOut = { kind: 'freshness-timeout', waitedMs: 3000, inFlight: false, pendingCodeIndexJobs: 4, staleFiles: ['src/a.ts'] };
	assert.deepEqual(r.body.fallbackReason, timedOut);
	assert.equal(r.body.groundingMode, 'degraded');
	assert.deepEqual((r.done as { fallbackReason?: unknown | undefined }).fallbackReason, timedOut);
	assert.match(t.writes.find(w => w.path.endsWith('.md'))!.content, /Reviewed on the diff:\*\* the wait for a fresh index timed out after 3 s .*queued: 4; stale files: src\/a\.ts/);

	// proceed:false: declined.
	await reset();
	const d = makeDeps({ fetchFreshness: async () => ({ ok: true, isProcessing: true, inFlight: true, pendingCodeIndexJobs: 0, staleFiles: [] }) });
	const cw = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, d.deps));
	assert.ok(cw.next === 'confirm_wait');
	r = await finish(d.deps, d.writes, parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: false }, d.deps)));
	assert.deepEqual(r.body.fallbackReason, { kind: 'declined' });

	// A fresh but hollow grounding: hollow-grounding.
	await reset();
	const h = makeDeps({ fetchGrounding: async () => ({ ok: true, grounding: hollowGrounding }) });
	r = await finish(h.deps, h.writes, parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, h.deps)));
	assert.deepEqual(r.body.fallbackReason, { kind: 'hollow-grounding' });

	// A fresh full review carries none, in the record or the done frame.
	await reset();
	const full = await runFullFlow();
	const fullBody = JSON.parse(full.writes.find(w => w.path.endsWith('.json'))!.content) as { body: Record<string, unknown> };
	assert.equal(fullBody.body['groundingMode'], 'full');
	assert.equal('fallbackReason' in fullBody.body, false);
	assert.equal('fallbackReason' in (full.done as object), false);
	assert.doesNotMatch(full.writes.find(w => w.path.endsWith('.md'))!.content, /Reviewed on the diff/);

	// The daemon-reviewed path (code the controller wrote) forwards the reason to the daemon and onto the done frame.
	await reset();
	const asked: unknown[] = [];
	t = await timedOutFallback({ inFlight: true, pendingCodeIndexJobs: 0 }, {
		readBuildAuthor: () => 'controller',
		reviewByDaemon: async (params) => {
			asked.push(params);
			return { runId: 'cr-d', artifact: { meta: { reviewedBy: 'daemon', model: 'm' }, body: { groundingMode: 'degraded', verdict: 'warn', counts: { high: 0, med: 0, low: 0 } } } as never };
		},
	});
	assert.ok(t.out.next === 'done', JSON.stringify(t.out));
	const sent = { kind: 'freshness-timeout', waitedMs: 3000, inFlight: true, pendingCodeIndexJobs: 0, staleFiles: ['src/a.ts'] };
	assert.deepEqual((asked[0] as { fallbackReason?: unknown | undefined }).fallbackReason, sent);
	assert.deepEqual((t.out as { fallbackReason?: unknown | undefined }).fallbackReason, sent);
});

test('on the controller-reviewed path, a timed-out wait saves the reason in the state and the judgements turn writes it to the record and the done frame, distinguishing queued-only from in-flight work', async () => {
	for (const fresh of [{ inFlight: false, pendingCodeIndexJobs: 2 }, { inFlight: true, pendingCodeIndexJobs: 0 }]) {
		await reset();
		const t = await timedOutFallback(fresh);
		assert.ok(t.out.next === 'emit_judgements');
		assert.equal(t.writes.length, 0, 'nothing is written before the judgements turn');
		// The reason crosses the turn only through the saved state.
		const r = await finish(t.deps, t.writes, t.out);
		const expected = { kind: 'freshness-timeout', waitedMs: 3000, ...fresh, staleFiles: ['src/a.ts'] };
		assert.deepEqual(r.body.fallbackReason, expected, JSON.stringify(fresh));
		assert.deepEqual((r.done as { fallbackReason?: unknown | undefined }).fallbackReason, expected);
	}
});

// ---- Story fa396bdf197b8e8b/s1: a stale file the index never takes ends in the degraded review ----

test('src/daemon/steps/code-review-step/__tests__/handler.test.ts: with proceed:true and a freshness that keeps reporting one stale file with an idle queue while other changed files have symbols, the wait ends at the freshness time-out in the degraded diff review (fallback reason freshness-timeout naming that file) and no full review runs', async () => {
	await reset();
	let groundingFetches = 0;
	const asked: unknown[] = [];
	const t = await timedOutFallback({ inFlight: false, pendingCodeIndexJobs: 0 }, {
		// idle queue, the same stale file on every poll, requested once and never indexed
		fetchFreshness: async () => { asked.push(1); return { ok: true, isProcessing: false, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: ['src/a.ts'], unindexedFiles: [] } as never; },
		// the other changed file (src/b.ts) has symbols; only the stale file (src/a.ts) has none
		fetchGrounding: async () => {
			groundingFetches++;
			return { ok: true, grounding: { symbols: [{ entityId: 'sym:src/b.ts#g', file: 'src/b.ts', kind: 'function', name: 'g', signature: 'g(): void', callers: [], callees: [], testsReaching: [] }] } };
		},
	});
	assert.ok(asked.length > 2, 'the wait kept polling until the time-out');
	assert.equal(groundingFetches, 0, 'no full review grounding was assembled');
	const r = await finish(t.deps, t.writes, t.out);
	assert.equal(r.body.groundingMode, 'degraded');
	assert.deepEqual(r.body.fallbackReason, { kind: 'freshness-timeout', waitedMs: 3000, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: ['src/a.ts'] });
});

test('full degraded and confirm-wait controller continuations use complete-frame admission and atomic call consumption', async () => {
	const { getStepStateStore } = await import('../../../threads/step-state.js');
	const { admitControllerFrame, controllerPolicy } = await import('../../../../workflow/review-pipeline/controller.js');
	const { saveState } = await import('../state-store.js');
	const largeGrounding: CodeReviewGrounding = { symbols: [{ ...grounding.symbols[0]!, signature: 'required source '.repeat(7000) }] };
	const { policy } = controllerPolicy(CONTROLLER_DECLARATION);
	for (const mode of ['full', 'degraded'] as const) {
		await reset();
		let release!: () => void, entered!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		const writing = new Promise<void>(resolve => { entered = resolve; });
		const { deps, writes } = makeDeps({
			fetchGrounding: async () => ({ ok: true, grounding: largeGrounding }),
			fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: mode === 'degraded' ? ['src/a.ts'] : [] }),
			assembleDiffGrounding: async () => ({ grounding: largeGrounding, changedFiles: CHANGED }),
			runReview: async (...args) => { entered(); await gate; return runCodeReview(...args); },
		});
		const initial = { phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' };
		const missing = parse(await rawControllerCall(initial, deps));
		assert.ok(missing.next === 'error' && missing.error.code === 'controller-budget-required');
		assert.equal(writes.length, 0);
		const unqualified = parse(await rawControllerCall({ ...initial, reviewBudget: { ...CONTROLLER_DECLARATION, profile: { ...CONTROLLER_DECLARATION.profile, qualification: 'managed-estimate' } } }, deps));
		assert.ok(unqualified.next === 'error');
		let env = await rawControllerCall({ ...initial, reviewBudget: CONTROLLER_DECLARATION }, deps);
		let frame = parse(env);
		if (mode === 'degraded') {
			assert.ok(frame.next === 'confirm_wait');
			const resume = { phase: 'start', state: frame.state, reply: { version: 1, generation: frame.call!['generation'], callId: frame.call!['callId'], answer: { proceed: false } } };
			const refused = parse(await rawControllerCall(resume, deps));
			assert.ok(refused.next === 'error' && refused.error.code === 'controller-budget-required');
			env = await rawControllerCall({ ...resume, reviewBudget: CONTROLLER_DECLARATION }, deps); frame = parse(env);
		}
		assert.ok(frame.next === 'emit_judgements');
		assert.equal(frame.prompts.length, 1); assert.equal(frame.grounding, undefined);
		const measured = admitControllerFrame(frame, policy, CONTROLLER_DECLARATION);
		assert.equal(measured.promptChars, JSON.stringify(env).length, 'the actual returned MCP envelope, escaping and schema are accounted');
		assert.equal(measured.schemaTokens, 0, 'embedded schema is counted once inside the complete frame');
		assert.throws(() => admitControllerFrame({ ...frame, prompts: Array.from({ length: 4 }, () => frame.next === 'emit_judgements' ? frame.prompts[0] : []) }, policy, CONTROLLER_DECLARATION), /controller-frame-over-budget/, 'four individually admitted requests do not form an admitted aggregate');
		let current: Extract<CodeReviewStepOutput, { next: 'emit_judgements' }> = frame;
		const requestFor = () => ({ phase: 'judgements', state: current.state, reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: current.call!['generation'], callId: current.call!['callId'], answer: { findings: [] } } });
		const wrongProfile = parse(await rawControllerCall({ ...requestFor(), reviewBudget: { ...CONTROLLER_DECLARATION, profile: { ...CONTROLLER_DECLARATION.profile, providerId: 'changed-host' } } }, deps));
		assert.ok(wrongProfile.next === 'error' && wrongProfile.error.code === 'budget-profile-mismatch');
		const overflow = parse(await rawControllerCall({ ...requestFor(), reviewBudget: { ...CONTROLLER_DECLARATION, hostContextReserveTokens: 1_000_000 } }, deps));
		assert.ok(overflow.next === 'error' && overflow.error.code === 'controller-frame-over-budget');
		const invalid = parse(await rawControllerCall({ ...requestFor(), reply: { ...requestFor().reply, answer: {} } }, deps));
		assert.ok(invalid.next === 'error' && invalid.error.code === 'controller-budget-incompatible');
		const malformed = parse(await rawControllerCall({ ...requestFor(), reply: { ...requestFor().reply, answer: { findings: [{ severity: 'HIGH', confidence: 'breach', location: 'src/a.ts', message: 'missing line' }] } } }, deps));
		assert.ok(malformed.next === 'error' && malformed.error.code === 'controller-budget-incompatible', 'record-level finding validation precedes call consumption');
		assert.equal(writes.length, 0, 'no rejected declaration/reply consumes work or persists');
		const seen = new Set<string>();
		for (;;) {
			seen.add(String(current.call!['dimension']));
			const request = requestFor();
			if (current.call!['dimension'] === 'quality') {
				const first = rawControllerCall(request, deps);
				await writing;
				assert.equal(writes.length, 0);
				const duplicate = parse(await rawControllerCall(request, deps));
				assert.ok(duplicate.next === 'error' && duplicate.error.code === 'review-state-busy', 'exclusive final claim spans awaited persistence');
				release(); const done = parse(await first); assert.equal(done.next, 'done');
				const n = writes.length; assert.ok(n > 0);
				const replay = parse(await rawControllerCall(request, deps)); assert.equal(replay.next, 'already_completed');
				assert.equal(writes.length, n, 'final replay has a receipt and cannot write twice');
				break;
			}
			const next = parse(await rawControllerCall(request, deps));
			assert.ok(next.next === 'emit_judgements', JSON.stringify(next));
			assert.notEqual(next.state, current.state, 'central commit rotates the consumed code-review token');
			const stale = parse(await rawControllerCall(request, deps)); assert.ok(stale.next === 'error' && stale.error.code === 'review-budget-state-stale');
			current = next;
		}
		assert.deepEqual([...seen], ['adherence', 'conventions', 'coverage', 'quality']);
		const legacy = await saveState({ runId: 'legacy', startedAtMs: 0, repo: '/repo', epicHash: EPIC, storyId: STORY, subject: subject(), grounding });
		const oldShape: any = parse(await rawControllerCall({ phase: 'judgements', state: legacy, judgements: judgements() }, deps));
		assert.equal(oldShape.error.code, 'review-budget-state-stale', 'actual legacy resumes need a fresh start even without new declaration/reply');
		const old = parse(await rawControllerCall({ ...requestFor(), state: legacy }, deps));
		assert.ok(old.next === 'error' && old.error.code === 'review-budget-state-stale');
		assert.equal((await getStepStateStore().read('code-review', legacy))?.token, legacy, 'legacy refusal does not consume other state');
	}
	// Real source partitioning plus refreshed host reserves uses the existing planner.
	await reset();
	let clock = 0;
	const symbols = Array.from({ length: 20 }, (_, i) => ({ ...grounding.symbols[0]!, entityId: `sym-${i}`, file: `src/f${i}.ts`, name: `f${i}`, signature: `source-${i}-` + 'evidence '.repeat(2500) }));
	const chunked = makeDeps({ now: () => clock, resolveSubject: async () => ({ ok: true, subject: { ...subject(), changedFiles: symbols.map(s => s.file) } }), fetchGrounding: async () => ({ ok: true, grounding: { symbols } }) });
	const reserve = { ...CONTROLLER_DECLARATION, hostContextReserveTokens: 50_000 };
	const chunkFrame = parse(await rawControllerCall({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo', reviewBudget: reserve }, chunked.deps));
	assert.ok(chunkFrame.next === 'emit_judgements', JSON.stringify(chunkFrame));
	assert.equal(chunkFrame.prompts.length, 1);
	const stored = (await getStepStateStore().read<import('../types.js').CodeReviewStepStatePayload>('code-review', chunkFrame.state))!.payload.controller!;
	const leaves = stored.job!.workUnits.filter(unit => !unit.replaced).length;
	assert.ok(leaves > 1, 'material and host reserve force real whole-atom partitioning');
	assert.equal(stored.job!.deadlineBudgetMs, leaves * 300_000);
	assert.equal(new Set(stored.job!.plan.chunks.flatMap(chunk => chunk.atomIds)).size, 20, 'every source atom remains in the plan');
	admitControllerFrame(chunkFrame, stored.policy, reserve);
	clock = stored.job!.deadlineAt! + 1;
	const lateRequest = { phase: 'judgements', state: chunkFrame.state, reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: chunkFrame.call!['generation'], callId: chunkFrame.call!['callId'], answer: {} } };
	const late = parse(await rawControllerCall(lateRequest, chunked.deps));
	assert.ok(late.next === 'error' && late.error.code === 'review-job-timeout');
	const cannotRevive = parse(await rawControllerCall(lateRequest, chunked.deps));
	assert.ok(cannotRevive.next === 'error' && cannotRevive.error.code === 'review-state-uncertain');
	assert.equal(chunked.writes.length, 0);
});

test('controller dimensions retain independent epochs and reject expired attempts and overflowing final reserves before writes', async () => {
	await reset(); let clock = 0;
	const { deps, writes } = makeDeps({ now: () => clock });
	const start = { phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo', reviewBudget: CONTROLLER_DECLARATION };
	const request = (frame: any, extra: Record<string, unknown> = {}) => ({ phase: 'judgements', state: frame.state, reviewBudget: CONTROLLER_DECLARATION,
		reply: { version: 1, generation: frame.call.generation, callId: frame.call.callId, answer: { findings: [] } }, ...extra });
	let frame: any = parse(await rawControllerCall(start, deps));
	clock = 200000;
	frame = parse(await rawControllerCall(request(frame), deps));
	assert.equal(frame.timing.deadlineAt, 500000, 'each dimension owns an independent five-minute allocation');
	assert.equal(frame.timing.logicalWorkUnits, 1); assert.equal(frame.timing.elapsedMs, 0); assert.equal(frame.timing.remainingMs, 300000);
	clock = 200000 + frame.timing.attemptLimitMs;
	assert.equal(clock, frame.timing.deadlineAt);
	const late: any = parse(await rawControllerCall(request(frame), deps));
	assert.equal(late.error.code, 'review-job-timeout'); assert.equal(late.error.retryable, false); assert.equal(writes.length, 0);
	await reset(); clock = 0;
	frame = parse(await rawControllerCall(start, deps));
	for (let i = 0; i < 3; i++) frame = parse(await rawControllerCall(request(frame), deps));
	assert.equal(frame.next, 'emit_judgements');
	const overflow: any = parse(await rawControllerCall(request(frame, { reviewBudget: { ...CONTROLLER_DECLARATION, hostContextReserveTokens: 200000 } }), deps));
	assert.equal(overflow.error.code, 'controller-frame-over-budget'); assert.equal(writes.length, 0);
	assert.equal(parse(await rawControllerCall(request(frame), deps)).next, 'done'); assert.ok(writes.length > 0);
});


test('controller source edits refuse stale answers and persisted run IDs match canonical paired events', async()=>{
 await reset();
 const repo=mkdtempSync(join(tmpdir(),'controller-source-fingerprint-'));
 mkdirSync(join(repo,'src'));writeFileSync(join(repo,'src/a.ts'),'export const a=1;');
 const current={...subject(),repoPath:repo};
 const events:{runId:string;event:string}[]=[];
 const {deps,writes}=makeDeps({resolveSubject:async()=>({ok:true,subject:current}),recordCallEvent:(_repo,runId,event)=>events.push({runId,event:event.event})});
 const start={phase:'start',epicHash:EPIC,storyId:STORY,repo,reviewBudget:CONTROLLER_DECLARATION};
 const request=(f:any)=>({phase:'judgements',state:f.state,reviewBudget:CONTROLLER_DECLARATION,reply:{version:1,generation:f.call.generation,callId:f.call.callId,answer:{findings:[]}}});
 try {
  let frame:any=parse(await rawControllerCall(start,deps));
  writeFileSync(join(repo,'src/a.ts'),'export const a=2;');
  const stale:any=parse(await rawControllerCall(request(frame),deps));
  assert.equal(stale.error.code,'review-source-changed');assert.equal(writes.length,0);
  await reset();
  frame=parse(await rawControllerCall(start,deps));
  const scopeDeps={...deps,resolveSubject:async()=>({ok:true as const,subject:{...current,changedFiles:[...current.changedFiles,'src/new.ts']}})};
  const enlarged:any=parse(await rawControllerCall(request(frame),{...scopeDeps,recordCallEvent:()=>{throw new Error('private recorder failure');}}));
  assert.equal(enlarged.error.code,'review-source-changed');assert.equal(writes.length,0);
  const replay:any=parse(await rawControllerCall(request(frame),scopeDeps));assert.equal(replay.error.code,'review-state-uncertain');

  await reset();events.length=0;
  frame=parse(await rawControllerCall(start,deps));
  while(frame.next==='emit_judgements')frame=parse(await rawControllerCall(request(frame),deps));
  assert.equal(frame.next,'done');
  const record=JSON.parse(writes.find(w=>w.path.endsWith('.json'))!.content);
  assert.ok(events.some(e=>e.event==='start'));assert.ok(events.some(e=>e.event==='success'));
  assert.ok(events.every(e=>e.runId===record.meta.runId));
 }finally{rmSync(repo,{recursive:true,force:true});}
});
