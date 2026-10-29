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

import { inventoryProblems, moduleStateInventory } from './module-state-inventory.js';
import type { ModuleStateSite, StateEntry } from './module-state-inventory.js';

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

test('module-state inventory: the guard names a missing key, a stale key, an invalid class, a missing owner, a short reason and an unrouted shared-state owner, and reports nothing on a clean input', () => {
	const site = (key: string): ModuleStateSite => ({ key, file: key.split('#')[0]!, name: key.split('#')[1]!, kind: 'let' });
	const reason = 'A reason long enough to explain the classification of this value.';
	const routed = new Set(['chat.list', 'todos.subscribe']);
	const sites = ['src/a.ts#one', 'src/a.ts#two', 'src/b/c.ts#three', 'src/b/c.ts#four'].map(site);
	const clean: Record<string, StateEntry> = {
		'src/a.ts#one': { class: 'per-thread', reason },
		'src/a.ts#two': { class: 'shared-store', reason },
		'src/b/c.ts#three': { class: 'one-owner', owner: 'shared-state', methods: 'chat.', reason },
		'src/b/c.ts#four': { class: 'one-owner', owner: 'main', reason },
	};
	assert.deepEqual(inventoryProblems(sites, clean, routed), [], 'a clean input reports nothing');

	const broken: Record<string, StateEntry> = {
		'src/a.ts#one': { class: 'per-thread', reason: 'too short' },
		'src/a.ts#gone': { class: 'per-thread', reason },
		'src/b/c.ts#three': { class: 'one-owner', owner: 'shared-state', methods: 'repo.', reason },
		'src/b/c.ts#four': { class: 'one-owner', reason },
		'src/a.ts#two': { class: 'everywhere' as never, reason },
	};
	assert.deepEqual(inventoryProblems([...sites, site('src/b/c.ts#new')], broken, routed), [
		"src/a.ts#gone: stale (no such module-scope state any more)",
		"src/a.ts#one: reason under 40 characters",
		"src/a.ts#two: invalid class 'everywhere'",
		"src/b/c.ts#four: one-owner without a valid owner",
		"src/b/c.ts#new: not classified (add a class and a reason)",
		"src/b/c.ts#three: owned by the shared-state worker but no routed method starts with 'repo.'",
	]);
	assert.deepEqual(inventoryProblems([...sites, site('src/b/c.ts#new')], broken, routed, 'src/b/'), [
		"src/b/c.ts#four: one-owner without a valid owner",
		"src/b/c.ts#new: not classified (add a class and a reason)",
		"src/b/c.ts#three: owned by the shared-state worker but no routed method starts with 'repo.'",
	], 'a prefix limits the check to keys under it');
});
