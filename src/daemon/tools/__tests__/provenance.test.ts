/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t5: the provenance table written only by the failure-net wrappers.
 * Run: npx tsx --test src/daemon/tools/__tests__/provenance.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { withFailureNet } from '../builtins/git/helpers.js';
import { withGhFailureNet } from '../builtins/gh/helpers.js';
import { definitionOf, isDefinitionOf, markDefinition } from '../provenance.js';
import type { Tool } from '../types.js';
import { InSchema, OutSchema } from './_fakes.js';

const def = (id = 'pv_tool'): Tool => ({ id, description: 'd', inputSchema: InSchema as never, outputSchema: OutSchema as never, async execute() { return { output: 'x', format: 'text', success: true }; } });

test('provenance.test.ts: markDefinition(copy, original) makes definitionOf(copy) the original', () => {
	const original = def(); const copy = { ...original };
	assert.equal(definitionOf(copy), undefined);
	markDefinition(copy, original);
	assert.equal(definitionOf(copy), original);
	assert.equal(isDefinitionOf(copy, original), true);
	assert.equal(isDefinitionOf(original, original), true);
});

test('provenance.test.ts: a copy of a marked copy records its immediate original and isDefinitionOf reaches both levels', () => {
	const base = def();
	const once = withFailureNet(base);
	const twice = withFailureNet(once);
	assert.equal(definitionOf(once), base);
	assert.equal(definitionOf(twice), once, 'the immediate original, not the first');
	assert.equal(isDefinitionOf(twice, once), true);
	assert.equal(isDefinitionOf(twice, base), true);
	assert.equal(isDefinitionOf(once, twice), false, 'the walk goes from the registered object toward the definition only');
});

test('provenance.test.ts: an object made by spreading a marked copy is not marked, and neither is any other unmarked object', () => {
	const base = def();
	const marked = withFailureNet(base);
	const spread = { ...marked };
	assert.equal(definitionOf(spread), undefined);
	assert.equal(isDefinitionOf(spread, base), false);
	assert.equal(isDefinitionOf(spread, marked), false);
	assert.equal(definitionOf(def('other')), undefined);
});

test('provenance.test.ts: a symbol or property copied by a spread does not mark an object', () => {
	const base = def();
	const sym = Symbol('marker');
	const withMarkers = Object.assign(withFailureNet(base), { __definition: base, [sym]: base }) as Tool;
	const spread = { ...withMarkers } as Tool;
	assert.equal(definitionOf(spread), undefined);
	assert.equal(isDefinitionOf(spread, base), false, 'copied own and symbol properties are not provenance');
});

test('provenance.test.ts: the gh wrapper marks its copy from the object passed too', () => {
	const base = { ...def('pv_gh') } as never as Parameters<typeof withGhFailureNet>[0];
	const wrapped = withGhFailureNet(base);
	assert.equal(definitionOf(wrapped as Tool), base as Tool);
});

test('provenance.test.ts: a chain of 9 wrappers is not accepted for the first object (the 8-step bound) and a cycle ends in false', () => {
	const base = def();
	let current: Tool = base;
	const chain: Tool[] = [];
	for (let i = 0; i < 9; i++) { current = withFailureNet(current); chain.push(current); }
	assert.equal(isDefinitionOf(chain[7]!, base), true, '8 wrappers: the original is 8 steps away');
	assert.equal(isDefinitionOf(chain[8]!, base), false, '9 wrappers: past the bound');
	assert.equal(isDefinitionOf(chain[8]!, chain[0]!), true, 'a nearer level still passes');
	const a = def('cyc'); const b = { ...a };
	markDefinition(a, b); markDefinition(b, a);
	assert.equal(isDefinitionOf(a, def('never')), false, 'a cycle ends');
});

test('provenance.test.ts: marking does not change withFailureNet: an UnsafeArgError becomes a rejected failure and any other exception is rethrown', async () => {
	const { UnsafeArgError } = await import('../builtins/git/helpers.js');
	const unsafe = withFailureNet({ ...def('pv_unsafe'), async execute() { throw new UnsafeArgError('unsafe ref'); } });
	const r = await unsafe.execute({}, { sessionId: 's', repoPath: '/tmp', send: () => {}, requestId: 1 });
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	const boom = withFailureNet({ ...def('pv_boom'), async execute() { throw new Error('boom'); } });
	await assert.rejects(boom.execute({}, { sessionId: 's', repoPath: '/tmp', send: () => {}, requestId: 1 }), /boom/);
});
