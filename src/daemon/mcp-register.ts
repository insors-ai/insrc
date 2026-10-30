/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Programmatic MCP-client registration — the sibling of steering-inject (LLD S001).
 *
 * When a repo is added and the user approves injecting the steering block for a
 * client (SteeringSelection.claude / .agents), the daemon ALSO registers the
 * insrc MCP server for that client so the tools work without a manual
 * `claude mcp add`. Registration is `--scope user` / global (repo-independent,
 * only gated by the selection) and idempotent — a `<cli> mcp list` pre-check
 * skips a client that already has an `insrc` entry.
 *
 * Best-effort + per-client isolated, mirroring injectSteeringBlock: a failure
 * for one client is recorded on that client's outcome and NEVER thrown — MCP
 * registration must never fail the repo add. Emits one outcome per client
 * (claude, codex, vibe); an unselected client is 'skipped', not omitted.
 *
 * vibe has no `vibe mcp list`, so its idempotency pre-check reads vibe's user
 * config.toml ($VIBE_HOME/config.toml) and looks for an [[mcp_servers]] table
 * named `insrc`; registration is `vibe mcp add insrc --transport stdio
 * --command node --arg <insrc-mcp.js>`.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getLogger } from '../shared/logger.js';
import type { McpClient, McpClientOutcome, SteeringSelection } from '../shared/types.js';

const log = getLogger('daemon:mcp-register');

/**
 * Daemon install root — the directory containing `out/bin/insrc-mcp.js`.
 * Derived from this module's own location the same way steering-inject locates
 * its shipped asset (`import.meta.url`): `out/daemon/mcp-register.js` → `..`=out
 * → `..`=install root. Under tsx the src tree mirrors it (`src/daemon` → `src`
 * → repo root). A missing entrypoint is reported per-client, so a dev tree with
 * no build simply yields action 'failed' rather than wiring a dead command.
 */
export function daemonInstallRoot(): string {
	return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** Result of a non-throwing CLI run. `spawnError` is set when the binary
 *  itself could not be launched (e.g. ENOENT — not on PATH). */
interface CliRun {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly spawnError?: string;
}

/** Run a CLI capturing exit code + stdout/stderr, NEVER throwing. Mirrors the
 *  `capture` idiom in cli/services/maintenance.ts. */
function runCli(bin: string, args: readonly string[]): Promise<CliRun> {
	return new Promise(resolve => {
		const child = spawn(bin, args as string[], { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', c => { stdout += c.toString(); });
		child.stderr.on('data', c => { stderr += c.toString(); });
		child.on('error', err => resolve({ code: -1, stdout, stderr, spawnError: err.message }));
		child.on('close', code => resolve({ code: code ?? 0, stdout, stderr }));
	});
}

/** Injectable seams for unit tests (no real CLI / filesystem needed). */
export interface McpRegisterDeps {
	readonly run?: (bin: string, args: readonly string[]) => Promise<CliRun>;
	readonly entrypointExists?: (mcpJs: string) => boolean;
	/** vibe's pre-check seam: the text of vibe's user config.toml, or undefined
	 *  when it cannot be read (default: $VIBE_HOME/config.toml, ~/.vibe fallback). */
	readonly vibeConfigText?: () => string | undefined;
	/** vibe project-layer seams: read the repo's own .vibe/config.toml (undefined
	 *  when absent/unreadable), create the .vibe dir, and write the file. */
	readonly vibeProjectConfigText?: (repoPath: string) => string | undefined;
	readonly ensureVibeProjectDir?: (repoPath: string) => void;
	readonly writeVibeProjectConfig?: (repoPath: string, text: string) => void;
}

/** One client's registration plan. `selected` comes from the SteeringSelection
 *  flag (claude→claude, agents→codex, vibe→vibe); `bin` + `addArgs` are the CLI
 *  shape. `listArgs` is the idempotency pre-check's command; undefined for vibe,
 *  which has no `mcp list` and is pre-checked against its config.toml instead. */
interface ClientPlan {
	readonly client:    McpClient;
	readonly bin:       string;
	readonly selected:  boolean;
	readonly listArgs?: readonly string[] | undefined;
	readonly addArgs:   (mcpJs: string) => string[];
}

/** vibe's user config.toml text, or undefined when unreadable. */
function defaultVibeConfigText(): string | undefined {
	const home = process.env['VIBE_HOME'] ?? join(homedir(), '.vibe');
	try { return readFileSync(join(home, 'config.toml'), 'utf8'); }
	catch { return undefined; }
}

// ---------------------------------------------------------------------------
// vibe PROJECT-layer registration (<repo>/.vibe/config.toml)
// ---------------------------------------------------------------------------
// vibe discovers a project config by walking up from the cwd to a trusted
// `.vibe/config.toml` (core/config/layers/project.py) and merges `mcp_servers`
// across layers BY NAME (WithUnionMerge(merge_key="name")), so a project-level
// `insrc` entry overrides the user-global one without double-spawning. Writing
// the entry into the repo's own .vibe/config.toml therefore makes the repo
// self-contained: anyone opening it gets the insrc MCP on the next vibe start.
// NOTE: vibe reads config once at session start and never hot-reloads MCP
// discovery, so a restart is required — the outcome note says so.

/** The project-layer vibe config path for a repo. */
export function vibeProjectConfigPath(repoPath: string): string {
	return join(repoPath, '.vibe', 'config.toml');
}

/** The `[[mcp_servers]]` block for the insrc server, appended at EOF (always
 *  valid TOML: a new array-of-tables header ends any open table). */
export function vibeServerTomlBlock(mcpJs: string): string {
	return [
		'',
		'[[mcp_servers]]',
		'name = "insrc"',
		'transport = "stdio"',
		'command = "node"',
		'args = [',
		`    ${JSON.stringify(mcpJs)},`,
		']',
		'',
	].join('\n');
}

function defaultVibeProjectConfigText(repoPath: string): string | undefined {
	try { return readFileSync(vibeProjectConfigPath(repoPath), 'utf8'); }
	catch { return undefined; }
}

/**
 * Idempotently ensure the repo's own .vibe/config.toml declares the insrc MCP
 * server. Returns 'unchanged' when the entry is already there, else appends the
 * block and writes (creating .vibe/). IO errors propagate — the caller guards.
 */
export function upsertVibeProjectServer(
	repoPath: string,
	mcpJs: string,
	deps: McpRegisterDeps = {},
): 'unchanged' | 'registered' {
	const readText = deps.vibeProjectConfigText ?? defaultVibeProjectConfigText;
	const text = readText(repoPath);
	if (text !== undefined && vibeConfigHasServer(text, 'insrc')) return 'unchanged';
	const ensureDir = deps.ensureVibeProjectDir ?? ((p: string) => mkdirSync(join(p, '.vibe'), { recursive: true }));
	const writeText = deps.writeVibeProjectConfig ?? ((p: string, t: string) => writeFileSync(vibeProjectConfigPath(p), t, 'utf8'));
	ensureDir(repoPath);
	const base = text === undefined || text.trim() === '' ? '' : text.endsWith('\n') ? text : text + '\n';
	writeText(repoPath, base + vibeServerTomlBlock(mcpJs));
	return 'registered';
}

/** Does vibe's config.toml text already declare an [[mcp_servers]] table named
 *  `name`? Heuristic on the TOML text — the same line-anchored spirit as
 *  alreadyRegistered: each `[[...]]` chunk must start with `mcp_servers]]` and
 *  carry a `name = "..."` line for the server. */
export function vibeConfigHasServer(configText: string, name: string): boolean {
	const chunks = configText.split(/^\[\[/m);
	const nameLine = new RegExp(`^\\s*name\\s*=\\s*["']${name}["']`, 'm');
	return chunks.some(c => c.startsWith('mcp_servers]]') && nameLine.test(c));
}

/** Heuristic: does `<cli> mcp list` stdout already list an `insrc` server?
 *  Both `claude` and `codex` print the server name at the start of a line
 *  (`insrc: …`). Anchored to a line start so a path that merely contains
 *  "insrc" (e.g. the command path) does not false-match. Validated against the
 *  real CLIs by the gated live test. */
function alreadyRegistered(stdout: string): boolean {
	return /^\s*insrc\b/m.test(stdout);
}

/** The registration plans of every known client (selection applied by the caller). */
function clientPlans(): ClientPlan[] {
	return [
		{ client: 'claude', bin: 'claude', selected: false, listArgs: ['mcp', 'list'], addArgs: js => ['mcp', 'add', 'insrc', '--scope', 'user', '--', 'node', js] },
		{ client: 'codex',  bin: 'codex',  selected: false, listArgs: ['mcp', 'list'], addArgs: js => ['mcp', 'add', 'insrc', '--', 'node', js] },
		{ client: 'vibe',   bin: 'vibe',   selected: false, addArgs: js => ['mcp', 'add', 'insrc', '--transport', 'stdio', '--command', 'node', '--arg', js] },
	];
}

/**
 * Register the insrc MCP for each client whose steering block the user
 * approved. Returns one outcome per client; never throws for a per-client
 * failure. `installRoot` is the daemon install root (see daemonInstallRoot).
 */
export async function registerMcpClients(
	installRoot: string,
	selection: SteeringSelection,
	deps: McpRegisterDeps = {},
	repoPath?: string,
): Promise<{ clients: McpClientOutcome[] }> {
	const run = deps.run ?? runCli;
	const entrypointExists = deps.entrypointExists ?? existsSync;
	const vibeConfigText = deps.vibeConfigText ?? defaultVibeConfigText;
	const mcpJs = join(installRoot, 'out', 'bin', 'insrc-mcp.js');

	const plans = clientPlans().map(p => ({
		...p,
		selected: p.client === 'claude' ? selection.claude === true : p.client === 'codex' ? selection.agents === true : selection.vibe === true,
	}));

	const clients: McpClientOutcome[] = [];
	for (const p of plans) {
		if (!p.selected) { clients.push({ client: p.client, action: 'skipped' }); continue; }
		clients.push(await registerOne(p, mcpJs, run, entrypointExists, vibeConfigText, repoPath, deps));
	}
	return { clients };
}

// ---------------------------------------------------------------------------
// read-only registration probe (mcp.status)
// ---------------------------------------------------------------------------

/** One client's registration state: `available` = the CLI is on PATH and
 *  answerable; `registered` = the insrc server is already in its MCP config. */
export interface McpProbeResult {
	readonly client: McpClient;
	readonly available: boolean;
	readonly registered: boolean;
}

/**
 * Probe every known client's registration state WITHOUT writing anything: the
 * same pre-check registration itself uses (`<cli> mcp list` for claude/codex,
 * `--version` + the config.toml scan for vibe). Never throws — an
 * unanswerable/unreachable client resolves to available:false. Used by the
 * `mcp.status` IPC so a settings UI can show what is already registered.
 */
export async function probeMcpClients(deps: McpRegisterDeps = {}, repoPath?: string): Promise<{ clients: McpProbeResult[] }> {
	const run = deps.run ?? runCli;
	const vibeConfigText = deps.vibeConfigText ?? defaultVibeConfigText;
	const vibeProjectConfigText = deps.vibeProjectConfigText ?? defaultVibeProjectConfigText;
	const out: McpProbeResult[] = [];
	for (const p of clientPlans()) {
		try {
			if (p.listArgs !== undefined) {
				const list = await run(p.bin, p.listArgs);
				if (list.spawnError !== undefined || list.code !== 0) {
					out.push({ client: p.client, available: false, registered: false });
					continue;
				}
				out.push({ client: p.client, available: true, registered: alreadyRegistered(list.stdout) });
			} else {
				// vibe: no `mcp list`; availability = the binary answers --version,
				// registered = an [[mcp_servers]] insrc table in its config.toml —
				// the user-global one OR the repo's own project-layer .vibe/config.toml.
				const version = await run(p.bin, ['--version']);
				if (version.spawnError !== undefined || version.code !== 0) {
					out.push({ client: p.client, available: false, registered: false });
					continue;
				}
				const text = vibeConfigText();
				const projectText = repoPath !== undefined ? vibeProjectConfigText(repoPath) : undefined;
				const registered =
					(text !== undefined && vibeConfigHasServer(text, 'insrc')) ||
					(projectText !== undefined && vibeConfigHasServer(projectText, 'insrc'));
				out.push({ client: p.client, available: true, registered });
			}
		} catch {
			out.push({ client: p.client, available: false, registered: false });
		}
	}
	return { clients: out };
}

async function registerOne(
	p: ClientPlan,
	mcpJs: string,
	run: (bin: string, args: readonly string[]) => Promise<CliRun>,
	entrypointExists: (mcpJs: string) => boolean,
	vibeConfigText: () => string | undefined,
	repoPath?: string,
	deps: McpRegisterDeps = {},
): Promise<McpClientOutcome> {
	try {
		if (!entrypointExists(mcpJs)) {
			return { client: p.client, action: 'failed', note: `MCP entrypoint missing at ${mcpJs}` };
		}
		// Idempotency pre-check: `<cli> mcp list` where the CLI has one, else
		// (vibe) vibe's config.toml — the repo's own project-layer file when a
		// repoPath is given, else the user-global one.
		if (p.listArgs !== undefined) {
			const list = await run(p.bin, p.listArgs);
			if (list.spawnError !== undefined) {
				return { client: p.client, action: 'failed', note: `${p.bin} CLI not found on PATH` };
			}
			if (list.code !== 0) {
				// Cannot verify current state → do NOT blind-add (avoid a duplicate).
				return { client: p.client, action: 'failed', note: 'could not verify existing registration' };
			}
			if (alreadyRegistered(list.stdout)) {
				return { client: p.client, action: 'unchanged' };
			}
		} else if (repoPath !== undefined) {
			// vibe + repo: write the entry into the repo's OWN .vibe/config.toml
			// (project layer; vibe discovers it by walking up from the cwd and
			// merges mcp_servers by name, so it overrides — never duplicates —
			// the user-global entry). Idempotent within that file.
			const outcome = upsertVibeProjectServer(repoPath, mcpJs, deps);
			if (outcome === 'unchanged') return { client: p.client, action: 'unchanged' };
			return {
				client: p.client,
				action: 'registered',
				note: `project config .vibe/config.toml — restart vibe (in this repo) to load the MCP server; config is read once at session start`,
			};
		} else {
			const text = vibeConfigText();
			if (text !== undefined && vibeConfigHasServer(text, 'insrc')) {
				return { client: p.client, action: 'unchanged' };
			}
		}
		// The vibe binary's presence is checked by the add itself (spawnError).
		// Register.
		const add = await run(p.bin, p.addArgs(mcpJs));
		if (add.spawnError !== undefined) {
			return { client: p.client, action: 'failed', note: `${p.bin} CLI not found on PATH` };
		}
		if (add.code !== 0) {
			const detail = (add.stderr || add.stdout).trim().slice(0, 400);
			return { client: p.client, action: 'failed', note: detail !== '' ? detail : `${p.bin} mcp add exited ${add.code}` };
		}
		return { client: p.client, action: 'registered' };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ client: p.client, err: msg }, 'mcp registration failed for a client (repo add unaffected)');
		return { client: p.client, action: 'failed', note: msg };
	}
}
