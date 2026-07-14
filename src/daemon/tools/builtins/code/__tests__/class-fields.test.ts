/**
 * Tests for `code_class_fields` (code-analyzer-skills.md Phase 0.2).
 *
 * Two layers:
 *
 *   1. Pure parsers: parseModifiers / parseTypeFromSignature /
 *      parseDefaultFromBody / parseNullable + per-language body
 *      regex extractors (extractTsFields / extractPyFields /
 *      extractGoFields).
 *
 *   2. End-to-end against an in-memory LMDB graph:
 *        - Java class with two fields (graph walk)
 *        - Scala val/var fields (graph walk)
 *        - TypeScript class with body regex
 *        - Python class with body regex
 *        - Go struct with body regex
 *        - Empty class -> { fields: [] }
 *        - entityId missing -> success: false
 *        - non-class entityId -> success: false
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../../../../../db/graph/store.js';
import { upsertEntities } from '../../../../../db/entities.js';
import { upsertRelations } from '../../../../../db/relations.js';
import { addRepo } from '../../../../../db/repos.js';
import { _resetRegistryForTests, getTool } from '../../../registry.js';
import {
	registerCodeClassFieldsTool,
	_parseModifiersForTest as parseModifiers,
	_parseTypeFromSignatureForTest as parseTypeFromSignature,
	_parseDefaultFromBodyForTest as parseDefaultFromBody,
	_parseNullableForTest as parseNullable,
	_extractTsFieldsForTest as extractTsFields,
	_extractPyFieldsForTest as extractPyFields,
	_extractGoFieldsForTest as extractGoFields,
} from '../class-fields.js';
import type { Tool, ToolDeps, ToolResult } from '../../../types.js';
import type { Entity, EntityKind, Language } from '../../../../../shared/types.js';

// ---------------------------------------------------------------------------
// Pure parsers
// ---------------------------------------------------------------------------

test('parseModifiers: returns leading mod tokens, stops at type', () => {
	assert.deepEqual(parseModifiers('private final String name'), ['private', 'final']);
	assert.deepEqual(parseModifiers('public static int counter'), ['public', 'static']);
	assert.deepEqual(parseModifiers('readonly userId: string'), ['readonly']);
	assert.deepEqual(parseModifiers('int counter'), []);
});

test('parseModifiers: skips leading annotations', () => {
	assert.deepEqual(parseModifiers('@Column private String name'), ['private']);
	assert.deepEqual(parseModifiers('@Id @GeneratedValue private Long id'), ['private']);
});

test('parseTypeFromSignature: java shape extracts type', () => {
	assert.equal(parseTypeFromSignature('private final String name', 'java'), 'String');
	assert.equal(parseTypeFromSignature('public Map<String, Integer> counts', 'java'), 'Map<String, Integer>');
});

test('parseTypeFromSignature: scala shape uses colon', () => {
	assert.equal(parseTypeFromSignature('private val name: String', 'scala'), 'String');
	assert.equal(parseTypeFromSignature('var counts: Map[String, Int]', 'scala'), 'Map[String, Int]');
});

test('parseTypeFromSignature: returns undefined when no type', () => {
	assert.equal(parseTypeFromSignature('', 'java'), undefined);
	assert.equal(parseTypeFromSignature('val x', 'scala'), undefined);
});

test('parseDefaultFromBody: extracts simple = expr', () => {
	assert.equal(parseDefaultFromBody('private int x = 42;'), '42');
	assert.equal(parseDefaultFromBody('val name: String = "alice"'), '"alice"');
	assert.equal(parseDefaultFromBody('private final List<String> items;'), undefined);
});

test('parseDefaultFromBody: caps very long defaults', () => {
	const body = 'private String x = ' + 'a'.repeat(200) + ';';
	const def  = parseDefaultFromBody(body);
	assert.ok(def !== undefined);
	assert.ok(def.endsWith('...'), 'long default should be truncated with ellipsis');
});

test('parseNullable: detects @Nullable annotation', () => {
	assert.equal(parseNullable('@Nullable private String name', '', 'String'), true);
});

test('parseNullable: detects @NotNull annotation', () => {
	assert.equal(parseNullable('@NotNull private String name', '', 'String'), false);
});

test('parseNullable: detects Optional<>, Option[], X | null, X | None', () => {
	assert.equal(parseNullable('', '', 'Optional<String>'),  true);
	assert.equal(parseNullable('', '', 'Option[String]'),    true);
	assert.equal(parseNullable('', '', 'string | null'),     true);
	assert.equal(parseNullable('', '', 'string | undefined'), true);
	assert.equal(parseNullable('', '', 'Optional[str]'),     true);
});

test('parseNullable: returns undefined for non-nullable types', () => {
	assert.equal(parseNullable('', '', 'String'), undefined);
	assert.equal(parseNullable('', '', undefined), undefined);
});

// ---------------------------------------------------------------------------
// Body regex: TypeScript
// ---------------------------------------------------------------------------

test('extractTsFields: typed + optional + default', () => {
	const body = `class Foo {
  public name: string;
  age?: number;
  active: boolean = true;
}`;
	const fields = extractTsFields(body, '/p/Foo.ts', 10);
	const byName = new Map(fields.map(f => [f.name, f]));
	assert.equal(byName.get('name')?.type, 'string');
	assert.deepEqual(byName.get('name')?.modifiers, ['public']);
	assert.equal(byName.get('age')?.nullable, true);
	assert.equal(byName.get('active')?.default, 'true');
});

test('extractTsFields: skips method-shaped lines', () => {
	const body = `class Foo {
  name: string;
  greet(): void {
    return;
  }
}`;
	const fields = extractTsFields(body, '/p/Foo.ts', 0);
	const names = fields.map(f => f.name);
	assert.ok(names.includes('name'));
	assert.ok(!names.includes('greet'), 'methods must be skipped');
});

test('extractTsFields: declaredAt line tracks body offset', () => {
	const body = `class Foo {
  first: string;
  second: number;
}`;
	const fields = extractTsFields(body, '/p/Foo.ts', 100);
	const second = fields.find(f => f.name === 'second')!;
	assert.equal(second.declaredAt.path, '/p/Foo.ts');
	assert.equal(second.declaredAt.line, 102, 'line number includes baseLine + body offset');
});

// ---------------------------------------------------------------------------
// Body regex: Python
// ---------------------------------------------------------------------------

test('extractPyFields: type-annotated dataclass-style fields', () => {
	const body = `class User:
    name: str
    age: int = 0
    email: Optional[str] = None`;
	const fields = extractPyFields(body, '/p/user.py', 0);
	const byName = new Map(fields.map(f => [f.name, f]));
	assert.equal(byName.get('name')?.type, 'str');
	assert.equal(byName.get('age')?.default, '0');
	assert.equal(byName.get('email')?.nullable, true);
});

test('extractPyFields: skips bare indented identifiers (likely method body)', () => {
	const body = `class Foo:
    x: int
    print(x)`;
	const fields = extractPyFields(body, '/p/foo.py', 0);
	assert.deepEqual(fields.map(f => f.name), ['x']);
});

// ---------------------------------------------------------------------------
// Body regex: Go
// ---------------------------------------------------------------------------

test('extractGoFields: simple struct fields with types', () => {
	const body = `type User struct {
\tID    int64
\tName  string
\tEmail *string
}`;
	const fields = extractGoFields(body, '/p/user.go', 5);
	const byName = new Map(fields.map(f => [f.name, f]));
	assert.equal(byName.get('ID')?.type, 'int64');
	assert.equal(byName.get('Name')?.type, 'string');
	assert.equal(byName.get('Email')?.type, '*string');
	assert.equal(byName.get('Email')?.nullable, true, 'pointer fields are nullable');
});

test('extractGoFields: handles struct tags', () => {
	const body = 'type User struct {\n\tID int64 `json:"id"`\n\tName string `json:"name,omitempty"`\n}';
	const fields = extractGoFields(body, '/p/user.go', 0);
	assert.equal(fields.length, 2);
	assert.equal(fields[0]!.name, 'ID');
	assert.equal(fields[1]!.name, 'Name');
});

test('extractGoFields: comma-separated names share a type', () => {
	const body = `type Point struct {
\tX, Y int
}`;
	const fields = extractGoFields(body, '/p/point.go', 0);
	assert.deepEqual(fields.map(f => f.name), ['X', 'Y']);
	for (const f of fields) assert.equal(f.type, 'int');
});

// ---------------------------------------------------------------------------
// End-to-end -- tool execute() against an in-memory LMDB graph
// ---------------------------------------------------------------------------

const REPO = '/repo/test';

let dir: string;
let tool: Tool;

const stubDeps = {
	session: {} as ToolDeps['session'],
	send: () => { /* drop */ },
	requestId: 0,
} as unknown as ToolDeps;

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeEntity(opts: {
	name: string;
	kind: EntityKind;
	language: Language;
	file: string;
	body: string;
	signature?: string;
	startLine?: number;
}): Entity {
	const e: Entity = {
		id:        makeEntityId(REPO, opts.file, opts.kind, opts.name),
		kind:      opts.kind,
		name:      opts.name,
		language:  opts.language,
		repoId:    1,
		repo:      REPO,
		file:      opts.file,
		startLine: opts.startLine ?? 1,
		endLine:   (opts.startLine ?? 1) + 10,
		body:      opts.body,
		embedding: [],
		indexedAt: '2026-05-09T10:00:00.000Z',
	};
	if (opts.signature !== undefined) e.signature = opts.signature;
	return e;
}

test.beforeEach(async () => {
	await closeGraphStore();
	_resetRegistryForTests();
	dir = mkdtempSync(join(tmpdir(), 'insrc-class-fields-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const now = new Date().toISOString();
	await addRepo(null, { path: REPO, name: '', addedAt: now, status: 'pending' });
	registerCodeClassFieldsTool();
	const t = getTool('code_class_fields');
	assert.ok(t, 'code_class_fields must be registered');
	tool = t;
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('execute: empty entityId returns 400-shape error', async () => {
	const r: ToolResult = await tool.execute({ entityId: '' }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /entityId is required/);
});

test('execute: entity not found returns success: false', async () => {
	const fakeId = 'a'.repeat(32);
	const r = await tool.execute({ entityId: fakeId }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /entity not found/);
});

test('execute: non-class entity returns success: false', async () => {
	const fn = makeEntity({
		name: 'helper', kind: 'function', language: 'typescript',
		file: `${REPO}/src/helper.ts`, body: 'function helper() {}',
	});
	await upsertEntities(null, [fn]);
	const r = await tool.execute({ entityId: fn.id }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /not a class-like kind/);
});

test('execute: Java class walks DEFINES edges to variable children', async () => {
	const cls = makeEntity({
		name: 'PurchaseOrder', kind: 'class', language: 'java',
		file: `${REPO}/src/PurchaseOrder.java`,
		body:  'public class PurchaseOrder {\n  private final Long id;\n  private String code;\n}',
	});
	const idField = makeEntity({
		name: 'PurchaseOrder.id', kind: 'variable', language: 'java',
		file: cls.file, startLine: 2,
		body: 'private final Long id;',
		signature: 'private final Long id',
	});
	const codeField = makeEntity({
		name: 'PurchaseOrder.code', kind: 'variable', language: 'java',
		file: cls.file, startLine: 3,
		body: 'private String code = "DEFAULT";',
		signature: 'private String code',
	});
	await upsertEntities(null, [cls, idField, codeField]);
	await upsertRelations(null, [
		{ kind: 'DEFINES', from: cls.id, to: idField.id,   resolved: true },
		{ kind: 'DEFINES', from: cls.id, to: codeField.id, resolved: true },
	]);

	const r = await tool.execute({ entityId: cls.id }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['source'], 'graph');
	assert.equal(data['className'], 'PurchaseOrder');
	const fields = data['fields'] as Array<Record<string, unknown>>;
	assert.equal(fields.length, 2);

	const byName = new Map(fields.map(f => [f['name'], f]));
	const id = byName.get('id')!;
	assert.equal(id['type'], 'Long');
	assert.deepEqual(id['modifiers'], ['private', 'final']);
	const code = byName.get('code')!;
	assert.equal(code['type'], 'String');
	assert.equal(code['default'], '"DEFAULT"');
});

test('execute: TypeScript class regex-parses body fields', async () => {
	const cls = makeEntity({
		name: 'Order', kind: 'class', language: 'typescript',
		file: `${REPO}/src/Order.ts`,
		body: `class Order {
  public id: string;
  amount?: number;
  status: 'open' | 'closed' = 'open';
}`,
	});
	await upsertEntities(null, [cls]);

	const r = await tool.execute({ entityId: cls.id }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['source'], 'body');
	const fields = data['fields'] as Array<Record<string, unknown>>;
	const byName = new Map(fields.map(f => [f['name'], f]));
	assert.equal(byName.get('id')?.['type'], 'string');
	assert.equal(byName.get('amount')?.['nullable'], true);
	assert.equal(byName.get('status')?.['default'], "'open'");
});

test('execute: Python class regex-parses body fields', async () => {
	const cls = makeEntity({
		name: 'User', kind: 'class', language: 'python',
		file: `${REPO}/src/user.py`,
		body: `class User:
    name: str
    age: int = 0
    email: Optional[str] = None`,
	});
	await upsertEntities(null, [cls]);

	const r = await tool.execute({ entityId: cls.id }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['source'], 'body');
	const fields = data['fields'] as Array<Record<string, unknown>>;
	const byName = new Map(fields.map(f => [f['name'], f]));
	assert.equal(byName.get('name')?.['type'], 'str');
	assert.equal(byName.get('age')?.['default'], '0');
	assert.equal(byName.get('email')?.['nullable'], true);
});

test('execute: Go struct regex-parses fields', async () => {
	const cls = makeEntity({
		name: 'Order', kind: 'class', language: 'go',
		file: `${REPO}/src/order.go`,
		body: `type Order struct {
\tID     int64
\tName   string
\tParent *Order
}`,
	});
	await upsertEntities(null, [cls]);

	const r = await tool.execute({ entityId: cls.id }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['source'], 'body');
	const fields = data['fields'] as Array<Record<string, unknown>>;
	const byName = new Map(fields.map(f => [f['name'], f]));
	assert.equal(byName.get('ID')?.['type'], 'int64');
	assert.equal(byName.get('Parent')?.['nullable'], true,
		'pointer fields should be flagged nullable');
});

test('execute: empty class returns fields: []', async () => {
	const cls = makeEntity({
		name: 'Empty', kind: 'class', language: 'typescript',
		file: `${REPO}/src/Empty.ts`,
		body: 'class Empty {\n}',
	});
	await upsertEntities(null, [cls]);

	const r = await tool.execute({ entityId: cls.id }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.deepEqual(data['fields'], []);
});
