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

import { registerMcpClients, upsertVibeAgentsSteering, vibeConfigHasServer, type McpRegisterDeps } from '../mcp-register.js';
import type { McpClient, McpClientOutcome } from '../../shared/types.js';

const ROOT = '/opt/insrc/daemon';

interface RunResult { code: number; stdout: string; stderr: string; spawnError?: string }

/** A scriptable subprocess stub. `script(bin, args)` returns the canned result;
 *  every call is recorded for spawn-count assertions. vibe's config pre-check
 *  is pinned to "unreadable" unless a test overrides it. */
function stub(script: (bin: string, args: readonly string[]) => RunResult, vibeConfigText?: () => string | undefined): {
	deps: McpRegisterDeps;
	calls: { bin: string; args: string[] }[];
	/** In-memory ~/.vibe/AGENTS.md: current text + every write (LLD-866873cab2dedcc7). */
	agentsMd: { text: string | undefined; writes: string[] };
} {
	const calls: { bin: string; args: string[] }[] = [];
	const agentsMd = { text: undefined as string | undefined, writes: [] as string[] };
	const run = async (bin: string, args: readonly string[]): Promise<RunResult> => {
		calls.push({ bin, args: [...args] });
		return script(bin, args);
	};
	return { deps: {
		run,
		entrypointExists: () => true,
		vibeConfigText: vibeConfigText ?? (() => undefined),
		// AGENTS.md seams stay in memory — tests never touch the real ~/.vibe.
		vibeHome: () => '/fake-vibe-home',
		vibeAgentsMdText: () => agentsMd.text,
		writeVibeAgentsMd: (t: string) => { agentsMd.writes.push(t); agentsMd.text = t; },
		steeringBlockText: () => 'STEERING BLOCK v1',
	}, calls, agentsMd };
}

const isList = (args: readonly string[]): boolean => args[0] === 'mcp' && args[1] === 'list';
const isAdd  = (args: readonly string[]): boolean => args[0] === 'mcp' && args[1] === 'add';
const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
const byClient = (r: { clients: McpClientOutcome[] }, c: McpClient): McpClientOutcome =>
	r.clients.find(x => x.client === c)!;

// ---------------------------------------------------------------------------
// selection gating (ac3, ac5)
// ---------------------------------------------------------------------------

test('unselected clients are always emitted as skipped, never omitted', async () => {
	const { deps, calls } = stub(() => ok());
	const r = await registerMcpClients(ROOT, {}, deps);
	assert.deepEqual(r.clients.map(c => c.client), ['claude', 'codex', 'vibe']);
	assert.equal(byClient(r, 'claude').action, 'skipped');
	assert.equal(byClient(r, 'codex').action, 'skipped');
	assert.equal(byClient(r, 'vibe').action, 'skipped');
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
	assert.equal(byClient(r, 'vibe').action, 'skipped');
	assert.deepEqual(calls.map(c => c.bin), ['codex', 'codex']);
	const add = calls.find(c => isAdd(c.args))!;
	assert.deepEqual(add.args, ['mcp', 'add', 'insrc', '--', 'node', `${ROOT}/out/bin/insrc-mcp.js`]);
});

// ---------------------------------------------------------------------------
// the vibe client (vibe mcp add --transport stdio; config.toml pre-check)
// ---------------------------------------------------------------------------

test('{vibe:true} registers vibe via `vibe mcp add insrc --transport stdio`; no `mcp list` is spawned', async () => {
	const { deps, calls } = stub(() => ok(), () => undefined);
	const r = await registerMcpClients(ROOT, { vibe: true }, deps);
	assert.equal(byClient(r, 'vibe').action, 'registered');
	assert.equal(byClient(r, 'claude').action, 'skipped');
	assert.equal(byClient(r, 'codex').action, 'skipped');
	assert.deepEqual(calls.map(c => c.bin), ['vibe'], 'vibe has no mcp list — only the add runs');
	assert.deepEqual(calls[0]!.args, ['mcp', 'add', 'insrc', '--transport', 'stdio', '--command', 'node', '--arg', `${ROOT}/out/bin/insrc-mcp.js`]);
});

test('vibe already present in config.toml [[mcp_servers]] → unchanged, no add spawned', async () => {
	const config = [
		'active_model = "mistral-medium-3.5"',
		'',
		'[[mcp_servers]]',
		'name = "other"',
		'transport = "stdio"',
		'command = "npx"',
		'',
		'[[mcp_servers]]',
		'name = "insrc"',
		'transport = "stdio"',
		'command = "node"',
		'args = ["/opt/insrc/daemon/out/bin/insrc-mcp.js"]',
		'',
	].join('\n');
	const { deps, calls } = stub(() => ok(), () => config);
	const r = await registerMcpClients(ROOT, { vibe: true }, deps);
	assert.equal(byClient(r, 'vibe').action, 'unchanged');
	assert.equal(calls.filter(c => isAdd(c.args)).length, 0);
});

test('vibe add failure → failed carrying the CLI stderr; other clients unaffected', async () => {
	const { deps } = stub((bin, args) => bin === 'vibe' && isAdd(args)
		? { code: 1, stdout: '', stderr: 'vibe mcp add blew up' }
		: ok(), () => undefined);
	const r = await registerMcpClients(ROOT, { vibe: true, claude: true }, deps);
	assert.equal(byClient(r, 'vibe').action, 'failed');
	assert.match(byClient(r, 'vibe').note ?? '', /blew up/);
	assert.equal(byClient(r, 'claude').action, 'registered');
});

// LLD-866873cab2dedcc7 — the user-level ~/.vibe/AGENTS.md steering upsert on vibe registration.

test('upsertVibeAgentsSteering: creates AGENTS.md with the marked steering block when absent, idempotent on second call', () => {
	let text: string | undefined = undefined;
	const writes: string[] = [];
	const deps: McpRegisterDeps = {
		vibeHome: () => '/fake-home',
		vibeAgentsMdText: () => text,
		writeVibeAgentsMd: (t) => { writes.push(t); text = t; },
		steeringBlockText: () => 'STEERING BLOCK v1',
	};
	assert.equal(upsertVibeAgentsSteering(deps), 'updated');
	assert.equal(writes.length, 1);
	assert.match(text!, /<!-- insrc:steering:start -->\nSTEERING BLOCK v1\n<!-- insrc:steering:end -->/);
	assert.equal(upsertVibeAgentsSteering(deps), 'unchanged', 'second call writes nothing');
	assert.equal(writes.length, 1);
});

test('upsertVibeAgentsSteering: replaces only the marked span on re-registration (future release updates content in place), preserves surrounding user content', () => {
	let text = '# My notes\n\nkeep me\n\n<!-- insrc:steering:start -->\nOLD v0\n<!-- insrc:steering:end -->\n\ntrailing\n';
	const writes: string[] = [];
	const deps: McpRegisterDeps = {
		vibeHome: () => '/fake-home',
		vibeAgentsMdText: () => text,
		writeVibeAgentsMd: (t) => { writes.push(t); text = t; },
		steeringBlockText: () => 'STEERING BLOCK v2',
	};
	assert.equal(upsertVibeAgentsSteering(deps), 'updated');
	assert.equal(writes.length, 1);
	assert.ok(text!.startsWith('# My notes\n\nkeep me\n\n'), 'content before the markers is preserved');
	assert.ok(text!.endsWith('\ntrailing\n'), 'content after the markers is preserved');
	assert.match(text!, /insrc:steering:start -->\nSTEERING BLOCK v2\n/);
	assert.ok(!text!.includes('OLD v0'), 'the old block content is gone');
	assert.equal((text!.match(/insrc:steering:start/g) ?? []).length, 1, 'exactly one marked block');
});

test('upsertVibeAgentsSteering: malformed markers (open without close) are a guarded no-op — file untouched, never clobbered', () => {
	const text = '# notes\n<!-- insrc:steering:start -->\nunrelated text after a stray open\n';
	let written = false;
	const deps: McpRegisterDeps = {
		vibeHome: () => '/fake-home',
		vibeAgentsMdText: () => text,
		writeVibeAgentsMd: () => { written = true; },
		steeringBlockText: () => 'STEERING BLOCK v1',
	};
	assert.equal(upsertVibeAgentsSteering(deps), 'unchanged');
	assert.equal(written, false, 'nothing written on malformed markers');
});

test('registerMcpClients with {vibe:true} also upserts the AGENTS.md steering block (in-memory seam), and registration still succeeds', async () => {
	const { deps, calls, agentsMd } = stub(() => ok());
	const r = await registerMcpClients(ROOT, { vibe: true }, deps);
	assert.equal(byClient(r, 'vibe').action, 'registered');
	assert.equal(agentsMd.writes.length, 1, 'the steering block was written once');
	assert.match(agentsMd.text!, /insrc:steering:start -->\nSTEERING BLOCK v1/);
	assert.deepEqual(calls.map(c => c.bin), ['vibe']);
});

test('vibeConfigHasServer: matches an [[mcp_servers]] name line only, not other tables or values', () => {
	const config = [
		'[other]',
		'name = "insrc"',
		'',
		'[[mcp_servers]]',
		'name = "docs"',
		'url = "https://insrc.example/mcp"',
		'',
		'[mcp_servers.auth]',
		'type = "oauth"',
		'',
		'[[mcp_servers]]',
		"name = 'insrc'",
		'transport = "stdio"',
		'command = "node"',
		'',
	].join('\n');
	assert.equal(vibeConfigHasServer(config, 'insrc'), true, 'single-quoted name in a later table');
	assert.equal(vibeConfigHasServer(config, 'docs'), true);
	assert.equal(vibeConfigHasServer(config, 'missing'), false);
	assert.equal(vibeConfigHasServer('[[mcp_servers]]\nurl = "https://insrc.example"\n', 'insrc'), false, 'insrc in a URL value is not a name');
	assert.equal(vibeConfigHasServer('', 'insrc'), false);
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

// ---------------------------------------------------------------------------
// probeMcpClients (the read-only mcp.status probe)
// ---------------------------------------------------------------------------

import { probeMcpClients } from '../mcp-register.js';

test('probeMcpClients: per-client availability + registration from the same pre-checks registration uses; never throws', async () => {
  const { deps } = stub((bin, args) => {
    if (bin === 'claude' && isList(args)) return ok('insrc: node ... - Connected\n');
    if (bin === 'codex' && isList(args)) return ok('other: node ...\n');
    if (bin === 'vibe' && args[0] === '--version') return ok('vibe 3.0.3\n');
    return ok();
  }, () => '[[mcp_servers]]\nname = "insrc"\ntransport = "stdio"\ncommand = "node"\n');
  const r = await probeMcpClients(deps);
  assert.deepEqual(r.clients, [
    { client: 'claude', available: true, registered: true },
    { client: 'codex', available: true, registered: false },
    { client: 'vibe', available: true, registered: true },
  ]);
});

test('probeMcpClients: an unreachable CLI resolves available:false, registered:false; a vibe without config text is registered:false', async () => {
  const { deps } = stub((bin, args) => {
    if (bin === 'claude') return { code: -1, stdout: '', stderr: '', spawnError: 'spawn claude ENOENT' };
    if (bin === 'codex' && isList(args)) return { code: 2, stdout: '', stderr: 'boom' };
    if (bin === 'vibe') return ok('vibe 3.0.3\n');
    return ok();
  }, () => undefined);
  const r = await probeMcpClients(deps);
  assert.deepEqual(r.clients, [
    { client: 'claude', available: false, registered: false },
    { client: 'codex', available: false, registered: false },
    { client: 'vibe', available: true, registered: false },
  ]);
});

// ---------------------------------------------------------------------------
// vibe registration layer (ISSUE-767aef145a1b22ef): user-global only, plus
// cleanup of legacy project-layer entries (<repo>/.vibe/config.toml)
// ---------------------------------------------------------------------------

test('vibe + repoPath registers in the USER-GLOBAL config via `vibe mcp add`, never writes the repo\'s .vibe/config.toml', async () => {
	const { deps, calls } = stub(() => ok(), () => undefined);
	const writes: string[] = [];
	const removed: string[] = [];
	deps.vibeProjectConfigText = () => undefined;
	deps.writeVibeProjectConfig = () => { writes.push('write'); };
	deps.removeVibeProjectConfig = () => { removed.push('remove'); };
	const r = await registerMcpClients(ROOT, { vibe: true }, deps, '/repo/a');
	assert.equal(byClient(r, 'vibe').action, 'registered');
	const add = calls.find(c => c.bin === 'vibe' && isAdd(c.args));
	assert.ok(add, 'user-global `vibe mcp add` runs even with a repo path');
	assert.deepEqual(add?.args, ['mcp', 'add', 'insrc', '--transport', 'stdio', '--command', 'node', '--arg', `${ROOT}/out/bin/insrc-mcp.js`]);
	assert.equal(writes.length, 0, 'the repo\'s .vibe/config.toml is never written');
	assert.equal(removed.length, 0, 'no project file to delete');
});

test('vibe + repoPath: a legacy project-layer insrc entry is removed; the file is deleted when nothing else remains', async () => {
	const { deps, calls } = stub(() => ok(), () => undefined);
	let projectText = '[[mcp_servers]]\nname = "insrc"\ntransport = "stdio"\ncommand = "node"\nargs = [\n    "/Users/alice/.insrc/daemon/out/bin/insrc-mcp.js",\n]\n';
	const writes: string[] = [];
	const removed: string[] = [];
	deps.vibeProjectConfigText = () => projectText;
	deps.writeVibeProjectConfig = (_repo, text) => { writes.push(text); };
	deps.removeVibeProjectConfig = (repo) => { removed.push(repo); };
	const r = await registerMcpClients(ROOT, { vibe: true }, deps, '/repo/a');
	assert.equal(byClient(r, 'vibe').action, 'registered');
	assert.equal(writes.length, 0, 'nothing to rewrite — the file held only the legacy insrc entry');
	assert.deepEqual(removed, ['/repo/a'], 'the stale machine-specific project config is deleted');
	assert.ok(calls.some(c => c.bin === 'vibe' && isAdd(c.args)), 'global registration still runs');
});

test('vibe + repoPath: a legacy insrc chunk is removed while other servers and settings are preserved', async () => {
	const { deps } = stub(() => ok(), () => undefined);
	const writes: string[] = [];
	const removed: string[] = [];
	deps.vibeProjectConfigText = () => 'theme = "x"\n\n[[mcp_servers]]\nname = "docs"\ncommand = "d"\n\n[[mcp_servers]]\nname = "insrc"\ntransport = "stdio"\ncommand = "node"\nargs = [\n    "/Users/alice/.insrc/daemon/out/bin/insrc-mcp.js",\n]\n';
	deps.writeVibeProjectConfig = (_repo, text) => { writes.push(text); };
	deps.removeVibeProjectConfig = () => { removed.push('remove'); };
	const r = await registerMcpClients(ROOT, { vibe: true }, deps, '/repo/a');
	assert.equal(byClient(r, 'vibe').action, 'registered');
	assert.equal(writes.length, 1);
	assert.equal(writes[0], 'theme = "x"\n\n[[mcp_servers]]\nname = "docs"\ncommand = "d"\n\n');
	assert.ok(!vibeConfigHasServer(writes[0] ?? '', 'insrc'), 'no insrc entry remains');
	assert.equal(removed.length, 0, 'the file keeps the docs server — rewritten, not deleted');
});

test('vibe + repoPath: legacy cleanup runs even when the user-global entry already exists (action unchanged)', async () => {
	const { deps, calls } = stub(() => ok(), () => '[[mcp_servers]]\nname = "insrc"\n');
	const removed: string[] = [];
	deps.vibeProjectConfigText = () => '[[mcp_servers]]\nname = "insrc"\n';
	deps.removeVibeProjectConfig = (repo) => { removed.push(repo); };
	const r = await registerMcpClients(ROOT, { vibe: true }, deps, '/repo/a');
	assert.equal(byClient(r, 'vibe').action, 'unchanged');
	assert.deepEqual(removed, ['/repo/a'], 'the stale project entry is removed even when globally registered');
	assert.ok(!calls.some(c => c.bin === 'vibe' && isAdd(c.args)), 'no duplicate global add');
});

test('vibe + repoPath: a project config without an insrc entry is left untouched', async () => {
	const { deps } = stub(() => ok(), () => undefined);
	let wrote = 0;
	let removed = 0;
	deps.vibeProjectConfigText = () => '[[mcp_servers]]\nname = "docs"\ncommand = "d"\n';
	deps.writeVibeProjectConfig = () => { wrote++; };
	deps.removeVibeProjectConfig = () => { removed++; };
	const r = await registerMcpClients(ROOT, { vibe: true }, deps, '/repo/a');
	assert.equal(byClient(r, 'vibe').action, 'registered');
	assert.equal(wrote, 0);
	assert.equal(removed, 0);
});

test('vibe + repoPath: a cleanup failure never fails the registration', async () => {
	const { deps, calls } = stub(() => ok(), () => undefined);
	deps.vibeProjectConfigText = () => { throw new Error('boom'); };
	const r = await registerMcpClients(ROOT, { vibe: true }, deps, '/repo/a');
	assert.equal(byClient(r, 'vibe').action, 'registered');
	assert.ok(calls.some(c => c.bin === 'vibe' && isAdd(c.args)), 'the global add still ran');
});

test('vibe + repoPath: an unfixable project config (mcp_servers not a list) never fails the registration', async () => {
	const { deps } = stub(() => ok(), () => undefined);
	deps.vibeProjectConfigText = () => 'mcp_servers = "x"\n';
	const r = await registerMcpClients(ROOT, { vibe: true }, deps, '/repo/a');
	assert.equal(byClient(r, 'vibe').action, 'registered');
});

test('vibe without repoPath keeps the user-global `vibe mcp add` path (unchanged behavior)', async () => {
	const { deps, calls } = stub(() => ok(), () => undefined);
	const r = await registerMcpClients(ROOT, { vibe: true }, deps);
	assert.equal(byClient(r, 'vibe').action, 'registered');
	assert.ok(calls.some(c => c.bin === 'vibe' && isAdd(c.args)), 'user-global add still runs without a repo path');
});

test('probeMcpClients reads the USER-GLOBAL config for vibe; a project-layer entry no longer counts (ISSUE-767aef145a1b22ef)', async () => {
	const { probeMcpClients } = await import('../mcp-register.js');
	const run = async (_bin: string, _args: readonly string[]) => ok('vibe 1.0');
	const deps: McpRegisterDeps = {
		run,
		vibeConfigText: () => undefined, // user-global does NOT have it
		vibeProjectConfigText: (repo) => (repo === '/repo/a' ? '[[mcp_servers]]\nname = "insrc"\n' : undefined),
	};
	const withRepo = await probeMcpClients(deps, '/repo/a');
	assert.equal(withRepo.clients.find(c => c.client === 'vibe')!.registered, false, 'a legacy project-layer entry does not count as registered');
	const depsGlobal: McpRegisterDeps = {
		run,
		vibeConfigText: () => '[[mcp_servers]]\nname = "insrc"\n',
	};
	const global = await probeMcpClients(depsGlobal);
	assert.equal(global.clients.find(c => c.client === 'vibe')!.registered, true, 'the user-global entry counts');
});

test('removeVibeProjectServer on a real temp dir: deletes a config that held only the insrc entry; preserves one with more content', async () => {
	const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { removeVibeProjectServer, vibeProjectConfigPath, vibeConfigHasServer: has } = await import('../mcp-register.js');

	const solo = mkdtempSync(join(tmpdir(), 'insrc-vibe-rm-'));
	mkdirSync(join(solo, '.vibe'), { recursive: true });
	writeFileSync(vibeProjectConfigPath(solo), '[[mcp_servers]]\nname = "insrc"\ntransport = "stdio"\ncommand = "node"\nargs = [\n    "/Users/alice/.insrc/daemon/out/bin/insrc-mcp.js",\n]\n', 'utf8');
	assert.equal(removeVibeProjectServer(solo), 'removed');
	assert.ok(!existsSync(vibeProjectConfigPath(solo)), 'the file held only the legacy entry — deleted');

	const shared = mkdtempSync(join(tmpdir(), 'insrc-vibe-rm-'));
	mkdirSync(join(shared, '.vibe'), { recursive: true });
	writeFileSync(vibeProjectConfigPath(shared), 'theme = "x"\n\n[[mcp_servers]]\nname = "insrc"\ncommand = "node"\nargs = ["/mac/path"]\n\n[[mcp_servers]]\nname = "docs"\ncommand = "d"\n', 'utf8');
	assert.equal(removeVibeProjectServer(shared), 'removed');
	const text = readFileSync(vibeProjectConfigPath(shared), 'utf8');
	assert.ok(!has(text, 'insrc'), 'the insrc entry is gone');
	assert.ok(has(text, 'docs'), 'other servers preserved');
	assert.ok(text.startsWith('theme = "x"\n'), 'settings preserved');
	assert.equal(removeVibeProjectServer(shared), 'absent', 'second call is a no-op');

	const none = mkdtempSync(join(tmpdir(), 'insrc-vibe-rm-'));
	assert.equal(removeVibeProjectServer(none), 'absent', 'no .vibe/config.toml → absent, no throw');
});

test('removeVibeProjectServer moves an inline mcp_servers list to tables and drops only the insrc entry', async () => {
	const { removeVibeProjectServer, vibeConfigHasServer: has } = await import('../mcp-register.js');
	const files = new Map([['/r', 'theme = "x"\nmcp_servers = [\n    { name = "docs", command = "d" },\n    { name = "insrc", command = "node" },\n]\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	const text = files.get('/r') ?? '';
	assert.equal(text, 'theme = "x"\n\n[[mcp_servers]]\nname = "docs"\ncommand = "d"\n\n');
	assert.ok(!has(text, 'insrc'), 'the inline insrc entry is removed');
	assert.ok(has(text, 'docs'), 'the inline docs entry survives as a table');
	assert.equal(removed.length, 0);
});

test('removeVibeProjectServer deletes a config whose only content was an inline insrc entry with a quoted name key', async () => {
	const { removeVibeProjectServer } = await import('../mcp-register.js');
	const files = new Map([['/r', 'mcp_servers = [{ "name" = "insrc", command = "node" }]\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	assert.deepEqual(removed, ['/r'], 'quoted-key inline entry removed → nothing remains → file deleted');
});

test('removeVibeProjectServer drops a config holding both forms (empty inline list + insrc table) entirely', async () => {
	const { removeVibeProjectServer } = await import('../mcp-register.js');
	const files = new Map([['/r', 'mcp_servers = []\n\n[[mcp_servers]]\nname = "insrc"\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	assert.deepEqual(removed, ['/r'], 'only the insrc entry remained after normalizing → file deleted');
});

test('removeVibeProjectServer keeps an unrelated single-table section that follows the insrc entry', async () => {
	const { removeVibeProjectServer, vibeConfigHasServer: has } = await import('../mcp-register.js');
	const files = new Map([['/r', '[[mcp_servers]]\nname = "insrc"\ntransport = "stdio"\ncommand = "node"\nargs = ["/mac/path"]\n[tools]\nfoo = 1\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	const text = files.get('/r') ?? '';
	assert.equal(text, '[tools]\nfoo = 1\n', 'the [tools] table after the entry survives, entry fields dropped');
	assert.ok(!has(text, 'insrc'));
	assert.equal(removed.length, 0, 'the file is rewritten, not deleted');
});

test('removeVibeProjectServer keeps later [[mcp_servers]] tables when a single-table section follows the removed entry', async () => {
	const { removeVibeProjectServer, vibeConfigHasServer: has } = await import('../mcp-register.js');
	const files = new Map([['/r', '[[mcp_servers]]\nname = "insrc"\ncommand = "node"\n[tools]\nfoo = 1\n\n[[mcp_servers]]\nname = "docs"\ncommand = "d"\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	const text = files.get('/r') ?? '';
	assert.equal(text, '[tools]\nfoo = 1\n\n[[mcp_servers]]\nname = "docs"\ncommand = "d"\n');
	assert.ok(!has(text, 'insrc'));
	assert.ok(has(text, 'docs'));
	assert.equal(removed.length, 0);
});

test('removeVibeProjectServer does not mistake a `name = "insrc"` field inside a later table for the server entry', async () => {
	const { removeVibeProjectServer, vibeConfigHasServer } = await import('../mcp-register.js');
	const input = '[[mcp_servers]]\nname = "docs"\ncommand = "d"\n[tools]\nname = "insrc"\n';
	// The chunk-level pre-check heuristic does see the name — so removal is
	// attempted — but the name lives in a later [tools] table, not in an
	// mcp_servers entry: nothing may be removed and the file stays untouched.
	const files = new Map([['/r', input]]);
	let wrote = 0;
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (_p: string, t: string) => { wrote++; files.set('/r', t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.ok(vibeConfigHasServer(input, 'insrc'), 'the pre-check heuristic does see the name');
	assert.equal(removeVibeProjectServer('/r', deps), 'absent', 'no insrc mcp_servers entry exists — nothing removed');
	assert.equal(wrote, 0);
	assert.equal(removed.length, 0);
	assert.equal(files.get('/r'), input, 'the config is untouched');
});

test('removeVibeProjectServer drops a real insrc entry even when a later table also carries `name = "insrc"`', async () => {
	const { removeVibeProjectServer, vibeConfigHasServer: has } = await import('../mcp-register.js');
	const files = new Map([['/r', '[[mcp_servers]]\nname = "insrc"\ncommand = "node"\nargs = ["/mac/path"]\n[tools]\nname = "insrc"\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	const text = files.get('/r') ?? '';
	assert.equal(text, '[tools]\nname = "insrc"\n', 'the entry is dropped, the tools table (with its own name field) kept');
	assert.ok(!has(text, 'insrc'));
	assert.equal(removed.length, 0);
});

test('removeVibeProjectServer drops the entry\'s own [mcp_servers.env] sub-table with it, leaving a preceding server intact', async () => {
	const { removeVibeProjectServer, vibeConfigHasServer: has } = await import('../mcp-register.js');
	const files = new Map([['/r', '[[mcp_servers]]\nname = "docs"\ncommand = "d"\n\n[[mcp_servers]]\nname = "insrc"\ncommand = "node"\nargs = ["/mac/path"]\n[mcp_servers.env]\nFOO = "bar"\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	const text = files.get('/r') ?? '';
	assert.equal(text, '[[mcp_servers]]\nname = "docs"\ncommand = "d"\n\n', 'the docs server is intact and the env sub-table went with the insrc entry');
	assert.ok(!has(text, 'insrc'));
	assert.ok(has(text, 'docs'));
	assert.equal(removed.length, 0);
});

test('removeVibeProjectServer keeps an unrelated table between the entry and its sub-table', async () => {
	const { removeVibeProjectServer } = await import('../mcp-register.js');
	const files = new Map([['/r', '[[mcp_servers]]\nname = "insrc"\ncommand = "node"\n[tools]\nfoo = 1\n[mcp_servers.env]\nX = "1"\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	assert.equal(files.get('/r'), '[tools]\nfoo = 1\n', 'the unrelated [tools] table survives; the env sub-table (which still belonged to the removed entry) goes with it');
	assert.equal(removed.length, 0);
});

test('removeVibeProjectServer keeps sub-table-free unrelated tables after a mixed chunk', async () => {
	const { removeVibeProjectServer } = await import('../mcp-register.js');
	const files = new Map([['/r', '[[mcp_servers]]\nname = "insrc"\ncommand = "node"\n[mcp_servers.env]\nX = "1"\n[tools]\nfoo = 1\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	assert.equal(files.get('/r'), '[tools]\nfoo = 1\n');
	assert.equal(removed.length, 0);
});

test('removeVibeProjectServer keeps a quoted root table whose name merely contains a dot', async () => {
	const { removeVibeProjectServer } = await import('../mcp-register.js');
	// ["mcp_servers.env"] is ONE root component named `mcp_servers.env` — an
	// unrelated table, NOT the removed entry's sub-table.
	const files = new Map([['/r', '[[mcp_servers]]\nname = "insrc"\ncommand = "node"\nargs = ["/mac/path"]\n["mcp_servers.env"]\nfoo = 1\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	assert.equal(files.get('/r'), '["mcp_servers.env"]\nfoo = 1\n', 'the quoted root table survives; the entry is dropped');
	assert.equal(removed.length, 0, 'the file is rewritten, not deleted');
});

test('removeVibeProjectServer drops the entry\'s sub-table when its first component is quoted', async () => {
	const { removeVibeProjectServer } = await import('../mcp-register.js');
	// ["mcp_servers".env] IS the two-component sub-table form — it belongs to
	// the removed entry and goes with it.
	const files = new Map([['/r', '[[mcp_servers]]\nname = "insrc"\ncommand = "node"\n["mcp_servers".env]\nX = "1"\n']]);
	const removed: string[] = [];
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); }, removeVibeProjectConfig: (p: string) => { removed.push(p); } };
	assert.equal(removeVibeProjectServer('/r', deps), 'removed');
	assert.deepEqual(removed, ['/r'], 'the file held only the entry and its quoted sub-table — deleted');
});

test('removeVibeProjectServer leaves a config it cannot normalize untouched and reports the failure', async () => {
	const { removeVibeProjectServer } = await import('../mcp-register.js');
	let wrote = false;
	const deps = { vibeProjectConfigText: () => 'mcp_servers = "x"\n', writeVibeProjectConfig: () => { wrote = true; } };
	assert.throws(() => removeVibeProjectServer('/r', deps), /is not a list/);
	assert.equal(wrote, false);
});
