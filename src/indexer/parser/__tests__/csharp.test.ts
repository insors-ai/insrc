/**
 * Epic c2ba6fa6, Story s9, t7 -- the C# reader. Over the registered reader
 * (the real tree-sitter-c-sharp 0.23.1 grammar behind the guarded load) and
 * the real per-file resolver: a .cs fixture yields its types and members,
 * with namespaces folded into their names, and its using, call and base-list
 * relationships; a same-file call resolves, while a call into another file
 * through a namespace stays pending (the stated limitation); a fixture with a
 * syntax error still yields the declarations outside the broken region.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/csharp.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { csharpParser } from '../csharp.js';
import { makeEntityId } from '../base.js';
import { getParser } from '../registry.js';
import { resolveRelations } from '../../resolver.js';
import { SHARED_MODULES_REPO_ID } from '../../../shared/repo-namespaces.js';

const REPO = '/repo';
const FILE = '/repo/src/Circle.cs';

const SOURCE = `using System;
using System.Collections.Generic;
using Alias = Foo.Bar;

namespace Geo.Shapes {
	public interface IArea { double Area(); }
	interface IBig : IArea { }
	public delegate void Notify(int x);
	public enum Color { Red }

	public class Circle : Shape, IArea, IComparable<Circle> {
		private double r;
		public Circle(double r) { this.r = r; Init(); }
		public double Area() { return Helper(r) + Math.Abs(r) + this.Scale() + Calc.Go() + r.GetHashCode(); }
		static double Helper(double x) => x;
		protected double Scale() { return Nested.Make(); }
		void Init() { }
		internal class Nested { public static double Make() { Init(); return 1; } static void Init() { } }
	}

	public record Point(int X, int Y);
	struct Pair : IArea { public double Area() { return 0; } }
	class Shape { }
}
`;

assert.ok(csharpParser, 'the tree-sitter-c-sharp grammar loaded');
const parse = (source: string) => csharpParser!.parse(FILE, source, REPO, 1);
type R = ReturnType<typeof parse>;
const of = (r: R, kind: string) => r.entities.filter(e => e.kind === kind).map(e => e.name).sort();
const ent = (r: R, name: string) => r.entities.find(e => e.name === name)!;
const rels = (r: R, kind: string, relations = r.relations) => {
	const n = new Map(r.entities.map(e => [e.id, e.name]));
	return relations.filter(x => x.kind === kind).map(x => `${n.get(x.from) ?? x.from} -> ${n.get(x.to) ?? x.to}`).sort();
};
const NS = 'Geo.Shapes';
const C = `${NS}.Circle`;

test('s9 t7: a .cs fixture yields its types and members and its using, call and base-list relationships', () => {
	assert.equal(getParser(FILE), csharpParser, '.cs files are read by the C# reader');
	const r = parse(SOURCE);

	assert.deepEqual(of(r, 'class'), [`${C}`, `${C}.Nested`, `${NS}.Pair`, `${NS}.Point`, `${NS}.Shape`]);
	assert.deepEqual(of(r, 'interface'), [`${NS}.IArea`, `${NS}.IBig`]);
	assert.deepEqual(of(r, 'type'), [`${NS}.Color`, `${NS}.Notify`]);
	assert.deepEqual(of(r, 'method'), [`${C}.Area`, `${C}.Circle`, `${C}.Helper`, `${C}.Init`, `${C}.Nested.Init`, `${C}.Nested.Make`, `${C}.Scale`, `${NS}.IArea.Area`, `${NS}.Pair.Area`]);
	assert.ok(r.entities.every(e => e.language === 'csharp'));

	assert.equal(ent(r, C).isExported, true);
	assert.equal(ent(r, `${NS}.Shape`).isExported, true, 'a type with no modifier is internal: visible to the other files');
	assert.equal(ent(r, `${C}.Area`).isExported, true);
	assert.equal(ent(r, `${C}.Scale`).isExported, true, 'protected is visible to subclasses elsewhere');
	assert.equal(ent(r, `${C}.Helper`).isExported, false, 'a member with no modifier is private');
	assert.equal(ent(r, `${C}.Init`).isExported, false);
	assert.equal(ent(r, `${NS}.IArea.Area`).isExported, true, 'an interface member is public');

	const defines = rels(r, 'DEFINES');
	for (const d of [`${FILE} -> ${C}`, `${C} -> ${C}.Area`, `${C} -> ${C}.Nested`, `${C}.Nested -> ${C}.Nested.Make`, `${FILE} -> ${NS}.IArea`]) assert.ok(defines.includes(d), d);

	// Bases are qualified to the type they name in this file; the first class base inherits unless it is named like an interface.
	assert.deepEqual(rels(r, 'INHERITS'), [`${C} -> ${NS}.Shape`, `${NS}.IBig -> ${NS}.IArea`]);
	assert.deepEqual(rels(r, 'IMPLEMENTS'), [`${C} -> ${NS}.IArea`, `${C} -> IComparable`, `${NS}.Pair -> ${NS}.IArea`]);

	assert.deepEqual(rels(r, 'CALLS'), [
		`${C}.Area -> Calc.Go`, `${C}.Area -> ${C}.Helper`, `${C}.Area -> ${C}.Scale`, `${C}.Area -> Math.Abs`,
		`${C}.Circle -> ${C}.Init`, `${C}.Nested.Make -> ${C}.Nested.Init`, `${C}.Scale -> ${C}.Nested.Make`,
	], 'a call through a value (r.GetHashCode()) is not recorded; the innermost type with the member wins');

	const stubs = r.entities.filter(e => e.kind === 'module');
	assert.deepEqual(stubs.map(e => e.name).sort(), ['Foo.Bar', 'System', 'System.Collections.Generic']);
	assert.ok(stubs.every(e => e.repoId === SHARED_MODULES_REPO_ID.nuget && e.id === makeEntityId('nuget', '', 'module', e.name)));
	assert.equal(r.relations.filter(x => x.kind === 'IMPORTS' && x.resolved).length, 3);

	// A file-scoped namespace holds every declaration after it.
	const flat = parse('namespace Flat.Ns;\nclass F { void A() { B(); } void B() { } }\n');
	assert.deepEqual(of(flat, 'class'), ['Flat.Ns.F']);
	assert.deepEqual(rels(flat, 'CALLS'), ['Flat.Ns.F.A -> Flat.Ns.F.B']);
});

test('s9 t7: a same-file call resolves (extracted); a call into another file through a namespace stays pending', () => {
	const r = parse(SOURCE);
	const resolved = resolveRelations(r.relations, FILE, REPO, r.entities);
	const helper = resolved.find(x => x.kind === 'CALLS' && x.to === makeEntityId(REPO, FILE, 'method', `${C}.Helper`));
	assert.equal(helper?.resolved, true);
	assert.equal(helper?.evidence, 'extracted');
	const go = resolved.find(x => x.kind === 'CALLS' && x.to === 'Calc.Go');
	assert.equal(go?.resolved, false, 'Calc is reached through a using namespace, not a file');
});

test('s9 t7: a fixture with a syntax error still yields the declarations outside the broken region, and its file is marked', () => {
	const r = parse(`namespace N {
	class Ok { public void Before() { } }
	class Broken { void M() { int x = 1 +; @@ } }
	class After { public void Run() { Go(); } void Go() { } }
}
`);
	assert.equal(r.entities.find(e => e.kind === 'file')!.signature, 'parse-error');
	assert.deepEqual(of(r, 'class'), ['N.After', 'N.Broken', 'N.Ok']);
	assert.deepEqual(of(r, 'method'), ['N.After.Go', 'N.After.Run', 'N.Broken.M', 'N.Ok.Before']);
	assert.ok(rels(r, 'CALLS').includes('N.After.Run -> N.After.Go'), 'the call after the broken region is read');
});

test('s9 review: a record inherits its first class base, a primary-constructor base included', () => {
	const r = parse('record Base { }\nrecord R1 : Base { }\nrecord R2(int X) : Base(X), IFoo;\nrecord R3 : IFoo { }\n');
	assert.deepEqual(rels(r, 'INHERITS'), ['R1 -> Base', 'R2 -> Base']);
	assert.deepEqual(rels(r, 'IMPLEMENTS'), ['R2 -> IFoo', 'R3 -> IFoo']);
});

test('s9 review: a deeply nested expression does not overflow the reader', () => {
	const terms = Array.from({ length: 20_000 }, (_v, i) => String(i)).join(' + ');
	const r = parse(`class D { int x = ${terms}; void After() { } }\n`);
	assert.deepEqual(of(r, 'method'), ['D.After']);
});
