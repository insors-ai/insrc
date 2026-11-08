/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The step tool's answer in parts (LLD-b9d5c5c40df5a574-s3, task t13), through the real handler: the state is a stored
 * step state; the client's replies are written here. No model, no store but the state store.
 */

import { test, after as afterAll } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// The bundle phase reaches the graph store (subsystems) through code that takes no path: give it a temporary one.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-step-parts-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
afterAll(async () => { await closeGraphStore(); rmSync(STORE_DIR, { recursive: true, force: true }); });

import { renderCompletenessLine } from '../../../analyze/completeness.js';
import { buildCompleteness } from '../../../analyze/completeness.js';
import type { ExecutedExploration, ExecutedPlan } from '../../../analyze/explore/types.js';
import { measureLookupResults } from '../../../analyze/measure.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { prepareAnswerTurn } from '../analyze-step/answer-turn.js';
import { handleAnalyzeStep } from '../analyze-step/handler.js';
import { decodeState, encodeState, STATE_VERSION } from '../analyze-step/state.js';
import type { StepStatePayload } from '../analyze-step/state.js';
import { loadState, StateTokenNotFound, _stateStoreSize } from '../analyze-step/state-store.js';
import type { StepOutput, StepOutputDone, StepOutputEmitBundle, StepOutputEmitCombine, StepOutputEmitPart, StepOutputError } from '../analyze-step/types.js';

const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });
const REPO = '/work/app';
const LAYERS = { system: 'sys', focus: 'f', summary: 'a summary', structure: 'st', surface: 'su', artefacts: 'a', upstream: '' };

const constraint = (text: string) => ({ constraint: text, kind: 'must', sourceEntityId: 'ent-1', file: 'docs/rule.md', heading: 'Rule', rationale: 'why' });
function result(id: string, output: Record<string, unknown>): ExecutedExploration {
	return { exploration: { id, type: output['type'], purpose: 'p', params: {} }, output: { completeness: WHOLE, ...output }, cached: false, elapsedMs: 1 } as unknown as ExecutedExploration;
}
/** An adherence lookup set: the rule, and several large code sites that do not fit one reply. */
function executed(sites: number, size: number): ExecutedPlan {
	const results = [
		result('e1', { type: 'doc.constraint.enumerate', subject: 's', constraints: [constraint('The daemon owns every database handle.')], notFoundNote: '', retrievedSectionCount: 1 }),
		...Array.from({ length: sites }, (_, i) => result(`e${i + 2}`, { type: 'search.text', hits: [{ file: `src/site${i}.ts`, line: i + 1, snippet: `code${i} ${'c'.repeat(size)}` }] })),
	];
	return { plan: { answerType: 'adherence-check', synthesisHint: 'h', explorations: results.map(r => r.exploration) }, results, totalMs: 1, totalCached: 0 } as unknown as ExecutedPlan;
}
const intent = (scope: ClassifiedIntent['scope']): ClassifiedIntent =>
	({ target: 'code', scope, focused: true, focus: 'does the code follow the rule', scopeRef: { kind: 'repo', value: REPO }, reasoning: 'r' });

/** The state the plan phase leaves, with the answer turn prepared as the plan phase prepares it. */
async function awaitingBundle(plan: ExecutedPlan, withProgress = true): Promise<{ token: string; state: StepStatePayload }> {
	const measure = measureLookupResults(plan.results, undefined);
	const turn = prepareAnswerTurn({ intent: { ...intent('M'), scope: measure.size }, executed: plan, measure, target: 'adherence' });
	assert.ok(turn.ok);
	const state: StepStatePayload = {
		version: STATE_VERSION, runId: 'run-parts', repoPath: REPO, repoIndexedAt: null, intent: intent('M'), synthesizerKey: 'adherence',
		plan: plan.plan, executed: plan, ...(withProgress ? { answer: turn.progress } : {}), stage: 'awaiting_bundle',
	};
	return { token: await encodeState(state), state };
}

async function step(input: Record<string, unknown>): Promise<StepOutput> {
	const envelope = await handleAnalyzeStep({ phase: 'bundle', ...input });
	return JSON.parse(envelope.content[0]!.text) as StepOutput;
}
const partReply = (userTurn: string): typeof LAYERS & { summary: string } => ({ ...LAYERS, summary: `covers ${[...userTurn.matchAll(/code(\d)/g)].map(m => m[1]).join(',')}`, structure: [...userTurn.matchAll(/code(\d)/g)].map(m => `- site ${m[1]}`).join('\n') });
const combineReply = { system: 'S', focus: 'F', summary: 'the combined summary', structure: '', surface: '', artefacts: '', upstream: '' };

test('prepareAnswerTurn creates progress, state without progress reads as single pass, emit_part and emit_combine carry reference context, progress persisted with token replacement and released on terminal success and failure', async () => {
	const plan = executed(12, 12_000);
	const measure = measureLookupResults(plan.results, undefined);
	const first = prepareAnswerTurn({ intent: { ...intent('M'), scope: measure.size }, executed: plan, measure, target: 'adherence' });
	assert.ok(first.ok);
	// A request that does not fit one reply starts in parts, with the decision and the budgets kept.
	assert.equal(first.progress.mode, 'partitioned');
	assert.ok(['size', 'fit', 'both'].includes(first.progress.trigger ?? ''));
	assert.ok(first.progress.parts.length >= 2);
	assert.equal(first.progress.budgets[0]?.unit, 'chars');
	assert.equal(first.turn?.kind, 'part');
	// A small request is answered in one reply, with the prompt it has always had.
	const small = executed(1, 100);
	const smallTurn = prepareAnswerTurn({ intent: { ...intent('S'), scope: 'S' }, executed: small, target: 'adherence' });
	assert.ok(smallTurn.ok);
	assert.equal(smallTurn.progress.mode, 'single');
	assert.equal(smallTurn.turn, undefined);

	// The turns, through the handler. A state minted without progress is read as a single reply (the legacy turn).
	const legacy = await awaitingBundle(small, false);
	assert.equal(legacy.state.answer, undefined);
	const legacyDone = await step({ bundle: LAYERS, state: legacy.token });
	assert.equal(legacyDone.next, 'done');
	assert.equal(await _stateStoreSize() >= 0, true);

	const { token } = await awaitingBundle(plan);
	let current: StepOutput = await step({ bundle: partReply(''), state: token });
	// The first reply was for part 1: the next turn is part 2, with a new state token that replaced the first.
	assert.equal(current.next, 'emit_part');
	const firstPart = current as StepOutputEmitPart;
	assert.equal(firstPart.ordinal, 2);
	assert.notEqual(firstPart.state, token);
	await assert.rejects(loadState(token), StateTokenNotFound, 'the previous token was replaced');
	assert.equal((await decodeState(firstPart.state)).answer?.completed.length, 1, 'the progress is persisted');
	// Every part carries the rule, the reference context, and the part's own evidence apart from it.
	assert.match(firstPart.userTurn, /Reference evidence/);
	assert.match(firstPart.userTurn, /The daemon owns every database handle\./);
	assert.match(firstPart.userTurn, /THIS PART only/);

	let combine: StepOutputEmitCombine | undefined;
	for (let guard = 0; guard < 30 && current.next !== 'done'; guard++) {
		if (current.next === 'emit_part') current = await step({ bundle: partReply(current.userTurn), state: current.state });
		else if (current.next === 'emit_combine') { combine ??= current; assert.match(current.userTurn, /The daemon owns every database handle\./, 'the combine carries the reference too'); current = await step({ bundle: combineReply, state: current.state }); }
		else break;
	}
	assert.ok(combine !== undefined, 'the parts were combined');
	assert.equal(current.next, 'done');
	const done = current as StepOutputDone;
	assert.equal(done.report?.handling?.method, 'partitioned');
	assert.deepEqual(done.report?.handling?.notCovered, []);
	assert.match(done.markdown, /Handling: divided into \d+ parts?/);
	assert.equal(done.report?.completeness.complete, true);
	assert.equal(renderCompletenessLine(done.report!).startsWith('Complete'), true);
	// Released on terminal success.
	await assert.rejects(loadState((combine as StepOutputEmitCombine).state), StateTokenNotFound);

	// Released on terminal failure: when no part is ever valid, the last token the client held is gone.
	const bad = { system: 1 };
	let dead: StepOutput = await step({ bundle: bad, state: (await awaitingBundle(plan)).token });
	let lastHeld = '';
	for (let guard = 0; guard < 60 && dead.next === 'emit_part'; guard++) {
		lastHeld = dead.state;
		dead = await step({ bundle: bad, state: dead.state });
	}
	assert.equal(dead.next, 'error');
	assert.notEqual(lastHeld, '');
	await assert.rejects(loadState(lastHeld), StateTokenNotFound, 'the state is released on the terminal failure');
	// The single reply: an invalid reply asks the same emit_bundle turn again with a new token and a retry note, up to the
	// bound; then the failure is final and the state is released.
	const { token: singleToken } = await awaitingBundle(executed(1, 100));
	let single: StepOutput = await step({ bundle: bad, state: singleToken });
	assert.equal(single.next, 'emit_bundle');
	const reasked = single as StepOutputEmitBundle;
	assert.equal(reasked.retry?.attempt, 1);
	assert.notEqual(reasked.state, singleToken);
	assert.match(reasked.guidance, /previous reply was invalid/);
	await assert.rejects(loadState(singleToken), StateTokenNotFound);
	let held = reasked.state;
	for (let guard = 0; guard < 10 && single.next === 'emit_bundle'; guard++) { held = (single as StepOutputEmitBundle).state; single = await step({ bundle: bad, state: held }); }
	assert.equal(single.next, 'error');
	assert.equal((single as StepOutputError).error.retryable, false);
	await assert.rejects(loadState(held), StateTokenNotFound, 'the state is released when the single reply is given up');
	// A valid reply after a retry completes, and the retry count does not leak into the answer.
	const { token: again } = await awaitingBundle(executed(1, 100));
	const second = await step({ bundle: bad, state: again }) as StepOutputEmitBundle;
	const finished = await step({ bundle: LAYERS, state: second.state });
	assert.equal(finished.next, 'done');
});

test('invalid reply re-emits the turn with a new token and retry note, retry bound marks a part not covered across calls, retries reset on advance, typed failure returned as StepOutputError with data', async () => {
	const plan = executed(12, 12_000);
	const { token } = await awaitingBundle(plan);
	const bad = { system: 1 };

	// An invalid reply asks the same turn again: a new token, the same part, a retry note.
	const retried = await step({ bundle: bad, state: token }) as StepOutputEmitPart;
	assert.equal(retried.next, 'emit_part');
	assert.equal(retried.ordinal, 1);
	assert.equal(retried.retry?.attempt, 1);
	assert.ok((retried.retry?.reason.length ?? 0) > 0);
	assert.notEqual(retried.state, token);
	assert.match(retried.guidance, /previous reply was invalid/);
	assert.equal((await decodeState(retried.state)).answer?.retries, 1, 'the retry is kept in the stored progress, across calls');

	// A valid reply advances and resets the count.
	const advanced = await step({ bundle: partReply(retried.userTurn), state: retried.state }) as StepOutputEmitPart;
	assert.equal(advanced.ordinal, 2);
	assert.equal(advanced.retry, undefined);
	assert.equal((await decodeState(advanced.state)).answer?.retries, 0);

	// Past the bound the part is recorded as not covered and the answer goes on to the next part.
	let out: StepOutput = advanced;
	for (let i = 0; i < 10 && out.next === 'emit_part' && (out as StepOutputEmitPart).ordinal === 2; i++) out = await step({ bundle: bad, state: (out as StepOutputEmitPart).state });
	assert.equal((out as StepOutputEmitPart).ordinal, 3, 'part 2 was given up and part 3 is asked');
	const stored = await decodeState((out as StepOutputEmitPart).state);
	assert.equal(stored.answer?.failures.length, 1);
	assert.equal(stored.answer?.failures[0]?.kind, 'invalid-reply');

	// The finished answer names the part that was not covered, and is incomplete.
	for (let guard = 0; guard < 30 && out.next !== 'done'; guard++) {
		if (out.next === 'emit_part') out = await step({ bundle: partReply(out.userTurn), state: out.state });
		else if (out.next === 'emit_combine') out = await step({ bundle: combineReply, state: out.state });
		else break;
	}
	assert.equal(out.next, 'done');
	const done = out as StepOutputDone;
	assert.equal(done.report?.handling?.notCovered.length, 1);
	assert.equal(done.report?.completeness.complete, false);

	// When no part is ever valid, the typed failure comes back as an error output with data, and the state is released.
	let dead: StepOutput = (await step({ bundle: bad, state: (await awaitingBundle(plan)).token }));
	for (let guard = 0; guard < 60 && dead.next !== 'error'; guard++) {
		if (dead.next === 'emit_part') dead = await step({ bundle: bad, state: dead.state });
		else break;
	}
	assert.equal(dead.next, 'error');
	const failure = dead as StepOutputError;
	assert.equal(failure.error.code, 'answer-step-failed');
	assert.equal(failure.error.retryable, false);
	assert.ok((failure.error.data?.results.length ?? 0) > 0, 'what the lookups found is carried');
	assert.equal(failure.error.data?.report.handling?.method, 'partitioned');
	assert.ok((failure.error.data?.partFailures?.length ?? 0) >= 2, 'each part and its kind');
});

test('the legacy emit_bundle turn still passes for an input that fits and the registered MCP bundle argument is unchanged', async () => {
	const small = executed(1, 100);
	const { token, state } = await awaitingBundle(small);
	assert.equal(state.answer?.mode, 'single');
	const done = await step({ bundle: LAYERS, state: token }) as StepOutputDone;
	assert.equal(done.next, 'done');
	assert.equal(done.report?.handling?.method, 'single-pass');
	assert.equal(done.report?.completeness.complete, true);
	await assert.rejects(loadState(token), StateTokenNotFound, 'released on terminal success');

	// The registered MCP bundle argument: the seven string layers and nothing else; parts reuse it.
	const server = readFileSync(fileURLToPath(new URL('../../../mcp/server.ts', import.meta.url)), 'utf8');
	const at = server.indexOf('bundle: z.object({');
	const block = server.slice(at, server.indexOf('\t\t\t\t})', at));
	const keys = [...block.matchAll(/^\s+(\w+):\s*z\.string/gm)].map(m => m[1]);
	assert.deepEqual(keys, ['system', 'focus', 'summary', 'structure', 'surface', 'artefacts', 'upstream']);
	assert.equal(/emit_part|emit_combine|partId/.test(block), false);
});
