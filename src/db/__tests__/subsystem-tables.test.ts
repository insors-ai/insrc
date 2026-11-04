/**
 * Epic c2ba6fa6, Story s8, t1 -- the subsystem tables and schema 8. Over a
 * real temporary store: a v7 store opens at version 8 with the two tables and
 * its rows unchanged, and a fresh store has them; a write replaces a
 * repository's set in one transaction, stamped with the generation, and a
 * subsystem whose id was stored keeps its summary; readSubsystems returns a
 * repository's set, or the subsystems holding given files, and nothing of
 * another repository; a write that fails part-way leaves the previous set;
 * removing a repository removes its subsystem rows and no other repository's.
 *
 * Run: npx tsx --test src/db/__tests__/subsystem-tables.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, SCHEMA_VERSION, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { encodeRepoKey } from '../graph/keys.js';
import { encodeSubsystemRow } from '../graph/codec.js';
import { addRepo, lookupRepoId, removeRepo } from '../repos.js';
import { readSubsystems, writeSubsystems, type SubsystemGroupRow } from '../subsystems.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const A = '/repo/a';
const B = '/repo/b';
let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-s8-tables-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	for (const path of [A, B]) await addRepo(null, { path, name: path, addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const group = (id: string, files: string[], extra: Partial<SubsystemGroupRow> = {}): SubsystemGroupRow =>
	({ id, name: id, files, entityCount: files.length, connections: [], ...extra });
const ids = (s: { subsystems: readonly { id: string }[] }) => s.subsystems.map(x => x.id).sort();

test('s8 t1: a v7 store opens at version 8 with the subsystem tables and its rows unchanged; a fresh store has them', async () => {
	assert.ok(SCHEMA_VERSION >= 8);
	let store = await getGraphStore();
	assert.ok(store.subsystem && store.subsystemByFile, 'a fresh store has both tables');
	const repoId = (await lookupRepoId(A))!;
	await withWriteTxn(s => { s.meta.put('schema_version', 7); });
	await closeGraphStore();

	store = await getGraphStore();
	assert.equal(store.meta.get('schema_version'), SCHEMA_VERSION);
	assert.equal(await lookupRepoId(A), repoId, 'the existing repository row is unchanged');
	assert.deepEqual(await readSubsystems(A), { computedAtGeneration: null, subsystems: [] }, 'no subsystems until a pass');
});

test('s8 t1: a write replaces the set in one transaction, stamped with the generation; a subsystem whose id was stored keeps its summary', async () => {
	await writeSubsystems(A, 3, [group('s1', ['src/a.ts']), group('s2', ['src/b.ts', 'src/c.ts'], { connections: [{ to: 's1', weight: 2, kinds: { CALLS: 2 } }] })]);
	const repoId = (await lookupRepoId(A))!;
	// A summary as the pass's summary step would write it onto s1.
	await withWriteTxn(s => {
		s.subsystem.put(Buffer.concat([encodeRepoKey(repoId), Buffer.from('s1')]),
			encodeSubsystemRow({ ...group('s1', ['src/a.ts']), summary: 'parses input', summaryModel: 'cheap', computedAtGeneration: 3 }));
	});

	await writeSubsystems(A, 4, [group('s1', ['src/a.ts']), group('s3', ['src/b.ts']), group('s4', ['src/c.ts'])]);

	const stored = await readSubsystems(A);
	assert.equal(stored.computedAtGeneration, 4);
	assert.deepEqual(ids(stored), ['s1', 's3', 's4'], 's2 is gone: the set is replaced');
	const by = new Map(stored.subsystems.map(s => [s.id, s]));
	assert.equal(by.get('s1')?.summary, 'parses input', 'an unchanged id keeps its summary');
	assert.equal(by.get('s3')?.summary, null);
	assert.deepEqual(ids(await readSubsystems(A, { files: ['src/b.ts'] })), ['s3'], 'the file index was replaced too');

	await writeSubsystems(A, 5, [group('s1', ['src/a.ts'])]);
	const store = await getGraphStore();
	const fileRows = [...store.subsystemByFile.getRange({ start: encodeRepoKey(repoId), end: encodeRepoKey(repoId + 1) })]
		.map(({ key }) => (key as Buffer).subarray(4).toString('utf8'));
	assert.deepEqual(fileRows, ['src/a.ts'], 'no file row of a removed subsystem is left behind');
});

test('s8 t1: readSubsystems returns a repository set or the subsystems holding the given files, and nothing of another repository', async () => {
	await writeSubsystems(A, 1, [group('a1', ['src/x.ts', 'src/y.ts']), group('a2', ['lib/z.ts'])]);
	await writeSubsystems(B, 7, [group('b1', ['src/x.ts'])]);

	assert.deepEqual(ids(await readSubsystems(A)), ['a1', 'a2']);
	assert.deepEqual(ids(await readSubsystems(B)), ['b1']);
	assert.deepEqual(ids(await readSubsystems(A, { files: [join(A, 'lib/z.ts')] })), ['a2'], 'an absolute path is read relative to the repository');
	assert.deepEqual(ids(await readSubsystems(A, { files: ['src/y.ts', 'nowhere.ts'] })), ['a1']);
	assert.equal((await readSubsystems(B)).computedAtGeneration, 7);
	assert.deepEqual(await readSubsystems('/repo/unregistered'), { computedAtGeneration: null, subsystems: [] });
});

test('s8 t1: a write that fails part-way leaves the previous set intact', async () => {
	await writeSubsystems(A, 1, [group('old', ['src/a.ts'])]);
	const failing = group('bad', ['src/b.ts']);
	Object.defineProperty(failing, 'files', { get() { throw new Error('a group that cannot be read'); } });

	await assert.rejects(writeSubsystems(A, 2, [group('new', ['src/c.ts']), failing]), /cannot be read/);

	const stored = await readSubsystems(A);
	assert.equal(stored.computedAtGeneration, 1);
	assert.deepEqual(ids(stored), ['old']);
	assert.deepEqual(ids(await readSubsystems(A, { files: ['src/a.ts'] })), ['old']);
	assert.deepEqual(ids(await readSubsystems(A, { files: ['src/c.ts'] })), [], 'nothing of the failed write remains');
});

test("s8 t1: removing a repository removes its subsystem rows and keeps another repository's", async () => {
	await writeSubsystems(A, 1, [group('a1', ['src/x.ts', 'src/y.ts'])]);
	await writeSubsystems(B, 1, [group('b1', ['lib/z.ts'])]);
	const repoId = (await lookupRepoId(A))!;
	await removeRepo(null, A);

	const store = await getGraphStore();
	const range = { start: encodeRepoKey(repoId), end: encodeRepoKey(repoId + 1) };
	assert.equal([...store.subsystem.getRange(range)].length, 0, 'no subsystem row of the removed repository');
	assert.equal([...store.subsystemByFile.getRange(range)].length, 0, 'no file row of the removed repository');
	assert.deepEqual(ids(await readSubsystems(B)), ['b1'], "the other repository's set is kept");
	assert.deepEqual(ids(await readSubsystems(B, { files: ['lib/z.ts'] })), ['b1']);
});
