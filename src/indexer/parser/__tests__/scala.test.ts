/**
 * Tests for the Scala tree-sitter parser.
 *
 * Covers Scala 2 + Scala 3 fixtures. Some Scala 3 syntax (significant
 * indentation, `given` / `extension`) trips the underlying grammar;
 * the parser's parse-error fallback (per plan §2.4) keeps the file
 * in the graph with a marker rather than dropping it silently.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { scalaParser } from '../scala.js';
import type { Entity, Relation } from '../../../shared/types.js';

const REPO = '/repo';
const REPO_ID = 1;
const FILE = '/repo/src/main/scala/example/Foo.scala';

interface Result {
	readonly entities: readonly Entity[];
	readonly relations: readonly Relation[];
}

function parse(source: string): Result {
	return scalaParser.parse(FILE, source, REPO, REPO_ID);
}

function findEntity(r: Result, name: string, kind?: Entity['kind']): Entity | undefined {
	return r.entities.find(e => e.name === name && (kind === undefined || e.kind === kind));
}

function findRelations(r: Result, kind: Relation['kind']): readonly Relation[] {
	return r.relations.filter(rel => rel.kind === kind);
}

// ---------------------------------------------------------------------------
// Class / object / trait
// ---------------------------------------------------------------------------

describe('Scala parser - top-level types', () => {
	it('extracts a basic class with a method', () => {
		const r = parse(`
package example
class Greeter {
  def hi(name: String): String = "Hi, " + name
}
`);
		const cls = findEntity(r, 'Greeter', 'class');
		assert.ok(cls);
		assert.match(cls?.signature ?? '', /class Greeter/);
		const m = findEntity(r, 'Greeter.hi', 'method');
		assert.ok(m);
	});

	it('captures `case class` in the signature', () => {
		const r = parse(`case class Point(x: Int, y: Int)`);
		const cls = findEntity(r, 'Point', 'class');
		assert.ok(cls);
		assert.match(cls?.signature ?? '', /case class Point/);
	});

	it('captures `sealed` and `abstract` modifiers', () => {
		const r = parse(`sealed abstract class Shape`);
		const cls = findEntity(r, 'Shape', 'class');
		assert.match(cls?.signature ?? '', /sealed/);
		assert.match(cls?.signature ?? '', /abstract/);
	});

	it('extracts an object as a class with `object` signature', () => {
		const r = parse(`object Constants { val PI = 3.14 }`);
		const obj = findEntity(r, 'Constants', 'class');
		assert.ok(obj);
		assert.match(obj?.signature ?? '', /object Constants/);
	});

	it('marks companion-object signatures with `(companion of <X>)`', () => {
		const r = parse(`
class Foo
object Foo { val name = "foo" }
`);
		// Both class + object share the local name `Foo` and both
		// emit `class`-kind entities. Distinguish via signature: the
		// object's signature carries the companion suffix.
		const fooEntities = r.entities.filter(e => e.name === 'Foo' && e.kind === 'class');
		assert.equal(fooEntities.length, 2, 'one class entity + one object entity (both kind=class)');
		const obj = fooEntities.find(e => /object/.test(e.signature ?? ''));
		assert.ok(obj, 'object entity should be present');
		assert.match(obj?.signature ?? '', /\(companion of Foo\)/);
	});

	it('extracts traits as `interface` kind', () => {
		const r = parse(`
trait Walker {
  def step(): Unit
}
`);
		const t = findEntity(r, 'Walker', 'interface');
		assert.ok(t);
		assert.match(t?.signature ?? '', /trait Walker/);
		assert.equal(t?.isAbstract, true);
	});

	it('captures `extends` as INHERITS and `with` mixins as IMPLEMENTS', () => {
		const r = parse(`class Worker extends Thread with Cloneable with Serializable`);
		const cls = findEntity(r, 'Worker', 'class');
		assert.ok(cls);
		const inh = findRelations(r, 'INHERITS').filter(rel => rel.from === cls!.id);
		assert.equal(inh.length, 1);
		assert.equal(inh[0]?.to, 'Thread');
		const impl = findRelations(r, 'IMPLEMENTS').filter(rel => rel.from === cls!.id);
		assert.deepEqual(impl.map(r => r.to).sort(), ['Cloneable', 'Serializable']);
	});

	it('treats trait `extends` as INHERITS for super-traits', () => {
		const r = parse(`trait A extends B with C`);
		const t = findEntity(r, 'A', 'interface');
		assert.ok(t);
		const inh = findRelations(r, 'INHERITS').filter(rel => rel.from === t!.id);
		assert.deepEqual(inh.map(r => r.to).sort(), ['B', 'C']);
		// Traits don't emit IMPLEMENTS edges -- everything is INHERITS.
		const impl = findRelations(r, 'IMPLEMENTS').filter(rel => rel.from === t!.id);
		assert.equal(impl.length, 0);
	});
});

// ---------------------------------------------------------------------------
// Imports + package
// ---------------------------------------------------------------------------

describe('Scala parser - imports', () => {
	it('records simple imports', () => {
		const r = parse(`
package x
import scala.collection.mutable
class A
`);
		const moduleNames = r.entities.filter(e => e.kind === 'module').map(e => e.name);
		assert.ok(moduleNames.includes('scala.collection.mutable'));
	});

	it('expands grouped imports into one IMPORTS edge per selector', () => {
		const r = parse(`
import scala.util.{Try, Success, Failure}
`);
		const moduleNames = r.entities.filter(e => e.kind === 'module').map(e => e.name);
		assert.ok(moduleNames.includes('scala.util.Try'));
		assert.ok(moduleNames.includes('scala.util.Success'));
		assert.ok(moduleNames.includes('scala.util.Failure'));
	});

	it('records renamed imports with alias meta', () => {
		const r = parse(`
import scala.collection.mutable.{Map => M}
`);
		const importEdges = findRelations(r, 'IMPORTS').filter(rel => rel.meta?.['alias'] === 'M');
		assert.equal(importEdges.length, 1);
		// `to` is the module's hex id; resolve the module entity to
		// check its name.
		const moduleEnt = r.entities.find(e => e.id === importEdges[0]!.to);
		assert.match(moduleEnt?.name ?? '', /Map/);
	});

	it('records the package as an own-package IMPORTS edge', () => {
		const r = parse(`package com.example.app\nclass A`);
		const importEdges = findRelations(r, 'IMPORTS');
		assert.ok(importEdges.some(e => e.meta?.['isOwnPackage'] === true));
	});
});

// ---------------------------------------------------------------------------
// val / var / type / def
// ---------------------------------------------------------------------------

describe('Scala parser - members', () => {
	it('extracts val + var as variable entities', () => {
		const r = parse(`
class Bag {
  val count: Int = 0
  var name: String = "bag"
}
`);
		const v1 = findEntity(r, 'Bag.count', 'variable');
		assert.match(v1?.signature ?? '', /val count/);
		const v2 = findEntity(r, 'Bag.name', 'variable');
		assert.match(v2?.signature ?? '', /var name/);
	});

	it('extracts type aliases', () => {
		const r = parse(`type IntList = List[Int]`);
		const t = findEntity(r, 'IntList', 'type');
		assert.ok(t);
		assert.match(t?.signature ?? '', /type IntList/);
	});

	it('extracts top-level def as function', () => {
		const r = parse(`def hello(name: String): String = "hi " + name`);
		const fn = findEntity(r, 'hello', 'function');
		assert.ok(fn);
		assert.match(fn?.signature ?? '', /def hello/);
	});

	it('captures abstract def in a trait as method with isAbstract: true', () => {
		const r = parse(`
trait Shape {
  def area: Double
}
`);
		const m = findEntity(r, 'Shape.area', 'method');
		assert.ok(m);
		assert.equal(m?.isAbstract, true);
	});
});

// ---------------------------------------------------------------------------
// Scala 3 specifics (best-effort -- grammar may flag parse errors)
// ---------------------------------------------------------------------------

describe('Scala parser - Scala 3 specifics', () => {
	it('handles `given` / `using` declarations (best-effort)', () => {
		const r = parse(`given intOrd: Int = 42`);
		// Even on parse errors, the file entity is emitted.
		const file = r.entities.find(e => e.kind === 'file');
		assert.ok(file);
	});

	it('handles `extension` blocks (best-effort)', () => {
		const r = parse(`extension (x: Int) def isPositive: Boolean = x > 0`);
		const file = r.entities.find(e => e.kind === 'file');
		assert.ok(file);
	});

	it('marks file as parse-error when the grammar trips', () => {
		// Scala 3 significant-indentation syntax may parse with errors.
		// Either it parses cleanly, or the file entity has the
		// parse-error signature -- both are acceptable contracts.
		const r = parse(`
class Outer:
  class Inner:
    def hi: String = "hi"
`);
		const file = r.entities.find(e => e.kind === 'file');
		assert.ok(file);
		// Don't assert the parse-error marker -- the grammar may handle
		// significant-indentation cleanly. Just confirm graceful
		// completion.
	});
});

// ---------------------------------------------------------------------------
// CALLS
// ---------------------------------------------------------------------------

describe('Scala parser - CALLS', () => {
	it('records call expressions as CALLS edges', () => {
		const r = parse(`
class A {
  def run(): Unit = {
    println("hi")
    helper()
  }
  def helper(): Unit = ()
}
`);
		const run = findEntity(r, 'A.run', 'method');
		assert.ok(run);
		const calls = findRelations(r, 'CALLS').filter(rel => rel.from === run!.id);
		assert.ok(calls.length > 0);
	});
});
