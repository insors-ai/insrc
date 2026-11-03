/**
 * Epic c2ba6fa6, Story s9, t4 -- the C reader. Over the registered reader
 * (the real tree-sitter-c grammar behind the guarded load) and the real
 * per-file resolver: a .c fixture yields its functions and types and its
 * include and call relationships; a quoted include of a file on disk is an
 * IMPORTS to that file (extracted) and an angle include an IMPORTS to a module
 * stub under the 'native' namespace; a same-file call is resolved (extracted);
 * a fixture with a syntax error still yields the declarations outside the
 * broken region.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/c.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cParser } from '../c.js';
import { makeEntityId } from '../base.js';
import { getParser } from '../registry.js';
import { resolveRelations } from '../../resolver.js';
import { SHARED_MODULES_REPO_ID } from '../../../shared/repo-namespaces.js';

const dir  = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s9-c-')));
const REPO = join(dir, 'repo');
mkdirSync(join(REPO, 'src'), { recursive: true });
const FILE = join(REPO, 'src', 'main.c');
const HEADER = join(REPO, 'src', 'util.h');
writeFileSync(HEADER, 'int util_add(int a, int b);\n');
test.after(() => { rmSync(dir, { recursive: true, force: true }); });

const SOURCE = `#include <stdio.h>
#include "util.h"
#include "missing.h"

struct point { int x; int y; };
union value { int i; float f; };
enum color { RED, GREEN };
typedef struct point point_t;
struct forward;

static int square(int n) { return n * n; }

int *make(void) { return 0; }

int main(void) {
	int s = square(3);
	printf("%d\\n", util_add(s, 1));
	return 0;
}
`;

assert.ok(cParser, 'the tree-sitter-c grammar loaded');
const parse = (source: string) => cParser!.parse(FILE, source, REPO, 1);
const named = (r: ReturnType<typeof parse>, kind: string) => r.entities.filter(e => e.kind === kind).map(e => e.name).sort();
const idOf = (kind: 'function' | 'type', name: string) => makeEntityId(REPO, FILE, kind, name);
const fileId = makeEntityId(REPO, FILE, 'file', FILE);

test('s9 t4: a .c fixture yields its functions and types, with DEFINES, and its include and call relationships', () => {
	assert.equal(getParser(FILE), cParser, '.c files are read by the C reader');
	const r = parse(SOURCE);

	assert.deepEqual(named(r, 'function'), ['main', 'make', 'square']);
	assert.deepEqual(named(r, 'type'), ['color', 'point', 'point_t', 'value'], 'a struct without a body is not a type');
	assert.ok(r.entities.every(e => e.kind === 'module' || e.language === 'c'));
	assert.equal(r.entities.find(e => e.name === 'square')!.isExported, false, 'a static function is not exported');
	assert.equal(r.entities.find(e => e.name === 'main')!.isExported, true);
	assert.equal(r.entities.find(e => e.kind === 'file')!.signature, undefined, 'a clean parse is not marked');

	const defines = r.relations.filter(x => x.kind === 'DEFINES' && x.from === fileId).map(x => x.to).sort();
	assert.deepEqual(defines, [...['main', 'make', 'square'].map(n => idOf('function', n)), ...['color', 'point', 'point_t', 'value'].map(n => idOf('type', n))].sort());

	const calls = r.relations.filter(x => x.kind === 'CALLS').map(x => `${x.from === idOf('function', 'main') ? 'main' : '?'} -> ${x.to}`).sort();
	assert.deepEqual(calls, ['main -> printf', 'main -> square', 'main -> util_add']);
	const imports = r.relations.filter(x => x.kind === 'IMPORTS').map(x => String(x.to));
	assert.ok(imports.includes('util.h') && imports.includes('missing.h'));
});

test('s9 t4: a quoted include of a file on disk is an IMPORTS to that file (extracted); an angle include is an IMPORTS to a native module stub; a missing one stays pending', () => {
	const r = parse(SOURCE);
	const resolved = resolveRelations(r.relations, FILE, REPO, r.entities);
	const imports = resolved.filter(x => x.kind === 'IMPORTS');

	const header = imports.find(x => x.to === makeEntityId(REPO, HEADER, 'file', HEADER));
	assert.ok(header, 'the quoted include names the header file');
	assert.equal(header.resolved, true);
	assert.equal(header.evidence, 'extracted');

	const stubId = makeEntityId('native', '', 'module', 'stdio.h');
	const stub = r.entities.find(e => e.id === stubId);
	assert.equal(stub?.kind, 'module');
	assert.equal(stub?.repoId, SHARED_MODULES_REPO_ID.native);
	assert.equal(imports.find(x => x.to === stubId)?.resolved, true);

	const missing = imports.find(x => x.to === 'missing.h');
	assert.equal(missing?.resolved, false);
	assert.equal(missing?.meta?.['class'], 'no-candidate');
});

test('s9 t4: a same-file call is resolved (extracted); a call to another file stays pending for the cross-file pass', () => {
	const r = parse(SOURCE);
	const calls = resolveRelations(r.relations, FILE, REPO, r.entities).filter(x => x.kind === 'CALLS');
	const sq = calls.find(x => x.to === idOf('function', 'square'));
	assert.equal(sq?.resolved, true);
	assert.equal(sq?.evidence, 'extracted');
	assert.equal(calls.find(x => x.to === 'util_add')?.resolved, false);
});

test('s9 t4: a fixture with a syntax error still yields the declarations outside the broken region, and its file is marked', () => {
	const r = parse(`struct ok { int a; };
int before(void) { return 1; }
int broken(void) { return 1 +; @@ }
int after(int x) { return before() + x; }
`);
	assert.equal(r.entities.find(e => e.kind === 'file')!.signature, 'parse-error');
	const fns = named(r, 'function');
	assert.deepEqual(fns, ['after', 'before', 'broken']);
	assert.ok(r.relations.some(x => x.kind === 'CALLS' && x.from === idOf('function', 'after') && x.to === 'before'), 'the call after the broken region is read');
	assert.deepEqual(named(r, 'type'), ['ok']);
});
