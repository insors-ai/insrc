/**
 * Tests for the v5 -> v6 entity_by_file backfill migration
 * (Epic c2ba6fa6, Story s3, t8 -- ISSUE-61045de91faef1a0).
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
import { encodeEntityKey, encodeEntityByFileKey } from '../keys.js';
import { MIGRATIONS } from '../migrations.js';
import { upsertEntities, findEntitiesByFile, listEntitiesForRepo } from '../../entities.js';
import type { Entity, EntityKind } from '../../../shared/types.js';

import { useTemporaryLance } from '../../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-migration-v5-v6-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const { addRepo } = await import('../../repos.js');
	for (const path of ['/repo/foo', '/repo/x']) {
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

function makeEntity(name: string, kind: EntityKind = 'function', file = `${REPO}/src/${name}.ts`, repo = REPO): Entity {
	return {
		id:        makeEntityId(repo, file, kind, name),
		kind, name,
		language:  'typescript',
		repoId:    1,
		repo,
		file,
		startLine: 1, endLine: 5,
		body:      `function ${name}() {}`,
		embedding: [],
		indexedAt: '2026-05-06T10:00:00.000Z',
	};
}

test('ac2: a store built via the pre-Story raw-write path (no entity_by_file), opened twice, migrates on the first open only; reads work without a re-index', async () => {
	// Build an env with entity rows present but no entity_by_file entries
	// (as if written before this Story -- the wrapper already keeps it
	// in step today, so simulate the pre-Story shape by stripping it out
	// after the write and stamping schema_version back to 5).
	const a = makeEntity('alpha');
	const b = makeEntity('beta', 'function', `${REPO}/src/beta.ts`);
	await upsertEntities(null, [a, b]);

	const store = await getGraphStore();
	const aU64 = store.entityIdByString.get(a.id) as bigint;
	const bU64 = store.entityIdByString.get(b.id) as bigint;
	await withWriteTxn(s => {
		s.entityByFile.remove(encodeEntityByFileKey(1, 'src/alpha.ts'), encodeEntityKey(aU64));
		s.entityByFile.remove(encodeEntityByFileKey(1, 'src/beta.ts'), encodeEntityKey(bU64));
		s.meta.put('schema_version', 5);
	});
	assert.deepEqual(await findEntitiesByFile(null, `${REPO}/src/alpha.ts`), [], 'entity_by_file is empty before the migration runs');

	// First open: the pre-flight migration runner fires.
	await closeGraphStore();
	const reopened = await getGraphStore();
	assert.equal(reopened.meta.get('schema_version'), SCHEMA_VERSION);
	const afterFirst = await findEntitiesByFile(null, `${REPO}/src/alpha.ts`);
	assert.equal(afterFirst.length, 1);
	assert.equal(afterFirst[0]!.id, a.id);
	assert.deepEqual((await listEntitiesForRepo(null, REPO)).map(e => e.id).sort(), [a.id, b.id].sort());

	// Second open: schema_version is already current, so the runner is a no-op.
	// Prove it by corrupting entity_by_file in a way the migration would
	// repair, then confirming a second open does NOT repair it.
	const store2 = await getGraphStore();
	await withWriteTxn(s => {
		s.entityByFile.remove(encodeEntityByFileKey(1, 'src/alpha.ts'), encodeEntityKey(aU64));
	});
	await closeGraphStore();
	const reopenedAgain = await getGraphStore();
	assert.equal(reopenedAgain.meta.get('schema_version'), SCHEMA_VERSION);
	assert.deepEqual(await findEntitiesByFile(null, `${REPO}/src/alpha.ts`), [], 'a second open at the current schema_version did not re-run the migration');
	void store2;
});

test('a daemon crash simulated mid-migration (entity_by_file partially populated), followed by a fresh open, safely re-runs the migration without duplicate entries', async () => {
	const a = makeEntity('gamma');
	const b = makeEntity('delta', 'function', `${REPO}/src/delta.ts`);
	await upsertEntities(null, [a, b]);

	const store = await getGraphStore();
	const aU64 = store.entityIdByString.get(a.id) as bigint;
	const bU64 = store.entityIdByString.get(b.id) as bigint;

	// Simulate a crash mid-migration: ONE of the two rows already has its
	// entity_by_file entry (as if the walk got partway through before the
	// crash); the other does not yet. schema_version is rolled back to 5
	// so the migration is still due.
	await withWriteTxn(s => {
		s.entityByFile.remove(encodeEntityByFileKey(1, 'src/delta.ts'), encodeEntityKey(bU64));
		s.meta.put('schema_version', 5);
	});
	assert.equal((await findEntitiesByFile(null, `${REPO}/src/gamma.ts`)).length, 1, 'the already-migrated row is untouched');
	assert.equal((await findEntitiesByFile(null, `${REPO}/src/delta.ts`)).length, 0, 'the not-yet-migrated row is still missing');

	// Run the migration directly (mirrors derived-indices.test.ts's own
	// direct-invocation pattern) to prove re-running over a partially
	// migrated store is safe and idempotent.
	const v5to6 = MIGRATIONS.find(m => m.from === 5 && m.to === 6);
	assert.ok(v5to6);
	await store.root.transaction(async () => {
		await v5to6.run(store);
	});

	const gamma = await findEntitiesByFile(null, `${REPO}/src/gamma.ts`);
	assert.equal(gamma.length, 1, 'no duplicate entry for the already-migrated row');
	assert.equal(gamma[0]!.id, a.id);
	const delta = await findEntitiesByFile(null, `${REPO}/src/delta.ts`);
	assert.equal(delta.length, 1);
	assert.equal(delta[0]!.id, b.id);

	// Re-running a second time (idempotent dupSort put) still produces no duplicates.
	await store.root.transaction(async () => {
		await v5to6.run(store);
	});
	assert.equal((await findEntitiesByFile(null, `${REPO}/src/gamma.ts`)).length, 1);
	assert.equal((await findEntitiesByFile(null, `${REPO}/src/delta.ts`)).length, 1);
});
