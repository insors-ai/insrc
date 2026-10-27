/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s1 (sc1): the hook stage leaves the agent's read-only tool loop alone.
 * Run: npx tsx --test src/agent/__tests__/read-only-tool-loop.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { _resetToolHooksForTests, registerToolHook } from '../../daemon/tools/hooks.js';
import { _resetRegistryForTests, registerTool } from '../../daemon/tools/registry.js';
import { deps, fakeTool } from '../../daemon/tools/__tests__/_fakes.js';
import { runReadOnlyToolLoop } from '../read-only-tool-loop.js';

/** A provider that asks for one tool call, then ends. */
function oneCall(name: string) {
	let turn = 0;
	return {
		async complete() {
			if (turn++ === 0) return { text: '', stopReason: 'tool_use', toolCalls: [{ id: 'c1', name, input: {} }] };
			return { text: 'done', stopReason: 'end_turn', toolCalls: [] };
		},
	} as never;
}

async function run(name: string) {
	const seen: Array<{ ok: boolean; output: string }> = [];
	const res = await runReadOnlyToolLoop({
		provider: oneCall(name), messages: [{ role: 'user', content: 'go' }], tools: [],
		allow: new Set([name]), deps: deps(), maxTurns: 5,
		onTrace: e => { if (e.type === 'tool-response') seen.push({ ok: e.ok, output: e.output }); },
	});
	assert.equal(res.done, true);
	return seen;
}

test("read-only-tool-loop.test.ts: the read-only tool loop still returns the tool's output text unchanged when no rule is registered", async () => {
	_resetRegistryForTests(); _resetToolHooksForTests();
	registerTool(fakeTool('loop_plain', { output: 'plain text', format: 'text', success: true }, { schemas: false }));
	assert.deepEqual(await run('loop_plain'), [{ ok: true, output: 'plain text' }]);

	// a rule that passes changes nothing the agent reads; a rule that fails is told to the agent in the text
	registerToolHook({ id: 'passes', toolId: 'loop_plain', async run() {} });
	assert.deepEqual(await run('loop_plain'), [{ ok: true, output: 'plain text' }]);
	registerToolHook({ id: 'breaks', toolId: 'loop_plain', async run() { throw new Error('refresh failed'); } });
	assert.deepEqual(await run('loop_plain'), [{ ok: true, output: 'plain text\n[hook failed] breaks: refresh failed' }]);
	_resetRegistryForTests(); _resetToolHooksForTests();
});

test('review-only admission rechecks accumulated tools and history before every model turn', async () => {
	const { createReviewBudgetPolicy, admitReviewBudget, ReviewBudgetError } = await import('../../workflow/review-pipeline/budget.js');
	const { reviewToolsJson } = await import('../providers/review-budget.js');
	const { toOllamaMessages } = await import('../providers/ollama-wire.js');
	const { emitStructuredAnswer } = await import('../read-only-tool-loop.js');
	const { randomUUID } = await import('node:crypto');
	const tool = { name: 'budget_read', description: 'Read a fixture', inputSchema: { type: 'object', properties: {} } };
	const initial = [{ role: 'user' as const, content: 'review' }];
	const base = { profileVersion: 1 as const, providerId: 'fixture', transport: 'fixture', transportVersion: '1',
		schemaDialect: 'json-v1' as const, promptDialect: 'ollama-chat-v1' as const, qualification: 'managed-estimate' as const,
		declaredToolsJson: '[]', nativeReserveTokens: 0, transportReserveTokens: 0, completionReserveTokens: 64,
		inspectionReserveTokens: 0, contextWindowTokens: 12000 };
	const profile = { ...base, declaredToolsJson: reviewToolsJson(base, [tool]) };
	const policy = createReviewBudgetPolicy(profile, 'reviewer-session');
	const budget = { policy, admitted: admitReviewBudget(policy, { promptChars: JSON.stringify(toOllamaMessages(initial)).length, wireSchemaJson: '{}', phase: 'planning' }), outputAllowanceTokens: 64, reviewId: randomUUID(), callId: randomUUID(), stage: 'template', role: 'single', attempt: 1 };
	const huge = 'PRIVATE_REVIEW_EVIDENCE'.repeat(3000);
	const outputs: string[] = [];
	let turns = 0;
	let finals = 0;
	const provider = {
		getReviewBudgetProfile: () => profile,
		async complete(_messages: unknown, opts?: { maxTokens?: number }) {
			turns++; if (opts?.maxTokens !== undefined) assert.equal(opts.maxTokens, 64);
			return turns === 1 ? { text: '', stopReason: 'tool_use', toolCalls: [{ id: 'read1', name: 'budget_read', input: {} }] } : { text: 'done', stopReason: 'end_turn' };
		},
		async completeStructured() { finals++; return {}; },
	} as unknown as import('../../shared/types.js').LLMProvider;
	_resetRegistryForTests(); _resetToolHooksForTests();
	try {
		registerTool(fakeTool('budget_read', { output: huge, format: 'text', success: true }, { schemas: false }));
		const args = { provider, messages: initial, tools: [tool], allow: new Set(['budget_read']), deps: deps(), maxTurns: 4,
			onTrace: (event: import('../read-only-tool-loop.js').ToolLoopTraceEvent) => { if (event.type === 'tool-response') outputs.push(event.output); } };
		await assert.rejects(() => runReadOnlyToolLoop({ ...args, reviewBudget: budget }), e => e instanceof ReviewBudgetError && e.code === 'inspection-budget-exceeded');
		assert.equal(turns, 1, 'history growth is refused before the next model call');
		assert.deepEqual(outputs, [huge], 'the complete tool evidence is retained, never trimmed to fit');
		assert.deepEqual(initial, [{ role: 'user', content: 'review' }]);
		turns = 0; outputs.length = 0;
		assert.equal((await runReadOnlyToolLoop(args)).done, true, 'non-review callers keep their existing behavior');
		assert.equal(turns, 2); assert.deepEqual(outputs, [huge]);
		turns = 0;
		await assert.rejects(() => runReadOnlyToolLoop({ ...args, tools: [{ ...tool, description: 'changed manifest' }], reviewBudget: budget }), e => e instanceof ReviewBudgetError && e.code === 'budget-profile-mismatch');
		assert.equal(turns, 0, 'changed tools are not sent under an old profile');
		const history = [{ role: 'user' as const, content: huge }];
		await assert.rejects(() => emitStructuredAnswer({ provider, messages: history, instruction: 'Answer completely.', schema: { type: 'object' }, reviewBudget: budget }), e => e instanceof ReviewBudgetError && e.code === 'inspection-budget-exceeded');
		assert.equal(finals, 0, 'the final answer has no budget exemption');
		assert.equal(history[0]!.content, huge);
		await assert.rejects(() => emitStructuredAnswer({ provider, messages: initial, instruction: 'Answer.', schema: { type: 'object' }, reviewBudget: budget, maxTokens: 65 }), e => e instanceof ReviewBudgetError && e.code === 'budget-profile-mismatch');
		assert.equal(finals, 0, 'output allowance cannot be raised by final-answer options');
		const originalProfile = provider.getReviewBudgetProfile!;
		provider.getReviewBudgetProfile = () => { throw new Error('PRIVATE_PROFILE_FAILURE'); };
		await assert.rejects(() => runReadOnlyToolLoop({ ...args, reviewBudget: budget }), e => e instanceof ReviewBudgetError && e.code === 'native-budget-unqualified' && !e.message.includes('PRIVATE_PROFILE_FAILURE'));
		assert.equal(turns, 0);
		provider.getReviewBudgetProfile = originalProfile;
		const finalProfile = { ...profile, contextWindowTokens: 15000, declaredToolsJson: JSON.stringify([{ description: 't'.repeat(30000) }]) };
		const finalPolicy = createReviewBudgetPolicy(finalProfile, 'reviewer-session');
		const finalBudget = { ...budget, policy: finalPolicy, admitted: admitReviewBudget(finalPolicy, { promptChars: 100, wireSchemaJson: '{}', phase: 'planning' }) };
		provider.getReviewBudgetProfile = () => finalProfile;
		assert.deepEqual(await emitStructuredAnswer({ provider, messages: [{ role: 'user', content: 'h'.repeat(20000) }], instruction: 'Answer.', schema: { type: 'object' }, reviewBudget: finalBudget }), {});
		assert.equal(finals, 1, 'the final request counts its actual empty tool manifest, rather than charging stale tool definitions');
	} finally { _resetRegistryForTests(); _resetToolHooksForTests(); }
});
