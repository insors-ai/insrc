/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-aef82b03 S001/t2 — providers state their input budget: a CliProvider
 * reports the budget it is given (Epic ce99b72065d03b1b s3: the model
 * definitions give codex models their stated `chars` limit); claude and Ollama
 * none (their size refusal decides).
 *
 * Run: npx tsx --test src/agent/providers/__tests__/input-budget.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CliProvider } from '../cli-provider.js';
import { OllamaProvider } from '../ollama.js';
import type { LLMProvider } from '../../../shared/types.js';
import { familyProvider } from '../../../analyze/context/shaper-provider.js';
import { validateModelCatalog } from '../../../daemon/model-catalog.js';
import { getModelRegistry, _resetModelRegistryForTests, _setApprovedModelsPathForTests } from '../../../daemon/model-registry.js';

const budget = (p: LLMProvider): number | undefined => p.inputBudgetChars;

test('a CliProvider reports the budget it is given (absent when not given); Ollama reports undefined', () => {
	assert.equal(budget(new CliProvider({ kind: 'codex', model: 'm', inputBudgetChars: 4242 })), 4242);
	assert.equal(budget(new CliProvider({ kind: 'codex', model: 'm' })), undefined);
	assert.equal(budget(new CliProvider({ kind: 'claude', model: 'm' })), undefined);
	assert.equal(budget(new OllamaProvider()), undefined);
});

test("a provider built through the registry for a Codex model reports the definitions file's chars limit; a claude model none", () => {
	const store = mkdtempSync(join(tmpdir(), 'input-budget-'));
	try {
		_setApprovedModelsPathForTests(join(store, 'approved-models.json'));
		_resetModelRegistryForTests();
		const registry = getModelRegistry();
		const codex = validateModelCatalog().families.find(f => f.id === 'cli-codex')!.models[0]!;
		assert.equal(codex.inputLimit?.unit, 'chars');
		const built = familyProvider(registry, 'cli-codex', registry.find('cli-codex', codex.id));
		assert.equal(budget(built), codex.inputLimit!.max);
		assert.equal(budget(familyProvider(registry, 'cli-claude', registry.find('cli-claude', 'opus'))), undefined);
	} finally {
		_setApprovedModelsPathForTests(undefined);
		_resetModelRegistryForTests();
		rmSync(store, { recursive: true, force: true });
	}
});
