/**
 * Epic c2ba6fa6, Story s1, t1 -- the v4 -> v5 migration step.
 *
 * A store is seeded with two workspace repositories and pending rows of every
 * class, taken back to schema_version 4 with no index_state rows, and opened
 * again. The open runs the step: version 5, one IndexStateRow per workspace
 * repository (none for the shared-modules rows), fullIndexFinished false, and
 * pending counts equal to a recount of the stored rows. A step that throws
 * leaves the version at 4 and writes nothing.
 *
 * Run: npx tsx --test src/db/graph/__tests__/migration-v4-to-v5.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, SCHEMA_VERSION, type GraphStore } from '../store.js';
import { MIGRATIONS, MIGRATION_V4_TO_V5, runMigrations } from '../migrations.js';
import { decodeIndexStateRow, decodeRepoRow, encodeUnresolvedRow, type IndexStateRow, type UnresolvedRow } from '../codec.js';
import { encodeRepoKey } from '../keys.js';
import { addRepo } from '../../repos.js';
import { useTemporaryLance } from '../../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-migration-v4v5-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const A = '/tmp/insrc-v4v5/a';
const B = '/tmp/insrc-v4v5/b';

function repoIdOf(store: GraphStore, path: string): number {
	for (const { value } of store.repo.getRange()) {
		const r = decodeRepoRow(value as Buffer);
		if (r.path === path) return r.id;
	}
	throw new Error(`no repo ${path}`);
}

function stateRows(store: GraphStore): Map<number, IndexStateRow> {
	const out = new Map<number, IndexStateRow>();
	for (const { key, value } of store.indexState.getRange()) {
		out.set((key as Buffer).readUInt32BE(0), decodeIndexStateRow(value as Buffer));
	}
	return out;
}

/** Two workspace repositories and pending rows of every class in A; then back to a v4 store. */
async function seedV4(): Promise<{ a: number; b: number }> {
	const at = '2026-10-16T00:00:00.000Z';
	await addRepo(null, { path: A, name: 'a', addedAt: at, status: 'ready', lastIndexed: at });
	await addRepo(null, { path: B, name: 'b', addedAt: at, status: 'ready', lastIndexed: at });
	const store = await getGraphStore();
	const a = repoIdOf(store, A);
	const b = repoIdOf(store, B);
	const row = (id: string, kind: UnresolvedRow['kind'], meta: Record<string, unknown>): UnresolvedRow => ({
		id, repoId: a, fromEntity: `e-${id}`, fromFile: `${A}/src/x.ts`, kind, rawTo: 'f', meta: { file: `${A}/src/x.ts`, repo: A, ...meta }, attemptedAt: 0,
	});
	await store.root.transaction(() => {
		for (const r of [
			row('u1', 'CALLS', {}),                                                       // no class: awaiting, unattempted
			row('u2', 'CALLS', {}),                                                       // no class: awaiting, unattempted
			row('u3', 'IMPORTS', { class: 'awaiting-target', reason: 'target-not-stored-yet' }),
			row('u4', 'CALLS', { class: 'ambiguous', candidates: ['x', 'y'] }),
			row('u5', 'INHERITS', { class: 'no-candidate' }),
			row('u6', 'CALLS_HTTP', {}),                                                  // boundary kind: external-endpoint
		]) store.unresolved.put(r.id, encodeUnresolvedRow(r));
		for (const { key } of store.indexState.getRange()) store.indexState.remove(key as Buffer);
		store.meta.put('schema_version', 4);
	});
	return { a, b };
}

test('a v4 store opened by this code is at the current version with one IndexStateRow per workspace repository, not complete, its pending counts recounted from the stored rows', async () => {
	const { a, b } = await seedV4();
	await closeGraphStore();

	const store = await getGraphStore();
	assert.equal(SCHEMA_VERSION, 6);
	assert.equal(store.meta.get('schema_version'), 6);

	const rows = stateRows(store);
	// Workspace repositories only: the reserved shared-modules rows get none.
	assert.deepEqual([...rows.keys()].sort((x, y) => x - y), [a, b].sort((x, y) => x - y));

	const ra = rows.get(a)!;
	assert.equal(ra.fullIndexFinished, false);
	assert.deepEqual(ra.pending, { 'awaiting-target': 3, 'ambiguous': 1, 'no-candidate': 1, 'external-endpoint': 1 });
	assert.deepEqual(ra.reasonCounts, { unwritable: {}, awaiting: { 'unattempted': 2, 'target-not-stored-yet': 1 } });
	assert.equal(ra.unwritable, 0);
	assert.equal(ra.generation, 0);
	assert.deepEqual(ra.uncommittedFiles, []);

	const rb = rows.get(b)!;
	assert.equal(rb.fullIndexFinished, false);
	assert.deepEqual(rb.pending, { 'awaiting-target': 0, 'ambiguous': 0, 'no-candidate': 0, 'external-endpoint': 0 });

	// The new sub-DBs are open and usable.
	store.unresolvedByTarget.getValues(Buffer.from('nothing'));
	store.exportNames.getValues(Buffer.from('nothing'));
});

test('a v4 -> v5 step that throws leaves the stored version at 4 and writes no IndexStateRow', async () => {
	await seedV4();
	const store = await getGraphStore();
	const throwing = { ...MIGRATION_V4_TO_V5, run: (s: GraphStore) => { MIGRATION_V4_TO_V5.run(s); throw new Error('boom'); } };
	await assert.rejects(runMigrations(store, 4, 5, [throwing]), /boom/);
	assert.equal(store.meta.get('schema_version'), 4);
	assert.equal(stateRows(store).size, 0);
	// The pending rows are untouched.
	assert.equal([...store.unresolved.getRange()].length, 6);
});

test('the registry keeps V1->V2, V2->V3 and V3->V4 in order and appends V4->V5', () => {
	assert.deepEqual(MIGRATIONS.map(m => `${m.from}->${m.to}`), ['1->2', '2->3', '3->4', '4->5', '5->6']);
	assert.equal(MIGRATIONS[3], MIGRATION_V4_TO_V5);
});

test('removing a repository after the migration leaves no index_state row for it', async () => {
	const { a, b } = await seedV4();
	await closeGraphStore();
	const store = await getGraphStore();
	assert.ok(store.indexState.get(encodeRepoKey(a)) !== undefined);
	const { removeRepo } = await import('../../repos.js');
	await removeRepo(null, A);
	assert.equal(store.indexState.get(encodeRepoKey(a)), undefined);
	assert.ok(store.indexState.get(encodeRepoKey(b)) !== undefined, 'the other repository keeps its row');
});
