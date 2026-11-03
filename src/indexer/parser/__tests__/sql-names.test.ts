/**
 * ISSUE-0f3376a0 S001 t1 -- the SQL name rule and the reader that uses it. The
 * name key folds bare and backticked segments, keeps double-quoted ones exact
 * and never makes a quoted single segment equal a qualified name; the reader
 * (the registered reader over the real @derekstride/tree-sitter-sql grammar)
 * stores a definition under its meaningful quoting, so collision pairs are two
 * entities, matches same-file references and CTE names by key, and writes
 * pending names and referencesIn the same way; names the grammar cannot read
 * give exactly the entities and references they gave before the rule (pinned
 * from the reader at HEAD 49b1d78f1).
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/sql-names.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sqlFoldedText, sqlLastSegmentKey, sqlNameKey, sqlSegments, sqlStoredIdentifier } from '../sql-names.js';
import { sqlParser } from '../sql.js';
import { makeEntityId } from '../base.js';

const REPO = '/repo';
const FILE = '/repo/g.sql';

assert.ok(sqlParser, 'the tree-sitter-sql grammar loaded');
const parse = (source: string) => sqlParser!.parse(FILE, source, REPO, 1);
type R = ReturnType<typeof parse>;
const defs = (r: R) => r.entities.filter(e => e.kind === 'table' || e.kind === 'view').map(e => [e.kind, e.name, e.id]);
const refs = (r: R) => {
	const n = new Map(r.entities.map(e => [e.id, e.name]));
	return r.relations.filter(x => x.kind === 'REFERENCES').map(x => `${n.get(x.from)} -> ${x.resolved ? n.get(x.to) : `pending ${x.to}`}`).sort();
};

test('S001 t1: the SQL name key folds bare and backtick segments, keeps double-quoted ones exact, and never collides', () => {
	assert.deepEqual(sqlSegments('app."Users"'), [{ text: 'app', exact: false }, { text: 'Users', exact: true }]);
	assert.equal(sqlNameKey('APP.Users'), '["app","users"]', 'bare segments fold');
	assert.equal(sqlNameKey('`App`.`Users`'), '["app","users"]', 'backticked segments fold');
	assert.equal(sqlNameKey('[App].[Users]'), '["app","users"]', 'bracketed segments fold');
	assert.equal(sqlNameKey('"Users"'), '["Users"]', 'a double-quoted segment keeps its case');
	assert.equal(sqlNameKey('"users"'), sqlNameKey('users'), 'a lower-case quoted name is the unquoted name');
	assert.notEqual(sqlNameKey('"Users"'), sqlNameKey('Users'));
	assert.notEqual(sqlNameKey('"Users"'), sqlNameKey('"USERS"'));

	// A dot inside double quotes is part of one segment: "a.b" is not the qualified a.b.
	assert.equal(sqlNameKey('"a.b"'), '["a.b"]');
	assert.equal(sqlNameKey('a.b'), '["a","b"]');
	assert.notEqual(sqlNameKey('"a.b"'), sqlNameKey('a.b'));
	assert.equal(sqlNameKey('x."a.b"'), '["x","a.b"]');
	// The JSON key keeps segment boundaries, whatever characters the segments hold.
	assert.notEqual(sqlNameKey('"a,b"'), sqlNameKey('a.b'));
	assert.notEqual(sqlNameKey('"a.b".c'), sqlNameKey('a."b.c"'));

	// A segment is exact only when it is one whole double-quoted piece.
	assert.deepEqual(sqlSegments('"A"b'), [{ text: 'Ab', exact: false }]);
	// A name that ends inside an open quote is one folded segment, its whole text (the old comparison).
	assert.deepEqual(sqlSegments('"Users'), [{ text: '"Users', exact: false }]);
	assert.equal(sqlNameKey('app."Users'), '["app.\\"users"]');

	assert.equal(sqlLastSegmentKey('db.app."Users"'), 'Users');
	assert.equal(sqlLastSegmentKey('db.APP.users'), 'users');
	assert.equal(sqlFoldedText('app."Users"'), 'app.users', 'the old lower-cased, unquoted comparison');
	assert.equal(sqlFoldedText('"a.b"'), 'a.b');

	// How an identifier is stored: double quotes only where they change the meaning.
	assert.equal(sqlStoredIdentifier('"users"'), 'users');
	assert.equal(sqlStoredIdentifier('`Users`'), 'Users');
	assert.equal(sqlStoredIdentifier('[Users]'), 'Users', 'brackets fold, so they are never kept');
	assert.equal(sqlStoredIdentifier('Users'), 'Users');
	assert.equal(sqlStoredIdentifier('"Users"'), '"Users"');
	assert.equal(sqlStoredIdentifier('"a.b"'), '"a.b"');
	assert.equal(sqlStoredIdentifier('"order items"'), '"order items"');
	assert.equal(sqlStoredIdentifier('`a.b`'), 'a.b', 'a dotted backticked name is a grammar limit, stored as before');
	for (const id of ['"users"', '`Users`', 'Users', '"Users"', '"a.b"', '"order items"']) {
		assert.equal(sqlNameKey(sqlStoredIdentifier(id)), sqlNameKey(id), `${id} reads back to its own key`);
	}
});

test('S001 t1: the reader keeps meaningful quoting in stored names, matches same-file references and CTEs by key, and keeps written names in rawTo and referencesIn', () => {
	// Both members of each collision pair are kept, with distinct ids, and each reference links to its own.
	const r = parse([
		'CREATE TABLE Users (id int);',
		'CREATE TABLE "Users" (id int);',
		'CREATE TABLE a.b (id int);',
		'CREATE TABLE "a.b" (id int);',
		'CREATE VIEW v1 AS SELECT * FROM USERS;',
		'CREATE VIEW v2 AS SELECT * FROM "Users";',
		'CREATE VIEW v3 AS SELECT * FROM A.B;',
		'CREATE VIEW v4 AS SELECT * FROM "a.b";',
		'CREATE TABLE fk (u int REFERENCES "Users" (id), w int REFERENCES users (id));',
	].join('\n'));
	const tables = defs(r).filter(([k]) => k === 'table');
	assert.deepEqual(tables.map(([, n]) => n), ['Users', '"Users"', 'a.b', '"a.b"', 'fk']);
	assert.equal(new Set(tables.map(([, , id]) => id)).size, 5, 'distinct ids');
	assert.equal(tables[0]![2], makeEntityId(REPO, FILE, 'table', 'Users'), 'an unquoted definition keeps its id');
	assert.equal(tables[1]![2], makeEntityId(REPO, FILE, 'table', '"Users"'));
	assert.equal(r.entities.find(e => e.name === '"Users"')!.signature, 'table "Users"');
	assert.deepEqual(refs(r), [
		'fk -> "Users"',
		'fk -> Users',
		'v1 -> Users',
		'v2 -> "Users"',
		'v3 -> a.b',
		'v4 -> "a.b"',
	]);

	// A quoted single-segment "a.b" never answers a qualified reference a.b, nor the other way round.
	assert.deepEqual(refs(parse('CREATE TABLE "a.b" (id int);\nCREATE VIEW q AS SELECT * FROM a.b;')), ['q -> pending a.b']);
	assert.deepEqual(refs(parse('CREATE TABLE a.b (id int);\nCREATE VIEW q AS SELECT * FROM "a.b";')), ['q -> pending "a.b"']);
	// Lower-case quoting does not matter: "users", `users` and users are one stored name.
	const lower = parse('CREATE TABLE "users" (id int);\nCREATE VIEW q AS SELECT * FROM users JOIN `Users` ON true JOIN "users" ON true;');
	assert.deepEqual(defs(lower).map(([, n]) => n), ['users', 'q']);
	assert.deepEqual(refs(lower), ['q -> users'], 'one reference per key');

	// A view's CTE names are matched by key.
	assert.deepEqual(refs(parse('CREATE VIEW c AS WITH "Recent" AS (SELECT 1) SELECT * FROM recent JOIN "Recent" ON true;')), ['c -> pending recent']);
	assert.deepEqual(refs(parse('CREATE VIEW c AS WITH recent AS (SELECT 1) SELECT * FROM RECENT JOIN "recent" ON true;')), []);
	assert.deepEqual(refs(parse('CREATE VIEW c AS WITH "a.b" AS (SELECT 1) SELECT * FROM a.b;')), ['c -> pending a.b']);

	// Pending names and referencesIn write each name the way it is stored, meaningful quotes kept.
	const pending = parse('CREATE VIEW p AS SELECT * FROM app."Ledger" JOIN `app`.`Users` ON true JOIN "x.y" ON true JOIN "orders" ON true;');
	const rawTo = pending.relations.filter(x => x.kind === 'REFERENCES' && !x.resolved).map(x => x.to).sort();
	assert.deepEqual(rawTo, ['"x.y"', 'app."Ledger"', 'app.Users', 'orders']);
	assert.deepEqual(sqlParser!.referencesIn('CREATE VIEW p AS SELECT * FROM app."Ledger" JOIN `app`.`Users` ON true JOIN "x.y" ON true;'),
		['app."Ledger"', 'app.Users', '"x.y"']);
	assert.deepEqual(sqlParser!.referencesIn('CREATE TABLE t (a int REFERENCES "Users" (id), b int REFERENCES app.users (id));'), ['"Users"', 'app.users']);
});

test('S001 t1: names the grammar cannot read give the same entities and references as before', () => {
	// Pinned from the reader at HEAD 49b1d78f1 (before the name rule), over the same inputs.
	const cases: { source: string; defs: string[][]; refs: string[]; referencesIn: (string[] | undefined)[] }[] = [
		{   // brackets are no identifier: the grammar reads [Sales.Q1] as Sales and Q1, and REFERENCES [x] as x
			source: 'CREATE TABLE [Sales.Q1] (id int REFERENCES [x] (id));\nCREATE VIEW sv AS SELECT * FROM [Sales.Q1] JOIN [x] ON true;',
			defs: [['table', 'Sales.Q1', '358234ea7fa37fd66190ed12d02e7d8c'], ['view', 'sv', '900f9a7831968de89db0fecf4ee510ea']],
			refs: ['sv -> Sales.Q1', 'sv -> pending x'],
			referencesIn: [[], ['Sales.Q1', 'x']],
		},
		{   // no escaped double quote: "a""b" reads as "a" and an ERROR
			source: 'CREATE TABLE "a""b" (id int);\nCREATE VIEW qv AS SELECT * FROM "a""b";',
			defs: [['table', 'a', '217904b301e5b0a620a4aa3f67368b2e'], ['view', 'qv', '6166811ecc79999ebb3cc9f02a55cec4']],
			refs: ['qv -> a'],
			referencesIn: [[], ['a']],
		},
		{   // a backticked name holding a dot
			source: 'CREATE TABLE `a.b` (id int);\nCREATE VIEW bv AS SELECT * FROM `a.b`;\nCREATE TABLE bt (x int REFERENCES `a.b` (id));',
			defs: [['table', 'a.b', 'bd58826d242aea1660f5c51ad667ac16'], ['table', 'bt', 'fd913e98ac69871d66ec46ab6c2915fe'], ['view', 'bv', 'c3d9050720951449a93170c1dd7fbeff']],
			refs: ['bt -> a.b', 'bv -> a.b'],
			referencesIn: [[], ['a.b'], ['a.b']],
		},
	];
	for (const c of cases) {
		const r = parse(c.source);
		const got = defs(r).sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`));
		assert.deepEqual(got, c.defs, c.source);
		assert.deepEqual(refs(r), c.refs, c.source);
		assert.deepEqual(c.source.split('\n').map(s => sqlParser!.referencesIn(s)), c.referencesIn, c.source);
	}
});
