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
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getLogger } from '../shared/logger.js';
import { moveInlineListToTables } from '../shared/toml-inline-list.js';
import type { McpClient, McpClientOutcome, SteeringSelection } from '../shared/types.js';
import { readSteeringBlock, upsertMarkedSection } from './steering-inject.js';

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
	/** vibe project-layer cleanup seams (ISSUE-767aef145a1b22ef): read the repo's
	 *  own .vibe/config.toml (undefined when absent/unreadable), rewrite it
	 *  without a legacy insrc entry, and delete it when nothing remains. */
	readonly vibeProjectConfigText?: (repoPath: string) => string | undefined;
	readonly writeVibeProjectConfig?: (repoPath: string, text: string) => void;
	readonly removeVibeProjectConfig?: (repoPath: string) => void;
	/** vibe user-level AGENTS.md seams (LLD-866873cab2dedcc7): the vibe home dir,
	 *  read of $VIBE_HOME|~/.vibe/AGENTS.md (undefined when absent/unreadable), its
	 *  write, and the steering block text. */
	readonly vibeHome?: () => string;
	readonly vibeAgentsMdText?: () => string | undefined;
	readonly writeVibeAgentsMd?: (text: string) => void;
	readonly steeringBlockText?: () => string;
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

/** vibe's home dir: $VIBE_HOME, else ~/.vibe. */
function defaultVibeHome(): string {
	return process.env['VIBE_HOME'] ?? join(homedir(), '.vibe');
}

/** $VIBE_HOME|~/.vibe/AGENTS.md text, or undefined when absent/unreadable. */
function defaultVibeAgentsMdText(home: string): string | undefined {
	try { return readFileSync(join(home, 'AGENTS.md'), 'utf8'); }
	catch { return undefined; }
}

// ---------------------------------------------------------------------------
// vibe project-layer cleanup (<repo>/.vibe/config.toml)
// ---------------------------------------------------------------------------
// ISSUE-767aef145a1b22ef: the insrc server is registered ONLY in vibe's
// user-global config ($VIBE_HOME|~/.vibe/config.toml) — the same destination
// `vibe mcp add` uses. The entrypoint path (daemonInstallRoot()/out/bin/
// insrc-mcp.js) is machine-global, so a project-local copy can never be valid
// on any other machine, and a repo-committed .vibe/config.toml would hold a
// dead path everywhere else. Older builds DID write the project layer, so
// registering a repo's vibe client also removes any legacy insrc entry left in
// the repo's own .vibe/config.toml — best-effort and never failing the
// registration (the same convention as the AGENTS.md steering upsert).

/** The project-layer vibe config path for a repo. */
export function vibeProjectConfigPath(repoPath: string): string {
	return join(repoPath, '.vibe', 'config.toml');
}

function defaultVibeProjectConfigText(repoPath: string): string | undefined {
	try { return readFileSync(vibeProjectConfigPath(repoPath), 'utf8'); }
	catch { return undefined; }
}

/**
 * Remove a legacy insrc [[mcp_servers]] entry from the repo's own
 * .vibe/config.toml. Returns 'absent' when the file has no such entry (or
 * cannot be read), 'removed' after rewriting the file without it — deleting
 * the file when nothing but the entry remains. An inline `mcp_servers` list
 * is first moved to tables, because TOML cannot hold both forms. IO errors,
 * and a config that cannot be brought to a valid form, propagate — the caller
 * guards and never fails the MCP registration on a cleanup write.
 */
export function removeVibeProjectServer(
	repoPath: string,
	deps: McpRegisterDeps = {},
): 'absent' | 'removed' {
	const readText = deps.vibeProjectConfigText ?? defaultVibeProjectConfigText;
	const found = readText(repoPath);
	if (found === undefined) return 'absent';
	const text = moveInlineListToTables(found, 'mcp_servers');
	if (!vibeConfigHasServer(text, 'insrc')) return 'absent';
	const chunks = text.split(/^\[\[/m);
	const nameLine = new RegExp(`^\\s*(?:name|"name"|'name')\\s*=\\s*["']insrc["']`, 'm');
	// A table header of ANY kind (single [t] or double [[t]]): the insrc entry's
	// own fields end at the next one — the name match must not read past it
	// (a `name = "insrc"` inside a later table belongs to that table, not to
	// the mcp_servers entry), and whatever follows inside the chunk is an
	// unrelated table that must survive the removal.
	const anyHeader = /^[ \t]*\[\[?[ \t]*[^\]\n#]+?[ \t]*\]\]?[ \t]*(?:#.*)?\r?$/m;
	let cleaned = '';
	chunks.forEach((chunk, i) => {
		if (i === 0) { cleaned += chunk; return; }
		const nextHeader = chunk.search(anyHeader);
		const fields = nextHeader > 0 ? chunk.slice(0, nextHeader) : chunk;
		if (!(chunk.startsWith('mcp_servers]]') && nameLine.test(fields))) {
			cleaned += '[[' + chunk;
			return;
		}
		// An insrc [[mcp_servers]] chunk: drop only the entry's own fields,
		// keeping any unrelated table that follows it in the same chunk.
		if (nextHeader > 0) cleaned += chunk.slice(nextHeader);
	});
	if (cleaned === text) return 'absent'; // the name matched only inside a later table — no entry removed
	if (cleaned.trim() === '') {
		const removeFile = deps.removeVibeProjectConfig ?? ((p: string) => rmSync(vibeProjectConfigPath(p)));
		removeFile(repoPath);
		return 'removed';
	}
	const writeText = deps.writeVibeProjectConfig ?? ((p: string, t: string) => writeFileSync(vibeProjectConfigPath(p), t, 'utf8'));
	writeText(repoPath, cleaned);
	return 'removed';
}

/** Does vibe's config.toml text already declare an [[mcp_servers]] table named
 *  `name`? Heuristic on the TOML text — the same line-anchored spirit as
 *  alreadyRegistered: each `[[...]]` chunk must start with `mcp_servers]]` and
 *  carry a `name = "..."` line for the server. */
/**
 * LLD-866873cab2dedcc7 — when vibe is registered, also ensure the user-level
 * ~/.vibe/AGENTS.md carries the insrc steering block, so the agent follows a
 * project's insrc:steering block when one is present. Reuses the repo-side
 * writer's pure marked-section upsert (steering-inject.ts): create the file when
 * absent, replace ONLY the insrc:steering-marked span when present (so future
 * releases change the block content in place via the shipped
 * prompts/steering-block.md asset), append when the file has no markers, and
 * NEVER clobber on malformed or duplicate markers (guarded no-op — the same
 * 'never guess, never clobber' convention as repo.add's inject). Returns
 * 'unchanged' | 'updated'. IO errors propagate — the caller guards and never
 * fails the MCP registration on a steering write.
 */
export function upsertVibeAgentsSteering(deps: McpRegisterDeps = {}): 'unchanged' | 'updated' {
	const home = deps.vibeHome ?? defaultVibeHome;
	const readText = deps.vibeAgentsMdText ?? (() => defaultVibeAgentsMdText(home()));
	const writeText = deps.writeVibeAgentsMd ?? ((t: string) => writeFileSync(join(home(), 'AGENTS.md'), t, 'utf8'));
	const block = deps.steeringBlockText ?? readSteeringBlock;
	const res = upsertMarkedSection(readText() ?? null, block());
	if (res.content === null) {
		if (res.note !== undefined) log.warn({ note: res.note }, 'vibe AGENTS.md steering: guarded no-op');
		return 'unchanged';
	}
	writeText(res.content);
	return 'updated';
}

export function vibeConfigHasServer(configText: string, name: string): boolean {
	const chunks = configText.split(/^\[\[/m);
	const nameLine = new RegExp(`^\\s*(?:name|"name"|'name')\\s*=\\s*["']${name}["']`, 'm');
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
 * `--version` + the user-global config.toml scan for vibe). Never throws — an
 * unanswerable/unreachable client resolves to available:false. Used by the
 * `mcp.status` IPC so a settings UI can show what is already registered.
 * `repoPath` is accepted for the mcp.status IPC payload shape but no longer
 * read: the project layer stopped declaring the insrc server
 * (ISSUE-767aef145a1b22ef) and legacy entries are removed at registration.
 */
export async function probeMcpClients(deps: McpRegisterDeps = {}, _repoPath?: string): Promise<{ clients: McpProbeResult[] }> {
	const run = deps.run ?? runCli;
	const vibeConfigText = deps.vibeConfigText ?? defaultVibeConfigText;
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
				// registered = an [[mcp_servers]] insrc table in its USER-GLOBAL
				// config.toml — the same pre-check registration itself uses
				// (ISSUE-767aef145a1b22ef: the project layer no longer declares
				// the server; legacy entries are removed at registration).
				const version = await run(p.bin, ['--version']);
				if (version.spawnError !== undefined || version.code !== 0) {
					out.push({ client: p.client, available: false, registered: false });
					continue;
				}
				const text = vibeConfigText();
				out.push({ client: p.client, available: true, registered: text !== undefined && vibeConfigHasServer(text, 'insrc') });
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
		// LLD-866873cab2dedcc7: registering vibe also upserts the insrc steering block
		// into the user-level ~/.vibe/AGENTS.md (idempotent, marker-delimited; future
		// releases replace the marked span). Never fails the registration.
		if (p.client === 'vibe') {
			try {
				const steering = upsertVibeAgentsSteering(deps);
				if (steering === 'updated') log.info('vibe AGENTS.md steering block upserted');
			} catch (err) {
				log.warn({ err: err instanceof Error ? err.message : String(err) }, 'vibe AGENTS.md steering upsert failed (registration unaffected)');
			}
			// ISSUE-767aef145a1b22ef: registration is user-global only, so also
			// remove any legacy project-layer insrc entry an older build wrote
			// into the repo's own .vibe/config.toml (a machine-specific absolute
			// path that is dead on every other machine). Best-effort — a cleanup
			// failure never fails the registration.
			if (repoPath !== undefined) {
				try {
					const cleaned = removeVibeProjectServer(repoPath, deps);
					if (cleaned === 'removed') log.info({ repoPath }, 'removed a legacy project-layer insrc entry from .vibe/config.toml');
				} catch (err) {
					log.warn({ err: err instanceof Error ? err.message : String(err) }, 'vibe project-layer insrc cleanup failed (registration unaffected)');
				}
			}
		}
		// Idempotency pre-check: `<cli> mcp list` where the CLI has one, else
		// (vibe) vibe's user-global config.toml.
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
