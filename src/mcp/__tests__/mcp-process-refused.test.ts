/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ac6 (Epic c2ba6fa6, Story s11, t11): the MCP server's process is refused the
 * live graph store and the live vector store. A child process starts the real
 * MCP server (runInsrcMcpStdio, as src/bin/insrc-mcp.ts does) with its home in
 * a temporary directory, then tries to open both live stores there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mcp-process-open.fixture.ts');

test("ac6: the MCP server's process is refused the live graph store and the live vector store", { timeout: 120_000, skip: process.platform === 'win32' }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-mcp-refused-'));
	const out = join(home, 'result.json');
	try {
		const child = spawn(process.execPath, ['--import', 'tsx/esm', FIXTURE, out], {
			env: { ...process.env, HOME: home, INSRC_REPO: '' },
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		let stderr = '';
		child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
		const code = await new Promise<number | null>(r => child.on('exit', r));
		assert.equal(code, 0, stderr.slice(-2000));

		const result = JSON.parse(readFileSync(out, 'utf8')) as {
			graph: { opened: boolean; name?: string; code?: string };
			vector: { opened: boolean; name?: string; code?: string };
			lmdb: string; lance: string;
		};
		// The child's live stores are the temporary home's.
		assert.equal(result.lmdb, join(home, '.insrc', 'graph.lmdb'));
		assert.equal(result.lance, join(home, '.insrc', 'lance'));
		assert.deepEqual(result.graph, { opened: false, name: 'LmdbStoreNotOwnerError' });
		assert.deepEqual(result.vector, { opened: false, name: 'LanceStoreNotOwnerError', code: 'lance-not-owner' });
		// Neither refused open created anything.
		const made = existsSync(join(home, '.insrc')) ? readdirSync(join(home, '.insrc')) : [];
		assert.deepEqual(made.filter(n => n.startsWith('graph.lmdb') || n === 'lance'), []);
	} finally { rmSync(home, { recursive: true, force: true }); }
});
