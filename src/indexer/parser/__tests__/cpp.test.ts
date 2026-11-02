/**
 * Epic c2ba6fa6, Story s9, t5 -- the C++ reader. Over the registered reader
 * (the real tree-sitter-cpp grammar behind the guarded load): a .cpp and a .h
 * fixture yield classes, methods and functions, with namespaces folded into
 * their names, and their include, call and inheritance relationships; a
 * header's declarations are functions a caller in another file can link to; a
 * fixture with a syntax error still yields the declarations outside the broken
 * region.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/cpp.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cppParser } from '../cpp.js';
import { makeEntityId } from '../base.js';
import { getParser } from '../registry.js';
import { SHARED_MODULES_REPO_ID } from '../../../shared/repo-namespaces.js';

const REPO = '/repo';
const CPP  = '/repo/src/shape.cpp';
const H    = '/repo/src/util.h';

const SOURCE = `#include "shape.hpp"
#include <vector>

namespace geo {
class Shape : public Base, private ns::Mixin<int> {
public:
	virtual double area() const = 0;
	void draw() { helper(); geo::util(); }
private:
	static int count();
};
struct Point { int x; };
enum class Color { Red };
using Size = unsigned long;
}

namespace { int hidden() { return 1; } }

double geo::Shape::area() const { return 0; }
int geo::Shape::count() { return 0; }
static int local() { return hidden(); }
template <typename T> T max_of(T a, T b) { return a > b ? a : b; }
`;

const HEADER = `#ifndef UTIL_H
#define UTIL_H
int util_add(int a, int b);
static int util_private(void);
typedef struct pair { int a; int b; } pair_t;
#endif
`;

assert.ok(cppParser, 'the tree-sitter-cpp grammar loaded');
const parse = (file: string, source: string) => cppParser!.parse(file, source, REPO, 1);
type R = ReturnType<typeof parse>;
const of = (r: R, kind: string) => r.entities.filter(e => e.kind === kind).map(e => e.name).sort();
const ent = (r: R, name: string) => r.entities.find(e => e.name === name)!;
const named = (r: R) => new Map(r.entities.map(e => [e.id, e.name]));
const rels = (r: R, kind: string) => { const n = named(r); return r.relations.filter(x => x.kind === kind).map(x => `${n.get(x.from) ?? x.from} -> ${n.get(x.to) ?? x.to}`).sort(); };

test('s9 t5: a .cpp fixture yields classes, methods and functions with namespaces folded in, and its include, call and inheritance relationships', () => {
	for (const ext of ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.h']) assert.equal(getParser(`/repo/a${ext}`), cppParser, `${ext} is read by the C++ reader`);
	const r = parse(CPP, SOURCE);

	assert.deepEqual(of(r, 'class'), ['geo::Point', 'geo::Shape']);
	assert.deepEqual(of(r, 'method'), ['geo::Shape::area', 'geo::Shape::count', 'geo::Shape::draw']);
	assert.deepEqual(of(r, 'function'), ['hidden', 'local', 'max_of']);
	assert.deepEqual(of(r, 'type'), ['geo::Color', 'geo::Size']);
	assert.ok(r.entities.filter(e => e.kind !== 'module').every(e => e.language === 'cpp'));

	assert.equal(ent(r, 'geo::Shape::area').isExported, true, 'a public member is exported');
	assert.equal(ent(r, 'geo::Shape::count').isExported, false, 'a private member stays private where it is defined outside the class');
	assert.equal(ent(r, 'hidden').isExported, false, 'an anonymous namespace is not exported');
	assert.equal(ent(r, 'local').isExported, false, 'a static function is not exported');
	assert.equal(ent(r, 'max_of').isExported, true);
	assert.ok(ent(r, 'geo::Shape::area').body.includes('return 0'), 'the definition, not the declaration, is the method');

	const shape = 'geo::Shape';
	assert.deepEqual(rels(r, 'DEFINES').filter(x => x.startsWith(shape + ' ')), [`${shape} -> geo::Shape::area`, `${shape} -> geo::Shape::count`, `${shape} -> geo::Shape::draw`]);
	assert.ok(rels(r, 'DEFINES').includes(`${CPP} -> ${shape}`));
	assert.deepEqual(rels(r, 'INHERITS'), [`${shape} -> Base`, `${shape} -> ns::Mixin`]);
	assert.deepEqual(rels(r, 'CALLS'), ['geo::Shape::draw -> geo::util', 'geo::Shape::draw -> helper', 'local -> hidden']);

	const stub = makeEntityId('native', '', 'module', 'vector');
	assert.equal(r.entities.find(e => e.id === stub)?.repoId, SHARED_MODULES_REPO_ID.native);
	const imports = r.relations.filter(x => x.kind === 'IMPORTS');
	assert.ok(imports.some(x => x.to === stub && x.resolved));
	assert.ok(imports.some(x => x.to === 'shape.hpp' && !x.resolved && x.meta?.['isRelative'] === true));
});

test('s9 t5: a .h header is read as cpp and its declarations are functions a caller in another file can link to', () => {
	const r = parse(H, HEADER);
	assert.equal(r.entities.find(e => e.kind === 'file')!.language, 'cpp');
	assert.deepEqual(of(r, 'function'), ['util_add', 'util_private']);
	assert.equal(ent(r, 'util_add').isExported, true);
	assert.equal(ent(r, 'util_private').isExported, false);
	assert.deepEqual(of(r, 'class'), ['pair']);
	assert.deepEqual(of(r, 'type'), ['pair_t']);
	assert.ok(rels(r, 'DEFINES').includes(`${H} -> util_add`));
});

test('s9 t5: a fixture with a syntax error still yields the declarations outside the broken region, and its file is marked', () => {
	const r = parse(CPP, `class Ok { public: void m() {} };
int before() { return 1; }
int broken() { return 1 +; @@ }
int after(int x) { return before() + x; }
`);
	assert.equal(r.entities.find(e => e.kind === 'file')!.signature, 'parse-error');
	assert.deepEqual(of(r, 'function'), ['after', 'before', 'broken']);
	assert.deepEqual(of(r, 'method'), ['Ok::m']);
	assert.ok(rels(r, 'CALLS').includes('after -> before'), 'the call after the broken region is read');
});
