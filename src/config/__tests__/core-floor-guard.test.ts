/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the CoreFloorGuard (S002 — sc2). Exercises applyCoreFloor as a
 * pure FloorInput -> FloorOutcome transform across every criticality x tier x
 * floor combination (ac1/ac2/ac3), the boundary-equality + no-op-floor edges,
 * and the fail-loud / fail-safe error paths.
 *
 * Run: npx tsx --test src/config/__tests__/core-floor-guard.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { TierName } from '../analyze.js';
import type { RoleDescriptor } from '../role-taxonomy.js';
import { applyCoreFloor, InvalidTierError } from '../core-floor-guard.js';

/** Minimal RoleDescriptor literals — we do NOT redefine the taxonomy, just the fields the guard reads. */
const critical: RoleDescriptor   = { id: 'design.contract.detail', criticality: 'critical',   defaultTier: 'core' };
const peripheral: RoleDescriptor = { id: 'tracker.render.summary', criticality: 'peripheral', defaultTier: 'cheap' };

// ── ac1: critical roles clamped up to the configured floor ──────────────────

test('ac1 — critical role strictly below the floor is raised: effectiveTier=floor, clamped, reason', () => {
	const out = applyCoreFloor({ role: critical, resolvedTier: 'cheap', configuredFloor: 'mid' });
	assert.deepEqual(out, { effectiveTier: 'mid', clamped: true, reason: 'below-core-floor' });
});

test('ac1 — critical role at the floor passes through (strict below-floor only): clamped=false', () => {
	const out = applyCoreFloor({ role: critical, resolvedTier: 'core', configuredFloor: 'core' });
	assert.deepEqual(out, { effectiveTier: 'core', clamped: false });
});

test('ac1 — critical role above the floor passes through unchanged, clamped=false', () => {
	const out = applyCoreFloor({ role: critical, resolvedTier: 'core', configuredFloor: 'mid' });
	assert.deepEqual(out, { effectiveTier: 'core', clamped: false });
});

test('ac1 — floor=cheap (bottom-rank no-op floor) never clamps a critical role', () => {
	const out = applyCoreFloor({ role: critical, resolvedTier: 'cheap', configuredFloor: 'cheap' });
	assert.deepEqual(out, { effectiveTier: 'cheap', clamped: false });
});

test('ac1 — off-contract configuredFloor throws InvalidTierError rather than passing an uninterpretable floor', () => {
	assert.throws(
		() => applyCoreFloor({ role: critical, resolvedTier: 'cheap', configuredFloor: 'high' as TierName }),
		(e: unknown) => e instanceof InvalidTierError && (e as InvalidTierError).field === 'configuredFloor',
	);
});

test('ac1 — off-contract resolvedTier throws InvalidTierError rather than emitting a guessed effectiveTier', () => {
	assert.throws(
		() => applyCoreFloor({ role: critical, resolvedTier: 'huge' as TierName, configuredFloor: 'mid' }),
		(e: unknown) => e instanceof InvalidTierError && (e as InvalidTierError).field === 'resolvedTier',
	);
});

// ── ac2: absent configuredFloor → module-private built-in default ('mid') ───

test('ac2 — absent floor + resolved below default: raised to the built-in default, clamped, reason', () => {
	const out = applyCoreFloor({ role: critical, resolvedTier: 'cheap' });
	assert.deepEqual(out, { effectiveTier: 'mid', clamped: true, reason: 'below-core-floor' });
});

test('ac2 — absent floor + resolved at/above the default passes through unchanged, clamped=false', () => {
	const out = applyCoreFloor({ role: critical, resolvedTier: 'core' });
	assert.deepEqual(out, { effectiveTier: 'core', clamped: false });
});

// ── ac3: peripheral roles are never floored ─────────────────────────────────

test('ac3 — peripheral role below the floor is permitted: effectiveTier=cheap, clamped=false', () => {
	const out = applyCoreFloor({ role: peripheral, resolvedTier: 'cheap', configuredFloor: 'core' });
	assert.deepEqual(out, { effectiveTier: 'cheap', clamped: false });
});

test('ac3 — peripheral role with no floor is never floored by the built-in default', () => {
	const out = applyCoreFloor({ role: peripheral, resolvedTier: 'cheap' });
	assert.deepEqual(out, { effectiveTier: 'cheap', clamped: false });
});

// ── s5 error paths: fail-safe on a malformed criticality ────────────────────

test('fail-safe — unclassifiable role.criticality is treated as critical and clamped to the floor', () => {
	const malformed = { id: 'mystery.role', criticality: 'unknown', defaultTier: 'core' } as unknown as RoleDescriptor;
	const out = applyCoreFloor({ role: malformed, resolvedTier: 'cheap', configuredFloor: 'core' });
	assert.deepEqual(out, { effectiveTier: 'core', clamped: true, reason: 'below-core-floor' });
});

test('fail-safe — unclassifiable criticality at/above the floor still passes through, clamped=false', () => {
	const malformed = { id: 'mystery.role', criticality: undefined, defaultTier: 'core' } as unknown as RoleDescriptor;
	const out = applyCoreFloor({ role: malformed, resolvedTier: 'core', configuredFloor: 'mid' });
	assert.deepEqual(out, { effectiveTier: 'core', clamped: false });
});

// ── structural: the clamp is logged via getLogger, never console.log ────────

test('the guard logs via getLogger and never uses console.*', () => {
	const src = readFileSync(fileURLToPath(new URL('../core-floor-guard.ts', import.meta.url)), 'utf8');
	assert.ok(/getLogger\(/.test(src), 'guard must obtain a logger via getLogger');
	assert.ok(!/console\./.test(src), 'guard must not use console.* (log via getLogger)');
});
