/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t10 — the companion render paths the shell replaced are
 * gone, and the ones the VS Code plugin's parity tests still import remain.
 *
 * Run:
 *   npx tsx --test src/workflow/artifacts/companion/__tests__/removed-paths.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import * as component from '../component.js';
import * as ux from '../ux.js';
import * as er from '../er.js';
import * as sequence from '../sequence.js';
import * as render from '../render.js';

test('d9f85b3c t10 — the dead render paths are removed', () => {
	assert.ok(!('componentDependencyDefinitionToIr' in component));
	assert.ok(!('ComponentDefinitionError' in component));
	assert.ok(!('uxDefinitionToIr' in ux));
	assert.ok(!existsSync(join(import.meta.dirname, '..', 'generate.ts')), 'the generateErCompanions seam is deleted');
	assert.ok(!('CompanionSourceLink' in render) && !('withSourceLink' in render));
});

test('d9f85b3c t10 — the references the plugin parity tests import are kept', () => {
	assert.equal(typeof er.erDefinitionToIr, 'function');
	assert.equal(typeof er.crowsFootToken, 'function');
	assert.equal(typeof er.ErDefinitionError, 'function');
	assert.equal(typeof sequence.sequenceDefinitionToIr, 'function');
	assert.equal(typeof sequence.SequenceDefinitionError, 'function');
	assert.equal(typeof ux.renderUxMockDocument, 'function');
});
