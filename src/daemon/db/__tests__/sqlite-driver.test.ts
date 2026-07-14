/**
 * SQLite driver end-to-end via the pool.
 *
 * Builds a tmp .sqlite file with a small users+orders schema (incl.
 * PK + FK); exercises describe + sample.
 */

import { describe, it, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

const originalHome = process.env['HOME'];
const tmpHome = mkdtempSync(join(tmpdir(), 'insrc-sqlite-'));
process.env['HOME'] = tmpHome;

await import('../drivers/sqlite.js');
const { DriverPool } = await import('../pool.js');
const { connectionsPath } = await import('../config.js');

const repoRoot = mkdtempSync(join(tmpdir(), 'insrc-sqlite-repo-'));
const dbPath = join(repoRoot, 'app.sqlite');

const seed = new BetterSqlite3(dbPath);
seed.exec(`
	CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT);
	CREATE TABLE orders (
		id INTEGER PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		amount REAL
	);
	INSERT INTO users (id, name, email) VALUES (1, 'alice', 'a@x'), (2, 'bob', NULL);
	INSERT INTO orders (id, user_id, amount) VALUES (1, 1, 12.5), (2, 2, 7.0), (3, 1, 99.99);
`);
seed.close();

async function writeConn(): Promise<void> {
	const p = connectionsPath(repoRoot);
	await mkdir(join(p, '..'), { recursive: true });
	await writeFile(p, JSON.stringify({
		connections: [{ id: 'app', kind: 'sqlite', path: 'app.sqlite' }],
	}), 'utf8');
}

describe('SqliteDriver (via pool)', () => {
	it('describe returns columns + PK + FK + nullability', async () => {
		await writeConn();
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		assert.equal(drv.family, 'rdbms');

		const schema = await (drv as { describe: (t: string) => Promise<unknown> }).describe('users');
		const cols = (schema as { columns: { name: string; primaryKey?: boolean; nullable?: boolean }[] }).columns;
		const byName = new Map(cols.map(c => [c.name, c]));
		assert.equal(byName.get('id')?.primaryKey, true);
		assert.equal(byName.get('name')?.nullable, false);
		assert.equal(byName.get('email')?.nullable, true);

		const ordersSchema = await (drv as { describe: (t: string) => Promise<unknown> }).describe('orders');
		const ordersCols = (ordersSchema as { columns: { name: string; foreignKey?: { table: string; column: string } }[] }).columns;
		const fk = ordersCols.find(c => c.name === 'user_id')?.foreignKey;
		assert.deepEqual(fk, { table: 'users', column: 'id' });

		await pool.closeAll();
	});

	it('sample with where + limit', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		const res = await (drv as { sample: (t: string, o: unknown) => Promise<unknown> }).sample(
			'orders',
			{ limit: 10, where: [{ column: 'user_id', op: '=', value: 1 }] },
		);
		const rows = (res as { rows: { id: number }[] }).rows;
		assert.equal(rows.length, 2);
		assert.deepEqual(rows.map(r => r.id).sort(), [1, 3]);
		await pool.closeAll();
	});

	it('rejects unknown columns in where', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		await assert.rejects(
			(drv as { sample: (t: string, o: unknown) => Promise<unknown> }).sample(
				'users',
				{ limit: 10, where: [{ column: 'no_such', op: '=', value: 1 }] },
			),
			/unknown column 'no_such'/,
		);
		await pool.closeAll();
	});

	it('rejects invalid target identifiers', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		await assert.rejects(
			(drv as { describe: (t: string) => Promise<unknown> }).describe('users; DROP TABLE users'),
			/invalid table identifier/,
		);
		await pool.closeAll();
	});

	// -------------------------------------------------------------------------
	// aggregate() -- Phase 0.1 of plans/analyzers/data-analyzer-skills.md
	// -------------------------------------------------------------------------

	it('aggregate count / sum / avg / min / max returns flat numeric record', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		const res = await (drv as {
			aggregate: (t: string, r: unknown) => Promise<{ target: string; values: Record<string, number | null> }>;
		}).aggregate('orders', {
			aggregations: [
				{ column: '*',      function: 'count' },
				{ column: 'amount', function: 'sum' },
				{ column: 'amount', function: 'avg' },
				{ column: 'amount', function: 'min' },
				{ column: 'amount', function: 'max' },
				{ column: 'user_id', function: 'distinct_count' },
				{ column: 'amount', function: 'count_non_null' },
			],
		});
		assert.equal(res.target, 'orders');
		assert.equal(res.values['*__count'], 3);
		assert.equal(Math.round((res.values['amount__sum'] ?? 0) * 100), 11949); // 119.49
		assert.equal(Math.round((res.values['amount__avg'] ?? 0) * 1000), 39830); // 39.83
		assert.equal(res.values['amount__min'], 7);
		assert.equal(res.values['amount__max'], 99.99);
		assert.equal(res.values['user_id__distinct_count'], 2);
		assert.equal(res.values['amount__count_non_null'], 3);
		await pool.closeAll();
	});

	it('aggregate rejects unknown columns and invalid target', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		await assert.rejects(
			(drv as { aggregate: (t: string, r: unknown) => Promise<unknown> }).aggregate(
				'orders',
				{ aggregations: [{ column: 'discount', function: 'avg' }] },
			),
			/unknown column 'discount'/,
		);
		await assert.rejects(
			(drv as { aggregate: (t: string, r: unknown) => Promise<unknown> }).aggregate(
				'orders; DROP TABLE',
				{ aggregations: [{ column: '*', function: 'count' }] },
			),
			/invalid table identifier/,
		);
		await pool.closeAll();
	});

	// -------------------------------------------------------------------------
	// histogram() -- Phase 0.2
	// -------------------------------------------------------------------------

	it('histogram equal-width returns bucket counts spanning min..max', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		const res = await (drv as {
			histogram: (t: string, r: unknown) => Promise<{ target: string; column: string; mode: string; bounds: { lower: number | null; upper: number | null }; buckets: { lower: number; upper: number; count: number }[]; nonNullCount: number; nullCount: number }>;
		}).histogram('orders', { column: 'amount', buckets: 4, mode: 'equal-width' });
		assert.equal(res.target, 'orders');
		assert.equal(res.mode, 'equal-width');
		assert.equal(res.buckets.length, 4);
		assert.equal(res.bounds.lower, 7);
		assert.equal(res.bounds.upper, 99.99);
		assert.equal(res.nonNullCount, 3);
		const total = res.buckets.reduce((a, b) => a + b.count, 0);
		assert.equal(total, 3);
		await pool.closeAll();
	});

	it('histogram equal-frequency uses NTILE and returns per-bucket bounds', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		const res = await (drv as {
			histogram: (t: string, r: unknown) => Promise<{ buckets: { lower: number; upper: number; count: number }[]; mode: string; nonNullCount: number }>;
		}).histogram('orders', { column: 'amount', buckets: 4, mode: 'equal-frequency' });
		assert.equal(res.mode, 'equal-frequency');
		// 3 non-null amounts split into 4 buckets -> one bucket may be empty.
		const total = res.buckets.reduce((a, b) => a + b.count, 0);
		assert.equal(total, 3);
		await pool.closeAll();
	});

	// -------------------------------------------------------------------------
	// correlationMatrix() -- Phase 0.4
	// -------------------------------------------------------------------------

	it('correlationMatrix pearson via portable formula', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		const res = await (drv as {
			correlationMatrix: (t: string, r: unknown) => Promise<{ target: string; method: string; matrix: (number | null)[][]; nonNullCount: number }>;
		}).correlationMatrix('orders', { columns: ['user_id', 'amount'], method: 'pearson' });
		assert.equal(res.target, 'orders');
		assert.equal(res.method, 'pearson');
		assert.equal(res.matrix.length, 2);
		assert.equal(res.matrix[0]?.[0], 1);
		assert.equal(res.matrix[1]?.[1], 1);
		// Symmetric.
		assert.equal(res.matrix[0]?.[1], res.matrix[1]?.[0]);
		// All three rows have user_id + amount non-null -> n = 3.
		assert.equal(res.nonNullCount, 3);
		await pool.closeAll();
	});

	it('correlationMatrix spearman ranks then correlates', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		const res = await (drv as {
			correlationMatrix: (t: string, r: unknown) => Promise<{ method: string; matrix: (number | null)[][] }>;
		}).correlationMatrix('orders', { columns: ['user_id', 'amount'], method: 'spearman' });
		assert.equal(res.method, 'spearman');
		assert.equal(res.matrix.length, 2);
		await pool.closeAll();
	});

	it('count_where with regex op uses the registered REGEXP function (Phase 5d.3 Gap 1)', async () => {
		// SQLite's REGEXP operator is unimplemented by default --
		// `WHERE col REGEXP pattern` errors with "no such function:
		// REGEXP". The driver registers a JS implementation at connect
		// time; this test confirms a count_where aggregate using
		// `regex` reaches the JS function and returns a plausible
		// match count. Pattern matches a@x (the one non-null email);
		// the other row's email is NULL, so we expect matchCount=1.
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		const res = await (drv as { aggregate: (t: string, r: unknown) => Promise<unknown> }).aggregate(
			'users',
			{
				aggregations: [
					{ column: 'email', function: 'count' },
					{ column: 'email', function: 'count_non_null' },
					{
						column: 'email',
						function: 'count_where',
						args: { predicate: [{ column: 'email', op: 'regex', value: '^.+@.+$' }] },
					},
				],
			},
		);
		const values = (res as { values: Record<string, number> }).values;
		assert.equal(values['email__count'], 2);
		assert.equal(values['email__count_non_null'], 1);
		assert.equal(values['email__count_where_email_regex'], 1);
		await pool.closeAll();
	});

	it('temporalTrend recovers slope/intercept/R² via expression-based regression (Phase 5g.1)', async () => {
		// Seed a small (timestamp, value) table where value = 2 + 3 * (epoch_seconds_since_t0).
		// SQLite has no native REGR_*; the driver takes the expression-based
		// path (SUM moments + JS computation) and the slope should recover
		// to ~3 per second. Datetimes stored as ISO strings so SQLite's
		// `unixepoch()` works.
		const tsPath = join(repoRoot, 'ts.sqlite');
		const seedTs = new BetterSqlite3(tsPath);
		seedTs.exec(`
			CREATE TABLE events (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, val REAL NOT NULL);
		`);
		const t0 = 1735689600; // 2025-01-01 00:00 UTC
		const ins = seedTs.prepare('INSERT INTO events (id, ts, val) VALUES (?, ?, ?)');
		for (let i = 0; i < 10; i++) {
			const ts = new Date((t0 + i) * 1000).toISOString();
			const val = 2 + 3 * i;  // exact line: intercept depends on t0
			ins.run(i + 1, ts, val);
		}
		seedTs.close();

		const p = connectionsPath(repoRoot);
		await mkdir(join(p, '..'), { recursive: true });
		await writeFile(p, JSON.stringify({
			connections: [{ id: 'ts', kind: 'sqlite', path: 'ts.sqlite' }],
		}), 'utf8');

		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('ts');
		const r = await (drv as { temporalTrend: (t: string, req: unknown) => Promise<{ n: number; slope: number; intercept: number; r2: number; minTimestampEpoch: number; maxTimestampEpoch: number }> }).temporalTrend(
			'events', { timestampColumn: 'ts', valueColumn: 'val' },
		);
		assert.equal(r.n, 10);
		// slope = 3 per second (val grows by 3 each second of epoch)
		assert.ok(Math.abs(r.slope - 3) < 1e-6, `expected slope ~3 per sec, got ${r.slope}`);
		// R² = 1 (perfect line)
		assert.ok(Math.abs(r.r2 - 1) < 1e-6, `expected R² ~1, got ${r.r2}`);
		assert.equal(r.minTimestampEpoch, t0);
		assert.equal(r.maxTimestampEpoch, t0 + 9);
		await pool.closeAll();
	});

	it('aggregate stddev surfaces SQLite-no-such-function as a clean engine error', async () => {
		// SQLite has no built-in STDDEV_SAMP; the engine error reaches
		// the tool layer verbatim and surfaces as `success: false` to
		// the LLM. Confirms the per-dialect coverage gap is honest
		// rather than silently returning fabricated zeros.
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('app');
		await assert.rejects(
			(drv as { aggregate: (t: string, r: unknown) => Promise<unknown> }).aggregate(
				'orders',
				{ aggregations: [{ column: 'amount', function: 'stddev' }] },
			),
			/no such function: STDDEV_SAMP/i,
		);
		await pool.closeAll();
	});
});

after(() => {
	if (originalHome !== undefined) { process.env['HOME'] = originalHome; }
	else { delete process.env['HOME']; }
	try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
	try { rmSync(repoRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});
