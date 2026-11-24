/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * discoverCodexMcpServers -- `codex -C cwd mcp list --json`, driven against a
 * FAKE codex binary. (LLD-a9ae072ce3b7b794-S001, plan task t3.)
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { discoverCodexMcpServers } from '../cli-provider.js';

/** A fake codex binary: records its argv, then prints `out` (or fails with `fail`/`code`, or sleeps). */
function fakeCodex(behavior: { out?: string; fail?: string; code?: number; sleepMs?: number }): { bin: string; dir: string; argv: () => string[] } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-codex-mcp-'));
	const bin = join(dir, 'fake-codex.mjs');
	const argvPath = join(dir, 'argv.json');
	writeFileSync(bin, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(argvPath)}, JSON.stringify(process.argv.slice(2)));
${behavior.sleepMs !== undefined ? `await new Promise(r => setTimeout(r, ${behavior.sleepMs}));` : ''}
${behavior.fail !== undefined ? `process.stderr.write(${JSON.stringify(behavior.fail)}); process.exit(${behavior.code ?? 1});` : `process.stdout.write(${JSON.stringify(behavior.out ?? '[]')});`}
`);
	chmodSync(bin, 0o755);
	return { bin, dir, argv: () => JSON.parse(readFileSync(argvPath, 'utf8')) as string[] };
}

test('discoverCodexMcpServers places -C cwd before mcp list --json', async () => {
	const f = fakeCodex({ out: JSON.stringify([{ name: 'insrc', enabled: true }]) });
	const servers = await discoverCodexMcpServers(f.bin, f.dir, 20_000);
	assert.deepEqual(servers, [{ name: 'insrc', enabled: true }]);
	assert.deepEqual(f.argv(), ['-C', f.dir, 'mcp', 'list', '--json']);
});

test('discoverCodexMcpServers reports a server as enabled unless explicitly marked otherwise', async () => {
	const f = fakeCodex({ out: JSON.stringify([{ name: 'insrc', enabled: true }, { name: 'other', enabled: false }, { name: 'bare' }]) });
	const servers = await discoverCodexMcpServers(f.bin, f.dir, 20_000);
	assert.deepEqual(servers, [{ name: 'insrc', enabled: true }, { name: 'other', enabled: false }, { name: 'bare', enabled: true }]);
});

test('discoverCodexMcpServers propagates a plain Error on a non-zero exit', async () => {
	const f = fakeCodex({ fail: 'codex: mcp list failed', code: 2 });
	await assert.rejects(discoverCodexMcpServers(f.bin, f.dir, 20_000), /exited with 2/);
});

test('discoverCodexMcpServers propagates a plain Error on unparseable JSON', async () => {
	const f = fakeCodex({ out: 'not json' });
	await assert.rejects(discoverCodexMcpServers(f.bin, f.dir, 20_000), /unparseable JSON/);
});

test('discoverCodexMcpServers propagates a plain Error when the output is valid JSON but not an array', async () => {
	const f = fakeCodex({ out: JSON.stringify({ not: 'an array' }) });
	await assert.rejects(discoverCodexMcpServers(f.bin, f.dir, 20_000), /did not print a JSON array/);
});

test('discoverCodexMcpServers propagates on timeout', async () => {
	const f = fakeCodex({ sleepMs: 10_000, out: '[]' });
	await assert.rejects(discoverCodexMcpServers(f.bin, f.dir, 500), /exited with -9/);
});

test('discoverCodexMcpServers propagates on abort', async () => {
	const f = fakeCodex({ sleepMs: 10_000, out: '[]' });
	const controller = new AbortController();
	const call = discoverCodexMcpServers(f.bin, f.dir, 20_000, controller.signal);
	controller.abort();
	await assert.rejects(call, (e: unknown) => e instanceof Error && e.name === 'AbortError');
});
