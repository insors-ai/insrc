/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the ReasoningRoleTaxonomy (S001 — sc4): coverage of every
 * production reasoning site (incl. the ~11 analyze-pipeline callers the HLD
 * review surfaced), the tier ranking, the critical→core default, and the
 * unknown-id gap-fallback contract.
 *
 * Run: npx tsx --test src/config/__tests__/role-taxonomy.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reasoningRoleTaxonomy, roleDescriptor } from '../role-taxonomy.js';

test('rankOf orders cheap < mid < core and is total over the three tiers', () => {
	const { rankOf } = reasoningRoleTaxonomy();
	assert.ok(rankOf.cheap < rankOf.mid && rankOf.mid < rankOf.core, 'cheap < mid < core');
	assert.deepEqual(Object.keys(rankOf).sort(), ['cheap', 'core', 'mid']);
});

test('covers the analyze-pipeline reasoning sites (the ~11-caller scope finding)', () => {
	const ids = new Set(reasoningRoleTaxonomy().roles.map(r => r.id));
	for (const id of [
		'analyze.decompose', 'analyze.synthesize', 'analyze.plan', 'analyze.classify',
		'analyze.scope.pick', 'analyze.adherence', 'analyze.aggregate', 'analyze.narrow',
		'indexer.summarise',
	]) {
		assert.ok(ids.has(id), `taxonomy missing analyze-pipeline role: ${id}`);
	}
});

test('covers the critical workflow reasoning roles', () => {
	const ids = new Set(reasoningRoleTaxonomy().roles.map(r => r.id));
	for (const id of [
		'design.alternatives.enumerate', 'design.alternatives.judge', 'design.contract.detail',
		'scope.audit', 'review', 'build', 'define.scope.assess', 'define.epic.frame', 'define.stories.compose',
	]) {
		assert.ok(ids.has(id), `taxonomy missing critical role: ${id}`);
	}
});

test('every critical role defaults to the core tier (floor-protected)', () => {
	for (const r of reasoningRoleTaxonomy().roles) {
		if (r.criticality === 'critical') assert.equal(r.defaultTier, 'core', `critical role ${r.id} must default to core`);
	}
});

test('peripheral defaults: synthesize → mid, tracker/summaries/probes → cheap', () => {
	assert.equal(roleDescriptor('synthesize')?.defaultTier, 'mid');
	assert.equal(roleDescriptor('tracker.render.summary')?.defaultTier, 'cheap');
	assert.equal(roleDescriptor('indexer.summarise')?.defaultTier, 'cheap');
	assert.equal(roleDescriptor('analyze.narrow')?.defaultTier, 'cheap');
});

test('an unknown role id resolves to undefined (downstream gap-fallback, never throws)', () => {
	assert.equal(roleDescriptor('not.a.real.role'), undefined);
});

test('every role id is unique', () => {
	const ids = reasoningRoleTaxonomy().roles.map(r => r.id);
	assert.equal(new Set(ids).size, ids.length, 'duplicate RoleId in taxonomy');
});

test('every descriptor carries a valid tier + criticality', () => {
	for (const r of reasoningRoleTaxonomy().roles) {
		assert.ok(['core', 'mid', 'cheap'].includes(r.defaultTier), r.id);
		assert.ok(['critical', 'peripheral'].includes(r.criticality), r.id);
	}
});
