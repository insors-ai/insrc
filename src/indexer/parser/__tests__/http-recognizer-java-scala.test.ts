/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 (t5) — Java + Scala outbound HTTP-client recognizers, hooked into each
 * parser's existing call walk. Java clients are invoked on instance vars, so
 * shapes match by HTTP-specific method name (getForObject / exchange / uri /
 * url). Scala Play-WS `ws.url(u)` / builder `.uri(u)` likewise. A known client
 * call yields one unresolved CALLS_HTTP with the raw URL; look-alikes none.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/http-recognizer-java-scala.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { javaParser } from '../java.js';
import { scalaParser } from '../scala.js';
import type { Relation } from '../../../shared/types.js';

const REPO = '/repo';
const REPO_ID = 1;

function http(rels: Relation[]): Relation[] {
	return rels.filter(r => r.kind === 'CALLS_HTTP');
}

// ---------------------------------------------------------------------------
// Java
// ---------------------------------------------------------------------------

describe('Java HTTP recognizer', () => {
	function parse(src: string): Relation[] {
		return javaParser.parse('/repo/src/App.java', src, REPO, REPO_ID).relations;
	}

	it('RestTemplate.getForObject + WebClient .uri each emit one CALLS_HTTP with the URL arg', () => {
		const rels = parse(`
package com.example;
public class App {
  void a() {
    restTemplate.getForObject("https://api.example.com/a", String.class);
  }
  void b() {
    webClient.get().uri("https://api.example.com/b").retrieve();
  }
}
`);
		const tos = http(rels).map(h => h.to).sort();
		assert.deepEqual(tos, [
			`"https://api.example.com/a"`,
			`"https://api.example.com/b"`,
		]);
		for (const h of http(rels)) assert.equal(h.resolved, false);
	});

	it('a non-HTTP method_invocation stays a plain CALLS edge (no CALLS_HTTP)', () => {
		const rels = parse(`
package com.example;
public class App {
  void run() {
    service.process("not a url");
  }
}
`);
		assert.equal(http(rels).length, 0);
		assert.ok(rels.some(r => r.kind === 'CALLS' && r.to === 'service.process'));
	});

	it('a file with no HTTP calls yields no CALLS_HTTP', () => {
		const rels = parse(`
package com.example;
public class App {
  int add(int a, int b) { return a + b; }
}
`);
		assert.equal(http(rels).length, 0);
	});
});

// ---------------------------------------------------------------------------
// Scala
// ---------------------------------------------------------------------------

describe('Scala HTTP recognizer', () => {
	function parse(src: string): Relation[] {
		return scalaParser.parse('/repo/src/App.scala', src, REPO, REPO_ID).relations;
	}

	it('Play-WS ws.url(u) emits one CALLS_HTTP with the URL arg', () => {
		const rels = parse(`
class App(ws: WSClient) {
  def a(): Unit = {
    ws.url("https://api.example.com/a").get()
  }
}
`);
		const tos = http(rels).map(h => h.to);
		assert.ok(tos.includes(`"https://api.example.com/a"`), `got: ${JSON.stringify(tos)}`);
		assert.equal(http(rels).length, 1);
		for (const h of http(rels)) assert.equal(h.resolved, false);
	});

	it('a non-HTTP call stays no CALLS_HTTP', () => {
		const rels = parse(`
class App {
  def run(): Unit = {
    service.process("not a url")
  }
}
`);
		assert.equal(http(rels).length, 0);
	});

	it('a file with no HTTP calls yields no CALLS_HTTP', () => {
		const rels = parse(`
class App {
  def add(a: Int, b: Int): Int = a + b
}
`);
		assert.equal(http(rels).length, 0);
	});
});
