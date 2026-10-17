/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-bd1c6c90 S001 — calls the TypeScript/JavaScript parser used to drop.
 *
 * A call outside any extracted function (a program-level statement, which is
 * every `test('...', () => { ... })` body, a non-function initializer, an
 * `export default` value) is a CALLS from the file entity; a call inside a
 * function, method or function-valued declarator keeps its own caller.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/typescript-module-level-calls.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { typescriptParser } from '../typescript.js';
import type { ParseResult } from '../base.js';

const REPO = '/repo';
const REPO_ID = 1;

/** The same source, parsed as TypeScript and as JavaScript. */
const FILES = ['/repo/src/mod.ts', '/repo/src/mod.js'] as const;

function parse(file: string, src: string): ParseResult {
	return typescriptParser.parse(file, src, REPO, REPO_ID);
}

function idOf(r: ParseResult, kind: string, name: string): string {
	const e = r.entities.find(x => x.kind === kind && x.name === name);
	assert.ok(e, `no ${kind} entity named ${name}`);
	return e.id;
}

/** The callees of CALLS edges from one caller, sorted. */
function callees(r: ParseResult, from: string): string[] {
	return r.relations.filter(x => x.kind === 'CALLS' && x.from === from).map(x => x.to).sort();
}

const MODULE_LEVEL = `
import { test, describe } from 'node:test';
import { build, compute, run } from './lib.js';

describe('suite', () => {
  test('case', () => {
    run();
    helperInTest();
  });
});
if (flag) { setupIf(); }
for (const x of xs) { loopBody(x); }
try { tryBody(); } catch { recover(); }
const value = compute();
let late = wrap(makeLate());
export const exported = build();
export default makeDefault();
`;

const KEEP_CALLERS = `
function decl() { inDecl(); const local = inLocal(); }
class Plain { method() { inMethod(); } }
export function exportedFn() { inExportedFn(); }
export class Exported { method() { inExportedMethod(); } }
const arrow = () => inArrow();
export const fnExpr = function () { inFnExpr(); };
topLevel();
`;

const BUILTINS_AND_HTTP = `
import axios from 'axios';
console.log('x');
JSON.stringify({});
items.map(i => i);
axios.get('https://api.example.com/health');
`;

describe('TypeScript/JavaScript calls outside any function', () => {
	for (const file of FILES) {
		it(`program-level statements, non-function and exported initializers and export default are CALLS from the file entity (${file.slice(-3)})`, () => {
			const r = parse(file, MODULE_LEVEL);
			assert.deepEqual(callees(r, idOf(r, 'file', file)), [
				'build', 'compute', 'describe', 'helperInTest', 'loopBody', 'makeDefault',
				'makeLate', 'recover', 'run', 'setupIf', 'test', 'tryBody', 'wrap',
			]);
		});

		it(`calls in functions, methods, exported functions and classes and function-valued declarators keep their caller (${file.slice(-3)})`, () => {
			const r = parse(file, KEEP_CALLERS);
			assert.deepEqual(callees(r, idOf(r, 'file', file)), ['topLevel'], 'only the program-level call is the file\'s');
			assert.deepEqual(callees(r, idOf(r, 'function', 'decl')), ['inDecl', 'inLocal']);
			const methods = r.entities.filter(e => e.kind === 'method' && e.name === 'method').map(e => callees(r, e.id)).sort();
			assert.deepEqual(methods, [['inExportedMethod'], ['inMethod']]);
			assert.deepEqual(callees(r, idOf(r, 'function', 'exportedFn')), ['inExportedFn']);
			assert.deepEqual(callees(r, idOf(r, 'function', 'arrow')), ['inArrow']);
			assert.deepEqual(callees(r, idOf(r, 'function', 'fnExpr')), ['inFnExpr']);
		});

		it(`built-ins are skipped and a module-level HTTP call is a CALLS_HTTP from the file entity (${file.slice(-3)})`, () => {
			const r = parse(file, BUILTINS_AND_HTTP);
			const fileId = idOf(r, 'file', file);
			assert.deepEqual(callees(r, fileId), ['get']);
			const http = r.relations.filter(x => x.kind === 'CALLS_HTTP');
			assert.equal(http.length, 1);
			assert.equal(http[0]!.from, fileId);
		});
	}
});
