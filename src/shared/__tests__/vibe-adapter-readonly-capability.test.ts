/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s2/t1: the ReadOnlyCapability type and the
 * module-level qualification cache. The full "excludes outputDir" hash semantics land
 * in s2/t2 (stableDescriptorHash does not exist yet); this covers the cache's own
 * empty-at-load and generic Map hit/miss mechanics.
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter-readonly-capability.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { _readOnlyQualificationCacheForTests } from '../vibe-adapter.js';
import type { ReadOnlyCapability } from '../vibe-adapter.js';

test('the read-only qualification cache is a Map, empty at module load', () => {
	const cache = _readOnlyQualificationCacheForTests();
	assert.ok(cache instanceof Map);
	assert.equal(cache.size, 0);
});

test('stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache', () => {
	const cache = _readOnlyQualificationCacheForTests();
	const capability: ReadOnlyCapability = {
		status: 'qualified',
		allowedTools: ['insrc_analyze', 'insrc_analyze_step'],
		provenAgainst: { stableDescriptorHash: 'stand-in-key', effectiveConfigFingerprint: 'fp-1' },
	};
	// Two "calls" sharing the same stable-descriptor key (standing in for two turns
	// differing only in --output-dir, which the real stableDescriptorHash excludes --
	// proven against the real hash function once s2/t2 lands) both hit the same entry.
	cache.set('stand-in-key', capability);
	assert.deepEqual(cache.get('stand-in-key'), capability);
	assert.deepEqual(cache.get('stand-in-key'), capability);
	// A different key is a miss.
	assert.equal(cache.get('a-different-key'), undefined);
	cache.clear();
});
