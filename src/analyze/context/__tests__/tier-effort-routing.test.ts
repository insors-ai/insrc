/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Routing the global tier's reasoning effort to every provider (Story
 * a27df028 S001, t4). Providers are constructed, never run: the effort a
 * CliProvider carries is what it would pass to the CLI (t3).
 *
 * Run: npx tsx --test src/analyze/context/__tests__/tier-effort-routing.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A temporary HOME before any module reads PATHS, for the validate provider's config read.
const HOME = mkdtempSync(join(tmpdir(), 'insrc-effort-'));
process.env['HOME'] = HOME;
mkdirSync(join(HOME, '.insrc'), { recursive: true });
writeFileSync(join(HOME, '.insrc', 'config.json'), JSON.stringify({ models: { tiers: {
	core:  { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'high' },
	mid:   { runner: 'cli-codex', model: 'gpt-6.1-sol' },
	cheap: { runner: 'cli-claude', model: 'haiku', effort: 'low' },
} } }));

const { assembleConfig, parseTiering } = await import('../../../config/analyze.js');
const { createRoleRouter } = await import('../role-router.js');
const { buildShaperProvider, buildSummariserProvider } = await import('../shaper-provider.js');
const { CliProvider } = await import('../../../agent/providers/cli-provider.js');
const { OllamaProvider } = await import('../../../agent/providers/ollama.js');
const { resolveValidateProvider } = await import('../../../daemon/steps/build-step/phases/validate.js');

const SHAPER = { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumCtx: 32768, ollamaNumPredict: 20480 };
const DEPTH  = { XS: 2, S: 3, M: 4, L: 5, XL: 6 };
const config = (models: Record<string, unknown>) => assembleConfig(parseTiering(models), SHAPER, DEPTH);
const effortOf = (p: unknown): unknown => (p instanceof CliProvider ? p.effort : 'not a CliProvider');

const CRITICAL = 'design.contract.detail'; // core
const PERIPH   = 'synthesize';             // mid
const NARROW   = 'analyze.narrow';         // cheap

test('the role router takes the effort of the global tier the role resolves to, also when a byRepo tier supplies its runner and model, and buildShaperProvider hands it to CliProvider; the Ollama branch ignores it', () => {
	const cfg = config({
		tiers: {
			core: { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'high' },
			mid:  { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'medium' },
			cheap: { runner: 'ollama', model: 'qwen3.6:27b', effort: 'low' },
		},
		byRepo: { '/r': { tiers: { core: { runner: 'cli-claude', model: 'opus', effort: 'low' } } } },
	});
	const router = createRoleRouter({});
	const core = router.resolveProviderForRole(CRITICAL, cfg);
	assert.equal(core.resolution.effort, 'high');
	assert.equal(effortOf(core.provider), 'high');
	assert.equal(effortOf(router.resolveProviderForRole(PERIPH, cfg).provider), 'medium');

	// The byRepo tier supplies runner and model; the effort is still the global core tier's.
	const repo = router.resolveProviderForRole(CRITICAL, cfg, '/r');
	assert.deepEqual([repo.resolution.runner, repo.resolution.model, repo.resolution.effort], ['cli-claude', 'opus', 'high']);
	assert.equal(effortOf(repo.provider), 'high');

	// The cheap tier runs on Ollama: no effort reaches it.
	const cheap = router.resolveProviderForRole(NARROW, cfg);
	assert.ok(cheap.provider instanceof OllamaProvider);
	assert.equal('effort' in cheap.provider, false);
});

test("buildShaperProvider without roleEffort uses cfg.shaperEffort (code-review-rpc, workflow-rpc and docgen callers), also when a repo override sets the runner; buildSummariserProvider and resolveSummariser use cfg.summariserEffort; resolveValidateProvider passes the build tier's effort", () => {
	const cfg = config({ tiers: {
		core:  { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'high' },
		cheap: { runner: 'cli-claude', model: 'haiku', effort: 'low' },
	} });
	// The non-router callers: no overrides (docgen), a repo override and a client default (code-review-rpc, workflow-rpc).
	assert.equal(effortOf(buildShaperProvider(cfg)), 'high');
	assert.equal(effortOf(buildShaperProvider(cfg, { repoOverride: 'cli-claude', clientDefault: 'cli-codex', cliTimeoutMs: 1000 })), 'high');
	// The summariser follows the cheap tier, and its stamped resolution says so.
	assert.equal(effortOf(buildSummariserProvider(cfg)), 'low');
	const summariser = createRoleRouter({}).resolveSummariser(cfg);
	assert.equal(summariser.resolution.effort, 'low');
	assert.equal(effortOf(summariser.provider), 'low');
	// The validate session runs on the build role's tier (core in the temporary config: high).
	assert.equal(effortOf(resolveValidateProvider('/tmp/insrc-effort-repo')), 'high');
});

test("with the core tier's effort set and the mid tier's unset, a routed mid role's provider gets no effort flag (roleEffort null), while a non-router caller gets the core effort", () => {
	const cfg = config({ tiers: {
		core: { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'max' },
		mid:  { runner: 'cli-codex', model: 'gpt-6.1-sol' },
	} });
	const mid = createRoleRouter({}).resolveProviderForRole(PERIPH, cfg);
	assert.equal(mid.resolution.tier, 'mid');
	assert.equal(mid.resolution.effort, undefined);
	assert.equal(effortOf(mid.provider), undefined, 'the mid role does not inherit core max');
	assert.equal(effortOf(buildShaperProvider(cfg, { roleRunner: 'cli-codex', roleModel: 'gpt-6.1-sol', roleEffort: null })), undefined);
	assert.equal(effortOf(buildShaperProvider(cfg)), 'max', 'a non-router caller runs at the core effort');
});
