/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The planner's per-template wire form (ISSUE-8d39ef09, LLD-9874475f902756f6-S001 t3).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerBuiltinTemplates } from '../templates/bootstrap.js';
import { getTemplateCatalog } from '../templates/registry.js';
import { ITEMS, wireBranchFor, type SlotPath } from '../wire-schema.js';

registerBuiltinTemplates();

/** The node an original schema has at a slot path. */
function nodeAt(schema: Record<string, unknown>, path: SlotPath): Record<string, unknown> {
	let node = schema;
	for (const step of path) node = (step === ITEMS ? node['items'] : (node['properties'] as Record<string, unknown>)[step]) as Record<string, unknown>;
	return node;
}

const ADHERENCE = ['code.adherence.check', 'data.adherence.check', 'infra.adherence.check'];
const AGGREGATORS = ['code.aggregate.report', 'data.aggregate.report', 'docs.aggregate.report', 'generic.aggregate.report', 'infra.aggregate.report'];
const EXPECTED_SLOTS: Readonly<Record<string, readonly SlotPath[]>> = {
	...Object.fromEntries(ADHERENCE.map(id => [id, [['constraints', ITEMS]]])),
	...Object.fromEntries(AGGREGATORS.map(id => [id, [[]]])),
	'docs.subrun.deep-dive': [['upstreamContext']],
};

test('the 27 built-in templates yield a branch each, with exactly their 9 slot sets at the expected paths', () => {
	const catalog = getTemplateCatalog();
	assert.equal(catalog.length, 27);
	const withSlots: string[] = [];
	for (const t of catalog) {
		const branch = wireBranchFor(t.inputSchema!);
		assert.ok(branch.schema['type'] === 'object' || branch.schema['type'] === 'string', `${t.id}: a branch`);
		assert.deepEqual(branch.slots, EXPECTED_SLOTS[t.id] ?? [], `${t.id}: its slots`);
		if (branch.slots.length > 0) withSlots.push(t.id);
	}
	assert.deepEqual(withSlots.sort(), Object.keys(EXPECTED_SLOTS).sort(), 'exactly 9 templates have slots');
});

test('a slot is placed only at a position the original schema restricts to an object, and the adherence root one-of-three is left out of the branch', () => {
	for (const t of getTemplateCatalog()) {
		for (const path of wireBranchFor(t.inputSchema!).slots) {
			const node = nodeAt(t.inputSchema!, path);
			assert.equal(node['type'], 'object', `${t.id} ${path.join('.')}: only an object is admitted there`);
			for (const k of ['anyOf', 'oneOf', 'allOf', 'not', 'if']) assert.equal(node[k], undefined, `${t.id} ${path.join('.')}: no ${k}`);
		}
	}
	// An open object that also admits another type, or sits under a union, is never a slot.
	const open = { type: 'object', additionalProperties: true };
	const mixed = wireBranchFor({ type: 'object', additionalProperties: false, properties: {
		a: { type: ['object', 'string'], additionalProperties: true },
		b: { anyOf: [open, { type: 'string' }] },
		c: open,
	} });
	assert.deepEqual(mixed.slots, [['c']], 'only the object-only position becomes a slot');
	for (const id of ADHERENCE) {
		const t = getTemplateCatalog().find(x => x.id === id)!;
		assert.ok(Array.isArray(t.inputSchema!['anyOf']), `${id}: the template itself keeps its one-of-three`);
		assert.equal(wireBranchFor(t.inputSchema!).schema['anyOf'], undefined, `${id}: the branch leaves it out`);
	}
});
