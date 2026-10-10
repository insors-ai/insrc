/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The measuring pass (LLD-b9d5c5c40df5a574-s2, task t3): a request's scope is
 * resolved and counted from a temporary graph store, from the disk and from
 * stand-in data drivers. No model, no network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConnections } from '../../daemon/db/config.js';
import { getDb } from '../../db/client.js';
import { findEntitiesByFile, getEntity, listEntitiesForRepo, upsertEntities } from '../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { addRepo, listRepos } from '../../db/repos.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { AnalyzeScopeRef, ClassifiedIntent } from '../../shared/analyze-types.js';
import type { Entity, EntityKind } from '../../shared/types.js';
import { resolveScopeForTarget } from '../context/scope.js';
import type { ResolvedScope, ScopeDeps } from '../context/scope.js';
import type { PlannedTask, TemplateExecuteArgs } from '../executor/types.js';
import {
	CANCELLED_AMONG_SOURCES, CANCELLED_BEFORE_MEASURE,
	_setMeasureDepsForTest, measureDataSource, measureNamedArea, measureRequestScope, measureResolvedScope, sizeOfCounts,
} from '../measure.js';
import type { RequestMeasure } from '../measure.js';
import { _setDataPoolSourceForTest, dataScopeOf, resolveDataScope } from '../runtimes/data/_shared.js';
import { walkFiles } from '../runtimes/infra/_shared.js';
import { _setTaskScopeDepsForTest } from '../runtimes/shared/task-scope.js';

const NOW = '2026-10-09T10:00:00.000Z';

let dir: string;
/** A workspace directory that holds two registered repos. */
let WS: string;
let BIG: string;
let SMALL: string;
/** A registered repo, outside the workspace, with no stored entity. */
let EMPTY: string;

function ent(repo: string, kind: EntityKind, name: string, rel: string): Entity {
	const file = join(repo, rel);
	return {
		id: makeEntityId(repo, file, kind, name), kind, name, language: 'typescript', repoId: 0, repo, file,
		startLine: 1, endLine: 5, body: `// ${name}`, embedding: [], indexedAt: NOW,
	} as Entity;
}

/** BIG: 30 files and 60 entities (the directory `pay` holds 2 files and 5 entities). SMALL: 1 file, 2 entities. */
function bigEntities(): Entity[] {
	const out: Entity[] = [
		ent(BIG, 'file', 'settle.ts', 'pay/settle.ts'), ent(BIG, 'function', 'settle', 'pay/settle.ts'), ent(BIG, 'function', 'refund', 'pay/settle.ts'),
		ent(BIG, 'file', 'ledger.ts', 'pay/ledger.ts'), ent(BIG, 'class', 'Ledger', 'pay/ledger.ts'),
	];
	for (let i = 0; i < 28; i++) {
		const rel = `gen/f${String(i).padStart(2, '0')}.ts`;
		out.push(ent(BIG, 'file', rel.split('/').pop()!, rel));
		if (i < 27) out.push(ent(BIG, 'function', `fn${i}`, rel));
	}
	return out;
}
const smallEntities = (): Entity[] => [ent(SMALL, 'file', 'one.ts', 'one.ts'), ent(SMALL, 'function', 'one', 'one.ts')];

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-measure-pass-')));
	WS = join(dir, 'ws'); BIG = join(WS, 'big'); SMALL = join(WS, 'small'); EMPTY = join(dir, 'empty');
	for (const d of [join(BIG, 'pay'), join(BIG, 'gen'), join(BIG, 'vacant'), SMALL, EMPTY]) mkdirSync(d, { recursive: true });
	setGraphStorePath(join(dir, 'graph.lmdb'));
	for (const path of [BIG, SMALL, EMPTY]) await addRepo(null, { path, name: '', addedAt: NOW, status: 'ready' });
	await upsertEntities(await getDb(), [...bigEntities(), ...smallEntities()]);
});

test.afterEach(async () => {
	_setMeasureDepsForTest(undefined);
	_setDataPoolSourceForTest(undefined);
	_setTaskScopeDepsForTest(undefined);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const ref = (kind: AnalyzeScopeRef['kind'], value: string): AnalyzeScopeRef => ({ kind, value });
const counts = (m: RequestMeasure): unknown => ({ source: m.source, items: m.items, files: m.files, size: m.size, determined: m.determined });
const undetermined = (m: RequestMeasure): unknown => ({ items: m.items, files: m.files, characters: m.characters, size: m.size, determined: m.determined });
const UNDETERMINED = { items: 0, files: 0, characters: null, size: 'XL', determined: false };

/** The scope function's real readers, with one or more replaced. */
function scopeReaders(over: Partial<ScopeDeps> = {}): ScopeDeps {
	return {
		listRepos:           () => listRepos(null),
		findEntitiesByFile:  file => findEntitiesByFile(null, file),
		listEntitiesForRepo: repo => listEntitiesForRepo(null, repo),
		loadConnections,
		...over,
	};
}

// ---------------------------------------------------------------------------
// The stored graph
// ---------------------------------------------------------------------------

test('measureRequestScope on a temporary store gives different sizes for a small directory and for the whole repo with the same prompt, and makes no model call (mutation: read the whole repo for a module scope)', async () => {
	// One request ("how does this work"), two scopes. The measure takes no prompt: the size comes from the counts alone.
	const whole = await measureRequestScope(ref('repo', BIG), 'code');
	const part  = await measureRequestScope(ref('module', join(BIG, 'pay')), 'code');
	assert.deepEqual(counts(whole), { source: 'named-area', items: 60, files: 30, size: 'M', determined: true });
	assert.deepEqual(counts(part),  { source: 'named-area', items: 5,  files: 2,  size: 'S', determined: true });
	assert.notEqual(whole.size, part.size);
	// A file and a symbol of the same repo: smaller still.
	assert.deepEqual(counts(await measureRequestScope(ref('file', join(BIG, 'pay/settle.ts')), 'code')),
		{ source: 'named-area', items: 3, files: 1, size: 'XS', determined: true });
	assert.deepEqual(counts(await measureRequestScope(ref('symbol', `${join(BIG, 'pay/settle.ts')}#refund`), 'code')),
		{ source: 'named-area', items: 1, files: 1, size: 'XS', determined: true });
	// The docs family counts the same stored area.
	assert.deepEqual(counts(await measureRequestScope(ref('module', join(BIG, 'pay')), 'docs')), counts(part));
	// The other repo is its own count.
	assert.deepEqual(counts(await measureRequestScope(ref('repo', SMALL), 'code')),
		{ source: 'named-area', items: 2, files: 1, size: 'XS', determined: true });

	// No model call: the module that measures names no provider and makes no completion.
	const source = readFileSync(fileURLToPath(new URL('../measure.ts', import.meta.url)), 'utf8');
	for (const word of ['Provider', 'completeStructured', '.complete(', 'resolveRoleProvider', 'shaper']) {
		assert.ok(!source.includes(word), `measure.ts does not mention '${word}'`);
	}
});

test('measureRequestScope returns a measure that is not determined, with size XL and the reason, for a scope that cannot be resolved, a scope no registered repo contains, a repo that holds no stored entity, a failed read of the store, and a registry read that rejects while a symbol scope or a connection scope is being resolved, and does not throw; an empty directory inside an indexed repo is XS and determined (mutation: return the count of zero for a path the index does not hold)', async () => {
	const elsewhere = join(dir, 'elsewhere');
	mkdirSync(elsewhere);

	// A scope that cannot be resolved: a symbol value with no entity name. The scope error's own message is the reason.
	const unresolved = await measureRequestScope(ref('symbol', 'nonsense'), 'code', 'S');
	assert.deepEqual(undetermined(unresolved), UNDETERMINED);
	assert.match(unresolved.note!, /kind='symbol' expects '<absolute file path>#<entity name>'/);
	assert.equal(unresolved.sizeHint, 'S');
	// A kind of scope its source refuses.
	const refused = await measureRequestScope(ref('file', join(BIG, 'pay/settle.ts')), 'infra');
	assert.deepEqual(undetermined(refused), UNDETERMINED);
	assert.match(refused.note!, /scopeRef\.kind='file' is incompatible with target='infra'/);

	// A scope no registered repo contains. The code family's index check refuses it; a generic request is not checked
	// by anyone, and must still not be counted as zero.
	for (const target of ['code', 'docs', 'generic'] as const) {
		const m = await measureRequestScope(ref('repo', elsewhere), target);
		assert.deepEqual(undetermined(m), UNDETERMINED, `${target}: a path the index does not hold`);
		assert.ok(m.note!.length > 0 && m.note!.includes(elsewhere), `${target}: the reason names the path: ${m.note}`);
	}
	assert.equal((await measureRequestScope(ref('repo', elsewhere), 'generic')).note,
		`the index holds nothing for the path ${elsewhere}: no registered repository contains it`);

	// A registered repo that holds no stored entity.
	for (const target of ['code', 'generic'] as const) {
		const m = await measureRequestScope(ref('repo', EMPTY), target);
		assert.deepEqual(undetermined(m), UNDETERMINED, `${target}: a repo with no stored entity`);
	}
	assert.equal((await measureRequestScope(ref('repo', EMPTY), 'generic')).note,
		`the index holds nothing for the path ${EMPTY}: the repository ${EMPTY} holds no stored entity`);
	assert.equal((await measureRequestScope(ref('module', join(EMPTY, 'src')), 'generic')).determined, false);

	// A failed read of the store while the area is counted.
	_setMeasureDepsForTest({ listEntities: async () => { throw new Error('the graph store is closed'); } });
	const failedRead = await measureRequestScope(ref('repo', BIG), 'generic');
	assert.deepEqual(undetermined(failedRead), UNDETERMINED);
	assert.equal(failedRead.note, 'the count could not be taken (the graph store is closed)');
	_setMeasureDepsForTest(undefined);

	// A registry read that rejects while a symbol scope, then a connection scope, is being resolved. Neither read has
	// a guard of its own in the resolution, and the error is none of the scope errors.
	const rejecting = scopeReaders({ listRepos: async () => { throw new Error('the registry cannot be read'); } });
	_setMeasureDepsForTest({ scope: rejecting });
	const symbol = await measureRequestScope(ref('symbol', `${join(BIG, 'pay/settle.ts')}#refund`), 'code');
	assert.deepEqual(undetermined(symbol), UNDETERMINED);
	assert.equal(symbol.note, 'the scope could not be resolved, because a read of the registry or the store failed (the registry cannot be read)');
	const connection = await measureRequestScope(ref('connection', 'ledger-db'), 'data');
	assert.deepEqual(undetermined(connection), UNDETERMINED);
	assert.equal(connection.source, 'data-source');
	assert.match(connection.note!, /a read of the registry or the store failed \(the registry cannot be read\)/);
	_setMeasureDepsForTest(undefined);

	// An empty directory inside an indexed repo is a count: XS, determined.
	const vacant = await measureRequestScope(ref('module', join(BIG, 'vacant')), 'code');
	assert.deepEqual(counts(vacant), { source: 'named-area', items: 0, files: 0, size: 'XS', determined: true });
	assert.equal(vacant.note, undefined);
	assert.deepEqual(counts(await measureRequestScope(ref('module', join(BIG, 'vacant')), 'generic')), counts(vacant));
});

test("a workspace that a registered repo contains is counted through the area predicate (the whole repo at the repo's path, only what lies under a directory inside it); a workspace that no repo contains is summed over the registered repos under it, each read once, for a generic request and for a direct call of measureResolvedScope, is not determined when none lies under it, and is not determined for a code or docs request, which the index check refuses (mutation: treat every workspace as a sum over the repos under it)", async () => {
	// The scope the agent tools send: a workspace at the path they were given.
	for (const target of ['code', 'docs', 'generic'] as const) {
		assert.deepEqual(counts(await measureRequestScope(ref('workspace', BIG), target)),
			{ source: 'named-area', items: 60, files: 30, size: 'M', determined: true }, `${target}: a workspace at the repo's path`);
		assert.deepEqual(counts(await measureRequestScope(ref('workspace', join(BIG, 'pay')), target)),
			{ source: 'named-area', items: 5, files: 2, size: 'S', determined: true }, `${target}: a workspace inside the repo`);
	}

	// A workspace above the repos: the sum over the registered repos under it, each read once.
	const reads: string[] = [];
	_setMeasureDepsForTest({ listEntities: async (repo) => { reads.push(repo); return listEntitiesForRepo(null, repo); } });
	const summed = await measureRequestScope(ref('workspace', WS), 'generic');
	assert.deepEqual(counts(summed), { source: 'named-area', items: 62, files: 31, size: 'M', determined: true });
	assert.deepEqual([...reads].sort(), [BIG, SMALL], 'each repo under the workspace read once, and the repo outside it not read');
	// A direct call with a resolved scope reaches the same sum, whatever the kind of source.
	reads.length = 0;
	const above: ResolvedScope = { kind: 'workspace', value: WS, repoPath: null, lookupPath: WS };
	assert.deepEqual(counts(await measureResolvedScope(above, 'code', 'L')), counts(summed));
	assert.deepEqual([...reads].sort(), [BIG, SMALL]);
	assert.equal((await measureResolvedScope(above, 'code', 'L')).sizeHint, 'L');
	// A registry row for shared modules is not a repo of the workspace: it is not read and does not spoil the sum.
	reads.length = 0;
	_setMeasureDepsForTest({
		listEntities: async (repo) => { reads.push(repo); return listEntitiesForRepo(null, repo); },
		listRepos:    async () => [...await listRepos(null), { path: join(WS, 'shared-npm'), name: 'npm', addedAt: NOW, status: 'ready', kind: 'shared-modules' }] as never,
	});
	assert.deepEqual(counts(await measureRequestScope(ref('workspace', WS), 'generic')), counts(summed));
	assert.deepEqual([...reads].sort(), [BIG, SMALL]);
	_setMeasureDepsForTest(undefined);

	// A workspace under which no registered repo lies.
	const nothing = join(dir, 'nothing');
	mkdirSync(nothing);
	const none = await measureRequestScope(ref('workspace', nothing), 'generic');
	assert.deepEqual(undetermined(none), UNDETERMINED);
	assert.equal(none.note, `no registered repository lies under the workspace ${nothing}`);
	// A workspace that holds a repo with no stored entity is not a count either.
	const withEmpty = await measureResolvedScope({ kind: 'workspace', value: dir, repoPath: null, lookupPath: dir }, 'generic');
	assert.deepEqual(undetermined(withEmpty), UNDETERMINED);
	assert.match(withEmpty.note!, /holds no stored entity/);

	// A code or docs request on a workspace above the repos is refused by the index check: not determined.
	for (const target of ['code', 'docs'] as const) {
		const m = await measureRequestScope(ref('workspace', WS), target);
		assert.deepEqual(undetermined(m), UNDETERMINED, target);
		assert.ok(m.note!.includes(WS), m.note);
	}
});

// ---------------------------------------------------------------------------
// A data source
// ---------------------------------------------------------------------------

interface StandInConnection { readonly id: string; readonly kind: string; readonly family: 'rdbms' | 'kv' | 'file'; readonly driver?: Record<string, unknown>; readonly path?: string; readonly recursive?: boolean; readonly unreachable?: boolean; /** Its connection is never made: `acquire` does not settle. */ readonly stalled?: boolean }

/** A pool of stand-in connections that records what was opened, acquired and asked of each listing. */
function standInPool(connections: readonly StandInConnection[]): { opened: string[]; acquired: string[]; asked: Array<Record<string, unknown> | undefined>; reloads: () => number } {
	const opened: string[] = [];
	const acquired: string[] = [];
	const asked: Array<Record<string, unknown> | undefined> = [];
	let reloaded = 0;
	const pool = {
		reload:  async () => { reloaded += 1; },
		list:    () => connections.map(c => ({ id: c.id, kind: c.kind, family: c.family, label: c.id, ...(c.path !== undefined ? { path: c.path } : {}), ...(c.recursive !== undefined ? { recursive: c.recursive } : {}) })),
		acquire: async (id: string) => {
			acquired.push(id);
			const c = connections.find(x => x.id === id);
			if (c === undefined) throw new Error(`no connection '${id}'`);
			if (c.unreachable === true) throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
			if (c.stalled === true) return new Promise<never>(() => undefined);
			return { family: c.family, kind: c.kind, ...(c.driver ?? {}) };
		},
	};
	_setDataPoolSourceForTest((async (path: string) => { opened.push(path); return pool; }) as never);
	return { opened, acquired, asked, reloads: () => reloaded };
}
const tables = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `t${i}`, kind: 'table' as const }));
const spaces = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `ns${i}` }));
/** A table listing that holds `n` tables and cuts at 500 unless asked for the complete mode. */
const tableListing = (n: number, asked?: Array<Record<string, unknown> | undefined>) => ({
	listTables: async (opts?: { complete?: boolean }) => {
		asked?.push(opts);
		return opts?.complete === true ? { target: 't', tables: tables(n), truncated: false } : { target: 't', tables: tables(Math.min(n, 500)), truncated: n > 500 };
	},
});
const namespaceListing = (n: number, asked?: Array<Record<string, unknown> | undefined>) => ({
	listNamespaces: async (opts?: { complete?: boolean }) => {
		asked?.push(opts);
		return opts?.complete === true ? { namespaces: spaces(n), truncated: false, supported: true } : { namespaces: spaces(Math.min(n, 200)), truncated: n > 200, supported: true };
	},
});

test("measureDataSource counts a relational source through the complete mode of its table listing beyond the limited mode's cap, a namespace source through its namespace listing, and a file source through the file listing with no limit (mutation: call the listing in its limited mode)", async () => {
	const data = join(dir, 'data');
	mkdirSync(join(data, 'sub'), { recursive: true });
	// More files than the data tasks' own file-list limit would matter for; walked to the end.
	for (let i = 0; i < 30; i++) writeFileSync(join(data, i % 2 === 0 ? '' : 'sub', `f${String(i).padStart(2, '0')}.csv`), 'a,b\n');

	const asked: Array<Record<string, unknown> | undefined> = [];
	const p = standInPool([
		{ id: 'warehouse', kind: 'postgres', family: 'rdbms', driver: tableListing(6000, asked) },
		{ id: 'ledger',    kind: 'sqlite',   family: 'rdbms', driver: tableListing(40, asked) },
		{ id: 'catalog',   kind: 'mongodb',  family: 'kv',    driver: namespaceListing(1300, asked) },
		{ id: 'exports',   kind: 'csv',      family: 'file',  path: data, recursive: true },
		{ id: 'flat',      kind: 'csv',      family: 'file',  path: data },
	]);
	const measure = (id: string, hint?: 'S'): Promise<RequestMeasure> => measureDataSource({ poolPath: BIG, connectionId: id }, hint);

	// A relational source: every table, far beyond the 500 the limited mode returns and the 5,000 it can be raised to.
	const warehouse = await measure('warehouse', 'S');
	assert.deepEqual(warehouse, { source: 'data-source', items: 6000, files: 0, characters: null, size: 'XL', determined: true, sizeHint: 'S' });
	// The objects are compared with the FILES column: 40 tables are M, where the entities column would say XS.
	const ledger = await measure('ledger');
	assert.deepEqual(counts(ledger), { source: 'data-source', items: 40, files: 0, size: 'M', determined: true });
	assert.equal(ledger.size, sizeOfCounts({ files: 40, items: 0 }));
	assert.notEqual(ledger.size, sizeOfCounts({ files: 0, items: 40 }));
	// A namespace source: every namespace, beyond the 200 of the limited mode and its cap of 1,000.
	assert.deepEqual(counts(await measure('catalog')), { source: 'data-source', items: 1300, files: 0, size: 'L', determined: true });
	// Each listing was asked for the complete mode.
	assert.deepEqual(asked, [{ complete: true }, { complete: true }, { complete: true }]);

	// A file source: every file, with the connection's own recursive setting; the files are objects and files.
	assert.deepEqual(counts(await measure('exports')), { source: 'data-source', items: 30, files: 30, size: 'M', determined: true });
	assert.deepEqual(counts(await measure('flat')),    { source: 'data-source', items: 15, files: 15, size: 'S', determined: true });
	assert.deepEqual(p.opened, [BIG, BIG, BIG, BIG, BIG]);

	// Through the measuring pass, a connection scope reaches the same count: for a data and for a generic request.
	_setMeasureDepsForTest({ scope: scopeReaders({ loadConnections: async (repo) => ({ file: { connections: [] }, resolved: repo === BIG ? [{ id: 'warehouse', kind: 'postgres' }] : [], warnings: [] }) as never }) });
	assert.deepEqual(counts(await measureRequestScope(ref('connection', 'warehouse'), 'data')), counts(warehouse));
	assert.equal(p.opened.at(-1), BIG, 'the pool of the repo that declares the connection');
});

test('measureDataSource is not determined, with size XL and its own reason, for a driver with no listing, a listing that is not supported, a listing that reports it was cut, a Redis or etcd source, and a source that cannot be reached; a data request over several connections is not determined when one of them is not', async () => {
	const cut = { listTables: async () => ({ target: 't', tables: tables(5000), truncated: true }) };
	const p = standInPool([
		{ id: 'bare-sql',  kind: 'odd-sql',    family: 'rdbms', driver: {} },
		{ id: 'bare-kv',   kind: 'odd-kv',     family: 'kv',    driver: {} },
		{ id: 'cache',     kind: 'memcached',  family: 'kv',    driver: { listNamespaces: async () => ({ namespaces: [], truncated: false, supported: false }) } },
		{ id: 'cut-sql',   kind: 'postgres',   family: 'rdbms', driver: cut },
		{ id: 'cut-kv',    kind: 'cassandra',  family: 'kv',    driver: { listNamespaces: async () => ({ namespaces: spaces(1000), truncated: true, supported: true }) } },
		{ id: 'sessions',  kind: 'redis',      family: 'kv',    driver: namespaceListing(50) },
		{ id: 'coord',     kind: 'etcd',       family: 'kv',    driver: namespaceListing(50) },
		{ id: 'events',    kind: 'clickhouse', family: 'rdbms', driver: { listTables: async () => { throw new Error('listTables() not yet implemented for clickhouse'); } } },
		{ id: 'down',      kind: 'postgres',   family: 'rdbms', unreachable: true },
		{ id: 'no-path',   kind: 'csv',        family: 'file' },
	]);
	const reasons: Record<string, string> = {
		'bare-sql': "the driver 'odd-sql' of 'bare-sql' has no table listing",
		'bare-kv':  "the driver 'odd-kv' of 'bare-kv' has no namespace listing",
		'cache':    "the source 'cache' (memcached) answers that listing its namespaces is not supported",
		'cut-sql':  "the table listing of 'cut-sql' was cut at 5000 tables",
		'cut-kv':   "the namespace listing of 'cut-kv' was cut at 1000 namespaces",
		'sessions': "the source 'sessions' (redis) has no namespaces to count; its listing is a sample of keys",
		'coord':    "the source 'coord' (etcd) has no namespaces to count; its listing is a sample of keys",
		'events':   "the listing of 'events' failed (listTables() not yet implemented for clickhouse)",
		'down':     "the source 'down' cannot be reached (connect ECONNREFUSED 127.0.0.1:5432)",
		'no-path':  "the file connection 'no-path' has no path",
	};
	for (const [id, note] of Object.entries(reasons)) {
		const m = await measureDataSource({ poolPath: BIG, connectionId: id }, 'M');
		assert.deepEqual(m, { source: 'data-source', items: 0, files: 0, characters: null, size: 'XL', determined: false, sizeHint: 'M', note }, id);
	}
	// A connection the pool does not hold, and a scope that names none.
	assert.match((await measureDataSource({ poolPath: BIG, connectionId: 'ghost' })).note!, /the source 'ghost' cannot be reached \(no connection 'ghost'\)/);
	assert.equal((await measureDataSource({ poolPath: BIG })).determined, false);
	// A source whose listing is a sample is known by its kind: it is not connected to only to be refused.
	assert.ok(!p.acquired.includes('sessions') && !p.acquired.includes('coord'), `not connected to: ${p.acquired.join(', ')}`);
	assert.ok(p.acquired.includes('cut-sql') && p.acquired.includes('down'), 'the others are connected to');
	// A cut count is never the count: it is in the note only.
	assert.equal((await measureDataSource({ poolPath: BIG, connectionId: 'cut-sql' })).items, 0);

	// A data request over several connections, one of which cannot be counted: not a count.
	standInPool([
		{ id: 'ledger',   kind: 'sqlite', family: 'rdbms', driver: tableListing(40) },
		{ id: 'sessions', kind: 'redis',  family: 'kv',    driver: namespaceListing(50) },
	]);
	const mixed = await measureRequestScope(ref('repo', BIG), 'data', 'S');
	assert.deepEqual(undetermined(mixed), UNDETERMINED);
	assert.deepEqual([mixed.source, mixed.sizeHint], ['data-source', 'S']);
	assert.equal(mixed.note,
		`1 of the 2 connections registered at ${BIG} could not be counted: the source 'sessions' (redis) has no namespaces to count; ` +
		`its listing is a sample of keys; 40 objects were counted in the other 1`);
});

test('dataScopeOf gives the pool path and connection id resolveDataScope gave before for each kind of scope, and a data request on a repo is measured by one call per registered connection, each with its connection id', async () => {
	// The rule, on resolved scopes: a connection opens the pool of the repo that declares it; every other kind opens
	// the pool at the scope's OWN path, also when a registered repo contains that path.
	const inside = join(BIG, 'deploy');
	assert.deepEqual(dataScopeOf({ kind: 'connection', value: 'ledger-db', repoPath: BIG, lookupPath: BIG, connectionId: 'ledger-db' }),
		{ poolPath: BIG, connectionId: 'ledger-db' });
	for (const kind of ['repo', 'workspace', 'manifest-dir'] as const) {
		assert.deepEqual(dataScopeOf({ kind, value: inside, repoPath: BIG, lookupPath: inside }), { poolPath: inside }, kind);
		assert.ok(!('connectionId' in dataScopeOf({ kind, value: inside, repoPath: BIG, lookupPath: inside })));
	}

	// resolveDataScope, which the data tasks call, gives exactly what it gave before for each kind it accepts.
	_setTaskScopeDepsForTest(scopeReaders({ loadConnections: async (repo) => ({ file: { connections: [] }, resolved: repo === BIG ? [{ id: 'ledger-db', kind: 'sqlite' }] : [], warnings: [] }) as never }));
	const argsFor = (scopeRef: AnalyzeScopeRef): TemplateExecuteArgs => ({
		task: { taskId: 't01', template: 'data.discovery.connections', kind: 'leaf', params: {}, produces: [], rationale: 'test' } as unknown as PlannedTask,
		intent: { target: 'data', scope: 'S', focused: false, scopeRef, reasoning: 'test' } as ClassifiedIntent,
		upstreamOutputs: new Map(), runId: 'r1',
	});
	assert.deepEqual(await resolveDataScope(argsFor(ref('connection', 'ledger-db')), 'x'), { poolPath: BIG, connectionId: 'ledger-db' });
	assert.deepEqual(await resolveDataScope(argsFor(ref('repo', BIG)), 'x'), { poolPath: BIG });
	assert.deepEqual(await resolveDataScope(argsFor(ref('manifest-dir', inside)), 'x'), { poolPath: inside });
	assert.deepEqual(await resolveDataScope(argsFor(ref('workspace', WS)), 'x'), { poolPath: WS });
	_setTaskScopeDepsForTest(undefined);

	// A data request on a repo: one call per registered connection, each with its connection id, in the pool's order.
	const asked: Array<Record<string, unknown> | undefined> = [];
	const p = standInPool([
		{ id: 'ledger',    kind: 'sqlite',   family: 'rdbms', driver: tableListing(40, asked) },
		{ id: 'warehouse', kind: 'postgres', family: 'rdbms', driver: tableListing(700, asked) },
		{ id: 'catalog',   kind: 'mongodb',  family: 'kv',    driver: namespaceListing(10, asked) },
	]);
	const summed = await measureRequestScope(ref('repo', BIG), 'data');
	assert.deepEqual(summed, { source: 'data-source', items: 750, files: 0, characters: null, size: 'L', determined: true });
	assert.deepEqual(p.acquired, ['ledger', 'warehouse', 'catalog']);
	assert.deepEqual(asked, [{ complete: true }, { complete: true }, { complete: true }]);
	// The pool is opened and its connections file reloaded once for the request, not once more per connection.
	assert.deepEqual(p.opened, [BIG]);
	assert.equal(p.reloads(), 1);
	// A manifest directory inside the repo opens the pool at its own path.
	p.opened.length = 0;
	await measureRequestScope(ref('manifest-dir', inside), 'data');
	assert.ok(p.opened.length > 0 && p.opened.every(path => path === inside));

	// A repo with no registered connection: a count of zero, XS, determined.
	standInPool([]);
	assert.deepEqual(await measureRequestScope(ref('repo', BIG), 'data'), { source: 'data-source', items: 0, files: 0, characters: null, size: 'XS', determined: true });
});

// ---------------------------------------------------------------------------
// Infra and generic
// ---------------------------------------------------------------------------

test("an infra request is measured from the files the infra tasks' own walk visits, with no cap and without the stored graph, also in a directory no registered repo contains, and is not determined when the directory cannot be read (mutation: count the stored entities)", async () => {
	// A manifest directory in no registered repo: 25 files in two directories, and one the walk never enters.
	const deploy = join(dir, 'deploy');
	mkdirSync(join(deploy, 'k8s'), { recursive: true });
	mkdirSync(join(deploy, 'node_modules/pkg'), { recursive: true });
	for (let i = 0; i < 25; i++) writeFileSync(join(deploy, i % 2 === 0 ? '' : 'k8s', `m${String(i).padStart(2, '0')}.yaml`), 'k: v\n');
	writeFileSync(join(deploy, 'node_modules/pkg/skipped.yaml'), 'k: v\n');

	// The stored graph is not read at all, and the walk is asked for no cap.
	const caps: unknown[] = [];
	_setMeasureDepsForTest({
		listEntities: async () => { throw new Error('the stored graph must not be read for an infra request'); },
		walk: (root, cap) => { caps.push(cap); return walkFiles(root, cap); },
	});
	const m = await measureRequestScope(ref('manifest-dir', deploy), 'infra', 'XS');
	assert.deepEqual(m, { source: 'named-area', items: 25, files: 25, characters: null, size: 'M', determined: true, sizeHint: 'XS' });
	assert.deepEqual(caps, [null], 'the walk runs with no cap');

	// A registered repo: its files on disk are counted, not its 60 stored entities. BIG holds three files on disk.
	for (const rel of ['pay/a.yaml', 'gen/b.yaml', 'c.yaml']) writeFileSync(join(BIG, rel), 'k: v\n');
	for (const kind of ['repo', 'workspace', 'manifest-dir'] as const) {
		assert.deepEqual(counts(await measureRequestScope(ref(kind, BIG), 'infra')),
			{ source: 'named-area', items: 3, files: 3, size: 'S', determined: true }, kind);
	}
	_setMeasureDepsForTest(undefined);

	// A directory that cannot be read: not determined, with the path.
	const missing = join(dir, 'missing');
	const gone = await measureRequestScope(ref('manifest-dir', missing), 'infra');
	assert.deepEqual(undetermined(gone), UNDETERMINED);
	assert.ok(gone.note!.startsWith(`the directory ${missing} could not be read (`), gone.note);
	// A directory below the root that cannot be read: the count is of part of the area, so it is not a count.
	if (userInfo().uid !== 0) {
		const locked = join(deploy, 'locked');
		mkdirSync(locked);
		writeFileSync(join(locked, 'hidden.yaml'), 'k: v\n');
		chmodSync(locked, 0o000);
		try {
			const partial = await measureRequestScope(ref('manifest-dir', deploy), 'infra');
			assert.deepEqual(undetermined(partial), UNDETERMINED);
			assert.equal(partial.note, `1 of the directories under ${deploy} could not be read (locked); 25 files were counted in the rest`);
		} finally {
			chmodSync(locked, 0o755);
		}
	}
	// A walk that says it was cut is never a count, whatever cut it.
	_setMeasureDepsForTest({ walk: async () => ({ files: [{ absPath: '/x', relPath: 'x' }], truncated: true, unreadable: [] }) });
	assert.equal((await measureRequestScope(ref('manifest-dir', deploy), 'infra')).determined, false);
});

test('a generic request is measured from the stored graph for a path or entity scope and from the live source for a connection scope, through the generic scope resolution', async () => {
	// A path and an entity scope: the stored graph, exactly as a code request counts it.
	for (const scopeRef of [ref('repo', BIG), ref('module', join(BIG, 'pay')), ref('file', join(BIG, 'pay/settle.ts')), ref('symbol', `${join(BIG, 'pay/settle.ts')}#refund`)]) {
		assert.deepEqual(counts(await measureRequestScope(scopeRef, 'generic')), counts(await measureRequestScope(scopeRef, 'code')), scopeRef.kind);
	}
	assert.deepEqual(counts(await measureRequestScope(ref('repo', BIG), 'generic')),
		{ source: 'named-area', items: 60, files: 30, size: 'M', determined: true });

	// A connection scope, which only the generic resolution and the data family accept: the live source.
	const p = standInPool([{ id: 'ledger-db', kind: 'sqlite', family: 'rdbms', driver: tableListing(40) }]);
	const readers = scopeReaders({ loadConnections: async (repo) => ({ file: { connections: [] }, resolved: repo === SMALL ? [{ id: 'ledger-db', kind: 'sqlite' }] : [], warnings: [] }) as never });
	_setMeasureDepsForTest({ scope: readers });
	const live = await measureRequestScope(ref('connection', 'ledger-db'), 'generic', 'L');
	assert.deepEqual(live, { source: 'data-source', items: 40, files: 0, characters: null, size: 'M', determined: true, sizeHint: 'L' });
	assert.deepEqual([p.opened, p.acquired], [[SMALL], ['ledger-db']], 'the pool of the repo that declares the connection');
	// The code family refuses a connection scope: through the task scope function the request is not determined.
	const refused = await measureRequestScope(ref('connection', 'ledger-db'), 'code');
	assert.deepEqual(undetermined(refused), UNDETERMINED);
	assert.match(refused.note!, /scopeRef\.kind='connection' is incompatible with target='code'/);
	// A connection no repo declares.
	assert.match((await measureRequestScope(ref('connection', 'ghost'), 'generic')).note!, /Connection 'ghost' is not registered in any repo/);
});

// ---------------------------------------------------------------------------
// A live source that does not answer, and a cancelled request (ISSUE-008e146a)
// ---------------------------------------------------------------------------

/** A promise that never settles: a source that does not answer. */
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);
const stalledSql = { listTables: () => never() };
const timedOut = (id: string, seconds: number): string => `the listing of '${id}' timed out: the source did not answer within ${seconds} seconds`;
const connectionScope = (id: string): ResolvedScope => ({ kind: 'connection', value: id, repoPath: BIG, lookupPath: BIG, connectionId: id });
const repoScope = (): ResolvedScope => ({ kind: 'repo', value: BIG, repoPath: BIG, lookupPath: BIG });

test('a live source whose listing never returns, and one that is never reached, is reported as not determined after the time limit with the reason that the listing timed out, and is never a count', async () => {
	const p = standInPool([
		{ id: 'slow-sql',  kind: 'postgres',  family: 'rdbms', driver: stalledSql },
		{ id: 'slow-kv',   kind: 'cassandra', family: 'kv',    driver: { listNamespaces: () => never() } },
		{ id: 'no-answer', kind: 'postgres',  family: 'rdbms', driver: tableListing(3), stalled: true },
		{ id: 'quick',     kind: 'postgres',  family: 'rdbms', driver: tableListing(3) },
		{ id: 'cache',     kind: 'redis',     family: 'kv',    driver: { listNamespaces: () => never() } },
	]);
	for (const id of ['slow-sql', 'slow-kv', 'no-answer']) {
		const started = Date.now();
		const m = await measureDataSource({ poolPath: BIG, connectionId: id }, 'S', { sourceTimeoutMs: 40 });
		const took = Date.now() - started;
		// Never a count: nothing in the counts, the largest size, and the reason.
		assert.deepEqual(undetermined(m), UNDETERMINED, id);
		assert.deepEqual([m.source, m.sizeHint, m.note], ['data-source', 'S', timedOut(id, 0.04)], id);
		assert.ok(took >= 35 && took < 2000, `${id}: waited the limit and no longer (${took} ms)`);
	}
	assert.deepEqual(p.acquired, ['slow-sql', 'slow-kv', 'no-answer'], 'each was asked once');
	// The same through the pass's entry points, for a connection scope.
	assert.equal((await measureResolvedScope(connectionScope('slow-sql'), 'data', undefined, { sourceTimeoutMs: 20 })).note, timedOut('slow-sql', 0.02));
	assert.equal((await measureResolvedScope(connectionScope('slow-sql'), 'generic', undefined, { sourceTimeoutMs: 20 })).note, timedOut('slow-sql', 0.02));

	// A source that answers within the limit is counted as before ...
	assert.deepEqual(counts(await measureDataSource({ poolPath: BIG, connectionId: 'quick' }, undefined, { sourceTimeoutMs: 40 })),
		{ source: 'data-source', items: 3, files: 0, size: 'S', determined: true });
	// ... and the checks made before a source is reached start no wait: the reason is today's, at once.
	const started = Date.now();
	const sampled = await measureDataSource({ poolPath: BIG, connectionId: 'cache' }, undefined, { sourceTimeoutMs: 5000 });
	assert.equal(sampled.note, "the source 'cache' (redis) has no namespaces to count; its listing is a sample of keys");
	const unnamed = await measureDataSource({ poolPath: BIG }, undefined, { sourceTimeoutMs: 5000 });
	assert.equal(unnamed.note, 'no connection is named: a data source is measured one connection at a time');
	assert.ok(Date.now() - started < 1000);
});

test('a request cancelled while a source is being measured stops at once and the remaining sources of a pool are not asked; a signal already aborted reads nothing', async () => {
	// --- one source, cancelled while its listing is out: the wait ends long before the limit ---
	standInPool([{ id: 'slow-sql', kind: 'postgres', family: 'rdbms', driver: stalledSql }]);
	let abort = new AbortController();
	setTimeout(() => abort.abort(), 20);
	let started = Date.now();
	const one = await measureDataSource({ poolPath: BIG, connectionId: 'slow-sql' }, undefined, { signal: abort.signal, sourceTimeoutMs: 60_000 });
	assert.ok(Date.now() - started < 2000, 'it did not wait for the limit');
	assert.deepEqual(undetermined(one), UNDETERMINED);
	assert.equal(one.note, "the request was cancelled while the source 'slow-sql' was being measured");

	// --- a repository with three connections, cancelled while the second is out: the third is not asked ---
	const p = standInPool([
		{ id: 'a', kind: 'postgres', family: 'rdbms', driver: tableListing(3) },
		{ id: 'b', kind: 'postgres', family: 'rdbms', driver: stalledSql },
		{ id: 'c', kind: 'postgres', family: 'rdbms', driver: tableListing(4) },
	]);
	abort = new AbortController();
	setTimeout(() => abort.abort(), 20);
	started = Date.now();
	const pool = await measureResolvedScope(repoScope(), 'data', 'M', { signal: abort.signal, sourceTimeoutMs: 60_000 });
	assert.ok(Date.now() - started < 2000);
	assert.deepEqual(undetermined(pool), UNDETERMINED);
	assert.deepEqual([pool.source, pool.sizeHint, pool.note], ['data-source', 'M', CANCELLED_AMONG_SOURCES]);
	assert.equal(CANCELLED_AMONG_SOURCES, 'the request was cancelled while its data sources were being measured');
	assert.deepEqual(p.acquired, ['a', 'b'], 'the connection after the one that was out is not asked');

	// --- a signal already aborted: nothing is opened, acquired or read ---
	const q = standInPool([{ id: 'a', kind: 'postgres', family: 'rdbms', driver: tableListing(3) }]);
	let entityReads = 0;
	let scopeReads = 0;
	const counting = new Proxy(scopeReaders(), { get: (t, prop) => { scopeReads += 1; return Reflect.get(t, prop); } });
	_setMeasureDepsForTest({ scope: counting, listEntities: async () => { entityReads += 1; return bigEntities(); } });
	const gone = new AbortController();
	gone.abort();
	const before = { signal: gone.signal };
	for (const [scope, target, source] of [
		[repoScope(), 'data', 'data-source'], [connectionScope('a'), 'data', 'data-source'], [repoScope(), 'code', 'named-area'],
	] as const) {
		const m = await measureResolvedScope(scope, target, undefined, before);
		assert.deepEqual(undetermined(m), UNDETERMINED, `${scope.kind}/${target}`);
		assert.deepEqual([m.source, m.note], [source, CANCELLED_BEFORE_MEASURE], `${scope.kind}/${target}`);
	}
	const viaRequest = await measureRequestScope(ref('repo', BIG), 'code', undefined, before);
	assert.deepEqual([viaRequest.determined, viaRequest.note], [false, CANCELLED_BEFORE_MEASURE]);
	assert.equal(CANCELLED_BEFORE_MEASURE, 'the request was cancelled before it was measured');
	// A direct call for one source, too: its pool is not loaded.
	assert.equal((await measureDataSource({ poolPath: BIG, connectionId: 'a' }, undefined, before)).note, CANCELLED_BEFORE_MEASURE);
	assert.deepEqual([q.opened, q.acquired, entityReads, scopeReads], [[], [], 0, 0]);
	// The same scope with a signal that has not fired is measured.
	const live = await measureResolvedScope(repoScope(), 'code', undefined, { signal: new AbortController().signal });
	assert.equal(live.determined, true);
	assert.equal(entityReads, 1);
});

test('one stalled connection among several does not stop the others from being measured, each has its own time limit, and the sum is not a count', async () => {
	const p = standInPool([
		{ id: 'a', kind: 'postgres', family: 'rdbms', driver: tableListing(3) },
		{ id: 'b', kind: 'postgres', family: 'rdbms', driver: stalledSql },
		{ id: 'c', kind: 'postgres', family: 'rdbms', driver: tableListing(4) },
		{ id: 'd', kind: 'postgres', family: 'rdbms', driver: tableListing(1), stalled: true },
	]);
	const started = Date.now();
	const m = await measureResolvedScope(repoScope(), 'data', undefined, { sourceTimeoutMs: 50 });
	const took = Date.now() - started;
	assert.deepEqual(p.acquired, ['a', 'b', 'c', 'd'], 'every connection was asked, the ones after a stalled one too');
	assert.deepEqual(undetermined(m), UNDETERMINED);
	assert.equal(m.note,
		`2 of the 4 connections registered at ${BIG} could not be counted: ${timedOut('b', 0.05)}; ${timedOut('d', 0.05)}; ` +
		'7 objects were counted in the other 2');
	// Two stalled connections, one limit each, one after the other.
	assert.ok(took >= 95 && took < 3000, `two limits were waited (${took} ms)`);
	assert.equal(p.reloads(), 1);
});

test('the rejection of a listing abandoned after its time limit is caught and is not an unhandled rejection', async () => {
	const unhandled: unknown[] = [];
	const onUnhandled = (err: unknown): void => { unhandled.push(err); };
	process.on('unhandledRejection', onUnhandled);
	try {
		let rejected = 0;
		const lateListing = { listTables: () => new Promise((_, reject) => setTimeout(() => { rejected += 1; reject(new Error('connection reset after the wait')); }, 60)) };
		const p = standInPool([
			{ id: 'late-listing', kind: 'postgres', family: 'rdbms', driver: lateListing },
			{ id: 'late-result',  kind: 'postgres', family: 'rdbms', driver: { listTables: () => new Promise(resolve => setTimeout(() => resolve({ target: 't', tables: tables(9), truncated: false }), 60)) } },
		]);
		const m = await measureDataSource({ poolPath: BIG, connectionId: 'late-listing' }, undefined, { sourceTimeoutMs: 15 });
		assert.equal(m.note, timedOut('late-listing', 0.015));
		// A result that arrives after the wait does not change the measure that was returned.
		const late = await measureDataSource({ poolPath: BIG, connectionId: 'late-result' }, undefined, { sourceTimeoutMs: 15 });
		assert.deepEqual([undetermined(late), late.note], [UNDETERMINED, timedOut('late-result', 0.015)]);
		// Let both abandoned calls end.
		await new Promise(resolve => setTimeout(resolve, 150));
		assert.equal(rejected, 1, 'the abandoned listing did reject');
		assert.deepEqual(unhandled, []);
		assert.deepEqual([undetermined(late), late.note], [UNDETERMINED, timedOut('late-result', 0.015)]);
		assert.deepEqual(p.acquired, ['late-listing', 'late-result']);
	} finally {
		process.off('unhandledRejection', onUnhandled);
	}
});

test('the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds', async () => {
	standInPool([{ id: 'slow-sql', kind: 'postgres', family: 'rdbms', driver: stalledSql }]);
	let read = 0;
	_setMeasureDepsForTest({ sourceTimeoutMs: () => { read += 1; return 30; } });
	const noteWith = async (options?: Parameters<typeof measureDataSource>[2]): Promise<string | undefined> =>
		(await measureDataSource({ poolPath: BIG, connectionId: 'slow-sql' }, undefined, options)).note;
	// No option: the configured value, read for this source.
	assert.equal(await noteWith(), timedOut('slow-sql', 0.03));
	assert.equal(await noteWith({}), timedOut('slow-sql', 0.03));
	assert.equal(read, 2, 'the setting is read each time a source is measured');
	// A value in the options replaces it, and the setting is then not read.
	assert.equal(await noteWith({ sourceTimeoutMs: 50 }), timedOut('slow-sql', 0.05));
	assert.equal(read, 2);
	// A value that cannot be a time limit is treated as not passed.
	for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.equal(await noteWith({ sourceTimeoutMs: bad }), timedOut('slow-sql', 0.03), String(bad));
	}
	assert.equal(read, 6);
});

// ---------------------------------------------------------------------------
// The read of a symbol or a file scope (ISSUE-008e146a)
// ---------------------------------------------------------------------------

interface ReadCounts { whole: number; byId: number; byFile: number; indexCheck: number }

/**
 * Stand the real store's reads in, each behind a counter. `whole` is the
 * measure's own read of every entity of a repo; `indexCheck` is the same read
 * made by the scope resolution's index check, counted apart.
 */
function countingReads(over: { getEntity?: (id: string) => Promise<Entity | null>; listEntitiesOfFile?: (file: string) => Promise<readonly Entity[]> } = {}): ReadCounts {
	const calls: ReadCounts = { whole: 0, byId: 0, byFile: 0, indexCheck: 0 };
	_setMeasureDepsForTest({
		listEntities:       async repo => { calls.whole += 1; return listEntitiesForRepo(null, repo); },
		getEntity:          async id => { calls.byId += 1; return (over.getEntity ?? (i => getEntity(null, i)))(id); },
		listEntitiesOfFile: async file => { calls.byFile += 1; return (over.listEntitiesOfFile ?? (f => findEntitiesByFile(null, f)))(file); },
		scope:              scopeReaders({ listEntitiesForRepo: async repo => { calls.indexCheck += 1; return listEntitiesForRepo(null, repo); } }),
	});
	return calls;
}
const reset = (calls: ReadCounts): void => { calls.whole = 0; calls.byId = 0; calls.byFile = 0; calls.indexCheck = 0; };

test('a symbol scope is measured with one read by id and a file scope with the read of that file\'s entities; the measure of a resolved scope (measureResolvedScope) asks the store for every entity of the repository in neither case, and the counts and the size equal those of the whole-repository read; driven through measureRequestScope for a code request, the index check of the scope resolution is the only whole-repository read', async () => {
	const file = join(BIG, 'pay/settle.ts');
	const symbolRef = ref('symbol', `${file}#refund`);
	const fileRef = ref('file', file);
	const symbolScope = await resolveScopeForTarget(symbolRef, 'code', scopeReaders());
	const fileScope = await resolveScopeForTarget(fileRef, 'code', scopeReaders());
	assert.deepEqual([symbolScope.kind, symbolScope.repoPath, fileScope.kind, fileScope.filePath], ['symbol', BIG, 'file', file]);
	// What the whole-repository read gives for the same stored entities.
	const everything = await listEntitiesForRepo(null, BIG);
	assert.equal(everything.length, 60);
	const wholeSymbol = measureNamedArea(symbolScope, everything);
	const wholeFile = measureNamedArea(fileScope, everything);

	const calls = countingReads();
	// --- a resolved symbol scope: one read by id, nothing else ---
	const symbol = await measureResolvedScope(symbolScope, 'code');
	assert.deepEqual(calls, { whole: 0, byId: 1, byFile: 0, indexCheck: 0 });
	assert.deepEqual(symbol, wholeSymbol);
	assert.deepEqual(counts(symbol), { source: 'named-area', items: 1, files: 1, size: 'XS', determined: true });
	// --- a resolved file scope: the read of that file's entities, nothing else ---
	reset(calls);
	const inFile = await measureResolvedScope(fileScope, 'code');
	assert.deepEqual(calls, { whole: 0, byId: 0, byFile: 1, indexCheck: 0 });
	assert.deepEqual(inFile, wholeFile);
	assert.deepEqual(counts(inFile), { source: 'named-area', items: 3, files: 1, size: 'XS', determined: true });
	// The docs and generic families read the same way; a stated size is kept as the hint.
	reset(calls);
	assert.deepEqual(await measureResolvedScope(fileScope, 'docs', 'L'), { ...wholeFile, sizeHint: 'L' });
	assert.deepEqual(await measureResolvedScope(symbolScope, 'generic'), wholeSymbol);
	assert.deepEqual(calls, { whole: 0, byId: 1, byFile: 1, indexCheck: 0 });

	// --- through measureRequestScope, for a code request: the index check is the only whole-repository read ---
	for (const [scopeRef, expected] of [[fileRef, wholeFile], [symbolRef, wholeSymbol]] as const) {
		reset(calls);
		assert.deepEqual(await measureRequestScope(scopeRef, 'code'), expected, scopeRef.kind);
		assert.deepEqual([calls.whole, calls.indexCheck], [0, 1], `${scopeRef.kind}: the measure's own read is gone, the index check's remains`);
	}
	// A generic request has no index check: no whole-repository read at all.
	reset(calls);
	assert.deepEqual(await measureRequestScope(fileRef, 'generic'), wholeFile);
	assert.deepEqual([calls.whole, calls.indexCheck], [0, 0]);

	// --- an entity with no file path: one item, no file ---
	const refund = (await getEntity(null, symbolScope.entityId!))!;
	countingReads({ getEntity: async () => ({ ...refund, file: '' }) });
	assert.deepEqual(counts(await measureResolvedScope(symbolScope, 'code')), { source: 'named-area', items: 1, files: 0, size: 'XS', determined: true });
});

test('a symbol or file scope whose narrow read finds nothing, or finds entities of another repository only, is read as before with the same result; a repo, module or directory scope is read as before', async () => {
	const file = join(BIG, 'pay/settle.ts');
	const symbolScope = await resolveScopeForTarget(ref('symbol', `${file}#refund`), 'code', scopeReaders());
	const fileScope = await resolveScopeForTarget(ref('file', file), 'code', scopeReaders());
	const everything = await listEntitiesForRepo(null, BIG);
	const elsewhere = await listEntitiesForRepo(null, SMALL);

	// --- a symbol the read by id does not find, or finds in another repository: the whole read, and its result ---
	let calls = countingReads({ getEntity: async () => null });
	assert.deepEqual(await measureResolvedScope(symbolScope, 'code'), measureNamedArea(symbolScope, everything));
	assert.deepEqual(calls, { whole: 1, byId: 1, byFile: 0, indexCheck: 0 });
	calls = countingReads({ getEntity: async () => elsewhere[0]! });
	assert.deepEqual(await measureResolvedScope(symbolScope, 'code'), measureNamedArea(symbolScope, everything));
	assert.deepEqual(calls, { whole: 1, byId: 1, byFile: 0, indexCheck: 0 });
	// An id that names nothing at all is, as before, a count of zero in an indexed repository.
	calls = countingReads();
	assert.deepEqual(counts(await measureResolvedScope({ ...symbolScope, entityId: 'no-such-entity' }, 'code')),
		{ source: 'named-area', items: 0, files: 0, size: 'XS', determined: true });
	assert.deepEqual(calls, { whole: 1, byId: 1, byFile: 0, indexCheck: 0 });

	// --- a file whose read finds entities of another repository only: they are not counted ---
	calls = countingReads({ listEntitiesOfFile: async () => elsewhere });
	assert.deepEqual(await measureResolvedScope(fileScope, 'code'), measureNamedArea(fileScope, everything));
	assert.deepEqual(calls, { whole: 1, byId: 0, byFile: 1, indexCheck: 0 });
	// --- a file with nothing stored, in an indexed repository: a count of zero, as before ---
	calls = countingReads();
	const vacant: ResolvedScope = { ...fileScope, value: join(BIG, 'vacant/none.ts'), filePath: join(BIG, 'vacant/none.ts') };
	assert.deepEqual(counts(await measureResolvedScope(vacant, 'code')), { source: 'named-area', items: 0, files: 0, size: 'XS', determined: true });
	assert.deepEqual(calls, { whole: 1, byId: 0, byFile: 1, indexCheck: 0 });
	// --- the same in a repository that holds no stored entity: not determined, with today's reason ---
	calls = countingReads();
	const unindexed: ResolvedScope = { kind: 'file', value: join(EMPTY, 'a.ts'), repoPath: EMPTY, lookupPath: EMPTY, filePath: join(EMPTY, 'a.ts') };
	const none = await measureResolvedScope(unindexed, 'code');
	assert.deepEqual(undetermined(none), UNDETERMINED);
	assert.equal(none.note, `the index holds nothing for the path ${EMPTY}: the repository ${EMPTY} holds no stored entity`);
	assert.deepEqual(calls, { whole: 1, byId: 0, byFile: 1, indexCheck: 0 });
	// --- a file scope with no file path, a symbol scope with no entity id: the whole read only ---
	calls = countingReads();
	const { filePath: _noPath, ...pathless } = fileScope;
	const { entityId: _noId, ...idless } = symbolScope;
	assert.equal((await measureResolvedScope(pathless, 'code')).determined, true);
	assert.equal((await measureResolvedScope(idless, 'code')).determined, true);
	assert.deepEqual(calls, { whole: 2, byId: 0, byFile: 0, indexCheck: 0 });
	// --- a narrow read that fails: not determined, with the failure's reason, as for any failed read ---
	countingReads({ listEntitiesOfFile: async () => { throw new Error('the store is closed'); } });
	const failed = await measureResolvedScope(fileScope, 'code');
	assert.deepEqual([undetermined(failed), failed.note], [UNDETERMINED, 'the count could not be taken (the store is closed)']);

	// --- every other kind of scope: the whole read, and the counts it gave before ---
	calls = countingReads();
	const repo = await resolveScopeForTarget(ref('repo', BIG), 'code', scopeReaders());
	const module = await resolveScopeForTarget(ref('module', join(BIG, 'pay')), 'code', scopeReaders());
	const directory = await resolveScopeForTarget(ref('workspace', join(BIG, 'pay')), 'code', scopeReaders());
	assert.deepEqual(counts(await measureResolvedScope(repo, 'code')), { source: 'named-area', items: 60, files: 30, size: 'M', determined: true });
	assert.deepEqual(counts(await measureResolvedScope(module, 'code')), { source: 'named-area', items: 5, files: 2, size: 'S', determined: true });
	assert.deepEqual(counts(await measureResolvedScope(directory, 'code')), { source: 'named-area', items: 5, files: 2, size: 'S', determined: true });
	assert.deepEqual(calls, { whole: 3, byId: 0, byFile: 0, indexCheck: 0 });
});
