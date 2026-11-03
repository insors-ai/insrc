/**
 * ISSUE-0f3376a0 S001 -- SQL references across files under the SQL name rule.
 * Over a real temporary store, real .sql text read by the registered SQL
 * reader, files committed as the indexer commits them, and the real
 * cross-file pass.
 *
 *  - t2: qualified names meet by segment suffix (db.app.users and app.users
 *    both ways; audit.users never a bare users; several stay ambiguous), and
 *    quoted names resolve to their own definitions; a removed definition's
 *    references return to pending by key or folded text, never for a name the
 *    holder's own file defines, and carry the re-pend marker.
 *
 * Run: npx tsx --test src/indexer/__tests__/sql-name-resolution.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { commitFile, entityU64ForId, upsertEntities } from '../../db/entities.js';
import { listUnresolvedRelations, SQL_REPEND_MARKER, upsertRelations } from '../../db/relations.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, EntityKind } from '../../shared/types.js';
import { sqlParser } from '../parser/sql.js';
import { makeEntityId } from '../parser/base.js';
import { resolveRelations } from '../resolver.js';
import { writeOfRelation } from '../../db/file-commit.js';
import { runCrossFileResolver, type CrossFileMode } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;
let repo: string;
let repoId: number;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-sql-names-')));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = join(dir, 'repo');
	mkdirSync(join(repo, 'db'), { recursive: true });
	await addRepo(null, { path: repo, name: 'sql-names', addedAt: '2026-11-03T00:00:00.000Z', status: 'ready' });
	repoId = (await lookupRepoId(repo))!;
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

assert.ok(sqlParser, 'the SQL reader is loaded');
const at = (rel: string) => join(repo, rel);
let saves = 0;

/** Read `sql` as file `rel` with the SQL reader and commit it as the indexer does; returns its tables/views by name. */
async function save(rel: string, sql: string): Promise<Map<string, Entity>> {
	const file = at(rel);
	const r = sqlParser!.parse(file, sql, repo, repoId);
	await commitFile({ repoPath: repo, filePath: file, contentHash: `${rel}#${++saves}`, entities: r.entities, relations: resolveRelations(r.relations, file, repo, r.entities).map(writeOfRelation) });
	return new Map(r.entities.filter(e => e.kind === 'table' || e.kind === 'view').map(e => [e.name, e]));
}
/** A definition stored as the reader stored it BEFORE the name rule (unquoted name, so "Users" as Users). */
async function legacy(rel: string, kind: EntityKind, name: string, body: string): Promise<Entity> {
	const file = at(rel);
	const base = { language: 'sql' as const, repoId, repo, file, startLine: 1, endLine: 1, embedding: [], indexedAt: '2026-11-03T00:00:00.000Z' };
	const e: Entity = { ...base, id: makeEntityId(repo, file, kind, name), kind, name, body, isExported: true, signature: `${kind} ${name}` };
	await upsertEntities(null, [{ ...base, id: makeEntityId(repo, file, 'file', file), kind: 'file', name: rel, body: '' }, e]);
	return e;
}
const pass = (mode: CrossFileMode = 'full', committedFiles?: string[]) =>
	runCrossFileResolver({ db: null as unknown as DbClient, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode, ...(committedFiles !== undefined && { committedFiles: committedFiles.map(at) }) });
/** The REFERENCES edges `from` holds, as `<target name>@<file>: <evidence>`. */
async function edges(from: Entity, ...targets: Map<string, Entity>[]): Promise<string[]> {
	const byU64 = new Map<number, string>();
	for (const m of targets) for (const e of m.values()) byU64.set((await entityU64ForId(e.id))!, `${e.name}@${e.file.slice(repo.length + 1)}`);
	return (await outNeighbors((await entityU64ForId(from.id))!, { kindFilter: ['REFERENCES'], withEvidence: true }))
		.map(n => `${byU64.get(n.u64) ?? '?'}: ${n.evidence}`).sort();
}
const pendingOf = async (from: Entity) => (await listUnresolvedRelations(null, repo)).filter(r => r.fromEntity === from.id);
const classes = async (from: Entity) => (await pendingOf(from)).map(r => `${r.rawTo}: ${String(r.meta['class'])}`).sort();

test('S001 t2: qualified names meet by segment suffix and quoted names resolve to their own definitions', async () => {
	const defs = await save('db/defs.sql', [
		'CREATE TABLE app.users (id int);',
		'CREATE TABLE db.app.orders (id int);',
		'CREATE TABLE "Ledger" (id int);',
		'CREATE TABLE ledger (id int);',
		'CREATE TABLE app.items (id int);',
		'CREATE TABLE audit.items (id int);',
		'CREATE TABLE logs (id int);',
	].join('\n'));
	const v = await save('db/v.sql', [
		'CREATE VIEW q1 AS SELECT * FROM db.app.users;',     // longer reference, qualified definition
		'CREATE VIEW q2 AS SELECT * FROM app.orders;',       // shorter reference, longer definition
		'CREATE VIEW q3 AS SELECT * FROM users;',            // bare reference, qualified definition
		'CREATE VIEW q4 AS SELECT * FROM "Ledger";',         // quoted: only "Ledger"
		'CREATE VIEW q5 AS SELECT * FROM LEDGER JOIN `Ledger` ON true;',   // folded: only ledger
		'CREATE VIEW q6 AS SELECT * FROM items;',            // two qualified definitions
		'CREATE VIEW q7 AS SELECT * FROM audit.logs;',       // a bare definition is in no schema
		'CREATE VIEW q8 AS SELECT * FROM other.users;',      // a differing schema never meets
	].join('\n'));
	await pass();

	const q = (n: string) => v.get(n)!;
	assert.deepEqual(await edges(q('q1'), defs), ['app.users@db/defs.sql: inferred']);
	assert.deepEqual(await edges(q('q2'), defs), ['db.app.orders@db/defs.sql: inferred']);
	assert.deepEqual(await edges(q('q3'), defs), ['app.users@db/defs.sql: inferred']);
	assert.deepEqual(await edges(q('q4'), defs), ['"Ledger"@db/defs.sql: inferred']);
	assert.deepEqual(await edges(q('q5'), defs), ['ledger@db/defs.sql: inferred'], 'one reference per key, to the unquoted ledger');
	assert.deepEqual(await edges(q('q6'), defs), []);
	const [items] = await pendingOf(q('q6'));
	assert.equal(items?.meta['class'], 'ambiguous');
	assert.deepEqual([...(items?.meta['candidates'] as string[])].sort(), [defs.get('app.items')!.id, defs.get('audit.items')!.id].sort());
	assert.deepEqual(await classes(q('q7')), ['audit.logs: no-candidate'], 'audit.logs does not meet the bare logs');
	assert.deepEqual(await classes(q('q8')), ['other.users: no-candidate']);

	// A definition stored before the rule (unquoted, "Refunds" as Refunds) meets references by its folded key, as before.
	const old = await legacy('db/old.sql', 'table', 'Refunds', 'CREATE TABLE "Refunds" (id int);');
	const w = await save('db/w.sql', 'CREATE VIEW w AS SELECT * FROM REFUNDS;');
	await pass();
	assert.deepEqual(await edges(w.get('w')!, new Map([['Refunds', old]])), ['Refunds@db/old.sql: inferred']);
});

test('S001 t2: a removed definition\'s references return to pending by folded-or-key match, never for a locally defined name, and carry the marker', async () => {
	// By key: db.app.users met app.users by suffix, a match the old comparison never made.
	await save('db/defs.sql', 'CREATE TABLE app.users (id int);\nCREATE TABLE app.orders (id int);');
	const v = await save('db/v.sql', 'CREATE VIEW q AS SELECT * FROM db.app.users;');
	// Mixed ownership: orders is this file's own table (linked by the reader), app.orders another file's.
	const x = await save('db/x.sql', 'CREATE TABLE orders (id int);\nCREATE VIEW xv AS SELECT * FROM orders JOIN app.orders ON true;');
	await pass();
	assert.equal((await edges(v.get('q')!)).length, 1);
	assert.equal((await edges(x.get('xv')!)).length, 2);

	await save('db/defs.sql', '-- both tables removed\n');
	const [q] = await pendingOf(v.get('q')!);
	assert.deepEqual([q?.rawTo, q?.meta['awaitsId'], q?.meta[SQL_REPEND_MARKER]], ['db.app.users', undefined, true], 'by name, marked');
	const xv = await pendingOf(x.get('xv')!);
	assert.deepEqual(xv.map(r => [r.rawTo, r.meta[SQL_REPEND_MARKER]]), [['app.orders', true]], 'orders is answered in x.sql, so it is not returned');
	assert.deepEqual(await edges(x.get('xv')!, x), ['orders@db/x.sql: extracted'], 'the local edge is kept');

	// By folded text: "Users" stored before the rule as Users, linked from "Users"; its file read again now.
	const old = await legacy('db/old.sql', 'table', 'Users', 'CREATE TABLE "Users" (id int);');
	const h = await save('db/h.sql', 'CREATE VIEW h AS SELECT * FROM "Users";');
	await upsertRelations(null, [{ kind: 'REFERENCES', from: h.get('h')!.id, to: old.id, resolved: true, meta: { repo, file: at('db/h.sql') } }]);
	assert.equal((await edges(h.get('h')!)).length, 1);
	const now = await save('db/old.sql', 'CREATE TABLE "Users" (id int);');
	assert.ok(now.has('"Users"') && now.get('"Users"')!.id !== old.id, 'the definition gets its quoted name and a new id');
	const [hr] = await pendingOf(h.get('h')!);
	assert.deepEqual([hr?.rawTo, hr?.meta[SQL_REPEND_MARKER]], ['"Users"', true], 'the key differs, the folded text meets');
	await pass('settle', ['db/old.sql']);
	assert.deepEqual(await edges(h.get('h')!, now), ['"Users"@db/old.sql: inferred'], 're-resolved by key');

	// By key where the folded text cannot be read: a quoted name holding a delimiter ("x[y" folds to x[y, an open bracket).
	await save('db/k.sql', 'CREATE TABLE app."x[y" (id int);');
	const kh = await save('db/kh.sql', 'CREATE VIEW kh AS SELECT * FROM "x[y";');
	await pass();
	assert.equal((await edges(kh.get('kh')!)).length, 1, '"x[y" meets app."x[y"');
	await save('db/k.sql', '-- gone\n');
	assert.deepEqual((await pendingOf(kh.get('kh')!)).map(r => [r.rawTo, r.meta[SQL_REPEND_MARKER]]), [['"x[y"', true]]);

	// A name that cannot mean the removed target is not returned: the edge awaits the id, as before.
	await save('db/p.sql', 'CREATE TABLE app.payments (id int);');
	const y = await save('db/y.sql', 'CREATE VIEW y AS SELECT * FROM audit.payments;');
	const pay = (await save('db/p.sql', 'CREATE TABLE app.payments (id int);')).get('app.payments')!;
	await upsertRelations(null, [{ kind: 'REFERENCES', from: y.get('y')!.id, to: pay.id, resolved: true, meta: { repo, file: at('db/y.sql') } }]);
	await save('db/p.sql', '-- gone\n');
	const yr = (await pendingOf(y.get('y')!)).map(r => [r.rawTo, r.meta['awaitsId'] === true, r.meta[SQL_REPEND_MARKER]]);
	assert.deepEqual(yr.filter(([raw]) => raw === pay.id), [[pay.id, true, undefined]], 'audit.payments does not meet app.payments');
});
