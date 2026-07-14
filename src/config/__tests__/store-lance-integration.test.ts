/**
 * Phase 3.4 integration tests: ConfigStore <-> Lance config_vec wiring.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../db/lance/conn.js';
import { _resetConfigVecCache, searchConfigVecs } from '../../db/lance/config-vec.js';
import { ConfigStore } from '../store.js';
import { loadConfig } from '../../agent/config.js';
import type { ConfigEntry } from '../../shared/types.js';

const DIM = loadConfig().models.providers.local.embeddingDim;
let dir: string;

function vec(seed: number): number[] {
	const v: number[] = new Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	return v;
}

function makeEntry(overrides: Partial<ConfigEntry> = {}): ConfigEntry {
	return {
		id:          overrides.id ?? 'cfg-1',
		scope:       overrides.scope       ?? { kind: 'global' },
		namespace:   overrides.namespace   ?? 'implementation',
		category:    overrides.category    ?? 'template',
		language:    overrides.language    ?? 'typescript',
		name:        overrides.name        ?? 'pair-prompt',
		filePath:    overrides.filePath    ?? '~/.insrc/templates/foo.md',
		body:        overrides.body        ?? 'template body',
		tags:        overrides.tags        ?? [],
		updatedAt:   overrides.updatedAt   ?? '2026-05-05T10:00:00.000Z',
		contentHash: overrides.contentHash ?? 'h',
		embedding:   overrides.embedding   ?? [],
	};
}

test.beforeEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetConfigVecCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-config-store-lance-3.4-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	setLanceConnPath(join(dir, 'lance'));
});
test.afterEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetConfigVecCache();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

test('upsertEntry with embedding persists to Lance', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ embedding: vec(1) }));
	const hits = await searchConfigVecs(vec(1), undefined, 5);
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 'cfg-1');
});

test('upsertEntry with empty embedding skips Lance write', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry()); // empty embedding
	const hits = await searchConfigVecs(vec(1), undefined, 5);
	assert.equal(hits.length, 0);
});

test('upsertEntry that changes scope replaces the Lance row', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ scope: { kind: 'global' }, embedding: vec(1) }));
	await cs.upsertEntry(makeEntry({ scope: { kind: 'project', repoPath: '/repo/foo' }, embedding: vec(1) }));
	const globalHits = await searchConfigVecs(vec(1), "scope = 'global'", 10);
	assert.equal(globalHits.length, 0);
	const projHits = await searchConfigVecs(vec(1), "scope = 'project:/repo/foo'", 10);
	assert.equal(projHits.length, 1);
});

// ---------------------------------------------------------------------------
// vectorSearch read path
// ---------------------------------------------------------------------------

test('vectorSearch returns hydrated ConfigEntry objects with distances', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ id: 'near', embedding: vec(1) }));
	await cs.upsertEntry(makeEntry({ id: 'far',  embedding: vec(50), name: 'other' }));
	const r = await cs.vectorSearch(vec(1), undefined, 5);
	assert.equal(r.length, 2);
	assert.equal(r[0]!.entry.id, 'near');
	// Hydrated rows include the full body from LMDB
	assert.equal(r[0]!.entry.body, 'template body');
	assert.ok(r[0]!.distance < r[1]!.distance);
});

test('vectorSearch where-filter narrows results', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ id: 'a', namespace: 'implementation', embedding: vec(1) }));
	await cs.upsertEntry(makeEntry({ id: 'b', namespace: 'designer',       embedding: vec(2), name: 'des' }));
	const impl = await cs.vectorSearch(vec(1), "namespace = 'implementation'", 10);
	assert.equal(impl.length, 1);
	assert.equal(impl[0]!.entry.namespace, 'implementation');
});

test('vectorSearch returns [] on dim mismatch (legacy silent-error contract)', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ embedding: vec(1) }));
	const r = await cs.vectorSearch([1, 2, 3], undefined, 5);
	assert.deepEqual(r, []);
});

test('vectorSearch on empty query returns []', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ embedding: vec(1) }));
	const r = await cs.vectorSearch([], undefined, 5);
	assert.deepEqual(r, []);
});

// ---------------------------------------------------------------------------
// Cascades
// ---------------------------------------------------------------------------

test('deleteEntry cascades the Lance row', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ embedding: vec(1) }));
	await cs.deleteEntry('cfg-1');
	const hits = await searchConfigVecs(vec(1), undefined, 5);
	assert.equal(hits.length, 0);
});

test('deleteByScope cascades all matching Lance rows', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ id: 'g1', scope: { kind: 'global' }, embedding: vec(1) }));
	await cs.upsertEntry(makeEntry({ id: 'g2', scope: { kind: 'global' }, embedding: vec(2), name: 'g2-name' }));
	await cs.upsertEntry(makeEntry({ id: 'p1', scope: { kind: 'project', repoPath: '/repo/foo' }, embedding: vec(3), name: 'p1-name' }));
	await cs.deleteByScope('global');
	const globalLeft = await searchConfigVecs(vec(1), "scope = 'global'", 10);
	assert.equal(globalLeft.length, 0);
	const projLeft = await searchConfigVecs(vec(3), "scope = 'project:/repo/foo'", 10);
	assert.equal(projLeft.length, 1);
});
