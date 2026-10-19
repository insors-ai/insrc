/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (t1) — deleteEntitiesById: per-id entity delete with incident-edge cascade,
 * tolerant of missing ids. Over a temp graph store.
 *
 * Run: npx tsx --test src/db/__tests__/delete-entities-by-id.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import { addRepo } from '../repos.js';
import { upsertEntities, getEntity, deleteEntitiesById, entityU64ForId } from '../entities.js';
import { upsertRelations } from '../relations.js';
import { outNeighbors, inNeighbors } from '../graph/edges.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { Entity } from '../../shared/types.js';

import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

// This file reaches the vector store through code that takes no path; it gets a
// temporary one (the default path belongs to the daemon alone).
useTemporaryLance();

const NOW = '2026-08-07T00:00:00.000Z';
let store: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s001-t1-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = mkdtempSync(join(tmpdir(), 'insrc-s001-t1-repo-'));
	await addRepo(null, { path: repo, name: '', addedAt: NOW, status: 'pending' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

function fn(name: string): Entity {
	const file = `${repo}/${name}.ts`;
	return {
		id: makeEntityId(repo, file, 'function', name),
		kind: 'function', name, language: 'typescript',
		repoId: 1, repo, file, startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: NOW,
	};
}

test('t1: deleteEntitiesById removes the entity + cascades its CALLS_HTTP in/out edges; others untouched', async () => {
	const a = fn('a');   // caller
	const b = fn('b');   // target (stands in for an endpoint)
	const c = fn('c');   // bystander, untouched
	await upsertEntities(null, [a, b, c]);
	await upsertRelations(null, [
		{ kind: 'CALLS_HTTP', from: a.id, to: b.id, resolved: true },
		{ kind: 'CALLS', from: c.id, to: a.id, resolved: true },
	]);

	const bU64 = await entityU64ForId(b.id);
	assert.ok(bU64 !== undefined);

	await deleteEntitiesById(null, [b.id]);

	// b is gone
	assert.equal(await getEntity(null, b.id), null);
	assert.equal(await entityU64ForId(b.id), undefined);
	// its incident CALLS_HTTP edge is gone from a's out-neighbors
	const aU64 = await entityU64ForId(a.id);
	assert.deepEqual(await outNeighbors(aU64!, { kindFilter: ['CALLS_HTTP'] }), []);
	// bystanders untouched: c still exists + its CALLS edge to a survives
	assert.ok(await getEntity(null, c.id));
	const cU64 = await entityU64ForId(c.id);
	assert.equal((await outNeighbors(cU64!, { kindFilter: ['CALLS'] })).length, 1);
	// a still has its inbound CALLS from c
	assert.equal((await inNeighbors(aU64!, { kindFilter: ['CALLS'] })).length, 1);
});

test('t1: deleting an absent/stale id is a no-op; a mixed batch deletes present, skips absent', async () => {
	const a = fn('a');
	const b = fn('b');
	await upsertEntities(null, [a, b]);

	// absent id alone: no throw, nothing changes
	await deleteEntitiesById(null, ['deadbeefdeadbeefdeadbeefdeadbeef']);
	assert.ok(await getEntity(null, a.id));
	assert.ok(await getEntity(null, b.id));

	// mixed batch: present b + absent id
	await deleteEntitiesById(null, [b.id, 'deadbeefdeadbeefdeadbeefdeadbeef']);
	assert.equal(await getEntity(null, b.id), null);
	assert.ok(await getEntity(null, a.id));
});

/** The export_names keys stored under one file entity u64. */
async function exportKeysUnder(u64: bigint): Promise<number> {
	const { getGraphStore } = await import('../graph/store.js');
	const { encodeEntityKey } = await import('../graph/keys.js');
	const s = await getGraphStore();
	const start = encodeEntityKey(u64);
	const end = encodeEntityKey(u64 + 1n);
	return [...s.exportNames.getKeys({ start, end })].length;
}

test('s1/t10: re-indexing a barrel and then deleting it leave no export_names entry under its old u64', async () => {
	const { writeFileSync } = await import('node:fs');
	const { IndexerService } = await import('../../indexer/index.js');
	const { IndexQueue } = await import('../../daemon/queue.js');
	const { runCrossFileResolver } = await import('../../indexer/cross-file-resolver.js');
	const { detectSourceRoots } = await import('../../indexer/source-roots.js');
	const { deleteEntitiesForFile } = await import('../entities.js');
	type DbClient = import('../client.js').DbClient;
	type Watcher = import('../../indexer/watcher.js').Watcher;

	const b = join(repo, 'b.ts'), barrel = join(repo, 'index.ts');
	writeFileSync(b, 'export function f(): number { return 1; }\n');
	writeFileSync(barrel, "export { f } from './b.js';\nexport { f as g } from './b.js';\n");
	const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
	const svc = new IndexerService(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 600_000);
	await svc.start([{ path: repo, name: '', addedAt: NOW, status: 'ready' }]);
	await svc.processJob({ kind: 'full', repoPath: repo });

	const barrelId = makeEntityId(repo, barrel, 'file', barrel);
	const oldU64 = (await entityU64ForId(barrelId))!;
	assert.equal(await exportKeysUnder(oldU64), 2, 'the barrel re-exports f and g');

	// Re-index the barrel (the file job deletes its entities, then writes them again).
	await svc.processJob({ kind: 'file', filePath: barrel, event: 'update' });
	const newU64 = (await entityU64ForId(barrelId))!;
	assert.notEqual(newU64, oldU64, 'the re-indexed barrel has a new u64');
	assert.equal(await exportKeysUnder(oldU64), 0, 'nothing is left under the old u64');
	await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots: detectSourceRoots(repo) });
	assert.equal(await exportKeysUnder(newU64), 2, 'the cross-file pass writes them again under the new u64');

	await deleteEntitiesForFile(null, barrel);
	assert.equal(await exportKeysUnder(newU64), 0, 'deleting the barrel leaves nothing under its u64');
});
