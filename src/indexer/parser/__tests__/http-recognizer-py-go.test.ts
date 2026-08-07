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
