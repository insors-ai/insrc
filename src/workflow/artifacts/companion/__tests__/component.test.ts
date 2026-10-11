/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E20260929e2c6705f:S003 t2 — the COMPONENT-DEPENDENCY companion definition:
 * validateComponentDependencyDefinition surfaces a dangling endpoint or a duplicate
 * component as a HIGH breach. The page it renders is covered by
 * sequence-component-page.test.ts (LLD-d9f85b3c S001/t6).
 *
 * Run: npx tsx --test src/workflow/artifacts/companion/__tests__/component.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	validateComponentDependencyDefinition,
	type ComponentDependencyDefinition,
} from '../component.js';

const comp: ComponentDependencyDefinition = {
	components: [{ id: 'api', label: 'API' }, { id: 'db' }, { id: 'cache' }],
	dependencies: [
		{ from: 'api', to: 'db' },
		{ from: 'api', to: 'cache', label: 'reads' },
	],
};

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
