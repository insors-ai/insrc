/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The MCP server's import graph (Epic c2ba6fa6, Story s11, t9; ac4): every
 * module reachable by value import from src/bin/insrc-mcp.ts and src/mcp
 * imports nothing under src/db, src/analyze or src/daemon/steps, apart from the
 * request clients src/shared/ipc-client.ts and src/mcp/daemon-stream.ts, whose
 * own imports are not followed. Type-only imports are erased at run time and
 * are not followed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const rel = (f: string): string => relative(join(SRC, '..'), f);

const EXEMPT = new Set(['src/shared/ipc-client.ts', 'src/mcp/daemon-stream.ts']);
const FORBIDDEN = ['src/db/', 'src/analyze/', 'src/daemon/steps/'];

/** The files a module imports by value: static imports and re-exports that are not
 *  type-only (whole clause or every named binding), and dynamic imports. */
export function valueImports(file: string): string[] {
	const src = readFileSync(file, 'utf8');
	const out: string[] = [];
	const statics = /^\s*(?:import|export)\s+(?!type\b)([^'";]*?\bfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/gm;
	for (const m of src.matchAll(statics)) {
		const clause = m[1] ?? '';
		const braces = /\{([^}]*)\}/.exec(clause);
		const outside = clause.replace(/\{[^}]*\}/, '').replace(/\bfrom\s*$/, '').replace(/[\s,]/g, '').replace(/^\*as\w+$/, 'ns');
		if (braces !== null && outside.length === 0) {
			const names = braces[1]!.split(',').map(n => n.trim()).filter(n => n.length > 0);
			if (names.length > 0 && names.every(n => n.startsWith('type '))) continue;
		}
		const r = resolve(file, m[2]!);
		if (r !== undefined) out.push(r);
	}
	for (const m of src.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
		const r = resolve(file, m[1]!);
		if (r !== undefined) out.push(r);
	}
	return out;
}

function resolve(from: string, spec: string): string | undefined {
	const p = normalize(join(dirname(from), spec));
	const candidates = p.endsWith('.js') ? [p.slice(0, -3) + '.ts', p.slice(0, -3) + '.tsx', p] : [p, p + '.ts', join(p, 'index.ts')];
	return candidates.find(c => existsSync(c) && statSync(c).isFile());
}

/** Walk from `roots`; return each forbidden import as 'importer -> imported'. */
export function offenders(roots: readonly string[]): { reached: number; found: string[] } {
	const seen = new Set<string>();
	const stack = [...roots];
	const found: string[] = [];
	while (stack.length > 0) {
		const f = stack.pop()!;
		if (seen.has(f)) continue;
		seen.add(f);
		if (EXEMPT.has(rel(f))) continue;
		for (const d of valueImports(f)) {
			if (FORBIDDEN.some(b => rel(d).startsWith(b))) found.push(`${rel(f)} -> ${rel(d)}`);
			else stack.push(d);
		}
	}
	return { reached: seen.size, found };
}

function mcpRoots(): string[] {
	const roots = [join(SRC, 'bin', 'insrc-mcp.ts')];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			if (statSync(full).isDirectory()) { if (name !== '__tests__') walk(full); continue; }
			if (/\.tsx?$/.test(name)) roots.push(full);
		}
	};
	walk(join(SRC, 'mcp'));
	return roots;
}

test('import graph (ac4): the MCP server reaches nothing under src/db, src/analyze or src/daemon/steps; a fixture import makes it fail', () => {
	const roots = mcpRoots();
	assert.ok(roots.some(r => rel(r) === 'src/mcp/server.ts') && roots.some(r => rel(r) === 'src/bin/insrc-mcp.ts'));
	const { reached, found } = offenders(roots);
	assert.deepEqual(found, []);
	assert.ok(reached > 10, `the walk reached the server's modules (${reached})`);

	// The fixture imports the graph store by value: added as a root, it is reported.
	const fixture = join(SRC, 'mcp', '__tests__', 'fixtures', 'imports-store.fixture.ts');
	const withFixture = offenders([...roots, fixture]);
	assert.deepEqual(withFixture.found, ['src/mcp/__tests__/fixtures/imports-store.fixture.ts -> src/db/graph/store.ts']);

	// The reader tells a value import from a type-only one, and follows dynamic imports.
	const imports = valueImports(fixture).map(rel);
	assert.deepEqual(imports, ['src/db/graph/store.ts'], 'the type-only import of shared/types is not followed');
	assert.ok(valueImports(join(SRC, 'daemon', 'handler-runtime.ts')).map(rel).includes('src/daemon/steps/host.ts'), 'a dynamic import is followed');
});
