/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live end-to-end test for indexer-timestamp invalidation.
 *
 * Sets up a sandboxed LMDB graph store + a tmp repo path, runs the
 * driver against the real Ollama, then advances the registry's
 * `lastIndexed` watermark and verifies the cached bundle is
 * invalidated -- the next runShaper call rebuilds against the real
 * Ollama and stamps the new watermark.
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test \
 *     src/insrc/analyze/context/__tests__/cache-invalidation.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addRepo, updateRepoStatus } from '../../../db/repos.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';

import {
	cacheFilePathFor,
	type CacheKey,
} from '../cache.js';
import { runShaper } from '../driver.js';
import type {
	AnalyzeContextBundle,
	RunShapeInput,
	ShapeOpts,
} from '../types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('cache-invalidation.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

// ---------------------------------------------------------------------------
// Sandbox: per-suite tmp graph store + tmp repo + prompt file
// ---------------------------------------------------------------------------

const SANDBOX = mkdtempSync(join(tmpdir(), 'analyze-cache-invalid-live-'));
const STORE_PATH = join(SANDBOX, 'graph.lmdb');
const REPO_PATH = join(SANDBOX, 'fake-repo');
const PROMPT_PATH = join(SANDBOX, 'cache-invalid.system.md');

test.before(async () => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
	await closeGraphStore();
	setGraphStorePath(STORE_PATH);
	writeFileSync(PROMPT_PATH, [
		'You are a tiny test shaper. Do not call any tools.',
		'Emit an AnalyzeContextBundle with:',
		'  system  = "invalidation-test"',
		'  summary = "deterministic"',
		'  all other layers = ""',
	].join('\n'), 'utf8');
});

test.after(async () => {
	if (!GATE) return;
	await closeGraphStore();
	rmSync(SANDBOX, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const T0 = '2026-06-22T10:00:00.000Z';
const T1 = '2026-06-22T14:00:00.000Z';

const INTENT_AT_REPO: ClassifiedIntent = {
	target:    'code',
	scope:     'XS',
	focused:   false,
	scopeRef:  { kind: 'repo', value: REPO_PATH },
	reasoning: 'cache-invalidation live test',
};

const OPTS_BASE: Omit<ShapeOpts, 'runId'> = {};
const INPUTS: RunShapeInput = { intent: INTENT_AT_REPO };

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `live-cache-invalid-${label}-${suffix}`;
}

function readCachedBundle(runId: string): AnalyzeContextBundle | null {
	const key: CacheKey = { mode: 'run', hash: 'x' /* ignored: we just want the path */ };
	const path = cacheFilePathFor(runId, key);
	if (!existsSync(path)) return null;
	const raw = readFileSync(path, 'utf8');
	const parsed = JSON.parse(raw) as { bundle: AnalyzeContextBundle };
	return parsed.bundle;
}

// ---------------------------------------------------------------------------
// Test: write at T0 -> read hits -> advance to T1 -> read rebuilds
// ---------------------------------------------------------------------------

test('runShaper invalidates cached bundle when registry lastIndexed advances', { skip: !GATE }, async () => {
	const runId = uniqueRunId('e2e');

	// 1) Seed the registry: REPO_PATH at lastIndexed=T0.
	await addRepo(null, {
		path:        REPO_PATH,
		name:        'fake-repo',
		addedAt:     T0,
		status:      'pending',
		lastIndexed: T0,
	});
	await updateRepoStatus(null, REPO_PATH, 'ready', T0);

	try {
		// 2) First call -- real Ollama work; bundle stamped with T0.
		const first = await runShaper({
			promptPath:     PROMPT_PATH,
			invocationMode: 'run',
			shaperId:       'code',
			inputs:         INPUTS,
			opts:           { ...OPTS_BASE, runId },
		});
		assert.equal(first.meta?.repoLastIndexedAt, Date.parse(T0),
			'first bundle should be stamped with T0');

		// 3) Re-read the file directly to confirm persistence.
		const persisted = readCachedBundle(runId);
		assert.ok(persisted);
		assert.equal(persisted.meta?.repoLastIndexedAt, Date.parse(T0));

		// 4) Second call -- same inputs, same registry value. Should be
		//    a cache hit (fast, identical bundle).
		const t1 = Date.now();
		const second = await runShaper({
			promptPath:     PROMPT_PATH,
			invocationMode: 'run',
			shaperId:       'code',
			inputs:         INPUTS,
			opts:           { ...OPTS_BASE, runId },
		});
		const secondMs = Date.now() - t1;
		assert.deepEqual(second, first, 'cache-hit bundle should be identical to first');
		assert.ok(secondMs < 500, `cache hit should be fast, got ${secondMs}ms`);

		// 5) Advance the registry watermark to T1.
		await updateRepoStatus(null, REPO_PATH, 'ready', T1);

		// 6) Third call -- watermark advanced. Cache should be invalidated
		//    and Ollama called again. Verify by:
		//      - meta.repoLastIndexedAt now equals T1 (not T0)
		//      - new bundle is structurally equivalent on layer content
		//        but has a different stamp
		const third = await runShaper({
			promptPath:     PROMPT_PATH,
			invocationMode: 'run',
			shaperId:       'code',
			inputs:         INPUTS,
			opts:           { ...OPTS_BASE, runId },
		});
		assert.equal(third.meta?.repoLastIndexedAt, Date.parse(T1),
			'third bundle must be stamped with T1 (post-advance watermark)');
		assert.notEqual(third.meta?.repoLastIndexedAt, first.meta?.repoLastIndexedAt,
			'third bundle stamp must differ from first');

		// 7) Cache file on disk now carries T1.
		const reReadPersisted = readCachedBundle(runId);
		assert.ok(reReadPersisted);
		assert.equal(reReadPersisted.meta?.repoLastIndexedAt, Date.parse(T1));
	} finally {
		// Cleanup the cached files for this run.
		const runDir = cacheFilePathFor(runId, { mode: 'run', hash: 'x' });
		if (existsSync(runDir)) {
			// eslint-disable-next-line no-empty
			try { rmSync(runDir); } catch {}
		}
	}
});
