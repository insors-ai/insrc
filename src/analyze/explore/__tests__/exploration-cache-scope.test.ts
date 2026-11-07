/**
 * The persistent exploration cache is keyed on the area for the area-aware
 * lookups, and its version is raised (Story 65b643840a294422/s1, task t12).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { EXPLORATION_CACHE_VERSION, hashExplorationParams } from '../../../db/exploration-cache.js';
import type { ResolvedScope } from '../../context/scope.js';
import { AREA_AWARE_TYPES, cacheExplorationFor } from '../exploration-cache-key.js';
import type { Exploration } from '../types.js';

const REPO = '/repo/alpha';
const mod = (dir: string): ResolvedScope => ({ kind: 'module', value: `${REPO}/${dir}`, repoPath: REPO, lookupPath: `${REPO}/${dir}` });
const file: ResolvedScope = { kind: 'file', value: `${REPO}/src/a.ts`, repoPath: REPO, lookupPath: REPO, filePath: `${REPO}/src/a.ts` };
const symbol = (id: string): ResolvedScope => ({ kind: 'symbol', value: `${REPO}/src/a.ts#f`, repoPath: REPO, lookupPath: REPO, filePath: `${REPO}/src/a.ts`, entityId: id });
const repoScope: ResolvedScope = { kind: 'repo', value: REPO, repoPath: REPO, lookupPath: REPO };
const workspace: ResolvedScope = { kind: 'workspace', value: REPO, repoPath: REPO, lookupPath: REPO };
const exp = (type: string, params: Record<string, unknown>): Exploration => ({ id: 'e1', type, purpose: 'p', params }) as Exploration;
const key = (e: Exploration, scope: ResolvedScope | undefined): string => hashExplorationParams(cacheExplorationFor(e, scope));

test('the cache key differs per area and per version for the area-aware lookups, a version-2 row is not read and the narrow write uses the executor\'s key function', () => {
	assert.equal(EXPLORATION_CACHE_VERSION, 3);

	for (const type of AREA_AWARE_TYPES) {
		const e = exp(type, { query: 'same question', subject: 'same question', topic: 'same question', capability: 'same question' });
		const keys = new Set([key(e, mod('src/pay')), key(e, mod('src/billing')), key(e, file), key(e, symbol('e1')), key(e, symbol('e2')), key(e, repoScope)]);
		assert.equal(keys.size, 6, `${type}: every area, and the whole repository, has its own entry`);
		// a repository scope, a workspace scope and no scope are the same area: the whole repository
		assert.equal(key(e, repoScope), key(e, workspace), `${type}: repo and workspace share an entry`);
		assert.equal(key(e, repoScope), key(e, undefined), `${type}: no scope is the whole repository`);
		// the same area is the same entry, whatever spelling of the path the scope came from
		assert.equal(key(e, mod('src/pay')), key(e, { ...mod('src/pay'), value: `${REPO}/src/pay` }));
	}

	// the other lookups are keyed as before, on no area
	for (const type of ['symbol.locate', 'module.profile', 'import.graph', 'convention.detect', 'class.hierarchy', 'usage.example', 'search.text']) {
		const e = exp(type, { names: ['x'], path: '/p' });
		assert.equal(AREA_AWARE_TYPES.has(type), false, type);
		assert.equal(key(e, mod('src/pay')), hashExplorationParams(e), `${type}: unchanged by the area`);
		assert.equal(key(e, mod('src/pay')), key(e, mod('src/billing')), type);
	}

	// a row written under version 2 sits at a different key than the same lookup under version 3
	const e = exp('concept.resolve', { query: 'same question' });
	const asVersion2 = createHash('sha256').update(JSON.stringify({ v: 2, type: e.type, params: { query: 'same question' } }), 'utf8').digest('hex').slice(0, 16);
	assert.notEqual(asVersion2, key(e, repoScope), 'a version-2 row is addressed by a key the current code never computes');
	assert.notEqual(asVersion2, hashExplorationParams(e), 'not even for a lookup with no area');

	// one key function: the executor's reads and writes and the narrow phase's write all call it
	const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');
	const executor = read('../executor.ts');
	const narrow = read('../../../daemon/steps/analyze-step/phases/narrow.ts');
	assert.equal(executor.match(/(get|put)CachedExploration\(\s*args\.repoPath, args\.repoLastIndexedAtMs, (?!cacheExplorationFor)/g), null, 'every executor read and write goes through cacheExplorationFor');
	assert.equal((executor.match(/cacheExplorationFor\(exp, args\.scope\)/g) ?? []).length, 6);
	assert.match(narrow, /cacheExplorationFor\(pausedExp, scope\)/, 'the narrow phase writes under the same function');
});
