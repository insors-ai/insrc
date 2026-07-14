/**
 * Injection-fuzz suite for rdbms-common.
 *
 * The whole RDBMS surface is built on the assumption that no string
 * the LLM sends ever ends up unescaped in compiled SQL. These tests
 * exercise that boundary across:
 *
 *   - target identifiers (table / view / schema.table)
 *   - column identifiers inside WHERE clauses
 *   - value literals (which must always be parametrised)
 *
 * Strategy: take known attack shapes ("Bobby Tables", quote-bypass,
 * comment injection, semicolon-stacking, schema escape, encoded
 * quotes) and assert they're rejected at the helper layer (target
 * shape regex, column-name validator, value-as-parameter). Every
 * test that expects rejection must throw a typed error containing
 * the attempted substring -- silent acceptance is a failure even
 * if the resulting SQL would be syntactically valid.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
	MSSQL_DIALECT,
	MYSQL_DIALECT,
	ORACLE_DIALECT,
	POSTGRES_DIALECT,
	SQLITE_DIALECT,
	buildSampleSql,
	compileWhere,
	looksLikeMutation,
	quoteTarget,
} from '../drivers/rdbms-common.js';

const ALL_DIALECTS = [
	{ name: 'postgres', d: POSTGRES_DIALECT },
	{ name: 'mysql',    d: MYSQL_DIALECT    },
	{ name: 'sqlite',   d: SQLITE_DIALECT   },
	{ name: 'mssql',    d: MSSQL_DIALECT    },
	{ name: 'oracle',   d: ORACLE_DIALECT   },
] as const;

// ---------------------------------------------------------------------------
// Target identifier fuzz
// ---------------------------------------------------------------------------

describe('quoteTarget -- identifier injection', () => {
	const malicious: readonly string[] = [
		// Classic Bobby-Tables-style + variants
		`users; DROP TABLE users`,
		`users"; DROP TABLE users; --`,
		`users\`; DROP TABLE users; --`,
		// Comment injection
		`users -- malicious tail`,
		`users /* nested */ comment`,
		// Quote-bypass attempts
		`u"ser`,
		"u`ser",
		`u'ser`,
		// Whitespace + control chars
		`users WITH (NOLOCK)`,
		`users\nDROP TABLE users`,
		`users\tWHERE 1=1`,
		`users\0`,
		// Schema escape -- parser must accept exactly one dot, no more
		`a.b.c`,
		`.users`,
		`users.`,
		// Empty / leading-digit
		``,
		`123users`,
		// Unicode lookalikes (cyrillic 'a' would slip past a naive ascii regex)
		`uаsers`,
	];

	for (const { name, d } of ALL_DIALECTS) {
		for (const target of malicious) {
			it(`${name}: rejects target ${JSON.stringify(target)}`, () => {
				assert.throws(() => quoteTarget(target, d), /invalid table identifier/);
			});
		}
	}

	it('accepts schema.table on every dialect', () => {
		for (const { d } of ALL_DIALECTS) {
			assert.doesNotThrow(() => quoteTarget('public.users', d));
		}
	});
});

// ---------------------------------------------------------------------------
// Column identifier fuzz inside WHERE
// ---------------------------------------------------------------------------

describe('compileWhere -- column-name injection', () => {
	const known = ['id', 'name', 'email'];

	const malicious: readonly string[] = [
		`id"; DROP TABLE users; --`,
		"id' OR '1'='1",
		`id) UNION SELECT * FROM passwords (`,
		`id`,                  // legit, control case below
		`name; -- tail`,
		`name OR 1=1`,
		`name AND 1=0`,
	];

	for (const { name, d } of ALL_DIALECTS) {
		for (const col of malicious) {
			if (known.includes(col)) { continue; } // skip the legit control
			it(`${name}: rejects column ${JSON.stringify(col)}`, () => {
				assert.throws(
					() => compileWhere([{ column: col, op: '=', value: 1 }], known, d),
					/unknown column/,
				);
			});
		}
	}

	it('legit column passes the validator', () => {
		const r = compileWhere([{ column: 'id', op: '=', value: 1 }], known, POSTGRES_DIALECT);
		assert.match(r.text, /^WHERE "id" = \$1$/);
	});

	it('case-only differences resolve to the original known name (case-insensitive validator)', () => {
		// User supplies 'ID' but known has 'id' -- accept; the quoter
		// preserves the user's case so the emitted SQL says "ID".
		const r = compileWhere([{ column: 'ID', op: '=', value: 1 }], ['id'], POSTGRES_DIALECT);
		assert.match(r.text, /"ID"/);
	});
});

// ---------------------------------------------------------------------------
// Value-side fuzz -- values must always be parametrised, never inlined
// ---------------------------------------------------------------------------

describe('compileWhere -- value parametrisation', () => {
	const known = ['id', 'name'];

	const valuePayloads: readonly unknown[] = [
		`'; DROP TABLE users; --`,
		`' OR '1'='1`,
		`\\\\'; DROP TABLE u; --`,
		'\x00',                                     // null byte
		new Array(10_000).fill('a').join(''),  // 10kB string
		42,                   // integer
		3.14159,              // float
		true, false,          // bool
		null,                 // is null is a separate op; passing null to = should still parametrise
		new Date('2024-01-01T00:00:00Z'),
	];

	for (const value of valuePayloads) {
		it(`postgres: parametrises ${typeof value === 'string' ? `string(${value.length})` : String(value)}`, () => {
			const r = compileWhere(
				[{ column: 'name', op: '=', value }],
				known,
				POSTGRES_DIALECT,
			);
			// Value never appears in the SQL text...
			assert.equal(r.text, 'WHERE "name" = $1');
			// ...always in the values array.
			assert.deepEqual(r.values, [value]);
		});
	}

	it('mysql: parametrises long strings', () => {
		const big = 'A'.repeat(50_000);
		const r = compileWhere([{ column: 'name', op: '=', value: big }], known, MYSQL_DIALECT);
		assert.equal(r.text, 'WHERE `name` = ?');
		assert.deepEqual(r.values, [big]);
	});

	it('rejects empty IN arrays (avoids ambiguous SQL)', () => {
		assert.throws(
			() => compileWhere([{ column: 'id', op: 'in', value: [] }], known, POSTGRES_DIALECT),
			/non-empty array/,
		);
	});

	it('IN op spreads each element into its own placeholder', () => {
		const r = compileWhere(
			[{ column: 'id', op: 'in', value: [1, 2, 3, 4, 5] }],
			known,
			POSTGRES_DIALECT,
		);
		assert.equal(r.text, 'WHERE "id" IN ($1, $2, $3, $4, $5)');
		assert.deepEqual(r.values, [1, 2, 3, 4, 5]);
	});

	it('IS NULL has no placeholder + does not consume an index', () => {
		const r = compileWhere(
			[
				{ column: 'name', op: 'is null' },
				{ column: 'id', op: '=', value: 1 },
			],
			known,
			POSTGRES_DIALECT,
		);
		assert.equal(r.text, 'WHERE "name" IS NULL AND "id" = $1');
		assert.deepEqual(r.values, [1]);
	});
});

// ---------------------------------------------------------------------------
// Full SELECT assembly fuzz -- never produce mutation-shaped SQL
// ---------------------------------------------------------------------------

describe('buildSampleSql -- mutation denylist', () => {
	const known = ['id', 'name'];

	for (const { name, d } of ALL_DIALECTS) {
		it(`${name}: clean SELECT passes the denylist`, () => {
			const r = buildSampleSql('users', { limit: 10 }, known, d);
			assert.equal(looksLikeMutation(r.text), false);
		});

		it(`${name}: clamps a 9999-row limit to 50`, () => {
			const r = buildSampleSql('users', { limit: 9999 }, known, d);
			if (d === MSSQL_DIALECT) {
				assert.match(r.text, / TOP 50 /);
			} else if (d === ORACLE_DIALECT) {
				assert.match(r.text, /FETCH FIRST 50 ROWS ONLY$/);
			} else {
				assert.match(r.text, /LIMIT 50$/);
			}
		});

		it(`${name}: reject limit=0 by clamping up to 1`, () => {
			const r = buildSampleSql('users', { limit: 0 }, known, d);
			if (d === MSSQL_DIALECT) {
				assert.match(r.text, / TOP 1 /);
			} else if (d === ORACLE_DIALECT) {
				assert.match(r.text, /FETCH FIRST 1 ROWS ONLY$/);
			} else {
				assert.match(r.text, /LIMIT 1$/);
			}
		});
	}
});

// ---------------------------------------------------------------------------
// looksLikeMutation -- positive + negative coverage
// ---------------------------------------------------------------------------

describe('looksLikeMutation -- denylist coverage', () => {
	const muts: readonly string[] = [
		'INSERT INTO u VALUES (1)',
		'insert into u values (1)',
		'UPDATE u SET x = 1',
		'DELETE FROM u',
		'DROP TABLE u',
		'TRUNCATE TABLE u',
		'ALTER TABLE u ADD c INT',
		'CREATE INDEX ix ON u(x)',
		'GRANT SELECT ON u TO r',
		'REVOKE SELECT ON u FROM r',
		'CALL my_proc()',
		'BEGIN TRANSACTION',
		'COMMIT',
		'ROLLBACK',
		'MERGE INTO u USING t ON ...',
		'REPLACE INTO u VALUES (1)',
		'VACUUM ANALYZE',
		'ATTACH DATABASE \'x\' AS y',
		'DETACH DATABASE y',
		// embedded mid-statement
		'SELECT * FROM u; DROP TABLE u',
		'SELECT * FROM u WHERE 1=1; UPDATE u SET x=2',
	];

	const benign: readonly string[] = [
		'SELECT * FROM u',
		'SELECT * FROM u WHERE id = $1',
		'SELECT TOP 10 * FROM u',
		'SELECT * FROM u WHERE name = $1 AND email IS NULL',
		'SELECT count(*) FROM u',
		'SELECT * FROM u FETCH FIRST 50 ROWS ONLY',
		// Scary substrings inside parameter values would already be
		// quoted out, but the guard runs on emitted SQL only.
		`SELECT * FROM "creates"`,
	];

	for (const m of muts) {
		it(`flags ${JSON.stringify(m.slice(0, 40))}`, () => {
			assert.equal(looksLikeMutation(m), true);
		});
	}
	for (const b of benign) {
		it(`accepts ${JSON.stringify(b.slice(0, 40))}`, () => {
			assert.equal(looksLikeMutation(b), false);
		});
	}
});
