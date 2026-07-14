/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pre-LLM invariant tests -- ensureNonEmptyClosure + ScopeNotIndexedError.
 *
 * Uses an LMDB sandbox per test so the user's production graph
 * registry doesn't leak in.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/invariants.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addRepo } from '../../../db/repos.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import type { Entity } from '../../../shared/types.js';

import {
	ScopeNotIndexedError,
	ensureNonEmptyClosure,
} from '../invariants.js';
import type { ClassifiedIntent } from '../types.js';

// ---------------------------------------------------------------------------
// Per-test LMDB sandbox
// ---------------------------------------------------------------------------

let storeDir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	storeDir = mkdtempSync(join(tmpdir(), 'analyze-invariants-'));
	setGraphStorePath(join(storeDir, 'graph.lmdb'));
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(storeDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function codeIntent(value: string, kind: ClassifiedIntent['scopeRef']['kind'] = 'repo'): ClassifiedIntent {
	return {
		target:    'code',
		scope:     'M',
		focused:   false,
		scopeRef:  { kind, value },
		reasoning: 'invariants test fixture',
	};
}

function makeEntity(repo: string, file: string): Entity {
	return {
		id:        `e${Math.floor(Math.random() * 1e9).toString(16)}`,
		repo,
		file,
		kind:      'function',
		name:      'fn',
		language:  'typescript',
		startLine: 1,
		endLine:   3,
	} as unknown as Entity;
}

async function registerAndSeedRepo(path: string, withEntities: boolean): Promise<void> {
	await addRepo(null, {
		path,
		name:    path,
		addedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
		status:  withEntities ? 'ready' : 'pending',
	});
	if (withEntities) {
		await upsertEntities(null, [makeEntity(path, `${path}/index.ts`)]);
	}
}

// ---------------------------------------------------------------------------
// Pristine registry: invariant skipped
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: pristine registry -> skipped silently, returns undefined', async () => {
	const intent = codeIntent('/some/scope/path');
	const result = await ensureNonEmptyClosure(intent);
	assert.equal(result, undefined);
});

// ---------------------------------------------------------------------------
// Connection scope: always skipped
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: connection-kind scope is skipped silently', async () => {
	// Even with repos in the registry, a connection scope skips.
	await registerAndSeedRepo('/some/repo', true);
	const intent = codeIntent('my-conn', 'connection');
	const result = await ensureNonEmptyClosure(intent);
	assert.equal(result, undefined);
});

// ---------------------------------------------------------------------------
// Registered repo + entities -> success
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: registered repo with entities -> returns repo path', async () => {
	const repoPath = '/registered/with-entities';
	await registerAndSeedRepo(repoPath, true);
	const intent = codeIntent(repoPath);
	const result = await ensureNonEmptyClosure(intent);
	assert.equal(result, repoPath);
});

test('ensureNonEmptyClosure: scope nested under registered repo with entities -> match', async () => {
	const repoPath = '/registered/parent';
	await registerAndSeedRepo(repoPath, true);
	const intent = codeIntent(`${repoPath}/src/feature/x.ts`, 'file');
	const result = await ensureNonEmptyClosure(intent);
	assert.equal(result, repoPath);
});

// ---------------------------------------------------------------------------
// Registered repo without entities -> ScopeNotIndexedError
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: registered repo with ZERO entities -> ScopeNotIndexedError', async () => {
	const repoPath = '/registered/no-entities';
	await registerAndSeedRepo(repoPath, false);
	const intent = codeIntent(repoPath);
	await assert.rejects(
		() => ensureNonEmptyClosure(intent),
		(err: unknown) => {
			assert.ok(err instanceof ScopeNotIndexedError);
			assert.equal(err.scopePath, repoPath);
			assert.equal(err.registeredAs, repoPath);
			assert.match(err.message, /zero indexed entities/);
			assert.match(err.message, /status: pending/);
			return true;
		},
	);
});

// ---------------------------------------------------------------------------
// No registered repo contains the scope -> ScopeNotIndexedError
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: scope outside every registered repo -> ScopeNotIndexedError', async () => {
	await registerAndSeedRepo('/registered/elsewhere', true);
	const intent = codeIntent('/unregistered/scope');
	await assert.rejects(
		() => ensureNonEmptyClosure(intent),
		(err: unknown) => {
			assert.ok(err instanceof ScopeNotIndexedError);
			assert.equal(err.scopePath, '/unregistered/scope');
			assert.equal(err.registeredAs, undefined);
			assert.match(err.message, /no registered repo contains the scope path/);
			return true;
		},
	);
});

// ---------------------------------------------------------------------------
// Longest-prefix match honored
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: longest-prefix repo wins when nested', async () => {
	await registerAndSeedRepo('/registered/outer',          true);
	await registerAndSeedRepo('/registered/outer/inner',    true);
	const intent = codeIntent('/registered/outer/inner/deep/x.ts', 'file');
	const result = await ensureNonEmptyClosure(intent);
	assert.equal(result, '/registered/outer/inner');
});

// ---------------------------------------------------------------------------
// Boundary-at-"/" prefix rule (mirrors resolveRepoLastIndexedAt)
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: false-prefix is rejected (requires / boundary)', async () => {
	await registerAndSeedRepo('/registered/repo-c', true);
	const intent = codeIntent('/registered/repo-c-other');
	await assert.rejects(
		() => ensureNonEmptyClosure(intent),
		ScopeNotIndexedError,
	);
});

// ---------------------------------------------------------------------------
// ScopeNotIndexedError shape
// ---------------------------------------------------------------------------

test('ScopeNotIndexedError carries scopePath + registeredAs on the instance', () => {
	const e = new ScopeNotIndexedError('/scope', '/repo', 'because');
	assert.equal(e.name, 'ScopeNotIndexedError');
	assert.equal(e.scopePath, '/scope');
	assert.equal(e.registeredAs, '/repo');
	assert.match(e.message, /Scope \/scope/);
	assert.match(e.message, /Registered repo: \/repo/);
	assert.match(e.message, /Reason: because/);
	assert.match(e.message, /insrc repo add/);
});

test('ScopeNotIndexedError handles undefined registeredAs', () => {
	const e = new ScopeNotIndexedError('/scope', undefined, 'reason');
	assert.equal(e.registeredAs, undefined);
	assert.match(e.message, /No registered repo contains this path/);
});
