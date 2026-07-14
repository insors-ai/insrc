/**
 * Tests for the v2 derived indices (entity_string_by_u64, name_index)
 * and the v1 -> v2 backfill migration.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import {
	closeGraphStore,
	getGraphStore,
	setGraphStorePath,
	withWriteTxn,
	SCHEMA_VERSION,
} from '../store.js';
import {
	encodeEntityKey,
	encodeNameIndexKey,
	ENTITY_KIND_BYTE,
} from '../keys.js';
import { encodeEntityRow, type EntityRow } from '../codec.js';
import { runMigrations, MIGRATIONS } from '../migrations.js';
import { upsertEntities, findEntitiesByName, entityIdByU64, entityIdsByU64s } from '../../entities.js';
import type { Entity, EntityKind } from '../../../shared/types.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-derived-idx-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const { addRepo } = await import('../../repos.js');
	for (const path of ['/repo/foo', '/repo/x', '/repo/y']) {
		await addRepo(null, { path, name: '', addedAt: new Date().toISOString(), status: 'pending' });
	}
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const REPO = '/repo/foo';

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeEntity(name: string, kind: EntityKind = 'function', file = `${REPO}/src/${name}.ts`): Entity {
	return {
		id:        makeEntityId(REPO, file, kind, name),
		kind, name,
		language:  'typescript',
		repoId:    1,
		repo:      REPO,
		file,
		startLine: 1, endLine: 5,
		body:      `function ${name}() {}`,
		embedding: [],
		indexedAt: '2026-05-06T10:00:00.000Z',
	};
}

// ---------------------------------------------------------------------------
// entity_string_by_u64 (reverse u64->string lookup)
// ---------------------------------------------------------------------------

test('entityIdByU64 finds the string id via the reverse index', async () => {
	const a = makeEntity('alpha');
	const b = makeEntity('beta');
	await upsertEntities(null, [a, b]);

	const store = await getGraphStore();
	const aU64 = store.entityIdByString.get(a.id) as bigint;
	const bU64 = store.entityIdByString.get(b.id) as bigint;

	assert.equal(await entityIdByU64(aU64), a.id);
	assert.equal(await entityIdByU64(bU64), b.id);
	assert.equal(await entityIdByU64(999_999_999n), undefined);
});

test('entityIdsByU64s bulk-resolves O(K) via point lookups', async () => {
	const ents = Array.from({ length: 100 }, (_, i) => makeEntity(`e${i}`));
	await upsertEntities(null, ents);

	const store = await getGraphStore();
	const u64s: bigint[] = [];
	for (const e of ents) {
		u64s.push(store.entityIdByString.get(e.id) as bigint);
	}

	const map = await entityIdsByU64s(u64s);
	assert.equal(map.size, 100);
	for (let i = 0; i < 100; i++) {
		assert.equal(map.get(u64s[i]!), ents[i]!.id);
	}
});

test('entity_string_by_u64 is removed when an entity is deleted', async () => {
	const { deleteEntitiesForFile } = await import('../../entities.js');
	const a = makeEntity('a');
	await upsertEntities(null, [a]);

	const store = await getGraphStore();
	const aU64 = store.entityIdByString.get(a.id) as bigint;
	assert.ok(store.entityStringByU64.get(encodeEntityKey(aU64)) !== undefined);

	await deleteEntitiesForFile(null, a.file);
	assert.equal(store.entityStringByU64.get(encodeEntityKey(aU64)), undefined);
});

// ---------------------------------------------------------------------------
// name_index dupsort
// ---------------------------------------------------------------------------

test('name_index returns ALL entities sharing (repo, kind, name)', async () => {
	// 3 functions named "main" in different files of the same repo.
	const f1 = makeEntity('main', 'function', `${REPO}/src/a.ts`);
	const f2 = makeEntity('main', 'function', `${REPO}/src/b.ts`);
	const f3 = makeEntity('main', 'function', `${REPO}/src/c.ts`);
	await upsertEntities(null, [f1, f2, f3]);

	const got = await findEntitiesByName(null, ['main']);
	const names = got.map(e => e.file).sort();
	assert.equal(got.length, 3);
	assert.deepEqual(names, [
		`${REPO}/src/a.ts`,
		`${REPO}/src/b.ts`,
		`${REPO}/src/c.ts`,
	]);
});

test('name_index drops only the deleted entity from the dup set', async () => {
	const { deleteEntitiesForFile } = await import('../../entities.js');
	const f1 = makeEntity('main', 'function', `${REPO}/src/a.ts`);
	const f2 = makeEntity('main', 'function', `${REPO}/src/b.ts`);
	await upsertEntities(null, [f1, f2]);
	assert.equal((await findEntitiesByName(null, ['main'])).length, 2);

	await deleteEntitiesForFile(null, `${REPO}/src/a.ts`);
	const after = await findEntitiesByName(null, ['main']);
	assert.equal(after.length, 1);
	assert.equal(after[0]!.file, `${REPO}/src/b.ts`);
});

test('findEntitiesByName respects kind filter via name_index', async () => {
	const fn   = makeEntity('Bar', 'function');
	const cls  = makeEntity('Bar', 'class', `${REPO}/src/Bar-cls.ts`);
	await upsertEntities(null, [fn, cls]);

	const onlyClasses = await findEntitiesByName(null, ['Bar'], { kinds: ['class'] });
	assert.equal(onlyClasses.length, 1);
	assert.equal(onlyClasses[0]!.kind, 'class');
});

// ---------------------------------------------------------------------------
// v1 -> v2 backfill migration
// ---------------------------------------------------------------------------

test('v1->v2 migration backfills entity_string_by_u64 + name_index', async () => {
	// Build an env that LOOKS like v1: write entity rows + the forward
	// id index, but skip the derived sub-DBs.
	const a = makeEntity('alpha');
	const b = makeEntity('beta');
	await upsertEntities(null, [a, b]);

	// Now manually clear the derived indices and stamp the env back to
	// schema_version 1 so we can verify the migration rebuilds them.
	const store = await getGraphStore();
	const aU64 = store.entityIdByString.get(a.id) as bigint;
	const bU64 = store.entityIdByString.get(b.id) as bigint;

	await withWriteTxn(s => {
		s.entityStringByU64.remove(encodeEntityKey(aU64));
		s.entityStringByU64.remove(encodeEntityKey(bU64));
		s.nameIndex.remove(encodeNameIndexKey(1, ENTITY_KIND_BYTE['function'], 'alpha'));
		s.nameIndex.remove(encodeNameIndexKey(1, ENTITY_KIND_BYTE['function'], 'beta'));
		s.meta.put('schema_version', 1);
	});

	// Confirm the indices are empty.
	assert.equal(store.entityStringByU64.get(encodeEntityKey(aU64)), undefined);
	assert.equal((await findEntitiesByName(null, ['alpha'])).length, 0);

	// Run the v1->v2 migration directly.
	const v1to2 = MIGRATIONS.find(m => m.from === 1 && m.to === 2);
	assert.ok(v1to2);
	await store.root.transaction(async () => {
		await v1to2.run(store);
	});

	// Reverse index restored.
	assert.equal(store.entityStringByU64.get(encodeEntityKey(aU64)), a.id);
	assert.equal(store.entityStringByU64.get(encodeEntityKey(bU64)), b.id);

	// name_index restored -- findEntitiesByName works again.
	const found = await findEntitiesByName(null, ['alpha']);
	assert.equal(found.length, 1);
	assert.equal(found[0]!.id, a.id);
});

test('schema_version pre-flight runs the v1->v2 migration on env open', async () => {
	// Seed an entity row under a v1-shaped env.
	await upsertEntities(null, [makeEntity('alpha')]);
	const store = await getGraphStore();
	const u64 = store.entityIdByString.get(makeEntityId(REPO, `${REPO}/src/alpha.ts`, 'function', 'alpha')) as bigint;

	await withWriteTxn(s => {
		s.entityStringByU64.remove(encodeEntityKey(u64));
		s.nameIndex.remove(encodeNameIndexKey(1, ENTITY_KIND_BYTE['function'], 'alpha'));
		s.meta.put('schema_version', 1);
	});

	// Close + reopen -- the migration runner should fire and rebuild.
	await closeGraphStore();
	const reopened = await getGraphStore();
	const ver = reopened.meta.get('schema_version');
	assert.equal(ver, SCHEMA_VERSION);
	assert.equal(reopened.entityStringByU64.get(encodeEntityKey(u64)), makeEntityId(REPO, `${REPO}/src/alpha.ts`, 'function', 'alpha'));
});

// Suppress unused-import warnings on TS strict-mode flags
void encodeEntityRow;
void ((): EntityRow => ({
	repoId: 0, kind: 'function', name: '', filePath: '',
	startLine: 0, endLine: 0, language: 'typescript',
	rootPath: '', body: '', signature: '', summary: '',
	isExported: false, isAsync: false, isAbstract: false,
	artifact: false, contentHash: '', embeddingModel: '', indexedAt: 0,
}));
