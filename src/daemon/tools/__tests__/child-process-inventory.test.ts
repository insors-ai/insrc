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
/** import ... from 'node:child_process' | 'child_process', a dynamic import of it, or a require of it. */
const CHILD_PROCESS = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:node:)?child_process['"]/;

function listSources(root: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const full = join(root, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === '__tests__' || entry.name === '__type-tests__' || entry.name === 'fixtures') continue;
			out.push(...listSources(full));
		} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
			out.push(full);
		}
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
		assert.deepEqual(findChildProcessImports(root, ['shell-helper.ts']).sort(), ['builtins/a.ts', 'builtins/b.ts', 'builtins/c.ts', 'builtins/d.ts']);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
