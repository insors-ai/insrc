/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the Model Tiers pane overlay (standalone S001) — the pure
 * computeEffectiveTiers logic + path helpers. Uses the REAL DEFAULT_TIERS +
 * reasoningRoleTaxonomy (both pure), no ink/daemon.
 *
 * Run: npx tsx --test src/cli/__tests__/model-tiers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AnalyzeTiering } from '../../config/analyze.js';
import {
	computeEffectiveTiers, tierFieldPath, roleTierPath, CORE_FLOOR_PATH, isTierName,
	ROLE_TIERS_PATH, nextRoleTiers,
} from '../panes/model-tiers.js';

const role = (eff: ReturnType<typeof computeEffectiveTiers>, id: string) => eff.roles.find(r => r.id === id)!;

// ── empty tiering → built-in defaults ───────────────────────────────────────

test('empty tiering: tiers = DEFAULT_TIERS (source default), coreFloor = mid (default)', () => {
	const eff = computeEffectiveTiers({});
	assert.deepEqual(eff.tiers.core, { runner: 'cli-claude', model: 'opus' });
	assert.deepEqual(eff.tiers.mid, { runner: 'cli-claude', model: 'sonnet' });
	assert.deepEqual(eff.tiers.cheap, { runner: 'ollama', model: 'qwen3.6:27b' });
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
	const t: AnalyzeTiering = { tiers: { mid: { runner: 'cli-codex', model: 'gpt-5.5' } } };
	const eff = computeEffectiveTiers(t);
	assert.deepEqual(eff.tiers.mid, { runner: 'cli-codex', model: 'gpt-5.5' });
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
	assert.equal(tierFieldPath('core', 'runner'), 'models.tiers.core.runner');
	assert.equal(tierFieldPath('cheap', 'model'), 'models.tiers.cheap.model');
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
