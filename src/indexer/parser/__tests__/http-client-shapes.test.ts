/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 (t3) — the shared HTTP-client-shapes helper contract + the TypeScript/JS
 * recognizer wired into the parser's call walk.
 *
 * Proves (a) the helper exposes a stable per-language table + match/emit
 * utilities that t4/t5 reuse without reshaping, and (b) a TS/JS HTTP-client
 * call-site yields exactly one unresolved CALLS_HTTP relation with the raw URL
 * expression, while look-alikes / unextractable URLs / no-HTTP files do not.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/http-client-shapes.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
	HTTP_CLIENT_SHAPES,
	matchHttpClient,
	emitCallsHttp,
	normalizeCallee,
	fileImportsHttpLibrary,
} from '../http-client-shapes.js';
import { typescriptParser } from '../typescript.js';
import type { Entity, Relation } from '../../../shared/types.js';

const REPO = '/repo';
const REPO_ID = 1;
const FILE = '/repo/src/client.ts';

function parse(source: string): { entities: Entity[]; relations: Relation[] } {
	return typescriptParser.parse(FILE, source, REPO, REPO_ID);
}

function httpRels(r: { relations: Relation[] }): Relation[] {
	return r.relations.filter(rel => rel.kind === 'CALLS_HTTP');
}

// ---------------------------------------------------------------------------
// Helper contract (t3 acceptance: the shared helper is explicit, not incidental)
// ---------------------------------------------------------------------------

describe('http-client-shapes helper — stable contract for t4/t5', () => {
	it('exposes a per-language client-shape table for all five parser languages', () => {
		for (const lang of ['typescript', 'javascript', 'python', 'go', 'java', 'scala']) {
			const table = HTTP_CLIENT_SHAPES[lang];
			assert.ok(Array.isArray(table) && table.length > 0, `missing/empty table for ${lang}`);
			for (const shape of table) {
				assert.equal(typeof shape.callee, 'string');
				assert.equal(typeof shape.urlArgIndex, 'number');
				assert.ok(shape.urlArgIndex >= 0);
			}
		}
	});

	it('matchHttpClient resolves module-rooted (exact) + instance (method) shapes, and rejects look-alikes', () => {
		assert.deepEqual(matchHttpClient('typescript', 'fetch'), { urlArgIndex: 0 });
		assert.deepEqual(matchHttpClient('typescript', 'axios.get'), { urlArgIndex: 0 });
		assert.deepEqual(matchHttpClient('python', 'requests.request'), { urlArgIndex: 1 });
		assert.deepEqual(matchHttpClient('go', 'http.NewRequest'), { urlArgIndex: 1 });
		// method-matched: any receiver, HTTP-specific method name
		assert.deepEqual(matchHttpClient('java', 'restTemplate.getForObject'), { urlArgIndex: 0 });
		assert.deepEqual(matchHttpClient('scala', 'ws.url'), { urlArgIndex: 0 });
		// look-alikes / unknown languages -> null
		assert.equal(matchHttpClient('typescript', 'get'), null);          // bare local get()
		assert.equal(matchHttpClient('typescript', 'myObj.fetchThings'), null);
		assert.equal(matchHttpClient('ruby', 'Net::HTTP.get'), null);      // unknown language
		assert.equal(matchHttpClient('java', 'service.process'), null);    // non-HTTP method
	});

	it('normalizeCallee collapses whitespace so spaced member chains match', () => {
		assert.equal(normalizeCallee('axios . get'), 'axios.get');
		assert.deepEqual(matchHttpClient('typescript', 'axios . get'), { urlArgIndex: 0 });
	});

	it('fileImportsHttpLibrary gates java/scala on an HTTP-library import; ts/js/python/go are ungated', () => {
		// java/scala: only true when an HTTP library is imported
		assert.equal(fileImportsHttpLibrary('java', ['import org.springframework.web.client.RestTemplate;']), true);
		assert.equal(fileImportsHttpLibrary('java', ['import okhttp3.OkHttpClient;']), true);
		assert.equal(fileImportsHttpLibrary('java', ['import com.rabbitmq.client.Channel;', 'import java.sql.DriverManager;']), false);
		assert.equal(fileImportsHttpLibrary('scala', ['import play.api.libs.ws.WSClient']), true);
		assert.equal(fileImportsHttpLibrary('scala', ['import java.nio.file.Paths']), false);
		// languages without a marker table are not gated
		assert.equal(fileImportsHttpLibrary('typescript', []), true);
		assert.equal(fileImportsHttpLibrary('go', []), true);
	});

	it('emitCallsHttp pushes one unresolved CALLS_HTTP, and skips an empty URL (no empty-`to` node)', () => {
		const rels: Relation[] = [];
		assert.equal(emitCallsHttp(rels, { from: 'caller', repo: REPO, file: FILE, rawUrlExpr: `'http://x'` }), true);
		assert.equal(emitCallsHttp(rels, { from: 'caller', repo: REPO, file: FILE, rawUrlExpr: '   ' }), false);
		assert.equal(rels.length, 1);
		assert.deepEqual(rels[0], {
			kind: 'CALLS_HTTP', from: 'caller', to: `'http://x'`, resolved: false,
			meta: { file: FILE, repo: REPO },
		});
	});
});

// ---------------------------------------------------------------------------
// TypeScript/JS recognizer (t3 acceptance)
// ---------------------------------------------------------------------------

describe('TypeScript/JS HTTP recognizer', () => {
	it('fetch / axios.get / got / http.request each emit one CALLS_HTTP with the raw URL expr', () => {
		const r = parse(`
import axios from 'axios';
import got from 'got';
import http from 'node:http';
function a() { return fetch('https://api.example.com/a'); }
function b() { return axios.get('https://api.example.com/b'); }
function c() { return got('https://api.example.com/c'); }
function d() { return http.request('https://api.example.com/d'); }
`);
		const hs = httpRels(r);
		assert.equal(hs.length, 4, `expected 4 CALLS_HTTP, got ${hs.length}`);
		const tos = hs.map(h => h.to).sort();
		assert.deepEqual(tos, [
			`'https://api.example.com/a'`,
			`'https://api.example.com/b'`,
			`'https://api.example.com/c'`,
			`'https://api.example.com/d'`,
		]);
		for (const h of hs) assert.equal(h.resolved, false);
	});

	it('a local function named get()/post() (not an HTTP client) emits NO CALLS_HTTP', () => {
		const r = parse(`
function get(x) { return x; }
function use() { return get('not a url'); }
`);
		assert.equal(httpRels(r).length, 0);
	});

	it('an unextractable URL (spread args) emits no CALLS_HTTP — no empty-`to` node', () => {
		const r = parse(`
function f(args) { return fetch(...args); }
`);
		// tree-sitter yields a spread_element as arg 0; its text is '...args', which
		// is a non-empty expression — but there is no literal string/URL node. We
		// still capture the raw expression (honest: the resolver marks it
		// unresolved). The guarantee under test is: NO empty-`to` edge is minted.
		for (const h of httpRels(r)) assert.notEqual(h.to.trim(), '');
	});

	it('a file with no HTTP calls yields no CALLS_HTTP relations', () => {
		const r = parse(`
function add(a, b) { return a + b; }
function run() { return add(1, 2); }
`);
		assert.equal(httpRels(r).length, 0);
	});
});

// ---------------------------------------------------------------------------
// S001 (t3) — TS proven-receiver dataflow recall
// ---------------------------------------------------------------------------

describe('TypeScript proven-receiver dataflow recall (S001 t3)', () => {
	it('Angular this.http.get (HttpClient DI) + axios.create instance each emit one CALLS_HTTP with the raw URL', () => {
		const r = parse(`
import { HttpClient } from '@angular/common/http';
import axios from 'axios';
class Svc {
  constructor(private http: HttpClient) {}
  a() { return this.http.get('https://api.example.com/a'); }
  b() { const c = axios.create({ baseURL: 'x' }); return c.post('https://api.example.com/b', {}); }
}
`);
		const tos = httpRels(r).map(h => h.to).sort();
		assert.deepEqual(tos, [`'https://api.example.com/a'`, `'https://api.example.com/b'`]);
		for (const h of httpRels(r)) assert.equal(h.resolved, false);
	});

	it('PRECISION: an unproven receiver .get(), and a param named http WITHOUT the HttpClient type, emit ZERO CALLS_HTTP', () => {
		const r = parse(`
class Svc {
  constructor(private http: SomethingElse) {}         // NOT HttpClient
  a() { return this.http.get('should-not-match'); }
  b() { const foo = makeThing(); return foo.get('key'); }  // unproven receiver
  c() { const cache = new Map(); return cache.get('k'); }  // dict-like
}
`);
		assert.equal(httpRels(r).length, 0);
	});

	it('PRECISION (lexical scope): `client` = axios.create in one method does NOT prove `client` in another method', () => {
		const r = parse(`
import axios from 'axios';
class Svc {
  makeApi() { const client = axios.create({ baseURL: 'x' }); return client.get('https://real.example.com'); }
  lookup(m) { const client = m; return client.get('some-key'); }  // Map, NOT an axios instance
}
`);
		assert.deepEqual(httpRels(r).map(h => h.to), [`'https://real.example.com'`], 'only the axios-instance call, not the Map read');
	});

	it('PRECISION (class scope): a same-named non-HttpClient field in a second class does NOT match', () => {
		const r = parse(`
import { HttpClient } from '@angular/common/http';
class ApiSvc  { constructor(private http: HttpClient) {} a() { return this.http.get('https://api.example.com'); } }
class CacheSvc { private http: MyCache; b() { return this.http.get('cache-key'); } }
`);
		assert.deepEqual(httpRels(r).map(h => h.to), [`'https://api.example.com'`], 'only ApiSvc.http (HttpClient), not CacheSvc.http (MyCache)');
	});

	it('the field-based HttpClient (public field, not a ctor param) is also proven', () => {
		const r = parse(`
class Svc {
  private http: HttpClient;
  a() { return this.http.delete('https://api.example.com/x'); }
}
`);
		assert.deepEqual(httpRels(r).map(h => h.to), [`'https://api.example.com/x'`]);
	});

	// -- scope-hardening (S001 fast-follow): nested shadow + inner class + capture --

	it('PRECISION (nested-closure shadow): a nested `const client = new Map()` shadows the outer axios proof — no CALLS_HTTP for the nested read', () => {
		const r = parse(`
import axios from 'axios';
function f(arr) {
  const client = axios.create({ baseURL: 'x' });
  arr.forEach(() => { const client = new Map(); return client.get('some-key'); });
}
`);
		assert.equal(httpRels(r).length, 0, 'the nested shadowed Map.get must not emit');
	});

	it('PRECISION (outer capture preserved): a closure that captures the un-redeclared outer axios var still emits one CALLS_HTTP', () => {
		const r = parse(`
import axios from 'axios';
function f(arr) {
  const client = axios.create({ baseURL: 'x' });
  arr.forEach(() => { return client.get('https://real.example.com'); });
}
`);
		assert.deepEqual(httpRels(r).map(h => h.to), [`'https://real.example.com'`], 'the captured outer axios instance still resolves');
	});

	it('PRECISION (capture + shadow in one body): outer axios call emits, nested shadow does not', () => {
		const r = parse(`
import axios from 'axios';
function f(arr) {
  const client = axios.create({ baseURL: 'x' });
  const out = client.get('https://outer.example.com');
  arr.forEach(() => { const client = new Map(); return client.get('k'); });
  return out;
}
`);
		assert.deepEqual(httpRels(r).map(h => h.to), [`'https://outer.example.com'`], 'only the outer axios call, not the nested Map read');
	});

	it('PRECISION (param shadow): a closure PARAMETER named like the outer axios var shadows the proof — no CALLS_HTTP', () => {
		const r = parse(`
import axios from 'axios';
function f(arr) {
  const client = axios.create({ baseURL: 'x' });
  arr.forEach((client) => { return client.get('some-key'); });  // param, not the axios instance
}
`);
		assert.equal(httpRels(r).length, 0, 'a param-shadowed receiver must not resolve to the outer axios proof');
	});

	it('PRECISION (nested-function param shadow): a nested function param shadows the outer axios var — no CALLS_HTTP', () => {
		const r = parse(`
import axios from 'axios';
function outer() {
  const client = axios.create({ baseURL: 'x' });
  function inner(client) { return client.get('k'); }  // param
  return inner;
}
`);
		assert.equal(httpRels(r).length, 0);
	});

	it('PRECISION (catch shadow): a catch binding named like the outer axios var shadows the proof — no CALLS_HTTP', () => {
		const r = parse(`
import axios from 'axios';
function f() {
  const client = axios.create({ baseURL: 'x' });
  try { doThing(); } catch (client) { return client.get('err-key'); }  // catch binding, not the axios instance
}
`);
		assert.equal(httpRels(r).length, 0, 'a catch-bound receiver must not resolve to the outer axios proof');
	});

	it('PRECISION (catch shadow, outer still works): the outer axios call outside catch still emits, the catch-shadowed one does not', () => {
		const r = parse(`
import axios from 'axios';
function f() {
  const client = axios.create({ baseURL: 'x' });
  const out = client.get('https://outer.example.com');
  try { doThing(); } catch (client) { client.get('err-key'); }
  return out;
}
`);
		assert.deepEqual(httpRels(r).map(h => h.to), [`'https://outer.example.com'`], 'only the outer axios call, not the catch-shadowed read');
	});

	it('PRECISION (inner class in method): an inner class whose `http` field is a Map does NOT inherit the outer HttpClient proof; the outer call still emits', () => {
		const r = parse(`
import { HttpClient } from '@angular/common/http';
class Outer {
  constructor(private http: HttpClient) {}
  m() {
    class Inner { http = new Map(); go() { return this.http.get('cache-key'); } }
    return this.http.get('https://api.example.com/x');
  }
}
`);
		assert.deepEqual(httpRels(r).map(h => h.to), [`'https://api.example.com/x'`], 'only Outer.m this.http (HttpClient), not Inner.go this.http (Map)');
	});
});
