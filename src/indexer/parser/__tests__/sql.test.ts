/**
 * Epic c2ba6fa6, Story s9, t8 -- the SQL reader. Over the registered reader
 * (the real @derekstride/tree-sitter-sql grammar behind the guarded load) and
 * the real per-file resolver: a SQL fixture yields the document, table and
 * view entities and their REFERENCES (ac2); the document entity is the one the
 * artifact reader writes for the same file; a CTE name is not a reference and
 * quoted identifiers are unquoted; a reference to a table of another file
 * stays pending; a fixture with a syntax error still yields the declarations
 * outside the broken region.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/sql.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SqlParser, registerSqlReader, sqlParser } from '../sql.js';
import { listReaders } from '../registry.js';
import { languageOfExtension } from '../../resolver.js';
import { makeEntityId } from '../base.js';
import { getParser } from '../registry.js';
import { resolveRelations } from '../../resolver.js';
import '../artifact.js';

const REPO = '/repo';
const FILE = '/repo/db/schema.sql';

const SOURCE = `CREATE TABLE app.users (
	id int PRIMARY KEY,
	org_id int REFERENCES orgs (id)
);
CREATE TABLE "Orders" (
	id int,
	user_id int,
	FOREIGN KEY (user_id) REFERENCES app.users (id)
);
CREATE OR REPLACE VIEW active_users AS
	WITH recent AS (SELECT * FROM "Orders")
	SELECT u.id FROM app.users u JOIN recent r ON r.user_id = u.id LEFT JOIN audit.log l ON true;
CREATE VIEW nested AS SELECT * FROM (SELECT * FROM orders) x WHERE id IN (SELECT id FROM APP.USERS);
CREATE INDEX users_org ON app.users (org_id);
`;

assert.ok(sqlParser, 'the tree-sitter-sql grammar loaded');
const parse = (source: string) => sqlParser!.parse(FILE, source, REPO, 1);
type R = ReturnType<typeof parse>;
const of = (r: R, kind: string) => r.entities.filter(e => e.kind === kind).map(e => e.name).sort();
const refs = (r: R, relations = r.relations) => {
	const n = new Map(r.entities.map(e => [e.id, e.name]));
	return relations.filter(x => x.kind === 'REFERENCES').map(x => `${n.get(x.from)} -> ${x.resolved ? n.get(x.to) : `pending ${x.to}`}`).sort();
};

test('s9 t8: a SQL fixture yields the document, table and view entities and their REFERENCES (ac2)', () => {
	assert.equal(getParser(FILE), sqlParser, '.sql files are read by the SQL reader, not the artifact reader');
	const r = parse(SOURCE);
	assert.deepEqual(of(r, 'document'), ['schema.sql']);
	assert.deepEqual(of(r, 'table'), ['Orders', 'app.users']);
	assert.deepEqual(of(r, 'view'), ['active_users', 'nested']);
	assert.ok(r.entities.every(e => e.language === 'sql'));

	const fileId = makeEntityId(REPO, FILE, 'file', FILE);
	const defined = r.relations.filter(x => x.kind === 'DEFINES' && x.from === fileId).map(x => r.entities.find(e => e.id === x.to)!.name).sort();
	assert.deepEqual(defined, ['Orders', 'active_users', 'app.users', 'nested', 'schema.sql']);

	assert.deepEqual(refs(r), [
		'Orders -> app.users',                 // a FOREIGN KEY constraint
		'active_users -> Orders',              // read inside the CTE's own query
		'active_users -> app.users',
		'active_users -> pending audit.log',
		'app.users -> pending orgs',           // a column REFERENCES
		'nested -> Orders',                    // unquoted names match case-insensitively
		'nested -> app.users',                 // through a subquery in WHERE
	]);
});

test('s9 t8: the document entity is the one the artifact reader writes for the same file', () => {
	const artifact = getParser('/repo/a.toml')!;
	assert.notEqual(artifact, sqlParser);
	const before = artifact.parse(FILE, SOURCE, REPO, 1).entities;
	const now = parse(SOURCE).entities;
	const pick = (es: typeof now, kind: string) => {
		const { indexedAt: _t, ...rest } = es.find(e => e.kind === kind)!;
		return rest;
	};
	assert.deepEqual(pick(now, 'document'), pick(before, 'document'));
	assert.deepEqual(pick(now, 'file'), pick(before, 'file'));
	assert.equal(pick(now, 'document').id, makeEntityId(REPO, FILE, 'document', 'schema.sql'));

	// A long file's document body is cut where the artifact reader cut it; a file over its size limit is skipped as it was.
	const long = SOURCE + `-- ${'x'.repeat(10_000)}\n`;
	assert.deepEqual(pick(parse(long).entities, 'document'), pick(artifact.parse(FILE, long, REPO, 1).entities, 'document'));
	assert.ok(pick(parse(long).entities, 'document').body.length < long.length);
	const huge = SOURCE + `-- ${'x'.repeat(300 * 1024)}\n`;
	assert.deepEqual(artifact.parse(FILE, huge, REPO, 1).entities, []);
	assert.deepEqual(parse(huge).entities, []);
});

test('s9 t8: a CTE name is not a reference, and quoted identifiers are unquoted', () => {
	const r = parse(`CREATE VIEW "Report" AS WITH "Totals" AS (SELECT 1 AS n FROM [Sales]) SELECT * FROM Totals JOIN \`app\`.\`Ledger\` ON true;`);
	assert.deepEqual(of(r, 'view'), ['Report']);
	assert.deepEqual(refs(r), ['Report -> pending Sales', 'Report -> pending app.Ledger']);

	// A relation read twice is one reference.
	assert.deepEqual(refs(parse('CREATE VIEW twice AS SELECT * FROM t a JOIN t b ON a.id = b.id;')), ['twice -> pending t']);
});

test('s9 t8: a reference to a table defined in another file stays pending by name after the per-file resolver', () => {
	const r = parse(`CREATE VIEW recent AS SELECT * FROM billing.invoices;\nCREATE TABLE line (inv int REFERENCES billing.invoices (id));\n`);
	const resolved = resolveRelations(r.relations, FILE, REPO, r.entities);
	assert.deepEqual(refs(r, resolved), ['line -> pending billing.invoices', 'recent -> pending billing.invoices']);
});

test('s9 t8: a fixture with a syntax error still yields the declarations outside the broken region, and its file is marked', () => {
	const r = parse(`CREATE TABLE a (id int);
SELEC garbage FROM;
CREATE VIEW v AS SELECT * FROM a;
CREATE TABLE c (a_id int REFERENCES a (id));
`);
	assert.equal(r.entities.find(e => e.kind === 'file')!.signature, 'parse-error');
	assert.deepEqual(of(r, 'table'), ['a', 'c']);
	assert.deepEqual(of(r, 'view'), ['v']);
	assert.deepEqual(refs(r), ['c -> a', 'v -> a']);
});

test('s9 t8: definitions inside a transaction block are read', () => {
	const r = parse('BEGIN;\nCREATE TABLE t (id int);\nCREATE VIEW tv AS SELECT * FROM t;\nEND;\n');
	assert.deepEqual(of(r, 'table'), ['t']);
	assert.deepEqual(refs(r), ['tv -> t']);
});

test('s9 review: without the grammar a .sql file is still stored as its document, and SQL is not listed as read', () => {
	const fallback = new SqlParser(null, null);
	assert.equal(fallback.language, 'config', 'listed under config, so the languages request keeps sql unavailable');
	const artifact = getParser('/repo/a.toml')!;
	const strip = (es: ReturnType<typeof parse>['entities']) => es.map(({ indexedAt: _t, ...rest }) => rest);
	const r = fallback.parse(FILE, SOURCE, REPO, 1);
	assert.deepEqual(strip(r.entities), strip(artifact.parse(FILE, SOURCE, REPO, 1).entities));
	assert.deepEqual(r.relations.map(x => x.kind), ['DEFINES']);
});

test('s9 review: a SQL grammar that fails to load registers the document-only fallback, which is not listed as SQL', () => {
	assert.equal(registerSqlReader(() => { throw new Error('no sql grammar here'); }, ['.probe-sql']), null);
	const fallback = getParser('/repo/db/a.probe-sql');
	assert.ok(fallback instanceof SqlParser);
	assert.equal(fallback.language, 'config');
	assert.deepEqual(fallback.parse('/repo/db/a.probe-sql', SOURCE, REPO, 1).entities.map(e => e.kind), ['file', 'document']);
	const sql = listReaders(languageOfExtension).find(l => l.language === 'sql');
	assert.equal(sql?.extensions.includes('.probe-sql'), false, 'the fallback does not count as reading SQL');
});
