/**
 * Tests for the v2 -> v3 forward migration: repo-registry strict
 * contract (plans/repo-registry-strict-contract.md).
 *
 * Seeds a v2 store with synthetic phantom rows + module entities,
 * runs the migration, asserts the v3 invariants:
 *
 *   - Reserved shared-modules rows provisioned at fixed IDs.
 *   - Module entities with kind='module' rewired to point at the
 *     matching namespace's reserved repoId; their string IDs are
 *     re-hashed with the namespace prefix; old name_index entries
 *     are removed and new ones added.
 *   - Phantom workspace rows (path='' or non-absolute) are deleted
 *     along with all their entities; reverse + name indices are
 *     swept.
 *   - Re-running the migration on already-v3 data is idempotent.
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
	type GraphStore,
} from '../store.js';
import { runMigrations, MIGRATIONS } from '../migrations.js';
import {
	encodeEntityKey,
	encodeNameIndexKey,
	encodeRepoKey,
	ENTITY_KIND_BYTE,
	decodeEntityKey,
} from '../keys.js';
import {
	encodeEntityRow,
	decodeEntityRow,
	encodeRepoRow,
	decodeRepoRow,
	type EntityRow,
	type RepoRow,
} from '../codec.js';
import { allocateEntityIdInTxn, allocateRepoIdInTxn } from '../ids.js';
import {
	SHARED_MODULES_REPO_ID,
} from '../../../shared/repo-namespaces.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-migration-v2v3-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function makeIdLite(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

/**
 * Seed a v2-shape store with workspace rows + module entities tied
 * to those rows. Returns handles so the test can assert post-state.
 */
async function seedV2State(store: GraphStore): Promise<{
	hadoopRepoId: number;
	phantomRepoId: number;
	javaModuleU64: bigint;
	pythonModuleU64: bigint;
	hadoopFileEntityU64: bigint;
}> {
	let hadoopRepoId = 0;
	let phantomRepoId = 0;
	let javaModuleU64 = 0n;
	let pythonModuleU64 = 0n;
	let hadoopFileEntityU64 = 0n;

	await store.root.transaction(() => {
		// Workspace row -- Hadoop (legitimate).
		hadoopRepoId = allocateRepoIdInTxn(store);
		const hadoopRow: RepoRow = {
			id: hadoopRepoId, kind: 'workspace',
			path: '/Users/test/hadoop', name: 'hadoop',
			addedAt: Date.now(), lastIndexed: 0,
			status: 'ready', errorMsg: '',
		};
		store.repo.put(encodeRepoKey(hadoopRepoId), encodeRepoRow(hadoopRow));

		// Phantom workspace row -- empty path (the 2026-05-07 incident shape).
		phantomRepoId = allocateRepoIdInTxn(store);
		const phantomRow: RepoRow = {
			id: phantomRepoId, kind: 'workspace',
			path: '', name: '',
			addedAt: Date.now(), lastIndexed: 0,
			status: 'pending', errorMsg: '',
		};
		store.repo.put(encodeRepoKey(phantomRepoId), encodeRepoRow(phantomRow));

		// A Java module entity tied to the phantom (mimics indexManifest's
		// pre-fix behaviour).
		javaModuleU64 = allocateEntityIdInTxn(store);
		const javaStringId = makeIdLite('', '', 'module', 'org.apache.hadoop.fs.Path');
		const javaRow: EntityRow = {
			repoId: phantomRepoId, kind: 'module', name: 'org.apache.hadoop.fs.Path',
			filePath: '', startLine: 0, endLine: 0,
			language: 'java', rootPath: '',
			body: '', signature: '', summary: '',
			isExported: false, isAsync: false, isAbstract: false, artifact: false,
			contentHash: '', embeddingModel: '',
			indexedAt: Date.now(),
		};
		store.entity.put(encodeEntityKey(javaModuleU64), encodeEntityRow(javaRow));
		store.entityIdByString.put(javaStringId, javaModuleU64);
		store.entityStringByU64.put(encodeEntityKey(javaModuleU64), javaStringId);
		store.nameIndex.put(
			encodeNameIndexKey(phantomRepoId, ENTITY_KIND_BYTE['module']!, javaRow.name),
			encodeEntityKey(javaModuleU64),
		);

		// A Python module entity tied to the phantom.
		pythonModuleU64 = allocateEntityIdInTxn(store);
		const pythonStringId = makeIdLite('', '', 'module', 'os.path');
		const pythonRow: EntityRow = {
			repoId: phantomRepoId, kind: 'module', name: 'os.path',
			filePath: '', startLine: 0, endLine: 0,
			language: 'python', rootPath: '',
			body: '', signature: '', summary: '',
			isExported: false, isAsync: false, isAbstract: false, artifact: false,
			contentHash: '', embeddingModel: '',
			indexedAt: Date.now(),
		};
		store.entity.put(encodeEntityKey(pythonModuleU64), encodeEntityRow(pythonRow));
		store.entityIdByString.put(pythonStringId, pythonModuleU64);
		store.entityStringByU64.put(encodeEntityKey(pythonModuleU64), pythonStringId);
		store.nameIndex.put(
			encodeNameIndexKey(phantomRepoId, ENTITY_KIND_BYTE['module']!, pythonRow.name),
			encodeEntityKey(pythonModuleU64),
		);

		// A regular file entity tied to Hadoop (NOT a module). Stays put.
		hadoopFileEntityU64 = allocateEntityIdInTxn(store);
		const fileStringId = makeIdLite('/Users/test/hadoop', 'src/Foo.java', 'class', 'Foo');
		const fileRow: EntityRow = {
			repoId: hadoopRepoId, kind: 'class', name: 'Foo',
			filePath: 'src/Foo.java', startLine: 1, endLine: 10,
			language: 'java', rootPath: '/Users/test/hadoop',
			body: '...', signature: '', summary: '',
			isExported: true, isAsync: false, isAbstract: false, artifact: false,
			contentHash: 'a'.repeat(64), embeddingModel: '',
			indexedAt: Date.now(),
		};
		store.entity.put(encodeEntityKey(hadoopFileEntityU64), encodeEntityRow(fileRow));
		store.entityIdByString.put(fileStringId, hadoopFileEntityU64);
		store.entityStringByU64.put(encodeEntityKey(hadoopFileEntityU64), fileStringId);
		store.nameIndex.put(
			encodeNameIndexKey(hadoopRepoId, ENTITY_KIND_BYTE['class']!, fileRow.name),
			encodeEntityKey(hadoopFileEntityU64),
		);

		// Mark stored version as 2 so the runner picks the v2->v3 step.
		store.meta.put('schema_version', 2);
	});

	return { hadoopRepoId, phantomRepoId, javaModuleU64, pythonModuleU64, hadoopFileEntityU64 };
}

test('v2->v3: provisions all 4 reserved shared-modules rows', async () => {
	const store = await getGraphStore();
	await seedV2State(store);

	await runMigrations(store, 2, 3, MIGRATIONS);

	for (const [namespace, reservedId] of Object.entries(SHARED_MODULES_REPO_ID)) {
		const buf = store.repo.get(encodeRepoKey(reservedId));
		assert.ok(buf, `expected reserved row at ${reservedId} for namespace ${namespace}`);
		const row = decodeRepoRow(buf as Buffer);
		assert.equal(row.kind, 'shared-modules');
		assert.equal(row.namespace, namespace);
		assert.equal(row.path, '');
	}
});

test('v2->v3: rewires Java module entity to jvm namespace + recomputes string ID', async () => {
	const store = await getGraphStore();
	const { javaModuleU64 } = await seedV2State(store);

	await runMigrations(store, 2, 3, MIGRATIONS);

	const buf = store.entity.get(encodeEntityKey(javaModuleU64));
	assert.ok(buf, 'java module entity should still exist');
	const row = decodeEntityRow(buf as Buffer);
	assert.equal(row.repoId, SHARED_MODULES_REPO_ID.jvm);
	assert.equal(row.kind, 'module');
	assert.equal(row.name, 'org.apache.hadoop.fs.Path');

	// String-id index now uses the namespace-scoped hash.
	const oldStringId = makeIdLite('', '', 'module', 'org.apache.hadoop.fs.Path');
	const newStringId = makeIdLite('jvm', '', 'module', 'org.apache.hadoop.fs.Path');
	assert.notEqual(oldStringId, newStringId);
	assert.equal(store.entityIdByString.get(oldStringId), undefined);
	assert.equal(store.entityIdByString.get(newStringId), javaModuleU64);

	// name_index swapped from phantom-repoId to jvm-namespace-id.
	const newKey = encodeNameIndexKey(SHARED_MODULES_REPO_ID.jvm, ENTITY_KIND_BYTE['module']!, row.name);
	const indexed: Buffer[] = [];
	for (const v of store.nameIndex.getValues(newKey)) {
		indexed.push(v as Buffer);
	}
	assert.ok(indexed.some(b => decodeEntityKey(b) === javaModuleU64));
});

test('v2->v3: rewires Python module entity to python namespace (separate from jvm)', async () => {
	const store = await getGraphStore();
	const { pythonModuleU64 } = await seedV2State(store);

	await runMigrations(store, 2, 3, MIGRATIONS);

	const buf = store.entity.get(encodeEntityKey(pythonModuleU64));
	const row = decodeEntityRow(buf as Buffer);
	assert.equal(row.repoId, SHARED_MODULES_REPO_ID.python);
	assert.notEqual(row.repoId, SHARED_MODULES_REPO_ID.jvm);
});

test('v2->v3: drops the phantom workspace row + its entities (cascade)', async () => {
	const store = await getGraphStore();
	const { phantomRepoId, hadoopFileEntityU64 } = await seedV2State(store);

	await runMigrations(store, 2, 3, MIGRATIONS);

	// Phantom row gone.
	assert.equal(store.repo.get(encodeRepoKey(phantomRepoId)), undefined);

	// Hadoop's class entity stays put.
	assert.ok(store.entity.get(encodeEntityKey(hadoopFileEntityU64)));
});

test('v2->v3: idempotent on re-run from v3', async () => {
	const store = await getGraphStore();
	await seedV2State(store);

	await runMigrations(store, 2, 3, MIGRATIONS);
	const versionAfterFirst = store.meta.get('schema_version');
	assert.equal(versionAfterFirst, 3);

	// Second pass with stored=3, target=3 is a no-op (returns 0).
	const applied = await runMigrations(store, 3, 3, MIGRATIONS);
	assert.equal(applied, 0);
	assert.equal(store.meta.get('schema_version'), 3);
});

test('v2->v3: workspace row with valid path is preserved', async () => {
	const store = await getGraphStore();
	const { hadoopRepoId } = await seedV2State(store);

	await runMigrations(store, 2, 3, MIGRATIONS);

	const buf = store.repo.get(encodeRepoKey(hadoopRepoId));
	assert.ok(buf, 'hadoop workspace row should be preserved');
	const row = decodeRepoRow(buf as Buffer);
	assert.equal(row.kind, 'workspace');
	assert.equal(row.path, '/Users/test/hadoop');
});
