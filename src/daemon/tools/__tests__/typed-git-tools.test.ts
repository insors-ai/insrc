/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t6: gitToolDefinitions lists every git tool the git files export, and
 * registerGitTools registers exactly that list. The compiler checks only the elements that are in the list;
 * this inventory test is what notices a definition that was left out.
 * Run: npx tsx --test src/daemon/tools/__tests__/typed-git-tools.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { gitToolDefinitions, registerGitTools } from '../builtins/git/index.js';
import { _resetRegistryForTests, listTools } from '../registry.js';

const GIT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../builtins/git');
const NOT_TOOL_FILES = ['index.ts', 'definitions.ts', 'helpers.ts', 'coverage.ts', 'schemas.ts', 'parsers.ts'];

interface Exported { id: string; execute: unknown; where: string; value: unknown }

/** Every export of the tool files in a directory whose value has a string id and an execute function. */
async function exportsOf(dir: string, skip: readonly string[]): Promise<Exported[]> {
	const out: Exported[] = [];
	for (const file of readdirSync(dir).filter(n => /\.(?:ts|mts)$/.test(n) && !n.endsWith('.test.ts') && !skip.includes(n)).sort()) {
		const mod = await import(pathToFileURL(join(dir, file)).href) as Record<string, unknown>;
		for (const [name, value] of Object.entries(mod)) {
			const v = value as { id?: unknown; execute?: unknown } | null;
			if (v !== null && typeof v === 'object' && typeof v.id === 'string' && typeof v.execute === 'function') out.push({ id: v.id, execute: v.execute, where: `${file}:${name}`, value });
		}
	}
	return out;
}

/** The problems of a list against what the files export, in both directions. */
function compareInventory(exported: readonly Exported[], listed: readonly unknown[]): string[] {
	const problems: string[] = [];
	for (const e of exported) if (!listed.includes(e.value)) problems.push(`exported but not listed: ${e.where} (${e.id})`);
	for (const l of listed) if (!exported.some(e => e.value === l)) problems.push(`listed but not exported by a tool file: ${(l as { id: string }).id}`);
	return problems;
}

afterEach(() => { _resetRegistryForTests(); });

test('typed-git-tools.test.ts: the list and the tool files agree in both directions, ids are unique and the registered ids equal the list', async () => {
	const exported = await exportsOf(GIT_DIR, NOT_TOOL_FILES);
	assert.deepEqual(compareInventory(exported, gitToolDefinitions), []);
	assert.ok(gitToolDefinitions.length >= 34, `the list holds ${gitToolDefinitions.length} definitions`);
	const ids = gitToolDefinitions.map(t => t.id);
	assert.equal(new Set(ids).size, ids.length, 'ids are unique');
	_resetRegistryForTests();
	registerGitTools();
	assert.deepEqual(listTools().map(t => t.id).sort(), [...ids].sort());
	assert.deepEqual(listTools().map(t => t.id), ids, 'registered in the order of the list');
});

test('typed-git-tools.test.ts: every listed tool declares typebox input and output schemas at run time', () => {
	const TYPEBOX = Symbol.for('TypeBox.Kind');
	for (const t of gitToolDefinitions) {
		assert.ok((t.inputSchema as unknown as Record<symbol, unknown>)[TYPEBOX] !== undefined, `${t.id}: inputSchema is a typebox schema`);
		assert.ok((t.outputSchema as unknown as Record<symbol, unknown>)[TYPEBOX] !== undefined, `${t.id}: outputSchema is a typebox schema`);
	}
});

test('typed-git-tools.test.ts: a tool exported but not listed, and a listed object not exported by a tool file, are each reported by the same logic', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-git-inventory-'));
	try {
		const tool = (id: string): string => `export const ${id}Tool = { id: '${id}', description: 'd', inputSchema: {}, async execute() { return { output: '', format: 'text', success: true }; } };\n`;
		writeFileSync(join(dir, 'a.ts'), tool('a'));
		writeFileSync(join(dir, 'b.ts'), tool('b'));
		const exported = await exportsOf(dir, []);
		const a = exported.find(e => e.id === 'a')!.value;
		const b = exported.find(e => e.id === 'b')!.value;
		assert.deepEqual(compareInventory(exported, [a, b]), []);
		assert.deepEqual(compareInventory(exported, [a]), ['exported but not listed: b.ts:bTool (b)']);
		assert.deepEqual(compareInventory(exported, [a, b, { id: 'ghost' }]), ['listed but not exported by a tool file: ghost']);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
