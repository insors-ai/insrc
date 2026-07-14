/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Indexer-timestamp invalidation tests for the bundle cache.
 *
 * Pure file-I/O tests against the in-process cache layer. The
 * registry-driven lookup (resolveRepoLastIndexedAt) lives in driver.ts
 * and is exercised end-to-end in driver.live.test.ts; this file pins
 * the invalidation primitive (isStaleByIndexer) and the readBundle
 * branch that honors currentLastIndexedAt.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/cache-invalidation.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	cacheFilePathFor,
	invalidateBundle,
	isStaleByIndexer,
	readBundle,
	writeBundle,
	type CacheKey,
} from '../cache.js';
import type { AnalyzeContextBundle, ShapeOpts } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `cache-invalid-${label}-${suffix}`;
}

function mkBundle(repoLastIndexedAt?: number): AnalyzeContextBundle {
	return {
		system:    'sys',
		focus:     'foc',
		summary:   'sum',
		structure: 'str',
		surface:   'sur',
		artefacts: 'art',
		upstream:  '',
		meta: {
			mode:          'run',
			shaper:        'code',
			toolCalls:     2,
			modelId:       'qwen3.6:35b-a3b',
			emptyLayers:   ['upstream'],
			schemaVersion: 1,
			...(repoLastIndexedAt !== undefined ? { repoLastIndexedAt } : {}),
		},
	};
}

const OPTS: ShapeOpts = { runId: '<set-per-test>' };

// ---------------------------------------------------------------------------
// isStaleByIndexer pure function
// ---------------------------------------------------------------------------

test('isStaleByIndexer returns true when registry watermark is newer than the bundle', () => {
	const bundle = mkBundle(1_000);
	assert.equal(isStaleByIndexer(bundle, 2_000), true);
});

test('isStaleByIndexer returns false when registry watermark equals the bundle', () => {
	const bundle = mkBundle(1_000);
	assert.equal(isStaleByIndexer(bundle, 1_000), false);
});

test('isStaleByIndexer returns false when registry watermark is older than the bundle', () => {
	// Should not happen in practice (registry only moves forward), but
	// be tolerant -- the bundle is still fresh.
	const bundle = mkBundle(2_000);
	assert.equal(isStaleByIndexer(bundle, 1_000), false);
});

test('isStaleByIndexer treats bundles with no repoLastIndexedAt stamp as stale (conservative)', () => {
	const bundle = mkBundle(undefined);
	assert.equal(isStaleByIndexer(bundle, 1_000), true);
});

test('isStaleByIndexer treats bundles with no meta at all as stale', () => {
	const noMeta: AnalyzeContextBundle = {
		system:    '',
		focus:     '',
		summary:   '',
		structure: '',
		surface:   '',
		artefacts: '',
		upstream:  '',
	};
	assert.equal(isStaleByIndexer(noMeta, 1_000), true);
});

// ---------------------------------------------------------------------------
// readBundle wiring -- currentLastIndexedAt invalidation
// ---------------------------------------------------------------------------

test('readBundle returns the bundle when stamp is fresh against the registry watermark', () => {
	const runId = uniqueRunId('fresh');
	const key:   CacheKey = { mode: 'run', hash: 'fresh-key' };
	try {
		const bundle = mkBundle(2_000);
		writeBundle(runId, key, bundle);
		const read = readBundle(runId, key, { ...OPTS, runId }, 2_000);
		assert.deepEqual(read, bundle);
	} finally {
		invalidateBundle(runId, key);
	}
});

test('readBundle invalidates + returns null when registry watermark advanced', () => {
	const runId = uniqueRunId('stale');
	const key:   CacheKey = { mode: 'run', hash: 'stale-key' };
	try {
		writeBundle(runId, key, mkBundle(1_000));
		const read = readBundle(runId, key, { ...OPTS, runId }, 5_000);
		assert.equal(read, null);
		// File should be gone -- subsequent reads at the original watermark
		// also miss (the slot has been discarded).
		const reRead = readBundle(runId, key, { ...OPTS, runId }, 1_000);
		assert.equal(reRead, null);
	} finally {
		invalidateBundle(runId, key);
	}
});

test('readBundle skips the freshness check when currentLastIndexedAt is undefined', () => {
	// E.g. a 'connection' scope ref -- no filesystem path to look up;
	// the driver passes undefined and the cache should treat the slot
	// as valid based on the key check alone.
	const runId = uniqueRunId('no-fresh');
	const key:   CacheKey = { mode: 'run', hash: 'no-fresh-key' };
	try {
		// Bundle without repoLastIndexedAt at all -- isStaleByIndexer would
		// return true if invoked, but readBundle should NOT invoke it when
		// currentLastIndexedAt is undefined.
		const bundle = mkBundle(undefined);
		writeBundle(runId, key, bundle);
		const read = readBundle(runId, key, { ...OPTS, runId }, undefined);
		assert.deepEqual(read, bundle, 'no-currentLastIndexedAt path must skip freshness check');
	} finally {
		invalidateBundle(runId, key);
	}
});

test('readBundle invalidates a bundle missing repoLastIndexedAt when a watermark is supplied', () => {
	const runId = uniqueRunId('missing-stamp');
	const key:   CacheKey = { mode: 'run', hash: 'missing-stamp-key' };
	try {
		writeBundle(runId, key, mkBundle(undefined));
		const read = readBundle(runId, key, { ...OPTS, runId }, 1_000);
		// Bundle has no stamp; registry has a value -- conservative path:
		// discard.
		assert.equal(read, null);
	} finally {
		invalidateBundle(runId, key);
	}
});

test('readBundle: bypassCache=true short-circuits BEFORE the freshness check', () => {
	const runId = uniqueRunId('bypass-fresh');
	const key:   CacheKey = { mode: 'run', hash: 'bypass-fresh-key' };
	try {
		writeBundle(runId, key, mkBundle(2_000));
		// Even with a current watermark that would pass the check, bypass
		// should still return null -- it's an unconditional miss.
		const read = readBundle(runId, key, { ...OPTS, runId, bypassCache: true }, 2_000);
		assert.equal(read, null);
		// And the file must still be on disk (bypass != discard).
		const path = cacheFilePathFor(runId, key);
		// readBundle does not delete during bypass; a follow-up read with
		// bypassCache=false should hit again.
		const reRead = readBundle(runId, key, { ...OPTS, runId }, 2_000);
		assert.notEqual(reRead, null, `file should still exist at ${path}`);
	} finally {
		invalidateBundle(runId, key);
	}
});

// ---------------------------------------------------------------------------
// End-to-end: write watermark T, advance registry to T+1, re-read fails
// ---------------------------------------------------------------------------

test('write-then-advance-then-read pattern: bundle is invalidated by the advanced watermark', () => {
	const runId = uniqueRunId('e2e');
	const key:   CacheKey = { mode: 'run', hash: 'e2e-key' };
	try {
		// Initial cycle: registry at T0; bundle stamped with T0; read hits.
		const T0 = 1_700_000_000_000;
		writeBundle(runId, key, mkBundle(T0));
		assert.notEqual(
			readBundle(runId, key, { ...OPTS, runId }, T0),
			null,
			'fresh bundle should hit',
		);

		// Registry advances to T1. Same bundle, new check -> miss.
		const T1 = T0 + 60_000;
		const read = readBundle(runId, key, { ...OPTS, runId }, T1);
		assert.equal(read, null, 'advanced watermark must invalidate');
	} finally {
		invalidateBundle(runId, key);
	}
});
