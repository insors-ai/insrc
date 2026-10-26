/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t4: no file under src/daemon/tools except shell-helper.ts imports
 * node:child_process, so a new direct spawn cannot bypass the shared process lifecycle unnoticed.
 * Run: npx tsx --test src/daemon/tools/__tests__/child-process-inventory.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = ['shell-helper.ts'];
/** import or export ... from the module, a side-effect import, a dynamic import or a require of 'node:child_process' | 'child_process'. */
const CHILD_PROCESS = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](?:node:)?child_process['"]/;

/** Source extensions the daemon could load; a spawn in any of them bypasses the lifecycle. */
const SOURCE = /\.(?:ts|tsx|js|mjs|cjs)$/;
/**
 * The one exclusion: the tests themselves (a __tests__ directory and *.test.* files). They may spawn a real
 * process to prepare a fixture, and they never ship in a tool. Everything else under the tree is scanned,
 * including type fixtures, fixture directories and plain JavaScript.
 */
function isTestCode(name: string, isDir: boolean): boolean {
	return isDir ? name === '__tests__' : /\.test\.[cm]?[jt]sx?$/.test(name);
}

function listSources(root: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const full = join(root, entry.name);
		if (isTestCode(entry.name, entry.isDirectory())) continue;
		if (entry.isDirectory()) out.push(...listSources(full));
		else if (SOURCE.test(entry.name)) out.push(full);
	}
	return out;
}

/** The files under root, other than the allowed ones, that import node:child_process. */
export function findChildProcessImports(root: string, allowed: readonly string[]): string[] {
	return listSources(root)
		.filter(f => !allowed.includes(relative(root, f)))
		.filter(f => CHILD_PROCESS.test(readFileSync(f, 'utf8')))
		.map(f => relative(root, f));
}

test('child-process-inventory.test.ts: no file under src/daemon/tools other than shell-helper.ts imports node:child_process', () => {
	assert.deepEqual(findChildProcessImports(TOOLS_DIR, ALLOWED), []);
	assert.ok(readFileSync(join(TOOLS_DIR, 'shell-helper.ts'), 'utf8').match(CHILD_PROCESS), 'shell-helper.ts is the one place that does');
});

test('child-process-inventory.test.ts: a temporary file that imports it in a temporary tree is reported by the same logic', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-inventory-'));
	try {
		mkdirSync(join(root, 'builtins'));
		writeFileSync(join(root, 'shell-helper.ts'), "import { spawn } from 'node:child_process';\n");
		writeFileSync(join(root, 'builtins', 'clean.ts'), "import { runShell } from '../shell-helper.js';\n");
		writeFileSync(join(root, 'builtins', 'a.ts'), "import { spawn } from 'node:child_process';\n");
		writeFileSync(join(root, 'builtins', 'b.ts'), "import cp from 'child_process';\n");
		writeFileSync(join(root, 'builtins', 'c.ts'), "const cp = await import('node:child_process');\n");
		writeFileSync(join(root, 'builtins', 'd.ts'), "const cp = require('child_process');\n");
		writeFileSync(join(root, 'builtins', 'e.ts'), "import 'node:child_process';\n");
		writeFileSync(join(root, 'builtins', 'f.ts'), "export { spawn } from 'node:child_process';\n");
		writeFileSync(join(root, 'builtins', 'g.ts'), "export * from \"child_process\";\n");
		mkdirSync(join(root, '__type-tests__')); mkdirSync(join(root, 'fixtures'));
		writeFileSync(join(root, '__type-tests__', 'h.ts'), "import { spawn } from 'node:child_process';\n");
		writeFileSync(join(root, 'fixtures', 'i.mjs'), "import { spawn } from 'node:child_process';\n");
		writeFileSync(join(root, 'builtins', 'j.js'), "const cp = require('child_process');\n");
		// test code is the one exclusion
		mkdirSync(join(root, '__tests__'));
		writeFileSync(join(root, '__tests__', 'k.ts'), "import { spawn } from 'node:child_process';\n");
		writeFileSync(join(root, 'builtins', 'l.test.ts'), "import { spawn } from 'node:child_process';\n");
		assert.deepEqual(
			findChildProcessImports(root, ['shell-helper.ts']).sort(),
			['__type-tests__/h.ts', 'builtins/a.ts', 'builtins/b.ts', 'builtins/c.ts', 'builtins/d.ts', 'builtins/e.ts', 'builtins/f.ts', 'builtins/g.ts', 'builtins/j.js', 'fixtures/i.mjs'],
		);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
