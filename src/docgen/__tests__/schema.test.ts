/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contract test (s1 · t8): the hand-mirrored MCP JSON schema for
 * DocGenOutcome<RenderedDocumentShell> must accept one sample per TS variant
 * and reject malformed shapes — so the schema cannot drift from the union.
 *
 * Run: npx tsx --test src/docgen/__tests__/schema.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ajv } from 'ajv';

import { DOCGEN_OUTCOME_SCHEMA } from '../schema.js';
import type { DocGenOutcome, RenderedDocumentShell } from '../types.js';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(DOCGEN_OUTCOME_SCHEMA);

const shell: RenderedDocumentShell = {
	docType: 'type-structure',
	backend: 'primary-inline',
	html: '<!doctype html>…',
	inlinedRuntimeVersion: '10.9.1',
	diagramFormat: 'svg',
	supportsZoomPan: true,
};

// One sample per TS union variant — typed as DocGenOutcome so the test fails to
// compile if a variant's shape changes without the schema/test being updated.
const samples: readonly DocGenOutcome<RenderedDocumentShell>[] = [
	{ status: 'ok', value: shell },
	{ status: 'empty-scope', reason: 'no types' },
	{ status: 'not-found', symbol: 'nope' },
	{ status: 'truncated', depthUsed: 5 },
	{ status: 'fallback-unavailable', reason: 'missing', remedy: 'ship it' },
	{ status: 'source-not-ready', reason: 'indexing' },
];

test('every DocGenOutcome variant validates against the mirrored schema', () => {
	for (const s of samples) {
		assert.ok(validate(s), `variant '${s.status}' should validate; errors=${JSON.stringify(validate.errors)}`);
	}
});

test('malformed outcomes are rejected', () => {
	assert.equal(validate({ status: 'ok' }), false);                              // ok missing value
	assert.equal(validate({ status: 'nope', reason: 'x' }), false);              // unknown status
	assert.equal(validate({ status: 'not-found', reason: 'x' }), false);         // wrong field for variant
	assert.equal(validate({ status: 'ok', value: { ...shell, diagramFormat: 'png' } }), false); // svg pinned
	assert.equal(validate({ status: 'empty-scope', reason: 'x', extra: 1 }), false); // additionalProperties
});
