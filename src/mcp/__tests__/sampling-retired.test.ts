/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP sampling is retired (Epic c2ba6fa6, Story s11, t10; decision D3): the
 * step tools run in the daemon, which has no MCP client to sample from.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NAMES = ['runWithSamplerContext', 'currentSamplerContext', 'McpSamplingProvider', 'mcp-sampling-provider', 'sampling-bridge', 'makeSamplerFromMcpServer'];

function sourceFiles(dir = SRC): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') out.push(...sourceFiles(full)); continue; }
		if (/\.(ts|tsx|mts)$/.test(name)) out.push(full);
	}
	return out;
}

test('sampling retired: no source names the sampling bridge, the MCP sampling provider or runWithSamplerContext', () => {
	const files = sourceFiles();
	assert.ok(files.length > 500, `the scan sees the source tree (${files.length} files)`);
	const hits: string[] = [];
	for (const f of files) {
		const text = readFileSync(f, 'utf8');
		for (const n of NAMES) if (text.includes(n)) hits.push(`${relative(SRC, f)}: ${n}`);
	}
	assert.deepEqual(hits, []);
	for (const gone of ['mcp/sampling-bridge.ts', 'agent/providers/mcp-sampling-provider.ts']) {
		assert.equal(existsSync(join(SRC, gone)), false, `${gone} is deleted`);
	}
	// The scan sees a name when it is there: this file names them all.
	const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
	assert.ok(NAMES.every(n => self.includes(n)));
});
