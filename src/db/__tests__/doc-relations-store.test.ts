/**
 * Epic c2ba6fa6, Story s10, t1 -- the document-relationship tables and schema
 * 9. Over a real temporary store: a v8 store opens at version 9 with the three
 * tables empty and its rows unchanged; a full index clears the proposal rows
 * and carries them, and the restore writes back only rows whose document is
 * unchanged; removing a repository removes its proposal, carry and quality rows
 * and no other repository's; a session-memory execution may read the proposal
 * and quality handles and is refused a write.
 *
 * Run: npx tsx --test src/db/__tests__/doc-relations-store.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from 'lmdb';

import { closeGraphStore, getGraphStore, SCHEMA_VERSION, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { encodeRepoKey } from '../graph/keys.js';
import { addRepo, lookupRepoId, removeRepo } from '../repos.js';
import {
	fileEntityHashInTxn,
	readDocRelationQualityInTxn,
	readDocRelationRowsInTxn,
	restoreCarriedDocRelations,
	writeDocRelationQualityInTxn,
	writeDocRelationRowInTxn,
	type DocRelationRow,
} from '../doc-relations.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';
import type { DbClient } from '../client.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../../indexer/watcher.js';
import { IndexerService } from '../../indexer/index.js';
import { ConnectionExecutionError, runWithConnectionExecution, sessionConnectionExecution } from '../../shared/step-context.js';
import { RequestLifetime } from '../../daemon/request-context.js';

useTemporaryLance();

const db = null as unknown as DbClient;
const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
let dir: string;
let repo: string;
let other: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-s10-store-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-store-repo-')));
	other = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-store-other-')));
	mkdirSync(join(repo, 'docs'));
	writeFileSync(join(repo, 'docs/a.md'), '# A\n\nSee the other document.\n');
	writeFileSync(join(repo, 'docs/b.md'), '# B\n\nThe second document.\n');
	for (const path of [repo, other]) await addRepo(null, { path, name: path, addedAt: '2026-11-04T00:00:00.000Z', status: 'pending' });
});
test.afterEach(async () => {
	await closeGraphStore();
	for (const d of [dir, repo, other]) rmSync(d, { recursive: true, force: true });
});

const row = (contentHash: string, generation = 1): DocRelationRow =>
	({ contentHash, modelId: 'mid-model', computedAtGeneration: generation, proposals: [{ from: 'f', to: 't', rationale: 'r' }] });
const quality = { extraction: { state: 'ok' as const, examined: 1, failed: 0, updatedAt: '2026-11-04T00:00:00.000Z' } };

const NEW_TABLES = ['docRelationProposals', 'docRelationCarry', 'docRelationQuality'] as const;
const NEW_NAMES = ['doc_relation_proposals', 'doc_relation_proposals_carry', 'doc_relation_quality'];
/** Every row of every table the store had before s10, as stored. */
function snapshot(store: Awaited<ReturnType<typeof getGraphStore>>): Record<string, unknown[]> {
	const out: Record<string, unknown[]> = {};
	for (const name of Object.keys(store).sort()) {
		if (name === 'root' || name === 'meta' || (NEW_TABLES as readonly string[]).includes(name)) continue;
		out[name] = [...(store as unknown as Record<string, { getRange(o: object): Iterable<{ key: unknown; value: unknown }> }>)[name]!.getRange({})]
			.map(({ key, value }) => [key, value]);
	}
	return out;
}

test('s10 t1: migration 9 creates empty doc-relation sub-dbs and changes no other row', async () => {
	assert.equal(SCHEMA_VERSION, 9);
	// A store with real rows: an indexed repository (entities, edges, pending rows, index state, file index).
	const svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
	let store = await getGraphStore();
	// Make it a v8 store: the three s10 tables do not exist yet.
	for (const name of NEW_TABLES) store[name].dropSync();
	await withWriteTxn(s => { s.meta.put('schema_version', 8); });
	const before = snapshot(store);
	assert.ok(before['entity']!.length > 0 && before['outEdge']!.length > 0 && before['repo']!.length > 0, 'the snapshot holds real rows');
	await closeGraphStore();
	const v8 = open({ path: join(dir, 'graph.lmdb'), readOnly: true, maxDbs: 64 });
	const v8Names = new Set([...v8.getKeys({})].map(String));
	await v8.close();
	for (const name of NEW_NAMES) assert.ok(!v8Names.has(name), `${name} does not exist in the v8 store`);

	store = await getGraphStore();
	assert.equal(store.meta.get('schema_version'), 9);
	assert.deepEqual(snapshot(store), before, 'every row of every existing table is unchanged');
	for (const name of NEW_TABLES) assert.equal([...store[name].getKeys({})].length, 0, `${name} exists and is empty`);
});

test('s10 t1: a full index clears and carries proposal rows; restore keeps only unchanged documents', async () => {
	const svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
	const store = await getGraphStore();
	const repoId = (await lookupRepoId(repo))!;
	const hashA = fileEntityHashInTxn(store, repo, 'docs/a.md')!;
	const hashB = fileEntityHashInTxn(store, repo, 'docs/b.md')!;
	assert.ok(hashA && hashB, 'both documents have a stored file hash');
	await withWriteTxn(s => {
		writeDocRelationRowInTxn(s, repoId, 'docs/a.md', row(hashA));
		writeDocRelationRowInTxn(s, repoId, 'docs/b.md', row(hashB));
		writeDocRelationQualityInTxn(s, repoId, quality);
	});

	writeFileSync(join(repo, 'docs/b.md'), '# B\n\nThe second document, edited.\n');
	await svc.processJob({ kind: 'full', repoPath: repo });
	assert.equal(readDocRelationRowsInTxn(store, repoId).size, 0, 'no proposal row is readable after the delete');
	assert.equal([...store.docRelationCarry.getKeys({})].length, 2, 'both rows were carried');
	assert.deepEqual(readDocRelationQualityInTxn(store, repoId), quality, 'the quality row is not graph data and stays');

	assert.deepEqual(await restoreCarriedDocRelations(repo), { restored: 1, dropped: 1 });
	assert.deepEqual([...readDocRelationRowsInTxn(store, repoId).keys()], ['docs/a.md'], 'only the unchanged document is restored');
	assert.equal([...store.docRelationCarry.getKeys({})].length, 0, 'the carry is emptied');
});

test('s10 t1: removeRepo deletes proposal, carry and quality rows', async () => {
	const store = await getGraphStore();
	const repoId = (await lookupRepoId(repo))!;
	const otherId = (await lookupRepoId(other))!;
	await withWriteTxn(s => {
		for (const id of [repoId, otherId]) {
			writeDocRelationRowInTxn(s, id, 'docs/a.md', row('h'));
			s.docRelationCarry.put(Buffer.concat([encodeRepoKey(id), Buffer.from('docs/c.md')]), Buffer.from([0x90]));
			writeDocRelationQualityInTxn(s, id, quality);
		}
	});

	await removeRepo(null, repo);
	assert.equal(readDocRelationRowsInTxn(store, repoId).size, 0);
	assert.equal(readDocRelationQualityInTxn(store, repoId), undefined);
	assert.equal([...store.docRelationCarry.getKeys({ start: encodeRepoKey(repoId), end: encodeRepoKey(repoId + 1) })].length, 0);
	assert.equal(readDocRelationRowsInTxn(store, otherId).size, 1, "the other repository's rows stay");
	assert.deepEqual(readDocRelationQualityInTxn(store, otherId), quality);
	assert.equal([...store.docRelationCarry.getKeys({ start: encodeRepoKey(otherId), end: encodeRepoKey(otherId + 1) })].length, 1);
});

test('s10 t1: session-memory reads the new handles and is refused writes', async () => {
	const store = await getGraphStore();
	const repoId = (await lookupRepoId(repo))!;
	await withWriteTxn(s => { writeDocRelationRowInTxn(s, repoId, 'docs/a.md', row('h')); writeDocRelationQualityInTxn(s, repoId, quality); });
	const lifetime = new RequestLifetime();
	const execution = sessionConnectionExecution(
		Object.freeze({ lookupRoot: repo, daemonEpoch: 's10-t1', sessionHandle: 'opaque-owner' }),
		{ bindingId: 'binding', audience: 'workbench-ui', controlGeneration: 1, lifetime, assertActive() {} },
	);
	await runWithConnectionExecution(execution, async () => {
		assert.equal(readDocRelationRowsInTxn(store, repoId).size, 1, 'the proposal handle is readable');
		assert.deepEqual(readDocRelationQualityInTxn(store, repoId), quality, 'the quality handle is readable');
		assert.throws(() => store.docRelationProposals.put(Buffer.from('x'), Buffer.from('y')), ConnectionExecutionError);
		assert.throws(() => store.docRelationQuality.put(Buffer.from('x'), Buffer.from('y')), ConnectionExecutionError);
		assert.throws(() => writeDocRelationRowInTxn(store, repoId, 'docs/b.md', row('h')), ConnectionExecutionError);
	});
});
