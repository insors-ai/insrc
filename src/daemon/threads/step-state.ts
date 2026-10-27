import { assertNoSessionPersistence } from '../../shared/connection-persistence.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared step-state store (Epic 86197ac6, Story s1, contract sc2): the MCP
 * step tokens of the four step kinds, held once on the main thread so a
 * session served by a new worker (after an idle release or a failure) resumes
 * its step exactly as today. Workers reach it through the hub.
 *
 * Each kind keeps today's lifecycle: a 100-entry cap evicting the least
 * recently touched, a 1-hour idle TTL swept on every mint, a read that
 * refreshes the expiry, and its own update rule. State is still lost when the
 * daemon restarts. Active operation leases bypass idle TTL/LRU until their
 * fixed owner deadline plus terminal grace. Leased reads never extend that expiry.
 * Payloads are stored as a structured clone, the same copy a
 * worker's payload becomes when it crosses threads.
 */

import { randomBytes } from 'node:crypto';

import { getLogger } from '../../shared/logger.js';
import type { HubClient, HubHandlers } from './channel.js';

const log = getLogger('step-state');

export type StepKind = 'analyze' | 'workflow' | 'review' | 'code-review';
export const STEP_KINDS: readonly StepKind[] = ['analyze', 'workflow', 'review', 'code-review'];

export interface StepStateEntry<P> {
	readonly token: string;
	readonly kind: StepKind;
	readonly payload: P;
	readonly touchedAt: number;
}

export interface StepLifecycle {
	/** analyze and workflow rotate; review keeps its token; code-review consumes and mints per stage. */
	readonly update: 'rotate-token' | 'stable-token' | 'consume-per-stage';
	readonly maxEntries: number;
	readonly ttlMs: number;
	/** A read refreshes touchedAt, as today. */
	readonly readRefreshes: true;
}

export interface SharedStepStateStore {
	lifecycle(kind: StepKind): StepLifecycle;
	mint<P>(kind: StepKind, payload: P, pinnedUntil?: number): Promise<string>;
	read<P>(kind: StepKind, token: string): Promise<StepStateEntry<P> | undefined>;
	/**
	 * Returns the token to use next: the same one for a stable-token kind (whose
	 * token must exist), a new one otherwise (the old one, if any, is released).
	 */
	update<P>(kind: StepKind, token: string | undefined, payload: P): Promise<string>;
	acquireTransition(kind: StepKind, token: string, owner: string): Promise<boolean>;
	releaseTransition(kind: StepKind, token: string, owner: string): Promise<void>;
	compareReplace<P>(kind: StepKind, token: string, revision: number, payload: P): Promise<boolean>;
	pin(kind: StepKind, token: string, until: number): Promise<void>;
	release(kind: StepKind, token: string): Promise<void>;
	/** ONLY for tests. */
	clearForTests(kind: StepKind): Promise<void>;
	/** ONLY for tests. */
	sizeForTests(kind: StepKind): Promise<number>;
}

const LIFECYCLES: Readonly<Record<StepKind, StepLifecycle>> = {
	'analyze':     { update: 'rotate-token',      maxEntries: 100, ttlMs: 60 * 60 * 1_000, readRefreshes: true },
	'workflow':    { update: 'rotate-token',      maxEntries: 100, ttlMs: 60 * 60 * 1_000, readRefreshes: true },
	'review':      { update: 'stable-token',      maxEntries: 100, ttlMs: 60 * 60 * 1_000, readRefreshes: true },
	'code-review': { update: 'consume-per-stage', maxEntries: 100, ttlMs: 60 * 60 * 1_000, readRefreshes: true },
};

export class StepStateNotFound extends Error {
	constructor(readonly kind: StepKind, readonly token: string) {
		super(`${kind} state token '${token}' not found`);
		this.name = 'StepStateNotFound';
	}
}

interface TransitionLock { readonly owner: string; readonly token: string; readonly until: number; readonly done: Promise<void>; readonly release: () => void; timer?: ReturnType<typeof setTimeout> | undefined; }
interface Entry { payload: unknown; readonly createdAt: number; touchedAt: number; pinnedUntil?: number | undefined; }

function mintToken(): string {
	return randomBytes(16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** The store itself; lives on the main thread. */
export class LocalStepStateStore implements SharedStepStateStore {
	private readonly stores = new Map<StepKind, Map<string, Entry>>(STEP_KINDS.map(k => [k, new Map()]));
 private readonly transitions = new Map<string, TransitionLock>();
 private transitionKey(kind: StepKind, token: string): string {
  const payload = this.map(kind).get(token)?.payload as { kind?: unknown; fingerprint?: { repoPath?: unknown; epicHash?: unknown; storyId?: unknown } } | undefined;
  if (kind === 'code-review' && payload?.kind === 'controller-pipeline' && payload.fingerprint !== undefined) return JSON.stringify([kind, payload.fingerprint.repoPath, payload.fingerprint.epicHash, String(payload.fingerprint.storyId).toLowerCase().replace(/^s0+/, 's')]);
  return JSON.stringify([kind, token]);
 }
 private unlock(key: string, lock: TransitionLock): void {
  if (this.transitions.get(key) !== lock) return;
  if (lock.timer !== undefined) clearTimeout(lock.timer);
  this.transitions.delete(key); lock.release();
 }
 private expireTransition(kind: StepKind, token: string): void {
  const key = this.transitionKey(kind, token), lock = this.transitions.get(key);
  if (lock?.token === token) this.unlock(key, lock);
 }
 async acquireTransition(kind: StepKind, token: string, owner: string): Promise<boolean> {
  assertNoSessionPersistence();
  const waitUntil = this.now() + 180_000;
  for (;;) {
   const entry = this.map(kind).get(token);
   if (entry === undefined || (entry.pinnedUntil !== undefined && this.now() >= entry.pinnedUntil)) return false;
   const key = this.transitionKey(kind, token), prior = this.transitions.get(key);
   if (prior === undefined || this.now() >= prior.until) {
    if (prior !== undefined) this.unlock(key, prior);
    let release!: () => void;
    const lock: TransitionLock = { owner, token, until: entry.pinnedUntil ?? (entry.touchedAt + LIFECYCLES[kind].ttlMs), done: new Promise<void>(resolve => { release = resolve; }), release: () => release() };
    this.transitions.set(key, lock);
    const arm = (): void => { const left = lock.until - this.now(); if (left <= 0) { this.unlock(key, lock); return; } lock.timer = setTimeout(arm, Math.min(left, 2_147_483_647)); lock.timer.unref(); };
    arm(); return true;
   }
   if (prior.owner === owner && prior.token === token) return true;
   const remaining = waitUntil - this.now(); if (remaining <= 0) return false;
   let timer: ReturnType<typeof setTimeout> | undefined;
   const released = await Promise.race([prior.done.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), remaining); timer.unref(); })]);
   if (timer !== undefined) clearTimeout(timer);
   if (!released) return false;
  }
 }
 async releaseTransition(kind: StepKind, token: string, owner: string): Promise<void> {
  assertNoSessionPersistence();
  const key = this.transitionKey(kind, token), lock = this.transitions.get(key);
  if (lock?.owner === owner && lock.token === token) this.unlock(key, lock);
 }

	constructor(private readonly now: () => number = Date.now) {}

	lifecycle(kind: StepKind): StepLifecycle { return LIFECYCLES[kind]; }

	async mint<P>(kind: StepKind, payload: P, pinnedUntil?: number): Promise<string> {
		assertNoSessionPersistence(); return this.mintSync(kind, payload, pinnedUntil);
	}

	async read<P>(kind: StepKind, token: string): Promise<StepStateEntry<P> | undefined> {
		assertNoSessionPersistence();
		const entry = this.map(kind).get(token);
		if (entry === undefined) return undefined;
		if (entry.pinnedUntil !== undefined && this.now() >= entry.pinnedUntil) { this.expireTransition(kind, token); this.map(kind).delete(token); return undefined; }
		entry.touchedAt = this.now();
		return { token, kind, payload: entry.payload as P, touchedAt: entry.touchedAt };
	}

	async update<P>(kind: StepKind, token: string | undefined, payload: P): Promise<string> {
		assertNoSessionPersistence();
		if (LIFECYCLES[kind].update === 'stable-token') {
			const entry = token === undefined ? undefined : this.map(kind).get(token);
			if (entry === undefined || token === undefined) throw new StepStateNotFound(kind, token ?? '');
			entry.payload = structuredClone(payload);
			entry.touchedAt = this.now();
			return token;
		}
		const next = this.mintSync(kind, payload);
		if (token !== undefined && token !== next) this.map(kind).delete(token);
		return next;
	}

	async compareReplace<P>(kind: StepKind, token: string, revision: number, payload: P): Promise<boolean> {
  assertNoSessionPersistence();
  const entry = this.map(kind).get(token);
  if (entry === undefined || (entry.pinnedUntil !== undefined && this.now() >= entry.pinnedUntil) || (entry.payload as { revision?: unknown } | null)?.revision !== revision) return false;
  entry.payload = structuredClone(payload); entry.touchedAt = this.now(); return true;
 }
	async pin(kind: StepKind, token: string, until: number): Promise<void> {
  assertNoSessionPersistence();
  if (!Number.isSafeInteger(until) || until < 0) throw new Error('Invalid step-state lease');
  const entry = this.map(kind).get(token);
  if (entry === undefined) throw new StepStateNotFound(kind, token);
  entry.pinnedUntil = until;
 }
	async release(kind: StepKind, token: string): Promise<void> {
		assertNoSessionPersistence(); this.expireTransition(kind, token); this.map(kind).delete(token);
	}
	async clearForTests(kind: StepKind): Promise<void> {
		assertNoSessionPersistence(); for (const token of this.map(kind).keys()) this.expireTransition(kind, token); this.map(kind).clear();
	}
	async sizeForTests(kind: StepKind): Promise<number> {
		assertNoSessionPersistence(); return this.map(kind).size;
	}

	private map(kind: StepKind): Map<string, Entry> {
		const m = this.stores.get(kind);
		if (m === undefined) throw new Error(`unknown step kind '${String(kind)}'`);
		return m;
	}

	private mintSync(kind: StepKind, payload: unknown, pinnedUntil?: number): string {
  if (pinnedUntil !== undefined && (!Number.isSafeInteger(pinnedUntil) || pinnedUntil < this.now())) throw new Error('Invalid initial step-state lease');
		const store = this.map(kind);
		const { maxEntries, ttlMs } = LIFECYCLES[kind];
		const now = this.now();
		for (const [k, v] of store) if (v.pinnedUntil !== undefined ? now >= v.pinnedUntil : now - v.touchedAt > ttlMs) { this.expireTransition(kind, k); store.delete(k); }
		if (store.size >= maxEntries) {
			const oldest = [...store.entries()].filter(([, entry]) => entry.pinnedUntil === undefined).sort((a, b) => a[1].touchedAt - b[1].touchedAt);
			while (store.size >= maxEntries && oldest.length > 0) { const key = oldest.shift()![0]; this.expireTransition(kind, key); store.delete(key); }
		}
		const token = mintToken();
		store.set(token, { payload: structuredClone(payload), createdAt: now, touchedAt: now, ...(pinnedUntil !== undefined ? { pinnedUntil } : {}) });
		if (store.size >= maxEntries / 2) log.warn({ kind, size: store.size, cap: maxEntries }, 'step-state store: entries approaching cap');
		return token;
	}
}

// ---------------------------------------------------------------------------
// Hub bindings
// ---------------------------------------------------------------------------

/** The main thread's hub services for the step-state store. */
export function stepStateHubHandlers(store: SharedStepStateStore): HubHandlers {
	type A = { kind: StepKind; token?: string; payload?: unknown; until?: number; revision?: number; owner?: string };
	return {
		'step.mint':    a => store.mint((a as A).kind, (a as A).payload, (a as A).until),
		'step.read':    a => store.read((a as A).kind, (a as A).token!),
		'step.update':  a => store.update((a as A).kind, (a as A).token, (a as A).payload),
		'step.acquireTransition': a => store.acquireTransition((a as A).kind, (a as A).token!, (a as A).owner!),
		'step.releaseTransition': a => store.releaseTransition((a as A).kind, (a as A).token!, (a as A).owner!),
		'step.compareReplace': a => store.compareReplace((a as A).kind, (a as A).token!, (a as A).revision!, (a as A).payload),
		'step.pin': a => store.pin((a as A).kind, (a as A).token!, (a as A).until!),
		'step.release': a => store.release((a as A).kind, (a as A).token!),
		'step.clear':   a => store.clearForTests((a as A).kind),
		'step.size':    a => store.sizeForTests((a as A).kind),
	};
}

/** A worker's view of the step-state store, one hub request per call. */
export class HubStepStateStore implements SharedStepStateStore {
	constructor(private readonly hub: HubClient) {}
	lifecycle(kind: StepKind): StepLifecycle { return LIFECYCLES[kind]; }
	mint<P>(kind: StepKind, payload: P, pinnedUntil?: number): Promise<string> {
		assertNoSessionPersistence(); return this.hub.request('step.mint', { kind, payload, until: pinnedUntil });
	}
	read<P>(kind: StepKind, token: string): Promise<StepStateEntry<P> | undefined> {
		assertNoSessionPersistence(); return this.hub.request('step.read', { kind, token });
	}
	update<P>(kind: StepKind, token: string | undefined, payload: P): Promise<string> {
		assertNoSessionPersistence(); return this.hub.request('step.update', { kind, token, payload });
	}
	acquireTransition(kind: StepKind, token: string, owner: string): Promise<boolean> {
  assertNoSessionPersistence(); return this.hub.request('step.acquireTransition', { kind, token, owner });
 }
 releaseTransition(kind: StepKind, token: string, owner: string): Promise<void> {
  assertNoSessionPersistence(); return this.hub.request('step.releaseTransition', { kind, token, owner });
 }
	compareReplace<P>(kind: StepKind, token: string, revision: number, payload: P): Promise<boolean> {
  assertNoSessionPersistence(); return this.hub.request('step.compareReplace', { kind, token, revision, payload });
 }
	pin(kind: StepKind, token: string, until: number): Promise<void> {
  assertNoSessionPersistence(); return this.hub.request('step.pin', { kind, token, until });
 }
	release(kind: StepKind, token: string): Promise<void> {
		assertNoSessionPersistence(); return this.hub.request('step.release', { kind, token });
	}
	clearForTests(kind: StepKind): Promise<void> {
		assertNoSessionPersistence(); return this.hub.request('step.clear', { kind });
	}
	sizeForTests(kind: StepKind): Promise<number> {
		assertNoSessionPersistence(); return this.hub.request('step.size', { kind });
	}
}

// ---------------------------------------------------------------------------
// Process singleton
// ---------------------------------------------------------------------------

let _store: SharedStepStateStore | null = null;

/** This thread's step-state store: the local one on the main thread, a hub client in a worker once installed. */
export function getStepStateStore(): SharedStepStateStore {
	if (_store === null) _store = new LocalStepStateStore();
	return _store;
}

/** Use `store` as this thread's step-state store (a worker installs a HubStepStateStore). */
export function installStepStateStore(store: SharedStepStateStore): void {
	_store = store;
}
