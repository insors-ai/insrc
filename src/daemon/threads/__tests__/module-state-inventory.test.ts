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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IN_DAEMON_SHARED_METHODS, SHARED_STATE_METHODS } from '../method-class.js';
import { inventoryProblems, moduleStateInventory } from './module-state-inventory.js';
import type { ModuleStateSite, StateEntry } from './module-state-inventory.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fixture = (): Record<string, StateEntry> => JSON.parse(readFileSync(new URL('./fixtures/module-state-inventory.json', import.meta.url), 'utf8')) as Record<string, StateEntry>;
const routed: ReadonlySet<string> = new Set([...SHARED_STATE_METHODS, ...IN_DAEMON_SHARED_METHODS]);
/** The real source tree's sites, scanned once for the tests that read them. */
let scanned: ModuleStateSite[] | undefined;
const realSites = (): ModuleStateSite[] => (scanned ??= moduleStateInventory(root));

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

test('module-state inventory: every scanned key under src/daemon/ has a valid fixture entry, and the s3 families are one-owner on the shared-state worker or shared-store', { timeout: 120_000 }, () => {
	const entries = fixture();
	assert.deepEqual(inventoryProblems(realSites(), entries, routed, 'src/daemon/'), [], 'the src/daemon/ slice is classified');
	assert.deepEqual(entries['src/daemon/chat-handler.ts#sessionPool'], { ...entries['src/daemon/chat-handler.ts#sessionPool'], class: 'one-owner', owner: 'shared-state', methods: 'chat.' });
	assert.deepEqual(entries['src/daemon/todos-rpc.ts#bus'], { ...entries['src/daemon/todos-rpc.ts#bus'], class: 'one-owner', owner: 'shared-state', methods: 'todos.' });
	assert.deepEqual(entries['src/daemon/threads/session-worker.ts#understanding'], { ...entries['src/daemon/threads/session-worker.ts#understanding'], class: 'one-owner', owner: 'shared-state', methods: 'understanding.' });
	assert.equal(entries['src/daemon/workflow-run-registry.ts#board']?.class, 'shared-store');
});

test('module-state inventory: every module-scope mutable value the session worker can load is classified (full guard over the repo)', { timeout: 120_000 }, () => {
	const problems = inventoryProblems(realSites(), fixture(), routed);
	assert.deepEqual(problems, [], `classify each new value in fixtures/module-state-inventory.json (per-thread, shared-store or one-owner, with a reason):\n${problems.join('\n')}`);
});

test('module-state inventory: every move candidate carries a recorded decision, and every one-owner or shared-store entry names its mechanism', () => {
	const entries = Object.entries(fixture());
	assert.deepEqual(entries.filter(([, e]) => e.reason.startsWith('MOVE CANDIDATE')).map(([k]) => k), [], 'no candidate is left without a decision');
	assert.deepEqual(entries.filter(([, e]) => e.reason.startsWith('MOVING INLINE')).map(([k]) => k), [], 'every move decided inline is made');
	for (const [key, e] of entries) {
		if (e.class === 'one-owner') assert.ok(e.owner !== undefined, `${key}: names its owner thread`);
		if (e.class === 'shared-store') assert.match(e.reason, /board|store|block/, `${key}: names the cross-thread store`);
	}
});
