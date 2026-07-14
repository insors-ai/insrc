/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * shell:cwd -- get or set a session-scoped working directory.
 *
 * Other shell / git / file tools accept an explicit `cwd` input. This
 * tool persists a default cwd per session so the caller can set it
 * once and stop repeating it. Individual tool calls still win --
 * shell:cwd is a session-level default, not a lock.
 *
 * Cleanup-scrubbed: keys on `deps.sessionId` (the flat string id) instead
 * of the prior rich agent Session object. Same semantics; the storage
 * just maps `sessionId -> cwd` now.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';

export interface ShellCwdData {
	cwd: string;
	/** True when a session-scoped override is active. */
	sessionScoped: boolean;
}

// Per-session cwd overrides keyed by session id. Sessions are few (one
// per chat) and short-lived; the daemon's process lifetime bounds the
// map size in practice. Entries are removed by `clearSessionCwd` when
// the session is dropped; otherwise they age out with the daemon.
const sessionCwd = new Map<string, string>();

export function getSessionCwd(sessionId: string | undefined): string {
	if (sessionId !== undefined && sessionCwd.has(sessionId)) {
		return sessionCwd.get(sessionId)!;
	}
	return process.cwd();
}

export function clearSessionCwd(sessionId: string): void {
	sessionCwd.delete(sessionId);
}

export const shellCwdTool: Tool = {
	id: 'shell_cwd',
	description: 'Get or set the session-scoped working directory. op=get is read-only; op=set updates the session default.',
	inputSchema: {
		type: 'object',
		properties: {
			op: { type: 'string', enum: ['get', 'set'], description: 'Default: get.' },
			path: { type: 'string', description: 'For op=set: the new cwd (absolute or relative to current).' },
		},
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const op = typeof input['op'] === 'string' ? input['op'] : 'get';
		const sessionId = deps.sessionId;

		if (op === 'set') {
			const raw = typeof input['path'] === 'string' ? input['path'] : '';
			if (!raw) { return { output: '[shell:cwd] set requires path', format: 'text', success: false, error: 'missing path' }; }
			const target = resolve(raw);
			if (!existsSync(target)) { return { output: `[shell:cwd] ${target} does not exist`, format: 'text', success: false, error: 'enoent' }; }
			if (!statSync(target).isDirectory()) { return { output: `[shell:cwd] ${target} is not a directory`, format: 'text', success: false, error: 'not a dir' }; }
			if (!sessionId) {
				return { output: `[shell:cwd] no session attached -- cwd changes are session-scoped and can't persist here`, format: 'text', success: false, error: 'no session' };
			}
			sessionCwd.set(sessionId, target);
			const data: ShellCwdData = { cwd: target, sessionScoped: true };
			return { output: `Session cwd -> \`${target}\`.`, format: 'markdown', success: true, data };
		}

		// get
		const cwd = getSessionCwd(sessionId);
		const scoped = !!(sessionId && sessionCwd.has(sessionId));
		const data: ShellCwdData = { cwd, sessionScoped: scoped };
		return {
			output: scoped
				? `Session cwd (override): \`${cwd}\``
				: `Daemon cwd (no session override): \`${cwd}\``,
			format: 'markdown',
			success: true,
			data,
		};
	},
};
