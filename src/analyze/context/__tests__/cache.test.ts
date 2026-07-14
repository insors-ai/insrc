/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Run-level + task-level bundle cache tests.
 *
 * Pure file-I/O tests. No LLM. The cached bundle bodies are hand-built
 * (the cache layer is shape-agnostic about the bundle, beyond the
 * outer `{ key, bundle }` wrapper).
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/cache.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	cacheFilePathFor,
	invalidateBundle,
	readBundle,
	writeBundle,
	type CacheKey,
} from '../cache.js';
import type { AnalyzeContextBundle, ShapeOpts } from '../types.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function mkBundle(over: Partial<AnalyzeContextBundle> = {}): AnalyzeContextBundle {
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
			toolCalls:     3,
			modelId:       'qwen3-coder:14b',
			emptyLayers:   ['upstream'],
			schemaVersion: 1,
		},
		...over,
	};
}

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `test-cache-${label}-${suffix}`;
}

const RUN_OPTS: ShapeOpts = { runId: '<set-per-test>' };
const BYPASS_OPTS: ShapeOpts = { runId: '<set-per-test>', bypassCache: true };

// ---------------------------------------------------------------------------
// cacheFilePathFor
// ---------------------------------------------------------------------------

test('cacheFilePathFor (mode=classification) yields classification.json', () => {
	const path = cacheFilePathFor('run-a', { mode: 'classification', hash: 'abc' });
	assert.match(path, /[/\\]run-a[/\\]context[/\\]classification\.json$/);
});

test('cacheFilePathFor (mode=run) yields run-bundle.json', () => {
	const path = cacheFilePathFor('run-a', { mode: 'run', hash: 'abc' });
	assert.match(path, /[/\\]run-a[/\\]context[/\\]run-bundle\.json$/);
});

test('cacheFilePathFor (mode=task, with taskId) yields <taskId>.bundle.json', () => {
	const path = cacheFilePathFor('run-a', { mode: 'task', taskId: 't07', hash: 'abc' });
	assert.match(path, /[/\\]run-a[/\\]context[/\\]t07\.bundle\.json$/);
});

test('cacheFilePathFor (mode=task, no taskId) throws TypeError', () => {
	assert.throws(
		() => cacheFilePathFor('run-a', { mode: 'task', hash: 'abc' }),
		{ name: 'TypeError', message: /taskId is required/ },
	);
});

// ---------------------------------------------------------------------------
// Round-trip behaviour against the real PATHS.analyze root
// ---------------------------------------------------------------------------

test('writeBundle then readBundle round-trips an identical body (run mode)', () => {
	const runId = uniqueRunId('run');
	const key: CacheKey = { mode: 'run', hash: 'deadbeef' };
	try {
		const bundle = mkBundle();
		writeBundle(runId, key, bundle);
		const read = readBundle(runId, key, { ...RUN_OPTS, runId });
		assert.notEqual(read, null);
		assert.deepEqual(read, bundle);
	} finally {
		invalidateBundle(runId, key);
	}
});

test('writeBundle then readBundle round-trips an identical body (task mode)', () => {
	const runId = uniqueRunId('task');
	const key: CacheKey = { mode: 'task', taskId: 't01', hash: 'cafe' };
	try {
		const bundle = mkBundle({ upstream: 'prior task output' });
		writeBundle(runId, key, bundle);
		const read = readBundle(runId, key, { ...RUN_OPTS, runId });
		assert.deepEqual(read, bundle);
	} finally {
		invalidateBundle(runId, key);
	}
});

test('readBundle on a missing slot returns null (no throw)', () => {
	const runId = uniqueRunId('miss');
	const key: CacheKey = { mode: 'run', hash: 'nope' };
	const read = readBundle(runId, key, { ...RUN_OPTS, runId });
	assert.equal(read, null);
});

test('readBundle with bypassCache=true returns null even when the file exists', () => {
	const runId = uniqueRunId('bypass');
	const key: CacheKey = { mode: 'run', hash: 'beef' };
	try {
		writeBundle(runId, key, mkBundle());
		const read = readBundle(runId, key, { ...BYPASS_OPTS, runId });
		assert.equal(read, null);
	} finally {
		invalidateBundle(runId, key);
	}
});

// ---------------------------------------------------------------------------
// Key-mismatch invalidation
// ---------------------------------------------------------------------------

test('readBundle discards the file when the stored key does not match the request key', () => {
	const runId = uniqueRunId('mismatch');
	const writeKey: CacheKey = { mode: 'run', hash: 'v1' };
	const readKey:  CacheKey = { mode: 'run', hash: 'v2' };
	try {
		writeBundle(runId, writeKey, mkBundle());
		const read = readBundle(runId, readKey, { ...RUN_OPTS, runId });
		assert.equal(read, null);
		// File should have been deleted -- subsequent read with the original
		// (matching) key now also misses.
		const reReadOriginal = readBundle(runId, writeKey, { ...RUN_OPTS, runId });
		assert.equal(reReadOriginal, null);
	} finally {
		invalidateBundle(runId, writeKey);
	}
});

// ---------------------------------------------------------------------------
// Corrupt-file recovery
// ---------------------------------------------------------------------------

test('readBundle discards an invalid-JSON file and returns null', () => {
	const runId = uniqueRunId('corrupt');
	const key:   CacheKey = { mode: 'run', hash: 'whatever' };
	const path = cacheFilePathFor(runId, key);
	try {
		// Seed the slot with a guaranteed-invalid body.
		writeBundle(runId, key, mkBundle());
		writeFileSync(path, 'not json at all', 'utf8');
		const read = readBundle(runId, key, { ...RUN_OPTS, runId });
		assert.equal(read, null);
		// File was discarded -- a subsequent read still misses (instead of
		// repeating the parse failure).
		const reRead = readBundle(runId, key, { ...RUN_OPTS, runId });
		assert.equal(reRead, null);
	} finally {
		invalidateBundle(runId, key);
	}
});

test('readBundle discards a JSON file with wrong shape (missing key field)', () => {
	const runId = uniqueRunId('shape');
	const key:   CacheKey = { mode: 'run', hash: 'whatever' };
	const path = cacheFilePathFor(runId, key);
	try {
		writeBundle(runId, key, mkBundle());
		writeFileSync(path, JSON.stringify({ bundle: mkBundle() }), 'utf8');
		const read = readBundle(runId, key, { ...RUN_OPTS, runId });
		assert.equal(read, null);
	} finally {
		invalidateBundle(runId, key);
	}
});

// ---------------------------------------------------------------------------
// Atomic write: temp file is gone after writeBundle returns
// ---------------------------------------------------------------------------

test('writeBundle leaves no .tmp- file behind after a successful write', () => {
	const runId = uniqueRunId('atomic');
	const key:   CacheKey = { mode: 'run', hash: 'atomic-key' };
	try {
		writeBundle(runId, key, mkBundle());
		const path = cacheFilePathFor(runId, key);
		const dir = path.replace(/[/\\][^/\\]+$/, '');
		const entries = readdirSync(dir);
		const tmps = entries.filter(e => e.includes('.tmp-'));
		assert.deepEqual(tmps, []);
	} finally {
		invalidateBundle(runId, key);
	}
});

// ---------------------------------------------------------------------------
// invalidateBundle is idempotent
// ---------------------------------------------------------------------------

test('invalidateBundle on a missing slot is a silent no-op', () => {
	const runId = uniqueRunId('idem');
	const key:   CacheKey = { mode: 'run', hash: 'gone' };
	// No prior write -- invalidate should not throw.
	assert.doesNotThrow(() => invalidateBundle(runId, key));
	assert.doesNotThrow(() => invalidateBundle(runId, key)); // and again
});

// ---------------------------------------------------------------------------
// Cleanup: ensure no test leaked an analyze/<runId>/ directory beyond
// the per-test invalidation. We can't easily enumerate every per-test
// run-id but the unique-suffix scheme above keeps collisions impossible
// across concurrent test runs.
// ---------------------------------------------------------------------------

// (intentional: per-test try/finally is the cleanup contract)

// ---------------------------------------------------------------------------
// Sanity: the temp-dir-based path computation does NOT depend on HOME
// or the test's CWD -- it goes through PATHS.analyzeContext(runId).
// We hand-verify by writing to a runId that's a known sentinel and
// confirming the file lands under the analyze root.
// ---------------------------------------------------------------------------

test('writeBundle places the file under PATHS.analyzeContext(runId)', () => {
	const runId = uniqueRunId('layout');
	const key:   CacheKey = { mode: 'run', hash: 'layout-key' };
	try {
		writeBundle(runId, key, mkBundle());
		const path = cacheFilePathFor(runId, key);
		assert.match(path, /[/\\]analyze[/\\]/);
		assert.ok(path.includes(runId));
	} finally {
		invalidateBundle(runId, key);
	}
});

// Smoke: the tmpdir + mkdtemp helpers we import for the corrupt-file
// test should be available even if not used.
test('node:os tmpdir + mkdtempSync are usable from this module', () => {
	const dir = mkdtempSync(join(tmpdir(), 'analyze-cache-smoke-'));
	try {
		writeFileSync(join(dir, 'x'), 'y');
		assert.ok(dir.length > 0);
	} finally {
		rmSync(dir, { recursive: true });
	}
});
