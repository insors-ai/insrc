/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The free-form lookup on the shared helper (LLD-b9d5c5c40df5a574-s3, task t9):
 * the request size reaches the final emit through the tool loop, a conversation
 * that fits is answered at once at size S and in parts at size M, and a final
 * answer that cannot be written fails the lookup with the tool results kept and
 * the reason told apart, ending the request without a second attempt.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ModelCallFailedError, ModelResponseShapeError } from '../../../agent/providers/model-call-error.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import { _getRunnersForTest, _overrideRunnerForTest, executePlan, failedOutput } from '../../explore/executor.js';
import { runFreeformProbe } from '../../explore/freeform-probe.js';
import { LookupFailedError } from '../../explore/lookup-failed.js';
import type { Exploration, ExplorationPlan } from '../../explore/types.js';
import type { RequestMeasure } from '../../measure.js';
import {
	HandlingBudgetError, ShaperAnswerStepFailedError, ShaperFinalEmitFailed, _fallbackFreeformPlanForTest, _runExplorationPipelineForTest as pipeline,
	_runFinalStructuredEmitForTest as emit, runShaperToolLoop,
} from '../driver.js';
import type { PipelineSteps } from '../driver.js';
import type { ResolvedScope } from '../scope.js';
import type { HandlingReport } from '../../completeness.js';

const LAYERS = { system: 'sys', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: '' };
const NOW = '2026-10-08T10:00:00.000Z';
let dir = '';
let REPO = '';

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-freeform-handling-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

/** A conversation as the tool loop leaves it: the request, then tool calls and what they returned. */
function conversation(results: number, size: number): LLMMessage[] {
	const messages: LLMMessage[] = [{ role: 'system', content: 'You are the code shaper.' }, { role: 'user', content: 'how does settlement work?' }];
	for (let i = 0; i < results; i++) {
		messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: `c${i}`, name: 'search_grep', input: { pattern: `p${i}` } }] });
		messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: `c${i}`, content: `result${i} ${'r'.repeat(size)}`, isError: false }] });
	}
	return messages;
}

function provider(respond: (prompt: string, combine: boolean) => unknown, limitChars = 60_000): { provider: LLMProvider; calls: string[] } {
	const calls: string[] = [];
	const p = {
		inputBudgetChars: 16_000 + limitChars,
		completeStructured: async (messages: LLMMessage[], schema: { required?: string[] }) => {
			const last = messages[messages.length - 1];
			const prompt = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content);
			calls.push(prompt);
			const out = respond(prompt, (schema.required ?? []).length === 3);
			if (out instanceof Error) throw out;
			return out;
		},
	} as unknown as LLMProvider;
	return { provider: p, calls };
}

const execution = () => savedAnalysisExecution(REPO);
const SCOPE = (): ResolvedScope => ({ kind: 'repo', value: REPO, repoPath: REPO, lookupPath: REPO });
const LOOP_INPUTS = { intent: { target: 'code', scope: 'S', focused: true, focus: 'f', scopeRef: { kind: 'repo', value: '/x' }, reasoning: 'r' } } as never;

/** A model that makes one tool call (an unknown tool, so the input is what is gathered), then ends the loop; its answers come from `respond`. */
function loopProvider(respond: (prompt: string, combine: boolean) => unknown, call: { input: Record<string, unknown> }, limitChars = 12_000): LLMProvider {
	let turns = 0;
	return {
		supportsTools: true, inputBudgetChars: 16_000 + limitChars,
		complete: async () => (++turns === 1
			? { text: '', stopReason: 'tool_use', toolCalls: [{ id: 'c1', name: 'insrc_no_such_tool', input: call.input }] }
			: { text: 'done', stopReason: 'end_turn', toolCalls: [] }),
		completeStructured: async (messages: LLMMessage[], schema: { required?: string[] }) => {
			const last = messages[messages.length - 1];
			const out = respond(typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content), (schema.required ?? []).length === 3);
			if (out instanceof Error) throw out;
			return out;
		},
	} as unknown as LLMProvider;
}

test('size reaches runFinalStructuredEmit; fits at S returns directly with single-pass handling; at M divided although it fits', async () => {
	const part = (prompt: string): unknown => ({ ...LAYERS, summary: `covers ${[...prompt.matchAll(/result(\d)/g)].map(m => m[1]).join(',')}` });
	const respond = (prompt: string, combine: boolean): unknown => (combine ? { system: 'S', focus: 'F', summary: 'combined' } : part(prompt));

	// Size S and the conversation fits: one call, returned directly, single-pass handling.
	let handling: HandlingReport | undefined;
	const small = provider(() => LAYERS);
	const direct = await emit(small.provider, conversation(2, 400), 3, 20_480, undefined, execution(), h => { handling = h; }, 'S');
	assert.deepEqual(direct, LAYERS);
	assert.equal(small.calls.length, 1);
	assert.equal(handling?.method, 'single-pass');
	assert.equal(handling?.parts, 1);

	// Size M: the same conversation, which fits, is divided by the table.
	const table = provider(respond);
	const byTable = await emit(table.provider, conversation(2, 400), 3, 20_480, undefined, execution(), h => { handling = h; }, 'M');
	assert.equal(handling?.method, 'partitioned');
	assert.equal(handling?.trigger, 'size');
	assert.ok(table.calls.every(c => /THIS PART only/.test(c) || /Part summaries/.test(c)));
	assert.ok(byTable.structure.includes('result0') || byTable.summary.includes('0'), 'the results are in the answer');

	// A large conversation at size S does not fit: divided by the admission rule, every result kept.
	const big = provider(respond, 20_000);
	await emit(big.provider, conversation(8, 4_500), 3, 20_480, undefined, execution(), h => { handling = h; }, 'S');
	assert.equal(handling?.trigger, 'fit');
	assert.ok((handling?.parts ?? 0) >= 2);
	const seen = big.calls.filter(c => /THIS PART only/.test(c)).join('\n');
	for (let i = 0; i < 8; i++) assert.ok(seen.includes(`result${i} `), `result ${i} was given to a part`);

	// Without a size nothing changes: one call.
	const legacy = provider(() => LAYERS);
	await emit(legacy.provider, conversation(8, 4_500), 3, 20_480, undefined, execution());
	assert.equal(legacy.calls.length, 1);

	// The size travels from the tool loop's arguments to the final emit: the same loop answers at once at S and in parts at M.
	registerBuiltinTools();
	for (const [size, method] of [['S', 'single-pass'], ['M', 'partitioned']] as const) {
		const loop = await runShaperToolLoop({
			connectionExecution: execution(), runId: 'r', shaperId: 'code', invocationMode: 'run', inputs: LOOP_INPUTS, scope: SCOPE(),
			promptPath: 'prompts/analyze/code.system.md', provider: loopProvider(respond, { input: { q: 'charge' } }), size,
		});
		assert.equal(loop.handling?.method, method, `size ${size}`);
		assert.equal(loop.handling?.trigger, size === 'M' ? 'size' : undefined);
	}
});

const freeform: Exploration = { id: 'e1', type: 'freeform.probe', purpose: 'find charge', params: { purpose: 'find charge', shaperId: 'code' } };
const HANDLING: HandlingReport = { method: 'partitioned', parts: 2, partitionedBy: 'section', notCovered: [{ part: 'part 2', reason: 'bad' }], budgets: [] };
const originals = new Map<string, unknown>();
test.afterEach(() => { for (const [type, runner] of originals) _overrideRunnerForTest(type as never, runner as never); originals.clear(); });

test('HandlingBudgetError, model-failed and invalid-answer become LookupFailedError with tool results, handling and answerStepReason, errorCode \'answer-step:<reason>\', through executePlan with no second synthesis', async () => {
	registerBuiltinTools();
	// Each reason is raised by a real failure of the divided final answer, in the real tool loop:
	//  - a tool call whose own arguments (the block's envelope) leave no room for any evidence: nothing can be admitted;
	//  - every part's call failing at the transport; every part's reply staying invalid.
	const cases = [
		{ reason: 'input-does-not-fit', input: { q: 'p'.repeat(10_000) }, respond: () => LAYERS },
		{ reason: 'model-failed', input: { q: 'charge' }, respond: () => new ModelCallFailedError('claude exited with 1.', { cause: new Error('socket closed') }) },
		{ reason: 'invalid-answer', input: { q: 'charge' }, respond: () => new ModelResponseShapeError('reply failed validation', ['not JSON']) },
	] as const;
	for (const { reason, input, respond } of cases) {
		const loop = ((a: Parameters<typeof runShaperToolLoop>[0]) => runShaperToolLoop({ ...a, provider: loopProvider(respond, { input }) })) as unknown as Parameters<typeof runFreeformProbe>[2];
		const thrown = await runFreeformProbe(freeform, { connectionExecution: execution(), runId: 'r', repoPath: REPO, closureRepos: [REPO], readDep: () => undefined, requestSize: 'M' } as never, loop)
			.then(() => undefined, (e: unknown) => e);
		assert.ok(thrown instanceof LookupFailedError, `${reason}: ${String(thrown)}`);
		assert.equal(thrown.answerStepReason, reason);
		assert.equal(thrown.partial.length, 1, 'the tool results are kept');
		assert.match(thrown.partial[0]?.source ?? '', /^insrc_no_such_tool\(/);
		assert.equal(thrown.handling?.method, 'partitioned');
		assert.ok((thrown.handling?.notCovered.length ?? 0) >= 1, 'what was not covered is named');
		assert.ok(thrown.cause instanceof ShaperAnswerStepFailedError, 'the original typed failure is the cause');
		assert.equal(thrown.cause instanceof HandlingBudgetError, reason === 'input-does-not-fit');
		const out = failedOutput(freeform, thrown);
		assert.equal(out.errorCode, `answer-step:${reason}`);
		assert.deepEqual(out.handling, thrown.handling);

		// Through the real executor: the failure survives as a failed output; then the real context driver ends the request in the
		// matching answer-step failure, with the tool results and the report, and the answer is not synthesized again.
		if (!originals.has('freeform.probe')) originals.set('freeform.probe', _getRunnersForTest()['freeform.probe']);
		_overrideRunnerForTest('freeform.probe', (e, c) => runFreeformProbe(e, c, loop));
		let synthesized = 0;
		const plan: ExplorationPlan = { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: [freeform] } as unknown as ExplorationPlan;
		const steps: PipelineSteps = {
			decompose: async () => plan,
			executePlan: a => executePlan({ ...a, requestSize: 'M' }),
			synthesize: async () => { synthesized++; return LAYERS; },
			synthesizeHandled: async () => { synthesized++; return { layers: LAYERS, handling: HANDLING }; },
			fallbackFreeformPlan: _fallbackFreeformPlanForTest,
			lastIndexedAt: async () => 1_700_000_000_000,
			measureArea: async () => ({ source: 'named-area', items: 600, files: 100, characters: null, size: 'M', determined: true }) as RequestMeasure,
		};
		const err = await pipeline({
			connectionExecution: execution(), invocationMode: 'run', shaperId: 'code', runId: 'r1', scope: SCOPE(),
			inputs: { intent: { target: 'code', scope: 'M', focused: true, focus: 'f', scopeRef: { kind: 'repo', value: REPO }, reasoning: 'r' } } as never,
		}, steps).then(() => undefined, (e: unknown) => e);
		assert.ok(err instanceof ShaperAnswerStepFailedError, `${reason}: ${String(err)}`);
		assert.equal(err.reason, reason);
		assert.equal(err instanceof HandlingBudgetError, reason === 'input-does-not-fit');
		assert.equal(synthesized, 0, 'no second synthesis attempt');
		assert.equal(err.found.results.length, 1);
		const failed = err.found.results[0]?.output;
		assert.equal(failed?.type === 'failed' ? failed.partial?.length : 0, 1, 'the tool results are kept');
		assert.deepEqual(err.found.report.handling?.notCovered.map(n => n.part), thrown.handling?.notCovered.map(n => n.part), 'the report carries how the answer was handled');
		assert.equal(err.found.report.completeness.complete, false);
	}
});

test('single-pass final-emit failure (ShaperLlmUnavailableError, ShaperSchemaUnrecoverable) is normalised into the bridge and keeps findings', async () => {
	registerBuiltinTools();
	const scope: ResolvedScope = { kind: 'repo', value: REPO, repoPath: REPO, lookupPath: REPO };
	// A model that makes one tool call, then ends the loop; the final answer then fails.
	for (const [failure, reason] of [
		[new ModelCallFailedError('claude exited with 1.'), 'model-failed'],
		[new ModelResponseShapeError('reply failed validation', ['not JSON']), 'invalid-answer'],
	] as const) {
		let turns = 0;
		const p = {
			supportsTools: true,
			complete: async () => (++turns === 1
				? { text: '', stopReason: 'tool_use', toolCalls: [{ id: 'c1', name: 'insrc_no_such_tool', input: { q: 'charge' } }] }
				: { text: 'done', stopReason: 'end_turn', toolCalls: [] }),
			completeStructured: async () => { throw failure; },
		} as unknown as LLMProvider;
		const err = await runShaperToolLoop({
			connectionExecution: execution(), runId: 'r', shaperId: 'code', invocationMode: 'run',
			inputs: { intent: { target: 'code', scope: 'S', focused: true, focus: 'f', scopeRef: { kind: 'repo', value: REPO }, reasoning: 'r' } } as never,
			scope, promptPath: 'prompts/analyze/code.system.md', provider: p, size: 'S',
		}).then(() => undefined, (e: unknown) => e);
		assert.ok(err instanceof ShaperFinalEmitFailed, `${reason}: ${String(err)}`);
		assert.equal(err.reason, reason);
		assert.equal(err.toolResults.length, 1, 'the tool results gathered before the failed answer are kept');
		assert.match(err.toolResults[0]?.source ?? '', /^insrc_no_such_tool\(/);
	}
});
