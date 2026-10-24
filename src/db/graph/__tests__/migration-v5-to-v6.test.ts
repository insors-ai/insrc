import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from 'lmdb';

import { closeGraphStore, getGraphStore, setGraphStorePath, MAX_DBS, SCHEMA_VERSION } from '../store.js';
import { absoluteEntityFilePath, encodeEntityFileKey, encodeEntityKey, encodeRepoKey } from '../keys.js';
import { encodeEntityRow } from '../codec.js';
import type { EntityRow } from '../codec.js';
import { MIGRATION_V5_TO_V6, runMigrations } from '../migrations.js';
import { addRepo, lookupRepoId } from '../../repos.js';

let dir: string;
beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-v5v6-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
afterEach(async () => { mock.restoreAll(); await closeGraphStore(); rmSync(dir, { recursive: true, force: true }); });

const A = '/repo/a', B = '/repo/b';
const LONG_PATH = `${'資料/'.repeat(400)}é.ts`;
const row = (repoId: number, filePath: string): EntityRow => ({
	repoId, filePath, kind: 'function', name: 'f', startLine: 1, endLine: 2, language: 'typescript', rootPath: '',
	body: '', signature: '', summary: '', isExported: false, isAsync: false, isAbstract: false, artifact: false,
	contentHash: '', embeddingModel: '', indexedAt: 123,
});

/** Raw rows deliberately model a pre-index v5 database, not a production write. */
async function seedV5(): Promise<{ a: number; b: number }> {
	for (const path of [A, B]) await addRepo(null, { path, name: path, addedAt: '2026-10-24T00:00:00Z', status: 'ready' });
	const a = (await lookupRepoId(A))!, b = (await lookupRepoId(B))!;
	const store = await getGraphStore();
	await store.root.childTransaction(() => {
		store.entity.put(encodeEntityKey(9n), encodeEntityRow(row(a, 'src/é.ts')));
		store.entity.put(encodeEntityKey(2n), encodeEntityRow(row(a, 'src/é.ts')));
		store.entity.put(encodeEntityKey(5n), encodeEntityRow(row(b, 'src/é.ts')));
		store.entity.put(encodeEntityKey(12n), encodeEntityRow(row(a, LONG_PATH)));
		store.meta.put('schema_version', 5);
	});
	// Remove the v6-only databases: the file on disk now has the actual v5 layout.
	await store.entityByFile.drop();
	await store.entityByRepo.drop();
	await closeGraphStore();
	return { a, b };
}

test('file membership keys preserve exact path representation and support long Unicode paths', () => {
	const file = `${A}/${'資料/'.repeat(400)}é.ts`;
	assert.equal(encodeEntityFileKey(file).length, 32);
	assert.deepEqual(encodeEntityFileKey(file), encodeEntityFileKey(file));
	assert.notDeepEqual(encodeEntityFileKey(file), encodeEntityFileKey(file + '/'));
	assert.equal(absoluteEntityFilePath('src/é.ts', A + '/'), A + '/src/é.ts');
	assert.equal(absoluteEntityFilePath('/external/f.ts', A), '/external/f.ts');
	assert.equal(absoluteEntityFilePath('src/../f.ts', A), A + '/src/../f.ts');
	assert.equal(absoluteEntityFilePath('module.ts', ''), 'module.ts');
});

test('populated v5 startup backfills exact file/repo memberships in u64 order without rewriting entities', async () => {
	const { a, b } = await seedV5();
	const before = encodeEntityRow(row(a, 'src/é.ts'));
	const store = await getGraphStore();
	assert.equal(store.meta.get('schema_version'), 6);
	assert.deepEqual([...store.entityByFile.getValues(encodeEntityFileKey(A + '/src/é.ts'))], [encodeEntityKey(2n), encodeEntityKey(9n)]);
	assert.deepEqual([...store.entityByRepo.getValues(encodeRepoKey(a))], [encodeEntityKey(2n), encodeEntityKey(9n), encodeEntityKey(12n)]);
	assert.deepEqual([...store.entityByFile.getValues(encodeEntityFileKey(A + '/' + LONG_PATH))], [encodeEntityKey(12n)]);
	assert.deepEqual([...store.entityByRepo.getValues(encodeRepoKey(b))], [encodeEntityKey(5n)]);
	assert.deepEqual(store.entity.get(encodeEntityKey(9n)), before);
	await closeGraphStore();
	const reopened = await getGraphStore();
	assert.equal(await runMigrations(reopened, 6, 6), 0);
	assert.deepEqual([...reopened.entityByRepo.getValues(encodeRepoKey(a))], [encodeEntityKey(2n), encodeEntityKey(9n), encodeEntityKey(12n)]);
});

test('partial membership backfill failure rolls back both indexes and version then retries on reopen', async () => {
	const { a } = await seedV5();
	let calls = 0;
	const run = MIGRATION_V5_TO_V6.run;
	const failure = mock.method(MIGRATION_V5_TO_V6, 'run', (store) => {
		const put = store.entityByFile.put.bind(store.entityByFile);
		const writer = mock.method(store.entityByFile, 'put', (...args: Parameters<typeof put>) => {
			if (++calls === 2) throw new Error('injected partial backfill');
			return put(...args);
		});
		try { return run(store); } finally { writer.mock.restore(); }
	});
	await assert.rejects(getGraphStore(), /injected partial backfill/);
	assert.equal(calls, 2);
	failure.mock.restore();
	// Inspect only this disposable fixture without triggering another migration.
	const raw = open({ path: join(dir, 'graph.lmdb'), maxDbs: MAX_DBS });
	try {
		assert.equal(raw.openDB({ name: 'meta', keyEncoding: 'ordered-binary' }).get('schema_version'), 5);
		for (const name of ['entity_by_file', 'entity_by_repo']) {
			assert.equal([...raw.openDB({ name, keyEncoding: 'binary', encoding: 'binary', dupSort: true }).getRange()].length, 0);
		}
	} finally { await raw.close(); }
	const reopened = await getGraphStore();
	assert.equal(reopened.meta.get('schema_version'), 6);
	assert.equal([...reopened.entityByRepo.getValues(encodeRepoKey(a))].length, 3);
});

test('unregistered migration rows fail without allocating registry membership or changing schema', async () => {
	const store = await getGraphStore();
	await store.root.childTransaction(() => {
		store.entity.put(encodeEntityKey(1n), encodeEntityRow(row(12345, 'f.ts')));
		store.meta.put('schema_version', 5);
	});
	await assert.rejects(runMigrations(store, 5, 6), /unregistered repository 12345/);
	assert.equal(store.repo.get(encodeRepoKey(12345)), undefined);
	assert.equal(store.meta.get('schema_version'), 5);
	assert.equal([...store.entityByFile.getRange()].length, 0);
});

test('fresh schema6 has empty usable memberships and sufficient named database capacity', async () => {
	const store = await getGraphStore();
	assert.equal(SCHEMA_VERSION, 6);
	assert.equal(store.meta.get('schema_version'), 6);
	assert.equal([...store.entityByFile.getRange()].length, 0);
	assert.equal([...store.entityByRepo.getRange()].length, 0);
	assert.ok(store.root.getKeys({}).asArray.length < MAX_DBS);
	assert.equal(MIGRATION_V5_TO_V6.from, 5);
});
