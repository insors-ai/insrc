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

import { handleCodeReviewStep, type CodeReviewStepDeps } from '../handler.js';
import { _clearCodeReviewStateStoreForTests } from '../state-store.js';
import { runCodeReview } from '../../../workflow/code-review/runner.js';
import { LEDGER_EXCLUDE_GLOBS } from '../../../workflow/runners/build/changed-files.js';
import { buildStartRelPath } from '../../../workflow/runners/build/range-base.js';
import type { CodeReviewStepOutput } from '../types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult, ReviewDimension } from '../../../workflow/code-review/types.js';

// ---- fixtures ----

// Under the S002 nested docs-tree, the CR record's md path is derived from the
// work-item identity, which requires a >=8-char lowercase-hex epicHash (see
// id.ts `hash8Of`). The hash-flat `CR-<epic>-<story>.json` id is unaffected.
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
		sleep:          async () => {},
		now:            () => 0,
		freshnessTimeoutMs: () => 120000,
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
	// T4 (LLD-1716f77ba9ba017b-S001): this tool's judgements are the controller's review.
	assert.equal((JSON.parse(json!.content) as { meta: { reviewedBy?: string } }).meta.reviewedBy, 'controller');
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

// ---------------------------------------------------------------------------
// s9 — the indexing-readiness freshness gate
// ---------------------------------------------------------------------------

// ac1: stale (staleFiles non-empty) and no proceed => confirm_wait, no grounding.
test('s9: start with a stale index (staleFiles) => next:confirm_wait with the stale list + state, and fetchGrounding is NEVER called', async () => {
	reset();
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
	reset();
	const { deps } = makeDeps({ fetchFreshness: async () => ({ ok: true, isProcessing: true, staleFiles: [] }) });
	const out = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(out.next === 'confirm_wait');
	assert.equal(out.isProcessing, true);
});

// ac4: fresh => straight to emit_judgements; the persisted record is groundingMode:'full'.
test('s9: a fresh index proceeds directly to emit_judgements and the persisted record is groundingMode:full (ac4)', async () => {
	reset();
	const { done, writes } = await runFullFlow();   // makeDeps defaults to fresh
	assert.ok(done.next === 'done');
	const json = writes.find(w => w.path.endsWith('.json'))!;
	const body = (JSON.parse(json.content) as { body: { groundingMode: string } }).body;
	assert.equal(body.groundingMode, 'full', 'the graph-grounded record is stamped full');
});

// ac2: proceed:true block-and-polls until fresh, never reindexes, then continues.
test('s9: proceed:true block-and-polls the freshness IPC (stale twice then fresh) then continues to emit_judgements', async () => {
	reset();
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
	reset();
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
	assert.deepEqual(out.grounding, diffGrounding, 'the emit_judgements frame carries the diff grounding (degraded)');
	assert.equal(writes.length, 0, 'nothing written yet — the write happens on the judgements turn');
});

// S001 ac1 (token hygiene): the confirm_wait token is consumed before the diff
// fallback runs, so a resend of it fails loadState (no leaked/double-usable token).
test('S001: the timeout auto-diff releases the confirm_wait token before the diff review', async () => {
	reset();
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
	assert.ok(resend.next === 'error' && resend.error.code === 'state-not-found', 'the confirm_wait token was released');
});

// S001 ac2: a FRESH index whose grounding is hollow (symbols:[]) auto-falls-back
// to the diff review instead of emitting a full-mode review over nothing.
test('S001: a fresh-but-hollow grounding (symbols:[]) auto-falls-back to the diff review, NOT a hollow full emit', async () => {
	reset();
	let diffCalls = 0;
	const { deps } = makeDeps({
		fetchGrounding: async () => ({ ok: true, grounding: hollowGrounding }),   // fresh but empty
		assembleDiffGrounding: async () => { diffCalls++; return { grounding: diffGrounding, changedFiles: DIFF_CHANGED }; },
	});
	const out = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(out.next === 'emit_judgements', 'hollow grounding => diff-only emit_judgements');
	assert.equal(diffCalls, 1, 'the diff grounding was assembled for the hollow case');
	assert.deepEqual(out.grounding, diffGrounding, 'the frame carries the diff grounding, not the empty full grounding');
});

// S001 ac2 (regression): a FRESH index with real (non-empty) grounding still
// uses the FULL graph path — the auto-diff fallback does NOT fire.
test('S001: a fresh index with >=1 changed-symbol still uses the FULL graph review (auto-diff does not fire)', async () => {
	reset();
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
	reset();
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
	reset();
	let diffCalls = 0;
	const { deps } = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
		assembleDiffGrounding: async () => { diffCalls++; return { grounding: diffGrounding, changedFiles: DIFF_CHANGED }; },
	});
	const declined = await declineTo(deps);
	assert.ok(declined.next === 'emit_judgements', 'decline => diff-only emit_judgements, not an error');
	assert.equal(diffCalls, 1, 'the diff grounding was assembled');
	assert.deepEqual(declined.grounding, diffGrounding, 'the emit_judgements frame carries the diff grounding');
});

// ac3 + ac4: the degraded judgements turn drives runReview with the degraded+cap opts and persists a record.
test('s10: the degraded judgements turn drives runReview with groundingMode:degraded + capVerdictAtWarn:true and persists a degraded record', async () => {
	reset();
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
	assert.equal((JSON.parse(json.content) as { meta: { reviewedBy?: string } }).meta.reviewedBy, 'controller');
});

// ISSUE-5f7a7cb9 S001/t7 (T48): the degraded path hands the assembler the Story's
// resolved base and the ledger globs. Driven against a REAL repo carrying a
// build-start file for this Story, so "the resolved base" is what the shipping
// resolver returns and not a value the test invented.
test('T48: the degraded review passes the Story\'s resolved range base and LEDGER_EXCLUDE_GLOBS to the diff assembler', async () => {
	reset();
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
		assert.deepEqual(seen[0], [repo, undefined, { base, excludeGlobs: LEDGER_EXCLUDE_GLOBS }]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T48: with no resolvable base the degraded review still passes the ledger globs, and an undefined base', async () => {
	reset();
	const seen: unknown[][] = [];
	const { deps } = makeDeps({
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: ['src/a.ts'] }),
		assembleDiffGrounding: async (...a: unknown[]) => { seen.push(a); return { grounding: diffGrounding, changedFiles: DIFF_CHANGED }; },
	});
	await declineTo(deps);
	assert.deepEqual(seen, [['/repo', undefined, { base: undefined, excludeGlobs: LEDGER_EXCLUDE_GLOBS }]]);
});

// error: the diff cannot be read => diff-unavailable, nothing written.
test('s10: a diff-unavailable failure (assembleDiffGrounding rejects) => next:error (diff-unavailable), no write', async () => {
	reset();
	const { DiffUnavailableError } = await import('../../../workflow/code-review/grounding.js');
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
	reset();
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
function droppedFlow(): Promise<{ done: CodeReviewStepOutput; writes: { path: string; content: string }[] }> {
	reset();
	return runFullFlow({}, judgements({
		adherence: [
			{ dimension: 'adherence', severity: 'MED',  location: 'src/elsewhere.ts:12', message: 'breaks the contract' },
			{ dimension: 'adherence', severity: 'HIGH', location: 'src/elsewhere.ts:40', message: 'a | piped message' },
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
		{ dimension: 'adherence', severity: 'MED',  location: 'src/elsewhere.ts:12', message: 'breaks the contract' },
		{ dimension: 'adherence', severity: 'HIGH', location: 'src/elsewhere.ts:40', message: 'a | piped message' },
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
	reset();
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
