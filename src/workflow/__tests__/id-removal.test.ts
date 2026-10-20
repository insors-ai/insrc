/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * s1/t17 — the work-item id module (src/workflow/id.ts) and the docs migration tool are gone: no
 * source file, bin entry or write-inventory row refers to either.
 *
 * Run: npx tsx --test src/workflow/__tests__/id-removal.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ARTIFACT_WRITE_INVENTORY } from '../artifact-write-inventory.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');

/** Every source file under src and the root scripts, repo-relative with forward slashes: .ts, .tsx, .js, .mjs and .cjs. */
function sourceFiles(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) sourceFiles(path, out);
		else if (/\.(?:[cm]?[jt]sx?)$/.test(name)) out.push(relative(ROOT, path).split('\\').join('/'));
	}
	return out;
}

test('no source file, bin entry or write-inventory row refers to src/workflow/id.ts or the migration tool', () => {
	// the files are gone
	for (const gone of ['src/workflow/id.ts', 'src/workflow/migrate-docs-tree.ts', 'src/bin/insrc-migrate-docs.ts']) {
		assert.equal(existsSync(join(ROOT, gone)), false, `${gone} must not exist`);
	}

	// no source file imports the id module (any relative depth) or names the migration tool; this file names them only in this list
	// A module specifier ending in /id.js or /id.ts in any quote style, static or dynamic, or the tool by any of its names.
	const files = [...sourceFiles(join(ROOT, 'src')), 'copy-assets.mjs'].filter(f => f !== 'src/workflow/__tests__/id-removal.test.ts' && existsSync(join(ROOT, f)));
	const importsId = /['"`][^'"`\n]*\/id\.(?:js|ts)['"`]/;
	const namesTool = /migrate-docs-tree|insrc-migrate-docs|migrateDocsTree/;
	for (const f of files) {
		const text = readFileSync(join(ROOT, f), 'utf8');
		assert.doesNotMatch(text, importsId, `${f} imports the removed id module`);
		assert.doesNotMatch(text, namesTool, `${f} refers to the removed migration tool`);
	}

	// no bin entry in package.json
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { bin?: Record<string, string> };
	for (const [name, target] of Object.entries(pkg.bin ?? {})) {
		assert.doesNotMatch(`${name} ${target}`, /migrate-docs|\/workflow\/id\.js/, `bin entry ${name} refers to a removed file`);
		const source = join(ROOT, target.replace(/^\.\/out\//, 'src/').replace(/\.js$/, ''));
		assert.equal(existsSync(`${source}.ts`) || existsSync(`${source}.tsx`), true, `bin entry ${name} points at a source file that exists`);
	}
	for (const [name, script] of Object.entries((JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {})) {
		assert.doesNotMatch(script, /migrate-docs|workflow\/id\.js/, `script ${name} refers to a removed file`);
	}

	// no write-inventory row
	for (const row of ARTIFACT_WRITE_INVENTORY) {
		assert.doesNotMatch(row.file, /migrate-docs-tree|workflow\/id\.ts$/, `inventory row ${row.file}`);
	}
});
