/**
 * Regression test for the ajv "schema with key or id ... already
 * exists" bug that surfaced during Phase 5 live-testing (T7b).
 *
 * Symptom: the second `synthesize()` invocation in the same process
 * failed with an ajv.compile error because the stripped-schema
 * clone kept the original `$id` and the second compile tried to
 * re-register a validator for the same id.
 *
 * Fix: `stripMetaFromSchema` deletes `$id` from the cloned schema
 * and caches the result at module scope. This test pins BOTH: (1)
 * the cache returns the same object across calls, and (2) the
 * returned schema no longer carries a `$id`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANALYZE_CONTEXT_BUNDLE_SCHEMA } from '../schema.js';
import {
	_resetStrippedSchemaCacheForTest,
	_stripMetaFromSchemaForTest,
} from '../synthesizer.js';

test('stripMetaFromSchema drops $id so ajv can compile it repeatedly', () => {
	_resetStrippedSchemaCacheForTest();
	const stripped = _stripMetaFromSchemaForTest(
		ANALYZE_CONTEXT_BUNDLE_SCHEMA as unknown as Record<string, unknown>,
	);
	assert.equal(stripped['$id'], undefined, 'stripped schema must not carry a $id');
});

test('stripMetaFromSchema is cached: identical reference across calls', () => {
	_resetStrippedSchemaCacheForTest();
	const a = _stripMetaFromSchemaForTest(
		ANALYZE_CONTEXT_BUNDLE_SCHEMA as unknown as Record<string, unknown>,
	);
	const b = _stripMetaFromSchemaForTest(
		ANALYZE_CONTEXT_BUNDLE_SCHEMA as unknown as Record<string, unknown>,
	);
	assert.strictEqual(a, b, 'second strip call must return the cached instance');
});

test('stripMetaFromSchema still drops the `meta` property + required entry', () => {
	_resetStrippedSchemaCacheForTest();
	const stripped = _stripMetaFromSchemaForTest(
		ANALYZE_CONTEXT_BUNDLE_SCHEMA as unknown as Record<string, unknown>,
	);
	const props = stripped['properties'] as Record<string, unknown>;
	assert.equal(props['meta'], undefined, 'meta property must be dropped');
	const required = stripped['required'] as string[];
	assert.equal(required.includes('meta'), false, 'meta must not be in required');
});
