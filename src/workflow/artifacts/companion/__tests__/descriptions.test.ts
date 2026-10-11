/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t1 — the four companion definitions carry an optional
 * `narrative` and per-element `description`s for the companion page.
 *
 * The validators keep their contract (an EMPTY array for a sound definition).
 * The ER and UX validators check the VENDORED, CLOSED LinkML / Adaptive Cards
 * subsets, so those assets must admit the new fields too: without them every
 * described definition would get a HIGH and finalize would re-prompt forever.
 *
 * Run:
 *   npx tsx --test src/workflow/artifacts/companion/__tests__/descriptions.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateErDefinition, type ErDefinition } from '../er.js';
import { validateUxDefinition, type UxDefinition } from '../ux.js';
import { validateSequenceDefinition, type SequenceDefinition } from '../sequence.js';
import { validateComponentDependencyDefinition, type ComponentDependencyDefinition } from '../component.js';

const er: ErDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true, required: true }, orders: { range: 'Order', multivalued: true } } },
		Order:    { attributes: { id: { range: 'string', identifier: true, required: true } } },
	},
};
const erDescribed: ErDefinition = {
	narrative: 'Customers place orders; each order belongs to one customer.',
	classes: {
		Customer: {
			description: 'A person who buys.',
			attributes: {
				id:     { description: 'Customer key.', range: 'string', identifier: true, required: true },
				orders: { description: 'Orders this customer placed.', range: 'Order', multivalued: true },
			},
		},
		Order: { description: 'One purchase.', attributes: { id: { description: 'Order key.', range: 'string', identifier: true, required: true } } },
	},
};

const ux: UxDefinition = {
	type: 'AdaptiveCard',
	body: [
		{ type: 'TextBlock', text: 'Sign in', weight: 'bolder' },
		{ type: 'Container', items: [{ type: 'Input.Text', id: 'email', label: 'Email' }] },
		{ type: 'ColumnSet', columns: [{ type: 'Column', items: [{ type: 'Image', url: 'logo.png' }] }] },
		{ type: 'Input.ChoiceSet', id: 'role', choices: [{ title: 'Admin', value: 'admin' }] },
		{ type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Go' }, { type: 'Action.OpenUrl', title: 'Help', url: 'https://example.com' }] },
	],
};
const uxDescribed: UxDefinition = {
	type: 'AdaptiveCard',
	narrative: 'The sign-in screen.',
	body: [
		{ type: 'TextBlock', text: 'Sign in', weight: 'bolder', description: 'Screen title.' },
		{ type: 'Container', description: 'Credentials group.', items: [{ type: 'Input.Text', id: 'email', label: 'Email', description: 'The account email.' }] },
		{ type: 'ColumnSet', description: 'Branding row.', columns: [{ type: 'Column', description: 'Logo column.', items: [{ type: 'Image', url: 'logo.png', description: 'Product logo.' }] }] },
		{ type: 'Input.ChoiceSet', id: 'role', description: 'Which role to sign in as.', choices: [{ title: 'Admin', value: 'admin' }] },
		{ type: 'ActionSet', description: 'Form actions.', actions: [
			{ type: 'Action.Submit', title: 'Go', description: 'Submits the form.' },
			{ type: 'Action.OpenUrl', title: 'Help', url: 'https://example.com', description: 'Opens the help page.' },
		] },
	],
};

const seq: SequenceDefinition = {
	participants: [{ id: 'cli', label: 'CLI' }, { id: 'daemon', label: 'Daemon' }],
	messages: [{ from: 'cli', to: 'daemon', label: 'build' }, { from: 'daemon', to: 'cli', label: 'done', kind: 'return' }],
};
const seqDescribed: SequenceDefinition = {
	narrative: 'The CLI asks the daemon to build and waits for the result.',
	participants: [{ id: 'cli', label: 'CLI', description: 'The user-facing command.' }, { id: 'daemon', label: 'Daemon', description: 'The background service.' }],
	messages: [
		{ from: 'cli', to: 'daemon', label: 'build', description: 'Start a build.' },
		{ from: 'daemon', to: 'cli', label: 'done', kind: 'return', description: 'Report the outcome.' },
	],
};

const comp: ComponentDependencyDefinition = {
	components: [{ id: 'mcp', label: 'MCP server' }, { id: 'daemon', label: 'Daemon' }],
	dependencies: [{ from: 'mcp', to: 'daemon', label: 'IPC' }],
};
const compDescribed: ComponentDependencyDefinition = {
	narrative: 'The MCP server reaches storage only through the daemon.',
	components: [
		{ id: 'mcp', label: 'MCP server', description: 'Tools the controller calls.', path: 'src/mcp' },
		{ id: 'daemon', label: 'Daemon', description: 'Owns all storage.', path: 'src/daemon' },
	],
	dependencies: [{ from: 'mcp', to: 'daemon', label: 'IPC' }],
};

const KINDS = [
	{ kind: 'er',        validate: (d: unknown) => validateErDefinition(d),                  sound: er,   described: erDescribed },
	{ kind: 'ux',        validate: (d: unknown) => validateUxDefinition(d),                  sound: ux,   described: uxDescribed },
	{ kind: 'sequence',  validate: (d: unknown) => validateSequenceDefinition(d),            sound: seq,  described: seqDescribed },
	{ kind: 'component', validate: (d: unknown) => validateComponentDependencyDefinition(d), sound: comp, described: compDescribed },
] as const;

for (const k of KINDS) {
	test(`d9f85b3c t1 — ${k.kind}: a described definition (narrative + descriptions) gets no HIGH`, () => {
		const findings = k.validate(k.described);
		assert.deepEqual(findings.filter(f => f.severity === 'HIGH'), [], JSON.stringify(findings));
		assert.deepEqual(findings, [], 'and nothing else either: the fields are part of the contract');
	});

	test(`d9f85b3c t1 — ${k.kind}: a sound definition without the new fields still returns []`, () => {
		assert.deepEqual(k.validate(k.sound), []);
	});
}

test('d9f85b3c t1 — the closed schemas still reject an unknown field, so the additions are deliberate', () => {
	const erStray = { ...erDescribed, classes: { Customer: { attributes: {}, summary: 'not a field' } } };
	assert.ok(validateErDefinition(erStray).some(f => f.severity === 'HIGH'));
	const uxStray = { ...uxDescribed, body: [{ type: 'TextBlock', text: 'x', summary: 'not a field' }] };
	assert.ok(validateUxDefinition(uxStray).some(f => f.severity === 'HIGH'));
});
