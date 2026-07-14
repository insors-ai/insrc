/**
 * Tests for daemon/db/drivers/rdbms-common.ts -- the shared
 * safety envelope around every RDBMS driver. Verifies:
 *   - identifier quoting + dialect differences
 *   - where compilation (parametrised, validates against known cols)
 *   - full SELECT assembly + DML/DDL denylist
 *   - withTimeout races
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
	MSSQL_DIALECT,
	MYSQL_DIALECT,
	ORACLE_DIALECT,
	POSTGRES_DIALECT,
	SQLITE_DIALECT,
	aggregateResultKey,
	buildSampleSql,
	compileAggregate,
	compileAggregateExprs,
	compileDistinct,
	compileTemporalTrend,
	compileWhere,
	looksLikeMutation,
	quoteTarget,
	readAggregateRow,
	readDistinctCount,
	readDistinctRows,
	readTemporalTrendRow,
	withTimeout,
} from '../drivers/rdbms-common.js';

// ---------------------------------------------------------------------------
// quoteTarget
// ---------------------------------------------------------------------------

describe('quoteTarget', () => {
	it('quotes a bare table name for each dialect', () => {
		assert.equal(quoteTarget('users', POSTGRES_DIALECT), '"users"');
		assert.equal(quoteTarget('users', MYSQL_DIALECT), '`users`');
		assert.equal(quoteTarget('users', SQLITE_DIALECT), '"users"');
		assert.equal(quoteTarget('users', MSSQL_DIALECT), '[users]');
		assert.equal(quoteTarget('users', ORACLE_DIALECT), '"users"');
	});

	it('quotes schema.table with a dot', () => {
		assert.equal(quoteTarget('public.users', POSTGRES_DIALECT), '"public"."users"');
		assert.equal(quoteTarget('dbo.Users', MSSQL_DIALECT), '[dbo].[Users]');
	});

	it('rejects identifiers with whitespace or SQL syntax', () => {
		assert.throws(() => quoteTarget('users; DROP TABLE', POSTGRES_DIALECT), /invalid table identifier/);
		assert.throws(() => quoteTarget('users table', POSTGRES_DIALECT), /invalid table identifier/);
		assert.throws(() => quoteTarget('1users', POSTGRES_DIALECT), /invalid table identifier/);
	});
});

// ---------------------------------------------------------------------------
// compileWhere
// ---------------------------------------------------------------------------

describe('compileWhere', () => {
	it('returns empty text + values for no clauses', () => {
		const r = compileWhere([], ['id'], POSTGRES_DIALECT);
		assert.equal(r.text, '');
		assert.deepEqual(r.values, []);
	});

	it('compiles = / != with parametrised placeholders (postgres)', () => {
		const r = compileWhere(
			[{ column: 'id', op: '=', value: 42 }, { column: 'name', op: '!=', value: 'bob' }],
			['id', 'name'],
			POSTGRES_DIALECT,
		);
		assert.equal(r.text, 'WHERE "id" = $1 AND "name" != $2');
		assert.deepEqual(r.values, [42, 'bob']);
	});

	it('compiles "in" with an array', () => {
		const r = compileWhere(
			[{ column: 'id', op: 'in', value: [1, 2, 3] }],
			['id'],
			POSTGRES_DIALECT,
		);
		assert.equal(r.text, 'WHERE "id" IN ($1, $2, $3)');
		assert.deepEqual(r.values, [1, 2, 3]);
	});

	it('compiles "is null" with no placeholder', () => {
		const r = compileWhere(
			[{ column: 'deleted_at', op: 'is null' }],
			['deleted_at'],
			POSTGRES_DIALECT,
		);
		assert.equal(r.text, 'WHERE "deleted_at" IS NULL');
		assert.deepEqual(r.values, []);
	});

	it('mysql uses `?` for every param', () => {
		const r = compileWhere(
			[{ column: 'a', op: '=', value: 1 }, { column: 'b', op: 'in', value: [2, 3] }],
			['a', 'b'],
			MYSQL_DIALECT,
		);
		assert.equal(r.text, 'WHERE `a` = ? AND `b` IN (?, ?)');
	});

	it('rejects unknown columns (defense against injection)', () => {
		assert.throws(
			() => compileWhere(
				[{ column: 'id"; DROP', op: '=', value: 1 }],
				['id'],
				POSTGRES_DIALECT,
			),
			/unknown column 'id"; DROP'/,
		);
	});

	it('rejects empty "in" arrays', () => {
		assert.throws(
			() => compileWhere([{ column: 'id', op: 'in', value: [] }], ['id'], POSTGRES_DIALECT),
			/non-empty array/,
		);
	});

	it('column lookup is case-insensitive', () => {
		const r = compileWhere(
			[{ column: 'Id', op: '=', value: 1 }],
			['id'],
			POSTGRES_DIALECT,
		);
		assert.equal(r.text, 'WHERE "Id" = $1');
	});

	// Phase 5d.3 Gap 1 -- regex / not regex predicates per dialect.
	describe('regex / not regex (Phase 5d.3 Gap 1)', () => {
		it('postgres uses ~ for regex and !~ for not regex', () => {
			const r = compileWhere(
				[{ column: 'email', op: 'regex', value: '^.+@.+$' }],
				['email'],
				POSTGRES_DIALECT,
			);
			assert.equal(r.text, 'WHERE "email" ~ $1');
			assert.deepEqual(r.values, ['^.+@.+$']);

			const n = compileWhere(
				[{ column: 'email', op: 'not regex', value: '^.+@.+$' }],
				['email'],
				POSTGRES_DIALECT,
			);
			assert.equal(n.text, 'WHERE "email" !~ $1');
		});

		it('mysql uses REGEXP / NOT REGEXP', () => {
			const r = compileWhere(
				[{ column: 'email', op: 'regex', value: '^.+@.+$' }],
				['email'],
				MYSQL_DIALECT,
			);
			assert.equal(r.text, 'WHERE `email` REGEXP ?');

			const n = compileWhere(
				[{ column: 'email', op: 'not regex', value: '^.+@.+$' }],
				['email'],
				MYSQL_DIALECT,
			);
			assert.equal(n.text, 'WHERE `email` NOT REGEXP ?');
		});

		it('sqlite uses REGEXP / NOT REGEXP (driver registers the function)', () => {
			const r = compileWhere(
				[{ column: 'email', op: 'regex', value: '^.+@.+$' }],
				['email'],
				SQLITE_DIALECT,
			);
			assert.equal(r.text, 'WHERE "email" REGEXP ?');
		});

		it('oracle uses REGEXP_LIKE function syntax', () => {
			const r = compileWhere(
				[{ column: 'email', op: 'regex', value: '^.+@.+$' }],
				['email'],
				ORACLE_DIALECT,
			);
			assert.equal(r.text, 'WHERE REGEXP_LIKE("email", :1)');

			const n = compileWhere(
				[{ column: 'email', op: 'not regex', value: '^.+@.+$' }],
				['email'],
				ORACLE_DIALECT,
			);
			assert.equal(n.text, 'WHERE NOT REGEXP_LIKE("email", :1)');
		});

		it('mssql throws -- no portable native regex (caller must avoid this op)', () => {
			assert.throws(
				() => compileWhere(
					[{ column: 'email', op: 'regex', value: '^.+@.+$' }],
					['email'],
					MSSQL_DIALECT,
				),
				/'regex' op is not supported on this dialect/,
			);
		});

		it('rejects non-string regex values', () => {
			assert.throws(
				() => compileWhere(
					// @ts-expect-error -- intentionally bad value type
					[{ column: 'email', op: 'regex', value: 42 }],
					['email'],
					POSTGRES_DIALECT,
				),
				/'regex' op requires a string value/,
			);
		});

		it('regex predicates compose with other clauses (parameter index shared)', () => {
			const r = compileWhere(
				[
					{ column: 'active', op: '=', value: true },
					{ column: 'email',  op: 'regex', value: '^.+@.+$' },
				],
				['active', 'email'],
				POSTGRES_DIALECT,
			);
			assert.equal(r.text, 'WHERE "active" = $1 AND "email" ~ $2');
			assert.deepEqual(r.values, [true, '^.+@.+$']);
		});
	});
});

// ---------------------------------------------------------------------------
// buildSampleSql
// ---------------------------------------------------------------------------

describe('buildSampleSql', () => {
	it('assembles SELECT * FROM ... LIMIT N on postgres', () => {
		const r = buildSampleSql('users', { limit: 10 }, ['id', 'name'], POSTGRES_DIALECT);
		assert.equal(r.text, 'SELECT * FROM "users" LIMIT 10');
		assert.deepEqual(r.values, []);
	});

	it('clamps the limit to SAMPLE_LIMIT (50)', () => {
		const r = buildSampleSql('users', { limit: 10_000 }, ['id'], POSTGRES_DIALECT);
		assert.match(r.text, /LIMIT 50$/);
	});

	it('emits TOP N for mssql instead of LIMIT', () => {
		const r = buildSampleSql('Users', { limit: 5 }, ['Id'], MSSQL_DIALECT);
		assert.equal(r.text, 'SELECT TOP 5 * FROM [Users]');
	});

	it('emits FETCH FIRST ... for oracle', () => {
		const r = buildSampleSql('USERS', { limit: 5 }, ['ID'], ORACLE_DIALECT);
		assert.match(r.text, /FETCH FIRST 5 ROWS ONLY$/);
	});

	it('includes the WHERE clause when provided', () => {
		const r = buildSampleSql(
			'users',
			{ limit: 10, where: [{ column: 'active', op: '=', value: true }] },
			['id', 'active'],
			POSTGRES_DIALECT,
		);
		assert.equal(r.text, 'SELECT * FROM "users" WHERE "active" = $1 LIMIT 10');
		assert.deepEqual(r.values, [true]);
	});
});

// ---------------------------------------------------------------------------
// looksLikeMutation
// ---------------------------------------------------------------------------

describe('looksLikeMutation', () => {
	it('flags DML/DDL keywords', () => {
		assert.equal(looksLikeMutation('SELECT * FROM u; DROP TABLE u'), true);
		assert.equal(looksLikeMutation('UPDATE u SET x=1'), true);
		assert.equal(looksLikeMutation('create table x'), true);
	});

	it('accepts clean SELECTs', () => {
		assert.equal(looksLikeMutation('SELECT * FROM users WHERE id = $1 LIMIT 10'), false);
	});
});

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

describe('withTimeout', () => {
	it('resolves when the op wins the race', async () => {
		const r = await withTimeout(Promise.resolve(42), 100);
		assert.equal(r, 42);
	});

	it('rejects with a typed message when the timer wins', async () => {
		const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 500));
		await assert.rejects(withTimeout(slow, 50), /timed out after 50ms/);
	});

	it('calls onTimeout() when it fires', async () => {
		let aborted = false;
		const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 500));
		await assert.rejects(withTimeout(slow, 50, () => { aborted = true; }));
		assert.equal(aborted, true);
	});
});

// ---------------------------------------------------------------------------
// Aggregate compilation (Phase 0.1 of plans/analyzers/data-analyzer-skills.md)
// ---------------------------------------------------------------------------

describe('aggregateResultKey', () => {
	it('formats <col>__<fn> for the simple cases', () => {
		assert.equal(
			aggregateResultKey({ column: 'price', function: 'avg' }),
			'price__avg',
		);
		assert.equal(
			aggregateResultKey({ column: 'id', function: 'distinct_count' }),
			'id__distinct_count',
		);
	});

	it('embeds the percentile fraction (with `.` -> `_`)', () => {
		assert.equal(
			aggregateResultKey({ column: 'price', function: 'percentile', args: { p: 0.95 } }),
			'price__percentile_0_95',
		);
	});

	it('rejects percentile spec missing args.p', () => {
		assert.throws(
			() => aggregateResultKey({ column: 'price', function: 'percentile' }),
			/percentile spec missing args\.p/,
		);
	});
});

describe('compileAggregateExprs', () => {
	it('emits one quoted-aliased expression per aggregation', () => {
		const out = compileAggregateExprs(
			{ aggregations: [
				{ column: '*',     function: 'count' },
				{ column: 'price', function: 'avg' },
				{ column: 'price', function: 'percentile', args: { p: 0.5 } },
			] },
			['price', 'qty'],
			POSTGRES_DIALECT,
		);
		assert.deepEqual([...out.keys], ['*__count', 'price__avg', 'price__percentile_0_5']);
		assert.equal(out.exprs.length, 3);
		assert.match(out.exprs[0]!, /^COUNT\(\*\) AS "\*__count"$/);
		assert.match(out.exprs[1]!, /^AVG\("price"\) AS "price__avg"$/);
		assert.match(out.exprs[2]!, /^PERCENTILE_CONT\(0\.5\) WITHIN GROUP \(ORDER BY "price"\) AS "price__percentile_0_5"$/);
	});

	it('rejects unknown columns (count exempt)', () => {
		// `count` doesn't reference a real column, so any column string passes.
		assert.doesNotThrow(() => compileAggregateExprs(
			{ aggregations: [{ column: 'totalRows', function: 'count' }] },
			['price'],
			POSTGRES_DIALECT,
		));
		assert.throws(
			() => compileAggregateExprs(
				{ aggregations: [{ column: 'discount', function: 'avg' }] },
				['price'],
				POSTGRES_DIALECT,
			),
			/unknown column 'discount'/,
		);
	});

	it('rejects duplicate result-keys', () => {
		assert.throws(
			() => compileAggregateExprs(
				{ aggregations: [
					{ column: 'price', function: 'avg' },
					{ column: 'price', function: 'avg' },
				] },
				['price'],
				POSTGRES_DIALECT,
			),
			/duplicate aggregate key 'price__avg'/,
		);
	});

	it('rejects empty aggregations', () => {
		assert.throws(
			() => compileAggregateExprs({ aggregations: [] }, ['price'], POSTGRES_DIALECT),
			/zero aggregations/,
		);
	});

	it('uses dialect-specific stddev / variance for MSSQL', () => {
		const out = compileAggregateExprs(
			{ aggregations: [
				{ column: 'price', function: 'stddev' },
				{ column: 'price', function: 'variance' },
			] },
			['price'],
			MSSQL_DIALECT,
		);
		assert.match(out.exprs[0]!, /^STDEV\(\[price\]\) AS \[price__stddev\]$/);
		assert.match(out.exprs[1]!, /^VAR\(\[price\]\) AS \[price__variance\]$/);
	});

	it('uses STDDEV_SAMP / VAR_SAMP for the SQL-standard dialects', () => {
		for (const d of [POSTGRES_DIALECT, MYSQL_DIALECT, ORACLE_DIALECT]) {
			const out = compileAggregateExprs(
				{ aggregations: [{ column: 'price', function: 'stddev' }] },
				['price'],
				d,
			);
			assert.match(out.exprs[0]!, /^STDDEV_SAMP\(/);
		}
	});

	it('rejects out-of-range percentile p', () => {
		assert.throws(
			() => compileAggregateExprs(
				{ aggregations: [{ column: 'price', function: 'percentile', args: { p: 1.5 } }] },
				['price'],
				POSTGRES_DIALECT,
			),
			/args\.p in \[0, 1\]/,
		);
	});

	// Phase 0.1.x extensions ------------------------------------------------

	it('renders skewness / kurtosis / mad as native function calls', () => {
		const out = compileAggregateExprs(
			{ aggregations: [
				{ column: 'price', function: 'skewness' },
				{ column: 'price', function: 'kurtosis' },
				{ column: 'price', function: 'mad' },
			] },
			['price'],
			POSTGRES_DIALECT,
		);
		assert.match(out.exprs[0]!, /^SKEWNESS\("price"\) AS "price__skewness"$/);
		assert.match(out.exprs[1]!, /^KURTOSIS\("price"\) AS "price__kurtosis"$/);
		assert.match(out.exprs[2]!, /^MAD\("price"\) AS "price__mad"$/);
	});

	it('count_where compiles SUM(CASE) with predicate parameters', () => {
		const out = compileAggregateExprs(
			{ aggregations: [{
				column: '*',
				function: 'count_where',
				args: { predicate: [{ column: 'status', op: '=', value: 'shipped' }] },
			}] },
			['status'],
			POSTGRES_DIALECT,
		);
		assert.match(out.exprs[0]!, /^SUM\(CASE WHEN "status" = \$1 THEN 1 ELSE 0 END\) AS "[*]__count_where_status_/);
		assert.deepEqual([...out.values], ['shipped']);
	});

	it('count_where threads param indices via paramStartIndex', () => {
		const out = compileAggregateExprs(
			{ aggregations: [{
				column: '*',
				function: 'count_where',
				args: { predicate: [{ column: 'status', op: '=', value: 'shipped' }] },
			}] },
			['status'],
			POSTGRES_DIALECT,
			5,
		);
		assert.match(out.exprs[0]!, /\$5/);
	});

	it('count_where rejects an empty predicate', () => {
		assert.throws(
			() => compileAggregateExprs(
				{ aggregations: [{ column: '*', function: 'count_where', args: { predicate: [] } }] },
				['status'],
				POSTGRES_DIALECT,
			),
			/non-empty WhereClause/,
		);
	});

	it('composite_distinct_count uses native (a, b) on Postgres', () => {
		const out = compileAggregateExprs(
			{ aggregations: [{ column: '*', function: 'composite_distinct_count', args: { columns: ['a', 'b'] } }] },
			['a', 'b'],
			POSTGRES_DIALECT,
		);
		assert.match(out.exprs[0]!, /^COUNT\(DISTINCT \("a", "b"\)\)/);
	});

	it('composite_distinct_count concats with sentinel on MySQL / SQLite / MSSQL', () => {
		for (const d of [MYSQL_DIALECT, SQLITE_DIALECT, MSSQL_DIALECT]) {
			const out = compileAggregateExprs(
				{ aggregations: [{ column: '*', function: 'composite_distinct_count', args: { columns: ['a', 'b'] } }] },
				['a', 'b'],
				d,
			);
			assert.match(out.exprs[0]!, /CAST\(.*?\) \|\|.*?CAST\(.*?\)/);
		}
	});

	it('composite_distinct_count rejects unknown columns + < 2 columns', () => {
		assert.throws(
			() => compileAggregateExprs(
				{ aggregations: [{ column: '*', function: 'composite_distinct_count', args: { columns: ['a'] } }] },
				['a', 'b'], POSTGRES_DIALECT,
			),
			/>= 2 entries/,
		);
		assert.throws(
			() => compileAggregateExprs(
				{ aggregations: [{ column: '*', function: 'composite_distinct_count', args: { columns: ['a', 'no_such'] } }] },
				['a', 'b'], POSTGRES_DIALECT,
			),
			/unknown column 'no_such'/,
		);
	});
});

describe('compileAggregate', () => {
	it('wraps exprs in a SELECT ... FROM <quotedTarget>', () => {
		const out = compileAggregate(
			'public.orders',
			{ aggregations: [
				{ column: '*',     function: 'count' },
				{ column: 'total', function: 'sum' },
			] },
			['total'],
			POSTGRES_DIALECT,
		);
		assert.equal(
			out.text,
			'SELECT COUNT(*) AS "*__count", SUM("total") AS "total__sum" FROM "public"."orders"',
		);
		assert.deepEqual([...out.values], []);
		assert.deepEqual([...out.keys], ['*__count', 'total__sum']);
	});

	it('refuses suspicious target identifiers', () => {
		assert.throws(
			() => compileAggregate(
				'orders; DROP TABLE',
				{ aggregations: [{ column: '*', function: 'count' }] },
				[],
				POSTGRES_DIALECT,
			),
			/invalid table identifier/,
		);
	});

	it('compiles a structured WHERE clause when supplied', () => {
		const out = compileAggregate(
			'public.events',
			{
				aggregations: [{ column: 'id', function: 'count_non_null' }],
				where: [
					{ column: 'period', op: '=',  value: 'this_week' },
					{ column: 'kind',   op: '!=', value: 'archived' },
				],
			},
			['id', 'period', 'kind'],
			POSTGRES_DIALECT,
		);
		assert.equal(
			out.text,
			'SELECT COUNT("id") AS "id__count_non_null" FROM "public"."events" WHERE "period" = $1 AND "kind" != $2',
		);
		assert.deepEqual([...out.values], ['this_week', 'archived']);
	});

	it('omits WHERE when the request has none (back-compat)', () => {
		const out = compileAggregate(
			'orders',
			{ aggregations: [{ column: 'total', function: 'sum' }] },
			['total'],
			POSTGRES_DIALECT,
		);
		assert.equal(out.text, 'SELECT SUM("total") AS "total__sum" FROM "orders"');
		assert.deepEqual([...out.values], []);
	});

	it('rejects WHERE on an unknown column', () => {
		assert.throws(
			() => compileAggregate(
				'orders',
				{
					aggregations: [{ column: 'total', function: 'sum' }],
					where: [{ column: 'phantom', op: '=', value: 1 }],
				},
				['total'],
				POSTGRES_DIALECT,
			),
			/unknown column 'phantom'/,
		);
	});
});

describe('readAggregateRow', () => {
	it('coerces number / bigint / numeric-string / null', () => {
		const out = readAggregateRow(
			{ a__count: 42, a__sum: 1234567890123n, a__avg: '3.14', a__min: null, a__max: undefined },
			['a__count', 'a__sum', 'a__avg', 'a__min', 'a__max'],
		);
		assert.equal(out['a__count'], 42);
		assert.equal(out['a__sum'], Number(1234567890123n));
		assert.equal(out['a__avg'], 3.14);
		assert.equal(out['a__min'], null);
		assert.equal(out['a__max'], null);
	});

	it('NaN / non-numeric / object becomes null', () => {
		const out = readAggregateRow(
			{ a__avg: 'not a number', b__sum: { whatever: true }, c__max: NaN },
			['a__avg', 'b__sum', 'c__max'],
		);
		assert.equal(out['a__avg'], null);
		assert.equal(out['b__sum'], null);
		assert.equal(out['c__max'], null);
	});

	it('preserves ISO date / datetime strings (temporal min/max)', () => {
		const out = readAggregateRow(
			{
				created_at__min: '2026-05-04',
				created_at__max: '2026-05-04T12:34:56Z',
				updated_at__max: new Date('2026-05-04T12:34:56Z'),
			},
			['created_at__min', 'created_at__max', 'updated_at__max'],
		);
		assert.equal(out['created_at__min'], '2026-05-04');
		assert.equal(out['created_at__max'], '2026-05-04T12:34:56Z');
		assert.equal(out['updated_at__max'], '2026-05-04T12:34:56.000Z');
	});
});

// ---------------------------------------------------------------------------
// compileDistinct + readDistinctRows + readDistinctCount
// (Phase 0.3 of plans/analyzers/data-analyzer-skills.md)
// ---------------------------------------------------------------------------

describe('compileDistinct', () => {
	it('produces a count-distinct + top-N pair for postgres', () => {
		const out = compileDistinct(
			'public.orders',
			{ column: 'user_id', topN: 5 },
			['id', 'user_id', 'amount'],
			POSTGRES_DIALECT,
		);
		assert.equal(out.distinctCountSql, 'SELECT COUNT(DISTINCT "user_id") AS distinct_count FROM "public"."orders"');
		assert.match(out.topValuesSql, /^SELECT "user_id" AS value, COUNT\(\*\) AS count FROM "public"\."orders" GROUP BY "user_id" ORDER BY COUNT\(\*\) DESC, "user_id" ASC LIMIT 5$/);
		assert.equal(out.topN, 5);
	});

	it('switches to TOP N for MSSQL (no LIMIT clause)', () => {
		const out = compileDistinct(
			'orders',
			{ column: 'status', topN: 10 },
			['id', 'status'],
			MSSQL_DIALECT,
		);
		assert.match(out.topValuesSql, /^SELECT TOP 10 \[status\] AS value, COUNT\(\*\) AS count FROM \[orders\]/);
		assert.match(out.topValuesSql, /ORDER BY COUNT\(\*\) DESC, \[status\] ASC$/);
	});

	it('uses FETCH FIRST N ROWS ONLY for oracle', () => {
		const out = compileDistinct(
			'orders',
			{ column: 'status', topN: 7 },
			['id', 'status'],
			ORACLE_DIALECT,
		);
		assert.match(out.topValuesSql, /FETCH FIRST 7 ROWS ONLY$/);
	});

	it('clamps topN to [1, 1000]', () => {
		const small = compileDistinct('t', { column: 'c', topN: 0    }, ['c'], POSTGRES_DIALECT);
		assert.equal(small.topN, 1);
		const big = compileDistinct('t', { column: 'c', topN: 9_999 }, ['c'], POSTGRES_DIALECT);
		assert.equal(big.topN, 1000);
	});

	it('rejects unknown columns', () => {
		assert.throws(
			() => compileDistinct('t', { column: 'mystery', topN: 5 }, ['known'], POSTGRES_DIALECT),
			/unknown column 'mystery'/,
		);
	});

	it('honors asTableExpr for non-identifier FROM (e.g. read_parquet(?))', () => {
		const out = compileDistinct(
			'/data/orders.csv',
			{ column: 'id', topN: 3 },
			['id', 'amount'],
			POSTGRES_DIALECT,
			{ asTableExpr: 'read_csv_auto(?)' },
		);
		assert.match(out.distinctCountSql, /FROM read_csv_auto\(\?\)$/);
		assert.match(out.topValuesSql,    /FROM read_csv_auto\(\?\)/);
	});
});

describe('readDistinctRows', () => {
	it('coerces count to number across number / bigint / string ships', () => {
		const out = readDistinctRows([
			{ value: 'a', count: 12 },
			{ value: 'b', count: 5n },
			{ value: 'c', count: '3' },
			{ value: null, count: 'NaN' },
		]);
		assert.deepEqual(out, [
			{ value: 'a', count: 12 },
			{ value: 'b', count: 5 },
			{ value: 'c', count: 3 },
			{ value: null, count: 0 },
		]);
	});
});

describe('readDistinctCount', () => {
	it('reads the distinct_count scalar across coercion paths', () => {
		assert.equal(readDistinctCount({ distinct_count: 42 }), 42);
		assert.equal(readDistinctCount({ distinct_count: 9_999_999_999n }), 9_999_999_999);
		assert.equal(readDistinctCount({ DISTINCT_COUNT: '7' }), 7);
		assert.equal(readDistinctCount(undefined), 0);
		assert.equal(readDistinctCount({ distinct_count: 'not a number' }), 0);
	});
});

// ---------------------------------------------------------------------------
// compileTemporalTrend + readTemporalTrendRow (Phase 5g.1 substrate)
// ---------------------------------------------------------------------------

describe('compileTemporalTrend', () => {
	it('postgres uses native REGR_* with EXTRACT(EPOCH FROM ts)', () => {
		const r = compileTemporalTrend(
			'public.events',
			{ timestampColumn: 'ts', valueColumn: 'val' },
			['id', 'ts', 'val'],
			POSTGRES_DIALECT,
		);
		assert.equal(r.native, true);
		assert.match(r.text, /REGR_SLOPE\("val", EXTRACT\(EPOCH FROM "ts"\)\)/);
		assert.match(r.text, /REGR_INTERCEPT\("val"/);
		assert.match(r.text, /REGR_R2\("val"/);
		assert.match(r.text, /REGR_COUNT\("val"/);
		assert.match(r.text, /FROM "public"\."events"/);
		assert.deepEqual(r.values, []);
	});

	it('mysql takes the expression-based path with UNIX_TIMESTAMP', () => {
		const r = compileTemporalTrend(
			'events',
			{ timestampColumn: 'ts', valueColumn: 'val' },
			['ts', 'val'],
			MYSQL_DIALECT,
		);
		assert.equal(r.native, false);
		// Six SUM-of-CASE moments + min/max
		assert.match(r.text, /SUM\(CASE WHEN .* THEN 1 ELSE 0 END\) +AS n/);
		assert.match(r.text, /SUM\(CASE WHEN .* THEN UNIX_TIMESTAMP\(`ts`\) +END\) +AS sx/);
		assert.match(r.text, /SUM\(CASE WHEN .* THEN UNIX_TIMESTAMP\(`ts`\) \* `val` +END\) +AS sxy/);
		assert.match(r.text, /MIN\(CASE WHEN .*\) +AS min_x/);
		assert.match(r.text, /MAX\(CASE WHEN .*\) +AS max_x/);
	});

	it('sqlite uses unixepoch()', () => {
		const r = compileTemporalTrend(
			'events',
			{ timestampColumn: 'ts', valueColumn: 'val' },
			['ts', 'val'],
			SQLITE_DIALECT,
		);
		assert.equal(r.native, false);
		assert.match(r.text, /unixepoch\("ts"\)/);
	});

	it('oracle uses native REGR_* with date-arithmetic epoch', () => {
		const r = compileTemporalTrend(
			'events',
			{ timestampColumn: 'ts', valueColumn: 'val' },
			['ts', 'val'],
			ORACLE_DIALECT,
		);
		assert.equal(r.native, true);
		assert.match(r.text, /\(\("ts" - DATE '1970-01-01'\) \* 86400\)/);
	});

	it('mssql uses DATEDIFF_BIG (expression path; T-SQL has no REGR_*)', () => {
		const r = compileTemporalTrend(
			'events',
			{ timestampColumn: 'ts', valueColumn: 'val' },
			['ts', 'val'],
			MSSQL_DIALECT,
		);
		assert.equal(r.native, false);
		assert.match(r.text, /DATEDIFF_BIG\(SECOND, '1970-01-01', \[ts\]\)/);
	});

	it('threads request-level WHERE through compileWhere', () => {
		const r = compileTemporalTrend(
			'public.events',
			{
				timestampColumn: 'ts',
				valueColumn: 'val',
				where: [{ column: 'category', op: '=', value: 'A' }],
			},
			['ts', 'val', 'category'],
			POSTGRES_DIALECT,
		);
		assert.match(r.text, /WHERE "category" = \$1/);
		assert.deepEqual(r.values, ['A']);
	});

	it('rejects unknown timestamp / value columns', () => {
		assert.throws(
			() => compileTemporalTrend('events', { timestampColumn: 'no_such', valueColumn: 'val' }, ['ts', 'val'], POSTGRES_DIALECT),
			/unknown column 'no_such'/,
		);
		assert.throws(
			() => compileTemporalTrend('events', { timestampColumn: 'ts', valueColumn: 'no_such' }, ['ts', 'val'], POSTGRES_DIALECT),
			/unknown column 'no_such'/,
		);
	});
});

describe('readTemporalTrendRow', () => {
	it('reads a native REGR_* row directly', () => {
		const r = readTemporalTrendRow(
			{ slope: 3, intercept: 2, r2: 1, n: 10, min_x: 1735689600, max_x: 1735689609 },
			'events', 'ts', 'val', /* native */ true,
		);
		assert.equal(r.n, 10);
		assert.equal(r.slope, 3);
		assert.equal(r.slopePerDay, 3 * 86400);
		assert.equal(r.intercept, 2);
		assert.equal(r.r2, 1);
		assert.equal(r.minTimestampEpoch, 1735689600);
		assert.equal(r.maxTimestampEpoch, 1735689609);
	});

	it('computes slope/intercept/R² from SUM moments (expression path) -- perfect line', () => {
		// Constructed: 10 points where val = 2 + 3 * x for x in [0..9].
		// val: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29]
		//   n  = 10
		//   sx = 0+1+...+9               = 45
		//   sy = 2+5+...+29              = 155
		//   sxx = 0+1+4+...+81           = 285
		//   syy = 4+25+64+...+841        = 3145
		//   sxy = 0+5+16+33+56+...+261   = 945
		const r = readTemporalTrendRow(
			{ n: 10, sx: 45, sy: 155, sxx: 285, syy: 3145, sxy: 945, min_x: 0, max_x: 9 },
			'events', 'ts', 'val', /* native */ false,
		);
		assert.equal(r.n, 10);
		assert.ok(Math.abs(r.slope! - 3) < 1e-9, `slope=${r.slope}`);
		assert.ok(Math.abs(r.intercept! - 2) < 1e-9, `intercept=${r.intercept}`);
		assert.ok(Math.abs(r.r2! - 1) < 1e-9, `r2=${r.r2}`);
	});

	it('returns null slope/r² when X variance is zero (expression path)', () => {
		// All x at the same value -> Sxx = 0 -> regression undefined.
		const r = readTemporalTrendRow(
			{ n: 5, sx: 25, sy: 30, sxx: 125, syy: 200, sxy: 150, min_x: 5, max_x: 5 },
			'events', 'ts', 'val', false,
		);
		assert.equal(r.n, 5);
		assert.equal(r.slope, null);
		assert.equal(r.intercept, null);
		assert.equal(r.r2, null);
	});

	it('handles n < 2 (expression path)', () => {
		const r = readTemporalTrendRow(
			{ n: 1, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, min_x: 0, max_x: 0 },
			'events', 'ts', 'val', false,
		);
		assert.equal(r.n, 1);
		assert.equal(r.slope, null);
	});

	it('returns empty result for undefined row', () => {
		const r = readTemporalTrendRow(undefined, 'events', 'ts', 'val', true);
		assert.equal(r.n, 0);
		assert.equal(r.slope, null);
		assert.equal(r.minTimestampEpoch, null);
	});
});
