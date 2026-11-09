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
// vibe project-layer registration (<repo>/.vibe/config.toml)
// ---------------------------------------------------------------------------

test('vibe + repoPath: writes [[mcp_servers]] insrc into the repo\'s own .vibe/config.toml, never spawns `vibe mcp add`, note says restart vibe', async () => {
	const { deps, calls } = stub(() => ok(), () => undefined);
	const writes: { repo: string; text: string }[] = [];
	deps.vibeProjectConfigText = () => undefined;
	deps.ensureVibeProjectDir = () => {};
	deps.writeVibeProjectConfig = (repo, text) => { writes.push({ repo, text }); };
	const r = await registerMcpClients(ROOT, { vibe: true }, deps, '/repo/a');
	const v = byClient(r, 'vibe');
	assert.equal(v.action, 'registered');
	assert.match(v.note ?? '', /\.vibe\/config\.toml/);
	assert.match(v.note ?? '', /restart vibe/);
	assert.equal(writes.length, 1);
	assert.equal(writes[0]!.repo, '/repo/a');
	assert.match(writes[0]!.text, /\[\[mcp_servers\]\]\nname = "insrc"\ntransport = "stdio"\ncommand = "node"/);
	assert.match(writes[0]!.text, /"\/opt\/insrc\/daemon\/out\/bin\/insrc-mcp\.js"/);
	assert.ok(!calls.some(c => c.bin === 'vibe' && isAdd(c.args)), 'no user-global `vibe mcp add` when a repo path is given');
});

test('vibe + repoPath: existing project entry → unchanged, nothing written; existing unrelated content is preserved on write', async () => {
	const { deps } = stub(() => ok(), () => undefined);
	deps.vibeProjectConfigText = () => '[[mcp_servers]]\nname = "insrc"\ncommand = "node"\n';
	let wrote = 0;
	deps.writeVibeProjectConfig = () => { wrote++; };
	const r = await registerMcpClients(ROOT, { vibe: true }, deps, '/repo/a');
	assert.equal(byClient(r, 'vibe').action, 'unchanged');
	assert.equal(wrote, 0, 'idempotent: no rewrite when the project file already has insrc');

	// When absent, the write appends after existing content (TOML-safe: new
	// array-of-tables header at EOF) and keeps the existing text.
	const { deps: deps2 } = stub(() => ok(), () => undefined);
	deps2.vibeProjectConfigText = () => '[tools]\nfoo = 1\n';
	deps2.ensureVibeProjectDir = () => {};
	const writes2: string[] = [];
	deps2.writeVibeProjectConfig = (_repo, text) => { writes2.push(text); };
	const r2 = await registerMcpClients(ROOT, { vibe: true }, deps2, '/repo/b');
	assert.equal(byClient(r2, 'vibe').action, 'registered');
	assert.ok(writes2[0]!.startsWith('[tools]\nfoo = 1\n'), 'existing content preserved');
	assert.match(writes2[0]!, /\[tools\]\nfoo = 1\n\n\[\[mcp_servers\]\]/);
});

test('vibe without repoPath keeps the user-global `vibe mcp add` path (unchanged behavior)', async () => {
	const { deps, calls } = stub(() => ok(), () => undefined);
	const r = await registerMcpClients(ROOT, { vibe: true }, deps);
	assert.equal(byClient(r, 'vibe').action, 'registered');
	assert.ok(calls.some(c => c.bin === 'vibe' && isAdd(c.args)), 'user-global add still runs without a repo path');
});

test('probeMcpClients with a repoPath counts the repo\'s project .vibe/config.toml as registered for vibe', async () => {
	const { probeMcpClients } = await import('../mcp-register.js');
	const run = async (_bin: string, _args: readonly string[]) => ok('vibe 1.0');
	const deps: McpRegisterDeps = {
		run,
		vibeConfigText: () => undefined, // user-global does NOT have it
		vibeProjectConfigText: (repo) => (repo === '/repo/a' ? '[[mcp_servers]]\nname = "insrc"\n' : undefined),
	};
	const withRepo = await probeMcpClients(deps, '/repo/a');
	assert.equal(withRepo.clients.find(c => c.client === 'vibe')!.registered, true, 'project-layer entry counts');
	const withoutRepo = await probeMcpClients(deps, '/repo/b');
	assert.equal(withoutRepo.clients.find(c => c.client === 'vibe')!.registered, false, 'other repo without the entry stays unregistered');
	const noPath = await probeMcpClients(deps);
	assert.equal(noPath.clients.find(c => c.client === 'vibe')!.registered, false, 'no path → user-global only');
});

test('upsertVibeProjectServer on a real temp dir: creates .vibe/config.toml, idempotent, valid entry', async () => {
	const { mkdtempSync, readFileSync, existsSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { upsertVibeProjectServer, vibeProjectConfigPath, vibeConfigHasServer: has } = await import('../mcp-register.js');
	const repo = mkdtempSync(join(tmpdir(), 'insrc-vibe-proj-'));
	assert.equal(upsertVibeProjectServer(repo, '/x/insrc-mcp.js'), 'registered');
	const cfg = vibeProjectConfigPath(repo);
	assert.ok(existsSync(cfg));
	const text = readFileSync(cfg, 'utf8');
	assert.ok(has(text, 'insrc'));
	assert.match(text, /args = \[\n {4}"\/x\/insrc-mcp\.js",\n\]/);
	assert.equal(upsertVibeProjectServer(repo, '/x/insrc-mcp.js'), 'unchanged', 'second call is a no-op');
});

test('upsertVibeProjectServer moves an inline mcp_servers list to tables, keeping its servers', async () => {
	const { upsertVibeProjectServer, vibeServerTomlBlock } = await import('../mcp-register.js');
	const files = new Map([['/r', 'theme = "x"\nmcp_servers = [\n    { name = "docs", command = "d" },\n]\n']]);
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), ensureVibeProjectDir: () => {}, writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); } };
	assert.equal(upsertVibeProjectServer('/r', '/x/m.js', deps), 'registered');
	assert.equal(files.get('/r'), 'theme = "x"\n\n[[mcp_servers]]\nname = "docs"\ncommand = "d"\n' + vibeServerTomlBlock('/x/m.js'));
	assert.equal(upsertVibeProjectServer('/r', '/x/m.js', deps), 'unchanged', 'second call is a no-op');
});

test('upsertVibeProjectServer removes an empty inline list before adding the server', async () => {
	const { upsertVibeProjectServer, vibeServerTomlBlock } = await import('../mcp-register.js');
	const files = new Map([['/r', 'mcp_servers = []\ntheme = "x"\n']]);
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), ensureVibeProjectDir: () => {}, writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); } };
	assert.equal(upsertVibeProjectServer('/r', '/x/m.js', deps), 'registered');
	assert.equal(files.get('/r'), 'theme = "x"\n' + vibeServerTomlBlock('/x/m.js'));
});

test('upsertVibeProjectServer repairs a config holding both forms, and adds no second insrc entry', async () => {
	const { upsertVibeProjectServer } = await import('../mcp-register.js');
	const files = new Map([['/r', 'mcp_servers = []\n\n[[mcp_servers]]\nname = "insrc"\n']]);
	const deps = { vibeProjectConfigText: (p: string) => files.get(p), ensureVibeProjectDir: () => {}, writeVibeProjectConfig: (p: string, t: string) => { files.set(p, t); } };
	assert.equal(upsertVibeProjectServer('/r', '/x/m.js', deps), 'registered');
	assert.equal(files.get('/r'), '\n[[mcp_servers]]\nname = "insrc"\n');
	assert.equal(upsertVibeProjectServer('/r', '/x/m.js', deps), 'unchanged');
});

test('upsertVibeProjectServer leaves a config it cannot fix untouched and reports the failure', async () => {
	const { upsertVibeProjectServer } = await import('../mcp-register.js');
	let wrote = false;
	const deps = { vibeProjectConfigText: () => 'mcp_servers = "x"\n', ensureVibeProjectDir: () => {}, writeVibeProjectConfig: () => { wrote = true; } };
	assert.throws(() => upsertVibeProjectServer('/r', '/x/m.js', deps), /is not a list/);
	assert.equal(wrote, false);
});
