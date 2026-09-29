/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) unit tests — validateUxDefinition (Adaptive Cards schema validity,
 * against the JSON element) + uxDefinitionToIr (deterministic card→IR). Proves
 * validation runs on the structured element, never a rendered file (there is no
 * file/path input). A malformed vendored asset raises UxDefinitionError. ac1/ac2.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/ux.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	validateUxDefinition,
	uxDefinitionToIr,
	UxDefinitionError,
	UX_DOC_TYPE,
	type UxDefinition,
} from '../ux.js';
import { _setArtifactSchemaDirForTests } from '../metamodel.js';
import { _resetAdaptiveCardsCacheForTests, ADAPTIVE_CARDS_ASSET } from '../adaptive-cards.js';

afterEach(() => { _setArtifactSchemaDirForTests(undefined); _resetAdaptiveCardsCacheForTests(); });

/** A sound multi-element card. */
const validUx: UxDefinition = {
	type: 'AdaptiveCard',
	version: '1.5',
	body: [
		{ type: 'TextBlock', text: 'Tag filter', weight: 'bolder', size: 'large' },
		{ type: 'Container', items: [
			{ type: 'Input.Text', id: 'query', label: 'Query', placeholder: 'tag…' },
			{ type: 'Input.ChoiceSet', id: 'mode', choices: [{ title: 'Any', value: 'any' }, { title: 'All', value: 'all' }] },
		] },
		{ type: 'ColumnSet', columns: [
			{ type: 'Column', items: [{ type: 'Image', url: 'preview.png', altText: 'preview' }], width: 'auto' },
		] },
		{ type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Apply' }] },
	],
};

// ── validateUxDefinition ──────────────────────────────────────────────────────

test('validateUxDefinition: a schema-valid card → no findings (ac1)', () => {
	assert.deepEqual(validateUxDefinition(validUx), []);
});

test('validateUxDefinition: an unknown card element type → HIGH breach via ajv vs the vendored schema (ac2)', () => {
	const bad = { type: 'AdaptiveCard', body: [{ type: 'Bogus', text: 'x' }] };
	const findings = validateUxDefinition(bad);
	assert.ok(findings.length >= 1);
	assert.ok(findings.every(f => f.dimension === 'ux'));
	assert.ok(findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach' && /Adaptive Cards violation/i.test(f.message)));
});

test('validateUxDefinition: a missing required field (TextBlock without text) → HIGH breach', () => {
	const bad = { type: 'AdaptiveCard', body: [{ type: 'TextBlock' }] };
	const findings = validateUxDefinition(bad);
	assert.ok(findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach'));
});

test('validateUxDefinition: a wrong card discriminator → HIGH breach', () => {
	const bad = { type: 'NotACard', body: [] };
	const findings = validateUxDefinition(bad);
	assert.ok(findings.some(f => f.severity === 'HIGH'));
});

test('validateUxDefinition: validates the JSON element only — no path/file input exists', () => {
	// The function signature carries only the JSON element (+ optional fnDef); it
	// cannot read a rendered companion. A minimal single-element card is valid.
	const single: UxDefinition = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'hi' }] };
	assert.deepEqual(validateUxDefinition(single), []);
});

test('validateUxDefinition: a malformed vendored asset raises UxDefinitionError (t1)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-schema-'));
	writeFileSync(join(dir, ADAPTIVE_CARDS_ASSET), '{ not json');
	_setArtifactSchemaDirForTests(dir);
	_resetAdaptiveCardsCacheForTests();
	assert.throws(() => validateUxDefinition(validUx), UxDefinitionError);
	rmSync(dir, { recursive: true, force: true });
});

// ── uxDefinitionToIr ──────────────────────────────────────────────────────────

test('uxDefinitionToIr: card→root node, every element a node, containment an edge (ac1)', () => {
	const ir = uxDefinitionToIr(validUx);
	assert.equal(ir.docType, UX_DOC_TYPE);
	// root card + 4 top-level + 2 container items + 1 column + 1 image = 9 nodes
	assert.equal(ir.derived.nodes.length, 9);
	assert.equal(ir.derived.nodes[0]!.id, 'AdaptiveCard');
	assert.match(ir.derived.nodes[0]!.label, /v1\.5/);
	// every non-root node is reached by a containment edge
	assert.equal(ir.derived.edges.length, 8);
	assert.ok(ir.derived.edges.every(e => e.kind === 'contains'));
});

test('uxDefinitionToIr: deterministic — same uxDef yields byte-identical IR', () => {
	assert.deepEqual(uxDefinitionToIr(validUx), uxDefinitionToIr(validUx));
});
