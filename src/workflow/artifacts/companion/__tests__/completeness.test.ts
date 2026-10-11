/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t9 — completeness findings: at most two LOWs per definition,
 * one for a missing narrative and one naming the elements with no description.
 * The validators never return them.
 *
 * Run:
 *   npx tsx --test src/workflow/artifacts/companion/__tests__/completeness.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erCompletenessFindings, validateErDefinition, type ErDefinition } from '../er.js';
import { sequenceCompletenessFindings, validateSequenceDefinition, type SequenceDefinition } from '../sequence.js';
import { componentCompletenessFindings, validateComponentDependencyDefinition, type ComponentDependencyDefinition } from '../component.js';
import { uxCompletenessFindings, validateUxDefinition, type UxDefinition } from '../ux.js';
import { completenessFindings } from '../completeness.js';

const erBare: ErDefinition = { classes: { Customer: { attributes: { id: { range: 'string', identifier: true } } } } };
const erFull: ErDefinition = {
	narrative: 'Customers.',
	classes: { Customer: { description: 'A buyer.', attributes: { id: { range: 'string', identifier: true, description: 'Key.' } } } },
};
const seqBare: SequenceDefinition = { participants: [{ id: 'a' }, { id: 'b' }], messages: [{ from: 'a', to: 'b', label: 'go' }] };
const seqFull: SequenceDefinition = {
	narrative: 'A asks B.',
	participants: [{ id: 'a', description: 'Caller.' }, { id: 'b', description: 'Callee.' }],
	messages: [{ from: 'a', to: 'b', label: 'go', description: 'Start.' }],
};
const compBare: ComponentDependencyDefinition = { components: [{ id: 'x' }, { id: 'y' }], dependencies: [{ from: 'x', to: 'y' }] };
const compFull: ComponentDependencyDefinition = {
	narrative: 'X uses Y.',
	components: [{ id: 'x', description: 'Front.' }, { id: 'y', description: 'Back.' }],
	dependencies: [{ from: 'x', to: 'y' }],
};
const uxBare: UxDefinition = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'Title' }, { type: 'Input.Text', id: 'q', label: 'Search' }] };
const uxFull: UxDefinition = {
	type: 'AdaptiveCard', narrative: 'Search screen.',
	body: [{ type: 'TextBlock', text: 'Title', description: 'Screen title.' }, { type: 'Input.Text', id: 'q', label: 'Search', description: 'Query box.' }],
};

// ---------------------------------------------------------------------------
// unit: completenessFindings: absent narrative / missing descriptions / fully described
// ---------------------------------------------------------------------------

test('d9f85b3c t9 — an absent narrative is one LOW, and missing descriptions one LOW naming them', () => {
	const er = erCompletenessFindings(erBare);
	assert.deepEqual(er.map(f => [f.dimension, f.severity, f.location, f.confidence]), [
		['diagram', 'LOW', 'erDefinition:narrative', 'observation'],
		['diagram', 'LOW', 'erDefinition:description', 'observation'],
	]);
	assert.match(er[1]!.message, /2 elements of erDefinition have no description.*entity Customer, Customer\.id\./);

	assert.match(sequenceCompletenessFindings(seqBare)[1]!.message, /participant a, participant b, message 1 \(go\)/);
	assert.match(componentCompletenessFindings(compBare)[1]!.message, /component x, component y/);
	const ux = uxCompletenessFindings(uxBare);
	assert.deepEqual(ux.map(f => [f.dimension, f.location]), [['ux', 'uxDefinition:narrative'], ['ux', 'uxDefinition:description']]);
	assert.match(ux[1]!.message, /#1 Title, #2 Search/, 'UX names key elements by their marker numbers');
});

test('d9f85b3c t9 — a fully described definition of each kind has no completeness findings', () => {
	assert.deepEqual(erCompletenessFindings(erFull), []);
	assert.deepEqual(sequenceCompletenessFindings(seqFull), []);
	assert.deepEqual(componentCompletenessFindings(compFull), []);
	assert.deepEqual(uxCompletenessFindings(uxFull), []);
});

test('d9f85b3c t9 — a narrative alone, or descriptions alone, leaves exactly the other LOW', () => {
	assert.deepEqual(erCompletenessFindings({ ...erBare, narrative: 'Customers.' }).map(f => f.location), ['erDefinition:description']);
	assert.deepEqual(erCompletenessFindings({ classes: erFull.classes }).map(f => f.location), ['erDefinition:narrative']);
	assert.deepEqual(erCompletenessFindings({ ...erFull, narrative: '   ' }).map(f => f.location), ['erDefinition:narrative'], 'a blank narrative counts as missing');
});

test('d9f85b3c t9 — a long list is summarised after eight names', () => {
	const names = Array.from({ length: 11 }, (_, i) => `e${i + 1}`);
	const [, f] = completenessFindings('diagram', 'erDefinition', false, names);
	assert.match(f!.message, /e1, e2, e3, e4, e5, e6, e7, e8 and 3 more\.$/);
});

test('d9f85b3c t9 — the validators are unchanged: a sound undescribed definition still validates to []', () => {
	assert.deepEqual(validateErDefinition(erBare), []);
	assert.deepEqual(validateSequenceDefinition(seqBare), []);
	assert.deepEqual(validateComponentDependencyDefinition(compBare), []);
	assert.deepEqual(validateUxDefinition(uxBare), []);
});
