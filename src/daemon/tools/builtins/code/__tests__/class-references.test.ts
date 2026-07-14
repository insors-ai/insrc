/**
 * Tests for `code_class_references` (code-analyzer-skills.md Phase 0.3).
 *
 * Two layers:
 *
 *   1. Pure helpers: parseKinds (input parsing) and buildSnippet
 *      (≤200-char first-line excerpt).
 *
 *   2. End-to-end against an in-memory LMDB graph:
 *        - INHERITS / IMPLEMENTS / CALLS / REFERENCES edges all
 *          surface; counts per kind are correct
 *        - kinds filter narrows the result set
 *        - REF_LIMIT cap surfaces truncated: true and stops at 200
 *        - missing entityId / non-class entityId / unknown kind
 *          all return success: false with a clear message
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
	registerCodeClassReferencesTool,
	_parseKindsForTest as parseKinds,
	_buildSnippetForTest as buildSnippet,
	REF_LIMIT_FOR_TEST,
} from '../class-references.js';
import type { Tool, ToolDeps, ToolResult } from '../../../types.js';
import type { Entity, EntityKind, Language, Relation } from '../../../../../shared/types.js';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('parseKinds: undefined yields all four kinds', () => {
	const k = parseKinds(undefined);
	assert.ok(k !== null);
	assert.deepEqual([...k!].sort(), ['CALLS', 'IMPLEMENTS', 'INHERITS', 'REFERENCES']);
});

test('parseKinds: subset is honoured', () => {
	const k = parseKinds(['INHERITS', 'IMPLEMENTS']);
	assert.deepEqual([...k!].sort(), ['IMPLEMENTS', 'INHERITS']);
});

test('parseKinds: unknown kind rejected', () => {
	assert.equal(parseKinds(['NOPE']), null);
});

test('parseKinds: empty array rejected', () => {
	assert.equal(parseKinds([]), null);
});

test('parseKinds: non-array rejected', () => {
	assert.equal(parseKinds('CALLS'), null);
});

test('buildSnippet: first non-empty line, trimmed', () => {
	assert.equal(buildSnippet('  function foo() {\n  return 1;\n}'), 'function foo() {');
});

test('buildSnippet: caps at 200 chars with ellipsis', () => {
	const long = 'a'.repeat(300);
	const s    = buildSnippet(long);
	assert.ok(s !== undefined);
	assert.equal(s.length, 203, 'should be 200 chars + "..."');
	assert.ok(s.endsWith('...'));
});

test('buildSnippet: empty body returns undefined', () => {
	assert.equal(buildSnippet(''), undefined);
	assert.equal(buildSnippet('\n\n'), undefined);
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
	file?: string;
	body?: string;
	startLine?: number;
	language?: Language;
}): Entity {
	const file = opts.file ?? `${REPO}/src/${opts.name}.ts`;
	return {
		id:        makeEntityId(REPO, file, opts.kind, opts.name),
		kind:      opts.kind,
		name:      opts.name,
		language:  opts.language ?? 'typescript',
		repoId:    1,
		repo:      REPO,
		file,
		startLine: opts.startLine ?? 10,
		endLine:   (opts.startLine ?? 10) + 5,
		body:      opts.body ?? `function ${opts.name}() {}`,
		embedding: [],
		indexedAt: '2026-05-09T10:00:00.000Z',
	};
}

test.beforeEach(async () => {
	await closeGraphStore();
	_resetRegistryForTests();
	dir = mkdtempSync(join(tmpdir(), 'insrc-class-refs-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const now = new Date().toISOString();
	await addRepo(null, { path: REPO, name: '', addedAt: now, status: 'pending' });
	registerCodeClassReferencesTool();
	const t = getTool('code_class_references');
	assert.ok(t, 'code_class_references must be registered');
	tool = t;
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('execute: empty entityId returns 400', async () => {
	const r: ToolResult = await tool.execute({ entityId: '' }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /entityId is required/);
});

test('execute: unknown kinds rejected before DB lookup', async () => {
	const r = await tool.execute({ entityId: 'a'.repeat(32), kinds: ['BOGUS'] }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /kinds/);
});

test('execute: missing entity returns success: false', async () => {
	const r = await tool.execute({ entityId: 'a'.repeat(32) }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /entity not found/);
});

test('execute: non-class entity rejected', async () => {
	const fn = makeEntity({ name: 'helper', kind: 'function' });
	await upsertEntities(null, [fn]);
	const r = await tool.execute({ entityId: fn.id }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /not class-like/);
});

test('execute: surfaces INHERITS / IMPLEMENTS / CALLS / REFERENCES with per-kind counts', async () => {
	const cls = makeEntity({ name: 'BaseHandler', kind: 'class' });
	const sub = makeEntity({ name: 'AuthHandler', kind: 'class', startLine: 50 });
	const impl = makeEntity({ name: 'LogHandler',  kind: 'class', startLine: 100 });
	const caller = makeEntity({ name: 'invoke', kind: 'function', startLine: 200 });
	const refSite = makeEntity({ name: 'helper', kind: 'function', startLine: 300 });
	await upsertEntities(null, [cls, sub, impl, caller, refSite]);

	const rels: Relation[] = [
		{ kind: 'INHERITS',   from: sub.id,     to: cls.id, resolved: true },
		{ kind: 'IMPLEMENTS', from: impl.id,    to: cls.id, resolved: true },
		{ kind: 'CALLS',      from: caller.id,  to: cls.id, resolved: true },
		{ kind: 'REFERENCES', from: refSite.id, to: cls.id, resolved: true },
	];
	await upsertRelations(null, rels);

	const r = await tool.execute({ entityId: cls.id }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	const refs = data['references'] as Array<Record<string, unknown>>;
	assert.equal(refs.length, 4);
	const kinds = refs.map(r => r['kind']).sort();
	assert.deepEqual(kinds, ['CALLS', 'IMPLEMENTS', 'INHERITS', 'REFERENCES']);

	const counts = data['counts'] as Record<string, number>;
	assert.equal(counts['INHERITS'],   1);
	assert.equal(counts['IMPLEMENTS'], 1);
	assert.equal(counts['CALLS'],      1);
	assert.equal(counts['REFERENCES'], 1);
	assert.equal(data['truncated'], false);
});

test('execute: kinds filter narrows the result set', async () => {
	const cls = makeEntity({ name: 'Base', kind: 'class' });
	const sub = makeEntity({ name: 'A', kind: 'class' });
	const caller = makeEntity({ name: 'invoke', kind: 'function' });
	await upsertEntities(null, [cls, sub, caller]);
	await upsertRelations(null, [
		{ kind: 'INHERITS', from: sub.id,    to: cls.id, resolved: true },
		{ kind: 'CALLS',    from: caller.id, to: cls.id, resolved: true },
	]);

	const r = await tool.execute({ entityId: cls.id, kinds: ['INHERITS'] }, stubDeps);
	const data = r.data as Record<string, unknown>;
	const refs = data['references'] as Array<Record<string, unknown>>;
	assert.equal(refs.length, 1);
	assert.equal(refs[0]!['kind'], 'INHERITS');
});

test('execute: snippet captures the first body line, trimmed', async () => {
	const cls = makeEntity({ name: 'Foo', kind: 'class' });
	const caller = makeEntity({
		name: 'doIt', kind: 'function', startLine: 7,
		body: '  function doIt() {\n    return new Foo();\n  }',
	});
	await upsertEntities(null, [cls, caller]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: caller.id, to: cls.id, resolved: true },
	]);

	const r = await tool.execute({ entityId: cls.id }, stubDeps);
	const refs = (r.data as Record<string, unknown>)['references'] as Array<Record<string, unknown>>;
	assert.equal(refs.length, 1);
	assert.equal(refs[0]!['snippet'], 'function doIt() {');
	assert.equal(refs[0]!['fromPath'], caller.file);
	assert.equal(refs[0]!['fromLine'], 7);
});

test('execute: empty class -> empty references with all-zero counts', async () => {
	const cls = makeEntity({ name: 'Lonely', kind: 'class' });
	await upsertEntities(null, [cls]);
	const r = await tool.execute({ entityId: cls.id }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.deepEqual(data['references'], []);
	assert.equal(data['truncated'], false);
	const counts = data['counts'] as Record<string, number>;
	for (const k of ['CALLS', 'INHERITS', 'IMPLEMENTS', 'REFERENCES']) {
		assert.equal(counts[k], 0);
	}
});

test('execute: REF_LIMIT cap stops at 200 and sets truncated: true', async () => {
	const cls = makeEntity({ name: 'Hot', kind: 'class' });
	const callers: Entity[] = [];
	for (let i = 0; i < REF_LIMIT_FOR_TEST + 5; i++) {
		callers.push(makeEntity({
			name: `caller${i}`, kind: 'function',
			file: `${REPO}/src/c${i}.ts`,
		}));
	}
	await upsertEntities(null, [cls, ...callers]);
	await upsertRelations(null, callers.map(c => ({
		kind: 'CALLS' as const, from: c.id, to: cls.id, resolved: true,
	})));

	const r = await tool.execute({ entityId: cls.id }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	const refs = data['references'] as Array<unknown>;
	assert.equal(refs.length, REF_LIMIT_FOR_TEST);
	assert.equal(data['truncated'], true);
});
