/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 (t5) — Java + Scala outbound HTTP-client recognizers, hooked into each
 * parser's existing call walk. Java/Scala clients are invoked on instance vars,
 * so shapes match by HTTP-specific method name (getForObject / exchange / uri /
 * url) — and recognition is GATED on the file importing a known HTTP library,
 * so a bare `.exchange`/`.url`/`.uri` on a non-HTTP receiver (RabbitMQ, JDBC,
 * Play reverse-routing, fluent builders) does NOT misfire.
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

describe('Java HTTP recognizer (import-gated)', () => {
	function parse(src: string): Relation[] {
		return javaParser.parse('/repo/src/App.java', src, REPO, REPO_ID).relations;
	}

	it('RestTemplate.getForObject + WebClient .uri each emit one CALLS_HTTP (file imports spring-web)', () => {
		const rels = parse(`
package com.example;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;
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

	it('PRECISION: non-HTTP `.exchange`/`.url`/`.uri` in a file with NO HTTP import emit NO CALLS_HTTP', () => {
		const rels = parse(`
package com.example;
public class App {
  void rabbit()  { messageBroker.exchange("orders.topic", payload); }   // RabbitMQ
  void jdbc()    { connectionBuilder.url("jdbc:postgresql://db/app"); } // JDBC
  void builder() { fileBuilder.uri(localPath); }                        // fluent builder
  void rest()    { restTemplate.getForObject("https://x/y", String.class); } // no spring import => not HTTP
}
`);
		assert.equal(http(rels).length, 0, 'no HTTP-library import => no HTTP edges');
		// the calls still exist as plain CALLS edges
		assert.ok(rels.some(r => r.kind === 'CALLS' && r.to === 'messageBroker.exchange'));
	});

	it('a non-HTTP method_invocation stays a plain CALLS edge even in an HTTP-importing file', () => {
		const rels = parse(`
package com.example;
import org.springframework.web.client.RestTemplate;
public class App {
  void run() { service.process("not a url"); }
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

describe('Scala HTTP recognizer (import-gated)', () => {
	function parse(src: string): Relation[] {
		return scalaParser.parse('/repo/src/App.scala', src, REPO, REPO_ID).relations;
	}

	it('Play-WS ws.url(u) emits one CALLS_HTTP (file imports play.api.libs.ws)', () => {
		const rels = parse(`
import play.api.libs.ws.WSClient
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

	it('PRECISION: Play reverse-routing `.url` / resource `.uri` in a file with NO HTTP import emit NO CALLS_HTTP', () => {
		const rels = parse(`
class App {
  def route(): Unit = { reverseRouter.url(userId) }
  def res(): Unit   = { fileResource.uri("classpath:data.json") }
}
`);
		assert.equal(http(rels).length, 0, 'no HTTP-library import => no HTTP edges');
	});

	it('a non-HTTP call stays no CALLS_HTTP', () => {
		const rels = parse(`
import play.api.libs.ws.WSClient
class App {
  def run(): Unit = { service.process("not a url") }
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
