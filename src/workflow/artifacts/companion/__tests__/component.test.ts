/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E20260929e2c6705f:S003 t2 — the COMPONENT-DEPENDENCY companion definition.
 * componentDependencyDefinitionToIr maps components → nodes + dependencies → edges;
 * docType is 'component-dependency' and the IR is byte-identical for a byte-identical
 * def. A dangling dependency endpoint throws ComponentDefinitionError;
 * validateComponentDependencyDefinition surfaces the same as a HIGH breach.
 *
 * Run: npx tsx --test src/workflow/artifacts/companion/__tests__/component.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	componentDependencyDefinitionToIr,
	validateComponentDependencyDefinition,
	ComponentDefinitionError,
	COMPONENT_DOC_TYPE,
	type ComponentDependencyDefinition,
} from '../component.js';

const comp: ComponentDependencyDefinition = {
	components: [{ id: 'api', label: 'API' }, { id: 'db' }, { id: 'cache' }],
	dependencies: [
		{ from: 'api', to: 'db' },
		{ from: 'api', to: 'cache', label: 'reads' },
	],
};

test('componentDependencyDefinitionToIr: components→nodes, dependencies→edges, docType component-dependency', () => {
	const ir = componentDependencyDefinitionToIr(comp);
	assert.equal(ir.docType, COMPONENT_DOC_TYPE);
	assert.equal(ir.docType, 'component-dependency');
	assert.equal(ir.derived.nodes.length, 3);
	assert.deepEqual(ir.derived.nodes.map(n => n.id), ['api', 'db', 'cache']);
	assert.equal(ir.derived.nodes[0]!.label, 'API');
	assert.equal(ir.derived.nodes[1]!.label, 'db');   // label falls back to id
	assert.equal(ir.derived.edges.length, 2);
	assert.deepEqual(ir.derived.edges.map(e => [e.from, e.to]), [['api', 'db'], ['api', 'cache']]);
});

test('componentDependencyDefinitionToIr: an isolated component renders as an edge-less node', () => {
	const ir = componentDependencyDefinitionToIr(comp);
	const referenced = new Set(ir.derived.edges.flatMap(e => [e.from, e.to]));
	assert.ok(!referenced.has('cache') === false); // cache IS referenced here; sanity
	const isolated = componentDependencyDefinitionToIr({ components: [{ id: 'lonely' }], dependencies: [] });
	assert.equal(isolated.derived.nodes.length, 1);
	assert.equal(isolated.derived.edges.length, 0);
});

test('componentDependencyDefinitionToIr: byte-identical IR for a byte-identical def (deterministic)', () => {
	assert.equal(JSON.stringify(componentDependencyDefinitionToIr(comp)), JSON.stringify(componentDependencyDefinitionToIr(comp)));
});

test('componentDependencyDefinitionToIr: a dangling dependency endpoint throws ComponentDefinitionError', () => {
	const bad: ComponentDependencyDefinition = { components: [{ id: 'api' }], dependencies: [{ from: 'api', to: 'ghost' }] };
	assert.throws(() => componentDependencyDefinitionToIr(bad), (e: unknown) => {
		assert.ok(e instanceof ComponentDefinitionError);
		return true;
	});
});

test('validateComponentDependencyDefinition: sound → no findings; dangling → HIGH breach', () => {
	assert.deepEqual(validateComponentDependencyDefinition(comp), []);
	const bad = { components: [{ id: 'api' }], dependencies: [{ from: 'api', to: 'ghost' }] };
	const findings = validateComponentDependencyDefinition(bad);
	assert.ok(findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach'), 'a dangling endpoint is a HIGH breach');
	assert.ok(findings.every(f => f.dimension === 'diagram'), 'findings are on the diagram dimension');
});

test('validateComponentDependencyDefinition: a duplicate component id → HIGH breach', () => {
	const dup = { components: [{ id: 'api' }, { id: 'api' }], dependencies: [] };
	assert.ok(validateComponentDependencyDefinition(dup).some(f => f.severity === 'HIGH'));
});
