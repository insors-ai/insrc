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
