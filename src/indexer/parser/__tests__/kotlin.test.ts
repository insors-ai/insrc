/**
 * Tests for the Kotlin tree-sitter parser.
 *
 * Exercises the registered `kotlinParser` singleton (so the guarded native-
 * grammar load is on the happy path here), covering entity + relation
 * extraction over the real tree-sitter-kotlin node kinds, the parse-error
 * tolerance contract, makeEntityId stability, registry routing for .kt/.kts,
 * the Kotlin/Scala JVM shared-module dedup, and a committed smoke regression
 * that turns red if a future dep bump breaks the grammar load.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';

import { kotlinParser } from '../kotlin.js';
import { scalaParser } from '../scala.js';
import { makeEntityId } from '../base.js';
import { getParser, supportedExtensions } from '../registry.js';
import type { Entity, Relation } from '../../../shared/types.js';

const REPO = '/repo';
const REPO_ID = 1;
const FILE = '/repo/src/main/kotlin/example/Foo.kt';

interface Result {
	readonly entities: readonly Entity[];
	readonly relations: readonly Relation[];
}

// The native grammar builds in CI/dev (node-gyp-build), so the guarded load
// yields a real parser here. A null would mean the binding failed to load.
assert.ok(kotlinParser, 'kotlinParser should be non-null (tree-sitter-kotlin grammar loaded)');
const parser = kotlinParser!;

function parse(source: string, file = FILE): Result {
	return parser.parse(file, source, REPO, REPO_ID);
}

function findEntity(r: Result, name: string, kind?: Entity['kind']): Entity | undefined {
	return r.entities.find(e => e.name === name && (kind === undefined || e.kind === kind));
}

function findRelations(r: Result, kind: Relation['kind']): readonly Relation[] {
	return r.relations.filter(rel => rel.kind === kind);
}

// ---------------------------------------------------------------------------
// Classes / interfaces / objects / companion / data / enum
// ---------------------------------------------------------------------------

describe('Kotlin parser - types', () => {
	it('extracts a class with a member fun (Method) + DEFINES', () => {
		const r = parse(`
package example
class Greeter {
    fun hi(name: String): String = "Hi, " + name
}
`);
		const cls = findEntity(r, 'Greeter', 'class');
		assert.ok(cls);
		assert.match(cls?.signature ?? '', /class Greeter/);
		const m = findEntity(r, 'Greeter.hi', 'method');
		assert.ok(m, 'member fun is a Method');
		// container -> member DEFINES
		const defines = findRelations(r, 'DEFINES');
		assert.ok(defines.some(d => d.from === cls?.id && d.to === m?.id));
	});

	it('an interface is an Interface entity (interface keyword, not a modifier)', () => {
		const r = parse(`interface Greeter { fun greet(): String }`);
		const iface = findEntity(r, 'Greeter', 'interface');
		assert.ok(iface, 'interface -> Interface kind');
		assert.match(iface?.signature ?? '', /interface Greeter/);
		assert.equal(iface?.isAbstract, true);
	});

	it('a data class carries a `data` marker + DEFINES its val/var properties', () => {
		const r = parse(`data class User(val id: Int, var name: String)`);
		const cls = findEntity(r, 'User', 'class');
		assert.ok(cls);
		assert.match(cls?.signature ?? '', /data class User/);
		const id = findEntity(r, 'User.id', 'variable');
		const name = findEntity(r, 'User.name', 'variable');
		assert.ok(id, 'val id -> Variable');
		assert.ok(name, 'var name -> Variable');
		assert.match(id?.signature ?? '', /val id/);
		assert.match(name?.signature ?? '', /var name/);
	});

	it('captures `sealed` / `abstract` modifiers in the signature', () => {
		assert.match(parse(`sealed class S`).entities.find(e => e.name === 'S')?.signature ?? '', /sealed/);
		assert.match(parse(`abstract class A`).entities.find(e => e.name === 'A')?.signature ?? '', /abstract/);
	});

	it('an object is a Class with `object`; a companion object gets a `(companion of X)` suffix', () => {
		const r = parse(`
object Singleton {
    fun ping() {}
    companion object {
        val K = 1
    }
}
`);
		const obj = findEntity(r, 'Singleton', 'class');
		assert.ok(obj);
		assert.match(obj?.signature ?? '', /object Singleton/);
		const companion = r.entities.find(e => e.kind === 'class' && /companion of Singleton/.test(e.signature ?? ''));
		assert.ok(companion, 'companion object carries a (companion of Singleton) signature');
		assert.ok(findEntity(r, 'Singleton.ping', 'method'), 'object member fun -> Method');
	});

	it('an enum class carries an `enum class` marker', () => {
		const r = parse(`enum class Color { RED, GREEN }`);
		assert.match(findEntity(r, 'Color', 'class')?.signature ?? '', /enum class Color/);
	});
});

// ---------------------------------------------------------------------------
// Functions: top-level / member / extension
// ---------------------------------------------------------------------------

describe('Kotlin parser - functions', () => {
	it('a top-level fun is a Function; an extension fun is a Method with an `extension` marker + receiver', () => {
		const r = parse(`
fun topLevel(x: Int): Int = x + 1

fun String.shout(): String = this.uppercase()
`);
		const top = findEntity(r, 'topLevel', 'function');
		assert.ok(top, 'top-level fun -> Function');
		assert.match(top?.signature ?? '', /fun topLevel/);

		const ext = findEntity(r, 'String.shout', 'method');
		assert.ok(ext, 'extension fun -> Method keyed by its receiver');
		assert.match(ext?.signature ?? '', /extension fun String\.shout/);
	});

	it('a member fun and a same-named member extension get DISTINCT ids (receiver folds into the name)', () => {
		const r = parse(`
class U {
    fun shout() {}
    fun String.shout(): String = this.uppercase()
}
`);
		const plain = findEntity(r, 'U.shout', 'method');
		const ext = findEntity(r, 'U.String.shout', 'method');
		assert.ok(plain, 'plain member -> U.shout');
		assert.ok(ext, 'member extension keeps its receiver -> U.String.shout');
		assert.notEqual(plain?.id, ext?.id, 'the two members hash to different ids (no silent collision)');
	});
});

// ---------------------------------------------------------------------------
// package / import (incl. alias) -> Module / IMPORTS
// ---------------------------------------------------------------------------

describe('Kotlin parser - package + imports', () => {
	it('package -> Module + own-package IMPORTS; import -> IMPORTS to a jvm Module stub; `as` records meta.alias', () => {
		const r = parse(`
package com.example.app

import com.foo.Bar
import com.foo.Baz as Qux
`);
		const pkg = findEntity(r, 'com.example.app', 'module');
		assert.ok(pkg, 'package -> Module');

		const bar = findEntity(r, 'com.foo.Bar', 'module');
		assert.ok(bar, 'import -> jvm Module stub');

		const imports = findRelations(r, 'IMPORTS');
		const aliased = imports.find(i => i.to === findEntity(r, 'com.foo.Baz', 'module')?.id);
		assert.ok(aliased, 'aliased import emits an IMPORTS edge');
		assert.equal(aliased?.meta?.['alias'], 'Qux', 'the alias is recorded in meta.alias');
	});
});

// ---------------------------------------------------------------------------
// Supertypes: INHERITS (superclass constructor call) + IMPLEMENTS (interfaces)
// ---------------------------------------------------------------------------

describe('Kotlin parser - supertypes', () => {
	it('`class A : Base(), Iface1, Iface2` -> INHERITS Base + IMPLEMENTS Iface1, Iface2', () => {
		const r = parse(`
open class Base
interface Iface1
interface Iface2
class A : Base(), Iface1, Iface2
`);
		const a = findEntity(r, 'A', 'class');
		assert.ok(a);
		const inherits = findRelations(r, 'INHERITS').filter(rel => rel.from === a?.id);
		const implts = findRelations(r, 'IMPLEMENTS').filter(rel => rel.from === a?.id);
		assert.deepEqual(inherits.map(rel => rel.to), ['Base'], 'the constructor-call supertype is INHERITS');
		assert.deepEqual(implts.map(rel => rel.to).sort(), ['Iface1', 'Iface2'], 'the bare supertypes are IMPLEMENTS');
	});

	it('interface delegation `class A(...) : Iface by d` still emits IMPLEMENTS', () => {
		const r = parse(`
interface Iface
class A(d: Iface) : Iface by d
`);
		const a = findEntity(r, 'A', 'class');
		const implts = findRelations(r, 'IMPLEMENTS').filter(rel => rel.from === a?.id);
		assert.deepEqual(implts.map(rel => rel.to), ['Iface'], 'by-delegation supertype -> IMPLEMENTS');
	});
});

// ---------------------------------------------------------------------------
// CALLS + HTTP/messaging recognition via the shared helpers (import-gated)
// ---------------------------------------------------------------------------

describe('Kotlin parser - calls', () => {
	it('a recognised HTTP client (okhttp import) emits CALLS_HTTP to the URL', () => {
		const r = parse(`
package example
import okhttp3.Request
class Api {
    fun fetch() {
        val b = Request.Builder().url("https://api.example.com/x")
    }
}
`);
		const http = findRelations(r, 'CALLS_HTTP');
		assert.ok(http.some(rel => rel.to.includes('api.example.com')), 'CALLS_HTTP carries the URL');
		// a plain intra-code CALLS edge is emitted alongside
		assert.ok(findRelations(r, 'CALLS').some(rel => /\.url$/.test(rel.to)));
	});

	it('HTTP recognition is import-gated: a `.url(...)` with no HTTP import does not misfire', () => {
		const r = parse(`
class Router {
    fun link() { val u = reverseRoute.url("/home") }
}
`);
		assert.equal(findRelations(r, 'CALLS_HTTP').length, 0, 'no HTTP library import -> no CALLS_HTTP');
	});

	it('a recognised messaging client (spring kafka/jms import) emits a messaging edge', () => {
		const r = parse(`
package example
import org.springframework.jms.core.JmsTemplate
class Producer {
    fun emit() { template.convertAndSend("orders", msg) }
}
`);
		const messaging = r.relations.filter(rel => rel.kind === 'PUBLISHES_TO' || rel.kind === 'SUBSCRIBES_TO');
		assert.ok(messaging.some(rel => rel.to.includes('orders')), 'convertAndSend emits a messaging edge to the destination');
	});
});

// ---------------------------------------------------------------------------
// Parse-error tolerance + makeEntityId stability
// ---------------------------------------------------------------------------

describe('Kotlin parser - robustness', () => {
	it('a file with a syntax error still emits its package + clean top-level entities and marks the file', () => {
		const r = parse(`
package example

class Good { fun ok(): Int = 1 }

class Broken { fun oops( = }
`);
		const file = r.entities.find(e => e.kind === 'file');
		assert.equal(file?.signature, 'parse-error', 'the file entity is marked parse-error');
		assert.ok(findEntity(r, 'example', 'module'), 'the package is still emitted');
		assert.ok(findEntity(r, 'Good', 'class'), 'the cleanly-parsed class is still emitted');
	});

	it('never throws on empty / whitespace-only source', () => {
		assert.doesNotThrow(() => parse(``));
		assert.doesNotThrow(() => parse(`   \n\n`));
	});

	it('makeEntityId is stable: re-parsing the same source yields identical ids', () => {
		const src = `package example\nclass Repeatable { fun f() {} }\n`;
		const a = parse(src);
		const b = parse(src);
		const idA = findEntity(a, 'Repeatable', 'class')?.id;
		const idB = findEntity(b, 'Repeatable', 'class')?.id;
		assert.equal(idA, idB);
		// and it matches the documented hex-32 makeEntityId contract
		assert.equal(idA, makeEntityId(REPO, FILE, 'class', 'Repeatable'));
	});
});

// ---------------------------------------------------------------------------
// Registry routing + JVM shared-module dedup (integration)
// ---------------------------------------------------------------------------

describe('Kotlin parser - registry + jvm dedup', () => {
	it('getParser routes .kt and .kts to the Kotlin parser; supportedExtensions() includes them', () => {
		assert.equal(getParser('/x/Foo.kt')?.language, 'kotlin');
		assert.equal(getParser('/x/Foo.kts')?.language, 'kotlin');
		const exts = supportedExtensions();
		assert.ok(exts.includes('.kt') && exts.includes('.kts'));
	});

	it('a real Kotlin fixture yields a non-empty entities array through the registry-selected parser', () => {
		const p = getParser('/x/Service.kt')!;
		const r = p.parse('/x/Service.kt', `package a\nclass Service { fun run() {} }\n`, '/x', 2) as Result;
		assert.ok(r.entities.length > 0);
	});

	it('Kotlin + Scala import stubs for the same JVM dependency dedup to one repo id', () => {
		const kt = parse(`package a\nimport com.shared.Lib\nclass K\n`);
		const sc = scalaParser.parse('/repo/S.scala', `package a\nimport com.shared.Lib\nclass S\n`, REPO, REPO_ID);
		const ktMod = kt.entities.find(e => e.kind === 'module' && e.name === 'com.shared.Lib');
		const scMod = sc.entities.find(e => e.kind === 'module' && e.name === 'com.shared.Lib');
		assert.ok(ktMod && scMod);
		assert.equal(ktMod?.id, scMod?.id, 'same JVM module id across languages');
		assert.equal(ktMod?.repoId, scMod?.repoId, 'same jvm shared-modules repo id');
	});
});

// ---------------------------------------------------------------------------
// Smoke regression — the grammar loads + parses (turns red on a broken dep bump)
// ---------------------------------------------------------------------------

describe('Kotlin parser - grammar smoke regression', () => {
	it('tree-sitter-kotlin loads under the pinned tree-sitter and parses a trivial file', () => {
		const _require = createRequire(import.meta.url);
		const Parser = _require('tree-sitter') as new () => { setLanguage(l: unknown): void; parse(s: string): { rootNode: { type: string; namedChildCount: number } } };
		const grammar = _require('tree-sitter-kotlin');
		const p = new Parser();
		p.setLanguage(grammar);
		const root = p.parse('package a\nclass A').rootNode;
		assert.equal(root.type, 'source_file');
		assert.ok(root.namedChildCount > 0, 'the trivial file produces a real AST');
	});
});
