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
 *  - t3: a settle re-attempts only the pending SQL references its files can
 *    affect (observed as the rows it selects), and a re-pended row's marker
 *    is consumed by the next settle whatever its outcome.
 *  - t4: a settle re-checks the inferred edges into every definition whose
 *    last segment folds to that of a saved one: a new candidate makes them
 *    ambiguous, quote-only and segment-boundary edits re-decide them, a
 *    legacy store is corrected when only its definition file is read again,
 *    and a name the holder's own file answers is never returned.
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
import { listUnresolvedRelations, returnInferredSqlReferencesToPending, SQL_REPEND_MARKER, upsertRelations } from '../../db/relations.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, EntityKind } from '../../shared/types.js';
import { sqlParser } from '../parser/sql.js';
import { makeEntityId } from '../parser/base.js';
import { resolveRelations } from '../resolver.js';
import { writeOfRelation } from '../../db/file-commit.js';
import { runCrossFileResolver, sqlReferencesForSettle, type CrossFileMode } from '../cross-file-resolver.js';
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
/** The rawTo of the rows a settle for `files` would re-attempt beyond their own, as `<view> <rawTo>`. */
async function selected(files: string[], ...holders: Map<string, Entity>[]): Promise<string[]> {
	const names = new Map<string, string>();
	for (const m of holders) for (const e of m.values()) names.set(e.id, e.name);
	const rows = await sqlReferencesForSettle({ db: null as unknown as DbClient, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: files.map(at) });
	return rows.map(r => `${names.get(r.fromEntity) ?? '?'} ${r.rawTo}`).sort();
}
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

test('S001 t3: a settle selects only the pending SQL rows the saved files can affect', async () => {
	await save('db/a.sql', 'CREATE TABLE app.users (id int);');
	await save('db/b.sql', 'CREATE TABLE b.items (id int);');
	await save('db/c.sql', 'CREATE TABLE c.items (id int);');
	const v = await save('db/v.sql', [
		'CREATE VIEW r1 AS SELECT * FROM ledger;',
		'CREATE VIEW r2 AS SELECT * FROM unrelated;',
		'CREATE VIEW r3 AS SELECT * FROM items;',
		'CREATE VIEW r4 AS SELECT * FROM users;',
		'CREATE VIEW r5 AS SELECT * FROM app."Ledger";',
	].join('\n'));
	await pass();
	assert.deepEqual(await classes(v.get('r3')!), ['items: ambiguous']);
	assert.equal((await edges(v.get('r4')!)).length, 1);

	// A new definition selects only the rows with its last-segment key: "Ledger" selects app."Ledger", not ledger.
	await save('db/q.sql', 'CREATE TABLE "Ledger" (id int);');
	assert.deepEqual(await selected(['db/q.sql'], v), ['r5 app."Ledger"']);
	await save('db/l.sql', 'CREATE TABLE app.ledger (id int);');
	assert.deepEqual(await selected(['db/l.sql'], v), ['r1 ledger']);
	// A removed candidate selects the ambiguous row it was a candidate of.
	await save('db/c.sql', '-- items moved out\n');
	assert.deepEqual(await selected(['db/c.sql'], v), ['r3 items']);
	// A removed definition's re-pended (marked) reference is selected by any SQL settle -- as is r3,
	// whose removed candidate holds until a settle re-attempts it.
	await save('db/a.sql', '-- users removed\n');
	assert.deepEqual(await selected(['db/a.sql'], v), ['r3 items', 'r4 users']);
	assert.deepEqual(await selected(['db/l.sql'], v), ['r1 ledger', 'r3 items', 'r4 users']);
	// No SQL file committed: no SQL reference is read.
	assert.deepEqual(await selected(['src/a.ts'], v), []);

	// The settle itself attempts exactly those: r2 keeps the attempt time it had.
	const before = (await pendingOf(v.get('r2')!))[0]!.attemptedAt;
	await pass('settle', ['db/l.sql', 'db/c.sql', 'db/a.sql']);
	assert.deepEqual(await edges(v.get('r1')!, await save('db/l.sql', 'CREATE TABLE app.ledger (id int);')), ['app.ledger@db/l.sql: inferred']);
	assert.deepEqual(await classes(v.get('r3')!), [], 'one candidate left: resolved');
	assert.deepEqual(await classes(v.get('r4')!), ['users: no-candidate']);
	assert.equal((await pendingOf(v.get('r2')!))[0]!.attemptedAt, before, 'the unrelated row was not re-attempted');
});

test('S001 t3: the re-pend marker is consumed by the next settle, so an unrelated later save does not retry the row', async () => {
	await save('db/defs.sql', 'CREATE TABLE app.users (id int);\nCREATE TABLE app.orders (id int);');
	const v = await save('db/v.sql', 'CREATE VIEW n AS SELECT * FROM users;\nCREATE VIEW m AS SELECT * FROM orders;');
	await pass();
	await save('db/defs.sql', '-- both removed\n');
	// Two more definitions of orders appear with the removal: m's outcome is ambiguous, n's no-candidate.
	await save('db/x.sql', 'CREATE TABLE x.orders (id int);');
	await save('db/y.sql', 'CREATE TABLE y.orders (id int);');
	const marked = async () => (await listUnresolvedRelations(null, repo)).filter(r => r.meta[SQL_REPEND_MARKER] === true).map(r => r.rawTo).sort();
	assert.deepEqual(await marked(), ['orders', 'users']);

	await pass('settle', ['db/defs.sql', 'db/x.sql', 'db/y.sql']);
	assert.deepEqual(await classes(v.get('n')!), ['users: no-candidate']);
	assert.deepEqual(await classes(v.get('m')!), ['orders: ambiguous']);
	assert.deepEqual(await marked(), [], 'cleared whatever the outcome');

	// An unrelated later save selects neither row, and its settle leaves them as they were.
	await save('db/z.sql', 'CREATE TABLE zz (id int);');
	assert.deepEqual(await selected(['db/z.sql'], v), []);
	const before = (await listUnresolvedRelations(null, repo)).map(r => [r.rawTo, r.attemptedAt]).sort();
	await pass('settle', ['db/z.sql']);
	assert.deepEqual((await listUnresolvedRelations(null, repo)).map(r => [r.rawTo, r.attemptedAt]).sort(), before);
});

/** An inferred edge as the cross-file pass writes one (the store holding a reference from before the rule). */
const inferredEdge = (from: Entity, to: Entity) =>
	upsertRelations(null, [{ kind: 'REFERENCES', from: from.id, to: to.id, resolved: true, evidence: 'inferred', meta: { repo, file: from.file } }]);

test('S001 t4: a saved definition re-checks same-named inferred edges, including quote-only and segment-boundary edits', async () => {
	const a = await save('db/a.sql', 'CREATE TABLE app.users (id int);\nCREATE TABLE orders (id int);\nCREATE TABLE Pay (id int);\nCREATE TABLE s.t (id int);');
	const v = await save('db/v.sql', [
		'CREATE VIEW vu AS SELECT * FROM users;',
		'CREATE VIEW vo AS SELECT * FROM orders;',
		'CREATE VIEW vp AS SELECT * FROM Pay;',
		'CREATE VIEW vs AS SELECT * FROM s.t;',
	].join('\n'));
	await pass();
	for (const n of ['vu', 'vo', 'vp', 'vs']) assert.equal((await edges(v.get(n)!)).length, 1, `${n} is linked`);

	// A second candidate: users becomes ambiguous; orders, a different name, keeps its edge.
	const b = await save('db/b.sql', 'CREATE TABLE audit.users (id int);');
	await pass('settle', ['db/b.sql']);
	assert.deepEqual(await edges(v.get('vu')!), [], 'no edge is kept to a guess');
	const [vu] = await pendingOf(v.get('vu')!);
	assert.equal(vu?.meta['class'], 'ambiguous');
	assert.deepEqual([...(vu?.meta['candidates'] as string[])].sort(), [a.get('app.users')!.id, b.get('audit.users')!.id].sort());
	assert.equal(vu?.meta[SQL_REPEND_MARKER], undefined, 'the marker is consumed');
	assert.deepEqual(await edges(v.get('vo')!, a), ['orders@db/a.sql: inferred']);

	// A quoted second candidate: "Ledger" linked to the bare "Ledger", then app."Ledger" is declared.
	const ql = await save('db/ql.sql', 'CREATE TABLE "Ledger" (id int);');
	const qv = await save('db/qv.sql', 'CREATE VIEW qv AS SELECT * FROM "Ledger";');
	await pass('settle', ['db/ql.sql', 'db/qv.sql']);
	assert.deepEqual(await edges(qv.get('qv')!, ql), ['"Ledger"@db/ql.sql: inferred']);
	await save('db/ql2.sql', 'CREATE TABLE app."Ledger" (id int);');
	await pass('settle', ['db/ql2.sql']);
	assert.deepEqual(await classes(qv.get('qv')!), ['"Ledger": ambiguous']);

	// A quote-only edit (Pay -> "Pay") and a segment-boundary edit (s.t -> "s.t"): the old edges are re-decided.
	await save('db/a.sql', 'CREATE TABLE app.users (id int);\nCREATE TABLE orders (id int);\nCREATE TABLE "Pay" (id int);\nCREATE TABLE "s.t" (id int);');
	await pass('settle', ['db/a.sql']);
	assert.deepEqual(await edges(v.get('vp')!), []);
	assert.deepEqual(await classes(v.get('vp')!), ['Pay: no-candidate'], 'Pay is not the case-sensitive "Pay"');
	assert.deepEqual(await edges(v.get('vs')!), []);
	assert.deepEqual(await classes(v.get('vs')!), ['s.t: no-candidate'], 's.t is not the single name "s.t"');
	assert.deepEqual(await edges(v.get('vo')!, a), ['orders@db/a.sql: inferred'], 'a re-checked edge that still has one candidate re-resolves');
});

test('S001 t4: upgrade, legacy-collision and mixed-ownership cases resolve correctly', async () => {
	// Upgrade: "Accounts" stored before the rule as Accounts, linked from "Accounts"; only its file is read again.
	const oldAcc = await legacy('db/acc.sql', 'table', 'Accounts', 'CREATE TABLE "Accounts" (id int);');
	const u = await save('db/u.sql', 'CREATE VIEW u AS SELECT * FROM "Accounts";');
	await inferredEdge(u.get('u')!, oldAcc);
	const acc = await save('db/acc.sql', 'CREATE TABLE "Accounts" (id int);');
	await pass('settle', ['db/acc.sql']);
	assert.deepEqual(await edges(u.get('u')!, acc), ['"Accounts"@db/acc.sql: inferred']);
	assert.deepEqual(await pendingOf(u.get('u')!), []);

	// Legacy collision: one file declared Users and "Users", stored before the rule as one entity Users; an
	// external "Users" reference was linked to it. Re-read, the file keeps Users (same id) and adds "Users".
	const oldUsers = await legacy('db/users.sql', 'table', 'Users', 'CREATE TABLE Users (id int);');
	const ext = await save('db/ext.sql', 'CREATE VIEW ext AS SELECT * FROM "Users";\nCREATE VIEW plain AS SELECT * FROM users;');
	await inferredEdge(ext.get('ext')!, oldUsers);
	await inferredEdge(ext.get('plain')!, oldUsers);
	const users = await save('db/users.sql', 'CREATE TABLE Users (id int);\nCREATE TABLE "Users" (id int);');
	assert.equal(users.get('Users')!.id, oldUsers.id, 'the unquoted definition keeps its id, so no removal re-pends its edges');
	await pass('settle', ['db/users.sql']);
	assert.deepEqual(await edges(ext.get('ext')!, users), ['"Users"@db/users.sql: inferred'], '"Users" moves to its own definition');
	assert.deepEqual(await edges(ext.get('plain')!, users), ['Users@db/users.sql: inferred'], 'users stays with Users');

	// A legacy definition in a file NOT read again: "Ledger" stored as Ledger in old.sql; "Ledger" is now declared
	// in new.sql. The edge from "Ledger" to the lossy Ledger is grouped by the folded name and re-decided by key.
	const lossy = await legacy('db/oldl.sql', 'table', 'Ledger', 'CREATE TABLE "Ledger" (id int);');
	const lr = await save('db/lr.sql', 'CREATE VIEW lr AS SELECT * FROM "Ledger";');
	await inferredEdge(lr.get('lr')!, lossy);
	const fresh = await save('db/newl.sql', 'CREATE TABLE "Ledger" (id int);');
	await pass('settle', ['db/newl.sql']);
	assert.deepEqual(await edges(lr.get('lr')!, fresh, new Map([['Ledger', lossy]])), ['"Ledger"@db/newl.sql: inferred']);

	// Mixed ownership: mv reads its own file's orders (linked by the reader) and another file's app.orders.
	const defs = await save('db/defs.sql', 'CREATE TABLE app.orders (id int);');
	const m = await save('db/m.sql', 'CREATE TABLE orders (id int);\nCREATE VIEW mv AS SELECT * FROM orders JOIN app.orders ON true;');
	await pass();
	assert.deepEqual(await edges(m.get('mv')!, m, defs), ['app.orders@db/defs.sql: inferred', 'orders@db/m.sql: extracted']);
	await save('db/n.sql', 'CREATE TABLE x.orders (id int);');
	await pass('settle', ['db/n.sql']);
	assert.deepEqual(await pendingOf(m.get('mv')!), [], 'no pending row for the locally answered orders');
	assert.deepEqual(await edges(m.get('mv')!, m, defs), ['app.orders@db/defs.sql: inferred', 'orders@db/m.sql: extracted']);
});

test('S001 t4: the store re-check returns only inferred edges, and never one of an excluded holder', async () => {
	const t = await save('db/t.sql', 'CREATE TABLE app.ledger (id int);');
	const h = await save('db/h.sql', 'CREATE VIEW h1 AS SELECT * FROM ledger;\nCREATE VIEW h2 AS SELECT * FROM ledger;\nCREATE VIEW h3 AS SELECT * FROM ledger;');
	const target = t.get('app.ledger')!;
	await inferredEdge(h.get('h1')!, target);
	await inferredEdge(h.get('h2')!, target);
	await upsertRelations(null, [{ kind: 'REFERENCES', from: h.get('h3')!.id, to: target.id, resolved: true, evidence: 'extracted', meta: { repo, file: at('db/h.sql') } }]);

	assert.equal(await returnInferredSqlReferencesToPending(null, [target.id], new Set([h.get('h2')!.id])), 1);
	assert.deepEqual((await pendingOf(h.get('h1')!)).map(r => [r.rawTo, r.meta[SQL_REPEND_MARKER]]), [['ledger', true]], 'the inferred edge returns, marked');
	assert.deepEqual(await edges(h.get('h1')!), []);
	assert.deepEqual(await edges(h.get('h2')!, t), ['app.ledger@db/t.sql: inferred'], 'an excluded holder keeps its edge');
	assert.deepEqual(await edges(h.get('h3')!, t), ['app.ledger@db/t.sql: extracted'], 'an extracted edge is never touched');
	assert.deepEqual([...await pendingOf(h.get('h2')!), ...await pendingOf(h.get('h3')!)].filter(r => r.meta[SQL_REPEND_MARKER] === true), []);
});
