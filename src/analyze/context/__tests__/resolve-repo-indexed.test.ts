/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the driver's `resolveRepoLastIndexedAt` helper and the
 * companion `inferScopePath` -- the bridge between
 * intent.scopeRef.value and the registry's lastIndexed watermark.
 *
 * Pure LMDB integration -- no Ollama, no HTTP. The graph store path
 * is overridden to a tmp dir per-test so registry rows don't leak
 * between tests or with a developer's local registry.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/resolve-repo-indexed.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import {
	_inferScopePathForTest,
	_resolveRepoLastIndexedAtForTest,
} from '../driver.js';
import type {
	AnalyzeScopeRef,
	ClassifiedIntent,
} from '../../../shared/analyze-types.js';
import type {
	ClassificationShapeInput,
	RunShapeInput,
} from '../types.js';

// ---------------------------------------------------------------------------
// Per-test LMDB sandbox
// ---------------------------------------------------------------------------

let storeDir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	storeDir = mkdtempSync(join(tmpdir(), 'analyze-resolve-repo-'));
	setGraphStorePath(join(storeDir, 'graph.lmdb'));
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(storeDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// inferScopePath -- pure dispatch
// ---------------------------------------------------------------------------

function classificationInput(value: string): ClassificationShapeInput {
	return {
		scopeRef:   { kind: 'workspace', value },
		userPrompt: 'irrelevant',
	};
}

function runInput(kind: AnalyzeScopeRef['kind'], value: string): RunShapeInput {
	const intent: ClassifiedIntent = {
		target:    'code',
		scope:     'M',
		focused:   false,
		scopeRef:  { kind, value },
		reasoning: 'test',
	};
	return { intent };
}

test('inferScopePath: classification input returns scopeRef.value', () => {
	assert.equal(_inferScopePathForTest(classificationInput('/some/repo')), '/some/repo');
});

test('inferScopePath: run input with kind=repo returns scopeRef.value', () => {
	assert.equal(_inferScopePathForTest(runInput('repo', '/some/repo')), '/some/repo');
});

test('inferScopePath: run input with kind=file returns scopeRef.value', () => {
	assert.equal(_inferScopePathForTest(runInput('file', '/some/repo/x.ts')), '/some/repo/x.ts');
});

test('inferScopePath: run input with kind=connection returns empty string', () => {
	// 'connection' has no filesystem path; the driver passes '' so the
	// registry lookup short-circuits to undefined -> no freshness check.
	assert.equal(_inferScopePathForTest(runInput('connection', 'prod-db')), '');
});

// ---------------------------------------------------------------------------
// resolveRepoLastIndexedAt -- against real LMDB registry
// ---------------------------------------------------------------------------

async function addRepoWithTimestamp(
	path: string,
	lastIndexed?: string,
): Promise<void> {
	const { addRepo, updateRepoStatus } = await import('../../../db/repos.js');
	await addRepo(null, {
		path,
		name:    path,
		addedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
		status:  'pending',
		...(lastIndexed !== undefined ? { lastIndexed } : {}),
	});
	if (lastIndexed !== undefined) {
		await updateRepoStatus(null, path, 'ready', lastIndexed);
	}
}

test('resolveRepoLastIndexedAt: empty path returns undefined', async () => {
	const result = await _resolveRepoLastIndexedAtForTest('');
	assert.equal(result, undefined);
});

test('resolveRepoLastIndexedAt: no registered repo matching the path returns undefined', async () => {
	await addRepoWithTimestamp('/registered/repo', '2026-06-22T10:00:00.000Z');
	const result = await _resolveRepoLastIndexedAtForTest('/other/path');
	assert.equal(result, undefined);
});

test('resolveRepoLastIndexedAt: registered repo with lastIndexed returns ms epoch', async () => {
	const path = '/registered/repo-a';
	await addRepoWithTimestamp(path, '2026-06-22T10:00:00.000Z');
	const result = await _resolveRepoLastIndexedAtForTest(path);
	assert.equal(result, Date.parse('2026-06-22T10:00:00.000Z'));
});

test('resolveRepoLastIndexedAt: registered repo without lastIndexed returns undefined', async () => {
	const path = '/registered/repo-no-lastindexed';
	await addRepoWithTimestamp(path /* lastIndexed omitted */);
	const result = await _resolveRepoLastIndexedAtForTest(path);
	assert.equal(result, undefined);
});

test('resolveRepoLastIndexedAt: scope path nested under registered repo matches the parent', async () => {
	const repoPath = '/registered/repo-b';
	const filePath = '/registered/repo-b/src/feature/x.ts';
	await addRepoWithTimestamp(repoPath, '2026-06-22T11:00:00.000Z');
	const result = await _resolveRepoLastIndexedAtForTest(filePath);
	assert.equal(result, Date.parse('2026-06-22T11:00:00.000Z'));
});

test('resolveRepoLastIndexedAt: longest-prefix match wins when multiple repos overlap', async () => {
	const outer = '/registered/outer';
	const inner = '/registered/outer/nested';
	const probe = '/registered/outer/nested/deep/x.ts';
	await addRepoWithTimestamp(outer, '2026-06-22T10:00:00.000Z');
	await addRepoWithTimestamp(inner, '2026-06-22T12:00:00.000Z');
	const result = await _resolveRepoLastIndexedAtForTest(probe);
	// Inner wins -- longest prefix.
	assert.equal(result, Date.parse('2026-06-22T12:00:00.000Z'));
});

test('resolveRepoLastIndexedAt: false-prefix is rejected (boundary at "/")', async () => {
	// /registered/repo-c is registered. A scope path /registered/repo-c-other
	// shares the string-prefix /registered/repo-c but is NOT under it. The
	// helper must require either an exact match or a "/" boundary.
	await addRepoWithTimestamp('/registered/repo-c', '2026-06-22T10:00:00.000Z');
	const result = await _resolveRepoLastIndexedAtForTest('/registered/repo-c-other');
	assert.equal(result, undefined);
});

test('resolveRepoLastIndexedAt: a later updateRepoStatus advances the watermark', async () => {
	const path = '/registered/repo-d';
	await addRepoWithTimestamp(path, '2026-06-22T10:00:00.000Z');
	const before = await _resolveRepoLastIndexedAtForTest(path);
	assert.equal(before, Date.parse('2026-06-22T10:00:00.000Z'));

	const { updateRepoStatus } = await import('../../../db/repos.js');
	const newTs = '2026-06-22T14:00:00.000Z';
	await updateRepoStatus(null, path, 'ready', newTs);
	const after = await _resolveRepoLastIndexedAtForTest(path);
	assert.equal(after, Date.parse(newTs));
	assert.ok(after! > before!);
});
