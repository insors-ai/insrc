/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The role router on global tiers (Epic ce99b72065d03b1b, Story s3 · t4): a
 * repo picks a tier for a role (tasks, coreFloor) but the runner, model and
 * effort behind every tier are the global tier's, as the registry resolved it;
 * the per-repo shaper override is gone.
 *
 * The registry reads the shipped definitions and an empty temp store.
 *
 * Run: npx tsx --test src/analyze/context/__tests__/role-router-global-tiers.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleConfig, parseTiering, type AnalyzeConfig } from '../../../config/analyze.js';
import { createRoleRouter, resolveRole } from '../role-router.js';
import { _resetModelRegistryForTests, _setApprovedModelsPathForTests } from '../../../daemon/model-registry.js';
import { modelSummary } from '../../../workflow/attribution.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SHAPER = { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumCtx: 32768, ollamaNumPredict: 20480 };
const DEPTH  = { XS: 2, S: 3, M: 4, L: 5, XL: 6 };
const REPO = '/w/repo';
const CRITICAL = 'design.contract.detail';     // critical, default tier core
const PERIPHERAL = 'design.decompose';         // peripheral, default tier mid

let store: string;
before(() => {
	store = mkdtempSync(join(tmpdir(), 'router-global-'));
	_setApprovedModelsPathForTests(join(store, 'approved-models.json'));
	_resetModelRegistryForTests();
});
after(() => {
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	rmSync(store, { recursive: true, force: true });
});

/** A config whose three global tiers differ, plus a repo entry carrying a stale tiers block. */
function config(models: Record<string, unknown> = {}): AnalyzeConfig {
	return assembleConfig(parseTiering({
		tiers: {
			core:  { runner: 'cli-codex',  model: 'gpt-6.1-sol', effort: 'high' },
			mid:   { runner: 'cli-claude', model: 'sonnet',      effort: 'low' },
			cheap: { runner: 'ollama',     model: 'qwen3.6:27b' },
		},
		byRepo: {
			[REPO]: {
				tasks: { [PERIPHERAL]: 'cheap', [CRITICAL]: 'mid' },
				coreFloor: 'core',
				tiers: { cheap: { runner: 'cli-claude', model: 'opus' }, core: { runner: 'ollama', model: 'qwen3.6:27b' } },
			},
		},
		...models,
	}), SHAPER, DEPTH);
}

test("role-router-global-tiers.test.ts: a repo's tasks choice picks the tier while runner, model and effort come from the global tier; byRepo coreFloor still clamps", () => {
	const cfg = config();
	// Without the repo: the taxonomy default tier, global models.
	assert.deepEqual(resolveRole(PERIPHERAL, cfg, undefined), { role: PERIPHERAL, tier: 'mid', runner: 'cli-claude', model: 'claude-sonnet-5', effort: 'low', clampedByFloor: false });

	// The repo's tasks pick cheap; the cheap tier is the GLOBAL one (ollama), not the repo's stale tiers block.
	assert.deepEqual(resolveRole(PERIPHERAL, cfg, REPO), { role: PERIPHERAL, tier: 'cheap', runner: 'ollama', model: 'qwen3.6:27b', clampedByFloor: false });

	// The repo assigns a critical role to mid; the repo's coreFloor (core) clamps it back up, to the global core tier.
	assert.deepEqual(resolveRole(CRITICAL, cfg, REPO), { role: CRITICAL, tier: 'core', runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'high', clampedByFloor: true });

	// The constructed providers agree with the record.
	const router = createRoleRouter({});
	const cheap = router.resolveProviderForRole(PERIPHERAL, cfg, REPO);
	assert.equal(cheap.provider.constructor.name, 'OllamaProvider');
	const core = router.resolveProviderForRole(CRITICAL, cfg, REPO);
	assert.equal(core.provider.constructor.name, 'CliProvider');
	assert.equal((core.provider as unknown as { defaultModel?: string }).defaultModel, 'gpt-6.1-sol');
});

test('role-router-global-tiers.test.ts: the RoleResolution keeps role, tier, runner, model, effort, clampedByFloor and adds fallback; workflow-rpc and workflow-review-rpc labels unchanged for a CLI and an Ollama tier', () => {
	// A tier set to an unlisted model falls back to the tier default and the record says so.
	const fell = config({ tiers: { core: { runner: 'cli-claude', model: 'claude-retired', effort: 'high' }, cheap: { runner: 'ollama', model: 'qwen3.6:27b' } } });
	const r = resolveRole(CRITICAL, fell, undefined);
	assert.deepEqual(Object.keys(r).sort(), ['clampedByFloor', 'fallback', 'model', 'role', 'runner', 'tier']);
	assert.deepEqual(r.fallback, { reason: 'unlisted-model', requested: 'claude-retired' });
	assert.deepEqual([r.runner, r.model, r.effort], ['cli-claude', 'claude-opus-5-5', undefined], 'the tier default runs at its own (absent) effort');
	const kept = resolveRole(CRITICAL, config(), undefined);
	assert.deepEqual(Object.keys(kept).sort(), ['clampedByFloor', 'effort', 'model', 'role', 'runner', 'tier']);
	const summariser = createRoleRouter({}).resolveSummariser(fell);
	assert.equal(summariser.resolution.fallback, undefined);

	// The labels both daemon paths build from the record keep their `runner:model` shape.
	const cfg = config();
	const cli = resolveRole(CRITICAL, cfg, undefined);
	const local = resolveRole(PERIPHERAL, cfg, REPO);
	const stamps = [cli, local].map(x => ({ role: x.role, tier: x.tier, runner: x.runner, model: x.model }));   // workflow-rpc providerFor
	assert.deepEqual(stamps.map(s => `${s.runner}:${s.model}`), ['cli-codex:gpt-6.1-sol', 'ollama:qwen3.6:27b']);   // workflow-review-rpc label
	assert.equal(modelSummary({ attribution: { outputs: [stamps[0]!] } } as never), 'cli-codex:gpt-6.1-sol');
	assert.equal(modelSummary({ attribution: { outputs: stamps } } as never), 'mixed(2: cli-codex:gpt-6.1-sol, ollama:qwen3.6:27b)');
	const rpc = readFileSync(join(SRC, 'daemon', 'workflow-rpc.ts'), 'utf8');
	assert.match(rpc, /stampByOutput\.set\(outputKey, \{ role: r\.role, tier: r\.tier, runner: r\.runner, model: r\.model \}\)/);
	const review = readFileSync(join(SRC, 'daemon', 'workflow-review-rpc.ts'), 'utf8');
	assert.match(review, /const label = `\$\{resolution\.runner\}:\$\{resolution\.model\}`;/);
});

test('role-router-global-tiers.test.ts: no source references readRepoOverride or resolveRepoShaper*', () => {
	const offenders: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) { walk(p); continue; }
			if (!/\.(ts|tsx|mts)$/.test(name) || p === fileURLToPath(import.meta.url)) continue;
			if (/\b(readRepoOverride|resolveRepoShaperProvider|resolveRepoShaperModel|RepoShaperOverride)\b|\brepoOverride\b/.test(readFileSync(p, 'utf8'))) offenders.push(relative(SRC, p));
		}
	};
	walk(SRC);
	assert.deepEqual(offenders, []);
});
