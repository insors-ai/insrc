/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) unit tests — validateErDefinition (LinkML metamodel + referential
 * integrity + FR-consistency, against the JSON element) + erDefinitionToIr
 * (deterministic classes→entities / scalar→attributes / class→relationship w/
 * crow's-foot). Proves validation runs on the structured element, never a rendered
 * file (there is no file/path input). ac3 + ac4.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/er.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	validateErDefinition,
	erDefinitionToIr,
	crowsFootToken,
	ErDefinitionError,
	ER_DOC_TYPE,
	type ErDefinition,
} from '../er.js';
import type { FunctionalDefinition } from '../../functional-definition.js';

/** A sound two-entity model: Customer (identified) 1—* Order (identified). */
const validEr: ErDefinition = {
	id: 'orders',
	classes: {
		Customer: { attributes: {
			id:    { range: 'string', identifier: true },
			name:  { range: 'string', required: true },
		} },
		Order: { attributes: {
			id:       { range: 'string', identifier: true },
			total:    { range: 'decimal' },
			customer: { range: 'Customer', required: true },       // class-ranged → relationship
		} },
	},
};

// ── validateErDefinition ──────────────────────────────────────────────────────

test('validateErDefinition: a metamodel-valid, referentially-sound model → no findings (ac3)', () => {
	assert.deepEqual(validateErDefinition(validEr), []);
});

test('validateErDefinition: a shape/cardinality violation → HIGH breach via ajv vs the vendored metamodel (ac4)', () => {
	// `required` must be a boolean; a string violates the metamodel schema.
	const bad = { classes: { Foo: { attributes: { id: { range: 'string', required: 'yes' } } } } };
	const findings = validateErDefinition(bad);
	assert.ok(findings.length >= 1);
	assert.ok(findings.every(f => f.dimension === 'diagram'));
	assert.ok(findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach' && /metamodel/i.test(f.message)));
});

test('validateErDefinition: a dangling relationship range → HIGH referential-integrity breach', () => {
	const dangling: ErDefinition = { classes: { Order: { attributes: {
		id:       { range: 'string', identifier: true },
		customer: { range: 'Customer' },                          // Customer is undefined + not a scalar
	} } } };
	const findings = validateErDefinition(dangling);
	assert.ok(findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach' && /dangling relationship/i.test(f.message)));
});

test('validateErDefinition: ER<->FR mismatch → a finding when a FunctionalDefinition is supplied', () => {
	const fnMismatch: FunctionalDefinition = { requirements: [
		{ id: 'E20260717abcd1234:FR001', statement: 'Show a report to the accountant', scope: 'doc' },
	] };
	const mismatch = validateErDefinition(validEr, fnMismatch);
	assert.ok(mismatch.some(f => /inconsistent/i.test(f.message)), 'expected an ER<->FR inconsistency finding');

	// A FunctionalDefinition that references an entity → no inconsistency finding.
	const fnMatch: FunctionalDefinition = { requirements: [
		{ id: 'E20260717abcd1234:FR001', statement: 'The Customer places an Order', scope: 'doc' },
	] };
	const match = validateErDefinition(validEr, fnMatch);
	assert.ok(!match.some(f => /inconsistent/i.test(f.message)));
});

test('validateErDefinition: validates the JSON element only — no path/file input exists, sound model on no filesystem', () => {
	// The function signature carries only the JSON element (+ optional fnDef); it
	// cannot read a rendered companion. A single-entity model with an identifier is valid.
	const single: ErDefinition = { classes: { Note: { attributes: { id: { range: 'string', identifier: true }, text: { range: 'string' } } } } };
	assert.deepEqual(validateErDefinition(single), []);
});

test('validateErDefinition: a class with no identifier → a LOW observation (never blocks)', () => {
	const noId: ErDefinition = { classes: { Loose: { attributes: { text: { range: 'string' } } } } };
	const findings = validateErDefinition(noId);
	assert.ok(findings.some(f => f.severity === 'LOW' && f.confidence === 'observation' && /identifier/i.test(f.message)));
	assert.ok(!findings.some(f => f.severity === 'HIGH'));
});

// ── erDefinitionToIr ──────────────────────────────────────────────────────────

test('erDefinitionToIr: classes→entities, scalar slots→attributes, class slots→relationship edges w/ crow\'s-foot', () => {
	const ir = erDefinitionToIr(validEr);
	assert.equal(ir.docType, ER_DOC_TYPE);
	assert.deepEqual(ir.derived.nodes.map(n => n.id).sort(), ['Customer', 'Order']);
	// scalar slots folded into the label (attributes)
	const order = ir.derived.nodes.find(n => n.id === 'Order')!;
	assert.match(order.label, /total: decimal/);
	assert.ok(!/customer/.test(order.label), 'a class-ranged slot is an edge, not an attribute');
	// the class-ranged slot is a relationship edge with the crow's-foot token encoded
	assert.equal(ir.derived.edges.length, 1);
	const edge = ir.derived.edges[0]!;
	assert.equal(edge.from, 'Order');
	assert.equal(edge.to, 'Customer');
	assert.equal(edge.kind, 'relation');
	assert.match(edge.id, /one-to-one/);   // required (min 1), single-valued (max 1)
});

test('erDefinitionToIr: deterministic — same erDef yields byte-identical IR', () => {
	assert.deepEqual(erDefinitionToIr(validEr), erDefinitionToIr(validEr));
});

test('erDefinitionToIr: throws ErDefinitionError for a dangling class-ranged slot (defense-in-depth)', () => {
	const dangling: ErDefinition = { classes: { Order: { attributes: { customer: { range: 'Customer' } } } } };
	assert.throws(() => erDefinitionToIr(dangling), ErDefinitionError);
});

test('crowsFootToken: derives crow\'s-foot from LinkML cardinality', () => {
	assert.equal(crowsFootToken({ required: true }), 'one-to-one');
	assert.equal(crowsFootToken({ required: true, multivalued: true }), 'one-to-many');
	assert.equal(crowsFootToken({}), 'zero-to-one');
	assert.equal(crowsFootToken({ multivalued: true }), 'zero-to-many');
	assert.equal(crowsFootToken({ minimum_cardinality: 1, maximum_cardinality: 5 }), 'one-to-many');
	assert.equal(crowsFootToken({ minimum_cardinality: 0, maximum_cardinality: 1 }), 'zero-to-one');
});
