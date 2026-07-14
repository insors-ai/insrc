/**
 * Phase 3.4 tests for the config_vec Lance table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeLanceConn, setLanceConnPath } from '../conn.js';
import {
	writeConfigEmbedding,
	searchConfigVecs,
	deleteConfigVec,
	deleteConfigVecsByIds,
	deleteConfigVecsForScope,
	_resetConfigVecCache,
} from '../config-vec.js';
import { loadConfig } from '../../../agent/config.js';

const DIM = loadConfig().models.providers.local.embeddingDim;
let dir: string;

function vec(seed: number): Float32Array {
	const v = new Float32Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	return v;
}

test.beforeEach(async () => {
	await closeLanceConn();
	_resetConfigVecCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-config-vec-3.4-'));
	setLanceConnPath(join(dir, 'lance'));
});
test.afterEach(async () => {
	await closeLanceConn();
	_resetConfigVecCache();
	rmSync(dir, { recursive: true, force: true });
});

test('writeConfigEmbedding + searchConfigVecs round-trip', async () => {
	await writeConfigEmbedding({
		id: 'cfg-1', embedding: vec(1),
		scope: 'global', namespace: 'implementation',
		category: 'template', language: 'typescript',
	});
	const hits = await searchConfigVecs(Array.from(vec(1)), undefined, 5);
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 'cfg-1');
});

test('searchConfigVecs accepts caller-supplied where filter', async () => {
	await writeConfigEmbedding({ id: 'a', embedding: vec(1), scope: 'global', namespace: 'implementation', category: 'template', language: 'typescript' });
	await writeConfigEmbedding({ id: 'b', embedding: vec(2), scope: 'global', namespace: 'designer',       category: 'template', language: 'typescript' });
	const hits = await searchConfigVecs(Array.from(vec(1)), "namespace = 'implementation'", 10);
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 'a');
});

test('searchConfigVecs scope filter via where', async () => {
	await writeConfigEmbedding({ id: 'g', embedding: vec(1), scope: 'global',           namespace: 'implementation', category: 'template', language: 'typescript' });
	await writeConfigEmbedding({ id: 'p', embedding: vec(2), scope: 'project:/repo/foo', namespace: 'implementation', category: 'template', language: 'typescript' });
	const globalOnly = await searchConfigVecs(Array.from(vec(1)), "scope = 'global'", 10);
	assert.equal(globalOnly.length, 1);
	assert.equal(globalOnly[0]!.id, 'g');
});

test('searchConfigVecs language=all-or-specific filter', async () => {
	await writeConfigEmbedding({ id: 'ts',  embedding: vec(1), scope: 'global', namespace: 'implementation', category: 'template', language: 'typescript' });
	await writeConfigEmbedding({ id: 'all', embedding: vec(2), scope: 'global', namespace: 'implementation', category: 'template', language: 'all' });
	await writeConfigEmbedding({ id: 'py',  embedding: vec(3), scope: 'global', namespace: 'implementation', category: 'template', language: 'python' });
	const hits = await searchConfigVecs(Array.from(vec(1)), "(language = 'typescript' OR language = 'all')", 10);
	const ids = new Set(hits.map(h => h.id));
	assert.ok(ids.has('ts'));
	assert.ok(ids.has('all'));
	assert.ok(!ids.has('py'));
});

test('upsert: writing same id replaces', async () => {
	await writeConfigEmbedding({ id: 'a', embedding: vec(1), scope: 'global', namespace: 'implementation', category: 'template', language: 'typescript' });
	await writeConfigEmbedding({ id: 'a', embedding: vec(99), scope: 'project:/repo/x', namespace: 'designer', category: 'feedback', language: 'all' });
	const hits = await searchConfigVecs(Array.from(vec(1)), undefined, 10);
	const a = hits.filter(h => h.id === 'a');
	assert.equal(a.length, 1);
	assert.equal(a[0]!.scope, 'project:/repo/x');
	assert.equal(a[0]!.namespace, 'designer');
});

test('deleteConfigVec / deleteConfigVecsByIds / deleteConfigVecsForScope', async () => {
	await writeConfigEmbedding({ id: 'a', embedding: vec(1), scope: 'global', namespace: 'implementation', category: 'template', language: 'typescript' });
	await writeConfigEmbedding({ id: 'b', embedding: vec(2), scope: 'global', namespace: 'designer',       category: 'template', language: 'typescript' });
	await writeConfigEmbedding({ id: 'c', embedding: vec(3), scope: 'project:/repo/x', namespace: 'planner', category: 'feedback', language: 'all' });

	await deleteConfigVec('a');
	await deleteConfigVecsByIds(['b']);
	const globalLeft = await searchConfigVecs(Array.from(vec(1)), "scope = 'global'", 10);
	assert.equal(globalLeft.length, 0);

	await deleteConfigVecsForScope('project:/repo/x');
	const projLeft = await searchConfigVecs(Array.from(vec(3)), "scope = 'project:/repo/x'", 10);
	assert.equal(projLeft.length, 0);
});

test('returns [] for empty query', async () => {
	assert.deepEqual(await searchConfigVecs([], undefined, 5), []);
});

test('seed sentinel is excluded from search results', async () => {
	const hits = await searchConfigVecs(Array.from(vec(1)), undefined, 100);
	for (const h of hits) {
		assert.notEqual(h.id, '_seed_config_vec');
	}
});
