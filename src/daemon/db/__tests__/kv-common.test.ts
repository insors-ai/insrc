/**
 * Tests for daemon/db/drivers/kv-common.ts -- namespace whitelist
 * enforcement + clamp helpers. Shape-inference tests live in
 * `shape-common.test.ts` (see phase 7 prep -- inferShape was lifted).
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import type { ConnectionConfig } from '../../../shared/db-driver.js';
import {
	assertNamespaceAllowed,
	clampSampleShapeLimit,
	clampScanLimit,
} from '../drivers/kv-common.js';

const BASE_CONFIG: ConnectionConfig = {
	id: 'test',
	kind: 'redis',
	family: 'kv',
	url: 'redis://localhost:6379',
};

function cfg(allow?: readonly string[]): ConnectionConfig {
	if (allow === undefined) { return BASE_CONFIG; }
	return { ...BASE_CONFIG, namespace: { allow } };
}

// ---------------------------------------------------------------------------
// assertNamespaceAllowed
// ---------------------------------------------------------------------------

describe('assertNamespaceAllowed', () => {
	it('is a no-op when no whitelist is configured', () => {
		assert.doesNotThrow(() => assertNamespaceAllowed(cfg(), { pattern: 'anything:*', limit: 10 }));
	});

	it('accepts a prefix inside the whitelist', () => {
		assert.doesNotThrow(() => assertNamespaceAllowed(
			cfg(['cache:*', 'session:*']),
			{ prefix: 'cache:user:42', limit: 10 },
		));
	});

	it('accepts a pattern whose literal stem starts with an allowed prefix', () => {
		assert.doesNotThrow(() => assertNamespaceAllowed(
			cfg(['cache:', 'session:']),
			{ pattern: 'cache:user:*', limit: 10 },
		));
	});

	it('rejects a pattern outside the whitelist', () => {
		assert.throws(
			() => assertNamespaceAllowed(
				cfg(['cache:*']),
				{ pattern: 'auth:tokens:*', limit: 10 },
			),
			/outside the namespace whitelist/,
		);
	});

	it('rejects a prefix outside the whitelist', () => {
		assert.throws(
			() => assertNamespaceAllowed(
				cfg(['cache:']),
				{ prefix: 'session:', limit: 10 },
			),
			/outside the namespace whitelist/,
		);
	});

	it('requires a pattern or prefix when a whitelist is configured', () => {
		assert.throws(
			() => assertNamespaceAllowed(cfg(['cache:*']), { limit: 10 }),
			/pattern or prefix is required/,
		);
	});
});

// ---------------------------------------------------------------------------
// clamp helpers
// ---------------------------------------------------------------------------

describe('clamp helpers', () => {
	it('clamps scan limit to [1, 500]', () => {
		assert.equal(clampScanLimit(10_000), 500);
		assert.equal(clampScanLimit(-5), 1);
		assert.equal(clampScanLimit(0), 1);
		assert.equal(clampScanLimit(42), 42);
	});

	it('clamps sample-shape limit to [1, 50]', () => {
		assert.equal(clampSampleShapeLimit(10_000), 50);
		assert.equal(clampSampleShapeLimit(-5), 1);
	});
});

