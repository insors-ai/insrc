/**
 * DuckDB-backed FileDriver -- converted kinds
 * (plans/data-driver-duckdb-files.md Phase 2 + 3 + 4.5).
 *
 * Stages each non-native source format through its converter into the
 * `~/.insrc/cache/file-converted/` Parquet cache, then exercises the
 * unified DuckDB SQL surface (describe / sample / aggregate). The
 * cache lifecycle (sidecar invalidation, in-memory mutex, eviction) is
 * exercised implicitly: re-opening the same connection hits the cache.
 *
 * Skipped under CI without `bson` / `avsc` / `exceljs`: the daemon
 * already ships these as deps, so the only env constraint is DuckDB.
 */

import { describe, it, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BSON } from 'bson';
import avsc from 'avsc';
import ExcelJS from 'exceljs';

const originalHome = process.env['HOME'];
const tmpHome = mkdtempSync(join(tmpdir(), 'insrc-duckdb-conv-home-'));
process.env['HOME'] = tmpHome;

await import('../drivers/duckdb-file.js');

const { DriverPool } = await import('../pool.js');
const { connectionsPath } = await import('../config.js');
const { closeDuckDB } = await import('../duckdb-pool.js');

const repoRoot = mkdtempSync(join(tmpdir(), 'insrc-duckdb-conv-repo-'));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Fixed-width: write three rows with id (5), name (10), amount (10).
const fwPath = join(repoRoot, 'orders.dat');
writeFileSync(fwPath,
	'00001alice     0000012500\n' +
	'00002bob       0000007000\n' +
	'00003alice     0000099900\n',
	'utf8',
);

// BSON: write three documents back-to-back.
const bsonPath = join(repoRoot, 'orders.bson');
{
	const docs = [
		{ id: 1, user: 'alice', amount: 12.5 },
		{ id: 2, user: 'bob',   amount: 7.0  },
		{ id: 3, user: 'alice', amount: 99.9 },
	];
	const bufs = docs.map(d => Buffer.from(BSON.serialize(d)));
	writeFileSync(bsonPath, Buffer.concat(bufs));
}

// Avro: write three records via avsc's BlockEncoder.
const avroPath = join(repoRoot, 'orders.avro');
async function writeAvro(): Promise<void> {
	const schema = avsc.Type.forSchema({
		type: 'record',
		name: 'Order',
		fields: [
			{ name: 'id',     type: 'long'   },
			{ name: 'user',   type: 'string' },
			{ name: 'amount', type: 'double' },
		],
	});
	const encoder = avsc.createFileEncoder(avroPath, schema);
	encoder.write({ id: 1, user: 'alice', amount: 12.5 });
	encoder.write({ id: 2, user: 'bob',   amount: 7.0  });
	encoder.write({ id: 3, user: 'alice', amount: 99.9 });
	await new Promise<void>((resolve, reject) => {
		encoder.end(undefined, undefined, (err: Error | null | undefined) => {
			if (err === null || err === undefined) resolve(); else reject(err);
		});
	});
}
await writeAvro();

// XLSX: workbook with one sheet ("Orders") of three rows.
const xlsxPath = join(repoRoot, 'orders.xlsx');
async function writeXlsx(): Promise<void> {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Orders');
	ws.addRow(['id', 'user', 'amount']);
	ws.addRow([1, 'alice', 12.5]);
	ws.addRow([2, 'bob',   7.0 ]);
	ws.addRow([3, 'alice', 99.9]);
	await wb.xlsx.writeFile(xlsxPath);
}
await writeXlsx();

// XLSX (multi-sheet): two sheets with disjoint schemas; the driver
// must honor `target` to route to a specific sheet's parquet.
const xlsxMultiPath = join(repoRoot, 'workbook.xlsx');
async function writeXlsxMulti(): Promise<void> {
	const wb = new ExcelJS.Workbook();
	const ordersWs = wb.addWorksheet('Orders');
	ordersWs.addRow(['id', 'amount']);
	ordersWs.addRow([1, 10]);
	ordersWs.addRow([2, 20]);
	const usersWs = wb.addWorksheet('Users');
	usersWs.addRow(['user_id', 'name', 'email']);
	usersWs.addRow([100, 'alice', 'a@x']);
	usersWs.addRow([101, 'bob',   'b@x']);
	usersWs.addRow([102, 'carol', 'c@x']);
	await wb.xlsx.writeFile(xlsxMultiPath);
}
await writeXlsxMulti();

async function writeConn(): Promise<void> {
	const p = connectionsPath(repoRoot);
	await mkdir(join(p, '..'), { recursive: true });
	await writeFile(p, JSON.stringify({
		connections: [
			{
				id:   'fw-orders',
				kind: 'fixed-width',
				path: 'orders.dat',
				options: {
					columns: [
						{ name: 'id',     start: 0,  length: 5,  type: 'integer' },
						{ name: 'user',   start: 5,  length: 10, type: 'string'  },
						{ name: 'amount', start: 15, length: 10, type: 'integer' },
					],
				},
			},
			{
				id:   'bson-orders',
				kind: 'bson',
				path: 'orders.bson',
			},
			{
				id:   'avro-orders',
				kind: 'avro',
				path: 'orders.avro',
			},
			{
				id:   'xlsx-orders',
				kind: 'xlsx',
				path: 'orders.xlsx',
			},
			{
				id:   'xlsx-multi',
				kind: 'xlsx',
				path: 'workbook.xlsx',
			},
		],
	}), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DuckDBFileDriver -- fixed-width via converter cache', () => {
	it('describe + sample + aggregate', async () => {
		await writeConn();
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('fw-orders');
		assert.equal(drv.family, 'file');
		assert.equal(drv.kind, 'fixed-width');

		const schema = await (drv as { describe: (t?: string) => Promise<{ columns: { name: string; type: string }[] }> }).describe();
		const names = schema.columns.map(c => c.name).sort();
		assert.deepEqual(names, ['amount', 'id', 'user']);

		const sample = await (drv as {
			sample: (t: string | undefined, o: unknown) => Promise<{ rows: { id: number; user: string; amount: number }[] }>;
		}).sample(undefined, {
			limit: 10,
			where: [{ column: 'user', op: '=', value: 'alice' }],
		});
		assert.equal(sample.rows.length, 2);
		assert.deepEqual(sample.rows.map(r => Number(r.id)).sort(), [1, 3]);

		const agg = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate(undefined, { aggregations: [
			{ column: '*',      function: 'count' },
			{ column: 'amount', function: 'sum'   },
		] });
		assert.equal(agg.values['*__count'], 3);
		// 12500 + 7000 + 99900 = 119400
		assert.equal(agg.values['amount__sum'], 119400);

		await pool.closeAll();
	});

	it('cache hit on re-open (sidecar valid)', async () => {
		// Re-open the same connection; the converter shouldn't re-run
		// because the source file's mtime + size haven't changed.
		// We can't observe the converter call directly, so verify the
		// behaviour: a second describe() returns the same schema in
		// reasonable time.
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('fw-orders');
		const t0 = Date.now();
		await (drv as { describe: () => Promise<unknown> }).describe();
		const elapsed = Date.now() - t0;
		// First call paid for the conversion in the previous test; this
		// one only does DuckDB DESCRIBE on the cached parquet. Even on a
		// cold node-test run, this is well under a second.
		assert.ok(elapsed < 5000, `describe took ${elapsed}ms`);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- bson via converter cache', () => {
	it('describe + aggregate', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('bson-orders');
		assert.equal(drv.kind, 'bson');

		const schema = await (drv as { describe: (t?: string) => Promise<{ columns: { name: string; type: string }[] }> }).describe();
		const names = schema.columns.map(c => c.name).sort();
		assert.deepEqual(names, ['amount', 'id', 'user']);

		const agg = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate(undefined, { aggregations: [
			{ column: '*',      function: 'count' },
			{ column: 'amount', function: 'sum'   },
			{ column: 'user',   function: 'distinct_count' },
		] });
		assert.equal(agg.values['*__count'], 3);
		// 12.5 + 7.0 + 99.9 = 119.4
		assert.equal(Math.round((agg.values['amount__sum'] ?? 0) * 10), 1194);
		assert.equal(agg.values['user__distinct_count'], 2);

		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- avro via converter cache', () => {
	it('describe + aggregate', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('avro-orders');
		assert.equal(drv.kind, 'avro');

		const schema = await (drv as { describe: (t?: string) => Promise<{ columns: { name: string; type: string }[] }> }).describe();
		const names = schema.columns.map(c => c.name).sort();
		assert.deepEqual(names, ['amount', 'id', 'user']);

		const agg = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate(undefined, { aggregations: [
			{ column: '*',      function: 'count' },
			{ column: 'amount', function: 'sum'   },
		] });
		assert.equal(agg.values['*__count'], 3);
		assert.equal(Math.round((agg.values['amount__sum'] ?? 0) * 10), 1194);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- xlsx via converter cache (per-sheet glob)', () => {
	it('aggregate over single-sheet workbook', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('xlsx-orders');
		assert.equal(drv.kind, 'xlsx');

		// xlsx writes per-sheet parquets inside a directory; the
		// driver globs them, so a single-sheet workbook reads as one
		// table with the three rows we wrote.
		const agg = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate(undefined, { aggregations: [
			{ column: '*', function: 'count' },
		] });
		assert.equal(agg.values['*__count'], 3);
		await pool.closeAll();
	});

	it('honors target -> per-sheet selection', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('xlsx-multi');

		// Orders sheet: 2 rows, sum(amount)=30
		const ordersAgg = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null>; target: string }>;
		}).aggregate('Orders', { aggregations: [
			{ column: '*',      function: 'count' },
			{ column: 'amount', function: 'sum'   },
		] });
		assert.equal(ordersAgg.values['*__count'],     2);
		assert.equal(ordersAgg.values['amount__sum'], 30);
		assert.equal(ordersAgg.target, 'Orders');

		// Users sheet: 3 rows, distinct schema (no `amount` col)
		const usersDescribe = await (drv as {
			describe: (t?: string) => Promise<{ columns: { name: string }[]; target: string }>;
		}).describe('Users');
		const userCols = usersDescribe.columns.map(c => c.name).sort();
		assert.deepEqual(userCols, ['email', 'name', 'user_id']);
		assert.equal(usersDescribe.target, 'Users');

		const usersAgg = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate('Users', { aggregations: [
			{ column: '*',       function: 'count'          },
			{ column: 'user_id', function: 'distinct_count' },
		] });
		assert.equal(usersAgg.values['*__count'],                3);
		assert.equal(usersAgg.values['user_id__distinct_count'], 3);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- directory-of-bson (Phase 4.5)', () => {
	it('aggregates across multiple bson files in a directory', async () => {
		const altRoot = mkdtempSync(join(tmpdir(), 'insrc-duckdb-bson-dir-repo-'));
		const dirRoot = join(altRoot, 'shards');
		await mkdir(dirRoot, { recursive: true });
		// shard a: id 1,2; shard b: id 3,4
		writeFileSync(join(dirRoot, 'a.bson'), Buffer.concat([
			Buffer.from(BSON.serialize({ id: 1, amount: 10 })),
			Buffer.from(BSON.serialize({ id: 2, amount: 20 })),
		]));
		writeFileSync(join(dirRoot, 'b.bson'), Buffer.concat([
			Buffer.from(BSON.serialize({ id: 3, amount: 30 })),
			Buffer.from(BSON.serialize({ id: 4, amount: 40 })),
		]));

		const altConfPath = connectionsPath(altRoot);
		await mkdir(join(altConfPath, '..'), { recursive: true });
		await writeFile(altConfPath, JSON.stringify({
			connections: [
				{ id: 'shards', kind: 'bson', path: 'shards' },
			],
		}), 'utf8');

		const pool = new DriverPool(altRoot);
		await pool.reload();
		const drv = await pool.acquire('shards');

		const agg = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate(undefined, { aggregations: [
			{ column: '*',      function: 'count' },
			{ column: 'amount', function: 'sum'   },
		] });
		assert.equal(agg.values['*__count'], 4);
		assert.equal(agg.values['amount__sum'], 100);

		await pool.closeAll();
		try { rmSync(altRoot, { recursive: true, force: true }); } catch { /* ignore */ }
	});
});

after(async () => {
	if (originalHome !== undefined) { process.env['HOME'] = originalHome; }
	else { delete process.env['HOME']; }
	try { await closeDuckDB(); } catch { /* ignore */ }
	try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
	try { rmSync(repoRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});
