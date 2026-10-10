/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-2764c29d S001 (t1) — the two store functions the index clean-up
 * needs: the read of a repo's stored files with their entity ids, and
 * the repo-scoped removal of a file's unresolved relations. Over a temp
 * graph store.
 *
 * Run: npx tsx --test src/db/__tests__/entity-files-for-repo.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../lance/conn.js';
import { _resetEntityVecCache } from '../lance/entity-vec.js';
import { addRepo } from '../repos.js';
import { upsertEntities, listEntityFilesForRepo } from '../entities.js';
import {
	upsertRelations,
	listUnresolvedRelations,
	deleteUnresolvedForRepoFile,
} from '../relations.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { Entity, Relation } from '../../shared/types.js';

const NOW = '2026-10-10T00:00:00.000Z';
let store: string;
let repoA: string;
let repoB: string;

test.beforeEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	store = mkdtempSync(join(tmpdir(), 'insrc-2764-t1-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	setLanceConnPath(join(store, 'lance'));
	repoA = mkdtempSync(join(tmpdir(), 'insrc-2764-t1-a-'));
	// repoB is nested under repoA so both can hold rows for one path.
	repoB = join(repoA, 'vendor', 'lib');
	await addRepo(null, { path: repoA, name: '', addedAt: NOW, status: 'pending' });
	await addRepo(null, { path: repoB, name: '', addedAt: NOW, status: 'pending' });
});
test.afterEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	rmSync(store, { recursive: true, force: true });
	rmSync(repoA, { recursive: true, force: true });
});

function ent(repo: string, file: string, kind: Entity['kind'], name: string): Entity {
	return {
		id: makeEntityId(repo, file, kind, name),
		kind, name, language: 'typescript',
		repoId: 1, repo, file, startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: NOW,
	};
}

function unresolved(repo: string, file: string, from: Entity, to: string): Relation {
	return { kind: 'CALLS', from: from.id, to, resolved: false, meta: { repo, file } };
}

test('the read of a repository\'s stored files returns each file once, only that repository\'s files, and no empty path', async () => {
	const one = join(repoA, 'src', 'one.ts');
	const two = join(repoA, 'src', 'two.ts');
	const shared = join(repoB, 'x.ts');
	const aOneFile = ent(repoA, one, 'file', one);
	const aOneFn = ent(repoA, one, 'function', 'f');
	const aOneCls = ent(repoA, one, 'class', 'C');
	const aTwoFn = ent(repoA, two, 'function', 'g');
	const aShared = ent(repoA, shared, 'function', 'h');
	const bShared = ent(repoB, shared, 'function', 'h');
	const bOnly = ent(repoB, join(repoB, 'only-b.ts'), 'function', 'k');
	const noFile = ent(repoA, '', 'function', 'endpoint');
	await upsertEntities(null, [aOneFile, aOneFn, aOneCls, aTwoFn, aShared, bShared, bOnly, noFile]);

	const files = await listEntityFilesForRepo(null, repoA);

	assert.deepEqual([...files.keys()].sort(), [one, two, shared].sort());
	assert.deepEqual([...(files.get(one) ?? [])].sort(), [aOneFile.id, aOneFn.id, aOneCls.id].sort());
	assert.deepEqual(files.get(two), [aTwoFn.id]);
	// The nested repo holds an entity for the same path; only repoA's id is listed.
	assert.deepEqual(files.get(shared), [aShared.id]);
	assert.notEqual(aShared.id, bShared.id);

	const filesB = await listEntityFilesForRepo(null, repoB);
	assert.deepEqual([...filesB.keys()].sort(), [shared, join(repoB, 'only-b.ts')].sort());
	assert.deepEqual(filesB.get(shared), [bShared.id]);
});

test('the removal of one repository\'s unresolved relations of a file leaves another repository\'s unresolved relations of the same path', async () => {
	const shared = join(repoB, 'x.ts');
	const other = join(repoA, 'src', 'other.ts');
	const aShared = ent(repoA, shared, 'function', 'h');
	const bShared = ent(repoB, shared, 'function', 'h');
	const aOther = ent(repoA, other, 'function', 'o');
	await upsertEntities(null, [aShared, bShared, aOther]);
	await upsertRelations(null, [
		unresolved(repoA, shared, aShared, 'missingOne'),
		unresolved(repoA, shared, aShared, 'missingTwo'),
		unresolved(repoB, shared, bShared, 'missingOne'),
		unresolved(repoA, other, aOther, 'missingOne'),
	]);
	assert.equal((await listUnresolvedRelations(null, repoA, shared)).length, 2);
	assert.equal((await listUnresolvedRelations(null, repoB, shared)).length, 1);

	await deleteUnresolvedForRepoFile(null, repoA, shared);

	assert.equal((await listUnresolvedRelations(null, repoA, shared)).length, 0);
	// repoA's other file and repoB's rows for the same path are untouched.
	assert.equal((await listUnresolvedRelations(null, repoA, other)).length, 1);
	assert.equal((await listUnresolvedRelations(null, repoA)).length, 1);
	assert.equal((await listUnresolvedRelations(null, repoB, shared)).length, 1);
});

test('an unregistered repository has no stored files and its removal of unresolved relations does nothing', async () => {
	const file = join(repoA, 'src', 'one.ts');
	const e = ent(repoA, file, 'function', 'f');
	await upsertEntities(null, [e]);
	await upsertRelations(null, [unresolved(repoA, file, e, 'missing')]);
	const stranger = join(tmpdir(), 'insrc-2764-t1-not-registered');

	assert.equal((await listEntityFilesForRepo(null, stranger)).size, 0);
	await deleteUnresolvedForRepoFile(null, stranger, file);

	assert.equal((await listUnresolvedRelations(null, repoA, file)).length, 1);
	assert.equal((await listEntityFilesForRepo(null, repoA)).size, 1);
});
