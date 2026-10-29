/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `models.resolveRole` (Epic ce99b72065d03b1b, Story s3 · t7, HLD sc5): the
 * tier, model, effort and provider settings the daemon uses for a role in a
 * repo — equal to what its router resolves and its provider factory builds.
 *
 * Run: npx tsx --test src/daemon/__tests__/models-resolve-role.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assembleConfig, parseTiering, type AnalyzeConfig } from '../../config/analyze.js';
import { createRoleRouter } from '../../analyze/context/role-router.js';
import { CliProvider } from '../../agent/providers/cli-provider.js';
import { OllamaProvider } from '../../agent/providers/ollama.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import { _setModelCatalogDirForTests } from '../model-catalog.js';
import { getModelRegistry, _resetModelRegistryForTests, _setApprovedModelsPathForTests } from '../model-registry.js';
import { resolveRoleWire, type ResolvedRole } from '../model-definitions.js';

const SHAPER = { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumPredict: 12345 };
const DEPTH  = { XS: 2, S: 3, M: 4, L: 5, XL: 6 };
const REPO = '/w/repo';
const CRITICAL = 'design.contract.detail';   // core
const NARROW = 'analyze.narrow';             // cheap

const FIXTURE = {
	version: 1,
	defaultFamily: 'cli-codex',
	families: [
		{ id: 'cli-claude', cliKind: 'claude', displayName: 'C', models: [{ id: 'claude-a', efforts: ['low'] }], tierDefaults: { core: { model: 'claude-a' }, mid: { model: 'claude-a' }, cheap: { model: 'claude-a' } }, summariserModel: 'claude-a' },
		{ id: 'cli-codex', cliKind: 'codex', displayName: 'X', models: [{ id: 'gpt-x', aliases: ['x'], efforts: ['low', 'turbo'], inputLimit: { unit: 'chars', max: 5000 } }], tierDefaults: { core: { model: 'gpt-x', effort: 'turbo' }, mid: { model: 'gpt-x' }, cheap: { model: 'gpt-x' } }, summariserModel: 'gpt-x' },
		{ id: 'ollama', displayName: 'O', models: [{ id: 'llama:big', efforts: [], inputLimit: { unit: 'tokens', max: 65536 } }], toolLoopModel: 'llama:big' },
		{ id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }] },
		{ id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }], tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' }
	],
};

let dir: string;
before(() => {
	dir = mkdtempSync(join(tmpdir(), 'resolve-role-'));
	writeFileSync(join(dir, 'cloud-model-catalog.json'), JSON.stringify(FIXTURE));
	writeFileSync(join(dir, 'approved-models.json'), JSON.stringify({ version: 1, profiles: [
		{ family: 'cli-codex', modelId: 'gpt-gone', status: 'rejected', efforts: [], decidedAt: '2026-10-01T00:00:00Z', cliVersion: '0.1.0' },
	] }));
	_setModelCatalogDirForTests(dir);
	_setApprovedModelsPathForTests(join(dir, 'approved-models.json'));
	_resetModelRegistryForTests();
});
after(() => {
	_setModelCatalogDirForTests(undefined);
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	rmSync(dir, { recursive: true, force: true });
});

const configOf = (models: Record<string, unknown>): AnalyzeConfig => assembleConfig(parseTiering(models), SHAPER, DEPTH, getModelRegistry());
const resolveWith = (cfg: AnalyzeConfig, role: string): ResolvedRole => {
	const r = resolveRoleWire({ role, repoPath: REPO }, { config: () => cfg, registry: getModelRegistry });
	assert.ok(!('error' in r), JSON.stringify(r));
	return r;
};

test('models-resolve-role.test.ts: CLI and Ollama tiers match the router and provider settings; fallback reported for unlisted and rejected models; bad params refused; family, cli/ollama and inputLimit projected', () => {
	const cfg = configOf({
		tiers: { core: { runner: 'cli-codex', model: 'x', effort: 'turbo' }, cheap: { runner: 'ollama', model: 'llama:big' } },
		byRepo: { [REPO]: { tasks: { [NARROW]: 'cheap' } } },
	});
	const router = createRoleRouter({ registry: getModelRegistry() });

	// A CLI tier: the wire answer equals the router's provider.
	const cli = resolveWith(cfg, CRITICAL);
	const cliProvider = router.resolveProviderForRole(CRITICAL, cfg, REPO).provider as CliProvider;
	assert.ok(cliProvider instanceof CliProvider);
	assert.deepEqual(cli, { tier: 'core', family: 'cli-codex', model: 'gpt-x', effort: 'turbo', inputLimit: { unit: 'chars', max: 5000 }, cli: { kind: 'codex' } });
	assert.deepEqual([cliProvider.defaultModel, cliProvider.effort, cliProvider.inputBudgetChars, (cliProvider as unknown as { kind: string }).kind],
		[cli.model, cli.effort, cli.inputLimit?.max, cli.cli?.kind]);

	// An Ollama tier: host, num_ctx and num_predict as the provider factory uses them.
	const local = resolveWith(cfg, NARROW);
	const localProvider = router.resolveProviderForRole(NARROW, cfg, REPO).provider as OllamaProvider;
	assert.ok(localProvider instanceof OllamaProvider);
	assert.deepEqual(local, { tier: 'cheap', family: 'ollama', model: 'llama:big', inputLimit: { unit: 'tokens', max: 65536 }, ollama: { host: loadLocalProviderConfig().host, numCtx: 65536, numPredict: 12345 } });
	assert.equal((localProvider as unknown as { numCtx: number }).numCtx, local.ollama?.numCtx);
	assert.equal((localProvider as unknown as { model: string }).model, local.model);

	// Unlisted and rejected tier models: the tier default ran, and the answer says so.
	const fell = configOf({ tiers: { core: { runner: 'cli-codex', model: 'gpt-gone' }, mid: { runner: 'cli-claude', model: 'claude-retired' } } });
	assert.deepEqual(resolveWith(fell, CRITICAL).fallback, { reason: 'rejected-model', requested: 'gpt-gone' });
	assert.equal(resolveWith(fell, CRITICAL).model, 'gpt-x');
	assert.deepEqual(resolveWith(fell, 'design.decompose').fallback, { reason: 'unlisted-model', requested: 'claude-retired' });

	// role and clampedByFloor stay internal.
	assert.equal('role' in cli || 'clampedByFloor' in cli, false);

	// Bad params are refused.
	for (const bad of [undefined, null, {}, { role: CRITICAL }, { repoPath: REPO }, { role: '', repoPath: REPO }, { role: 3, repoPath: REPO }]) {
		assert.deepEqual(resolveRoleWire(bad, { config: () => cfg, registry: getModelRegistry }), { error: 'invalid-params: role and repoPath (non-empty strings) are required', recoverable: false }, JSON.stringify(bad));
	}
});
