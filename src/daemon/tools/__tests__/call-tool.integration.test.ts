/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t8: registered fake tools (structured and text-only) run through
 * callTool with the real executor, the real role taxonomy and a fake provider at the RoleRouter seam.
 * Run: npx tsx --test src/daemon/tools/__tests__/call-tool.integration.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@sinclair/typebox';

import type { AnalyzeConfig } from '../../../config/analyze.js';
import type { RoleRouter } from '../../../analyze/context/role-router.js';
import { callTool } from '../call-tool.js';
import { convertText } from '../convert-text.js';
import { createConversionProviders } from '../conversion-providers.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import type { ToolDeps, ToolResult } from '../types.js';
import { deps as baseDeps } from './_fakes.js';

const Out = Type.Object({ id: Type.String(), total: Type.Number() }, { additionalProperties: false });
const In = Type.Object({ name: Type.String() }, { additionalProperties: false });
const RAW = 'item abc-1 has 7 entries';

const cfg = {} as AnalyzeConfig;

/** A RoleRouter whose providers are a scripted fake; the log records every provider call by role. */
function fakeRouter(answers: unknown[]) {
	const log: string[] = [];
	const router: RoleRouter = {
		resolveProviderForRole: (role: string) => ({
			provider: {
				async completeStructured() { log.push(role); return answers.length > 1 ? answers.shift() : answers[0]; },
			},
			resolution: {},
		}) as never,
		resolveSummariser: () => { throw new Error('unused'); },
	};
	return { router, log };
}

const structuredTool = {
	id: 'it_structured', description: 'returns data directly', inputSchema: In, outputSchema: Out,
	async execute(): Promise<ToolResult> { return { output: 'text', format: 'text', success: true, data: { id: 'x', total: 1 } }; },
};

const textOnlyTool = {
	id: 'it_text_only', description: 'prints text; converts it itself', inputSchema: In, outputSchema: Out,
	async execute(_input: unknown, deps: ToolDeps): Promise<ToolResult> {
		const converted = await convertText({ toolId: 'it_text_only', rawText: RAW, schema: Out, keyValues: v => [v.id, String(v.total)] }, deps);
		if (converted.ok) return { output: RAW, format: 'text', success: true, data: converted.value };
		const message = `could not convert the output: ${converted.failure.detail}`;
		return { output: message, format: 'text', success: false, error: message, failure: { kind: 'conversion-failed', message, original: RAW } };
	},
};

function setup(answers: unknown[]) {
	_resetRegistryForTests();
	registerTool(structuredTool); registerTool(textOnlyTool);
	const { router, log } = fakeRouter(answers);
	const deps: ToolDeps = { ...baseDeps(), conversion: createConversionProviders(cfg, '/tmp/repo', router) };
	return { deps, log };
}

test('call-tool.integration.test.ts: a tool with structured output called through callTool returns typed data', async () => {
	const { deps } = setup([]);
	const r = await callTool(structuredTool, { name: 'a' }, deps);
	assert.equal(r.success, true);
	if (r.success) { assert.equal(r.data.id, 'x'); assert.equal(r.data.total, 1); }
});

test('call-tool.integration.test.ts: a tool with structured output called through callTool leaves the fake provider log empty', async () => {
	const { deps, log } = setup([]);
	await callTool(structuredTool, { name: 'a' }, deps);
	assert.deepEqual(log, []);
});

test('call-tool.integration.test.ts: a text-only tool called through callTool converts, checks and returns typed data', async () => {
	const { deps, log } = setup([{ id: 'abc-1', total: 7 }]);
	const r = await callTool(textOnlyTool, { name: 'a' }, deps);
	assert.equal(r.success, true);
	if (r.success) assert.deepEqual(r.data, { id: 'abc-1', total: 7 });
	assert.deepEqual(log, ['tools.convert'], 'one cheap call, no escalation');
});

test('call-tool.integration.test.ts: a text-only tool whose conversion fails returns a conversion-failed ToolFailure with the raw text in failure.original', async () => {
	// The model invents an id that the text does not contain, on every attempt of both tiers.
	const { deps, log } = setup([{ id: 'zzz-9', total: 7 }]);
	const r = await callTool(textOnlyTool, { name: 'a' }, deps);
	assert.equal(r.success, false);
	if (!r.success) {
		assert.equal(r.error.kind, 'conversion-failed');
		assert.equal(r.error.original, RAW);
		assert.match(r.error.message, /zzz-9/);
		assert.equal('data' in r, false);
	}
	assert.equal(log.length, 4);
});
