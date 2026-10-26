/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The built-in model lists are gone (Epic ce99b72065d03b1b, Story s5): no file
 * under src — tests included — imports or exports DEFAULT_TIERS or
 * TIER_EFFORTS, and the TUI's shipped-registry stopgap no longer exists. Model
 * defaults come from the definitions (the daemon's models.definitions, or
 * SHIPPED_MODEL_DEFAULTS where a static default is needed).
 *
 * Run: npx tsx --test src/__tests__/no-default-tiers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every TypeScript file under src, tests included. */
function sourceFiles(dir: string = SRC): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
		else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
	}
	return out;
}

const IMPORT = /^\s*import\b[^;]*\b(DEFAULT_TIERS|TIER_EFFORTS)\b[^;]*;/m;
const EXPORT = /^\s*export\b[^;\n]*\b(DEFAULT_TIERS|TIER_EFFORTS)\b/m;

test('no-default-tiers.test.ts: no file under src imports or exports DEFAULT_TIERS / TIER_EFFORTS', () => {
	const files = sourceFiles();
	assert.ok(files.some(f => f.includes('__tests__')), 'tests are scanned');
	const hits = files.flatMap(f => {
		const code = readFileSync(f, 'utf8');
		const rel = relative(SRC, f);
		return [...(IMPORT.test(code) ? [`${rel}: imports`] : []), ...(EXPORT.test(code) ? [`${rel}: exports`] : [])];
	});
	assert.deepEqual(hits, []);
	assert.equal(existsSync(join(SRC, 'cli', 'shipped-model-registry.ts')), false, 'the shipped-registry stopgap is removed');

	// The patterns catch the shapes they ban.
	assert.match("import { assembleConfig, DEFAULT_TIERS } from '../analyze.js';", IMPORT);
	assert.match("import {\n\tTIER_EFFORTS,\n} from '../analyze.js';", IMPORT);
	assert.match('export const DEFAULT_TIERS = {};', EXPORT);
	assert.match('export { TIER_EFFORTS } from "./x.js";', EXPORT);
});
