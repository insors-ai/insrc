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

import { parseTiering } from '../analyze.js';

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

test('absent tiering keys → {} (legacy single-provider path)', () => {
	assert.deepEqual(parseTiering({}), {});
	// legacy keys present but no tiering keys → still {}
	assert.deepEqual(parseTiering({ shaperProvider: 'ollama', shaperModel: 'qwen3.6:35b-a3b' }), {});
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
