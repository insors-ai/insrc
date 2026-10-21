/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Store guard (Epic 86197ac6, Story s1, contract sc1): lets any daemon thread
 * use a store safely. A store whose threading contract is verified is used
 * directly; any other store is used only through a process-wide counting
 * semaphore that lives in one shared-memory block, so every thread sees it.
 *
 * - Waiting is always asynchronous (Atomics.waitAsync), so a waiting thread
 *   keeps serving its other work.
 * - Concurrent requests on one thread queue in arrival order for the permit.
 * - Nesting is refused per async call chain: code running inside a held op
 *   that asks for another guarded store fails at once, so no lock cycle forms.
 * - Every acquisition is recorded (store, thread, id, time), so the main
 *   thread can reclaim the permits of a worker that died holding them.
 *
 * The block also carries one health word per store (0 ok, 1 locks-lost,
 * 2 unhealthy), the slot later Tasks use to share store health across threads.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { threadId as currentThreadId } from 'node:worker_threads';

import { getLogger } from '../shared/logger.js';

const log = getLogger('store-guard');

/** Atomics.waitAsync (Node 16+); the project's TypeScript lib target predates its declaration. */
type WaitAsyncResult = { readonly async: false; readonly value: 'not-equal' | 'timed-out' } | { readonly async: true; readonly value: Promise<'ok' | 'timed-out'> };
const waitAsync = (Atomics as unknown as { waitAsync(typed: Int32Array, index: number, value: number, timeoutMs: number): WaitAsyncResult }).waitAsync;

export type StoreId = 'graph' | 'lance' | 'duckdb';
export const STORE_IDS: readonly StoreId[] = ['graph', 'lance', 'duckdb'];

export interface StoreThreadingPolicy {
	readonly store: StoreId;
	readonly mode: 'direct' | 'guarded';
	/** Why: the verification evidence (test or library contract) behind the mode. */
	readonly basis: string;
	/** Permits a guarded store allows at once. */
	readonly permits?: number | undefined;
}

export interface StoreQuiescence {
	readonly store: StoreId;
	/** How long reclaim waits for a dead worker's native calls before marking the store unhealthy. */
	readonly limitMs: number;
}

export interface StoreGuardOptions {
	/** Fail with StoreLockTimeoutError instead of waiting past this limit. */
	readonly acquireTimeoutMs: number;
	readonly signal?: AbortSignal | undefined;
}

export interface StoreLockHolder {
	readonly store: StoreId;
	readonly threadId: number;
	readonly acquiredAt: number;
}

/** The initial policy table (LLD-86197ac6-s1 §3.5). */
export const DEFAULT_STORE_POLICY: readonly StoreThreadingPolicy[] = [
	{ store: 'graph', mode: 'direct', basis: 'src/db/graph/__tests__/worker-thread-lock.test.ts: a worker thread\'s open, use and release keep the daemon\'s lock; LMDB transactions are safe across threads of one process' },
	{ store: 'lance', mode: 'direct', basis: 'lancedb writes are always consistent; each connection reads with readConsistencyInterval 0 so other threads\' writes are visible' },
	{ store: 'duckdb', mode: 'guarded', permits: 1, basis: 'one in-memory instance per thread with a 2 GB memory limit each; one permit bounds the process to one budget' },
];

/** How long reclaim waits for a dead worker's calls, per store. */
export const DEFAULT_QUIESCENCE_MS = 30_000;

// ---------------------------------------------------------------------------
// Shared block layout (Int32 words, then a Float64 region for times)
// ---------------------------------------------------------------------------

const HOLDER_SLOTS = 256;
const W_ACQ_COUNTER = 0;                                   // next acquisition id
const W_PERMITS     = 1;                                   // + store index: permits free
const W_HEALTH      = W_PERMITS + STORE_IDS.length;        // + store index: 0 ok, 1 locks-lost, 2 unhealthy
const W_HEALTH_BY   = W_HEALTH + STORE_IDS.length;         // + store index: thread that set the health word
const W_HOLDERS     = W_HEALTH_BY + STORE_IDS.length;      // + slot * 3: [store+1, threadId, acquisitionId]
const HOLDER_WORDS  = 3;
const INT_WORDS     = W_HOLDERS + HOLDER_SLOTS * HOLDER_WORDS;
const F64_OFFSET    = Math.ceil((INT_WORDS * 4) / 8) * 8;  // acquiredAt per slot
const BLOCK_BYTES   = F64_OFFSET + HOLDER_SLOTS * 8;

export const HEALTH_OK         = 0;
export const HEALTH_LOCKS_LOST = 1;
export const HEALTH_UNHEALTHY  = 2;

/** Create the process-wide block. The main thread creates it once and hands it to every worker. */
export function createStoreGuardBlock(policy: readonly StoreThreadingPolicy[] = DEFAULT_STORE_POLICY): SharedArrayBuffer {
	const block = new SharedArrayBuffer(BLOCK_BYTES);
	const words = new Int32Array(block, 0, INT_WORDS);
	for (const p of policy) {
		if (p.mode === 'guarded') Atomics.store(words, W_PERMITS + storeIndex(p.store), p.permits ?? 1);
	}
	return block;
}

function storeIndex(store: StoreId): number {
	const i = STORE_IDS.indexOf(store);
	if (i < 0) throw new Error(`unknown store '${String(store)}'`);
	return i;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StoreLockTimeoutError extends Error {
	constructor(readonly store: StoreId, readonly waitedMs: number, readonly holders: readonly StoreLockHolder[]) {
		const held = holders.length === 0
			? 'no holder recorded'
			: holders.map(h => `thread ${h.threadId} since ${new Date(h.acquiredAt).toISOString()}`).join(', ');
		super(`store '${store}': no permit within ${waitedMs} ms (held by ${held})`);
		this.name = 'StoreLockTimeoutError';
	}
}

export class StoreLockNestedError extends Error {
	constructor(readonly store: StoreId, readonly heldStore: StoreId) {
		super(`store '${store}': requested inside a held '${heldStore}' operation; nested store permits are refused so no lock cycle can form`);
		this.name = 'StoreLockNestedError';
	}
}

export class StoreUnhealthyError extends Error {
	constructor(readonly store: StoreId) {
		super(`store '${store}' is unhealthy: a worker died holding it and its calls did not finish in time; restart the daemon`);
		this.name = 'StoreUnhealthyError';
	}
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/** Returns true once the store has no call left running for the dead thread. */
export type QuiescenceProbe = (store: StoreId, threadId: number) => Promise<void>;

export interface StoreGuardDeps {
	readonly policy?: readonly StoreThreadingPolicy[] | undefined;
	readonly quiescence?: Partial<Record<StoreId, StoreQuiescence>> | undefined;
	/**
	 * Resolves when the dead thread's native calls on the store have finished.
	 * Default: immediately, because reclaim is called after the worker's 'exit'
	 * event, when its isolate and the handles it opened are gone.
	 */
	readonly probe?: QuiescenceProbe | undefined;
	readonly threadId?: number | undefined;
	readonly now?: (() => number) | undefined;
}

interface Held { readonly store: StoreId }

export class StoreGuard {
	private readonly words: Int32Array;
	private readonly times: Float64Array;
	private readonly policies: ReadonlyMap<StoreId, StoreThreadingPolicy>;
	private readonly quiescenceLimits: ReadonlyMap<StoreId, StoreQuiescence>;
	private readonly probe: QuiescenceProbe;
	private readonly threadId: number;
	private readonly now: () => number;
	private readonly held = new AsyncLocalStorage<Held>();
	/** Arrival-order queue per store for this thread. */
	private readonly tails = new Map<StoreId, Promise<void>>();

	constructor(readonly block: SharedArrayBuffer, deps: StoreGuardDeps = {}) {
		this.words = new Int32Array(block, 0, INT_WORDS);
		this.times = new Float64Array(block, F64_OFFSET, HOLDER_SLOTS);
		this.policies = new Map((deps.policy ?? DEFAULT_STORE_POLICY).map(p => [p.store, p]));
		this.quiescenceLimits = new Map(STORE_IDS.map(s => [s, deps.quiescence?.[s] ?? { store: s, limitMs: DEFAULT_QUIESCENCE_MS }]));
		this.probe = deps.probe ?? (async () => {});
		this.threadId = deps.threadId ?? currentThreadId;
		this.now = deps.now ?? Date.now;
	}

	policy(store: StoreId): StoreThreadingPolicy {
		const p = this.policies.get(store);
		if (p === undefined) throw new Error(`no threading policy for store '${store}'`);
		return p;
	}

	quiescence(store: StoreId): StoreQuiescence {
		return this.quiescenceLimits.get(store)!;
	}

	health(store: StoreId): number {
		return Atomics.load(this.words, W_HEALTH + storeIndex(store));
	}

	/**
	 * Mark the store's locks lost for every thread. Returns true for the one
	 * thread whose mark took effect (it logs and broadcasts), false when another
	 * thread had already marked it.
	 */
	markLocksLost(store: StoreId): boolean {
		const i = storeIndex(store);
		if (Atomics.compareExchange(this.words, W_HEALTH + i, HEALTH_OK, HEALTH_LOCKS_LOST) !== HEALTH_OK) return false;
		Atomics.store(this.words, W_HEALTH_BY + i, this.threadId);
		return true;
	}

	/** The thread that set the store's health word. */
	healthSetBy(store: StoreId): number {
		return Atomics.load(this.words, W_HEALTH_BY + storeIndex(store));
	}

	/** ONLY for tests: a process's store health is never cleared in production. */
	resetHealthForTests(store: StoreId): void {
		const i = storeIndex(store);
		Atomics.store(this.words, W_HEALTH_BY + i, 0);
		Atomics.store(this.words, W_HEALTH + i, HEALTH_OK);
	}

	holders(): readonly StoreLockHolder[] {
		const out: StoreLockHolder[] = [];
		for (let slot = 0; slot < HOLDER_SLOTS; slot++) {
			const s = Atomics.load(this.words, W_HOLDERS + slot * HOLDER_WORDS);
			if (s === 0) continue;
			out.push({
				store:      STORE_IDS[s - 1]!,
				threadId:   Atomics.load(this.words, W_HOLDERS + slot * HOLDER_WORDS + 1),
				acquiredAt: this.times[slot]!,
			});
		}
		return out;
	}

	/** Run `op` with the store; for a guarded store, under one of its permits, released whatever op does. */
	async withStore<T>(store: StoreId, op: () => Promise<T>, opts: StoreGuardOptions): Promise<T> {
		if (this.health(store) === HEALTH_UNHEALTHY) throw new StoreUnhealthyError(store);
		if (this.policy(store).mode === 'direct') return op();

		const outer = this.held.getStore();
		if (outer !== undefined) throw new StoreLockNestedError(store, outer.store);

		const slot = await this.acquire(store, opts);
		try {
			return await this.held.run({ store }, op);
		} finally {
			this.release(store, slot);
		}
	}

	/**
	 * Release every permit `threadId` held, once the store has quiesced; a store
	 * that does not quiesce within its limit is marked unhealthy instead.
	 * Called on the main thread after the worker's 'exit' event.
	 */
	async reclaim(threadId: number): Promise<{ readonly released: readonly StoreId[]; readonly unhealthy: readonly StoreId[] }> {
		const released: StoreId[] = [];
		const unhealthy: StoreId[] = [];
		for (let slot = 0; slot < HOLDER_SLOTS; slot++) {
			const base = W_HOLDERS + slot * HOLDER_WORDS;
			const s = Atomics.load(this.words, base);
			if (s === 0 || Atomics.load(this.words, base + 1) !== threadId) continue;
			const store = STORE_IDS[s - 1]!;
			const limitMs = this.quiescence(store).limitMs;
			const quiet = await settlesWithin(this.probe(store, threadId), limitMs);
			if (quiet) {
				this.release(store, slot);
				released.push(store);
				log.warn({ store, threadId }, 'store guard: reclaimed a permit held by a worker that exited');
			} else {
				Atomics.store(this.words, W_HEALTH + storeIndex(store), HEALTH_UNHEALTHY);
				unhealthy.push(store);
				log.error({ store, threadId, limitMs }, 'store guard: a dead worker\'s calls did not finish in time; store marked unhealthy');
			}
		}
		return { released, unhealthy };
	}

	// -- internals ----------------------------------------------------------

	private async acquire(store: StoreId, opts: StoreGuardOptions): Promise<number> {
		const start = this.now();
		const deadline = start + opts.acquireTimeoutMs;
		// Wait behind this thread's earlier requests for the same store.
		const before = this.tails.get(store) ?? Promise.resolve();
		let turnDone!: () => void;
		this.tails.set(store, new Promise<void>(r => { turnDone = r; }));
		try {
			await waitOrAbort(before, opts.signal);
			const idx = W_PERMITS + storeIndex(store);
			for (;;) {
				opts.signal?.throwIfAborted();
				const free = Atomics.load(this.words, idx);
				if (free > 0) {
					if (Atomics.compareExchange(this.words, idx, free, free - 1) === free) return this.record(store);
					continue;
				}
				const left = deadline - this.now();
				if (left <= 0) {
					const err = new StoreLockTimeoutError(store, this.now() - start, this.holders().filter(h => h.store === store));
					log.warn({ store, holders: err.holders }, 'store guard: permit wait timed out');
					throw err;
				}
				const wait = waitAsync(this.words, idx, free, left);
				if (wait.async) await waitOrAbort(wait.value, opts.signal);
			}
		} finally {
			turnDone();
		}
	}

	private record(store: StoreId): number {
		const id = Atomics.add(this.words, W_ACQ_COUNTER, 1) + 1;
		for (let slot = 0; slot < HOLDER_SLOTS; slot++) {
			const base = W_HOLDERS + slot * HOLDER_WORDS;
			if (Atomics.compareExchange(this.words, base, 0, storeIndex(store) + 1) === 0) {
				this.times[slot] = this.now();
				Atomics.store(this.words, base + 1, this.threadId);
				Atomics.store(this.words, base + 2, id);
				return slot;
			}
		}
		// Every slot taken: give the permit back rather than hold one we cannot reclaim.
		this.returnPermit(store);
		throw new Error(`store guard: all ${HOLDER_SLOTS} holder slots are in use`);
	}

	private release(store: StoreId, slot: number): void {
		const base = W_HOLDERS + slot * HOLDER_WORDS;
		Atomics.store(this.words, base + 1, 0);
		Atomics.store(this.words, base + 2, 0);
		Atomics.store(this.words, base, 0);
		this.returnPermit(store);
	}

	private returnPermit(store: StoreId): void {
		const idx = W_PERMITS + storeIndex(store);
		Atomics.add(this.words, idx, 1);
		Atomics.notify(this.words, idx, 1);
	}
}

async function waitOrAbort<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
	if (signal === undefined) return p;
	signal.throwIfAborted();
	return new Promise<T>((resolve, reject) => {
		const onAbort = (): void => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		p.then(v => { signal.removeEventListener('abort', onAbort); resolve(v); },
		       e => { signal.removeEventListener('abort', onAbort); reject(e); });
	});
}

async function settlesWithin(p: Promise<void>, ms: number): Promise<boolean> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<boolean>(r => { timer = setTimeout(() => r(false), ms); });
	try {
		return await Promise.race([p.then(() => true, () => true), timeout]);
	} finally {
		clearTimeout(timer);
	}
}

// ---------------------------------------------------------------------------
// Process singleton
// ---------------------------------------------------------------------------

let _guard: StoreGuard | null = null;

/** Install this thread's guard over the process block (the main thread creates the block; workers receive it). */
export function installStoreGuard(block: SharedArrayBuffer, deps: StoreGuardDeps = {}): StoreGuard {
	_guard = new StoreGuard(block, deps);
	return _guard;
}

/** This thread's guard; on first use without an installed block, a single-thread block is created. */
export function getStoreGuard(): StoreGuard {
	if (_guard === null) _guard = new StoreGuard(createStoreGuardBlock());
	return _guard;
}
