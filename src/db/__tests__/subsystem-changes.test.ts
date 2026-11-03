/**
 * ISSUE-7d42b5dc S001 t1 -- the subsystem pass's changed-file record. Over a
 * real temporary store and real TypeScript and SQL files read by their readers
 * and committed as the indexer commits them: every change to a file's grouping
 * inputs records that file in the same transaction (the file commit, a
 * cross-file promotion, upsertRelations, deleteResolvedRelations, the SQL
 * re-check, the incoming sweep of a removed entity), a non-grouping kind
 * records nothing; entity-row removal records its file on every path; a
 * whole-repository delete drops the repository's contributions and record and
 * bumps its reset counter; an entry is consumed only while its stamp is
 * unchanged.
 *
 * Run: npx tsx --test src/db/__tests__/subsystem-changes.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { commitFile, deleteEntitiesById, deleteEntitiesForFile, deleteEntitiesForRepo } from '../entities.js';
import { deleteResolvedRelations, listUnresolvedRelations, promoteResolvedBatch, returnInferredSqlReferencesToPending, upsertRelations } from '../relations.js';
import { addRepo, lookupRepoId, removeRepo } from '../repos.js';
import { writeOfRelation } from '../file-commit.js';
import {
	consumeChangedFilesInTxn, readChangedFilesInTxn, readContributionsInTxn, readResetCounterInTxn,
	recordChangedFileInTxn, writeContributionInTxn,
} from '../subsystem-changes.js';
import { typescriptParser } from '../../indexer/parser/typescript.js';
import { sqlParser } from '../../indexer/parser/sql.js';
import { resolveRelations } from '../../indexer/resolver.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';
import type { Entity } from '../../shared/types.js';

useTemporaryLance();

let dir: string;
let repo: string;
let repoId: number;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-subsys-changes-')));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = join(dir, 'repo');
	mkdirSync(join(repo, 'src'), { recursive: true });
	await addRepo(null, { path: repo, name: 'subsys-changes', addedAt: '2026-11-03T00:00:00.000Z', status: 'ready' });
	repoId = (await lookupRepoId(repo))!;
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

/** Write `rel` with `text`, read it with its reader and commit it; returns its entities by name. */
async function save(rel: string, text: string): Promise<Map<string, Entity>> {
	const abs = join(repo, rel);
	writeFileSync(abs, text);
	const parser = rel.endsWith('.sql') ? sqlParser! : typescriptParser;
	const r = parser.parse(abs, readFileSync(abs, 'utf8'), repo, repoId);
	await commitFile({ repoPath: repo, filePath: abs, contentHash: `${rel}:${text.length}:${Date.now()}`, entities: r.entities, relations: resolveRelations(r.relations, abs, repo, r.entities).map(writeOfRelation) });
	return new Map(r.entities.map(e => [e.name, e]));
}
/** The recorded files, sorted. */
const recorded = async (): Promise<string[]> => readChangedFilesInTxn(await getGraphStore(), repoId).map(c => c.file).sort();
/** Consume the whole record (as a pass that published every file would). */
const clear = () => withWriteTxn(s => { consumeChangedFilesInTxn(s, repoId, readChangedFilesInTxn(s, repoId)); });

test('S001 t1: every change site records its source file in the same transaction, and a non-grouping kind records nothing', async () => {
	// The file commit records the committed file.
	const a = await save('src/a.ts', 'export function fa(): number { return 1; }\nexport function ga(): number { return 2; }\n');
	const b = await save('src/b.ts', 'export function fb(): number { return 0; }\n');
	assert.deepEqual(await recorded(), ['src/a.ts', 'src/b.ts']);
	await clear();
	assert.deepEqual(await recorded(), []);

	// upsertRelations: a grouping kind (CALLS) records its source's file; a non-grouping kind (DEFINES) does not.
	await upsertRelations(null, [{ kind: 'CALLS', from: b.get('fb')!.id, to: a.get('fa')!.id, resolved: true, evidence: 'inferred', meta: { repo } }]);
	assert.deepEqual(await recorded(), ['src/b.ts']);
	await clear();
	await upsertRelations(null, [{ kind: 'DEFINES', from: b.get('fb')!.id, to: a.get('ga')!.id, resolved: true, meta: { repo } }]);
	assert.deepEqual(await recorded(), [], 'DEFINES is not a grouping kind');

	// deleteResolvedRelations records the removed edge's source.
	await deleteResolvedRelations(null, [{ from: b.get('fb')!.id, kind: 'CALLS', to: a.get('fa')!.id }]);
	assert.deepEqual(await recorded(), ['src/b.ts']);
	await clear();

	// A cross-file promotion records the holder's file.
	await upsertRelations(null, [{ kind: 'CALLS', from: b.get('fb')!.id, to: 'ga', resolved: false, meta: { repo, file: join(repo, 'src/b.ts') } }]);
	await clear();
	const [row] = (await listUnresolvedRelations(null, repo)).filter(r => r.fromEntity === b.get('fb')!.id);
	assert.ok(row);
	await promoteResolvedBatch(null, [{ unresolved: row!, targetEntityId: a.get('ga')!.id, evidence: 'inferred' }]);
	assert.deepEqual(await recorded(), ['src/b.ts']);
	await clear();

	// The incoming sweep: a.ts drops ga, which b.ts calls; b.ts is recorded with a.ts.
	await save('src/a.ts', 'export function fa(): number { return 1; }\n');
	assert.deepEqual(await recorded(), ['src/a.ts', 'src/b.ts']);
	await clear();

	// The SQL re-check records the holder whose inferred edge it returns.
	assert.ok(sqlParser, 'the SQL reader is loaded');
	const t = await save('src/t.sql', 'CREATE TABLE app.ledger (id int);\n');
	const h = await save('src/h.sql', 'CREATE VIEW h AS SELECT * FROM ledger;\n');
	await upsertRelations(null, [{ kind: 'REFERENCES', from: h.get('h')!.id, to: t.get('app.ledger')!.id, resolved: true, evidence: 'inferred', meta: { repo } }]);
	await clear();
	assert.equal(await returnInferredSqlReferencesToPending(null, [t.get('app.ledger')!.id], new Set()), 1);
	assert.deepEqual(await recorded(), ['src/h.sql']);
});

test('S001 t1: entity-row removal records its file on every path, and a whole-repository delete drops the contributions and bumps the reset counter', async () => {
	const a = await save('src/a.ts', 'export function fa(): number { return 1; }\nexport function ga(): number { return 2; }\n');
	await save('src/c.ts', 'export function fc(): number { return 3; }\n');
	await save('src/d.ts', 'export function fd(): number { return 4; }\n');
	await clear();

	// deleteEntitiesById (detachDeleteEntities): an isolated entity with no edges.
	await deleteEntitiesById(null, [a.get('ga')!.id]);
	assert.deepEqual(await recorded(), ['src/a.ts']);
	await clear();
	// deleteEntitiesForFile.
	await deleteEntitiesForFile(null, join(repo, 'src/c.ts'));
	assert.deepEqual(await recorded(), ['src/c.ts']);
	await clear();
	// commitFile removing every entity of a file (a deleted file): the file is recorded once, one stamp.
	await save('src/d.ts', 'export function fd(): number { return 4; }\nexport function gd(): number { return 5; }\nexport class Kd { m(): void {} }\n');
	await clear();
	const stamp = async () => readChangedFilesInTxn(await getGraphStore(), repoId).find(c => c.file === 'src/d.ts')?.stamp;
	await withWriteTxn(w => recordChangedFileInTxn(w, repoId, 'src/probe.ts'));
	const probe = readChangedFilesInTxn(await getGraphStore(), repoId).find(c => c.file === 'src/probe.ts')!.stamp;
	await commitFile({ repoPath: repo, filePath: join(repo, 'src/d.ts'), contentHash: null, entities: [], relations: [] });
	assert.deepEqual(await recorded(), ['src/d.ts', 'src/probe.ts']);
	assert.equal(await stamp(), probe + 1n, 'one stamp for the commit, however many entities it removed');
	await clear();

	// deleteEntitiesForRepo: the contributions and the record go, the reset counter goes up.
	const s = await getGraphStore();
	await withWriteTxn(w => {
		writeContributionInTxn(w, repoId, 'src/a.ts', { entityCount: 1, out: [] });
		recordChangedFileInTxn(w, repoId, 'src/a.ts');
	});
	const before = readResetCounterInTxn(s, repoId);
	await deleteEntitiesForRepo(null, repo);
	assert.deepEqual([...readContributionsInTxn(s, repoId).keys()], []);
	assert.deepEqual(await recorded(), [], 'the removals the delete made are dropped with it');
	assert.equal(readResetCounterInTxn(s, repoId), before + 1n);
	// With no entities left the delete still resets.
	await deleteEntitiesForRepo(null, repo);
	assert.equal(readResetCounterInTxn(s, repoId), before + 2n);

	// Removing the repository removes both tables' rows, its reset counter included.
	await withWriteTxn(w => { writeContributionInTxn(w, repoId, 'src/x.ts', { entityCount: 1, out: [] }); recordChangedFileInTxn(w, repoId, 'src/x.ts'); });
	await removeRepo(null, repo);
	assert.deepEqual([...readContributionsInTxn(s, repoId).keys()], []);
	assert.deepEqual(readChangedFilesInTxn(s, repoId), []);
	assert.equal(readResetCounterInTxn(s, repoId), 0n);
});

test('S001 t1: a record entry is consumed only while its stamp is unchanged', async () => {
	await save('src/a.ts', 'export function fa(): number { return 1; }\n');
	const s = await getGraphStore();
	const read = readChangedFilesInTxn(s, repoId);
	assert.deepEqual(read.map(c => c.file), ['src/a.ts']);

	// The file changes again after the pass read it: its stamp moves on, and the consume keeps it.
	await save('src/a.ts', 'export function fa(): number { return 2; }\n');
	assert.ok(readChangedFilesInTxn(s, repoId)[0]!.stamp > read[0]!.stamp, 'every write takes the next stamp');
	assert.equal(await withWriteTxn(w => consumeChangedFilesInTxn(w, repoId, read)), 0);
	assert.deepEqual(await recorded(), ['src/a.ts']);

	// Consumed with the stamp that is there now.
	assert.equal(await withWriteTxn(w => consumeChangedFilesInTxn(w, repoId, readChangedFilesInTxn(w, repoId))), 1);
	assert.deepEqual(await recorded(), []);
	// Another repository's record is not touched by this one's consume.
	await addRepo(null, { path: join(dir, 'other'), name: 'other', addedAt: '2026-11-03T00:00:00.000Z', status: 'ready' });
	const other = (await lookupRepoId(join(dir, 'other')))!;
	await withWriteTxn(w => recordChangedFileInTxn(w, other, 'x.ts'));
	await clear();
	assert.deepEqual(readChangedFilesInTxn(s, other).map(c => c.file), ['x.ts']);
});
