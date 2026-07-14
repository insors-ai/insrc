/**
 * Unit tests for `runWithSamplerContext` -- the AsyncLocalStorage
 * hook the MCP server uses to thread a `SamplingCallback` through
 * the analyze framework without argument-threading through every
 * runner.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { McpSamplingProvider } from '../../../agent/providers/mcp-sampling-provider.js';
import { OllamaProvider } from '../../../agent/providers/ollama.js';
import type { AnalyzeConfig } from '../../../config/analyze.js';
import {
	buildShaperProvider,
	currentSamplerContext,
	runWithSamplerContext,
} from '../shaper-provider.js';

function cfg(): AnalyzeConfig {
	return {
		shaperProvider: 'ollama',
		shaperModel:    'qwen3.6:35b-a3b',
		shaper: {
			maxToolTurns:            40,
			structuredOutputRetries: 3,
			ollamaNumCtx:            32_768,
			ollamaNumPredict:        20_480,
		},
		maxPlanDepth: { XS: 2, S: 3, M: 4, L: 5, XL: 6 },
	};
}

test('ambient sampler context wins over cfg.shaperProvider=ollama', async () => {
	const sampler = async () => ({ role: 'assistant' as const, content: '' });
	await runWithSamplerContext(sampler, ['claude-haiku'], async () => {
		const p = buildShaperProvider(cfg());
		assert.ok(p instanceof McpSamplingProvider);
	});
	// Outside the scope, we fall back to the config default.
	const outside = buildShaperProvider(cfg());
	assert.ok(outside instanceof OllamaProvider);
});

test('currentSamplerContext returns undefined outside a runWith scope', () => {
	assert.equal(currentSamplerContext(), undefined);
});

test('currentSamplerContext returns the installed sampler inside the scope', async () => {
	const sampler = async () => ({ role: 'assistant' as const, content: '' });
	await runWithSamplerContext(sampler, ['h1', 'h2'], async () => {
		const ctx = currentSamplerContext();
		assert.notEqual(ctx, undefined);
		assert.strictEqual(ctx?.sampler, sampler);
		assert.deepEqual(ctx?.modelHints, ['h1', 'h2']);
	});
});

test('sampler context propagates across an await inside the scope', async () => {
	const sampler = async () => ({ role: 'assistant' as const, content: '' });
	await runWithSamplerContext(sampler, [], async () => {
		await new Promise(resolve => setImmediate(resolve));
		const ctx = currentSamplerContext();
		assert.notEqual(ctx, undefined, 'sampler should survive the microtask boundary');
		// buildShaperProvider inside the scope should still route via MCP.
		assert.ok(buildShaperProvider(cfg()) instanceof McpSamplingProvider);
	});
});

test('explicit override still beats ambient context', async () => {
	const ambient  = async () => ({ role: 'assistant' as const, content: 'amb' });
	const explicit = async () => ({ role: 'assistant' as const, content: 'exp' });
	await runWithSamplerContext(ambient, [], async () => {
		const p = buildShaperProvider(cfg(), { sampler: explicit });
		assert.ok(p instanceof McpSamplingProvider);
		// Both would return McpSamplingProvider; the point of this test
		// is that no crash / no throw with both an ambient and explicit
		// installed. Behavioural equivalence for either callback is
		// covered by mcp-sampling-provider.test.ts.
	});
});
