/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-aef82b03 S001/t2 — providers state their input budget: codex its own
 * stated limit, claude and Ollama none (their size refusal decides).
 *
 * Run: npx tsx --test src/agent/providers/__tests__/input-budget.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CliProvider } from '../cli-provider.js';
import { OllamaProvider } from '../ollama.js';
import type { LLMProvider } from '../../../shared/types.js';

test('a codex CliProvider reports 1048576; claude and Ollama report undefined', () => {
	const budget = (p: LLMProvider): number | undefined => p.inputBudgetChars;
	assert.equal(budget(new CliProvider({ kind: 'codex', model: 'm' })), 1048576);
	assert.equal(budget(new CliProvider({ kind: 'claude', model: 'm' })), undefined);
	assert.equal(budget(new OllamaProvider()), undefined);
});
