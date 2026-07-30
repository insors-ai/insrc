/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Boundary tests (s1 · t7): the generation orchestration + tool outcome
 * description, exercised on paths that never touch the graph store (unknown
 * docType → not-found short-circuits before any read).
 *
 * Run: npx tsx --test src/docgen/__tests__/generate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateDocument, listDocTypes } from '../index.js';
import { describeOutcome } from '../tool.js';
import { TYPE_STRUCTURE_DOCTYPE } from '../extract/type-structure.js';

test('listDocTypes exposes the Phase A type-structure capability (serializable, no extract fn)', () => {
	const types = listDocTypes();
	const ts = types.find(t => t.docType === TYPE_STRUCTURE_DOCTYPE);
	assert.ok(ts, 'type-structure must be registered');
	assert.equal(ts!.capability.id, TYPE_STRUCTURE_DOCTYPE);
	assert.ok(ts!.capability.summary.length > 0);
	assert.equal('extract' in ts!, false);                 // bound fn does not cross the boundary
});

test('generateDocument with an unknown docType → not-found, without touching the graph', async () => {
	const out = await generateDocument('no-such-doc-type', { repo: '/does/not/matter' });
	assert.equal(out.status, 'not-found');
	if (out.status === 'not-found') assert.equal(out.symbol, 'no-such-doc-type');
});

test('describeOutcome renders each variant to a human line', () => {
	assert.match(describeOutcome({ status: 'not-found', symbol: 'x' }), /unknown document type: x/);
	assert.match(describeOutcome({ status: 'empty-scope', reason: 'no types' }), /empty scope: no types/);
	assert.match(describeOutcome({ status: 'source-not-ready', reason: 'indexing' }), /source not ready: indexing/);
	assert.match(describeOutcome({ status: 'fallback-unavailable', reason: 'gone', remedy: 'ship' }), /gone.*remedy: ship/);
	assert.match(
		describeOutcome({ status: 'ok', value: { docType: 'type-structure', backend: 'primary-inline', html: '', inlinedRuntimeVersion: '10.9.1', diagramFormat: 'svg', supportsZoomPan: true } }),
		/document generated \(type-structure, primary-inline\)/,
	);
});
