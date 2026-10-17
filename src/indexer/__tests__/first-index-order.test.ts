/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t8 (ac1) — the order files are indexed in no longer loses
 * relationships. a.ts sorts before b.ts and imports and calls b.ts's function:
 * when a.ts is written, b.ts is not stored yet, so its IMPORTS is kept awaiting
 * b.ts's file id, and the cross-file pass completes it once b.ts is stored;
 * the call then resolves through the import.
 *
 * The real full index over a temporary store (no embedding backend is set, so
 * no model runs).
 *
 * Run: npx tsx --test src/indexer/__tests__/first-index-order.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import { findCallers } from '../../db/search.js';
import { listUnresolvedRelations } from '../../db/relations.js';
import { entityU64ForId } from '../../db/entities.js';
import { outNeighbors } from '../../db/graph/edges.js';
import type { DbClient } from '../../db/client.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { makeEntityId } from '../parser/base.js';

useTemporaryLance();

let store: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s1t8-order-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s1t8-order-repo-')));
	mkdirSync(join(repo, 'src'));
	writeFileSync(join(repo, 'src', 'a.ts'), "import { fn } from './b.js';\nexport function run(): number { return fn(); }\n");
	writeFileSync(join(repo, 'src', 'b.ts'), 'export function fn(): number { return 1; }\n');
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-10-18T00:00:00.000Z', status: 'pending' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;

test('ac1: a file sorting earlier imports and calls into a later one; after a first full index the IMPORTS and the CALLS are stored and findCallers returns the call site', async () => {
	const svc = new IndexerService(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });

	const a = join(repo, 'src', 'a.ts'), b = join(repo, 'src', 'b.ts');
	const aFile = makeEntityId(repo, a, 'file', a), bFile = makeEntityId(repo, b, 'file', b);
	const fn = makeEntityId(repo, b, 'function', 'fn'), run = makeEntityId(repo, a, 'function', 'run');

	const aU64 = (await entityU64ForId(aFile))!, bU64 = (await entityU64ForId(bFile))!;
	assert.ok(aU64 !== undefined && bU64 !== undefined, 'both files are stored');
	assert.ok((await outNeighbors(aU64, { kindFilter: ['IMPORTS'] })).includes(bU64), 'a.ts IMPORTS b.ts is an edge');
	assert.deepEqual((await findCallers(null, fn)).map(e => e.id), [run], 'findCallers(fn) returns the call site in a.ts');
	const left = (await listUnresolvedRelations(null, repo)).filter(r => r.kind === 'IMPORTS' || r.kind === 'CALLS');
	assert.deepEqual(left, [], 'nothing of the import or the call is left pending');
});
