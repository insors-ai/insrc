/**
 * Merge of origin/main into v2, decision D1 and D12 -- schema 10: a store built by the
 * retired v2 entity-membership index (version 6, `entity_by_file` keyed by a hash
 * of the absolute path, plus an `entity_by_repo` table) is repaired to main's
 * shape (repoId, filePath), and a store already in main's shape is unchanged.
 *
 * Run: npx tsx --test src/db/graph/__tests__/migration-v9-to-v10.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, SCHEMA_VERSION, setGraphStorePath, withWriteTxn } from '../store.js';
import { decodeEntityByFileKey, encodeEntityKey, decodeEntityKey, encodeRepoKey } from '../keys.js';
import { commitFile, findEntitiesByFile } from '../../entities.js';
import { addRepo } from '../../repos.js';
import type { Entity } from '../../../shared/types.js';
import { useTemporaryLance } from '../../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const REPO = '/repo/v9-to-v10';
const FILE = `${REPO}/src/a.ts`;

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-v8-to-v9-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const fn = (name: string): Entity => ({
	id: createHash('sha256').update(`${REPO}\x00${FILE}\x00function\x00${name}`).digest('hex').slice(0, 32),
	kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file: FILE,
	startLine: 1, endLine: 2, body: `function ${name}() {}`, embedding: [], indexedAt: '2026-11-03T00:00:00.000Z',
});

async function fileRows(): Promise<Array<{ key: Buffer; value: Buffer }>> {
	const store = await getGraphStore();
	return [...store.entityByFile.getRange()].map(r => ({ key: r.key as Buffer, value: r.value as Buffer }));
}

test('migration-v9-to-v10.test.ts: a v6 store built by the retired v2 index is repaired to the (repoId, filePath) shape and its legacy table is dropped', async () => {
	await addRepo(null, { path: REPO, name: 'v2-built', addedAt: '2026-11-03T00:00:00.000Z', status: 'ready' });
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h', entities: [fn('a'), fn('b')], relations: [] });
	const entityKeys = await withWriteTxn(s => [...s.entity.getRange()].map(r => r.key as Buffer));
	assert.equal(entityKeys.length, 2);

	// Make it a store built by the v2 index: hashed-path keys, a legacy by-repo table, version 6.
	await withWriteTxn(s => {
		for (const { key } of s.entityByFile.getRange()) s.entityByFile.remove(key as Buffer);
		const legacy = s.root.openDB({ name: 'entity_by_repo', keyEncoding: 'binary', encoding: 'binary', dupSort: true });
		for (const key of entityKeys) {
			s.entityByFile.put(createHash('sha256').update(FILE, 'utf8').digest(), key);
			legacy.put(encodeRepoKey(1), key);
		}
		s.meta.put('schema_version', 6);
	});
	assert.equal(await findEntitiesByFile(null, FILE).then(r => r.length), 0, 'main\'s reader finds nothing in the v2-shaped index');
	await closeGraphStore();

	const store = await getGraphStore();
	assert.equal(store.meta.get('schema_version'), SCHEMA_VERSION);
	assert.equal(SCHEMA_VERSION, 9);
	assert.deepEqual((await findEntitiesByFile(null, FILE)).map(e => e.name).sort(), ['a', 'b']);
	const rows = await fileRows();
	assert.equal(rows.length, 2, 'one row per entity, none left from the v2 shape');
	for (const row of rows) {
		const key = decodeEntityByFileKey(row.key);
		assert.equal(key.filePath, 'src/a.ts', 'the key holds the repo-relative path the entity row stores');
		assert.ok(entityKeys.some(k => decodeEntityKey(k) === decodeEntityKey(row.value)));
	}
	const legacy = store.root.openDB({ name: 'entity_by_repo', keyEncoding: 'binary', encoding: 'binary', dupSort: true });
	assert.equal([...legacy.getRange()].length, 0, 'the legacy table is empty after the drop');
	void encodeEntityKey;
});

test('migration-v9-to-v10.test.ts: a store already in main\'s shape ends with the same index rows', async () => {
	await addRepo(null, { path: REPO, name: 'main-built', addedAt: '2026-11-03T00:00:00.000Z', status: 'ready' });
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h', entities: [fn('a')], relations: [] });
	const before = (await fileRows()).map(r => r.key.toString('hex') + ':' + r.value.toString('hex')).sort();
	await withWriteTxn(s => { s.meta.put('schema_version', 9); });
	await closeGraphStore();
	await getGraphStore();
	const after = (await fileRows()).map(r => r.key.toString('hex') + ':' + r.value.toString('hex')).sort();
	assert.deepEqual(after, before);
});
