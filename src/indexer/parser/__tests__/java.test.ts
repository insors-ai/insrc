/**
 * Tests for the Java tree-sitter parser.
 *
 * Covers entity + relation extraction from a series of small fixture
 * sources. The parser is exercised end-to-end (real tree-sitter); no
 * mocking. Focuses on the shape contract -- which entity kinds /
 * signatures / relation kinds appear, not on exact byte ranges.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { javaParser } from '../java.js';
import type { Entity, Relation } from '../../../shared/types.js';

const REPO = '/repo';
const REPO_ID = 1;
const FILE = '/repo/src/main/java/com/example/Foo.java';

interface Result {
	readonly entities: readonly Entity[];
	readonly relations: readonly Relation[];
}

function parse(source: string): Result {
	return javaParser.parse(FILE, source, REPO, REPO_ID);
}

function findEntity(r: Result, name: string, kind?: Entity['kind']): Entity | undefined {
	return r.entities.find(e => e.name === name && (kind === undefined || e.kind === kind));
}

function findRelations(r: Result, kind: Relation['kind']): readonly Relation[] {
	return r.relations.filter(rel => rel.kind === kind);
}

// ---------------------------------------------------------------------------
// Class / interface / enum / record
// ---------------------------------------------------------------------------

describe('Java parser - top-level types', () => {
	it('extracts a public class with a method', () => {
		const r = parse(`
package com.example;

public class Greeter {
  public String hello(String name) {
    return "Hi, " + name;
  }
}
`);
		const cls = findEntity(r, 'Greeter', 'class');
		assert.ok(cls, 'Greeter class should be extracted');
		assert.equal(cls?.isExported, true);
		assert.match(cls?.signature ?? '', /public class Greeter/);

		const method = findEntity(r, 'Greeter.hello', 'method');
		assert.ok(method, 'hello method should be extracted');
		assert.match(method?.signature ?? '', /public/);
		assert.match(method?.signature ?? '', /String hello/);

		// DEFINES file -> class -> method.
		const defines = findRelations(r, 'DEFINES');
		assert.ok(defines.some(d => d.to === cls!.id));
		assert.ok(defines.some(d => d.from === cls!.id && d.to === method!.id));
	});

	it('captures `extends` as an INHERITS relation', () => {
		const r = parse(`
package x;
public class Child extends Parent {}
`);
		const cls = findEntity(r, 'Child', 'class');
		assert.ok(cls);
		const inherits = findRelations(r, 'INHERITS');
		assert.ok(
			inherits.some(rel => rel.from === cls!.id && rel.to === 'Parent'),
			'should record INHERITS edge to Parent',
		);
	});

	it('captures `implements` as IMPLEMENTS relations', () => {
		const r = parse(`
public class Worker implements Runnable, Closeable {
  public void run() {}
  public void close() {}
}
`);
		const cls = findEntity(r, 'Worker', 'class');
		assert.ok(cls);
		const impls = findRelations(r, 'IMPLEMENTS').filter(rel => rel.from === cls!.id);
		assert.equal(impls.length, 2);
		const targets = impls.map(rel => rel.to).sort();
		assert.deepEqual(targets, ['Closeable', 'Runnable']);
	});

	it('captures interface declarations', () => {
		const r = parse(`
public interface Shape {
  double area();
}
`);
		const iface = findEntity(r, 'Shape', 'interface');
		assert.ok(iface);
		assert.equal(iface?.kind, 'interface');
		assert.equal(iface?.isAbstract, true);
		// Method nested under interface.
		const m = findEntity(r, 'Shape.area', 'method');
		assert.ok(m);
	});

	it('treats enums as classes with `enum` signature', () => {
		const r = parse(`
public enum Color {
  RED, GREEN, BLUE;
}
`);
		const cls = findEntity(r, 'Color', 'class');
		assert.ok(cls);
		assert.match(cls?.signature ?? '', /enum Color/);
	});

	it('treats records as classes with `record` signature', () => {
		const r = parse(`
public record Point(int x, int y) {}
`);
		const cls = findEntity(r, 'Point', 'class');
		assert.ok(cls);
		assert.match(cls?.signature ?? '', /record Point/);
	});

	it('treats annotation-interfaces as classes with `annotation interface` signature', () => {
		const r = parse(`
public @interface Loggable {
  String value() default "";
}
`);
		const cls = findEntity(r, 'Loggable', 'class');
		assert.ok(cls);
		assert.match(cls?.signature ?? '', /annotation interface Loggable/);
	});

	it('captures `sealed` modifier in the signature', () => {
		const r = parse(`
public sealed class Shape permits Circle, Square {}
`);
		const cls = findEntity(r, 'Shape', 'class');
		assert.match(cls?.signature ?? '', /sealed/);
	});
});

// ---------------------------------------------------------------------------
// Imports + package
// ---------------------------------------------------------------------------

describe('Java parser - package + imports', () => {
	it('records the package as an own-package IMPORTS edge', () => {
		const r = parse(`
package com.example.app;
public class A {}
`);
		const ownPkgImport = findRelations(r, 'IMPORTS')
			.find(rel => rel.meta?.['isOwnPackage'] === true);
		assert.ok(ownPkgImport, 'should record an own-package IMPORTS edge');
		// Confirm the target is the `com.example.app` module entity.
		const moduleEnt = r.entities.find(e => e.id === ownPkgImport!.to);
		assert.equal(moduleEnt?.kind, 'module');
		assert.equal(moduleEnt?.name, 'com.example.app');
	});

	it('records `import` declarations as IMPORTS edges to module stubs', () => {
		const r = parse(`
package x;
import java.util.List;
import java.util.Map;
public class A {}
`);
		const imports = findRelations(r, 'IMPORTS');
		const moduleNames = r.entities
			.filter(e => e.kind === 'module')
			.map(e => e.name);
		assert.ok(moduleNames.includes('java.util.List'));
		assert.ok(moduleNames.includes('java.util.Map'));
		// One IMPORTS per import_declaration + one for own package.
		assert.equal(imports.filter(rel => rel.meta?.['isOwnPackage'] !== true).length, 2);
	});

	it('records wildcard imports with an asterisk suffix', () => {
		const r = parse(`
package x;
import java.util.*;
public class A {}
`);
		const moduleNames = r.entities
			.filter(e => e.kind === 'module')
			.map(e => e.name);
		assert.ok(moduleNames.includes('java.util.*'));
	});

	it('records static imports with a meta marker', () => {
		const r = parse(`
package x;
import static java.util.Collections.emptyList;
public class A {}
`);
		const importRel = findRelations(r, 'IMPORTS').find(
			rel => rel.to !== '' && rel.meta?.['static'] === true,
		);
		assert.ok(importRel, 'should record a static IMPORTS edge');
	});
});

// ---------------------------------------------------------------------------
// Method bodies + CALLS
// ---------------------------------------------------------------------------

describe('Java parser - CALLS', () => {
	it('records method invocations as CALLS edges', () => {
		const r = parse(`
public class A {
  void run() {
    System.out.println("hi");
    helper();
  }
  void helper() {}
}
`);
		const run = findEntity(r, 'A.run', 'method');
		assert.ok(run);
		const calls = findRelations(r, 'CALLS').filter(rel => rel.from === run!.id);
		// At least one CALLS edge per invocation.
		assert.ok(calls.length >= 2);
		assert.ok(calls.some(c => c.to.includes('println')));
		assert.ok(calls.some(c => c.to.includes('helper')));
	});

	it('records `new Foo(...)` as a CALLS edge with isConstructor meta', () => {
		const r = parse(`
public class A {
  void run() {
    new ArrayList<String>();
  }
}
`);
		const run = findEntity(r, 'A.run', 'method');
		const call = findRelations(r, 'CALLS').find(
			rel => rel.from === run!.id && rel.to === 'new ArrayList',
		);
		assert.ok(call);
		assert.equal(call?.meta?.['isConstructor'], true);
	});
});

// ---------------------------------------------------------------------------
// Constructors + fields + lambdas
// ---------------------------------------------------------------------------

describe('Java parser - members', () => {
	it('extracts constructors with `<init>` qualified name', () => {
		const r = parse(`
public class Foo {
  public Foo(int x) {}
}
`);
		const ctor = findEntity(r, 'Foo.<init>', 'method');
		assert.ok(ctor);
		assert.match(ctor?.signature ?? '', /public Foo/);
	});

	it('extracts fields as variable entities', () => {
		const r = parse(`
public class Bag {
  private final int count = 0;
  public static String NAME = "bag";
}
`);
		const count = findEntity(r, 'Bag.count', 'variable');
		assert.ok(count);
		assert.match(count?.signature ?? '', /private final/);

		const name = findEntity(r, 'Bag.NAME', 'variable');
		assert.ok(name);
		assert.equal(name?.isExported, true);
	});

	it('lifts lambda field initializers into separate function entities', () => {
		const r = parse(`
public class Lambdas {
  Runnable r = () -> System.out.println("hi");
}
`);
		const field = findEntity(r, 'Lambdas.r', 'variable');
		assert.ok(field);
		const lambda = findEntity(r, 'Lambdas.r$lambda', 'function');
		assert.ok(lambda, 'should lift the lambda body to a function entity');
	});
});

// ---------------------------------------------------------------------------
// Annotations + nesting
// ---------------------------------------------------------------------------

describe('Java parser - annotations + nesting', () => {
	it('captures annotations in the signature prefix', () => {
		const r = parse(`
@Service
public class UserService {
  @Override
  public String toString() { return "user"; }
}
`);
		const cls = findEntity(r, 'UserService', 'class');
		assert.match(cls?.signature ?? '', /@Service/);
		const m = findEntity(r, 'UserService.toString', 'method');
		assert.match(m?.signature ?? '', /@Override/);
	});

	it('qualifies inner class names with the outer class', () => {
		const r = parse(`
public class Outer {
  public static class Inner {
    public void hi() {}
  }
}
`);
		const inner = findEntity(r, 'Outer.Inner', 'class');
		assert.ok(inner);
		const m = findEntity(r, 'Outer.Inner.hi', 'method');
		assert.ok(m);
	});
});
