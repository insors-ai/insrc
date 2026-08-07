/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 (t4) — Python + Go outbound HTTP-client recognizers.
 *
 * Both parsers emit no general CALLS today, so each adds a focused HTTP-only
 * walk over function/method bodies. A known client call yields exactly one
 * unresolved CALLS_HTTP with the raw URL expression; look-alikes and no-HTTP
 * files yield none.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/http-recognizer-py-go.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { pythonParser } from '../python.js';
import { goParser } from '../go.js';
import type { Relation } from '../../../shared/types.js';

const REPO = '/repo';
const REPO_ID = 1;

function http(rels: Relation[]): Relation[] {
	return rels.filter(r => r.kind === 'CALLS_HTTP');
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

describe('Python HTTP recognizer', () => {
	function parse(src: string): Relation[] {
		return pythonParser.parse('/repo/app.py', src, REPO, REPO_ID).relations;
	}

	it('requests / httpx / urllib.urlopen / aiohttp.request each emit one CALLS_HTTP with the raw URL', () => {
		const rels = parse(`
import requests, httpx, urllib.request, aiohttp

def a():
    return requests.get('https://api.example.com/a')

def b():
    return httpx.post('https://api.example.com/b')

def c():
    return urllib.request.urlopen('https://api.example.com/c')

def d():
    return aiohttp.request('GET', 'https://api.example.com/d')

def e():
    return requests.request('POST', 'https://api.example.com/e')
`);
		const hs = http(rels);
		const tos = hs.map(h => h.to).sort();
		assert.deepEqual(tos, [
			`'https://api.example.com/a'`,
			`'https://api.example.com/b'`,
			`'https://api.example.com/c'`,
			`'https://api.example.com/d'`,
			`'https://api.example.com/e'`,
		]);
		for (const h of hs) assert.equal(h.resolved, false);
	});

	it('a non-HTTP look-alike (local requests-shadowing / plain get) emits no CALLS_HTTP', () => {
		const rels = parse(`
def get(x):
    return x

def use():
    return get('not a url')
`);
		assert.equal(http(rels).length, 0);
	});

	it('a file with no HTTP calls yields no CALLS_HTTP', () => {
		const rels = parse(`
def add(a, b):
    return a + b
`);
		assert.equal(http(rels).length, 0);
	});
});

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

describe('Go HTTP recognizer', () => {
	function parse(src: string): Relation[] {
		return goParser.parse('/repo/main.go', src, REPO, REPO_ID).relations;
	}

	it('http.Get / http.NewRequest / http.Post each emit one CALLS_HTTP with the URL arg', () => {
		const rels = parse(`
package main

import "net/http"

func a() { http.Get("https://api.example.com/a") }
func b() { http.NewRequest("GET", "https://api.example.com/b", nil) }
func c() { http.Post("https://api.example.com/c", "application/json", nil) }
`);
		const hs = http(rels);
		const tos = hs.map(h => h.to).sort();
		assert.deepEqual(tos, [
			`"https://api.example.com/a"`,
			`"https://api.example.com/b"`,
			`"https://api.example.com/c"`,
		]);
		for (const h of hs) assert.equal(h.resolved, false);
	});

	it('a non-HTTP call (local get) stays no CALLS_HTTP', () => {
		const rels = parse(`
package main

func get(x string) string { return x }
func use() { get("not a url") }
`);
		assert.equal(http(rels).length, 0);
	});

	it('a file with no HTTP calls yields no CALLS_HTTP', () => {
		const rels = parse(`
package main

func add(a int, b int) int { return a + b }
`);
		assert.equal(http(rels).length, 0);
	});
});

// ---------------------------------------------------------------------------
// S001 (t4) — Python proven-receiver dataflow recall
// ---------------------------------------------------------------------------

describe('Python proven-receiver dataflow recall (S001 t4)', () => {
	function parse(src: string): Relation[] {
		return pythonParser.parse('/repo/app.py', src, REPO, REPO_ID).relations;
	}

	it('requests.Session / httpx.Client instance verb calls each emit one CALLS_HTTP with the raw URL', () => {
		const rels = parse(`
import requests, httpx

def a():
    s = requests.Session()
    return s.get('https://api.example.com/a')

def b():
    c = httpx.Client()
    return c.post('https://api.example.com/b')
`);
		const tos = http(rels).map(h => h.to).sort();
		assert.deepEqual(tos, [`'https://api.example.com/a'`, `'https://api.example.com/b'`]);
		for (const h of http(rels)) assert.equal(h.resolved, false);
	});

	it('PRECISION: dict d.get(key) (no Session/Client proof) emits ZERO CALLS_HTTP', () => {
		const rels = parse(`
def a():
    d = {}
    return d.get('key')

def b():
    other = make_thing()
    return other.get('k')
`);
		assert.equal(http(rels).length, 0);
	});

	it('PRECISION (same-function rebind): a name rebound away from the factory drops its proof — the post-rebind dict read emits ZERO', () => {
		const rels = parse(`
def a():
    s = requests.Session()
    first = s.get('https://api.example.com/a')
    s = {}
    return s.get('k')
`);
		// The final binding of `s` is a dict, so last-binding-wins drops the proof:
		// neither the pre-rebind nor post-rebind read emits (flow-insensitive).
		assert.equal(http(rels).length, 0, 'a rebound-away name is not proven under last-binding-wins');
	});

	it('PRECISION (rebind last-binding-wins): a name whose FINAL binding is the factory stays proven', () => {
		const rels = parse(`
def a():
    s = {}
    s = requests.Session()
    return s.get('https://api.example.com/a')
`);
		assert.deepEqual(http(rels).map(h => h.to), [`'https://api.example.com/a'`], 'final binding is the factory, so s is proven');
	});

	it('PRECISION (rebind is function-scoped): a rebind inside a NESTED def does not drop the enclosing function proof', () => {
		const rels = parse(`
def f():
    s = requests.Session()
    def g():
        s = {}
    return s.get('https://api.example.com/a')
`);
		// last-binding-wins is scoped to f; g's `s = {}` must not delete f's proof.
		assert.deepEqual(http(rels).map(h => h.to), [`'https://api.example.com/a'`], 'nested-def rebind does not regress the enclosing proof');
	});
});
