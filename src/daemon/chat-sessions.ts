/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Chat session pool -- generic transport for daemon-hosted chat sessions.
 *
 * Scrubbed during the cleanup from a 447-line agent-coupled pool down to
 * a minimal session registry. Each session is a tiny `ChatSession` shell
 * (id + repoPath). Idle sessions are evicted after 30 minutes; the most
 * recently touched session is protected from idle eviction so the IDE
 * doesn't lose state under the user's cursor.
 *
 * No agent state, no context manager, no channel/abortController, no
 * injected-message queue, no file/PDF caches. The next backend
 * (Ollama-with-tools) attaches its own per-session state in a sibling
 * registry without modifying this file.
 */

import { randomUUID } from 'node:crypto';

import { ChatSession } from './session.js';
import { getDb } from '../db/client.js';
import { getSessionById, saveSession } from '../db/conversations.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('chat-sessions');

const IDLE_TIMEOUT_MS    = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000;     // check every minute


export interface ActiveSession {
	id:              string;
	session:         ChatSession;
	createdAt:       number;
	lastActivityAt:  number;
}

export interface SessionInfo {
	id:           string;
	repo:         string;
	idleSeconds:  number;
}


// ---------------------------------------------------------------------------
// Session Pool
// ---------------------------------------------------------------------------

export class ChatSessionPool {
	private readonly sessions = new Map<string, ActiveSession>();
	private cleanupTimer: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.cleanupTimer = setInterval(() => this.cleanupIdle(), CLEANUP_INTERVAL_MS);
	}

	async create(repoPath: string): Promise<string> {
		const sessionId = randomUUID();
		const session = new ChatSession({ id: sessionId, repoPath });

		try {
			const db = await getDb();
			await saveSession(db, {
				id:      sessionId,
				repo:    repoPath,
				summary: '',
				agent:   'chat',
				status:  'active',
			});
		} catch (err) {
			log.error({ err, sessionId }, 'failed to persist session row on create');
		}

		const active: ActiveSession = {
			id:             sessionId,
			session,
			createdAt:      Date.now(),
			lastActivityAt: Date.now(),
		};
		this.sessions.set(sessionId, active);
		log.info({ sessionId, repo: repoPath }, 'chat session created');
		return sessionId;
	}

	async restore(sessionId: string): Promise<string | null> {
		if (this.sessions.has(sessionId)) {
			return sessionId;
		}
		const db = await getDb();
		const sessionRecord = await getSessionById(db, sessionId);
		if (sessionRecord === null) {
			log.warn({ sessionId }, 'session not found in DB for restore');
			return null;
		}
		const session = new ChatSession({ id: sessionId, repoPath: sessionRecord.repo });
		const active: ActiveSession = {
			id:             sessionId,
			session,
			createdAt:      Date.now(),
			lastActivityAt: Date.now(),
		};
		this.sessions.set(sessionId, active);
		log.info({ sessionId, repo: sessionRecord.repo }, 'chat session restored from DB');
		return sessionId;
	}

	get(sessionId: string): ActiveSession | undefined {
		const s = this.sessions.get(sessionId);
		if (s) s.lastActivityAt = Date.now();
		return s;
	}

	drop(sessionId: string): void {
		if (!this.sessions.delete(sessionId)) return;
		log.info({ sessionId }, 'chat session dropped');
	}

	async close(sessionId: string): Promise<boolean> {
		const s = this.sessions.get(sessionId);
		if (!s) return false;
		try { await s.session.close(); }
		catch (err) { log.warn({ sessionId, error: String(err) }, 'error closing session'); }
		this.sessions.delete(sessionId);
		log.info({ sessionId }, 'chat session closed');
		return true;
	}

	list(): SessionInfo[] {
		const now = Date.now();
		const result: SessionInfo[] = [];
		for (const s of this.sessions.values()) {
			result.push({
				id:          s.id,
				repo:        s.session.repoPath,
				idleSeconds: Math.floor((now - s.lastActivityAt) / 1000),
			});
		}
		return result;
	}

	status(sessionId: string): SessionInfo | null {
		const s = this.sessions.get(sessionId);
		if (!s) return null;
		return {
			id:          s.id,
			repo:        s.session.repoPath,
			idleSeconds: Math.floor((Date.now() - s.lastActivityAt) / 1000),
		};
	}

	/**
	 * Periodic idle cleanup. Most recently touched session is protected
	 * (never closed regardless of idle duration); all others past
	 * `IDLE_TIMEOUT_MS` are closed normally.
	 */
	private cleanupIdle(): void {
		const now = Date.now();
		let mostRecentlyTouchedId: string | null = null;
		let mostRecentTs = -Infinity;
		for (const [id, s] of this.sessions) {
			if (s.lastActivityAt > mostRecentTs) {
				mostRecentTs = s.lastActivityAt;
				mostRecentlyTouchedId = id;
			}
		}
		for (const [id, s] of this.sessions) {
			if (id === mostRecentlyTouchedId) continue;
			if ((now - s.lastActivityAt) <= IDLE_TIMEOUT_MS) continue;
			log.info({ sessionId: id, idleMinutes: Math.floor((now - s.lastActivityAt) / 60000) }, 'closing idle session');
			void this.close(id);
		}
	}

	async dispose(): Promise<void> {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
		for (const id of this.sessions.keys()) {
			await this.close(id);
		}
	}
}
