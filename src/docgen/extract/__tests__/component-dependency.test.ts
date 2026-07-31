/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the docgen component/dependency extractor (Story s2).
 *
 * Run: npx tsx --test src/docgen/extract/__tests__/component-dependency.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildComponentDependencyIR,
	componentKey,
	makeExtract,
	COMPONENT_DEPENDENCY_DOCTYPE,
	type FileEntityLite,
	type FileImportEdge,
	type ComponentGraphReader,
} from '../component-dependency.js';
import { documentIRToMermaid } from '../../render/shell.js';
import { isOk } from '../../outcome.js';

const ROOT = '/repo';
const f = (id: string, rel: string): FileEntityLite => ({ id, file: `${ROOT}/${rel}` });

function reader(o: { revision?: string; files?: readonly FileEntityLite[]; imports?: readonly FileImportEdge[] }): ComponentGraphReader {
	return {
		revision: async () => o.revision,
		filesInScope: async () => o.files ?? [],
		importEdges: async () => o.imports ?? [],
	};
}

test('componentKey: first segment under the scope base (subdir or bare file)', () => {
	assert.equal(componentKey('/repo/src/db/graph/store.ts', ROOT, 'src'), 'db');
	assert.equal(componentKey('/repo/src/config.ts', ROOT, 'src'), 'config.ts');
	assert.equal(componentKey('/repo/src/db/graph/store.ts', ROOT, 'src/db'), 'graph');
	assert.equal(componentKey('/repo/a/b.ts', ROOT, undefined), 'a');
});

test('buildComponentDependencyIR: files → component nodes; cross-module import → depends-on edge', () => {
	const files = [f('f1', 'src/db/store.ts'), f('f2', 'src/config/cfg.ts')];
	const imports: FileImportEdge[] = [{ fromFileId: 'f1', toFileId: 'f2' }];  // db imports config
	const ir = buildComponentDependencyIR(files, imports, ROOT, 'src', 'r', 'scope');
	assert.equal(ir.docType, COMPONENT_DEPENDENCY_DOCTYPE);
	assert.deepEqual(ir.derived.nodes.map(n => n.id).sort(), ['config', 'db']);
	assert.equal(ir.derived.edges.length, 1);
	assert.deepEqual({ from: ir.derived.edges[0]!.from, to: ir.derived.edges[0]!.to, kind: ir.derived.edges[0]!.kind },
		{ from: 'db', to: 'config', kind: 'depends-on' });
	assert.deepEqual(ir.narrated.sections, []);
});

test('intra-component imports are dropped (not a cross-module dependency)', () => {
	const files = [f('a', 'src/db/a.ts'), f('b', 'src/db/b.ts')];
	const ir = buildComponentDependencyIR(files, [{ fromFileId: 'a', toFileId: 'b' }], ROOT, 'src', 'r', 's');
	assert.deepEqual(ir.derived.nodes.map(n => n.id), ['db']);
	assert.deepEqual(ir.derived.edges, []);
});

test('out-of-scope import target is dropped; source component still shown', () => {
	const files = [f('a', 'src/db/a.ts')];
	const ir = buildComponentDependencyIR(files, [{ fromFileId: 'a', toFileId: 'external' }], ROOT, 'src', 'r', 's');
	assert.deepEqual(ir.derived.nodes.map(n => n.id), ['db']);
	assert.deepEqual(ir.derived.edges, []);
});

test('an isolated component (no imports in/out) is still a node (ac3)', () => {
	const files = [f('a', 'src/lonely/a.ts'), f('b', 'src/db/b.ts')];
	const ir = buildComponentDependencyIR(files, [], ROOT, 'src', 'r', 's');
	assert.deepEqual(ir.derived.nodes.map(n => n.id).sort(), ['db', 'lonely']);
	assert.deepEqual(ir.derived.edges, []);
});

test('duplicate cross-module imports collapse to one edge (dedupe)', () => {
	const files = [f('a1', 'src/db/a1.ts'), f('a2', 'src/db/a2.ts'), f('c', 'src/config/c.ts')];
	const imports: FileImportEdge[] = [{ fromFileId: 'a1', toFileId: 'c' }, { fromFileId: 'a2', toFileId: 'c' }];
	const ir = buildComponentDependencyIR(files, imports, ROOT, 'src', 'r', 's');
	assert.equal(ir.derived.edges.length, 1);   // db -> config.c collapses
});

test('same input → deep-equal IR (determinism, ac2)', () => {
	const files = [f('a', 'src/db/a.ts'), f('c', 'src/config/c.ts')];
	const imp: FileImportEdge[] = [{ fromFileId: 'a', toFileId: 'c' }];
	assert.deepEqual(
		buildComponentDependencyIR(files, imp, ROOT, 'src', 'r', 's'),
		buildComponentDependencyIR(files, imp, ROOT, 'src', 'r', 's'),
	);
});

test('documentIRToMermaid renders a component IR as a FLOWCHART with --> arrows', () => {
	const ir = buildComponentDependencyIR(
		[f('a', 'src/db/a.ts'), f('c', 'src/config/c.ts')],
		[{ fromFileId: 'a', toFileId: 'c' }], ROOT, 'src', 'r', 's',
	);
	const src = documentIRToMermaid(ir);
	assert.match(src, /^flowchart LR/);
	assert.match(src, /n\d+\["db"\]/);
	assert.match(src, /n\d+ --> n\d+/);
	assert.doesNotMatch(src, /classDiagram/);
});

test('extract: source-not-ready / empty-scope / ok', async () => {
	assert.equal((await makeExtract(reader({ revision: undefined }))({ repo: '/r' })).status, 'source-not-ready');
	assert.equal((await makeExtract(reader({ revision: 'r', files: [] }))({ repo: '/r' })).status, 'empty-scope');
	const out = await makeExtract(reader({
		revision: 'r',
		files: [f('a', 'src/db/a.ts'), f('c', 'src/config/c.ts')],
		imports: [{ fromFileId: 'a', toFileId: 'c' }],
	}))({ repo: ROOT, path: 'src' });
	assert.ok(isOk(out));
	if (isOk(out)) assert.equal(out.value.derived.edges.length, 1);
});
