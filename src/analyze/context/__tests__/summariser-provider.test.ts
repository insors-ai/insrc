/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSummariserProvider } from '../shaper-provider.js';
import { OllamaProvider } from '../../../agent/providers/ollama.js';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import type { AnalyzeConfig, AnalyzeShaperProviderKind } from '../../../config/analyze.js';

function cfg(over: Partial<AnalyzeConfig> = {}): AnalyzeConfig {
	return {
		shaperProvider: 'ollama',
		shaperProviderExplicit: false,
		shaperModel: 'qwen3.6:35b-a3b',
		shaperModelExplicit: false,
		summariserProvider: 'ollama',
		summariserModel: 'qwen3.6:35b-a3b',
		summariserModelExplicit: false,
		shaper: { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumCtx: 32768, ollamaNumPredict: 20480 },
		maxPlanDepth: { XS: 2, S: 3, M: 4, L: 5, XL: 6 },
		...over,
	};
}

test('buildSummariserProvider: defaults to a local OllamaProvider', () => {
	assert.ok(buildSummariserProvider(cfg()) instanceof OllamaProvider);
});

test('buildSummariserProvider: stays LOCAL even when shaperProvider is a cloud CLI (the decoupling)', () => {
	const p = buildSummariserProvider(cfg({ shaperProvider: 'cli-claude', shaperProviderExplicit: true }));
	assert.ok(p instanceof OllamaProvider, 'summariser ignores shaperProvider — a cloud shaper must not drag the summariser to the CLI');
});

test('buildSummariserProvider: uses a CLI only when summariserProvider is explicitly cli-*', () => {
	for (const kind of ['cli-claude', 'cli-codex'] as AnalyzeShaperProviderKind[]) {
		assert.ok(buildSummariserProvider(cfg({ summariserProvider: kind })) instanceof CliProvider, kind);
	}
});
