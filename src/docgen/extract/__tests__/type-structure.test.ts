/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the docgen type-structure extractor core (s1 · t5).
 *
 * Exercises the IR-shaping + outcome logic against a FAKE TypeGraphReader — the
 * live-LMDB integration test is wired with the daemon graph reader (t7).
 *
 * Run: npx tsx --test src/docgen/extract/__tests__/type-structure.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildTypeStructureIR,
	makeExtract,
	TYPE_STRUCTURE_DOCTYPE,
	type TypeEntity,
	type InheritanceRel,
	type TypeGraphReader,
} from '../type-structure.js';
import { isOk } from '../../outcome.js';

const ent = (id: string, name: string, file: string, kind: TypeEntity['kind'] = 'class'): TypeEntity =>
	({ id, name, kind, file, startLine: 1 });

/** A fake reader with fixed revision/types/edges. */
function fakeReader(opts: {
	revision?: string | undefined;
	types?: readonly TypeEntity[];
	edges?: readonly InheritanceRel[];
}): TypeGraphReader {
	return {
		revision: async () => (opts.revision === undefined ? undefined : opts.revision),
		typesInScope: async () => opts.types ?? [],
		inheritanceEdges: async () => opts.edges ?? [],
	};
}

// ── pure core ──────────────────────────────────────────────────────────────

test('buildTypeStructureIR: types → derived nodes, narrated stays empty (k8)', () => {
	const ir = buildTypeStructureIR([ent('a', 'Base', 'a.ts'), ent('b', 'Derived', 'b.ts')], [], 'rev1', 'scope');
	assert.equal(ir.derived.nodes.length, 2);
	assert.deepEqual(ir.derived.nodes.map(n => n.label).sort(), ['Base', 'Derived']);
	assert.deepEqual(ir.narrated.sections, []);
	assert.equal(ir.generatedAtRevision, 'rev1');
	assert.equal(ir.docType, TYPE_STRUCTURE_DOCTYPE);
	// every node is cited by its entity id
	assert.ok(ir.derived.nodes.every(n => n.citation?.entityId === n.id));
});

test('buildTypeStructureIR: INHERITS/IMPLEMENTS map to edges with the right kind', () => {
	const ir = buildTypeStructureIR(
		[ent('a', 'Base', 'a.ts'), ent('b', 'Derived', 'b.ts'), ent('i', 'IFace', 'i.ts', 'interface')],
		[{ fromId: 'b', toId: 'a', kind: 'inherits' }, { fromId: 'b', toId: 'i', kind: 'implements' }],
		'rev1', 'scope',
	);
	assert.deepEqual(ir.derived.edges.map(e => e.kind).sort(), ['implements', 'inherits']);
	const inh = ir.derived.edges.find(e => e.kind === 'inherits')!;
	assert.equal(inh.from, 'b'); assert.equal(inh.to, 'a');
});

test('buildTypeStructureIR: an edge to an OUT-OF-SCOPE type is dropped (self-contained doc)', () => {
	const ir = buildTypeStructureIR(
		[ent('b', 'Derived', 'b.ts')],
		[{ fromId: 'b', toId: 'external', kind: 'inherits' }],   // 'external' not in the node set
		'rev1', 'scope',
	);
	assert.deepEqual(ir.derived.edges, []);
});

test('buildTypeStructureIR: a self-referential type keeps its self-edge (not deduped)', () => {
	const ir = buildTypeStructureIR(
		[ent('n', 'TreeNode', 'n.ts')],
		[{ fromId: 'n', toId: 'n', kind: 'inherits' }],
		'rev1', 'scope',
	);
	assert.equal(ir.derived.edges.length, 1);
	assert.equal(ir.derived.edges[0]!.from, ir.derived.edges[0]!.to);
});

test('buildTypeStructureIR: two same-named types in different files stay distinct nodes', () => {
	const ir = buildTypeStructureIR(
		[ent('id1', 'Config', 'a/config.ts'), ent('id2', 'Config', 'b/config.ts')],
		[], 'rev1', 'scope',
	);
	assert.equal(ir.derived.nodes.length, 2);
	assert.deepEqual(ir.derived.nodes.map(n => n.id).sort(), ['id1', 'id2']);
});

test('buildTypeStructureIR is deterministic — same input → deep-equal IR', () => {
	const types = [ent('a', 'Base', 'a.ts'), ent('b', 'Derived', 'b.ts')];
	const edges: InheritanceRel[] = [{ fromId: 'b', toId: 'a', kind: 'inherits' }];
	assert.deepEqual(buildTypeStructureIR(types, edges, 'r', 's'), buildTypeStructureIR(types, edges, 'r', 's'));
});

// ── extract() outcomes ───────────────────────────────────────────────────────

test('extract: unfinished indexing (no revision) → source-not-ready', async () => {
	const out = await makeExtract(fakeReader({ revision: undefined }))({ repo: '/r' });
	assert.equal(out.status, 'source-not-ready');
});

test('extract: zero types in scope → empty-scope with a reason (ac6)', async () => {
	const out = await makeExtract(fakeReader({ revision: 'r', types: [] }))({ repo: '/r', path: 'src/empty' });
	assert.equal(out.status, 'empty-scope');
	if (out.status === 'empty-scope') assert.match(out.reason, /no types.*src\/empty/);
});

test('extract: happy path → ok with a derived-only IR at the pinned revision', async () => {
	const reader = fakeReader({
		revision: 'rev-42',
		types: [ent('a', 'Base', 'a.ts'), ent('b', 'Derived', 'b.ts')],
		edges: [{ fromId: 'b', toId: 'a', kind: 'inherits' }],
	});
	const out = await makeExtract(reader)({ repo: '/r' });
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.equal(out.value.generatedAtRevision, 'rev-42');
		assert.equal(out.value.derived.nodes.length, 2);
		assert.equal(out.value.derived.edges.length, 1);
		assert.deepEqual(out.value.narrated.sections, []);
	}
});

test('extract: missing repo in input → empty-scope guard (belt-and-braces)', async () => {
	const out = await makeExtract(fakeReader({ revision: 'r' }))({});
	assert.equal(out.status, 'empty-scope');
});
