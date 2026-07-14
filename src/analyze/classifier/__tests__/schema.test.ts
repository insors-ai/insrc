/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Ajv schema tests for ClassifiedIntent.
 *
 * Pinning every constraint the classifier driver depends on:
 *   - required field set
 *   - enums on target / scope / scopeRef.kind
 *   - additionalProperties:false (no model-invented fields)
 *   - per-field type discipline
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/classifier/__tests__/schema.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	CLASSIFIED_INTENT_SCHEMA,
	CLASSIFIER_SCHEMA_VERSION,
	SCOPE_BUCKET_ENUM,
	SCOPE_REF_KIND_ENUM,
	TARGET_ENUM,
	validateIntentShape,
	validateIntentShapeWithErrors,
} from '../schema.js';
import type { ClassifiedIntent } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_VALID: ClassifiedIntent = {
	target:    'code',
	scope:     'M',
	focused:   false,
	scopeRef:  { kind: 'repo', value: '/abs/path' },
	reasoning: 'minimal-valid fixture',
};

const FOCUSED_VALID: ClassifiedIntent = {
	target:    'data',
	scope:     'S',
	focused:   true,
	focus:     'where is PII',
	scopeRef:  { kind: 'connection', value: 'prod-db' },
	reasoning: 'focused-valid fixture',
};

// ---------------------------------------------------------------------------
// Enum + version sanity
// ---------------------------------------------------------------------------

test('CLASSIFIER_SCHEMA_VERSION is a positive integer', () => {
	assert.ok(Number.isInteger(CLASSIFIER_SCHEMA_VERSION));
	assert.ok(CLASSIFIER_SCHEMA_VERSION >= 1);
});

test('TARGET_ENUM enumerates the documented five targets', () => {
	assert.deepEqual([...TARGET_ENUM].sort(), ['code', 'data', 'docs', 'generic', 'infra']);
});

test('SCOPE_BUCKET_ENUM enumerates the five buckets in size order', () => {
	assert.deepEqual([...SCOPE_BUCKET_ENUM], ['XS', 'S', 'M', 'L', 'XL']);
});

test('SCOPE_REF_KIND_ENUM enumerates the seven kinds', () => {
	assert.deepEqual([...SCOPE_REF_KIND_ENUM].sort(), [
		'connection',
		'file',
		'manifest-dir',
		'module',
		'repo',
		'symbol',
		'workspace',
	]);
});

test('CLASSIFIED_INTENT_SCHEMA declares every required field', () => {
	const required = CLASSIFIED_INTENT_SCHEMA.required;
	assert.deepEqual([...(required as readonly string[])].sort(), [
		'focused', 'reasoning', 'scope', 'scopeRef', 'target',
	]);
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('validateIntentShape accepts a minimal valid intent', () => {
	assert.ok(validateIntentShape(MINIMAL_VALID));
});

test('validateIntentShape accepts a focused intent with focus field', () => {
	assert.ok(validateIntentShape(FOCUSED_VALID));
});

// ---------------------------------------------------------------------------
// Required-field rejection
// ---------------------------------------------------------------------------

for (const field of ['target', 'scope', 'focused', 'scopeRef', 'reasoning'] as const) {
	test(`validateIntentShape rejects an intent missing '${field}'`, () => {
		const partial = { ...MINIMAL_VALID } as Partial<ClassifiedIntent>;
		delete partial[field];
		const r = validateIntentShapeWithErrors(partial);
		assert.equal(r.ok, false);
		assert.ok(r.errors.some(e => e.includes(field)), `expected error mentioning '${field}', got: ${r.errors.join('; ')}`);
	});
}

// ---------------------------------------------------------------------------
// Enum rejection
// ---------------------------------------------------------------------------

test('validateIntentShape rejects target outside the enum', () => {
	assert.equal(validateIntentShape({ ...MINIMAL_VALID, target: 'invented' }), false);
});

test('validateIntentShape rejects scope outside the enum', () => {
	assert.equal(validateIntentShape({ ...MINIMAL_VALID, scope: 'XXL' }), false);
});

test('validateIntentShape rejects scopeRef.kind outside the enum', () => {
	assert.equal(validateIntentShape({
		...MINIMAL_VALID,
		scopeRef: { kind: 'invented', value: '/x' },
	}), false);
});

// ---------------------------------------------------------------------------
// additionalProperties:false at every level
// ---------------------------------------------------------------------------

test('validateIntentShape rejects unknown top-level properties', () => {
	const bad = { ...MINIMAL_VALID, surprise: 1 };
	assert.equal(validateIntentShape(bad), false);
});

test('validateIntentShape rejects unknown scopeRef properties', () => {
	const bad = {
		...MINIMAL_VALID,
		scopeRef: { kind: 'repo', value: '/x', extra: true },
	};
	assert.equal(validateIntentShape(bad), false);
});

// ---------------------------------------------------------------------------
// Type discipline
// ---------------------------------------------------------------------------

test('validateIntentShape rejects boolean target', () => {
	assert.equal(validateIntentShape({ ...MINIMAL_VALID, target: true }), false);
});

test('validateIntentShape rejects string focused', () => {
	assert.equal(validateIntentShape({ ...MINIMAL_VALID, focused: 'no' }), false);
});

test('validateIntentShape rejects empty-string scopeRef.value', () => {
	assert.equal(validateIntentShape({
		...MINIMAL_VALID,
		scopeRef: { kind: 'repo', value: '' },
	}), false);
});

test('validateIntentShape rejects empty-string reasoning', () => {
	assert.equal(validateIntentShape({ ...MINIMAL_VALID, reasoning: '' }), false);
});

test('validateIntentShape accepts focus only when minLength >= 1', () => {
	assert.equal(validateIntentShape({
		...FOCUSED_VALID,
		focus: '',
	}), false);
});
