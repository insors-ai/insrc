/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Chat RPC handlers -- transport surface only.
 *
 * Scrubbed during the cleanup from a 3,536-line agent-orchestration file
 * down to the 7 RPCs the IDE chat panel needs to manage session lifecycle:
 *
 *   chat.start   -- create a new session for a repo
 *   chat.cancel  -- abort an in-flight request (no-op after cleanup; no
 *                   agent runs to abort, but the surface is reserved for
 *                   the next backend's request lifecycle)
 *   chat.inject  -- inject a message mid-pipeline (no-op after cleanup)
 *   chat.close   -- close a session
 *   chat.list    -- list active sessions
 *   chat.status  -- one session's status
 *   chat.restore -- reattach an old session from DB
 *
 * The agent-flow streaming surface (chat.send, chat.resume*, handoff.run,
 * meta-task.run, gate.request-permission) returns `backend offline` via
 * the inline stubs in daemon/index.ts -- those bind to no implementation
 * here.
 */

import type { RpcHandler } from './server.js';
import { ChatSessionPool } from './chat-sessions.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('chat');


// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let sessionPool: ChatSessionPool | null = null;


export function initChatHandlers(): void {
	sessionPool = new ChatSessionPool();
}


/**
 * Hot-reload hook. No-op after the cleanup -- no per-session provider
 * state survives that would need refreshing. Kept so daemon/index.ts
 * doesn't have to special-case the lifecycle wiring.
 */
export async function reloadChatConfig(): Promise<number> {
	return 0;
}


export async function disposeChatHandlers(): Promise<void> {
	if (sessionPool) {
		await sessionPool.dispose();
		sessionPool = null;
	}
}


function getPool(): ChatSessionPool {
	if (!sessionPool) throw new Error('chat handlers not initialized');
	return sessionPool;
}


// ---------------------------------------------------------------------------
// RPC handlers
// ---------------------------------------------------------------------------

export const chatStart: RpcHandler = async (params) => {
	const { repo } = params as { repo: string };
	if (!repo || typeof repo !== 'string') {
		return { error: 'repo path required' };
	}
	const pool = getPool();
	const sessionId = await pool.create(repo);
	return { sessionId, repo };
};


export const chatCancel: RpcHandler = async (params) => {
	const { sessionId } = params as { sessionId: string };
	const pool = getPool();
	const session = pool.get(sessionId);
	if (!session) return { error: 'session not found' };
	// No-op: no agent runs in this build. Future backend will wire its
	// per-request AbortController here.
	return { ok: true };
};


export const chatInject: RpcHandler = async (params) => {
	const { sessionId } = params as { sessionId: string; message: string };
	const pool = getPool();
	const session = pool.get(sessionId);
	if (!session) return { error: 'session not found' };
	// No-op: nothing in flight to inject into. Reserved for the next backend.
	return { ok: true };
};


export const chatClose: RpcHandler = async (params) => {
	const { sessionId } = params as { sessionId: string };
	const pool = getPool();
	const closed = await pool.close(sessionId);
	return { ok: closed };
};


export const chatList: RpcHandler = async () => {
	const pool = getPool();
	return { sessions: pool.list() };
};


export const chatStatus: RpcHandler = async (params) => {
	const { sessionId } = params as { sessionId: string };
	const pool = getPool();
	const status = pool.status(sessionId);
	if (!status) return { error: 'session not found' };
	return status;
};


export const chatRestore: RpcHandler = async (params) => {
	const { sessionId } = params as { sessionId: string };
	const pool = getPool();
	const restored = await pool.restore(sessionId);
	if (!restored) return { error: 'session not found in DB' };
	const active = pool.get(restored);
	if (!active) return { error: 'session restore inconsistency' };
	return { sessionId: restored, repo: active.session.repoPath };
};


/**
 * Drop a session from the in-memory pool. Called by `purgeSession`
 * (session.delete / session.deleteBulk RPCs) before the DB + Lance
 * delete passes run, so subsequent deletes don't race with a live
 * session touching the same rows.
 */
export function dropSessionFromPool(sessionId: string): void {
	if (!sessionPool) return;
	sessionPool.drop(sessionId);
}


// Compatibility shim. `daemon/access-rpc.ts` and any straggler code that
// still calls `getActiveSession` to thread an access store get an
// "offline" signal; the access surface itself is stubbed in
// daemon/index.ts and the file is deleted in Phase 2.b.
export function getActiveSession(sessionId: string): undefined {
	log.debug({ sessionId }, 'getActiveSession: returning undefined (legacy access surface removed)');
	return undefined;
}
