/**
 * Story 9d8b5542 S001 -- SQL references resolved by the cross-file pass. Over
 * a real temporary store and the real pass, with rows written as the SQL
 * reader writes them (tables and views named by their unquoted, dotted name;
 * a reference to another file's object pending by name): a name with one
 * definition in another file resolves 'inferred', qualified or bare, whatever
 * its case; several definitions leave it ambiguous with its candidates and no
 * edge; a name no file defines is no-candidate; a settle that commits the
 * file defining a table resolves a waiting reference of an unchanged file, and
 * one that moves, renames or removes a definition re-attempts the references
 * it touches (a returned edge comes back by name, not by the old id).
 *
 * Run: npx tsx --test src/indexer/__tests__/cross-file-sql-references.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { commitFile, entityU64ForId, upsertEntities } from '../../db/entities.js';
import { listUnresolvedRelations, upsertRelations } from '../../db/relations.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { addRepo } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, EntityKind } from '../../shared/types.js';
import { runCrossFileResolver, type CrossFileMode } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { makeEntityId } from '../parser/base.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;
let repo: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-sql-xref-')));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = join(dir, 'repo');
	mkdirSync(join(repo, 'db'), { recursive: true });
	await addRepo(null, { path: repo, name: 'sql-xref', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const at = (rel: string) => join(repo, rel);
function ent(kind: EntityKind, name: string, rel: string): Entity {
	const file = at(rel);
	return {
		id: makeEntityId(repo, file, kind, kind === 'file' ? file : name), kind, name: kind === 'file' ? file : name, language: 'sql',
		repoId: 1, repo, file, startLine: 1, endLine: 1, body: name, embedding: [], indexedAt: '2026-11-02T00:00:00.000Z', isExported: true,
	};
}
/** Files and their tables/views, stored as the reader stores them. */
async function define(rel: string, ...objects: Array<[EntityKind, string]>): Promise<Entity[]> {
	const es = [ent('file', '', rel), ...objects.map(([k, n]) => ent(k, n, rel))];
	await upsertEntities(null, es);
	return es.slice(1);
}
/** Pending references from `from` by name, as the reader writes another file's. */
const refer = (from: Entity, ...names: string[]) =>
	upsertRelations(null, names.map(to => ({ kind: 'REFERENCES' as const, from: from.id, to, resolved: false, meta: { repo, file: from.file } })));
const pass = (mode: CrossFileMode = 'full', committedFiles?: string[]) =>
	runCrossFileResolver({ db: null as unknown as DbClient, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode, ...(committedFiles !== undefined && { committedFiles }) });
/** What `from`'s REFERENCES edges reach, with their evidence. */
async function referenced(from: Entity, names: Map<string, string>): Promise<string[]> {
	const byU64 = new Map<number, string>();
	for (const [id, name] of names) byU64.set((await entityU64ForId(id))!, name);
	return (await outNeighbors((await entityU64ForId(from.id))!, { kindFilter: ['REFERENCES'], withEvidence: true }))
		.map(n => `${byU64.get(n.u64)}: ${n.evidence}`).sort();
}
const pendingOf = async (from: Entity) => (await listUnresolvedRelations(null, repo)).filter(r => r.fromEntity === from.id);

test('a reference to a table or view defined in exactly one other file resolves inferred -- qualified or bare, whatever its case', async () => {
	const [users, orders, active] = await define('db/schema.sql', ['table', 'app.users'], ['table', 'orders'], ['view', 'active']);
	const [report] = await define('db/report.sql', ['view', 'report']);
	await refer(report!, 'APP.Users', 'orders', 'users', 'Active');

	await pass();

	const names = new Map([users!, orders!, active!].map(e => [e.id, e.name]));
	// 'users' is bare: the one qualified definition ending in .users is its only candidate.
	assert.deepEqual(await referenced(report!, names), ['active: inferred', 'app.users: inferred', 'orders: inferred']);
	assert.deepEqual(await pendingOf(report!), [], 'every name was answered');
});

test('several candidates leave the reference ambiguous with its candidates and no edge; a qualified name never matches a bare definition', async () => {
	const [appUsers] = await define('db/app.sql', ['table', 'app.users']);
	const [auditUsers] = await define('db/audit.sql', ['table', 'audit.users']);
	const [plainLog] = await define('db/log.sql', ['table', 'log']);
	const [plainEvents, appEvents] = await define('db/events.sql', ['table', 'events'], ['table', 'app.events']);
	const [v] = await define('db/v.sql', ['view', 'v']);
	await refer(v!, 'users', 'events', 'app.log');

	await pass();

	assert.deepEqual(await referenced(v!, new Map()), [], 'no edge is guessed');
	const rows = new Map((await pendingOf(v!)).map(r => [r.rawTo, r.meta]));
	assert.equal(rows.get('users')?.['class'], 'ambiguous');
	assert.deepEqual([...(rows.get('users')?.['candidates'] as string[])].sort(), [appUsers!.id, auditUsers!.id].sort());
	assert.equal(rows.get('events')?.['class'], 'ambiguous', 'a bare name may mean the bare or the qualified definition');
	assert.deepEqual([...(rows.get('events')?.['candidates'] as string[])].sort(), [plainEvents!.id, appEvents!.id].sort());
	assert.equal(rows.get('app.log')?.['class'], 'no-candidate', `the schema is named; ${plainLog!.name} has none`);
});

test('a name no file defines is classed no-candidate (no-match), not not-attempted', async () => {
	const [v] = await define('db/v.sql', ['view', 'v']);
	await refer(v!, 'pg_catalog.pg_class');

	await pass();

	const [row] = await pendingOf(v!);
	assert.deepEqual([row?.meta['class'], row?.meta['reason']], ['no-candidate', 'no-match']);
});

test('a settle that commits the file defining a table resolves a waiting reference of an unchanged file', async () => {
	const [report] = await define('db/report.sql', ['view', 'report']);
	await refer(report!, 'ledger');
	await pass();
	assert.equal((await pendingOf(report!))[0]?.meta['class'], 'no-candidate');

	const [ledger] = await define('db/ledger.sql', ['table', 'ledger']);
	await pass('settle', [at('db/ledger.sql')]);

	assert.deepEqual(await referenced(report!, new Map([[ledger!.id, 'ledger']])), ['ledger: inferred']);
	assert.deepEqual(await pendingOf(report!), []);
});

/** A file's tables/views committed as the indexer commits a re-parsed file (its removed entities' edges return to pending). */
async function commit(rel: string, ...objects: Array<[EntityKind, string]>): Promise<Entity[]> {
	const es = [ent('file', '', rel), ...objects.map(([k, n]) => ent(k, n, rel))];
	await commitFile({ repoPath: repo, filePath: at(rel), contentHash: rel + objects.length, entities: es, relations: [] });
	return es.slice(1);
}

test('a table moved to another file: the settle for the two files re-links the reference of an unchanged file to its new place', async () => {
	await commit('db/b.sql', ['table', 'orgs']);
	const [report] = await define('db/report.sql', ['view', 'report']);
	await refer(report!, 'orgs');
	await pass();

	await commit('db/b.sql');                       // orgs leaves b.sql: its edge returns to pending, by name
	const [moved] = await commit('db/c.sql', ['table', 'orgs']);
	await pass('settle', [at('db/b.sql'), at('db/c.sql')]);

	assert.deepEqual(await referenced(report!, new Map([[moved!.id, 'c.sql orgs']])), ['c.sql orgs: inferred']);
	assert.deepEqual(await pendingOf(report!), []);
});

test('a table renamed in its file: the settle classes the waiting reference no-candidate by its name', async () => {
	await commit('db/b.sql', ['table', 'orgs']);
	const [report] = await define('db/report.sql', ['view', 'report']);
	await refer(report!, 'orgs');
	await pass();

	await commit('db/b.sql', ['table', 'organisations']);
	await pass('settle', [at('db/b.sql')]);

	const rows = await pendingOf(report!);
	assert.deepEqual(rows.map(r => [r.rawTo, r.meta['class'], r.meta['awaitsId']]), [['orgs', 'no-candidate', undefined]]);
});

test('removing one of two definitions: the settle resolves the reference that was ambiguous between them', async () => {
	const [kept] = await commit('db/b.sql', ['table', 'users']);
	await commit('db/c.sql', ['table', 'users']);
	const [report] = await define('db/report.sql', ['view', 'report']);
	await refer(report!, 'users');
	await pass();
	assert.equal((await pendingOf(report!))[0]?.meta['class'], 'ambiguous');

	await commit('db/c.sql');
	await pass('settle', [at('db/c.sql')]);

	assert.deepEqual(await referenced(report!, new Map([[kept!.id, 'b.sql users']])), ['b.sql users: inferred']);
});

test('a view never answers its own reference; a REFERENCES row from a non-SQL entity is not attempted; a settle with no SQL file reads no SQL reference', async () => {
	const [self] = await define('db/self.sql', ['view', 'app.users']);
	const [plain] = await define('db/b.sql', ['table', 'users']);
	await refer(self!, 'users');
	const ts: Entity = { ...ent('function', 'f', 'src/a.ts'), language: 'typescript' };
	await upsertEntities(null, [{ ...ent('file', '', 'src/a.ts'), language: 'typescript' }, ts]);
	await upsertRelations(null, [{ kind: 'REFERENCES', from: ts.id, to: 'users', resolved: false, meta: { repo, file: ts.file } }]);
	const [report] = await define('db/report.sql', ['view', 'report']);
	await refer(report!, 'ledger');

	await pass();

	assert.deepEqual(await referenced(self!, new Map([[plain!.id, 'users']])), ['users: inferred'], 'app.users itself is not a candidate for users');
	assert.deepEqual((await pendingOf(ts)).map(r => [r.rawTo, r.meta['class']]), [['users', undefined]], 'left exactly as written');

	// ledger appears without a SQL commit: a settle for a.ts does not re-read the SQL references.
	await upsertEntities(null, [ent('file', '', 'db/ledger.sql'), ent('table', 'ledger', 'db/ledger.sql')]);
	await pass('settle', [at('src/a.ts')]);
	assert.equal((await pendingOf(report!)).length, 1);
	await pass('settle', [at('db/ledger.sql')]);
	assert.deepEqual(await pendingOf(report!), []);
});
