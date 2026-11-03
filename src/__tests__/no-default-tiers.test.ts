/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The built-in model lists are gone (Epic ce99b72065d03b1b, Story s5): no file
 * under src — tests included, every TypeScript and JavaScript extension — imports
 * or exports DEFAULT_TIERS or TIER_EFFORTS, and the TUI's shipped-registry
 * stopgap no longer exists. Model defaults come from the definitions (the
 * daemon's models.definitions, or SHIPPED_MODEL_DEFAULTS where a static default
 * is needed).
 *
 * The two names are assembled at run time so this file's own source never
 * matches the patterns it applies.
 *
 * Run: npx tsx --test src/__tests__/no-default-tiers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

const TIERS = 'DEFAULT_' + 'TIERS';
const EFFORTS = 'TIER_' + 'EFFORTS';
const NAME = `\\b(?:${TIERS}|${EFFORTS})\\b`;

/** Every source file under src, tests included. */
function sourceFiles(dir: string = SRC): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
		else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(name)) out.push(p);
	}
	return out;
}

/** Each way a module can import or export one of the names. */
const RULES: ReadonlyArray<readonly [string, RegExp]> = [
	// import { …, NAME, … } from '…'  /  import type { NAME } …  (any line breaks)
	['imports', new RegExp(`(^|\\n)\\s*import\\b[^;]*${NAME}[^;]*?\\bfrom\\b`)],
	// const { NAME } = await import('…')  /  require('…')
	['imports', new RegExp(`\\{[^}]*${NAME}[^}]*\\}\\s*=\\s*(?:await\\s+)?(?:import|require)\\s*\\(`)],
	// (await import('…')).NAME  /  require('…').NAME
	['imports', new RegExp(`(?:import|require)\\s*\\([^)]*\\)\\s*\\)?\\s*\\.\\s*${NAME}`)],
	// export const|let|var|function|class|… NAME
	['exports', new RegExp(`(^|\\n)\\s*export\\s+(?:declare\\s+)?(?:const|let|var|function|class|enum|type|interface)\\s+${NAME}`)],
	// export const a = 1, NAME = … (any declarator of the statement)
	['exports', new RegExp(`(^|\\n)\\s*export\\s+(?:declare\\s+)?(?:const|let|var)\\s[^;]*,\\s*${NAME}\\s*[=:;,]`)],
	// export { …, NAME, … } (from '…')  (any line breaks)
	['exports', new RegExp(`(^|\\n)\\s*export\\s*(?:type\\s*)?\\{[^}]*${NAME}[^}]*\\}`)],
	// export default NAME
	['exports', new RegExp(`(^|\\n)\\s*export\\s+default\\s+${NAME}`)],
];

const violations = (code: string): string[] => RULES.filter(([, re]) => re.test(code)).map(([kind]) => kind);

test('no-default-tiers.test.ts: no file under src imports or exports DEFAULT_TIERS / TIER_EFFORTS', () => {
	const files = sourceFiles();
	assert.ok(files.some(f => f.includes('__tests__')), 'tests are scanned');
	assert.ok(files.some(f => f.endsWith('.mjs')) && files.some(f => f.endsWith('.js')), 'JavaScript files are scanned');
	const hits = files.flatMap(f => [...new Set(violations(readFileSync(f, 'utf8')))].map(kind => `${relative(SRC, f)}: ${kind}`));
	assert.deepEqual(hits, []);
	assert.equal(existsSync(join(SRC, 'cli', 'shipped-model-registry.ts')), false, 'the shipped-registry stopgap is removed');

	// Each shape is caught.
	const caught: Array<[string, string]> = [
		[`import { assembleConfig, ${TIERS} } from '../analyze.js';`, 'imports'],
		[`import {\n\t${EFFORTS},\n} from '../analyze.js';`, 'imports'],
		[`import type { ${TIERS} } from './a.js';`, 'imports'],
		[`const { ${TIERS} } = await import('../config/analyze.js');`, 'imports'],
		[`const { ${EFFORTS} } = require('./analyze.js');`, 'imports'],
		[`const t = (await import('./analyze.js')).${TIERS};`, 'imports'],
		[`export const ${TIERS} = {};`, 'exports'],
		[`export function ${EFFORTS}() {}`, 'exports'],
		[`export { ${EFFORTS} } from "./x.js";`, 'exports'],
		[`export {\n\tfoo,\n\t${TIERS},\n};`, 'exports'],
		[`export default ${TIERS};`, 'exports'],
		[`export const other = 1, ${TIERS} = {};`, 'exports'],
		[`export let a: number,\n\t${EFFORTS}: string[];`, 'exports'],
	];
	for (const [code, kind] of caught) assert.ok(violations(code).includes(kind), `not caught: ${JSON.stringify(code)}`);
	// Mentions that are neither an import nor an export are not violations.
	for (const code of [`// ${TIERS} was removed`, `test('equal ${TIERS}', () => {});`, `const MY_${TIERS}_X = 1;`]) {
		assert.deepEqual(violations(code), [], code);
	}
});
