/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the RoleRouter (S003 — sc3): the pure resolveRole precedence
 * merge + sc2 floor clamp, the resolveShaperKind roleResolved admission, and the
 * router surface (memoization, summariser-stays-local). All construction uses
 * the real (cheap) provider constructors — no live LLM.
 *
 * Run: npx tsx --test src/analyze/context/__tests__/role-router.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assembleConfig, type AnalyzeConfig, type AnalyzeTiering } from '../../../config/analyze.js';
import { resolveRole, createRoleRouter } from '../role-router.js';
import { resolveShaperKind } from '../shaper-provider.js';

/** Minimal AnalyzeConfig factory — plain object, no disk. */
function cfg(tiering: AnalyzeTiering = {}, over: Partial<AnalyzeConfig> = {}): AnalyzeConfig {
	return {
		shaperProvider: 'ollama',
		shaperProviderExplicit: false,
		shaperModel: 'qwen3.6:35b-a3b',
		shaperModelExplicit: false,
		summariserProvider: 'ollama',
		summariserModel: 'qwen3.6:35b-a3b',
		shaper: { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumCtx: 32768, ollamaNumPredict: 20480 },
		maxPlanDepth: { XS: 2, S: 3, M: 4, L: 5, XL: 6 },
		tiering,
		...over,
	};
}

const CRITICAL = 'design.contract.detail'; // taxonomy: critical → core
const PERIPH   = 'synthesize';             // taxonomy: peripheral → mid

/** A config as loadAnalyzeConfig builds it: every tier resolved through the registry. */
const loaded = (tiering: AnalyzeTiering = {}): AnalyzeConfig => assembleConfig(tiering, cfg().shaper, cfg().maxPlanDepth);

// ── resolveRole: empty tiering → the definitions' tier defaults apply ────────

test('empty tiering → peripheral (mid) role resolves to the shipped mid default (claude sonnet), no clamp', () => {
	const r = resolveRole(PERIPH, loaded(), undefined);
	assert.equal(r.tier, 'mid'); // synthesize defaultTier
	assert.equal(r.runner, 'cli-claude');
	assert.equal(r.model, 'claude-sonnet-5');
	assert.equal(r.clampedByFloor, false);
});

test('empty tiering → critical (core) role resolves to the shipped core default (claude opus), no clamp', () => {
	const r = resolveRole(CRITICAL, loaded(), undefined);
	assert.equal(r.tier, 'core');
	assert.equal(r.runner, 'cli-claude');
	assert.equal(r.model, 'claude-opus-5-5');
	assert.equal(r.clampedByFloor, false);
});

test('S010: brainstorm.decision.draft is peripheral → mid and is NOT floor-clamped', () => {
	// The adaptive elicit draft role resolves to the mid tier (never cheap/local)
	// and, being peripheral, is passed through the coreFloor guard unclamped.
	const r = resolveRole('brainstorm.decision.draft', cfg(), undefined);
	assert.equal(r.tier, 'mid');
	assert.equal(r.clampedByFloor, false);
});

test('empty tiering BUT an explicit legacy shaperProvider still wins over the built-in defaults', () => {
	const r = resolveRole(PERIPH, cfg({}, { shaperProvider: 'cli-codex', shaperProviderExplicit: true }), undefined,
		{ clientDefault: undefined });
	assert.equal(r.runner, 'cli-codex'); // a config without resolved tiers falls to the legacy chain
});

test('a configured cheap tier wins over the shipped cheap default', () => {
	const NARROW = 'analyze.narrow'; // taxonomy: peripheral → cheap
	const builtIn = resolveRole(NARROW, loaded(), undefined);
	assert.equal(builtIn.tier, 'cheap');
	assert.equal(builtIn.runner, 'cli-claude');
	assert.equal(builtIn.model, 'claude-haiku-5-5');
	const configured = resolveRole(NARROW, loaded({ tiers: { cheap: { runner: 'ollama', model: 'qwen3.6:27b' } } }), undefined);
	assert.equal(configured.runner, 'ollama');
	assert.equal(configured.model, 'qwen3.6:27b');
});

// ── resolveRole: role→tier assignment + tier model ──────────────────────────

test('roleTiers assigns a peripheral role a cheap tier with a concrete model', () => {
	const t: AnalyzeTiering = { roleTiers: { synthesize: 'cheap' }, tiers: { cheap: { runner: 'ollama', model: 'qwen-small' } } };
	const r = resolveRole(PERIPH, cfg(t), undefined);
	assert.equal(r.tier, 'cheap');
	assert.equal(r.runner, 'ollama');
	assert.equal(r.model, 'qwen-small');
});

test('a mid CLI tier pins a concrete model (e.g. sonnet) that shaperModel alone cannot express', () => {
	const t: AnalyzeTiering = { roleTiers: { synthesize: 'mid' }, tiers: { mid: { runner: 'cli-claude', model: 'sonnet' } } };
	const r = resolveRole(PERIPH, cfg(t), undefined);
	assert.equal(r.runner, 'cli-claude');
	assert.equal(r.model, 'sonnet');
});

// ── resolveRole: coreFloor clamp (ac1/ac2) ──────────────────────────────────

test('critical role assigned cheap is clamped UP to a core floor (clampedByFloor true) and uses the core tier model', () => {
	const t: AnalyzeTiering = {
		roleTiers: { 'design.contract.detail': 'cheap' },
		coreFloor: 'core',
		tiers: { core: { runner: 'cli-claude', model: 'opus' }, cheap: { runner: 'ollama', model: 'q' } },
	};
	const r = resolveRole(CRITICAL, cfg(t), undefined);
	assert.equal(r.tier, 'core');
	assert.equal(r.clampedByFloor, true);
	assert.equal(r.runner, 'cli-claude');
	assert.equal(r.model, 'opus');
});

test('peripheral role assigned cheap is NEVER clamped even with a core floor', () => {
	const t: AnalyzeTiering = { roleTiers: { synthesize: 'cheap' }, coreFloor: 'core', tiers: { cheap: { runner: 'ollama', model: 'q' } } };
	const r = resolveRole(PERIPH, cfg(t), undefined);
	assert.equal(r.tier, 'cheap');
	assert.equal(r.clampedByFloor, false);
});

// ── resolveRole: byRepo precedence (ac3) ────────────────────────────────────

test('byRepo roleTiers overrides the global roleTiers for the same role', () => {
	const t: AnalyzeTiering = {
		roleTiers: { synthesize: 'cheap' },
		byRepo: { '/work/afm': { roleTiers: { synthesize: 'core' } } },
		tiers: { core: { runner: 'cli-claude', model: 'opus' }, cheap: { runner: 'ollama', model: 'q' } },
	};
	assert.equal(resolveRole(PERIPH, cfg(t), '/work/afm').tier, 'core');
	assert.equal(resolveRole(PERIPH, cfg(t), '/other').tier, 'cheap'); // global still applies elsewhere
});

// ── resolveRole: unknown role is a total-function default (never throws) ─────

test('an unknown RoleId falls to the built-in default tier (mid), non-critical, no throw', () => {
	const r = resolveRole('not.a.registered.role', cfg(), undefined);
	assert.equal(r.tier, 'mid');
	assert.equal(r.clampedByFloor, false);
});

// ── resolveShaperKind: roleResolved admission (k1/ac2) ───────────────────────

test('resolveShaperKind: roleResolved wins over global/client', () => {
	assert.equal(resolveShaperKind({ globalExplicit: 'cli-codex', clientDefault: 'ollama', roleResolved: 'cli-claude' }), 'cli-claude');
});

test('resolveShaperKind: a non-union roleResolved is coerced away (falls through the chain, never a REST path)', () => {
	assert.equal(resolveShaperKind({ globalExplicit: 'cli-codex', clientDefault: undefined, roleResolved: 'openai' as never }), 'cli-codex');
	assert.equal(resolveShaperKind({ globalExplicit: undefined, clientDefault: undefined, roleResolved: 'openai' as never }), 'cli-claude', "the floor is the definitions' default family");
});

test('resolveShaperKind: legacy callers resolve identically (roleResolved absent)', () => {
	assert.equal(resolveShaperKind({ globalExplicit: 'cli-claude', clientDefault: undefined }), 'cli-claude');
	assert.equal(resolveShaperKind({ globalExplicit: undefined, clientDefault: undefined }), 'cli-claude');
});

// ── router surface: memoization + summariser-stays-local ─────────────────────

test('resolveProviderForRole memoizes per (role, repoPath) — repeated calls reuse the instance', () => {
	const router = createRoleRouter();
	const c = cfg();
	const a = router.resolveProviderForRole(PERIPH, c);
	const b = router.resolveProviderForRole(PERIPH, c);
	assert.equal(a, b, 'same (role,repoPath) returns the memoized ResolvedProvider');
	const other = router.resolveProviderForRole(CRITICAL, c);
	assert.notEqual(a, other, 'a different role is a distinct resolution');
});

test('resolveProviderForRole attaches a resolution record with the resolved tier/runner/model', () => {
	const t: AnalyzeTiering = { roleTiers: { synthesize: 'mid' }, tiers: { mid: { runner: 'cli-claude', model: 'sonnet' } } };
	const rp = createRoleRouter().resolveProviderForRole(PERIPH, cfg(t));
	assert.equal(rp.resolution.role, PERIPH);
	assert.equal(rp.resolution.runner, 'cli-claude');
	assert.equal(rp.resolution.model, 'sonnet');
	assert.ok(rp.provider);
});

test('resolveSummariser follows the summariser config (cheap tier), not the shaper/role tiering', () => {
	const t: AnalyzeTiering = { roleTiers: { synthesize: 'core' }, tiers: { core: { runner: 'cli-claude', model: 'opus' } } };
	const rp = createRoleRouter().resolveSummariser(cfg(t));
	assert.equal(rp.resolution.runner, 'ollama');
	assert.equal(rp.resolution.tier, 'cheap');
});
