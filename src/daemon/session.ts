/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ChatSession -- minimal generic session shell.
 *
 * Replaces the rich `agent/session.js` Session class (context manager,
 * provider resolver, L2/L3a/L3b memory layers, access store + audit) after
 * the cleanup. Carries only the fields the surviving transport layer needs:
 *
 *   - id           -- stable session identifier
 *   - repoPath     -- workspace root for this session
 *   - createdAt    -- session creation timestamp
 *
 * Lifecycle hooks are no-ops at the daemon level. The future
 * Ollama-with-tools backend will hang its own state off the session (or
 * a wrapper struct alongside) without modifying this class -- keep it
 * deliberately tiny so it doesn't accumulate.
 */

export interface ChatSessionOpts {
	readonly id:       string;
	readonly repoPath: string;
}

export class ChatSession {
	readonly id:       string;
	readonly repoPath: string;
	readonly createdAt: number = Date.now();

	constructor(opts: ChatSessionOpts) {
		this.id       = opts.id;
		this.repoPath = opts.repoPath;
	}

	/** No-op. Reserved for the next backend's per-session teardown. */
	async close(): Promise<void> {
		/* intentionally empty */
	}
}
