/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's workflow request module imports nothing from the MCP server's
 * tree (Epic c2ba6fa6, Story s11, t4): the workflow step it reuses now lives in
 * src/daemon/steps.
 *
 * Run: npx tsx --test src/daemon/steps/__tests__/workflow-rpc-imports.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAEMON = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The module paths a file imports (static and dynamic), resolved against its directory. */
function importsOf(file: string): string[] {
	const src = readFileSync(file, 'utf8');
	const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1]!);
	return specs.map(s => normalize(join(dirname(file), s)));
}

test('workflow-rpc imports nothing from src/mcp, and takes the workflow step from src/daemon/steps', () => {
	const file = join(DAEMON, 'workflow-rpc.ts');
	const resolved = importsOf(file);
	const mcp = normalize(join(DAEMON, '..', 'mcp'));
	assert.deepEqual(resolved.filter(p => p.startsWith(mcp)), [], 'no import reaches src/mcp');
	assert.ok(resolved.some(p => p.startsWith(join(DAEMON, 'steps', 'workflow-step'))), 'the workflow step comes from src/daemon/steps');
	// The check sees an import into src/mcp when there is one.
	assert.ok(importsOf(join(DAEMON, '..', 'mcp', 'server.ts')).some(p => p.startsWith(mcp)));
});
