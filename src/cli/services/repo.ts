/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repo service — register / unregister / reindex repositories through
 * the daemon IPC. Extracted from the former `cli/commands/repo.ts`.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { rpc } from '../client.js';
import type { McpClientOutcome, RegisteredRepo, SteeringSelection } from '../../shared/types.js';

/** Expand a leading `~` / `~/` to the user's home dir, then resolve to an
 *  absolute path. The TUI command bar has no shell to expand `~`, so a typed
 *  `~/projects/x` would otherwise `resolve()` to `<cwd>/~/projects/x` and fail.
 *  Bare relative paths (`.`, `../x`) are handled by `resolve()` as before. */
export function toAbsPath(path: string): string {
	const expanded = path === '~'
		? homedir()
		: path.startsWith('~/')
			? join(homedir(), path.slice(2))
			: path;
	return resolve(expanded);
}

export function listRepos(): Promise<RegisteredRepo[]> {
	return rpc<RegisteredRepo[]>('repo.list');
}

/** Outcome of an `addRepo` call: the registered absolute path, plus the
 *  per-client MCP-registration outcomes when a steering selection triggered
 *  registration (absent otherwise, mirroring the daemon's conditional field). */
export interface AddRepoResult {
	readonly path: string;
	readonly mcp?: readonly McpClientOutcome[];
}

/** Register `path` for indexing. Resolves it against cwd and rejects
 *  if it does not exist (mirrors the old command's guard). `steering`
 *  (per-file CLAUDE.md / AGENTS.md selection) is threaded to the daemon, which
 *  applies the steering-block injection AND registers the insrc MCP for each
 *  approved client; omit it to do neither. Returns the registered path + any
 *  per-client MCP outcomes. */
export async function addRepo(path: string, steering?: SteeringSelection): Promise<AddRepoResult> {
	const abs = toAbsPath(path);
	if (!existsSync(abs)) {
		throw new Error(`path does not exist: ${abs}`);
	}
	const res = await rpc<{ ok: true; mcp?: { clients: McpClientOutcome[] } }>(
		'repo.add', { path: abs, ...(steering !== undefined ? { steering } : {}) },
	);
	return { path: abs, ...(res.mcp !== undefined ? { mcp: res.mcp.clients } : {}) };
}

/** Compact one-line summary of MCP-registration outcomes for a toast /
 *  command reply — omits unselected ('skipped') clients; '' when there is
 *  nothing worth reporting. E.g. "claude registered, codex failed (codex CLI
 *  not found on PATH)". */
export function formatMcpOutcome(clients: readonly McpClientOutcome[] | undefined): string {
	if (clients === undefined) return '';
	return clients
		.filter(c => c.action !== 'skipped')
		.map(c => `${c.client} ${c.action}${c.note !== undefined && c.note !== '' ? ` (${c.note})` : ''}`)
		.join(', ');
}

export async function removeRepo(path: string): Promise<string> {
	const abs = toAbsPath(path);
	await rpc('repo.remove', { path: abs });
	return abs;
}

export async function reindexRepo(path: string): Promise<string> {
	const abs = toAbsPath(path);
	await rpc('repo.reindex', { path: abs });
	return abs;
}
