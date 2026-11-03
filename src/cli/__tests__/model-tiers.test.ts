/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the Model Tiers pane overlay (standalone S001; Epic
 * ce99b72065d03b1b, Story s5) — the pure computeEffectiveTiers logic, the tier
 * edit helpers and the path helpers, over a FAKE models.definitions answer whose
 * families, models and efforts differ from the shipped file (so a value can only
 * have come from the answer), and the real reasoningRoleTaxonomy. No ink/daemon.
 *
 * Run: npx tsx --test src/cli/__tests__/model-tiers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTiering, type AnalyzeTiering } from '../../config/analyze.js';
import type { ModelDefinitionsResult } from '../services/models.js';
import {
	computeEffectiveTiers as compute, tierPath, roleTierPath, CORE_FLOOR_PATH, isTierName,
	ROLE_TIERS_PATH, nextRoleTiers, switchFamily, switchModel, effortChoices, nextInCycle, resolveTypedModel,
} from '../panes/model-tiers.js';

/** A fake answer: nothing here matches the shipped definitions. */
const FAKE: ModelDefinitionsResult = {
	version: 9,
	defaultFamily: 'cli-codex',
	families: [
		{ id: 'cli-claude', cliKind: 'claude', displayName: 'Fake Claude',
			tierDefaults: { core: { model: 'fc-big' }, mid: { model: 'fc-big' }, cheap: { model: 'fc-small' } }, summariserModel: 'fc-small',
			models: [{ id: 'fc-big', aliases: [], efforts: ['deep'], source: 'shipped' }, { id: 'fc-small', aliases: [], efforts: [], source: 'shipped' }] },
		{ id: 'cli-codex', cliKind: 'codex', displayName: 'Fake Codex',
			tierDefaults: { core: { model: 'fx', effort: 'turbo' }, mid: { model: 'fx-lite', effort: 'lo' }, cheap: { model: 'mini' } }, summariserModel: 'fx-lite',
			models: [{ id: 'fx', aliases: [], efforts: ['lo', 'turbo'], source: 'shipped' }, { id: 'fx-lite-1', aliases: ['fx-lite', 'mini'], efforts: ['lo'], source: 'shipped' }] },
		{ id: 'ollama', displayName: 'Fake Local', toolLoopModel: 'loc:2',
			models: [{ id: 'loc:1', aliases: [], efforts: [], source: 'shipped' }, { id: 'loc:2', aliases: [], efforts: [], source: 'shipped' }] },
	],
};

const computeEffectiveTiers = (t: AnalyzeTiering) => compute(t, FAKE);
const role = (eff: ReturnType<typeof computeEffectiveTiers>, id: string) => eff.roles.find(r => r.id === id)!;

// ── empty tiering → built-in defaults ───────────────────────────────────────

test('empty tiering: tiers = the definitions\' tier defaults as canonical ids (source default), coreFloor = mid (default)', () => {
	const eff = computeEffectiveTiers({});
	assert.deepEqual(eff.tiers.core, { runner: 'cli-codex', model: 'fx', effort: 'turbo', served: true, notSupported: false });
	assert.deepEqual(eff.tiers.mid, { runner: 'cli-codex', model: 'fx-lite-1', effort: 'lo', served: true, notSupported: false });
	assert.deepEqual(eff.tiers.cheap, { runner: 'cli-codex', model: 'fx-lite-1', served: true, notSupported: false });
	assert.equal(eff.tierSource.core, 'default');
	assert.equal(eff.coreFloor, 'mid');
	assert.equal(eff.coreFloorSource, 'default');
});

test('empty tiering: a critical role resolves to its core default (source taxonomy), unclamped', () => {
	const r = role(computeEffectiveTiers({}), 'design.contract.detail');
	assert.equal(r.criticality, 'critical');
	assert.equal(r.effectiveTier, 'core');
	assert.equal(r.source, 'taxonomy');
	assert.equal(r.clamped, false);
});

test('empty tiering: a peripheral role resolves to its taxonomy default (mid/cheap)', () => {
	const eff = computeEffectiveTiers({});
	assert.equal(role(eff, 'synthesize').effectiveTier, 'mid');
	assert.equal(role(eff, 'analyze.narrow').effectiveTier, 'cheap');
});

// ── config overlay ──────────────────────────────────────────────────────────

test('a configured tier model overrides the default and is marked source=config', () => {
	const t: AnalyzeTiering = { tiers: { mid: { runner: 'cli-claude', model: 'fc-big' } } };
	const eff = computeEffectiveTiers(t);
	assert.deepEqual(eff.tiers.mid, { runner: 'cli-claude', model: 'fc-big', served: true, notSupported: false });
	assert.equal(eff.tierSource.mid, 'config');
	assert.equal(eff.tierSource.core, 'default'); // untouched tier stays default
});

test('a roleTiers override changes the effective tier and is marked source=override', () => {
	const eff = computeEffectiveTiers({ roleTiers: { synthesize: 'cheap' } });
	const r = role(eff, 'synthesize');
	assert.equal(r.assignedTier, 'cheap');
	assert.equal(r.effectiveTier, 'cheap');
	assert.equal(r.source, 'override');
});

// ── coreFloor clamp (the shipped guard, surfaced) ───────────────────────────

test('a critical role overridden below coreFloor is clamped UP to the floor (clamped=true)', () => {
	const eff = computeEffectiveTiers({ roleTiers: { 'design.contract.detail': 'cheap' }, coreFloor: 'core' });
	const r = role(eff, 'design.contract.detail');
	assert.equal(r.assignedTier, 'cheap');
	assert.equal(r.effectiveTier, 'core'); // raised to the floor
	assert.equal(r.clamped, true);
	assert.equal(eff.coreFloorSource, 'config');
});

test('a peripheral role below coreFloor is NEVER clamped', () => {
	const eff = computeEffectiveTiers({ roleTiers: { synthesize: 'cheap' }, coreFloor: 'core' });
	const r = role(eff, 'synthesize');
	assert.equal(r.effectiveTier, 'cheap');
	assert.equal(r.clamped, false);
});

// ── stale overrides preserved ───────────────────────────────────────────────

test('a roleTiers key that is not a current taxonomy role is surfaced as a stale override', () => {
	const eff = computeEffectiveTiers({ roleTiers: { 'no.such.role': 'core', synthesize: 'cheap' } });
	assert.deepEqual(eff.staleOverrides, [{ id: 'no.such.role', tier: 'core' }]);
	// the valid override still resolves; the stale one does not pollute the role list
	assert.equal(role(eff, 'synthesize').effectiveTier, 'cheap');
	assert.equal(eff.roles.find(r => r.id === 'no.such.role'), undefined);
});

// ── path helpers ────────────────────────────────────────────────────────────

test('config dot-path helpers target the right keys', () => {
	assert.equal(tierPath('core'), 'models.tiers.core');
	assert.equal(tierPath('cheap'), 'models.tiers.cheap');
	assert.equal(roleTierPath('synthesize'), 'models.tasks.synthesize');
	assert.equal(CORE_FLOOR_PATH, 'models.coreFloor');
});

test('isTierName guards the tier union', () => {
	assert.ok(isTierName('core') && isTierName('mid') && isTierName('cheap'));
	assert.ok(!isTierName('high') && !isTierName(''));
});

// ── roleTiers write target (regression: dotted role ids must stay FLAT keys) ──
//
// Role ids contain dots ("context.assemble"); the daemon's config.write splits
// the path on every '.'. A per-role dotted path would mis-nest the leaf and the
// override would never read back (the "steps don't save" bug). The whole map is
// written at the dotless ROLE_TIERS_PATH instead.

test('ROLE_TIERS_PATH is the dotless map key (no role id appended)', () => {
	assert.equal(ROLE_TIERS_PATH, 'models.tasks');
	// This is deliberately NOT the per-role dotted path — that one is unwritable.
	assert.notEqual(ROLE_TIERS_PATH, roleTierPath('context.assemble'));
});

test('nextRoleTiers keeps a dotted role id as a single FLAT key', () => {
	const next = nextRoleTiers(undefined, 'context.assemble', 'core');
	// The map has one entry keyed by the whole dotted id — NOT nested.
	assert.deepEqual(next, { 'context.assemble': 'core' });
	assert.equal(next['context.assemble'], 'core');
	// prove it did not nest under `context`
	assert.equal((next as Record<string, unknown>)['context'], undefined);
	// and prove it round-trips through the real reader
	assert.equal(computeEffectiveTiers({ roleTiers: next }).roles.find(r => r.id === 'context.assemble')!.assignedTier, 'core');
});

test('nextRoleTiers merges into an existing map without disturbing other roles', () => {
	const current = { 'design.contract.detail': 'mid', synthesize: 'cheap' } as const;
	const next = nextRoleTiers(current, 'context.assemble', 'core');
	assert.deepEqual(next, { 'design.contract.detail': 'mid', synthesize: 'cheap', 'context.assemble': 'core' });
});

test('nextRoleTiers with tier=null clears the override (sparse) and leaves siblings', () => {
	const current = { 'context.assemble': 'core', synthesize: 'cheap' } as const;
	const next = nextRoleTiers(current, 'context.assemble', null);
	assert.deepEqual(next, { synthesize: 'cheap' });
	assert.ok(!('context.assemble' in next));
});

test('nextRoleTiers does not mutate the input map', () => {
	const current = { synthesize: 'cheap' } as const;
	const next = nextRoleTiers(current, 'context.assemble', 'core');
	assert.deepEqual(current, { synthesize: 'cheap' });   // untouched
	assert.notEqual(next, current);
});

test("model-tiers.test.ts: computeEffectiveTiers over a fake definitions answer, with the daemon's effort precedence", () => {
	// core.model '' with core.effort 'high': the tier is dropped, the effort kept over the default's 'turbo'.
	const eff = compute(parseTiering({ tiers: {
		core:  { runner: 'cli-codex', model: '', effort: 'high' },
		mid:   { runner: 'cli-codex', model: '', effort: '' },
		cheap: { runner: 'cli-codex', model: 'fx', effort: 'lo' },
	} }), FAKE);
	assert.deepEqual([eff.tierSource.core, eff.tiers.core.model, eff.tiers.core.effort], ['default', 'fx', 'high']);
	// An explicit '' stays '' (the CLI default), not the default's 'lo'.
	assert.deepEqual([eff.tierSource.mid, eff.tiers.mid.model, eff.tiers.mid.effort], ['default', 'fx-lite-1', '']);
	assert.deepEqual([eff.tierSource.cheap, eff.tiers.cheap.effort], ['config', 'lo']);
	// No effort configured: the tier default's.
	assert.equal(compute({}, FAKE).tiers.core.effort, 'turbo');

	// A configured model its family does not serve is shown as not served, with no effort choices.
	const unserved = compute({ tiers: { core: { runner: 'cli-codex', model: 'gpt-unknown', effort: 'turbo' } } }, FAKE);
	assert.equal(unserved.tiers.core.served, false);
	assert.deepEqual(effortChoices(FAKE, unserved.tiers.core), []);
	// Effort choices are '' plus the model's efforts from the answer, cycling back to ''.
	assert.deepEqual(effortChoices(FAKE, { runner: 'cli-codex', model: 'fx' }), ['', 'lo', 'turbo']);
	assert.deepEqual(['', 'lo', 'turbo'].map(e => nextInCycle(effortChoices(FAKE, { runner: 'cli-codex', model: 'fx' }), e)), ['lo', 'turbo', '']);
	assert.equal(nextInCycle([], 'x'), undefined);

	// The pane module holds no list of its own.
	const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'panes', 'model-tiers.ts'), 'utf8');
	assert.doesNotMatch(src, /\b(DEFAULT_TIERS|TIER_EFFORTS|resolveTier|shippedModelRegistry)\b/);
});

test('model-tiers.test.ts: tier edit helpers (family without tierDefaults, effort drop, alias, unserved ids)', () => {
	// Family switch: the family's tierDefaults[tier]; for a family without tierDefaults, its toolLoopModel with ''.
	assert.deepEqual(switchFamily(FAKE, 'core', 'cli-claude'), { runner: 'cli-claude', model: 'fc-big' });
	assert.deepEqual(switchFamily(FAKE, 'mid', 'cli-codex'), { runner: 'cli-codex', model: 'fx-lite-1', effort: 'lo' });
	assert.deepEqual(switchFamily(FAKE, 'cheap', 'ollama'), { runner: 'ollama', model: 'loc:2', effort: '' });
	assert.equal(switchFamily(FAKE, 'core', 'nope'), undefined);

	// Model switch keeps an accepted effort and drops one the new model does not list.
	assert.deepEqual(switchModel(FAKE, { runner: 'cli-codex', model: 'fx', effort: 'lo' }, 'fx-lite-1'), { runner: 'cli-codex', model: 'fx-lite-1', effort: 'lo' });
	assert.deepEqual(switchModel(FAKE, { runner: 'cli-codex', model: 'fx', effort: 'turbo' }, 'mini'), { runner: 'cli-codex', model: 'fx-lite-1', effort: '' });
	assert.equal(switchModel(FAKE, { runner: 'cli-codex', model: 'fx' }, 'gpt-unknown'), undefined);

	// Typed ids: an alias resolves to the canonical id; an unserved CLI id asks for a check; an unserved local id is refused.
	assert.deepEqual(resolveTypedModel(FAKE, 'cli-codex', 'mini'), { kind: 'served', model: 'fx-lite-1' });
	assert.deepEqual(resolveTypedModel(FAKE, 'cli-claude', 'fc-new'), { kind: 'check' });
	assert.deepEqual(resolveTypedModel(FAKE, 'ollama', 'loc:9'), { kind: 'refused', reason: 'only listed Fake Local models are selectable' });
	assert.equal(tierPath('mid'), 'models.tiers.mid');
});

/** FAKE plus a family that runs its CLI on Ollama (Epic b220bb61, Story s3): no
 *  tierDefaults, a cloud model with efforts (and an alias) and a local one without. */
const HOSTED: ModelDefinitionsResult = {
	...FAKE,
	families: [...FAKE.families, {
		id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Fake Hosted',
		models: [
			{ id: 'hc:cloud', aliases: ['hc'], efforts: ['low', 'max'], source: 'shipped', hosting: 'cloud' },
			{ id: 'hl:7b', aliases: [], efforts: [], source: 'shipped', hosting: 'local' },
		],
	}],
};
const hostedTier = (model: string) => compute({ tiers: { core: { runner: 'ollama-claude', model, effort: '' } } }, HOSTED).tiers.core;

test("model-tiers.test.ts: computeEffectiveTiers marks a host family's served model with its hosting and an undeclared one as notSupported; vendor, plain Ollama and host-less families are unchanged", () => {
	assert.deepEqual(hostedTier('hc:cloud'), { runner: 'ollama-claude', model: 'hc:cloud', effort: '', served: true, hosting: 'cloud', notSupported: false });
	assert.deepEqual([hostedTier('hl:7b').hosting, hostedTier('hl:7b').notSupported], ['local', false]);
	// A configured alias is served with its hosting (the pane shows the canonical id).
	assert.deepEqual([hostedTier('hc').served, hostedTier('hc').hosting], [true, 'cloud']);
	// An undeclared model: not served, not supported, no hosting.
	const missing = hostedTier('gone:cloud');
	assert.deepEqual([missing.served, missing.notSupported, 'hosting' in missing], [false, true, false]);

	// A vendor CLI's unserved model, and plain Ollama, carry no hosting and notSupported false.
	const vendor = compute({ tiers: {
		core:  { runner: 'cli-codex', model: 'gpt-unknown', effort: '' },
		mid:   { runner: 'ollama', model: 'loc:1', effort: '' },
	} }, HOSTED).tiers;
	assert.deepEqual([vendor.core.served, vendor.core.notSupported, 'hosting' in vendor.core], [false, false, false]);
	assert.deepEqual([vendor.mid.served, vendor.mid.notSupported, 'hosting' in vendor.mid], [true, false, false]);

	// An older daemon answers without `host`: the family computes as a vendor family.
	const old: ModelDefinitionsResult = { ...HOSTED, families: HOSTED.families.map(f => {
		if (f.host === undefined) return f;
		const { host: _host, ...rest } = f;
		return rest;
	}) };
	const oldTier = compute({ tiers: { core: { runner: 'ollama-claude', model: 'gone:cloud', effort: '' } } }, old).tiers.core;
	assert.deepEqual([oldTier.served, oldTier.notSupported, 'hosting' in oldTier], [false, false, false]);
	assert.equal('hosting' in compute({ tiers: { core: { runner: 'ollama-claude', model: 'hc:cloud', effort: '' } } }, old).tiers.core, false);
	assert.deepEqual(resolveTypedModel(old, 'ollama-claude', 'other:cloud'), { kind: 'check' });
});

test("model-tiers.test.ts: resolveTypedModel refuses an unlisted id for a host family and keeps 'check' for a vendor CLI family; switchFamily to the host family takes its first declared model", () => {
	assert.deepEqual(resolveTypedModel(HOSTED, 'ollama-claude', 'other:cloud'), { kind: 'refused', reason: 'only listed Fake Hosted models are selectable' });
	assert.deepEqual(resolveTypedModel(HOSTED, 'ollama-claude', 'hc'), { kind: 'served', model: 'hc:cloud' });
	assert.deepEqual(resolveTypedModel(HOSTED, 'cli-claude', 'fc-new'), { kind: 'check' });
	// No tierDefaults: the family's first declared model with the CLI-default effort, for every tier.
	for (const t of ['core', 'mid', 'cheap'] as const) {
		assert.deepEqual(switchFamily(HOSTED, t, 'ollama-claude'), { runner: 'ollama-claude', model: 'hc:cloud', effort: '' });
	}
	// Effort choices are unchanged: '' then the model's own; only '' for a model with none.
	assert.deepEqual(effortChoices(HOSTED, { runner: 'ollama-claude', model: 'hc:cloud' }), ['', 'low', 'max']);
	assert.deepEqual(effortChoices(HOSTED, { runner: 'ollama-claude', model: 'hl:7b' }), ['']);
});
