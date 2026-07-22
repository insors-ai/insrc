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
import type { RegisteredRepo, SteeringSelection } from '../../shared/types.js';

export function listRepos(): Promise<RegisteredRepo[]> {
	return rpc<RegisteredRepo[]>('repo.list');
}

/** Register `path` for indexing. Resolves it against cwd and rejects
 *  if it does not exist (mirrors the old command's guard). Returns the
 *  absolute path that was registered. `steering` (per-file CLAUDE.md /
 *  AGENTS.md selection) is threaded to the daemon, which applies the
 *  steering-block injection; omit it to install nothing. */
export async function addRepo(path: string, steering?: SteeringSelection): Promise<string> {
	const abs = resolve(path);
	if (!existsSync(abs)) {
		throw new Error(`path does not exist: ${abs}`);
	}
	await rpc('repo.add', { path: abs, ...(steering !== undefined ? { steering } : {}) });
	return abs;
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
