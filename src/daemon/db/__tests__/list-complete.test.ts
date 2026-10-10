/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The complete mode of the data listings (LLD-b9d5c5c40df5a574-s2, task t2).
 *
 * Each driver's own listing method runs here against a stand-in client that
 * holds more objects than the limited mode returns, and that applies whatever
 * row limit the query it is given carries. SQLite runs against a real file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { KvNamespaceList, TableListing } from '../../../shared/db-driver.js';
import { CassandraDriver } from '../drivers/cassandra.js';
import { ClickHouseDriver } from '../drivers/clickhouse.js';
import { DynamoDriver } from '../drivers/dynamodb.js';
import { EtcdDriver } from '../drivers/etcd.js';
import { MongoDriver } from '../drivers/mongodb.js';
import { MssqlDriver } from '../drivers/mssql.js';
import { MysqlDriver } from '../drivers/mysql.js';
import { NatsKvDriver } from '../drivers/nats.js';
import { OracleDriver } from '../drivers/oracle.js';
import { PostgresDriver } from '../drivers/pg.js';
import { RedisDriver } from '../drivers/redis.js';
import { SqliteDriver } from '../drivers/sqlite.js';
import { listFilesForConnection } from '../list-files.js';

/** More than the limited mode's hard cap of 5,000 tables. */
const MANY = 6000;

type ListTables = (opts?: { schema?: string; limit?: number; complete?: boolean }) => Promise<TableListing>;
type ListNamespaces = (opts?: { limit?: number; complete?: boolean }) => Promise<KvNamespaceList>;

/** A driver instance with stand-in fields, built without its constructor (which would open a connection). */
function standIn<T extends object>(proto: T, fields: Record<string, unknown>): T {
	return Object.assign(Object.create(proto) as T, fields);
}

/** The row limit a query carries, by the clause each dialect uses; null when it carries none. */
function limitIn(sql: string): number | null {
	const m = /\bLIMIT (\d+)/.exec(sql) ?? /FETCH FIRST (\d+) ROWS ONLY/.exec(sql) ?? /\bTOP (\d+)\b/.exec(sql);
	return m === null ? null : Number(m[1]);
}
const first = <T>(rows: T[], sql: string): T[] => {
	const limit = limitIn(sql);
	return limit === null ? rows : rows.slice(0, limit);
};
const names = (n: number): string[] => Array.from({ length: n }, (_, i) => `t${String(i).padStart(5, '0')}`);

interface Relational { readonly label: string; readonly list: ListTables; readonly queries: string[] }

function relationalDrivers(): Relational[] {
	const out: Relational[] = [];

	// postgres: the pool's query answers information_schema rows.
	{
		const queries: string[] = [];
		const driver = standIn(PostgresDriver.prototype, { pool: { query: async (sql: string) => {
			queries.push(sql);
			return { rows: first(names(MANY).map(t => ({ table_schema: 'public', table_name: t, table_type: 'BASE TABLE' })), sql) };
		} } });
		out.push({ label: 'pg', list: o => driver.listTables(o), queries });
	}
	// mysql: the pool's query answers [rows, fields].
	{
		const queries: string[] = [];
		const driver = standIn(MysqlDriver.prototype, { pool: { query: async (sql: string) => {
			queries.push(sql);
			return [first(names(MANY).map(t => ({ TABLE_SCHEMA: 'app', TABLE_NAME: t, TABLE_TYPE: 'BASE TABLE' })), sql), []];
		} } });
		out.push({ label: 'mysql', list: o => driver.listTables(o), queries });
	}
	// oracle: a pooled connection's execute answers { rows }.
	{
		const queries: string[] = [];
		const conn = {
			execute: async (sql: string) => {
				queries.push(sql);
				return { rows: first(names(MANY).map(t => ({ OWNER: 'APP', NAME: t, KIND: 'table' })), sql) };
			},
			close: async () => undefined,
		};
		const driver = standIn(OracleDriver.prototype, { poolPromise: Promise.resolve({ getConnection: async () => conn }) });
		out.push({ label: 'oracle', list: o => driver.listTables(o), queries });
	}
	// mssql: the driver's own run() answers rows.
	{
		const queries: string[] = [];
		const driver = standIn(MssqlDriver.prototype, { run: async (sql: string) => {
			queries.push(sql);
			return first(names(MANY).map(t => ({ schema_name: 'dbo', name: t, kind: 'table' })), sql);
		} });
		out.push({ label: 'mssql', list: o => driver.listTables(o), queries });
	}
	return out;
}

test("the table listing of sqlite, pg and mysql applies no clamp in the complete mode, that of oracle and mssql builds its query without the row-limit clause, and the four namespace drivers' listing applies no limit; each behaves exactly as before without the mode; the file listing walks to the end when no limit is given; a ClickHouse source, whose listing throws, is not determined", async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-list-complete-'));
	try {
		// ---- sqlite, against a real file with more tables than the default limit of 500 ----
		const file = join(dir, 'many.db');
		const db = new DatabaseSync(file);
		for (const t of names(620)) db.exec(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY)`);
		db.close();
		const sqlite = new SqliteDriver('many', file);
		try {
			const all = await sqlite.listTables({ complete: true });
			assert.deepEqual([all.tables.length, all.truncated], [620, false], 'sqlite, complete');
			// The limit a caller passes is ignored in the complete mode.
			assert.equal((await sqlite.listTables({ complete: true, limit: 3 })).tables.length, 620);
			// Without the mode: the default limit and the caller's limit, as before.
			const limited = await sqlite.listTables();
			assert.deepEqual([limited.tables.length, limited.truncated], [500, true], 'sqlite, limited by default');
			assert.deepEqual(limited.tables.slice(0, 2), all.tables.slice(0, 2), 'the same rows in the same order');
			const three = await sqlite.listTables({ limit: 3 });
			assert.deepEqual([three.tables.length, three.truncated], [3, true]);
			assert.equal((await sqlite.listTables({ complete: false })).tables.length, 500, 'complete: false is the limited mode');
			assert.deepEqual(await sqlite.listTables({ schema: 'other', complete: true }), { target: 'sqlite:main', tables: [], truncated: false });
		} finally {
			await sqlite.close?.();
		}

		// ---- pg, mysql, oracle, mssql: the query each builds, and what comes back ----
		for (const r of relationalDrivers()) {
			// Complete: no row limit in the query, every table returned, nothing cut.
			const all = await r.list({ complete: true });
			assert.equal(limitIn(r.queries.at(-1)!), null, `${r.label}: the complete query carries no row limit: ${r.queries.at(-1)}`);
			assert.ok(!/LIMIT|FETCH FIRST|\bTOP\b/.test(r.queries.at(-1)!), `${r.label}: no row-limit clause`);
			assert.deepEqual([all.tables.length, all.truncated], [MANY, false], `${r.label}, complete`);
			await r.list({ complete: true, limit: 7 });
			assert.equal(limitIn(r.queries.at(-1)!), null, `${r.label}: a limit is ignored in the complete mode`);

			// Without the mode: the default of 500, the caller's limit, and the hard cap of 5,000, each asked for with one row more.
			const byDefault = await r.list();
			assert.equal(limitIn(r.queries.at(-1)!), 501, `${r.label}: default limit`);
			assert.deepEqual([byDefault.tables.length, byDefault.truncated], [500, true], `${r.label}, limited by default`);
			const seven = await r.list({ limit: 7 });
			assert.equal(limitIn(r.queries.at(-1)!), 8);
			assert.deepEqual([seven.tables.length, seven.truncated], [7, true]);
			const capped = await r.list({ limit: 999_999 });
			assert.equal(limitIn(r.queries.at(-1)!), 5001, `${r.label}: the hard cap`);
			assert.deepEqual([capped.tables.length, capped.truncated], [5000, true]);
			await r.list({ complete: false });
			assert.equal(limitIn(r.queries.at(-1)!), 501, `${r.label}: complete false is the limited mode`);
			// The two modes build the same query but for the limit clause.
			const strip = (sql: string): string => sql.replace(/\s*LIMIT \d+|\s*FETCH FIRST \d+ ROWS ONLY|TOP \d+ /g, '').replace(/\s+/g, ' ').trim();
			assert.equal(strip(r.queries[0]!), strip(r.queries[2]!), `${r.label}: one query, with or without its limit`);
		}

		// ---- the four namespace drivers ----
		const namespaceDrivers: Array<{ label: string; list: ListNamespaces; total: number }> = [];
		{
			// mongodb: two user databases of collections, and system databases that are skipped.
			const colls = (n: number) => ({ toArray: async () => names(n).map(name => ({ name })) });
			const client = {
				connect: async () => undefined,
				db: (name?: string) => name === undefined
					? { admin: () => ({ listDatabases: async () => ({ databases: [{ name: 'admin' }, { name: 'app' }, { name: 'local' }, { name: 'audit' }] }) }) }
					: { listCollections: () => colls(name === 'app' ? 900 : 400) },
			};
			const driver = standIn(MongoDriver.prototype, { client });
			namespaceDrivers.push({ label: 'mongodb', list: o => driver.listNamespaces(o), total: 1300 });
		}
		{
			// cassandra: one statement returns every table of every keyspace.
			const rows = [
				...names(1200).map(t => ({ keyspace_name: 'app', table_name: t })),
				...names(50).map(t => ({ keyspace_name: 'system_schema', table_name: t })),
			];
			const driver = standIn(CassandraDriver.prototype, { client: { execute: async () => ({ rows }) } });
			namespaceDrivers.push({ label: 'cassandra', list: o => driver.listNamespaces(o), total: 1200 });
		}
		{
			// dynamodb: pages of at most 100 names, each page naming where the next starts.
			const tables = names(1150);
			const client = { send: async (cmd: { input: { ExclusiveStartTableName?: string; Limit?: number } }) => {
				const from = cmd.input.ExclusiveStartTableName === undefined ? 0 : tables.indexOf(cmd.input.ExclusiveStartTableName) + 1;
				const page = tables.slice(from, from + Math.min(cmd.input.Limit ?? 100, 100));
				const last = from + page.length < tables.length ? page.at(-1) : undefined;
				return { TableNames: page, ...(last !== undefined ? { LastEvaluatedTableName: last } : {}) };
			} };
			const driver = standIn(DynamoDriver.prototype, { client });
			namespaceDrivers.push({ label: 'dynamodb', list: o => driver.listNamespaces(o), total: 1150 });
		}
		for (const n of namespaceDrivers) {
			const all = await n.list({ complete: true });
			assert.deepEqual([all.namespaces.length, all.truncated, all.supported], [n.total, false, true], `${n.label}, complete`);
			assert.equal((await n.list({ complete: true, limit: 5 })).namespaces.length, n.total, `${n.label}: a limit is ignored in the complete mode`);
			// Without the mode: 200 by default, the caller's limit, and at most 1,000.
			const byDefault = await n.list();
			assert.deepEqual([byDefault.namespaces.length, byDefault.truncated], [200, true], `${n.label}, limited by default`);
			assert.deepEqual(byDefault.namespaces, all.namespaces.slice(0, 200), `${n.label}: the same namespaces in the same order`);
			const five = await n.list({ limit: 5 });
			assert.deepEqual([five.namespaces.length, five.truncated], [5, true]);
			const capped = await n.list({ limit: 999_999 });
			assert.deepEqual([capped.namespaces.length, capped.truncated], [1000, true], `${n.label}: the hard cap`);
		}
		// nats: the connection's one bucket is the whole listing in either mode.
		const nats = standIn(NatsKvDriver.prototype, { bucket: 'orders' });
		const bucket = { namespaces: [{ name: 'orders', kind: 'bucket' }], truncated: false, supported: true };
		assert.deepEqual(await nats.listNamespaces({ complete: true }), bucket);
		assert.deepEqual(await nats.listNamespaces(), bucket);

		// ---- redis and etcd ignore the mode: their listing is a sample of keys ----
		const keys = Array.from({ length: 7000 }, (_, i) => `/svc${i % 300}/k${i}`);
		const etcd = standIn(EtcdDriver.prototype, { client: { getAll: () => ({ prefix: () => ({ keys: async () => keys }) }) } });
		const etcdDefault = await etcd.listNamespaces();
		assert.deepEqual(await etcd.listNamespaces({ complete: true }), etcdDefault, 'etcd: the same sample with the mode');
		assert.deepEqual([etcdDefault.namespaces.length, etcdDefault.truncated], [200, true], 'etcd: 200 prefixes of a sample that was cut');
		const redisKeys = Array.from({ length: 7000 }, (_, i) => `svc${i % 300}:k${i}`);
		const redis = standIn(RedisDriver.prototype, { client: { scan: async (cursor: string) => {
			const from = Number(cursor);
			const batch = redisKeys.slice(from, from + 500);
			return [from + 500 >= redisKeys.length ? '0' : String(from + 500), batch];
		} } });
		const redisDefault = await redis.listNamespaces();
		assert.deepEqual(await redis.listNamespaces({ complete: true }), redisDefault, 'redis: the same sample with the mode');
		assert.equal(redisDefault.truncated, true, 'redis: its sample was cut, so it is never a count');

		// ---- the file listing ----
		const data = join(dir, 'data');
		const { mkdirSync } = await import('node:fs');
		mkdirSync(join(data, 'sub'), { recursive: true });
		for (let i = 0; i < 30; i++) writeFileSync(join(data, i % 2 === 0 ? '' : 'sub', `f${String(i).padStart(2, '0')}.csv`), 'a,b\n');
		const whole = await listFilesForConnection(data, { recursive: true });
		assert.deepEqual([whole.files.length, whole.truncated], [30, false], 'no limit: the walk goes to the end');
		const cut = await listFilesForConnection(data, { recursive: true, limit: 10 });
		assert.deepEqual([cut.files.length, cut.truncated], [10, true], 'a limit: as before');
		assert.deepEqual(cut.files, whole.files.slice(0, 10));
		const exact = await listFilesForConnection(data, { recursive: true, limit: 1000 });
		assert.deepEqual([exact.files.length, exact.truncated], [30, false]);

		// ---- ClickHouse: its table listing throws, with or without the mode, so its count cannot be taken ----
		const clickhouse = standIn(ClickHouseDriver.prototype, {}) as unknown as { listTables: ListTables };
		await assert.rejects(clickhouse.listTables({ complete: true }), /listTables\(\) not yet implemented for clickhouse/);
		await assert.rejects(clickhouse.listTables(), /listTables\(\) not yet implemented for clickhouse/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
