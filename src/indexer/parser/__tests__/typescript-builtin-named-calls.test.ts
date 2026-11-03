/**
 * ISSUE-1ad687e6 S001 -- calls to user code that share a name with a built-in
 * method. The TypeScript reader keeps a call to `parse` / `find` / `create` ...
 * when it is bare or its receiver is proven a user object, and still drops a
 * built-in method name on any other receiver, so name resolution cannot link
 * `items.map()` to a user `map`.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { typescriptParser } from '../typescript.js';
import type { ParseResult } from '../base.js';

const REPO = '/repo';

function parse(src: string, file = '/repo/src/mod.ts'): ParseResult {
	return typescriptParser.parse(file, src, REPO, 1);
}

/** The callee names of the CALLS rows from the function or method `caller`, sorted. */
function calls(r: ParseResult, caller: string): string[] {
	const e = r.entities.find(x => (x.kind === 'function' || x.kind === 'method') && x.name === caller);
	assert.ok(e, `no function or method named ${caller}`);
	return r.relations.filter(x => x.kind === 'CALLS' && x.from === e.id).map(x => String(x.to)).sort();
}

test('S001 t1: bare calls to user functions named like built-ins are kept; bare global functions are not', () => {
	const r = parse(`
import { parse } from './p.js';
function find(): void {}
export function run(): void {
	parse('x');
	find();
	create();
	setTimeout(run, 1);
	require('fs');
	parseInt('1');
}
function create(): void {}
`);
	assert.deepEqual(calls(r, 'run'), ['create', 'find', 'parse']);
});

test('S001 t1: calls on this, super and import bindings are kept whatever the name; a local shadowing an import is not', () => {
	const r = parse(`
import cfg from './cfg.js';
import * as ns from './ns.js';
import { registry, store as st } from './r.js';
class Base { emit(): void {} }
export class Repo extends Base {
	find(): void {}
	process(): void {}
	all(): void {
		this.find();
		this.process();
		super.emit();
	}
}
export function viaImports(): void {
	cfg.parse('a');
	ns.resolve('b');
	registry.create({});
	st.push(1);
}
export function shadowed(): void {
	const ns = [1, 2];
	ns.map(x => x);
}
export function shadowedParam(registry: number[]): void {
	registry.filter(Boolean);
}
export function shadowedDestructured(value: any): void {
	const { ns, cfg: renamed } = value;
	const [registry] = value;
	ns.find(1);
	registry.find(1);
	for (const st of value) st.push(1);
	for (const [cfg] of value) cfg.parse('x');
}
export function shadowedByDeclaration(): void {
	function ns(): void {}
	class registry {}
	ns.find(1);
	registry.find(1);
}
export function varHoisted(): void {
	{ var ns = [1]; }
	ns.find(1);
	const inner = () => { if (true) { var registry = [1]; } registry.find(1); };
	inner();
}
export function outer(ns: number[]): void {
	const innerArrow = (): void => { ns.find(Boolean); registry.create({}); };
	innerArrow();
}
export function blockScoped(): void {
	{ const ns = [1]; ns.map(x => x); }
	for (const registry of [[1]]) registry.push(1);
	ns.find(1);
	registry.create({});
}
`);
	assert.deepEqual(calls(r, 'all'), ['emit', 'find', 'process']);
	assert.deepEqual(calls(r, 'viaImports'), ['create', 'parse', 'push', 'resolve']);
	assert.deepEqual(calls(r, 'shadowed'), [], 'a local named like an import is not the import');
	assert.deepEqual(calls(r, 'shadowedParam'), [], 'nor is a parameter');
	assert.deepEqual(calls(r, 'shadowedDestructured'), [], 'nor a destructured local or a for-of binding');
	assert.deepEqual(calls(r, 'shadowedByDeclaration'), [], 'nor a nested function or class declaration');
	assert.deepEqual(calls(r, 'varHoisted'), ['inner'], 'a var in a block shadows the import for the whole function');
	assert.deepEqual(calls(r, 'innerArrow'), ['create'], "a closure extracted on its own still sees its outer function's parameter shadowing the import");
	assert.deepEqual(calls(r, 'blockScoped'), ['create', 'find'], "a block's or loop's local shadows the import only inside it");
});

test('S001 t1: built-in-named member calls on untyped locals and built-in objects record no row, and import bindings do not leak to the next file', () => {
	const r = parse(`
export function local(items: unknown): void {
	const list = getList();
	list.find(x => x);
	list.map(x => x);
	(items as any).push(1);
	JSON.parse('{}');
	console.log('x');
	Promise.all([]);
	list.load();
}
function getList(): any { return []; }
`);
	assert.deepEqual(calls(r, 'local'), ['getList', 'load'], 'only the non-built-in names');

	parse(`import { list } from './l.js';\nexport function a(): void { list.find(1); }\n`, '/repo/src/a.ts');
	const next = parse(`export function b(): void { const x = 1; list.find(1); }\n`, '/repo/src/b.ts');
	assert.deepEqual(calls(next, 'b'), [], "the previous file's import of `list` does not apply here");
});
