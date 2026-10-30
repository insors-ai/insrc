/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provider construction from the model registry (Epic ce99b72065d03b1b, Story
 * s3 · t5). A fixture definitions file whose CLI kinds, efforts, input limits,
 * summariser and tool-loop models differ from the shipped ones shows that each
 * provider setting comes from the definitions.
 *
 * HOME points at a temp dir (config.json for models.local.coreModel and the
 * tiers) before any module resolves ~/.insrc.
 *
 * Run: npx tsx --test src/analyze/context/__tests__/provider-from-registry.test.ts
 */

import { test, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'provider-registry-'));
process.env['HOME'] = home;
const { PATHS } = await import('../../../shared/paths.js');
const { assembleConfig, loadAnalyzeConfig, parseTiering, resetAnalyzeConfigCache } = await import('../../../config/analyze.js');
const { resetLocalProviderConfigCache } = await import('../../../config/local.js');
const { buildShaperProvider, buildSummariserProvider, runWithRoutingContext } = await import('../shaper-provider.js');
const { localToolLoopModel } = await import('../driver.js');
const { createRoleRouter } = await import('../role-router.js');
const { resolveValidateProvider } = await import('../../../daemon/steps/build-step/phases/validate.js');
const { CliProvider } = await import('../../../agent/providers/cli-provider.js');
const { OllamaProvider } = await import('../../../agent/providers/ollama.js');
const { _setModelCatalogDirForTests } = await import('../../../daemon/model-catalog.js');
const { getModelRegistry, _resetModelRegistryForTests } = await import('../../../daemon/model-registry.js');
const { getLogger } = await import('../../../shared/logger.js');

const SHAPER = { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumPredict: 20480 };
const DEPTH  = { XS: 2, S: 3, M: 4, L: 5, XL: 6 };

/** cli-claude runs the codex binary here, so a provider's CLI kind can only have come from the definitions. */
const FIXTURE = {
	version: 1,
	defaultFamily: 'cli-codex',
	families: [
		{
			id: 'cli-claude', cliKind: 'codex', displayName: 'Claude (codex binary)',
			models: [
				{ id: 'claude-z', aliases: ['z'], efforts: ['low'] },
				{ id: 'claude-y', efforts: [] },
				// Like the shipped haiku: a token limit, which is not a chars input budget.
				{ id: 'claude-h', aliases: ['haiku'], efforts: ['low'], inputLimit: { unit: 'tokens', max: 1000000 } },
			],
			tierDefaults: { core: { model: 'z' }, mid: { model: 'z' }, cheap: { model: 'claude-y' } },
			summariserModel: 'claude-y',
		},
		{
			id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
			models: [
				{ id: 'gpt-x', efforts: ['low', 'turbo'], inputLimit: { unit: 'chars', max: 5000 } },
				{ id: 'gpt-s', efforts: ['low'], inputLimit: { unit: 'chars', max: 777 } },
			],
			tierDefaults: { core: { model: 'gpt-x', effort: 'turbo' }, mid: { model: 'gpt-x' }, cheap: { model: 'gpt-s' } },
			summariserModel: 'gpt-s',
		},
		{
			id: 'ollama', displayName: 'Ollama',
			models: [
				{ id: 'llama:small', efforts: [], inputLimit: { unit: 'tokens', max: 2048 } },
				{ id: 'llama:big', efforts: [], inputLimit: { unit: 'tokens', max: 65536 } },
				{ id: 'llama:loop', efforts: [], inputLimit: { unit: 'tokens', max: 8192 } },
			],
			toolLoopModel: 'llama:loop',
		},
		{ id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }] },
		{ id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }], tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' }
	],
};

const assets = join(home, 'assets');
mkdirSync(assets, { recursive: true });
writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(FIXTURE));
mkdirSync(dirname(PATHS.config), { recursive: true });

/** Write config.json and drop every cache that read the previous one. */
function useConfig(models: Record<string, unknown>): void {
	writeFileSync(PATHS.config, JSON.stringify({ models }));
	resetLocalProviderConfigCache();
	resetAnalyzeConfigCache();
}

beforeEach(() => {
	_setModelCatalogDirForTests(assets);
	_resetModelRegistryForTests();
	useConfig({});
});
after(() => {
	_setModelCatalogDirForTests(undefined);
	_resetModelRegistryForTests();
	rmSync(home, { recursive: true, force: true });
});

type Cli = InstanceType<typeof CliProvider>;
const kindOf = (p: unknown): string => (p as { kind: string }).kind;
const numCtxOf = (p: unknown): number => (p as { numCtx: number }).numCtx;

test("provider-from-registry.test.ts: CLI kind, effort acceptance (CliProvider gets no unaccepted effort), Codex chars budget, no haiku budget and Ollama num_ctx come from the registry; summariser uses the family's summariserModel", () => {
	const registry = getModelRegistry();
	const config = (tiers: Record<string, unknown>) => assembleConfig(parseTiering({ tiers }), SHAPER, DEPTH, registry);

	// The CLI kind is the family's cliKind; an accepted effort is forwarded.
	const claude = buildShaperProvider(config({ core: { runner: 'cli-claude', model: 'z', effort: 'low' } }), { registry }) as Cli;
	assert.ok(claude instanceof CliProvider);
	assert.equal(kindOf(claude), 'codex', "cli-claude's cliKind in the definitions");
	assert.equal(claude.defaultModel, 'claude-z');
	assert.equal(claude.effort, 'low');
	assert.equal(claude.inputBudgetChars, undefined, 'a model without a chars limit gets no budget');

	// An effort the model does not accept never reaches the CLI (also when the router asks for it).
	const noEffort = buildShaperProvider(config({ core: { runner: 'cli-claude', model: 'claude-y', effort: 'low' } }), { registry }) as Cli;
	assert.equal(noEffort.effort, undefined);
	const routed = buildShaperProvider(config({ core: { runner: 'cli-claude', model: 'claude-y' } }), { registry, roleRunner: 'cli-claude', roleModel: 'claude-y', roleEffort: 'turbo' }) as Cli;
	assert.equal(routed.effort, undefined);

	// A model whose limit is in tokens (haiku) gets no chars budget.
	const haiku = buildShaperProvider(config({ core: { runner: 'cli-claude', model: 'haiku' } }), { registry }) as Cli;
	assert.deepEqual([haiku.defaultModel, haiku.inputBudgetChars], ['claude-h', undefined]);

	// A Codex model's chars limit is its input budget.
	const codex = buildShaperProvider(config({ core: { runner: 'cli-codex', model: 'gpt-x', effort: 'turbo' } }), { registry }) as Cli;
	assert.deepEqual([codex.defaultModel, codex.effort, codex.inputBudgetChars], ['gpt-x', 'turbo', 5000]);

	// An Ollama tier's num_ctx is the model's token limit.
	const local = buildShaperProvider(config({ core: { runner: 'ollama', model: 'llama:big' } }), { registry });
	assert.ok(local instanceof OllamaProvider);
	assert.equal(numCtxOf(local), 65536);

	// The summariser pins the cheap tier's model, or the family's summariser model for one of another family.
	const cheap = buildSummariserProvider(config({ cheap: { runner: 'cli-codex', model: 'gpt-x' } }), { registry }) as Cli;
	assert.deepEqual([cheap.defaultModel, cheap.inputBudgetChars], ['gpt-x', 5000]);
	const foreign = assembleConfig(parseTiering({ tiers: { cheap: { runner: 'cli-codex', model: 'gpt-s' } } }), SHAPER, DEPTH, registry);
	const halfEdited = buildSummariserProvider({ ...foreign, summariserModel: 'claude-z' }, { registry }) as Cli;
	assert.deepEqual([halfEdited.defaultModel, halfEdited.inputBudgetChars], ['gpt-s', 777], "cli-codex's summariserModel");
	const ollamaSummariser = buildSummariserProvider(config({ cheap: { runner: 'ollama', model: 'llama:small' } }), { registry });
	assert.equal(numCtxOf(ollamaSummariser), 2048);
});

test('provider-from-registry.test.ts: tool loop follows ollama cheap tier, then listed coreModel, then toolLoopModel with a warning; num_ctx is the chosen model\'s limit', () => {
	const registry = getModelRegistry();
	const config = (tiers: Record<string, unknown>) => assembleConfig(parseTiering({ tiers }), SHAPER, DEPTH, registry);
	const warn = mock.method(getLogger('analyze:context:driver'), 'warn', () => undefined);
	try {
		// 1. The cheap tier resolved to the ollama family.
		useConfig({ local: { coreModel: 'llama:small' } });
		assert.deepEqual(localToolLoopModel(config({ cheap: { runner: 'ollama', model: 'llama:big' } }), registry), { model: 'llama:big', numCtx: 65536 });
		// 2. A CLI cheap tier: the listed coreModel.
		assert.deepEqual(localToolLoopModel(config({ cheap: { runner: 'cli-codex', model: 'gpt-s' } }), registry), { model: 'llama:small', numCtx: 2048 });
		assert.equal(warn.mock.callCount(), 0);
		// 3. An unlisted coreModel: the definitions' tool-loop model, with a warning naming it.
		useConfig({ local: { coreModel: 'qwen:gone' } });
		assert.deepEqual(localToolLoopModel(config({ cheap: { runner: 'cli-codex', model: 'gpt-s' } }), registry), { model: 'llama:loop', numCtx: 8192 });
		assert.equal(warn.mock.callCount(), 1);
		assert.deepEqual(warn.mock.calls[0]!.arguments[0], { requested: 'qwen:gone', model: 'llama:loop' });
	} finally {
		warn.mock.restore();
	}
});

test("provider-from-registry.test.ts: resolveValidateProvider reuses the router's CLI provider and builds the default family's tier default for an ollama resolution", async () => {
	const repo = join(home, 'repo');
	// 'build' is a critical role on the core tier.
	useConfig({ tiers: { core: { runner: 'cli-claude', model: 'z', effort: 'low' } } });
	const router = createRoleRouter({});
	const reused = await runWithRoutingContext({ router, repoPath: repo }, async () => resolveValidateProvider(repo));
	assert.equal(reused, router.resolveProviderForRole('build', loadAnalyzeConfig(), repo).provider, "the router's own provider");
	assert.deepEqual([(reused as Cli).defaultModel, (reused as Cli).effort], ['claude-z', 'low']);

	// An ollama core tier: the default family's (cli-codex) core default with its canonical model, accepted effort and budget.
	useConfig({ tiers: { core: { runner: 'ollama', model: 'llama:big' } } });
	const substituted = resolveValidateProvider(repo) as Cli;
	assert.ok(substituted instanceof CliProvider);
	assert.deepEqual([kindOf(substituted), substituted.defaultModel, substituted.effort, substituted.inputBudgetChars], ['codex', 'gpt-x', 'turbo', 5000]);
});

test("provider-from-registry.test.ts: an Ollama shaper never runs a CLI family's model, and the run label names what buildShaperProvider builds", async () => {
	const registry = getModelRegistry();
	const { shaperModelLabel } = await import('../shaper-provider.js');
	const config = (tiers: Record<string, unknown>) => assembleConfig(parseTiering({ tiers }), SHAPER, DEPTH, registry);

	// The client picks ollama while the core tier names a CLI model: the tool-loop model runs, not 'gpt-x'.
	const unset = { ...config({}), shaperProviderExplicit: false };
	const local = buildShaperProvider(unset, { registry, clientDefault: 'ollama' });
	assert.ok(local instanceof OllamaProvider);
	assert.equal((local as unknown as { model: string }).model, 'llama:loop');
	assert.equal(numCtxOf(local), 8192);
	assert.equal(shaperModelLabel(unset, { registry, clientDefault: 'ollama' }), 'ollama:llama:loop');

	// A listed CLI model: the label names it, as the provider runs it.
	const codex = config({ core: { runner: 'cli-codex', model: 'gpt-x' } });
	assert.equal((buildShaperProvider(codex, { registry }) as Cli).defaultModel, 'gpt-x');
	assert.equal(shaperModelLabel(codex, { registry }), 'codex:gpt-x');
	// A model of another family under the client's CLI: the CLI default runs, and the label says so.
	const claudeCore = { ...config({ core: { runner: 'cli-claude', model: 'z' } }), shaperProviderExplicit: false };
	assert.equal((buildShaperProvider(claudeCore, { registry, clientDefault: 'cli-codex' }) as Cli).defaultModel, undefined);
	assert.equal(shaperModelLabel(claudeCore, { registry, clientDefault: 'cli-codex' }), 'codex');
	// An Ollama tier with a listed model.
	const ollamaCore = config({ core: { runner: 'ollama', model: 'llama:big' } });
	assert.equal(shaperModelLabel(ollamaCore, { registry }), 'ollama:llama:big');
});

test("provider-from-registry.test.ts: the router's summariser resolution names the model its provider runs", async () => {
	const registry = getModelRegistry();
	const foreign = assembleConfig(parseTiering({ tiers: { cheap: { runner: 'cli-codex', model: 'gpt-s' } } }), SHAPER, DEPTH, registry);
	const halfEdited = { ...foreign, summariserModel: 'claude-z' };
	const { provider, resolution } = createRoleRouter({ registry }).resolveSummariser(halfEdited);
	assert.equal((provider as Cli).defaultModel, 'gpt-s');
	assert.equal(resolution.model, 'gpt-s');
	// An effort the substituted model does not accept is neither forwarded nor reported.
	const withEffort = createRoleRouter({ registry }).resolveSummariser({ ...halfEdited, summariserEffort: 'turbo' });
	assert.equal((withEffort.provider as Cli).effort, undefined);
	assert.equal(withEffort.resolution.effort, undefined);
	const accepted = createRoleRouter({ registry }).resolveSummariser({ ...halfEdited, summariserEffort: 'low' });
	assert.deepEqual([(accepted.provider as Cli).effort, accepted.resolution.effort], ['low', 'low']);
	const local = assembleConfig(parseTiering({ tiers: { cheap: { runner: 'ollama', model: 'llama:small' } } }), SHAPER, DEPTH, registry);
	const r = createRoleRouter({ registry }).resolveSummariser({ ...local, summariserModel: 'gpt-x' });
	assert.equal((r.provider as unknown as { model: string }).model, 'llama:loop');
	assert.equal(r.resolution.model, 'llama:loop');
});

// ── the Ollama-hosted family (Epic b220bb61, Story s1 · code-review fixes) ──

test('provider-from-registry.test.ts: a refused ollama-claude cheap tier makes the summariser refuse with model-not-supported, never substitute', async () => {
	const registry = getModelRegistry();
	const { summariserSelection } = await import('../shaper-provider.js');
	const { ModelNotSupportedError } = await import('../../../daemon/model-registry.js');
	const refused = assembleConfig(parseTiering({ tiers: { cheap: { runner: 'ollama-claude', model: 'kimi-k9:cloud' } } }), SHAPER, DEPTH, registry);
	assert.equal(refused.summariserProvider, 'ollama-claude');
	const isRefusal = (e: unknown): boolean => e instanceof ModelNotSupportedError
		&& e.family === 'ollama-claude' && e.requested === 'kimi-k9:cloud' && /model-not-supported/.test(e.message);
	assert.throws(() => summariserSelection(refused, { registry }), isRefusal);
	assert.throws(() => buildSummariserProvider(refused, { registry }), isRefusal);
	assert.throws(() => createRoleRouter({ registry }).resolveSummariser(refused), isRefusal);
	// A declared host model is selected as itself.
	const declared = assembleConfig(parseTiering({ tiers: { cheap: { runner: 'ollama-claude', model: 'glm:cloud' } } }), SHAPER, DEPTH, registry);
	assert.deepEqual([summariserSelection(declared, { registry }).family, summariserSelection(declared, { registry }).model.id], ['ollama-claude', 'glm:cloud']);
});

test("provider-from-registry.test.ts: the run label of an ollama-claude shaper names the host family, and attribution maps it there", async () => {
	const registry = getModelRegistry();
	const { shaperModelLabel } = await import('../shaper-provider.js');
	const { singleModelAttribution } = await import('../../../workflow/attribution.js');
	const host = assembleConfig(parseTiering({ tiers: { core: { runner: 'ollama-claude', model: 'glm:cloud' } } }), SHAPER, DEPTH, registry);
	const label = shaperModelLabel(host, { registry });
	assert.equal(label, 'ollama-claude:glm:cloud');
	// Attribution reads the shipped definitions, where ollama-claude is a family id.
	const stamp = singleModelAttribution(label).outputs[0]!;
	assert.deepEqual([stamp.runner, stamp.model], ['ollama-claude', 'glm:cloud']);
	const refused = assembleConfig(parseTiering({ tiers: { core: { runner: 'ollama-claude', model: 'kimi-k9:cloud' } } }), SHAPER, DEPTH, registry);
	assert.equal(shaperModelLabel(refused, { registry }), 'ollama-claude', 'no model: the bare family id, never the vendor CLI kind');
	assert.equal(singleModelAttribution('ollama-claude').outputs[0]!.runner, 'ollama-claude');
});

// ── provider construction for the Ollama-hosted family (Story s2 · t4) ───────

const OLLAMA_HOST = 'http://ollama.example:12345';

test('provider-from-registry.test.ts: familyProvider for ollama-claude builds a claude CliProvider with the model and an Ollama target from models.local.host; vendor families get none', async () => {
	const { familyProvider } = await import('../shaper-provider.js');
	useConfig({ local: { host: OLLAMA_HOST } });
	const registry = getModelRegistry();
	const p = familyProvider(registry, 'ollama-claude', registry.find('ollama-claude', 'glm:cloud'), { effort: 'low' }) as Cli;
	assert.ok(p instanceof CliProvider);
	assert.deepEqual([kindOf(p), p.defaultModel, p.effort, p.ollama], ['claude', 'glm:cloud', 'low', { host: OLLAMA_HOST, hosting: 'cloud' }]);
	// Through the tier path too.
	const cfg = assembleConfig(parseTiering({ tiers: { core: { runner: 'ollama-claude', model: 'glm:cloud' } } }), SHAPER, DEPTH, registry);
	assert.deepEqual((buildShaperProvider(cfg, { registry }) as Cli).ollama, { host: OLLAMA_HOST, hosting: 'cloud' });
	// Vendor families: no target.
	for (const [family, model] of [['cli-codex', 'gpt-x'], ['cli-claude', 'z'], ['cli-vibe', 'va']] as const) {
		assert.equal((familyProvider(registry, family, registry.find(family, model)) as Cli).ollama, undefined, family);
	}
});

test('provider-from-registry.test.ts: an effort a host model does not list is not forwarded', async () => {
	const { familyProvider } = await import('../shaper-provider.js');
	const registry = getModelRegistry();
	const warn = mock.method(getLogger('analyze:context:shaper-provider'), 'warn', () => undefined);
	try {
		const p = familyProvider(registry, 'ollama-claude', registry.find('ollama-claude', 'glm:cloud'), { effort: 'high' }) as Cli;
		assert.deepEqual([p.defaultModel, p.effort], ['glm:cloud', undefined]);
		assert.ok(p.ollama !== undefined);
		assert.deepEqual(warn.mock.calls.map(c => c.arguments[0]), [{ family: 'ollama-claude', model: 'glm:cloud', effort: 'high' }]);
	} finally {
		warn.mock.restore();
	}
});

test('provider-from-registry.test.ts: a refused ollama-claude tier makes buildShaperProvider, the router and resolveValidateProvider throw ModelNotSupportedError', async () => {
	const { ModelNotSupportedError } = await import('../../../daemon/model-registry.js');
	const { familyProvider } = await import('../shaper-provider.js');
	const registry = getModelRegistry();
	const refusal = (e: unknown): boolean => e instanceof ModelNotSupportedError && e.family === 'ollama-claude' && e.requested === 'kimi-k9:cloud';
	const cfg = assembleConfig(parseTiering({ tiers: { core: { runner: 'ollama-claude', model: 'kimi-k9:cloud' } } }), SHAPER, DEPTH, registry);
	assert.throws(() => buildShaperProvider(cfg, { registry }), refusal);
	// 'build' is a critical role on the core tier.
	useConfig({ tiers: { core: { runner: 'ollama-claude', model: 'kimi-k9:cloud' } } });
	const repo = join(home, 'repo');
	assert.throws(() => createRoleRouter({}).resolveProviderForRole('build', loadAnalyzeConfig(), repo), refusal);
	assert.throws(() => resolveValidateProvider(repo), refusal);
	// The backstop: familyProvider itself never builds a host-family provider without a model.
	assert.throws(() => familyProvider(registry, 'ollama-claude', undefined), (e: unknown) => e instanceof ModelNotSupportedError);
});
