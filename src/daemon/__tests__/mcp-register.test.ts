/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for registerMcpClients (LLD S001) — programmatic MCP-client
 * registration on repo.add. The claude/codex subprocess seam + entrypoint
 * check are dependency-injected, so no real CLI / build is needed.
 *
 * Run: npx tsx --test src/daemon/__tests__/mcp-register.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { registerMcpClients, type McpRegisterDeps } from '../mcp-register.js';
import type { McpClientOutcome } from '../../shared/types.js';

const ROOT = '/opt/insrc/daemon';

interface RunResult { code: number; stdout: string; stderr: string; spawnError?: string }

/** A scriptable subprocess stub. `script(bin, args)` returns the canned result;
 *  every call is recorded for spawn-count assertions. */
function stub(script: (bin: string, args: readonly string[]) => RunResult): {
	deps: McpRegisterDeps;
	calls: { bin: string; args: string[] }[];
} {
	const calls: { bin: string; args: string[] }[] = [];
	const run = async (bin: string, args: readonly string[]): Promise<RunResult> => {
		calls.push({ bin, args: [...args] });
		return script(bin, args);
	};
	return { deps: { run, entrypointExists: () => true }, calls };
}

const isList = (args: readonly string[]): boolean => args[0] === 'mcp' && args[1] === 'list';
const isAdd  = (args: readonly string[]): boolean => args[0] === 'mcp' && args[1] === 'add';
const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
const byClient = (r: { clients: McpClientOutcome[] }, c: 'claude' | 'codex'): McpClientOutcome =>
	r.clients.find(x => x.client === c)!;

// ---------------------------------------------------------------------------
// selection gating (ac3, ac5)
// ---------------------------------------------------------------------------

test('unselected clients are always emitted as skipped, never omitted', async () => {
	const { deps, calls } = stub(() => ok());
	const r = await registerMcpClients(ROOT, {}, deps);
	assert.deepEqual(r.clients.map(c => c.client), ['claude', 'codex']);
	assert.equal(byClient(r, 'claude').action, 'skipped');
	assert.equal(byClient(r, 'codex').action, 'skipped');
	assert.equal(calls.length, 0, 'no subprocess spawned for a fully-unselected selection');
});

test('{claude:true} registers claude (mcp add --scope user); codex is skipped', async () => {
	const { deps, calls } = stub((_bin, args) => (isList(args) ? ok() : ok()));
	const r = await registerMcpClients(ROOT, { claude: true }, deps);
	assert.equal(byClient(r, 'claude').action, 'registered');
	assert.equal(byClient(r, 'codex').action, 'skipped');
	// claude ran list + add; codex ran nothing.
	assert.deepEqual(calls.map(c => c.bin), ['claude', 'claude']);
	const add = calls.find(c => isAdd(c.args))!;
	assert.deepEqual(add.args, ['mcp', 'add', 'insrc', '--scope', 'user', '--', 'node', `${ROOT}/out/bin/insrc-mcp.js`]);
});

test('{agents:true} maps to the codex client (agents flag → codex, --scope omitted)', async () => {
	const { deps, calls } = stub(() => ok());
	const r = await registerMcpClients(ROOT, { agents: true }, deps);
	assert.equal(byClient(r, 'codex').action, 'registered');
	assert.equal(byClient(r, 'claude').action, 'skipped');
	assert.deepEqual(calls.map(c => c.bin), ['codex', 'codex']);
	const add = calls.find(c => isAdd(c.args))!;
	assert.deepEqual(add.args, ['mcp', 'add', 'insrc', '--', 'node', `${ROOT}/out/bin/insrc-mcp.js`]);
});

// ---------------------------------------------------------------------------
// idempotency (ac4)
// ---------------------------------------------------------------------------

test('an existing `insrc` entry in `mcp list` → unchanged, no add spawned', async () => {
	const { deps, calls } = stub((_bin, args) =>
		isList(args) ? ok('insrc: node /opt/insrc/daemon/out/bin/insrc-mcp.js - Connected\n') : ok());
	const r = await registerMcpClients(ROOT, { claude: true, agents: true }, deps);
	assert.equal(byClient(r, 'claude').action, 'unchanged');
	assert.equal(byClient(r, 'codex').action, 'unchanged');
	assert.equal(calls.filter(c => isAdd(c.args)).length, 0, 'no mcp add when already registered');
});

test('an `insrc` substring only inside a path (not a line-start name) does NOT count as registered', async () => {
	// A different server whose command path contains ".insrc" must not false-match.
	const { deps, calls } = stub((_bin, args) =>
		isList(args) ? ok('other: node /Users/x/.insrc/out/bin/insrc-mcp.js - Connected\n') : ok());
	const r = await registerMcpClients(ROOT, { claude: true }, deps);
	assert.equal(byClient(r, 'claude').action, 'registered', 'proceeds to add — the path match is not the server name');
	assert.equal(calls.filter(c => isAdd(c.args)).length, 1);
});

test('an indeterminate `mcp list` (non-zero exit) → failed, and deliberately does NOT add', async () => {
	const { deps, calls } = stub((_bin, args) =>
		isList(args) ? { code: 2, stdout: '', stderr: 'boom' } : ok());
	const r = await registerMcpClients(ROOT, { claude: true }, deps);
	const claude = byClient(r, 'claude');
	assert.equal(claude.action, 'failed');
	assert.match(claude.note ?? '', /could not verify existing registration/);
	assert.equal(calls.filter(c => isAdd(c.args)).length, 0, 'no blind add on indeterminate state');
});

// ---------------------------------------------------------------------------
// failures (ac1) + per-client isolation (ac2)
// ---------------------------------------------------------------------------

test('a missing CLI binary (ENOENT spawn) → failed with a not-found note, no throw', async () => {
	const { deps } = stub((_bin, args) =>
		isList(args) ? { code: -1, stdout: '', stderr: '', spawnError: 'spawn claude ENOENT' } : ok());
	const r = await registerMcpClients(ROOT, { claude: true }, deps);
	const claude = byClient(r, 'claude');
	assert.equal(claude.action, 'failed');
	assert.match(claude.note ?? '', /claude CLI not found on PATH/);
});

test('a non-zero `mcp add` exit → failed carrying the CLI stderr', async () => {
	const { deps } = stub((_bin, args) =>
		isList(args) ? ok() : { code: 1, stdout: '', stderr: 'MCP server insrc already exists in scope' });
	const r = await registerMcpClients(ROOT, { claude: true }, deps);
	const claude = byClient(r, 'claude');
	assert.equal(claude.action, 'failed');
	assert.match(claude.note ?? '', /already exists in scope/);
});

test('per-client isolation: claude add fails, codex still registers independently', async () => {
	const { deps } = stub((bin, args) => {
		if (isList(args)) return ok();
		return bin === 'claude'
			? { code: 1, stdout: '', stderr: 'claude add blew up' }
			: ok();
	});
	const r = await registerMcpClients(ROOT, { claude: true, agents: true }, deps);
	assert.equal(byClient(r, 'claude').action, 'failed');
	assert.equal(byClient(r, 'codex').action, 'registered');
});

test('mixed idempotency: claude already present, codex absent → unchanged + registered', async () => {
	const { deps } = stub((bin, args) => {
		if (isList(args)) return bin === 'claude' ? ok('insrc: node ... - Connected\n') : ok();
		return ok();
	});
	const r = await registerMcpClients(ROOT, { claude: true, agents: true }, deps);
	assert.equal(byClient(r, 'claude').action, 'unchanged');
	assert.equal(byClient(r, 'codex').action, 'registered');
});

// ---------------------------------------------------------------------------
// entrypoint existence (ac7)
// ---------------------------------------------------------------------------

test('a missing out/bin/insrc-mcp.js → failed for each selected client, no subprocess', async () => {
	const calls: unknown[] = [];
	const deps: McpRegisterDeps = {
		entrypointExists: () => false,
		run: async (bin, args) => { calls.push({ bin, args }); return ok(); },
	};
	const r = await registerMcpClients(ROOT, { claude: true, agents: true }, deps);
	for (const c of ['claude', 'codex'] as const) {
		assert.equal(byClient(r, c).action, 'failed');
		assert.match(byClient(r, c).note ?? '', /MCP entrypoint missing at .*insrc-mcp\.js/);
	}
	assert.equal(calls.length, 0, 'no list/add spawned when the entrypoint is absent');
});

test('registerMcpClients never rejects even if the injected run throws', async () => {
	const deps: McpRegisterDeps = {
		entrypointExists: () => true,
		run: async () => { throw new Error('unexpected'); },
	};
	const r = await registerMcpClients(ROOT, { claude: true }, deps);
	assert.equal(byClient(r, 'claude').action, 'failed');
	assert.match(byClient(r, 'claude').note ?? '', /unexpected/);
});
