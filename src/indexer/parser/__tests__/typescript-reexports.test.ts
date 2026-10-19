/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t6 — the TypeScript/JavaScript parser emits pending EXPORTS
 * rows for re-export lines: one per name of `export { a, b as c } from './y.js'`
 * and one with rawTo '*' for `export * from './y.js'`, each from the file
 * entity. A file without re-exports parses as before.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/typescript-reexports.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { typescriptParser } from '../typescript.js';
import type { ParseResult } from '../base.js';
import type { Relation } from '../../../shared/types.js';

const REPO = '/repo';
const REPO_ID = 1;

/** The same source, parsed as TypeScript and as JavaScript. */
const FILES = ['/repo/src/index.ts', '/repo/src/index.js'] as const;

function parse(file: string, src: string): ParseResult {
	return typescriptParser.parse(file, src, REPO, REPO_ID);
}

function fileIdOf(r: ParseResult): string {
	const e = r.entities.find(x => x.kind === 'file');
	assert.ok(e, 'no file entity');
	return e.id;
}

const exportsRows = (r: ParseResult): Relation[] => r.relations.filter(x => x.kind === 'EXPORTS');

/** A file with declarations, calls, an import and every non-re-export export form. */
const PLAIN = `
import { helper } from './helper.js';
export function run(): void { helper(); }
export const limit = compute();
function compute(): number { return 1; }
const local = 2;
export { local };
export default run();
export class Box { open(): void { run(); } }
`;

const REEXPORTS = `
export { a, b as c } from './y.js';
export * from './z.js';
`;

for (const file of FILES) {
	describe(`re-exports (${file.endsWith('.ts') ? 'TypeScript' : 'JavaScript'})`, () => {
		it('the three re-export forms produce pending EXPORTS rows from the file entity', () => {
			const r = parse(file, REEXPORTS);
			const fileId = fileIdOf(r);
			const meta = (specifier: string, exportedAs: string) => ({ specifier, exportedAs, file, repo: REPO });
			assert.deepEqual(exportsRows(r), [
				{ kind: 'EXPORTS', from: fileId, to: 'a', resolved: false, meta: meta('./y.js', 'a') },
				{ kind: 'EXPORTS', from: fileId, to: 'b', resolved: false, meta: meta('./y.js', 'c') },
				{ kind: 'EXPORTS', from: fileId, to: '*', resolved: false, meta: meta('./z.js', '*') },
			]);
		});

		it('a namespace re-export and a local export list emit no EXPORTS row', () => {
			const r = parse(file, `export * as ns from './y.js';\nconst a = 1;\nexport { a };\n`);
			assert.deepEqual(exportsRows(r), []);
		});

		it('a file without re-exports has no EXPORTS row, and adding re-export lines leaves its other entities and relations unchanged', () => {
			const plain = parse(file, PLAIN);
			assert.deepEqual(exportsRows(plain), []);
			assert.ok(plain.relations.some(x => x.kind === 'CALLS'), 'the fixture has calls');

			const withReExports = parse(file, PLAIN + REEXPORTS);
			const shape = (r: ParseResult) => r.entities
				.filter(e => e.kind !== 'file')
				.map(e => ({ id: e.id, kind: e.kind, name: e.name, startLine: e.startLine, endLine: e.endLine, body: e.body }));
			assert.deepEqual(shape(withReExports), shape(plain));
			assert.deepEqual(withReExports.relations.filter(x => x.kind !== 'EXPORTS'), plain.relations);
			assert.equal(exportsRows(withReExports).length, 3);
		});
	});
}
