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
export const namedExpr = function ns(): void { ns.find(1); registry.create({}); };
export function defaults(value: any): void {
	const { x = ns, k: y = registry, [cfg.parse('k')]: z } = value;
	const [a = st] = value;
	ns.find(1);
	registry.create({});
	cfg.resolve('r');
	st.push(1);
}
export function moreBindings(xs: any[], k: number): void {
	for (var ns of xs) {}
	for (var cfg in xs) {}
	abstract class registry {}
	enum st { A }
	ns.find(1);
	cfg.parse('x');
	registry.create({});
	st.push(1);
}
export function switchScoped(k: number): void {
	switch (k) { case 1: const ns = [1]; ns.map(x => x); }
	ns.find(1);
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
	assert.deepEqual(calls(r, 'namedExpr'), ['create'], "a named function expression's own name shadows the import inside it");
	assert.deepEqual(calls(r, 'defaults'), ['create', 'find', 'parse', 'push', 'resolve'], 'names in destructuring defaults and computed keys are not declared');
	assert.deepEqual(calls(r, 'moreBindings'), [], 'var loop headers, abstract classes and enums shadow imports');
	assert.deepEqual(calls(r, 'switchScoped'), ['find'], "a switch's const shadows the import only inside the switch");
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

test('S001 t2: calls on typed, new-initialised and constructor-assigned fields are kept whatever the name', () => {
	const r = parse(`
import * as ns from './ns.js';
class Store { find(): void {} }
export class Service {
	private typed: Store;
	private generic: Repo<number>;
	private qualified: ns.Repo;
	private created = new Store();
	private plain: Store[];
	private builtin: Map<string, number>;
	private untyped;
	constructor(private readonly param: Store, readonly other: Store, notAProperty: Store, private defaulted = new Store()) {
		this.assigned = new Store();
	}
	run(): void {
		this.typed.find();
		this.generic.create();
		this.qualified.resolve();
		this.created.emit();
		this.param.push();
		this.other.parse();
		this.assigned.apply();
		this.plain.map(x => x);
		this.builtin.keys();
		this.untyped.find();
		this.notAProperty.filter();
		this.defaulted.bind();
		this.typed!.at(0);
		(this.created).fill(0);
	}
}
`);
	assert.deepEqual(calls(r, 'run'), ['apply', 'at', 'bind', 'create', 'emit', 'fill', 'find', 'parse', 'push', 'resolve'],
		'typed, generic, qualified, new-initialised, parameter-property (typed or new-defaulted) and assigned fields; not array, built-in, untyped or a plain constructor parameter');
});

test('S001 t2: calls on typed parameters and new-initialised locals are kept; built-in, array, union and untyped receivers are not', () => {
	const r = parse(`
class Repo { find(): void {} }
export function viaParams(repo: Repo, maybe?: Repo, list: Repo[], either: Repo | undefined, p: Promise<Repo>, e: EventEmitter, generic: Array<Repo>, dflt = new Repo()): void {
	generic.map(x => x);
	dflt.call();
	repo.find();
	maybe.create();
	list.map(x => x);
	either.resolve();
	p.then(x => x);
	e.emit('x');
}
export function viaLocals(): void {
	const created = new Repo();
	const typed: Repo = make();
	const untyped = make();
	const builtin = new Map();
	{ var hoisted = new Repo(); var hoistedTyped: Repo = make(); }
	hoisted.resolve();
	hoistedTyped.emit();
	created.push();
	typed.parse();
	untyped.find();
	builtin.keys();
}
export function asserted(v: unknown): void {
	(v as Repo).includes(1);
	(v satisfies Repo).flat();
	(<Repo>v).call();
	(v as Map<string, number>).keys();
	(v).split(',');
}
function make(): any { return null; }
`);
	assert.deepEqual(calls(r, 'viaParams'), ['call', 'create', 'find'], 'typed and new-defaulted parameters; not Array<Repo>, arrays, unions or built-ins');
	assert.deepEqual(calls(r, 'asserted'), ['call', 'flat', 'includes'], 'as / satisfies / <T> to a user class prove the receiver; to a built-in or on an untyped value do not');
	assert.deepEqual(calls(r, 'viaLocals'), ['emit', 'make', 'parse', 'push', 'resolve'], 'a var declared in a block keeps its proof for the whole function');
});

test('S001 t2: field proofs do not leak across classes or files, and JavaScript follows the same rules', () => {
	const r = parse(`
class Store { find(): void {} }
export class A { private store = new Store(); run(): void { this.store.find(); } }
export class B { private store; go(): void { this.store.find(); } }
export class A2 { private store = new Store(); }
export function loose(this: any): void { this.store.find(); }
export class Outer {
	private store;
	go3(): void {
		abstract class Inner { m(): void { this.store = new Store(); } }
		this.store.find();
	}
}
export class WithClosures {
	private store = new Store();
	handler = () => this.store.find();
	go4(): void {
		[1].forEach(() => this.store.push(1));
		[1].forEach(function (this: any) { this.store.map(); });
		const o = { m() { this.find(); } };
	}
}
`);
	assert.deepEqual(calls(r, 'run'), ['find']);
	assert.deepEqual(calls(r, 'go'), [], "A's field proof does not apply to B's same-named field");
	assert.deepEqual(calls(r, 'loose'), [], 'nor to code after the class');
	assert.deepEqual(calls(r, 'go3'), [], "a nested abstract class's assignment does not prove the outer class's field");
	assert.deepEqual(calls(r, 'go4'), ['push'], 'this in an arrow is the instance; in a plain function or an object literal method it is not');

	const next = parse(`export class C { private store; go2(): void { this.store.find(); } }\nexport function loose2(this: any): void { this.store.find(); }\n`, '/repo/src/c.ts');
	assert.deepEqual(calls(next, 'go2'), [], 'nor to a class in the next file');
	assert.deepEqual(calls(next, 'loose2'), [], 'nor to code outside a class in the next file');

	const js = parse(`
class Store { find() {} }
export function jsRun(arg) {
	const created = new Store();
	const untyped = make();
	created.find();
	untyped.push(1);
	arg.map(x => x);
}
function make() { return []; }
`, '/repo/src/mod.js');
	assert.deepEqual(calls(js, 'jsRun'), ['find', 'make'], 'in JavaScript a new-initialised local proves a user object; untyped values do not');
});
