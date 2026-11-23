/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the flat models.* tiering parse/validation (S001 — sc1).
 * Exercises parseTiering directly (no global config file): valid members
 * parse, invalid members are dropped fail-soft, and absent tiering yields {}.
 * The on-disk task→tier key is `tasks` (internal field: `roleTiers`).
 *
 * Run: npx tsx --test src/config/__tests__/analyze-tiering.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { FamilyDefinition } from '../../daemon/model-catalog.js';
import { getModelRegistry } from '../../daemon/model-registry.js';
import type { ModelRegistry, ResolvedModel } from '../../daemon/model-registry.js';
import type { AnalyzeConfig, AnalyzeTiering, TierResolution } from '../analyze.js';
import { _setSecurityProbeDepsForTests, parseSecurityModelPin, parseTiering, resolveSecurityModel, resolveSecurityModelCandidate, securityPinMeetsFloor } from '../analyze.js';

test('a valid tier table parses to {runner, model} TierModels', () => {
	const t = parseTiering({ tiers: { core: { runner: 'cli-claude', model: 'opus' }, cheap: { runner: 'ollama', model: 'qwen3.6:35b-a3b' } } });
	assert.deepEqual(t.tiers?.core, { runner: 'cli-claude', model: 'opus' });
	assert.deepEqual(t.tiers?.cheap, { runner: 'ollama', model: 'qwen3.6:35b-a3b' });
	assert.equal(t.tiers?.mid, undefined);
});

test('a tier with a non-k1 runner is dropped (no direct-REST backend admitted)', () => {
	const t = parseTiering({ tiers: { cheap: { runner: 'anthropic-rest', model: 'x' } } });
	assert.equal(t.tiers, undefined, 'the only (invalid) tier is dropped → no tiers');
});

test('an unknown tier name is dropped', () => {
	const t = parseTiering({ tiers: { core: { runner: 'ollama', model: 'm' }, huge: { runner: 'ollama', model: 'm' } } });
	assert.deepEqual(Object.keys(t.tiers ?? {}), ['core']);
});

test('coreFloor accepts only a TierName; other strings are dropped', () => {
	assert.equal(parseTiering({ coreFloor: 'mid' }).coreFloor, 'mid');
	assert.equal(parseTiering({ coreFloor: 'high' }).coreFloor, undefined);
});

test('models.tasks parses valid RoleId→TierName entries and drops non-tier values', () => {
	// on-disk key is `tasks`; the internal AnalyzeTiering field is `roleTiers`
	const t = parseTiering({ tasks: { synthesize: 'mid', 'tracker.render.summary': 'cheap', bogus: 'nope' } });
	assert.deepEqual(t.roleTiers, { synthesize: 'mid', 'tracker.render.summary': 'cheap' });
});

test('byRepo tiering overrides are parsed per repo path (tasks key)', () => {
	const t = parseTiering({ byRepo: { '/work/afm': { tasks: { review: 'core' }, coreFloor: 'core' } } });
	assert.equal(t.byRepo?.['/work/afm']?.coreFloor, 'core');
	assert.deepEqual(t.byRepo?.['/work/afm']?.roleTiers, { review: 'core' });
});

test('absent tiering keys → {} (legacy single-provider path), aside from the always-present security tri-state', () => {
	assert.deepEqual(parseTiering({}), { security: { kind: 'absent' } });
	// legacy keys present but no tiering keys → still {} (+ security)
	assert.deepEqual(parseTiering({ shaperProvider: 'ollama', shaperModel: 'qwen3.6:35b-a3b' }), { security: { kind: 'absent' } });
});

test('empty tiers:{} / tasks:{} are treated as absent, not an error', () => {
	const t = parseTiering({ tiers: {}, tasks: {} });
	assert.equal(t.tiers, undefined);
	assert.equal(t.roleTiers, undefined);
});

test('a byRepo entry with no valid tiering keys is not retained', () => {
	const t = parseTiering({ byRepo: { '/r': { coreFloor: 'bad' } } });
	assert.equal(t.byRepo, undefined);
});

test("parseTiering reads effort on the global core/mid/cheap tiers; models.byRepo[repo].tiers is ignored (tiers are global only); '' is an explicit CLI default and absent gives no effort", () => {
	const t = parseTiering({
		tiers: {
			core:  { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'high' },
			mid:   { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'medium' },
			cheap: { runner: 'cli-claude', model: 'haiku', effort: 'max' },
		},
		byRepo: { '/r': { tiers: { core: { runner: 'cli-claude', model: 'opus', effort: 'low' } } } },
	});
	assert.deepEqual(t.tiers?.core, { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'high' });
	assert.equal(t.tiers?.mid?.effort, 'medium');
	assert.equal(t.tiers?.cheap?.effort, 'max');
	assert.deepEqual(t.efforts, { core: 'high', mid: 'medium', cheap: 'max' });
	// A repo picks a tier for a role, never the model behind it: its tiers are not read.
	assert.equal(t.byRepo, undefined);

	for (const effort of ['', undefined]) {
		const u = parseTiering({ tiers: { core: { runner: 'cli-claude', model: 'opus', ...(effort !== undefined ? { effort } : {}) } } });
		assert.deepEqual(u.tiers?.core, { runner: 'cli-claude', model: 'opus' }, `effort ${JSON.stringify(effort)}`);
		assert.deepEqual(u.efforts, effort === '' ? { core: '' } : undefined);
	}
});

test('a non-string effort is dropped with a warning while the tier keeps its runner and model; any level name is parsed (the registry decides acceptance per model)', () => {
	for (const effort of [3, { level: 'high' }, null]) {
		const t = parseTiering({ tiers: { mid: { runner: 'cli-codex', model: 'gpt-6.1-sol', effort } } });
		assert.deepEqual(t.tiers?.mid, { runner: 'cli-codex', model: 'gpt-6.1-sol' }, `effort ${JSON.stringify(effort)}`);
		assert.equal(t.efforts, undefined);
	}
	const named = parseTiering({ tiers: { mid: { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'turbo' } } });
	assert.deepEqual(named.tiers?.mid, { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'turbo' });
});

// ── parseSecurityModelPin (Epic add-dedicated-security-reviews, s1 t3) ──
// A tri-state result: absent is the ordinary, expected case (falls through to
// the 'security.review' role's tier-default model); malformed is never
// conflated with absent, since this Story's fail-closed requirement depends
// on telling the two apart.

test('parseSecurityModelPin: no models.security key at all -> { kind: \'absent\' }', () => {
	assert.deepEqual(parseSecurityModelPin({}), { kind: 'absent' });
});

test("parseSecurityModelPin: a complete, well-typed { runner, model } -> { kind: 'valid', ... }", () => {
	assert.deepEqual(
		parseSecurityModelPin({ security: { runner: 'cli-claude', model: 'x' } }),
		{ kind: 'valid', runner: 'cli-claude', model: 'x' },
	);
});

test("parseSecurityModelPin: runner set with no model -> { kind: 'malformed', detail }", () => {
	const r = parseSecurityModelPin({ security: { runner: 'cli-claude' } });
	assert.equal(r.kind, 'malformed');
	assert.ok('detail' in r && typeof r.detail === 'string' && r.detail.length > 0);
});

test("parseSecurityModelPin: model set with no runner -> { kind: 'malformed', detail }", () => {
	const r = parseSecurityModelPin({ security: { model: 'x' } });
	assert.equal(r.kind, 'malformed');
	assert.ok('detail' in r && typeof r.detail === 'string' && r.detail.length > 0);
});

test("parseSecurityModelPin: runner is not a recognized FamilyId -> { kind: 'malformed', detail }", () => {
	const r = parseSecurityModelPin({ security: { runner: 'not-a-family', model: 'x' } });
	assert.equal(r.kind, 'malformed');
	assert.ok('detail' in r && typeof r.detail === 'string' && r.detail.length > 0);
});

test('parseSecurityModelPin: a valid pin with effort carries it through; an empty security object is absent, not malformed', () => {
	assert.deepEqual(
		parseSecurityModelPin({ security: { runner: 'cli-codex', model: 'y', effort: 'high' } }),
		{ kind: 'valid', runner: 'cli-codex', model: 'y', effort: 'high' },
	);
	assert.deepEqual(parseSecurityModelPin({ security: {} }), { kind: 'absent' });
});

test("parseSecurityModelPin: the catalog's own persisted unset sentinel (runner:'', model:'') -> { kind: 'absent' }, not malformed", () => {
	// config-catalog.ts's models.security.{runner,model} rows default to '' and
	// reconcileConfig persists that default on every ordinary install -- this
	// must read the same as the key being absent entirely.
	assert.deepEqual(parseSecurityModelPin({ security: { runner: '', model: '' } }), { kind: 'absent' });
});

test("parseSecurityModelPin: a valid pin never carries a literal '' effort (the CLI's own default, not a flag value)", () => {
	assert.deepEqual(
		parseSecurityModelPin({ security: { runner: 'cli-claude', model: 'x', effort: '' } }),
		{ kind: 'valid', runner: 'cli-claude', model: 'x' },
	);
});

test('parseSecurityModelPin: models.security present but the wrong shape (null/string/array/number) -> malformed, not absent', () => {
	for (const bad of [null, 'typo', [], 42]) {
		const r = parseSecurityModelPin({ security: bad });
		assert.equal(r.kind, 'malformed', `security: ${JSON.stringify(bad)}`);
	}
});

test("parseTiering threads parseSecurityModelPin's own tri-state result onto AnalyzeTiering.security, always present (never collapsed to undefined); parseTieringOverride's own tiers parsing is unaffected", () => {
	const valid = parseTiering({ security: { runner: 'cli-claude', model: 'x' }, tiers: { core: { runner: 'cli-codex', model: 'gpt-6.1-sol' } } });
	assert.deepEqual(valid.security, { kind: 'valid', runner: 'cli-claude', model: 'x' });
	assert.deepEqual(valid.tiers?.core, { runner: 'cli-codex', model: 'gpt-6.1-sol' });

	assert.deepEqual(parseTiering({}).security, { kind: 'absent' });
	const malformed = parseTiering({ security: { model: 'x' } }).security;
	assert.equal(malformed.kind, 'malformed');
});

// ── securityPinMeetsFloor (Epic add-dedicated-security-reviews, s1 t4) ──
// The ONLY link between an arbitrary pinned (family, model) pair and
// coreFloor's TierName ranking: CoreFloorGuard.applyCoreFloor compares only
// TierName values and has no notion of an individual model's capability.

function fakeResolvedModel(family: string, id: string): ResolvedModel {
	return { id, efforts: [], family, source: 'shipped' } as unknown as ResolvedModel;
}

function fakeRegistry(families: readonly FamilyDefinition[]): ModelRegistry {
	const notUsed = (): never => { throw new Error('not used by securityPinMeetsFloor'); };
	return {
		families: () => families,
		defaultFamily: notUsed,
		models: notUsed,
		rejected: notUsed,
		find: (family, idOrAlias) => {
			const f = families.find(fam => fam.id === family);
			if (f === undefined) return undefined;
			const m = f.models.find(mod => mod.id === idOrAlias || mod.aliases?.includes(idOrAlias));
			return m === undefined ? undefined : fakeResolvedModel(family, m.id);
		},
		tierDefault: notUsed,
		summariserModel: notUsed,
		toolLoopModel: notUsed,
		cliKind: family => family.startsWith('cli-') ? family.slice('cli-'.length) as 'claude' | 'codex' | 'vibe' : undefined,
		host: notUsed,
		effortLevels: notUsed,
		resolveTier: notUsed,
	};
}

const CLAUDE_FAMILY: FamilyDefinition = {
	id: 'cli-claude', displayName: 'Claude',
	models: [{ id: 'opus', efforts: [] }, { id: 'haiku', efforts: [] }],
	tierDefaults: { core: { model: 'opus' }, mid: { model: 'opus' }, cheap: { model: 'haiku' } },
};
test("securityPinMeetsFloor: a pin matching its own family's tierDefaults at a tier at/above the floor -> true", () => {
	const registry = fakeRegistry([CLAUDE_FAMILY]);
	assert.equal(securityPinMeetsFloor(registry, 'cli-claude', 'opus', 'mid'), true);
});

test("securityPinMeetsFloor: a pin matching a DIFFERENT family's tierDefaults at a tier at/above the floor -> true", () => {
	// 'opus' is pinned against cli-claude, but cli-claude's own tierDefaults
	// only name it at cheap (below a 'mid' floor); a DIFFERENT family (a fixture
	// cli-vibe that happens to also use a model id 'opus') names it at mid --
	// the search spans every family's tierDefaults, not only the pinned one's.
	const claudeCheapOnly: FamilyDefinition = {
		id: 'cli-claude', displayName: 'Claude',
		models: [{ id: 'opus', efforts: [] }],
		tierDefaults: { cheap: { model: 'opus' } },
	};
	const otherFamilySharingModelId: FamilyDefinition = {
		id: 'cli-vibe', displayName: 'Vibe',
		models: [{ id: 'opus', efforts: [] }],
		tierDefaults: { mid: { model: 'opus' } },
	};
	const registry = fakeRegistry([claudeCheapOnly, otherFamilySharingModelId]);
	assert.equal(securityPinMeetsFloor(registry, 'cli-claude', 'opus', 'mid'), true);
});

test('securityPinMeetsFloor: a pin matching a tierDefaults entry BELOW the floor rank -> false', () => {
	const registry = fakeRegistry([CLAUDE_FAMILY]);
	// haiku is only the cheap-tier default; the floor is core.
	assert.equal(securityPinMeetsFloor(registry, 'cli-claude', 'haiku', 'core'), false);
});

test("securityPinMeetsFloor: a pin matching no family's tierDefaults at any tier (unclassifiable) -> false", () => {
	const family: FamilyDefinition = {
		id: 'cli-claude', displayName: 'Claude',
		models: [{ id: 'opus', efforts: [] }, { id: 'some-other-model', efforts: [] }],
		tierDefaults: { core: { model: 'opus' }, mid: { model: 'opus' }, cheap: { model: 'opus' } },
	};
	const registry = fakeRegistry([family]);
	assert.equal(securityPinMeetsFloor(registry, 'cli-claude', 'some-other-model', 'cheap'), false);
});

// ── resolveSecurityModelCandidate (Epic add-dedicated-security-reviews, s1 t5) ──
// Pure, synchronous selection: a malformed or below-floor/unlisted pin resolves
// to 'unavailable' immediately and never falls through to the role's tier-
// default model; only a genuinely absent pin falls through to it.

function fakeAnalyzeConfig(tiering: AnalyzeTiering): AnalyzeConfig {
	return {
		shaperProvider: 'cli-claude',
		shaperProviderExplicit: false,
		shaperModel: '',
		shaperModelExplicit: false,
		summariserProvider: 'cli-claude',
		summariserModel: '',
		shaper: { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumPredict: 20_480 },
		maxPlanDepth: { XS: 2, S: 3, M: 4, L: 5, XL: 6 },
		tiering,
		tierResolutions: {} as Record<string, TierResolution> as never,
	};
}

test("resolveSecurityModelCandidate: a valid, floor-eligible pin -> status:'candidate' with that (runner, model)", () => {
	const registry = fakeRegistry([CLAUDE_FAMILY]);
	const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model: 'opus' } });
	assert.deepEqual(resolveSecurityModelCandidate(cfg, registry), { status: 'candidate', runner: 'cli-claude', model: 'opus' });
});

test("resolveSecurityModelCandidate: a malformed pin -> status:'unavailable' immediately, never falling through to the tier-default model", () => {
	const registry = fakeRegistry([CLAUDE_FAMILY]);
	const cfg = fakeAnalyzeConfig({ security: { kind: 'malformed', detail: 'bad pin' }, tiers: { core: { runner: 'cli-claude', model: 'opus' } } });
	assert.deepEqual(resolveSecurityModelCandidate(cfg, registry), { status: 'unavailable', blockerReason: 'bad pin' });
});

test("resolveSecurityModelCandidate: a valid but below-floor/unclassifiable pin -> status:'unavailable', never substituted", () => {
	const registry = fakeRegistry([CLAUDE_FAMILY]);
	// haiku is only cli-claude's cheap-tier default; the role's floor is core.
	const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model: 'haiku' }, tiers: { core: { runner: 'cli-claude', model: 'opus' } } });
	const result = resolveSecurityModelCandidate(cfg, registry);
	assert.equal(result.status, 'unavailable');
});

test("resolveSecurityModelCandidate: an absent pin falls through to the 'security.review' role's tier-default model as a normal candidate", () => {
	const registry = fakeRegistry([CLAUDE_FAMILY]);
	const cfg = fakeAnalyzeConfig({ security: { kind: 'absent' }, tiers: { core: { runner: 'cli-claude', model: 'opus' } } });
	assert.deepEqual(resolveSecurityModelCandidate(cfg, registry), { status: 'candidate', runner: 'cli-claude', model: 'opus' });
});

test("resolveSecurityModelCandidate: an absent pin whose tier-default model is itself unlisted/below-floor -> status:'unavailable'", () => {
	const registry = fakeRegistry([CLAUDE_FAMILY]);
	// 'haiku' is only cli-claude's cheap-tier default; as the (misconfigured) core-tier model it is below the role's core floor.
	const cfg = fakeAnalyzeConfig({ security: { kind: 'absent' }, tiers: { core: { runner: 'cli-claude', model: 'haiku' } } });
	const result = resolveSecurityModelCandidate(cfg, registry);
	assert.equal(result.status, 'unavailable');

	// Also unlisted: the core-tier model is not even a model of the family at all.
	const cfgUnlisted = fakeAnalyzeConfig({ security: { kind: 'absent' }, tiers: { core: { runner: 'cli-claude', model: 'nonexistent' } } });
	assert.equal(resolveSecurityModelCandidate(cfgUnlisted, registry).status, 'unavailable');
});

const DISTINCT_TIER_FAMILY: FamilyDefinition = {
	id: 'cli-claude', displayName: 'Claude',
	models: [{ id: 'opus', efforts: [] }, { id: 'sonnet', efforts: [] }, { id: 'haiku', efforts: [] }],
	tierDefaults: { core: { model: 'opus' }, mid: { model: 'sonnet' }, cheap: { model: 'haiku' } },
};

test("resolveSecurityModelCandidate: models.tasks['security.review'] (roleTiers) is honored for an absent pin, not just the role's bare defaultTier", () => {
	const registry = fakeRegistry([DISTINCT_TIER_FAMILY]);
	const cfg = fakeAnalyzeConfig({
		security: { kind: 'absent' },
		roleTiers: { 'security.review': 'mid' },
		tiers: { mid: { runner: 'cli-claude', model: 'sonnet' } },
	});
	assert.deepEqual(resolveSecurityModelCandidate(cfg, registry), { status: 'candidate', runner: 'cli-claude', model: 'sonnet' });
});

test("resolveSecurityModelCandidate: a byRepo roleTiers override takes precedence over the global one, for the given repoPath", () => {
	const registry = fakeRegistry([DISTINCT_TIER_FAMILY]);
	const cfg = fakeAnalyzeConfig({
		security: { kind: 'absent' },
		coreFloor: 'cheap', // so the global 'cheap' assignment below is not itself clamped up
		roleTiers: { 'security.review': 'cheap' },
		byRepo: { '/work/repo': { roleTiers: { 'security.review': 'mid' } } },
		tiers: { mid: { runner: 'cli-claude', model: 'sonnet' }, cheap: { runner: 'cli-claude', model: 'haiku' } },
	});
	assert.deepEqual(resolveSecurityModelCandidate(cfg, registry, '/work/repo'), { status: 'candidate', runner: 'cli-claude', model: 'sonnet' });
	// No repoPath given -> the global roleTiers assignment ('cheap') applies instead.
	assert.deepEqual(resolveSecurityModelCandidate(cfg, registry), { status: 'candidate', runner: 'cli-claude', model: 'haiku' });
});

test("resolveSecurityModelCandidate: a critical role's tier is clamped up to coreFloor even when roleTiers assigns it lower", () => {
	const registry = fakeRegistry([DISTINCT_TIER_FAMILY]);
	const cfg = fakeAnalyzeConfig({
		security: { kind: 'absent' },
		roleTiers: { 'security.review': 'cheap' },
		coreFloor: 'core',
		tiers: { core: { runner: 'cli-claude', model: 'opus' }, cheap: { runner: 'cli-claude', model: 'haiku' } },
	});
	// 'cheap' is clamped up to the 'core' coreFloor -- the cheap-tier model is never used.
	assert.deepEqual(resolveSecurityModelCandidate(cfg, registry), { status: 'candidate', runner: 'cli-claude', model: 'opus' });
});

test("resolveSecurityModelCandidate: an absent pin refuses (never silently falls through) when the floor tier's own configured model was itself rejected/substituted", () => {
	const registry = fakeRegistry([CLAUDE_FAMILY]);
	const cfg = fakeAnalyzeConfig({ security: { kind: 'absent' }, tiers: { core: { runner: 'cli-claude', model: 'opus' } } });
	(cfg.tierResolutions as Record<string, TierResolution>)['core'] = {
		family: 'cli-claude',
		model: { id: 'opus', efforts: [], family: 'cli-claude', source: 'shipped' } as unknown as ResolvedModel,
		fallback: { reason: 'unlisted-model', requested: 'gpt-nonexistent' },
	};
	const result = resolveSecurityModelCandidate(cfg, registry);
	assert.equal(result.status, 'unavailable');
	assert.ok(result.status === 'unavailable' && result.blockerReason.includes('unlisted-model') && result.blockerReason.includes('gpt-nonexistent'));
});

// ── resolveSecurityModel (Epic add-dedicated-security-reviews, s1 t6) ──
// A bounded, async availability probe layered over resolveSecurityModelCandidate.
// Never rejects; always settles within opts.deadlineMs. Uses the injectable
// probe seam (_setSecurityProbeDepsForTests) matching this codebase's own
// _set*DepsForTests convention, so no real CLI subprocess is ever spawned here.

test("resolveSecurityModel: candidate already 'unavailable' -> resolves immediately, no probe attempted", async () => {
	let probeCalled = false;
	_setSecurityProbeDepsForTests({ probe: async () => { probeCalled = true; } });
	try {
		const registry = fakeRegistry([CLAUDE_FAMILY]);
		const cfg = fakeAnalyzeConfig({ security: { kind: 'malformed', detail: 'bad pin' } });
		const result = await resolveSecurityModel(cfg, registry, { deadlineMs: 1000 });
		assert.equal(result.status, 'unavailable');
		assert.equal(probeCalled, false);
	} finally {
		_setSecurityProbeDepsForTests();
	}
});

test("resolveSecurityModel: probe resolves successfully within the deadline -> status:'configured'", async () => {
	_setSecurityProbeDepsForTests({ probe: async () => {} });
	try {
		const registry = fakeRegistry([CLAUDE_FAMILY]);
		const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model: 'opus' } });
		const result = await resolveSecurityModel(cfg, registry, { deadlineMs: 1000 });
		assert.deepEqual(result, { status: 'configured', modelId: 'opus', provider: 'cli-claude' });
	} finally {
		_setSecurityProbeDepsForTests();
	}
});

test("resolveSecurityModel: probe rejects (simulated ENOENT/auth failure) -> status:'unavailable' with a backend-failure blockerReason", async () => {
	_setSecurityProbeDepsForTests({ probe: async () => { throw new Error('ENOENT: claude not found'); } });
	try {
		const registry = fakeRegistry([CLAUDE_FAMILY]);
		const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model: 'opus' } });
		const result = await resolveSecurityModel(cfg, registry, { deadlineMs: 1000 });
		assert.equal(result.status, 'unavailable');
		assert.ok(result.status === 'unavailable' && result.blockerReason.includes('ENOENT'));
	} finally {
		_setSecurityProbeDepsForTests();
	}
});

test("resolveSecurityModel: probe neither resolves nor rejects before opts.deadlineMs -> status:'unavailable' with a timeout blockerReason", async () => {
	_setSecurityProbeDepsForTests({ probe: () => new Promise(() => {}) });
	try {
		const registry = fakeRegistry([CLAUDE_FAMILY]);
		const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model: 'opus' } });
		const result = await resolveSecurityModel(cfg, registry, { deadlineMs: 50 });
		assert.equal(result.status, 'unavailable');
		assert.ok(result.status === 'unavailable' && result.blockerReason.includes('timed out'));
	} finally {
		_setSecurityProbeDepsForTests();
	}
});

test("resolveSecurityModel: opts.signal is aborted while the probe is outstanding -> status:'unavailable' with a cancellation blockerReason", async () => {
	_setSecurityProbeDepsForTests({ probe: () => new Promise(() => {}) });
	try {
		const registry = fakeRegistry([CLAUDE_FAMILY]);
		const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model: 'opus' } });
		const controller = new AbortController();
		const resultPromise = resolveSecurityModel(cfg, registry, { deadlineMs: 5000, signal: controller.signal });
		controller.abort();
		const result = await resultPromise;
		assert.equal(result.status, 'unavailable');
		assert.ok(result.status === 'unavailable' && result.blockerReason.includes('cancelled'));
	} finally {
		_setSecurityProbeDepsForTests();
	}
});

test("resolveSecurityModel: an opts.signal that is ALREADY aborted before the call short-circuits immediately, with no probe dispatched", async () => {
	let probeCalled = false;
	_setSecurityProbeDepsForTests({ probe: async () => { probeCalled = true; } });
	try {
		const registry = fakeRegistry([CLAUDE_FAMILY]);
		const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model: 'opus' } });
		const controller = new AbortController();
		controller.abort();
		const result = await resolveSecurityModel(cfg, registry, { deadlineMs: 1000, signal: controller.signal });
		assert.equal(result.status, 'unavailable');
		assert.ok(result.status === 'unavailable' && result.blockerReason.includes('cancelled'));
		assert.equal(probeCalled, false);
	} finally {
		_setSecurityProbeDepsForTests();
	}
});

test('resolveSecurityModel: a timeout aborts the internal signal threaded into the probe, so the underlying call is actually cancelled', async () => {
	let capturedSignal: AbortSignal | undefined;
	_setSecurityProbeDepsForTests({ probe: (_k, _m, _e, signal) => { capturedSignal = signal; return new Promise(() => {}); } });
	try {
		const registry = fakeRegistry([CLAUDE_FAMILY]);
		const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model: 'opus' } });
		await resolveSecurityModel(cfg, registry, { deadlineMs: 20 });
		assert.equal(capturedSignal?.aborted, true);
	} finally {
		_setSecurityProbeDepsForTests();
	}
});

test("resolveSecurityModel: the caller's own cancellation also aborts the internal signal threaded into the probe", async () => {
	let capturedSignal: AbortSignal | undefined;
	_setSecurityProbeDepsForTests({ probe: (_k, _m, _e, signal) => { capturedSignal = signal; return new Promise(() => {}); } });
	try {
		const registry = fakeRegistry([CLAUDE_FAMILY]);
		const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model: 'opus' } });
		const controller = new AbortController();
		const resultPromise = resolveSecurityModel(cfg, registry, { deadlineMs: 5000, signal: controller.signal });
		controller.abort();
		await resultPromise;
		assert.equal(capturedSignal?.aborted, true);
	} finally {
		_setSecurityProbeDepsForTests();
	}
});

test(
	'live: resolveSecurityModel reports a genuinely unreachable CLI backend via ENOENT, within the deadline, never a hang or substitution',
	{ skip: process.env.INSRC_LIVE_TESTS !== '1' },
	async () => {
		const registry = getModelRegistry();
		const claude = registry.families().find(f => f.id === 'cli-claude');
		assert.ok(claude?.tierDefaults?.core, 'cli-claude must have a core tier default to pin');
		const model = claude.tierDefaults.core.model;
		assert.ok(registry.find('cli-claude', model) !== undefined, 'the pinned model must be listed');
		assert.ok(securityPinMeetsFloor(registry, 'cli-claude', model, 'core'), 'the pinned model must be floor-eligible');

		const cfg = fakeAnalyzeConfig({ security: { kind: 'valid', runner: 'cli-claude', model } });
		const savedPath = process.env.PATH;
		// Only the CLI subprocess resolution is affected -- this node process
		// itself was already launched before this line runs.
		process.env.PATH = '/insrc-live-test-nonexistent-path';
		try {
			const start = Date.now();
			const result = await resolveSecurityModel(cfg, registry, { deadlineMs: 8000 });
			const elapsed = Date.now() - start;
			assert.ok(elapsed < 8000, `settled at ${elapsed}ms, within the 8000ms deadline`);
			assert.equal(result.status, 'unavailable');
			assert.ok(result.status === 'unavailable' && /ENOENT/.test(result.blockerReason), result.status === 'unavailable' ? result.blockerReason : '');
		} finally {
			process.env.PATH = savedPath;
		}
	},
);
