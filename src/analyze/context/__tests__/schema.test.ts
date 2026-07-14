/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * AnalyzeContextBundle JSON-schema validator tests.
 *
 * Pure functional tests against the Ajv-compiled schema. No LLM,
 * no I/O. Cover happy-path acceptance, rejection cases for every
 * structural invariant, and the schemaVersion pinning behavior the
 * cache layer relies on.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/schema.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ANALYZE_CONTEXT_BUNDLE_SCHEMA,
	BUNDLE_LAYER_NAMES,
	SCHEMA_VERSION,
	validateBundle,
	validateBundleWithErrors,
} from '../schema.js';
import type { AnalyzeContextBundle } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_MIN: AnalyzeContextBundle = {
	system:    '',
	focus:     '',
	summary:   '',
	structure: '',
	surface:   '',
	artefacts: '',
	upstream:  '',
};

const VALID_FULL: AnalyzeContextBundle = {
	system:    'You are a code analyst.',
	focus:     'Focus on entrypoints.',
	summary:   'Repo summary.',
	structure: 'Module tree.',
	surface:   'API surface.',
	artefacts: 'Source excerpt.',
	upstream:  '',
	meta: {
		mode:          'run',
		shaper:        'code',
		toolCalls:     7,
		modelId:       'qwen3-coder:14b',
		emptyLayers:   ['upstream'],
		schemaVersion: SCHEMA_VERSION,
	},
};

// ---------------------------------------------------------------------------
// Schema shape sanity
// ---------------------------------------------------------------------------

test('SCHEMA_VERSION is a positive integer', () => {
	assert.ok(Number.isInteger(SCHEMA_VERSION));
	assert.ok(SCHEMA_VERSION >= 1);
});

test('BUNDLE_LAYER_NAMES matches the seven documented layers', () => {
	assert.deepEqual([...BUNDLE_LAYER_NAMES].sort(), [
		'artefacts',
		'focus',
		'structure',
		'summary',
		'surface',
		'system',
		'upstream',
	]);
});

test('schema declares every layer as required', () => {
	const required = ANALYZE_CONTEXT_BUNDLE_SCHEMA.required;
	assert.ok(Array.isArray(required));
	for (const layer of BUNDLE_LAYER_NAMES) {
		assert.ok(
			(required as readonly string[]).includes(layer),
			`schema.required missing ${layer}`,
		);
	}
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('validateBundle accepts a minimum valid bundle (all empty strings, no meta)', () => {
	assert.ok(validateBundle(VALID_MIN));
});

test('validateBundle accepts a fully-populated bundle with meta', () => {
	assert.ok(validateBundle(VALID_FULL));
});

test('validateBundleWithErrors returns ok=true on a valid bundle', () => {
	const result = validateBundleWithErrors(VALID_FULL);
	assert.equal(result.ok, true);
	assert.equal(result.errors.length, 0);
});

// ---------------------------------------------------------------------------
// Missing-required-layer rejection
// ---------------------------------------------------------------------------

for (const layer of BUNDLE_LAYER_NAMES) {
	test(`validateBundle rejects a bundle missing the '${layer}' layer`, () => {
		const partial = { ...VALID_MIN } as Partial<AnalyzeContextBundle>;
		delete partial[layer];
		const result = validateBundleWithErrors(partial);
		assert.equal(result.ok, false);
		assert.ok(result.errors.some(e => e.includes(layer)),
			`expected error mentioning '${layer}', got: ${result.errors.join('; ')}`);
	});
}

// ---------------------------------------------------------------------------
// Layer type rejection
// ---------------------------------------------------------------------------

test('validateBundle rejects a non-string layer', () => {
	const bad = { ...VALID_MIN, summary: 42 };
	assert.equal(validateBundle(bad), false);
});

// ---------------------------------------------------------------------------
// Unknown-property rejection
// ---------------------------------------------------------------------------

test('validateBundle rejects unknown top-level properties', () => {
	const bad = { ...VALID_MIN, mystery: 'hello' };
	const result = validateBundleWithErrors(bad);
	assert.equal(result.ok, false);
});

test('validateBundle rejects unknown meta properties', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, mystery: 'hello' },
	};
	const result = validateBundleWithErrors(bad);
	assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// meta.mode + meta.shaper enum checks
// ---------------------------------------------------------------------------

test('meta.mode rejects values outside the enum', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, mode: 'classify' },
	};
	assert.equal(validateBundle(bad), false);
});

test('meta.shaper rejects values outside the enum', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, shaper: 'security' },
	};
	assert.equal(validateBundle(bad), false);
});

// ---------------------------------------------------------------------------
// meta.schemaVersion pinning
// ---------------------------------------------------------------------------

test('meta.schemaVersion must match SCHEMA_VERSION exactly', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, schemaVersion: SCHEMA_VERSION + 1 },
	};
	assert.equal(validateBundle(bad), false);
});

// ---------------------------------------------------------------------------
// meta.emptyLayers must reference known layers + be unique
// ---------------------------------------------------------------------------

test('meta.emptyLayers rejects an unknown layer name', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, emptyLayers: ['unknown'] },
	};
	assert.equal(validateBundle(bad), false);
});

test('meta.emptyLayers rejects duplicate entries', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, emptyLayers: ['upstream', 'upstream'] },
	};
	assert.equal(validateBundle(bad), false);
});

// ---------------------------------------------------------------------------
// meta.toolCalls + meta.repoLastIndexedAt non-negative integer
// ---------------------------------------------------------------------------

test('meta.toolCalls rejects a negative count', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, toolCalls: -1 },
	};
	assert.equal(validateBundle(bad), false);
});

test('meta.toolCalls rejects a non-integer', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, toolCalls: 3.5 },
	};
	assert.equal(validateBundle(bad), false);
});

test('meta.modelId rejects an empty string', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, modelId: '' },
	};
	assert.equal(validateBundle(bad), false);
});

test('meta.repoLastIndexedAt accepts a positive integer when present', () => {
	const good = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, repoLastIndexedAt: 1_700_000_000_000 },
	};
	assert.ok(validateBundle(good));
});

test('meta.repoLastIndexedAt rejects a negative value', () => {
	const bad = {
		...VALID_FULL,
		meta: { ...VALID_FULL.meta, repoLastIndexedAt: -1 },
	};
	assert.equal(validateBundle(bad), false);
});

// ---------------------------------------------------------------------------
// meta is optional
// ---------------------------------------------------------------------------

test('bundle without meta is valid (driver stamps meta before persisting)', () => {
	assert.ok(validateBundle(VALID_MIN));
});

test('bundle with partial meta (missing required key) is rejected', () => {
	const bad = {
		...VALID_MIN,
		meta: {
			mode:        'run',
			shaper:      'code',
			toolCalls:   3,
			modelId:     'qwen3-coder:14b',
			emptyLayers: [],
			// missing schemaVersion
		},
	};
	assert.equal(validateBundle(bad), false);
});
