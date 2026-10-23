/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t2: the two conversion roles and the provider helper.
 * Run: npx tsx --test src/daemon/tools/__tests__/conversion-roles.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { AnalyzeConfig, AnalyzeTiering } from '../../../config/analyze.js';
import { roleDescriptor } from '../../../config/role-taxonomy.js';
import { createRoleRouter, resolveRole } from '../../../analyze/context/role-router.js';
import { createConversionProviders } from '../conversion-providers.js';

function cfg(tiering: AnalyzeTiering = {}): AnalyzeConfig {
	return {
		shaperProvider: 'ollama', shaperProviderExplicit: false, shaperModel: 'qwen3.6:35b-a3b', shaperModelExplicit: false,
		summariserProvider: 'ollama', summariserModel: 'qwen3.6:35b-a3b',
		shaper: { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumCtx: 32768, ollamaNumPredict: 20480 },
		maxPlanDepth: { XS: 2, S: 3, M: 4, L: 5, XL: 6 },
		tiering,
	};
}

test('conversion-roles.test.ts: the two new roles resolve through the real RoleRouter and role taxonomy, and the coreFloor does not clamp them', () => {
	assert.deepEqual(roleDescriptor('tools.convert'), { id: 'tools.convert', criticality: 'peripheral', defaultTier: 'cheap' });
	assert.deepEqual(roleDescriptor('tools.convert.escalate'), { id: 'tools.convert.escalate', criticality: 'peripheral', defaultTier: 'mid' });

	const cheap = resolveRole('tools.convert', cfg(), undefined);
	const mid = resolveRole('tools.convert.escalate', cfg(), undefined);
	assert.equal(cheap.tier, 'cheap');
	assert.equal(mid.tier, 'mid');

	// A high coreFloor clamps critical roles only; these peripheral roles keep their tier.
	const floored = cfg({ coreFloor: { runner: 'cli-claude', model: 'opus' } } as AnalyzeTiering);
	assert.equal(resolveRole('tools.convert', floored, undefined).clampedByFloor, false);
	assert.equal(resolveRole('tools.convert.escalate', floored, undefined).clampedByFloor, false);

	// roleTiers reassigns them like any role.
	const moved = cfg({ roleTiers: { 'tools.convert': 'mid', 'tools.convert.escalate': 'core' } });
	assert.equal(resolveRole('tools.convert', moved, undefined).tier, 'mid');
	assert.equal(resolveRole('tools.convert.escalate', moved, undefined).tier, 'core');
});

test('conversion-roles.test.ts: the helper returns a provider for each role from a test config', () => {
	const providers = createConversionProviders(cfg(), '/tmp/repo', createRoleRouter());
	const a = providers.resolveProvider('tools.convert');
	const b = providers.resolveProvider('tools.convert.escalate');
	for (const p of [a, b]) {
		assert.equal(typeof p.completeStructured, 'function');
	}
});
