/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t5 — the ER companion page builder, on the Delivery
 * read-model used by the approved mock.
 *
 * Run:
 *   npx tsx --test src/workflow/artifacts/companion/__tests__/er-page.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erDefinitionToPage, validateErDefinition, type ErDefinition } from '../er.js';
import { renderCompanionPage, type DescriptionBlock } from '../shell.js';

/** The Delivery read model, as in the approved er-model mock. */
const DELIVERY: ErDefinition = {
	narrative: 'The daemon assembles one DeliverySnapshot per board refresh.',
	classes: {
		DeliverySnapshot: {
			description: "One point-in-time read of a repo's delivery state.",
			attributes: {
				repo:    { range: 'string', required: true, description: 'Absolute path of the registered repo.' },
				takenAt: { range: 'datetime', required: true },
				items:   { range: 'DeliveryItem', multivalued: true, description: 'Every Epic, Story and task on the board.' },
			},
		},
		DeliveryItem: {
			description: 'One Epic, Story or task and the stage it has reached.',
			attributes: {
				id:       { range: 'string', identifier: true, required: true, description: 'Canonical work-item id.' },
				kind:     { range: 'string', required: true },
				parentId: { range: 'DeliveryItem', description: 'The containing Epic or Story; absent at the top.' },
				evidence: { range: 'DeliveryEvidenceEntry', multivalued: true },
				owner:    { range: 'DeliveryEvidenceEntry', required: true },
			},
		},
		DeliveryEvidenceEntry: {
			attributes: {
				artifactId: { range: 'string', identifier: true, required: true },
				tags:       { range: 'string', multivalued: true },
			},
		},
		DeliveryNotice: {},
	},
};

const page = erDefinitionToPage(DELIVERY, 'Delivery read model');
const source = page.visual.kind === 'mermaid' ? page.visual.source : '';

function block(heading: string): DescriptionBlock {
	const b = page.description.find(d => d.heading === heading);
	assert.ok(b !== undefined, `no ${heading} block`);
	return b;
}

// ---------------------------------------------------------------------------
// unit: er page builder: erDiagram, PK, cardinality, self-loop (Delivery read-model fixture)
// ---------------------------------------------------------------------------

test('d9f85b3c t5 — the visual is a Mermaid erDiagram, never a classDiagram, and the fixture is a valid definition', () => {
	// Key-less entities are in the fixture on purpose; they draw LOW observations only.
	assert.deepEqual(validateErDefinition(DELIVERY).filter(f => f.severity !== 'LOW'), []);
	assert.equal(page.visual.kind, 'mermaid');
	assert.ok(source.startsWith('erDiagram\n'));
	assert.doesNotMatch(source, /classDiagram/);
	assert.equal(page.kindLabel, 'Entity-relationship model');
	assert.equal(page.narrative, 'The daemon assembles one DeliverySnapshot per board refresh.');
});

test('d9f85b3c t5 — entity boxes carry typed scalar columns, list types for multi-valued, PK for identifiers, and no class-ranged slots', () => {
	assert.ok(source.includes('  DeliveryItem {\n    string id PK\n    string kind\n  }'), source);
	assert.ok(source.includes('  DeliveryEvidenceEntry {\n    string artifactId PK\n    string_list tags\n  }'));
	assert.ok(source.includes('  DeliverySnapshot {\n    string repo\n    datetime takenAt\n  }'));
	assert.ok(source.includes('  DeliveryNotice {\n  }'), 'an attribute-less entity still gets a box');
});

test('d9f85b3c t5 — relationship lines carry the slot name and the cardinality: many, required one, optional one, and a self-loop', () => {
	const rels = source.split('\n').filter(l => l.includes('||--'));
	assert.deepEqual(rels, [
		'  DeliverySnapshot ||--o{ DeliveryItem : "items"',
		'  DeliveryItem ||--o| DeliveryItem : "parentId"',
		'  DeliveryItem ||--o{ DeliveryEvidenceEntry : "evidence"',
		'  DeliveryItem ||--|| DeliveryEvidenceEntry : "owner"',
	]);
});

// ---------------------------------------------------------------------------
// unit: er page builder: entities + columns tables, null descriptions, no-columns row
// ---------------------------------------------------------------------------

test('d9f85b3c t5 — the entities table lists each entity with its description, key and relationships', () => {
	const entities = block('Entities');
	assert.deepEqual(entities.columns, ['Entity', 'Description', 'Key', 'Relationships']);
	assert.equal(entities.lead, '4 entities, 10 columns. Relationships are listed against the owning entity.');
	assert.deepEqual(entities.rows, [
		['DeliverySnapshot', "One point-in-time read of a repo's delivery state.", null, 'items → DeliveryItem'],
		['DeliveryItem', 'One Epic, Story or task and the stage it has reached.', 'id', 'parentId → DeliveryItem, evidence → DeliveryEvidenceEntry, owner → DeliveryEvidenceEntry'],
		['DeliveryEvidenceEntry', null, 'artifactId', null],
		['DeliveryNotice', null, null, null],
	]);
});

test('d9f85b3c t5 — one columns table per entity, with keys tagged and missing descriptions as null cells', () => {
	const item = block('DeliveryItem');
	assert.deepEqual(item.columns, ['Column', 'Type', 'Required', 'Multi-valued', 'Key', 'Description']);
	assert.deepEqual(item.rows, [
		['id', 'string', 'yes', 'no', { tag: 'pk', text: 'PK' }, 'Canonical work-item id.'],
		['kind', 'string', 'yes', 'no', null, null],
		['parentId', 'DeliveryItem', 'no', 'no', { tag: 'fk', text: 'FK' }, 'The containing Epic or Story; absent at the top.'],
		['evidence', 'DeliveryEvidenceEntry', 'no', 'yes', { tag: 'fk', text: 'FK' }, null],
		['owner', 'DeliveryEvidenceEntry', 'yes', 'no', { tag: 'fk', text: 'FK' }, null],
	]);
	assert.equal(page.description.length, 5, 'Entities plus one table per entity');
});

test("d9f85b3c t5 — an attribute-less entity's columns table has a single 'No columns' row", () => {
	assert.deepEqual(block('DeliveryNotice').rows, [['No columns', null, null, null, null, null]]);
});

// ---------------------------------------------------------------------------
// unit: er page builder: hostile characters sanitised
// ---------------------------------------------------------------------------

test('d9f85b3c t5 — names with quotes, angle brackets, colons or non-ASCII give safe erDiagram source and escaped tables', () => {
	const hostile: ErDefinition = {
		classes: {
			'Kunde "VIP"': { attributes: { 'naïve:id': { range: 'string', identifier: true }, '<b>': { range: 'Bestellung<x>', multivalued: true } } },
			'Bestellung<x>': { attributes: { 'größe': { range: 'integer' } } },
		},
	};
	const p = erDefinitionToPage(hostile, 'Hostile');
	const src = p.visual.kind === 'mermaid' ? p.visual.source : '';
	for (const line of src.split('\n')) {
		// Outside a quoted label, only Mermaid syntax and word characters remain.
		const bare = line.replace(/"[^"]*"/g, '""');
		assert.match(bare, /^[\sA-Za-z0-9_{}|o:\-[\]"]*$/, `unsafe Mermaid line: ${line}`);
	}
	assert.ok(src.includes('  Kunde_VIP["Kunde \'VIP\'"] {'), src);
	assert.ok(src.includes('    string naive_id PK "naïve:id"') || src.includes('    string na_ve_id PK "naïve:id"'), src);
	assert.ok(src.includes('  Kunde_VIP ||--o{ Bestellung_x : "<b>"'), src);

	const html = renderCompanionPage(
		{ projectName: 'p', workItemId: 'w', sourceDoc: { id: 'd', href: './d.md' }, date: 'd', user: 'u', contextLine: 'c' },
		p, { panzoom: '', mermaid: '' },
	);
	const tables = html.slice(html.indexOf('<h2>Description</h2>'));
	assert.ok(tables.includes('<td>Kunde &quot;VIP&quot;</td>'));
	assert.ok(tables.includes('<td>&lt;b&gt;</td>'));
	assert.ok(!tables.includes('<b>'), 'no markup injected');
});
