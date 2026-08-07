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
