import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeGraphStore, getGraphStore, setGraphStorePath } from '../graph/store.js';
import { decodeEntityRow, encodeEntityRow } from '../graph/codec.js';
import { encodeEntityFileKey, encodeEntityKey, encodeRepoKey } from '../graph/keys.js';
import { addRepo, lookupRepoId } from '../repos.js';
import { deleteEntitiesForFile, deleteEntitiesForRepo, findEntitiesByFile, listEntitiesForRepo, listEntityFilesForRepo, reindexFile, upsertEntities } from '../entities.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();
const A = '/repo/scoped-a', B = '/repo/scoped-b';
let dir: string;
const entity = (id: string, repo = A, file = `${repo}/a.ts`): Entity => ({
	id, repo, file, repoId: 1, kind: 'function', name: id, language: 'typescript', startLine: 1, endLine: 2,
	body: 'old', embedding: [], indexedAt: '2026-10-24T00:00:00Z', artifact: false,
});
beforeEach(async () => {
	await closeGraphStore(); dir = mkdtempSync(join(tmpdir(), 'insrc-scope-index-')); setGraphStorePath(join(dir, 'graph.lmdb'));
	for (const path of [A, B]) await addRepo(null, { path, name: path, addedAt: '2026-10-24T00:00:00Z', status: 'ready' });
	await upsertEntities(null, [entity('a1'), entity('b1', B), entity('a2'), entity('other-a', A, `${A}/other.ts`)]);
});
afterEach(async () => { mock.restoreAll(); await closeGraphStore(); rmSync(dir, { recursive: true, force: true }); });

test('scoped reads, deletion collectors and reindex snapshots never scan the entity table', async () => {
	const s = await getGraphStore();
	mock.method(s.entity, 'getRange', () => { throw new Error('whole-table scan'); });
	const get = s.entity.get.bind(s.entity), seen: string[] = [];
	const reads = mock.method(s.entity, 'get', (...args: Parameters<typeof get>) => { seen.push((args[0] as Buffer).toString('hex')); return get(...args); });
	assert.deepEqual((await findEntitiesByFile(null, `${A}/a.ts`)).map(e => e.id), ['a1', 'a2']);
	assert.equal(seen.length, 2);
	seen.length = 0;
	assert.deepEqual((await listEntitiesForRepo(null, A)).map(e => e.id), ['a1', 'a2', 'other-a']);
	assert.equal(seen.length, 3);
	assert.deepEqual([...(await listEntityFilesForRepo(null, A))], [[`${A}/a.ts`, ['a1', 'a2']], [`${A}/other.ts`, ['other-a']]]);
	const unrelated = encodeEntityKey(BigInt(s.entityIdByString.get('b1') as bigint)).toString('hex');
	assert.ok(!seen.includes(unrelated));
	reads.mock.restore();
	await reindexFile(null, A, `${A}/a.ts`, [entity('replacement')]);
	assert.deepEqual((await findEntitiesByFile(null, `${A}/a.ts`)).map(e => e.id), ['replacement']);
	await deleteEntitiesForFile(null, `${A}/a.ts`);
	assert.deepEqual(await findEntitiesByFile(null, `${A}/a.ts`), []);
	await deleteEntitiesForRepo(null, A);
	assert.deepEqual(await listEntitiesForRepo(null, A), []);
	assert.deepEqual((await listEntitiesForRepo(null, B)).map(e => e.id), ['b1']);
	assert.deepEqual(await listEntitiesForRepo(null, '/not-registered'), []);
});

test('exact file checks filter forced digest collisions and support long Unicode paths', async () => {
	const s = await getGraphStore();
	const unrelated = encodeEntityKey(BigInt(s.entityIdByString.get('b1') as bigint));
	// Force the candidate set a colliding digest would produce; authoritative equality must still filter it.
	await s.entityByFile.put(encodeEntityFileKey(`${A}/a.ts`), unrelated);
	assert.deepEqual((await findEntitiesByFile(null, `${A}/a.ts`)).map(e => e.id), ['a1', 'a2']);
	const file = `${A}/${'資料/'.repeat(400)}é.ts`;
	await upsertEntities(null, [entity('long', A, file)]);
	assert.deepEqual((await findEntitiesByFile(null, file)).map(e => e.file), [file]);
});

test('index iteration and authoritative rows share a pinned snapshot across a committed write', async () => {
	const s = await getGraphStore(), get = s.entity.get.bind(s.entity);
	let changed = false;
	const reader = mock.method(s.entity, 'get', (...args: Parameters<typeof get>) => {
		assert.ok(args[1]?.transaction, 'authoritative reads use the explicit snapshot');
		if (!changed) {
			changed = true;
			s.root.transactionSync(() => {
				for (const id of ['a1', 'a2']) {
					const key = encodeEntityKey(BigInt(s.entityIdByString.get(id) as bigint));
					const row = decodeEntityRow(get(key) as Buffer);
					s.entity.put(key, encodeEntityRow({ ...row, body: 'new' }));
				}
			});
		}
		return get(...args);
	});
	assert.deepEqual((await findEntitiesByFile(null, `${A}/a.ts`)).map(e => e.body), ['old', 'old']);
	reader.mock.restore();
	assert.deepEqual((await findEntitiesByFile(null, `${A}/a.ts`)).map(e => e.body), ['new', 'new']);
});

test('dangling membership rows, missing string IDs and missing registry roots fail visibly', async () => {
	const s = await getGraphStore(), fileKey = encodeEntityFileKey(`${A}/a.ts`), ghost = encodeEntityKey(99999n);
	await s.entityByFile.put(fileKey, ghost);
	await assert.rejects(findEntitiesByFile(null, `${A}/a.ts`), /missing authoritative row/);
	await s.entityByFile.remove(fileKey, ghost);
	const id = encodeEntityKey(BigInt(s.entityIdByString.get('a1') as bigint));
	await s.entityStringByU64.remove(id);
	await assert.rejects(findEntitiesByFile(null, `${A}/a.ts`), /without its string ID/);
	await s.entityStringByU64.put(id, 'a1');
	await s.repo.remove(encodeRepoKey((await lookupRepoId(A))!));
	await assert.rejects(findEntitiesByFile(null, `${A}/a.ts`), /unregistered repository/);
});
