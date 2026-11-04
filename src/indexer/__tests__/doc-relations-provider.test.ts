/**
 * Epic c2ba6fa6, Story s10, t4 -- the model that proposes document
 * relationships: the role indexer.docRelations (peripheral, mid); a selection
 * that refuses any tier but mid -- with and without a routing context -- and a
 * family with no CLI or no listed model, before any call; and the
 * classification of failures: everything the provider call throws is a
 * provider failure, only DocRelationsOutputInvalid is the document's.
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

function config(extra: Record<string, unknown> = {}, mid: Record<string, unknown> = { runner: 'cli-claude', model: 'sonnet' }): AnalyzeConfig {
	return assembleConfig(parseTiering({
		tiers: {
			core:  { runner: 'cli-codex',  model: 'gpt-6.1-sol' },
			mid,
			cheap: { runner: 'cli-claude', model: 'haiku' },
		},
		...extra,
	}), SHAPER, DEPTH);
}

test('s10 t4: role taxonomy has indexer.docRelations as peripheral mid', () => {
	const role = reasoningRoleTaxonomy().roles.find(r => r.id === DOC_RELATIONS_ROLE);
	assert.deepEqual(role, { id: 'indexer.docRelations', criticality: 'peripheral', defaultTier: 'mid' });
});

test('s10 t4: a cheap-tier override is refused with and without a routing context', async () => {
	// The default assignment is accepted, and builds a CLI provider of the mid tier's model.
	const ok = selectDocRelationsProvider(config(), REPO);
	assert.equal(ok.ok, true);
	if (ok.ok) { assert.ok(ok.provider instanceof CliProvider); assert.equal(ok.modelId, 'claude-sonnet-5'); }

	const overrides: [string, AnalyzeConfig][] = [
		['global', config({ tasks: { [DOC_RELATIONS_ROLE]: 'cheap' } })],
		['per-repo', config({ byRepo: { [REPO]: { tasks: { [DOC_RELATIONS_ROLE]: 'cheap' } } } })],
	];
	for (const [label, cfg] of overrides) {
		const without = selectDocRelationsProvider(cfg, REPO);
		assert.deepEqual(without, { ok: false, reason: 'indexer.docRelations is assigned to tier cheap; this capability runs only on the mid tier' }, `${label}, no routing context`);
		const within = await runWithRoutingContext({ router: createRoleRouter({}), repoPath: REPO }, async () => selectDocRelationsProvider(cfg, REPO));
		assert.equal(within.ok, false, `${label}, under a routing context`);
		if (!within.ok) assert.match(within.reason, /tier cheap; this capability runs only on the mid tier/);
	}

	// Under a routing context the default assignment takes the router's provider.
	const routed = await runWithRoutingContext({ router: createRoleRouter({}), repoPath: REPO }, async () => selectDocRelationsProvider(config(), REPO));
	assert.equal(routed.ok, true);
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
		const local = selectDocRelationsProvider(config({}, { runner: 'ollama', model: 'qwen3.6:27b' }), REPO);
		assert.equal(local.ok, false);
		if (!local.ok) assert.match(local.reason, /runs ollama, which is not a CLI provider/);
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
