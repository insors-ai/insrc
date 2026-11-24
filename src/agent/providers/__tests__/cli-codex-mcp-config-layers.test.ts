/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * walkProjectMcpConfigLayers -- the fail-closed refusal check for a codex
 * read-only session: does cwd or any ancestor (other than the one layer that
 * IS the real global codex config, by exact path) declare its own
 * mcp_servers table. (LLD-a9ae072ce3b7b794-S001, plan task t2.)
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { walkProjectMcpConfigLayers } from '../cli-provider.js';

/** Runs `fn` with HOME/CODEX_HOME set to the given values, always restoring the originals. */
async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
	const saved = new Map<string, string | undefined>();
	for (const key of Object.keys(env)) saved.set(key, process.env[key]);
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		return await fn();
	} finally {
		for (const [key, value] of saved) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

function writeToml(path: string, text: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, text, 'utf8');
}

test('walkProjectMcpConfigLayers returns false for the default case: the home directory IS the global config, and it is skipped without being read', async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-codex-home-'));
	try {
		writeToml(join(home, '.codex', 'config.toml'), '[mcp_servers.insrc]\ncommand = "node"\n');
		const cwd = join(home, 'project', 'src');
		mkdirSync(cwd, { recursive: true });
		await withEnv({ HOME: home, CODEX_HOME: undefined }, async () => {
			assert.equal(await walkProjectMcpConfigLayers(cwd), false);
		});
	} finally { rmSync(home, { recursive: true, force: true }); }
});

test('walkProjectMcpConfigLayers regression: CODEX_HOME nested inside the project tree still detects a genuine project-root sentinel, and does not falsely detect one when absent', async () => {
	// The exact layout the review's finding cited: CODEX_HOME=.../work/repo/codex-state (declaring
	// mcp_servers.insrc), cwd=.../work/repo/src, and a mutation-sentinel server at the project root
	// .../work/repo/.codex/config.toml -- distinct from CODEX_HOME by path, so it must still be checked.
	const tmp = mkdtempSync(join(tmpdir(), 'insrc-codex-nested-'));
	const workRepo = join(tmp, 'work', 'repo');
	try {
		const codexHome = join(workRepo, 'codex-state');
		writeToml(join(codexHome, 'config.toml'), '[mcp_servers.insrc]\ncommand = "node"\n');
		const cwd = join(workRepo, 'src');
		mkdirSync(cwd, { recursive: true });

		// With a sentinel declared at the project root (distinct from CODEX_HOME by path): detected.
		writeToml(join(workRepo, '.codex', 'config.toml'), '[mcp_servers.mutation-sentinel]\ncommand = "node"\n');
		await withEnv({ HOME: undefined, CODEX_HOME: codexHome }, async () => {
			assert.equal(await walkProjectMcpConfigLayers(cwd), true);
		});

		// Same layout, no sentinel at the project root: global insrc remains allowed.
		rmSync(join(workRepo, '.codex'), { recursive: true, force: true });
		await withEnv({ HOME: undefined, CODEX_HOME: codexHome }, async () => {
			assert.equal(await walkProjectMcpConfigLayers(cwd), false);
		});
	} finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('walkProjectMcpConfigLayers returns false when CODEX_HOME lies entirely outside cwd\'s own ancestor chain', async () => {
	const cwdRoot = mkdtempSync(join(tmpdir(), 'insrc-codex-cwd-'));
	const codexHomeRoot = mkdtempSync(join(tmpdir(), 'insrc-codex-elsewhere-'));
	try {
		writeToml(join(codexHomeRoot, 'config.toml'), '[mcp_servers.insrc]\ncommand = "node"\n');
		const cwd = join(cwdRoot, 'src');
		mkdirSync(cwd, { recursive: true });
		await withEnv({ HOME: undefined, CODEX_HOME: codexHomeRoot }, async () => {
			assert.equal(await walkProjectMcpConfigLayers(cwd), false);
		});
	} finally {
		rmSync(cwdRoot, { recursive: true, force: true });
		rmSync(codexHomeRoot, { recursive: true, force: true });
	}
});

test('walkProjectMcpConfigLayers returns true for each of the four valid TOML forms at a genuine ancestor layer', async () => {
	const forms = [
		['dotted header', '[mcp_servers.insrc]\ncommand = "node"\n'],
		['bare header with nested keys', '[mcp_servers]\ninsrc.command = "node"\n'],
		['inline-table assignment', 'mcp_servers = { insrc = { command = "node" } }\n'],
		['top-level dotted key-value', 'mcp_servers.insrc.command = "node"\n'],
	] as const;
	for (const [label, text] of forms) {
		const root = mkdtempSync(join(tmpdir(), 'insrc-codex-form-'));
		try {
			const codexHome = join(root, 'codex-state');
			writeToml(join(codexHome, 'config.toml'), '[mcp_servers.insrc]\ncommand = "node"\n');
			const cwd = join(root, 'src');
			mkdirSync(cwd, { recursive: true });
			writeToml(join(root, '.codex', 'config.toml'), text);
			await withEnv({ HOME: undefined, CODEX_HOME: codexHome }, async () => {
				assert.equal(await walkProjectMcpConfigLayers(cwd), true, label);
			});
		} finally { rmSync(root, { recursive: true, force: true }); }
	}
});

test('walkProjectMcpConfigLayers returns false for a cwd chain with no non-excluded .codex/config.toml at all', async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-codex-none-'));
	try {
		// No .codex/config.toml anywhere -- not even the global one.
		const cwd = join(home, 'project', 'src');
		mkdirSync(cwd, { recursive: true });
		await withEnv({ HOME: home, CODEX_HOME: undefined }, async () => {
			assert.equal(await walkProjectMcpConfigLayers(cwd), false);
		});
	} finally { rmSync(home, { recursive: true, force: true }); }
});

test('walkProjectMcpConfigLayers propagates a plain Error on a non-ENOENT read failure at a non-excluded layer', async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-codex-eisdir-'));
	try {
		const cwd = join(home, 'project', 'src');
		mkdirSync(cwd, { recursive: true });
		// A directory where a file is expected: a non-ENOENT read failure (EISDIR).
		mkdirSync(join(home, 'project', '.codex', 'config.toml'), { recursive: true });
		await withEnv({ HOME: home, CODEX_HOME: undefined }, async () => {
			await assert.rejects(walkProjectMcpConfigLayers(cwd));
		});
	} finally { rmSync(home, { recursive: true, force: true }); }
});
