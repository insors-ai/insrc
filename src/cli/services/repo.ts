/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repo service — register / unregister / reindex repositories through
 * the daemon IPC. Extracted from the former `cli/commands/repo.ts`.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { rpc } from '../client.js';
import type { McpClientOutcome, RegisteredRepo, SteeringSelection } from '../../shared/types.js';

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
	const abs = resolve(path);
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
	const abs = resolve(path);
	await rpc('repo.remove', { path: abs });
	return abs;
}

export async function reindexRepo(path: string): Promise<string> {
	const abs = resolve(path);
	await rpc('repo.reindex', { path: abs });
	return abs;
}
