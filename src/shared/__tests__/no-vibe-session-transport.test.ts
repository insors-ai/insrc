/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t7: a durable contract check --
 * the deleted app-server transport (src/shared/vibe-session.ts) must never
 * come back, and no production file may import it. A future regression that
 * restores the file or re-adds an import fails this suite immediately.
 *
 * Run: npx tsx --test src/shared/__tests__/no-vibe-session-transport.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** The two production roots this repo ships from (daemon/CLI/MCP under src/,
 *  the VS Code extension under vscode-plugin/src/) -- everything else
 *  (node_modules, dist/out, docs, .insrc) is either not production code or
 *  not TypeScript source a future import could land in. */
const PRODUCTION_ROOTS = ['src', 'vscode-plugin/src'] as const;

/** Every .ts file under a production root, EXCLUDING test files themselves
 *  (a fixture/test asserting the import string, like this file, is not an
 *  importer) -- review finding r2-5: the earlier version of this test only
 *  scanned four hardcoded, grep-found-at-the-time files, so a newly added
 *  production file that imports the deleted transport would never be
 *  caught. Scanning every production .ts file closes that gap for good. */
function productionTsFiles(relRoot: string): readonly string[] {
	const absRoot = join(root, relRoot);
	const entries = readdirSync(absRoot, { recursive: true }) as readonly string[];
	return entries
		.filter(entry => entry.endsWith('.ts') && !entry.endsWith('.d.ts'))
		.filter(entry => !entry.split(/[/\\]/).some(part => part === '__tests__' || part === 'node_modules' || part === 'out' || part === 'dist'))
		.filter(entry => !entry.endsWith('.test.ts'))
		.map(entry => join(relRoot, entry));
}

test('src/shared/vibe-session.ts no longer exists', () => {
	assert.equal(existsSync(join(root, 'src/shared/vibe-session.ts')), false);
});

test('no production .ts file under src/ or vscode-plugin/src/ imports src/shared/vibe-session.js', () => {
	const files = PRODUCTION_ROOTS.flatMap(productionTsFiles);
	assert.ok(files.length > 100, 'the production scan must cover a realistic number of files, not an empty/truncated listing');
	for (const file of files) {
		const source = readFileSync(join(root, file), 'utf8');
		assert.doesNotMatch(source, /vibe-session\.js/, `${file} must not import the deleted app-server transport`);
	}
});
