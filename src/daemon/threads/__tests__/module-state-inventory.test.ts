/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story 5d393a4b S001: the module-state inventory. The scanner over a temporary project, and the
 * guard over the real source tree.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/module-state-inventory.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { moduleStateInventory } from './module-state-inventory.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

/** A temporary project with an entry and modules that declare each kind of state. */
function project(): string {
	const dir = mkdtempSync(join(tmpdir(), 'module-state-'));
	mkdirSync(join(dir, 'src'), { recursive: true });
	writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
		module: 'nodenext', target: 'es2022', strict: true, types: ['node'], typeRoots: [join(root, 'node_modules', '@types')], skipLibCheck: true,
	} }));
	const files: Record<string, string> = {
		'entry.ts': `
import { cache, add } from './a.js';
import type { T } from './typeonly.js';
import { shared } from './shared.js';
export async function run(): Promise<void> { const b = await import('./b.js'); add(b.legacy); cache.set('k', 1); shared.count = 2; }
export type U = T;
`,
		'a.ts': `
let counter = 0;
export const cache = new Map<string, number>();
export const table = { x: 1 };
export const frozen = Object.freeze({ y: 1 });
export const fixed = [1, 2] as const;
export const written: number[] = [];
export const patched: Record<string, number> = {};
patched['k'] = 1;
export function add(n: number): void { written.push(n); counter++; }
`,
		'b.ts': `export var legacy = 1;`,
		'typeonly.ts': `export let typeOnlyState = 1; export type T = number;`,
		'outside.ts': `export let outsideState = 1;`,
		'shared.ts': `export const shared = { count: 1 };`,
	};
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'src', name), text);
	return dir;
}

test('module-state inventory: the scanner reports lets, constructed containers and written const literals, skips read-only and frozen tables, follows dynamic imports and skips modules outside the closure', () => {
	const dir = project();
	try {
		const sites = moduleStateInventory(dir, 'src/entry.ts');
		assert.deepEqual(sites.map(s => `${s.key} ${s.kind}`), [
			'src/a.ts#cache container',
			'src/a.ts#counter let',
			'src/a.ts#patched literal',
			'src/a.ts#written literal',
			'src/b.ts#legacy var',
			'src/shared.ts#shared literal',
		], 'read-only (table), frozen and as-const tables are skipped; a type-only import and an unimported module are outside the closure');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('module-state inventory: the scanner throws on an unreadable tsconfig and is deterministic', () => {
	const dir = project();
	try {
		assert.deepEqual(moduleStateInventory(dir, 'src/entry.ts'), moduleStateInventory(dir, 'src/entry.ts'), 'the same input gives the same list');
		rmSync(join(dir, 'tsconfig.json'));
		assert.throws(() => moduleStateInventory(dir, 'src/entry.ts'), /Cannot read module-state inventory tsconfig/);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
