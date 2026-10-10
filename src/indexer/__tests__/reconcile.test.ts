/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-2764c29d S001 — the index clean-up pass (`reconcile` job): it
 * removes the stored files of a repo that are gone from disk or that the
 * repo's ignore list excludes, and nothing else. Over a temp graph store
 * and a temp vector store (removing an entity always opens the vector
 * table, whose path is the live store unless it is set).
 *
 * Run: npx tsx --test src/indexer/__tests__/reconcile.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../db/lance/conn.js';
import { _resetEntityVecCache } from '../../db/lance/entity-vec.js';
import { addRepo } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import { IndexQueue } from '../../daemon/queue.js';
import { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';

const NOW = '2026-10-10T00:00:00.000Z';
const db = null as unknown as DbClient;

let store: string;
let repoA: string;

test.beforeEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	store = mkdtempSync(join(tmpdir(), 'insrc-2764-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	setLanceConnPath(join(store, 'lance'));
	repoA = mkdtempSync(join(tmpdir(), 'insrc-2764-a-'));
	await addRepo(null, { path: repoA, name: '', addedAt: NOW, status: 'ready', lastIndexed: NOW });
});
test.afterEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	rmSync(store, { recursive: true, force: true });
	rmSync(repoA, { recursive: true, force: true });
});

function service(): IndexerService {
	return new IndexerService(db, new IndexQueue(), new Watcher());
}

test('a clean-up job for a registered repository with nothing stored is processed without error', async () => {
	const svc = service();
	// processJob's switch has no exhaustiveness check: count the calls the
	// job makes into the pass, so a missing `case 'reconcile'` fails here.
	const real = svc.reconcileRepo.bind(svc);
	const seen: string[] = [];
	svc.reconcileRepo = async (repoPath: string) => { seen.push(repoPath); return real(repoPath); };

	await svc.processJob({ kind: 'reconcile', repoPath: repoA });

	assert.deepEqual(seen, [repoA]);
	assert.deepEqual(
		await real(repoA),
		{ compared: 0, removedAbsent: 0, removedIgnored: 0, notChecked: 0 },
	);
});
