/**
 * DuckDB-backed FileDriver end-to-end (Phase 1 of
 * plans/data-driver-duckdb-files.md). Spins up a tmp dir + writes a
 * small CSV and a JSON-array doc, opens a connection per kind, and
 * exercises describe / sample / sampleShape / aggregate.
 *
 * Avoids better-sqlite3 / parquetjs-lite -- only Node + DuckDB +
 * the data-driver pool layer are involved, so the test runs in CI
 * without native-binding ABI alignment.
 */

import { describe, it, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalHome = process.env['HOME'];
const tmpHome = mkdtempSync(join(tmpdir(), 'insrc-duckdb-file-'));
process.env['HOME'] = tmpHome;

// Self-registers via top-level import.
await import('../drivers/duckdb-file.js');

const { DriverPool } = await import('../pool.js');
const { connectionsPath } = await import('../config.js');
const { closeDuckDB } = await import('../duckdb-pool.js');

const repoRoot = mkdtempSync(join(tmpdir(), 'insrc-duckdb-file-repo-'));
const csvPath  = join(repoRoot, 'orders.csv');
const jsonPath = join(repoRoot, 'orders.json');

writeFileSync(csvPath,
	'id,user_id,amount\n' +
	'1,1,12.5\n' +
	'2,2,7.0\n' +
	'3,1,99.99\n',
	'utf8',
);
writeFileSync(jsonPath,
	JSON.stringify([
		{ id: 1, user_id: 1, amount: 12.5,  meta: { tag: 'x' } },
		{ id: 2, user_id: 2, amount: 7.0,   meta: { tag: 'y' } },
		{ id: 3, user_id: 1, amount: 99.99, meta: { tag: 'x' } },
	]),
	'utf8',
);

async function writeConn(): Promise<void> {
	const p = connectionsPath(repoRoot);
	await mkdir(join(p, '..'), { recursive: true });
	await writeFile(p, JSON.stringify({
		connections: [
			{ id: 'csv-orders',  kind: 'csv',  path: 'orders.csv'  },
			{ id: 'json-orders', kind: 'json', path: 'orders.json' },
		],
	}), 'utf8');
}

describe('DuckDBFileDriver -- csv', () => {
	it('describe via DESCRIBE returns column / type', async () => {
		await writeConn();
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		assert.equal(drv.family, 'file');
		assert.equal(drv.kind, 'csv');

		const schema = await (drv as { describe: (t?: string) => Promise<{ columns: { name: string; type: string }[] }> }).describe();
		assert.deepEqual(schema.columns.map(c => c.name).sort(), ['amount', 'id', 'user_id']);
		// DuckDB's auto-detect picks numeric types for amount / id / user_id
		const amountType = schema.columns.find(c => c.name === 'amount')!.type;
		assert.match(amountType, /DOUBLE|FLOAT|DECIMAL/i);
		await pool.closeAll();
	});

	it('sample with where + limit returns matching rows', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			sample: (t: string | undefined, o: unknown) => Promise<{ rows: { id: number }[] }>;
		}).sample(undefined, {
			limit: 10,
			where: [{ column: 'user_id', op: '=', value: 1 }],
		});
		assert.equal(res.rows.length, 2);
		assert.deepEqual(res.rows.map(r => Number(r.id)).sort(), [1, 3]);
		await pool.closeAll();
	});

	it('aggregate count / sum / avg / min / max', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate(undefined, {
			aggregations: [
				{ column: '*',      function: 'count' },
				{ column: 'amount', function: 'sum' },
				{ column: 'amount', function: 'min' },
				{ column: 'amount', function: 'max' },
				{ column: 'user_id', function: 'distinct_count' },
				{ column: 'amount', function: 'percentile', args: { p: 0.5 } },
			],
		});
		assert.equal(res.values['*__count'], 3);
		// 12.5 + 7.0 + 99.99 = 119.49
		assert.equal(Math.round((res.values['amount__sum'] ?? 0) * 100), 11949);
		assert.equal(res.values['amount__min'], 7);
		assert.equal(res.values['amount__max'], 99.99);
		assert.equal(res.values['user_id__distinct_count'], 2);
		// median of [7.0, 12.5, 99.99] = 12.5
		assert.equal(res.values['amount__percentile_0_5'], 12.5);
		await pool.closeAll();
	});

	it('rejects unknown column in WHERE + invalid aggregate column', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		await assert.rejects(
			(drv as { sample: (t: string | undefined, o: unknown) => Promise<unknown> }).sample(
				undefined, { limit: 10, where: [{ column: 'no_such', op: '=', value: 1 }] },
			),
			/unknown column 'no_such'/,
		);
		await assert.rejects(
			(drv as { aggregate: (t: string | undefined, r: unknown) => Promise<unknown> }).aggregate(
				undefined, { aggregations: [{ column: 'discount', function: 'avg' }] },
			),
			/unknown column 'discount'/,
		);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- json', () => {
	it('describe + sample on JSON array', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('json-orders');
		assert.equal(drv.kind, 'json');

		const schema = await (drv as { describe: (t?: string) => Promise<{ columns: { name: string; type: string }[] }> }).describe();
		assert.ok(schema.columns.find(c => c.name === 'id'));
		assert.ok(schema.columns.find(c => c.name === 'amount'));
		assert.ok(schema.columns.find(c => c.name === 'meta'));

		const sample = await (drv as { sample: (t: string | undefined, o: unknown) => Promise<{ rows: unknown[] }> })
			.sample(undefined, { limit: 50 });
		assert.equal(sample.rows.length, 3);

		await pool.closeAll();
	});

	it('sampleShape on JSON array runs nested-shape inference', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('json-orders');
		const shape = await (drv as { sampleShape: (o: unknown) => Promise<{ sampleSize: number }> })
			.sampleShape({ limit: 10 });
		assert.ok(shape.sampleSize >= 1);
		await pool.closeAll();
	});

	it('aggregate over JSON', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('json-orders');
		const res = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate(undefined, {
			aggregations: [{ column: 'amount', function: 'avg' }],
		});
		// avg(12.5, 7.0, 99.99) = 39.83
		assert.equal(Math.round((res.values['amount__avg'] ?? 0) * 100), 3983);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- directory connection (Phase 4)', () => {
	it('aggregate over a directory of CSVs (recursive)', async () => {
		// Pool requires connection paths under the repo root, so set
		// up the directory tree INSIDE a tmp-repo.
		const altRoot = mkdtempSync(join(tmpdir(), 'insrc-duckdb-dir-repo-'));
		const dirRoot = join(altRoot, 'data');
		const subDir  = join(dirRoot, 'sub');
		await mkdir(subDir, { recursive: true });
		writeFileSync(join(dirRoot, 'a.csv'), 'id,amount\n1,10\n2,20\n', 'utf8');
		writeFileSync(join(subDir, 'b.csv'),  'id,amount\n3,30\n4,40\n', 'utf8');

		const altConfPath = connectionsPath(altRoot);
		await mkdir(join(altConfPath, '..'), { recursive: true });
		await writeFile(altConfPath, JSON.stringify({
			connections: [
				{ id: 'flat', kind: 'csv', path: 'data'                  },
				{ id: 'rec',  kind: 'csv', path: 'data', recursive: true },
			],
		}), 'utf8');

		const pool = new DriverPool(altRoot);
		await pool.reload();

		// Non-recursive: only top-level a.csv counts (2 rows, sum=30).
		const flat = await pool.acquire('flat');
		const flatRes = await (flat as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate(undefined, { aggregations: [
			{ column: '*',      function: 'count' },
			{ column: 'amount', function: 'sum'   },
		] });
		assert.equal(flatRes.values['*__count'],     2);
		assert.equal(flatRes.values['amount__sum'], 30);

		// Recursive: both files (4 rows, sum=100).
		const rec = await pool.acquire('rec');
		const recRes = await (rec as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | null> }>;
		}).aggregate(undefined, { aggregations: [
			{ column: '*',      function: 'count' },
			{ column: 'amount', function: 'sum'   },
		] });
		assert.equal(recRes.values['*__count'],      4);
		assert.equal(recRes.values['amount__sum'], 100);

		await pool.closeAll();
		try { rmSync(altRoot, { recursive: true, force: true }); } catch { /* ignore */ }
	});
});

describe('DuckDBFileDriver -- distinct (Phase 0.3)', () => {
	it('returns top-N most-frequent values + distinct cardinality', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			distinct: (t: string | undefined, r: unknown) => Promise<{
				column: string;
				distinctCount: number;
				topValues: { value: unknown; count: number }[];
			}>;
		}).distinct(undefined, { column: 'user_id', topN: 5 });

		assert.equal(res.column, 'user_id');
		assert.equal(res.distinctCount, 2);
		// alice rows have user_id=1 (2 rows); bob has user_id=2 (1 row)
		assert.equal(res.topValues.length, 2);
		assert.equal(Number(res.topValues[0]!.value), 1);
		assert.equal(res.topValues[0]!.count, 2);
		assert.equal(Number(res.topValues[1]!.value), 2);
		assert.equal(res.topValues[1]!.count, 1);
		await pool.closeAll();
	});

	it('rejects unknown column', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		await assert.rejects(
			(drv as { distinct: (t: string | undefined, r: unknown) => Promise<unknown> }).distinct(
				undefined, { column: 'no_such', topN: 5 },
			),
			/unknown column 'no_such'/,
		);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- 0.1.x extended aggregates', () => {
	it('skewness + kurtosis + mad return native DuckDB values', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | string | null> }>;
		}).aggregate(undefined, {
			aggregations: [
				{ column: 'amount', function: 'skewness' },
				{ column: 'amount', function: 'kurtosis' },
				{ column: 'amount', function: 'mad' },
			],
		});
		// DuckDB returns these as numeric scalars; readAggregateRow coerces.
		// The 3-row sample's stddev_samp is degenerate for kurtosis but the
		// result still types as number-or-null after coercion.
		const sk = res.values['amount__skewness'];
		const ku = res.values['amount__kurtosis'];
		const md = res.values['amount__mad'];
		assert.ok(sk === null || typeof sk === 'number', `skewness: ${typeof sk} ${JSON.stringify(sk)}`);
		assert.ok(ku === null || typeof ku === 'number', `kurtosis: ${typeof ku} ${JSON.stringify(ku)}`);
		assert.ok(md === null || typeof md === 'number', `mad: ${typeof md} ${JSON.stringify(md)}`);
		await pool.closeAll();
	});

	it('count_where on a predicate', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | string | null> }>;
		}).aggregate(undefined, {
			aggregations: [
				{
					column: '*', function: 'count_where',
					args: { predicate: [{ column: 'user_id', op: '=', value: 1 }] },
				},
			],
		});
		const key = Object.keys(res.values).find(k => k.startsWith('*__count_where_'));
		assert.ok(key !== undefined);
		// alice has 2 orders (user_id=1).
		assert.equal(res.values[key!], 2);
		await pool.closeAll();
	});

	it('count_where with the same predicate alongside global where', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | string | null> }>;
		}).aggregate(undefined, {
			where: [{ column: 'user_id', op: '!=', value: 999 }],  // matches all rows
			aggregations: [
				{
					column: '*', function: 'count_where',
					args: { predicate: [{ column: 'amount', op: '=', value: 12.5 }] },
				},
			],
		});
		const key = Object.keys(res.values).find(k => k.startsWith('*__count_where_'));
		assert.equal(res.values[key!], 1);
		await pool.closeAll();
	});

	it('composite_distinct_count counts unique (a, b) tuples', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			aggregate: (t: string | undefined, r: unknown) => Promise<{ values: Record<string, number | string | null> }>;
		}).aggregate(undefined, {
			aggregations: [
				{ column: '*', function: 'composite_distinct_count', args: { columns: ['user_id', 'amount'] } },
			],
		});
		const key = Object.keys(res.values).find(k => k.startsWith('*__composite_distinct_count_'));
		// 3 rows; (1, 12.5), (2, 7.0), (1, 99.99) -> 3 unique tuples.
		assert.equal(res.values[key!], 3);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- histogram (Phase 0.2)', () => {
	it('equal-width returns bucket counts spanning min..max', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			histogram: (t: string | undefined, r: unknown) => Promise<{ bounds: { lower: number | null; upper: number | null }; mode: string; buckets: { lower: number; upper: number; count: number }[]; nonNullCount: number }>;
		}).histogram(undefined, { column: 'amount', buckets: 4, mode: 'equal-width' });
		assert.equal(res.mode, 'equal-width');
		assert.equal(res.buckets.length, 4);
		assert.equal(res.bounds.lower, 7);
		assert.equal(res.bounds.upper, 99.99);
		assert.equal(res.buckets.reduce((a, b) => a + b.count, 0), 3);
		await pool.closeAll();
	});

	it('equal-frequency uses NTILE', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			histogram: (t: string | undefined, r: unknown) => Promise<{ mode: string; buckets: { count: number }[] }>;
		}).histogram(undefined, { column: 'amount', buckets: 4, mode: 'equal-frequency' });
		assert.equal(res.mode, 'equal-frequency');
		assert.equal(res.buckets.reduce((a, b) => a + b.count, 0), 3);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- correlation matrix (Phase 0.4)', () => {
	it('pearson native CORR()', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			correlationMatrix: (t: string | undefined, r: unknown) => Promise<{ matrix: (number | null)[][]; method: string; nonNullCount: number }>;
		}).correlationMatrix(undefined, { columns: ['user_id', 'amount'], method: 'pearson' });
		assert.equal(res.method, 'pearson');
		assert.equal(res.matrix[0]?.[0], 1);
		assert.equal(res.matrix[1]?.[1], 1);
		assert.equal(res.matrix[0]?.[1], res.matrix[1]?.[0]);
		assert.equal(res.nonNullCount, 3);
		await pool.closeAll();
	});

	it('spearman ranks then correlates', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			correlationMatrix: (t: string | undefined, r: unknown) => Promise<{ method: string; matrix: (number | null)[][] }>;
		}).correlationMatrix(undefined, { columns: ['user_id', 'amount'], method: 'spearman' });
		assert.equal(res.method, 'spearman');
		assert.equal(res.matrix.length, 2);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- outliers (Phase 0.5)', () => {
	it('iqr method returns counts + bounds + center + spread', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			outliers: (t: string | undefined, r: unknown) => Promise<{ method: string; threshold: number; nonNullCount: number; lowerBound: number | null; upperBound: number | null; belowCount: number; aboveCount: number; outlierCount: number; center: number | null; spread: number | null; examples: { value: number; side: string }[] }>;
		}).outliers(undefined, { column: 'amount', method: 'iqr' });
		assert.equal(res.method, 'iqr');
		assert.equal(res.threshold, 1.5);
		assert.equal(res.nonNullCount, 3);
		assert.equal(typeof res.center, 'number');
		assert.equal(typeof res.spread, 'number');
		assert.equal(res.outlierCount, res.belowCount + res.aboveCount);
		await pool.closeAll();
	});

	it('zscore method returns mean / stddev based bounds', async () => {
		const pool = new DriverPool(repoRoot);
		await pool.reload();
		const drv = await pool.acquire('csv-orders');
		const res = await (drv as {
			outliers: (t: string | undefined, r: unknown) => Promise<{ method: string; threshold: number; center: number | null; spread: number | null }>;
		}).outliers(undefined, { column: 'amount', method: 'zscore', threshold: 2 });
		assert.equal(res.method, 'zscore');
		assert.equal(res.threshold, 2);
		await pool.closeAll();
	});
});

describe('DuckDBFileDriver -- pool path-escape guard', () => {
	it('rejects file paths that escape the repo root', async () => {
		const badRoot = mkdtempSync(join(tmpdir(), 'insrc-duckdb-file-escape-'));
		const altConfPath = connectionsPath(badRoot);
		await mkdir(join(altConfPath, '..'), { recursive: true });
		await writeFile(altConfPath, JSON.stringify({
			connections: [{ id: 'escape', kind: 'csv', path: '../../etc/passwd' }],
		}), 'utf8');
		const pool = new DriverPool(badRoot);
		await pool.reload();
		await assert.rejects(pool.acquire('escape'), /resolves outside the repo root/);
		await pool.closeAll();
		try { rmSync(badRoot, { recursive: true, force: true }); } catch { /* ignore */ }
	});
});

describe('DuckDBFileDriver -- option validation', () => {
	it('rejects bad CSV delimiter at factory time', async () => {
		const altRoot = mkdtempSync(join(tmpdir(), 'insrc-duckdb-file-bad-'));
		writeFileSync(join(altRoot, 'orders.csv'), 'a,b\n1,2\n', 'utf8');
		const altConfPath = connectionsPath(altRoot);
		await mkdir(join(altConfPath, '..'), { recursive: true });
		await writeFile(altConfPath, JSON.stringify({
			connections: [{
				id: 'bad', kind: 'csv', path: 'orders.csv',
				options: { delimiter: "',quote=\"X\"" },  // injection-shaped
			}],
		}), 'utf8');
		const pool = new DriverPool(altRoot);
		await pool.reload();
		await assert.rejects(
			pool.acquire('bad'),
			/csv delimiter|unsupported character/i,
		);
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
