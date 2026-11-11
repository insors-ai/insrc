/**
 * Document relationships default to cheap, including local Ollama, and
 * preserve explicitly configured mid-tier CLI providers.
 *
 * The registry reads the shipped definitions and an empty temp store.
 *
 * Run: npx tsx --test src/indexer/__tests__/doc-relations-provider.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assembleConfig, parseTiering, type AnalyzeConfig } from '../../config/analyze.js';
import { reasoningRoleTaxonomy } from '../../config/role-taxonomy.js';
import { createRoleRouter } from '../../analyze/context/role-router.js';
import { runWithRoutingContext } from '../../analyze/context/shaper-provider.js';
import { _resetModelRegistryForTests, _setApprovedModelsPathForTests, getModelRegistry } from '../../daemon/model-registry.js';
import { CliExitError, CliProvider, CliStallError } from '../../agent/providers/cli-provider.js';
import { OllamaProvider } from '../../agent/providers/ollama.js';
import { ModelCallFailedError } from '../../agent/providers/model-call-error.js';
import {
	classifyDocRelationsFailure,
	DOC_RELATIONS_ROLE,
	DocRelationsOutputInvalid,
	failureMessage,
	selectDocRelationsProvider,
} from '../doc-relations-provider.js';

const SHAPER = { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumCtx: 32768, ollamaNumPredict: 20480 };
const DEPTH  = { XS: 2, S: 3, M: 4, L: 5, XL: 6 };
const REPO = '/w/repo';

let store: string;
before(() => {
	store = mkdtempSync(join(tmpdir(), 's10-t4-'));
	_setApprovedModelsPathForTests(join(store, 'approved-models.json'));
	_resetModelRegistryForTests();
});
after(() => {
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	rmSync(store, { recursive: true, force: true });
});

function config(extra: Record<string, unknown> = {}, cheap: Record<string, unknown> = { runner: 'cli-claude', model: 'haiku' }): AnalyzeConfig {
	return assembleConfig(parseTiering({
		tiers: {
			core:  { runner: 'cli-codex',  model: 'gpt-6.1-sol' },
			mid: { runner: 'cli-claude', model: 'sonnet' },
			cheap,
		},
		...extra,
	}), SHAPER, DEPTH);
}

test('document relationships default to the peripheral cheap tier', () => {
	const role = reasoningRoleTaxonomy().roles.find(r => r.id === DOC_RELATIONS_ROLE);
	assert.deepEqual(role, { id: 'indexer.docRelations', criticality: 'peripheral', defaultTier: 'cheap' });
	const chosen = selectDocRelationsProvider(config(), REPO);
	assert.ok(chosen.ok);
	assert.ok(chosen.provider instanceof CliProvider);
	assert.match(chosen.modelId, /haiku/);
});

test('cheap Ollama and explicit mid CLI selection work with and without a router', async () => {
	const local = config({}, { runner: 'ollama', model: 'qwen3.8:27b' });
	const mid = config({ byRepo: { [REPO]: { tasks: { [DOC_RELATIONS_ROLE]: 'mid' } } } });
	for (const route of [false, true]) {
		const select = async (cfg: AnalyzeConfig) => route
			? runWithRoutingContext({ router: createRoleRouter({}), repoPath: '/other-repo' }, async () => selectDocRelationsProvider(cfg, REPO))
			: selectDocRelationsProvider(cfg, REPO);
		const ollama = await select(local);
		assert.ok(ollama.ok);
		assert.ok(ollama.provider instanceof OllamaProvider);
		assert.equal(ollama.modelId, 'qwen3.8:27b');

		const cli = await select(mid);
		assert.ok(cli.ok);
		assert.ok(cli.provider instanceof CliProvider);
		assert.equal(cli.modelId, 'claude-sonnet-5');
	}
});

test('an explicit core assignment is refused before provider construction', () => {
	const selected = selectDocRelationsProvider(config({ tasks: { [DOC_RELATIONS_ROLE]: 'core' } }), REPO);
	assert.deepEqual(selected, { ok: false, reason: 'indexer.docRelations is assigned to tier core; this capability supports cheap and mid' });
});

test('s10 t4: a CLI family with no listed model is refused before any call', () => {
	let calls = 0;
	const original = CliProvider.prototype.completeStructured;
	CliProvider.prototype.completeStructured = function () { calls++; return original.apply(this, arguments as never); } as typeof original;
	try {
		// A configured model the definitions do not list falls back to the tier's listed default when the
		// config loads; a family whose definitions list no model at all is refused here.
		const registry = getModelRegistry();
		const noModels = { ...registry, find: () => undefined } as typeof registry;
		const unlisted = selectDocRelationsProvider(config(), REPO, { registry: noModels });
		assert.equal(unlisted.ok, false);
		if (!unlisted.ok) assert.match(unlisted.reason, /names no model the definitions list for cli-claude/);
	} finally {
		CliProvider.prototype.completeStructured = original;
	}
	assert.equal(calls, 0, 'no call was made');
});

test('s10 t4: provider-failure classification across CLI error shapes', () => {
	const codexEvent = new Error('codex: turn.failed: You are not logged in');            // runCodex: error / turn.failed event
	const claudeEnvelope = new Error('claude: is_error result: Invalid API key · Please run /login');   // a Claude is_error envelope
	const vibeWrapped = new Error('structured-output: gave up after 3 attempts', { cause: new Error('vibe: authentication required') });
	const exit = new CliExitError('claude exited 1', 'not signed in');
	const stall = new CliStallError('codex', 300_000, undefined);
	const callFailed = new ModelCallFailedError('model call failed: 401', { cause: new Error('unauthorized') });
	for (const err of [codexEvent, claudeEnvelope, vibeWrapped, exit, stall, callFailed, 'a thrown string']) {
		assert.equal(classifyDocRelationsFailure(err), 'provider', String((err as Error).message ?? err));
	}
	assert.equal(classifyDocRelationsFailure(new DocRelationsOutputInvalid('proposals is not an array')), 'output');
	assert.equal(failureMessage(vibeWrapped), 'structured-output: gave up after 3 attempts: vibe: authentication required', 'the cause chain is kept');
	assert.match(failureMessage(callFailed), /model call failed: 401.*: unauthorized$/);
});
