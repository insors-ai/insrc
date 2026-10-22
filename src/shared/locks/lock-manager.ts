/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-thread named locks (Story afcfa027/S001), shaped like the Web Locks API
 * (navigator.locks), which Node 22 lacks. Every thread of the process shares
 * one lock table in a SharedArrayBuffer: the main thread creates it with
 * createLockBlock() and each worker installs it at start, as the store guard's
 * block is (src/db/store-guard.ts).
 *
 * - A lock is named, and taken in shared or exclusive mode.
 * - Waiting is always asynchronous (Atomics.waitAsync), never Atomics.wait.
 * - Every change to one name's state happens inside that name's short critical
 *   section: a mutex word holding the owner's threadId + 1, held only for a few
 *   atomic writes and never across an await.
 * - Holder and pending records are claimed, filled, then published last, so a
 *   reader never sees one half-written.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { threadId as currentThreadId } from 'node:worker_threads';
import type { Worker } from 'node:worker_threads';

import { getLogger } from '../logger.js';

const log = getLogger('locks');

/** Atomics.waitAsync (Node 16+); the project's TypeScript lib target predates its declaration. */
type WaitAsyncResult = { readonly async: false; readonly value: 'not-equal' | 'timed-out' } | { readonly async: true; readonly value: Promise<'ok' | 'timed-out'> };
const waitAsync = (Atomics as unknown as { waitAsync(typed: Int32Array, index: number, value: number, timeoutMs: number): WaitAsyncResult }).waitAsync;

export type LockMode = 'shared' | 'exclusive';

export interface LockMetadata {
	readonly activity: string;
	readonly reason: string;
}

export interface LockOptions {
	/** Defaults to 'exclusive', as in Web Locks. */
	readonly mode?: LockMode | undefined;
	/** Grant now or call back with a null lock; never waits. */
	readonly ifAvailable?: boolean | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly timeoutMs?: number | undefined;
	readonly metadata?: LockMetadata | undefined;
}

export interface LockInfo {
	readonly name: string;
	readonly mode: LockMode;
	readonly threadId: number;
	readonly since: number;
	readonly metadata?: LockMetadata | undefined;
}

/** The lock a callback runs under. */
export interface Lock {
	readonly name: string;
	readonly mode: LockMode;
	readonly metadata?: LockMetadata | undefined;
}

/** Runs while the lock is held; with ifAvailable and the lock unavailable, runs with null and what blocks it. */
export type LockCallback<T> = (lock: Lock | null, blockedBy: readonly LockInfo[]) => T | Promise<T>;

export interface LockManagerSnapshot {
	readonly held: readonly LockInfo[];
	readonly pending: readonly LockInfo[];
}

export interface LockCapacity {
	readonly names: number;
	readonly holders: number;
	readonly pending: number;
}

export const DEFAULT_LOCK_CAPACITY: LockCapacity = { names: 64, holders: 512, pending: 256 };

/** Limits, in UTF-8 bytes. Over-limit values are refused, never truncated. */
export const LOCK_NAME_MAX_BYTES = 64;
export const LOCK_ACTIVITY_MAX_BYTES = 64;
export const LOCK_REASON_MAX_BYTES = 1024;

// ---------------------------------------------------------------------------
// Shared block layout (Int32 words, then a Float64 region for times)
// ---------------------------------------------------------------------------

// Header
const H_NAMES       = 0;   // name-table capacity
const H_HOLDERS     = 1;   // holder-table capacity
const H_PENDING     = 2;   // pending-table capacity
const H_ACQ         = 3;   // next acquisition id
const HEADER_WORDS  = 8;

// Name slot. A slot is claimed by CAS (state 0 -> -(claimer threadId + 1)), filled,
// and published READY last; it is never freed (lock names are few and long-lived),
// so a READY slot never changes name. Slots are claimed in table order.
const N_STATE   = 0;   // 0 free, 1 ready, -(threadId + 1) being claimed by that thread
const N_HASH    = 1;
const N_LEN     = 2;   // name length in bytes
const N_LOCK    = 3;   // 0 free, n > 0 shared holders, -1 exclusive
const N_PENDX   = 4;   // exclusive requests waiting
const N_VERSION = 5;   // bumped on every change; waiters wait on it
const N_MUTEX   = 6;   // 0 free, else the owner's threadId + 1
const N_BYTES   = 7;   // name bytes
const NAME_WORDS = N_BYTES + LOCK_NAME_MAX_BYTES / 4;
const NAME_READY = 1;

// Holder slot. State: 0 free, -(threadId + 1) being written by that thread (the
// main thread's claim is -1), name index + 1 published once every field is written.
const S_STATE      = 0;
const S_MODE       = 1;   // 1 shared, 2 exclusive
const S_THREAD     = 2;
const S_ACQ        = 3;
const S_ACT_LEN    = 4;   // -1 when the holder has no metadata
const S_REASON_LEN = 5;
const S_ACT        = 6;
const S_REASON     = S_ACT + LOCK_ACTIVITY_MAX_BYTES / 4;
const HOLDER_WORDS = S_REASON + LOCK_REASON_MAX_BYTES / 4;

// Pending slot. Same state protocol as a holder slot.
const P_STATE  = 0;
const P_MODE   = 1;
const P_THREAD = 2;
const P_ID     = 3;   // a request id (from the acquisition counter), so a reused slot is told apart
const PENDING_WORDS = 4;

const MODE_SHARED = 1;
const MODE_EXCLUSIVE = 2;

/** A waiting request re-arms its wait at least this often, so every wait and its keep-alive timer is finite. */
const WAIT_SLICE_MS = 60_000;

interface Layout {
	readonly capacity: LockCapacity;
	readonly names: number;      // first word of the name table
	readonly holders: number;    // first word of the holder table
	readonly pending: number;    // first word of the pending table
	readonly intWords: number;
	readonly f64Offset: number;  // byte offset of the Float64 region: holder since, then pending since
	readonly bytes: number;
}

function layoutFor(capacity: LockCapacity): Layout {
	const names = HEADER_WORDS;
	const holders = names + capacity.names * NAME_WORDS;
	const pending = holders + capacity.holders * HOLDER_WORDS;
	const intWords = pending + capacity.pending * PENDING_WORDS;
	const f64Offset = Math.ceil((intWords * 4) / 8) * 8;
	return { capacity, names, holders, pending, intWords, f64Offset, bytes: f64Offset + (capacity.holders + capacity.pending) * 8 };
}

/** Create the process's lock block. The main thread creates it once and hands it to every worker. */
export function createLockBlock(capacity: Partial<LockCapacity> = {}): SharedArrayBuffer {
	const c: LockCapacity = { ...DEFAULT_LOCK_CAPACITY, ...capacity };
	for (const table of ['names', 'holders', 'pending'] as const) {
		if (!Number.isInteger(c[table]) || c[table] < 1) throw new LockArgumentError(`capacity.${table}`, 'must be a positive integer');
	}
	const block = new SharedArrayBuffer(layoutFor(c).bytes);
	const words = new Int32Array(block, 0, HEADER_WORDS);
	words[H_NAMES] = c.names;
	words[H_HOLDERS] = c.holders;
	words[H_PENDING] = c.pending;
	return block;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function describeHolders(holders: readonly LockInfo[]): string {
	if (holders.length === 0) return 'no holder recorded';
	return holders.map(h => {
		const meta = h.metadata !== undefined ? ` (${h.metadata.activity}: ${h.metadata.reason})` : '';
		return `${h.mode} on thread ${h.threadId} since ${new Date(h.since).toISOString()}${meta}`;
	}).join(', ');
}

export class LockTimeoutError extends Error {
	constructor(readonly lockName: string, readonly waitedMs: number, readonly holders: readonly LockInfo[]) {
		super(`lock '${lockName}': not granted within ${waitedMs} ms (held by ${describeHolders(holders)})`);
		this.name = 'LockTimeoutError';
	}
}

export class LockNestedError extends Error {
	constructor(readonly lockName: string, readonly heldName: string, readonly kind: 'same-name' | 'unbounded-wait') {
		super(kind === 'same-name'
			? `lock '${lockName}': requested again inside a callback that holds it; it would wait on itself forever`
			: `lock '${lockName}': requested inside a callback holding '${heldName}' as a wait with no timeoutMs; a nested request must use ifAvailable or timeoutMs so no lock cycle can wait forever`);
		this.name = 'LockNestedError';
	}
}

export class LockCapacityError extends Error {
	constructor(readonly table: 'names' | 'holders' | 'pending', readonly capacity: number) {
		super(`lock table '${table}' is full (${capacity} slots); nothing was granted or queued`);
		this.name = 'LockCapacityError';
	}
}

export class LockArgumentError extends Error {
	constructor(readonly argument: string, readonly limit: string) {
		super(`lock argument '${argument}' ${limit}`);
		this.name = 'LockArgumentError';
	}
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface ValidatedRequest {
	readonly nameBytes: Uint8Array;
	readonly mode: LockMode;
	readonly activity?: Uint8Array | undefined;
	readonly reason?: Uint8Array | undefined;
}

/** Check a request's arguments before any shared state is touched. */
export function validateLockRequest(name: string, options: LockOptions): ValidatedRequest {
	if (typeof name !== 'string') throw new LockArgumentError('name', 'must be a string');
	const nameBytes = encoder.encode(name);
	if (nameBytes.length < 1 || nameBytes.length > LOCK_NAME_MAX_BYTES) {
		throw new LockArgumentError('name', `must be 1 to ${LOCK_NAME_MAX_BYTES} UTF-8 bytes (got ${nameBytes.length})`);
	}
	const mode = options.mode ?? 'exclusive';
	if (mode !== 'shared' && mode !== 'exclusive') throw new LockArgumentError('mode', "must be 'shared' or 'exclusive'");
	if (options.timeoutMs !== undefined && !(Number.isFinite(options.timeoutMs) && options.timeoutMs >= 0)) {
		throw new LockArgumentError('timeoutMs', 'must be a finite number >= 0');
	}
	if (options.ifAvailable === true && (options.signal !== undefined || options.timeoutMs !== undefined)) {
		throw new LockArgumentError('ifAvailable', 'cannot be combined with signal or timeoutMs (it never waits)');
	}
	if (options.metadata === undefined) return { nameBytes, mode };
	const { activity, reason } = options.metadata;
	if (typeof activity !== 'string' || typeof reason !== 'string') throw new LockArgumentError('metadata', 'activity and reason must be strings');
	const a = encoder.encode(activity);
	if (a.length > LOCK_ACTIVITY_MAX_BYTES) throw new LockArgumentError('metadata.activity', `must be at most ${LOCK_ACTIVITY_MAX_BYTES} UTF-8 bytes (got ${a.length})`);
	const r = encoder.encode(reason);
	if (r.length > LOCK_REASON_MAX_BYTES) throw new LockArgumentError('metadata.reason', `must be at most ${LOCK_REASON_MAX_BYTES} UTF-8 bytes (got ${r.length})`);
	return { nameBytes, mode, activity: a, reason: r };
}

/** FNV-1a over the name's bytes. */
function hashBytes(bytes: Uint8Array): number {
	let h = 0x811c9dc5;
	for (const b of bytes) h = Math.imul(h ^ b, 0x01000193);
	return h | 0;
}

// ---------------------------------------------------------------------------
// Test hook
// ---------------------------------------------------------------------------

/** The points of a grant at which the test hook runs, in order. */
export type LockGrantPoint = 'in-critical-section' | 'after-lock-word' | 'before-publish';
type GrantHook = (point: LockGrantPoint, name: string) => void;

let grantHook: GrantHook | null = null;

/** ONLY for tests: run `hook` synchronously at each grant point on this thread (null removes it). */
export function setLockGrantHookForTests(hook: GrantHook | null): void {
	grantHook = hook;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export interface LockManagerDeps {
	readonly threadId?: number | undefined;
	readonly now?: (() => number) | undefined;
}

export class LockManager {
	private readonly words: Int32Array;
	private readonly bytes: Uint8Array;
	private readonly times: Float64Array;
	private readonly layout: Layout;
	private readonly threadId: number;
	private readonly now: () => number;
	/** Names held by the current async call chain. */
	private readonly held = new AsyncLocalStorage<ReadonlySet<string>>();
	/** Arrival-order queue per name for this thread's waiting requests. */
	private readonly tails = new Map<string, Promise<void>>();

	constructor(readonly block: SharedArrayBuffer, deps: LockManagerDeps = {}) {
		const header = new Int32Array(block, 0, HEADER_WORDS);
		this.layout = layoutFor({ names: header[H_NAMES]!, holders: header[H_HOLDERS]!, pending: header[H_PENDING]! });
		if (this.layout.bytes !== block.byteLength) throw new Error('lock block: its size does not match the capacities in its header');
		this.words = new Int32Array(block, 0, this.layout.intWords);
		this.bytes = new Uint8Array(block, 0, this.layout.intWords * 4);
		this.times = new Float64Array(block, this.layout.f64Offset, this.layout.capacity.holders + this.layout.capacity.pending);
		this.threadId = deps.threadId ?? currentThreadId;
		this.now = deps.now ?? Date.now;
	}

	/** The table sizes read from the block's header. */
	get capacity(): LockCapacity {
		return this.layout.capacity;
	}

	/**
	 * The name-table slot for `name`, claimed if no thread has used the name yet.
	 * Every thread resolves one name to one slot.
	 */
	async resolveName(nameBytes: Uint8Array): Promise<number> {
		const hash = hashBytes(nameBytes);
		const claim = -(this.threadId + 1);
		// Slots are claimed in table order and a thread never passes a slot another
		// thread is still claiming (it may be this same name), so one name can never
		// be claimed in two slots.
		for (let i = 0; i < this.layout.capacity.names;) {
			const base = this.nameBase(i);
			const state = Atomics.load(this.words, base + N_STATE);
			if (state === NAME_READY) {
				if (this.nameMatches(i, nameBytes, hash)) return i;
				i++;
			} else if (state === 0) {
				if (Atomics.compareExchange(this.words, base + N_STATE, 0, claim) !== 0) continue;
				Atomics.store(this.words, base + N_HASH, hash);
				Atomics.store(this.words, base + N_LEN, nameBytes.length);
				this.bytes.set(nameBytes, (base + N_BYTES) * 4);
				Atomics.store(this.words, base + N_STATE, NAME_READY);
				Atomics.notify(this.words, base + N_STATE);
				return i;
			} else {
				// Being claimed by another thread: wait until it is published (or, if
				// that thread died, reset to free by reclaim on the main thread).
				await this.yieldOn(base + N_STATE, state);
			}
		}
		throw new LockCapacityError('names', this.layout.capacity.names);
	}

	/**
	 * Run `callback` under the named lock, as navigator.locks.request does; the
	 * lock is released when the callback settles, whatever it does.
	 */
	async request<T>(name: string, options: LockOptions, callback: LockCallback<T>): Promise<T> {
		const req = validateLockRequest(name, options);
		options.signal?.throwIfAborted();
		const outer = this.held.getStore();
		if (outer !== undefined && outer.size > 0) {
			if (outer.has(name)) throw new LockNestedError(name, name, 'same-name');
			if (options.ifAvailable !== true && options.timeoutMs === undefined) throw new LockNestedError(name, [...outer][0]!, 'unbounded-wait');
		}
		const index = await this.resolveName(req.nameBytes);
		let slot: number;
		if (options.ifAvailable === true) {
			const now = await this.attempt(index, name, req, -1, false);
			if (now.slot < 0) return callback(null, now.blockedBy);
			slot = now.slot;
		} else {
			slot = await this.acquire(index, name, req, options);
		}
		const lock: Lock = { name, mode: req.mode, ...(options.metadata !== undefined ? { metadata: options.metadata } : {}) };
		try {
			return await this.held.run(new Set([...(outer ?? []), name]), () => callback(lock, []));
		} finally {
			await this.release(index, slot, req.mode);
		}
	}

	/**
	 * Every held and pending request in the process, as navigator.locks.query()
	 * returns them, plus thread, time and metadata. Synchronous and lock-free: a
	 * record being written or released while it is read is left out, never torn.
	 */
	query(): LockManagerSnapshot {
		const held: LockInfo[] = [];
		for (let slot = 0; slot < this.layout.capacity.holders; slot++) {
			const r = this.readHolder(slot);
			if (r !== null) held.push(r.info);
		}
		const pending: LockInfo[] = [];
		for (let slot = 0; slot < this.layout.capacity.pending; slot++) {
			const r = this.readPending(slot);
			if (r !== null) pending.push(r.info);
		}
		return { held, pending };
	}

	/**
	 * Release every lock `threadId` held and remove every request it was waiting
	 * on. Called on the main thread after that worker's 'exit' event.
	 *
	 * A name whose mutex the dead thread holds (it died inside a critical
	 * section) is taken over; each affected name's lock word and pending-exclusive
	 * count are then recomputed from the records that remain published, so the
	 * count is right wherever the worker died. Asynchronous, because a name's
	 * mutex may be held by another thread: a live one leaves it within a few
	 * atomic writes, and one that has also died is reclaimed when its own exit
	 * event runs, which a synchronous spin here would never let happen.
	 */
	async reclaim(threadId: number): Promise<readonly LockInfo[]> {
		const dead = threadId + 1;
		const claim = -dead;
		const reclaimed: LockInfo[] = [];
		for (let i = 0; i < this.layout.capacity.names; i++) {
			const base = this.nameBase(i);
			const state = Atomics.load(this.words, base + N_STATE);
			if (state === claim) {
				// A name claim the dead thread never published: free the slot.
				Atomics.compareExchange(this.words, base + N_STATE, claim, 0);
				Atomics.notify(this.words, base + N_STATE);
				log.warn({ threadId, slot: i }, 'locks: reset a name claim left by a worker that exited');
				continue;
			}
			if (state !== NAME_READY) continue;
			const mine = (r: { readonly info: LockInfo } | null): boolean => r !== null && r.info.threadId === threadId;
			const touched = Atomics.load(this.words, base + N_MUTEX) === dead
				|| this.holdersOf(i).some(h => h.threadId === threadId)
				|| this.pendingOf(i).some(p => p.threadId === threadId);
			if (!touched) continue;
			await this.takeMutex(base + N_MUTEX, dead);
			try {
				for (let slot = 0; slot < this.layout.capacity.holders; slot++) {
					const r = this.readHolder(slot);
					if (r === null || r.index !== i || !mine(r)) continue;
					this.clearHolder(slot);
					reclaimed.push(r.info);
					log.warn({ name: r.info.name, mode: r.info.mode, threadId, metadata: r.info.metadata }, 'locks: released a lock held by a worker that exited');
				}
				for (let slot = 0; slot < this.layout.capacity.pending; slot++) {
					const r = this.readPending(slot);
					if (r === null || r.index !== i || !mine(r)) continue;
					this.clearPending(i, slot, 'shared'); // uncounted here: the count is recomputed below
					reclaimed.push(r.info);
					log.warn({ name: r.info.name, mode: r.info.mode, threadId }, 'locks: removed a request a worker that exited was waiting on');
				}
				this.recount(i);
				this.bumpVersion(i);
			} finally {
				this.unlockMutex(base + N_MUTEX);
			}
		}
		// Holder and pending slots the dead thread had claimed but not published:
		// their names' mutexes were taken over above, so nothing else will finish them.
		for (let slot = 0; slot < this.layout.capacity.holders; slot++) {
			const h = this.holderBase(slot);
			if (Atomics.load(this.words, h + S_STATE) === claim) { this.clearHolder(slot); }
		}
		for (let slot = 0; slot < this.layout.capacity.pending; slot++) {
			const p = this.pendingBase(slot);
			if (Atomics.load(this.words, p + P_STATE) !== claim) continue;
			for (const w of [P_MODE, P_THREAD, P_ID]) Atomics.store(this.words, p + w, 0);
			Atomics.store(this.words, p + P_STATE, 0);
		}
		return reclaimed;
	}

	// -- internals ----------------------------------------------------------

	/** Take a mutex that is free or held by the dead thread (`dead` = its threadId + 1). */
	private async takeMutex(index: number, dead: number): Promise<void> {
		const mine = this.threadId + 1;
		for (let spins = 0; ; spins++) {
			const held = Atomics.compareExchange(this.words, index, 0, mine);
			if (held === 0) return;
			if (held === dead && Atomics.compareExchange(this.words, index, dead, mine) === dead) return;
			if (spins >= 64) await this.yieldOn(index, held);
		}
	}

	/** Inside the name's mutex: set its lock word and pending-exclusive count from its published records. */
	private recount(index: number): void {
		const base = this.nameBase(index);
		const holders = this.holdersOf(index);
		const word = holders.some(h => h.mode === 'exclusive') ? -1 : holders.length;
		Atomics.store(this.words, base + N_LOCK, word);
		Atomics.store(this.words, base + N_PENDX, this.pendingOf(index).filter(p => p.mode === 'exclusive').length);
	}

	/**
	 * Wait for the lock: behind this thread's earlier requests for the name, then
	 * as a pending request until a grant, the deadline or an abort. Returns the
	 * holder slot; on any failure the pending record is withdrawn.
	 */
	private async acquire(index: number, name: string, req: ValidatedRequest, options: LockOptions): Promise<number> {
		const start = this.now();
		const deadline = options.timeoutMs !== undefined ? start + options.timeoutMs : Infinity;
		const signal = options.signal;
		const timedOut = (): LockTimeoutError => new LockTimeoutError(name, this.now() - start, this.holdersOf(index));

		const before = this.tails.get(name) ?? Promise.resolve();
		let turnDone!: () => void;
		const turn = new Promise<void>(r => { turnDone = r; });
		this.tails.set(name, turn);
		let pending = -1;
		try {
			if (await settleWithin(before, signal, deadline - this.now()) === TIMED_OUT) throw timedOut();
			for (;;) {
				const attempt = await this.attempt(index, name, req, pending, true);
				pending = attempt.pending;
				if (attempt.slot >= 0) return attempt.slot;
				const left = deadline - this.now();
				if (left <= 0) throw timedOut();
				await this.waitForChange(index, attempt.version, Math.min(left, WAIT_SLICE_MS), signal);
			}
		} catch (err) {
			if (pending >= 0) await this.withdraw(index, pending, req.mode);
			throw err;
		} finally {
			turnDone();
			if (this.tails.get(name) === turn) this.tails.delete(name);
		}
	}

	/** Wait (without blocking the event loop) until the name's version moves from `version`, `ms` passes or `signal` aborts. */
	private async waitForChange(index: number, version: number, ms: number, signal: AbortSignal | undefined): Promise<void> {
		const wait = waitAsync(this.words, this.nameBase(index) + N_VERSION, version, ms);
		if (!wait.async) return;
		// A pending waitAsync does not keep a thread alive; a timer for its length does.
		const keepAlive = setTimeout(() => {}, ms);
		try {
			await waitOrAbort(wait.value, signal);
		} finally {
			clearTimeout(keepAlive);
		}
	}

	/** Remove a pending record that will not be granted (timeout, abort, error). */
	private async withdraw(index: number, pending: number, mode: LockMode): Promise<void> {
		const base = this.nameBase(index);
		await this.lockMutex(base + N_MUTEX);
		try {
			this.clearPending(index, pending, mode);
			this.bumpVersion(index);
		} finally {
			this.unlockMutex(base + N_MUTEX);
		}
	}

	/**
	 * Inside the name's mutex: grant the lock if its mode allows, recording the
	 * holder before returning (and retiring this request's pending record);
	 * otherwise, with `register`, record the request as pending, and report the
	 * version seen and what blocks it.
	 */
	private async attempt(index: number, name: string, req: ValidatedRequest, pending: number, register: boolean):
		Promise<{ readonly slot: number; readonly blockedBy: readonly LockInfo[]; readonly version: number; readonly pending: number }> {
		const base = this.nameBase(index);
		await this.lockMutex(base + N_MUTEX);
		try {
			grantHook?.('in-critical-section', name);
			const word = Atomics.load(this.words, base + N_LOCK);
			const exclusive = req.mode === 'exclusive';
			// Writer preference: a waiting exclusive request stops new shared grants.
			const free = exclusive ? word === 0 : word >= 0 && Atomics.load(this.words, base + N_PENDX) === 0;
			if (!free) {
				if (!register) {
					const blockedBy = [...this.holdersOf(index), ...(exclusive ? [] : this.pendingOf(index).filter(p => p.mode === 'exclusive'))];
					return { slot: -1, blockedBy, version: 0, pending };
				}
				const p = pending >= 0 ? pending : this.registerPending(index, req.mode);
				return { slot: -1, blockedBy: [], version: Atomics.load(this.words, base + N_VERSION), pending: p };
			}
			Atomics.store(this.words, base + N_LOCK, exclusive ? -1 : word + 1);
			grantHook?.('after-lock-word', name);
			const slot = this.claimHolder();
			if (slot < 0) {
				// No record, no grant: give the lock word back.
				Atomics.store(this.words, base + N_LOCK, word);
				throw new LockCapacityError('holders', this.layout.capacity.holders);
			}
			const h = this.holderBase(slot);
			Atomics.store(this.words, h + S_MODE, exclusive ? MODE_EXCLUSIVE : MODE_SHARED);
			Atomics.store(this.words, h + S_THREAD, this.threadId);
			Atomics.store(this.words, h + S_ACQ, Atomics.add(this.words, H_ACQ, 1) + 1);
			this.times[slot] = this.now();
			if (req.activity !== undefined && req.reason !== undefined) {
				this.bytes.set(req.activity, (h + S_ACT) * 4);
				this.bytes.set(req.reason, (h + S_REASON) * 4);
				Atomics.store(this.words, h + S_ACT_LEN, req.activity.length);
				Atomics.store(this.words, h + S_REASON_LEN, req.reason.length);
			} else {
				Atomics.store(this.words, h + S_ACT_LEN, -1);
				Atomics.store(this.words, h + S_REASON_LEN, 0);
			}
			grantHook?.('before-publish', name);
			Atomics.store(this.words, h + S_STATE, index + 1);
			if (pending >= 0) this.clearPending(index, pending, req.mode);
			this.bumpVersion(index);
			return { slot, blockedBy: [], version: 0, pending: -1 };
		} finally {
			this.unlockMutex(base + N_MUTEX);
		}
	}

	/** Inside the name's mutex: claim, fill and publish a pending record; an exclusive one is counted. */
	private registerPending(index: number, mode: LockMode): number {
		const claim = -(this.threadId + 1);
		for (let slot = 0; slot < this.layout.capacity.pending; slot++) {
			const p = this.pendingBase(slot);
			if (Atomics.compareExchange(this.words, p + P_STATE, 0, claim) !== 0) continue;
			Atomics.store(this.words, p + P_MODE, mode === 'exclusive' ? MODE_EXCLUSIVE : MODE_SHARED);
			Atomics.store(this.words, p + P_THREAD, this.threadId);
			Atomics.store(this.words, p + P_ID, Atomics.add(this.words, H_ACQ, 1) + 1);
			this.times[this.layout.capacity.holders + slot] = this.now();
			Atomics.store(this.words, p + P_STATE, index + 1);
			if (mode === 'exclusive') Atomics.add(this.words, this.nameBase(index) + N_PENDX, 1);
			this.bumpVersion(index);
			return slot;
		}
		throw new LockCapacityError('pending', this.layout.capacity.pending);
	}

	/** Inside the name's mutex: clear a pending record and uncount it. */
	private clearPending(index: number, slot: number, mode: LockMode): void {
		const p = this.pendingBase(slot);
		Atomics.store(this.words, p + P_MODE, 0);
		Atomics.store(this.words, p + P_THREAD, 0);
		Atomics.store(this.words, p + P_ID, 0);
		this.times[this.layout.capacity.holders + slot] = 0;
		Atomics.store(this.words, p + P_STATE, 0);
		if (mode === 'exclusive') Atomics.sub(this.words, this.nameBase(index) + N_PENDX, 1);
	}

	private async release(index: number, slot: number, mode: LockMode): Promise<void> {
		const base = this.nameBase(index);
		await this.lockMutex(base + N_MUTEX);
		try {
			if (mode === 'exclusive') Atomics.store(this.words, base + N_LOCK, 0);
			else Atomics.sub(this.words, base + N_LOCK, 1);
			this.clearHolder(slot);
			this.bumpVersion(index);
		} finally {
			this.unlockMutex(base + N_MUTEX);
		}
	}

	/** Claim a free holder slot (state 0 -> -(threadId + 1)); -1 when the table is full. */
	private claimHolder(): number {
		const claim = -(this.threadId + 1);
		for (let slot = 0; slot < this.layout.capacity.holders; slot++) {
			if (Atomics.compareExchange(this.words, this.holderBase(slot) + S_STATE, 0, claim) === 0) return slot;
		}
		return -1;
	}

	private clearHolder(slot: number): void {
		const h = this.holderBase(slot);
		for (const w of [S_MODE, S_THREAD, S_ACQ, S_ACT_LEN, S_REASON_LEN]) Atomics.store(this.words, h + w, 0);
		this.times[slot] = 0;
		Atomics.store(this.words, h + S_STATE, 0);
	}

	private bumpVersion(index: number): void {
		const v = this.nameBase(index) + N_VERSION;
		Atomics.add(this.words, v, 1);
		Atomics.notify(this.words, v);
	}

	/** The published holders of one name. */
	private holdersOf(index: number): LockInfo[] {
		const out: LockInfo[] = [];
		for (let slot = 0; slot < this.layout.capacity.holders; slot++) {
			const info = this.readHolder(slot);
			if (info !== null && info.index === index) out.push(info.info);
		}
		return out;
	}

	/** The published pending requests of one name. */
	private pendingOf(index: number): LockInfo[] {
		const out: LockInfo[] = [];
		for (let slot = 0; slot < this.layout.capacity.pending; slot++) {
			const info = this.readPending(slot);
			if (info !== null && info.index === index) out.push(info.info);
		}
		return out;
	}

	/**
	 * A holder slot's record, or null unless it is published. The state and
	 * acquisition id are read before and after the fields: if either moved, the
	 * slot was released or reused while being read, and it is left out rather
	 * than returned torn.
	 */
	private readHolder(slot: number): { readonly index: number; readonly info: LockInfo } | null {
		const h = this.holderBase(slot);
		const state = Atomics.load(this.words, h + S_STATE);
		if (state <= 0) return null;
		const acq = Atomics.load(this.words, h + S_ACQ);
		const actLen = Atomics.load(this.words, h + S_ACT_LEN);
		const at = (w: number, len: number): string => decoder.decode(this.bytes.slice(w * 4, w * 4 + len));
		const info: LockInfo = {
			name: this.nameAt(state - 1),
			mode: Atomics.load(this.words, h + S_MODE) === MODE_EXCLUSIVE ? 'exclusive' : 'shared',
			threadId: Atomics.load(this.words, h + S_THREAD),
			since: this.times[slot]!,
			...(actLen >= 0 ? { metadata: { activity: at(h + S_ACT, actLen), reason: at(h + S_REASON, Atomics.load(this.words, h + S_REASON_LEN)) } } : {}),
		};
		if (Atomics.load(this.words, h + S_STATE) !== state || Atomics.load(this.words, h + S_ACQ) !== acq) return null;
		return { index: state - 1, info };
	}

	/** A pending slot's record, or null unless it is published; read as readHolder reads. */
	private readPending(slot: number): { readonly index: number; readonly info: LockInfo } | null {
		const p = this.pendingBase(slot);
		const state = Atomics.load(this.words, p + P_STATE);
		if (state <= 0) return null;
		const id = Atomics.load(this.words, p + P_ID);
		const info: LockInfo = {
			name: this.nameAt(state - 1),
			mode: Atomics.load(this.words, p + P_MODE) === MODE_EXCLUSIVE ? 'exclusive' : 'shared',
			threadId: Atomics.load(this.words, p + P_THREAD),
			since: this.times[this.layout.capacity.holders + slot]!,
		};
		if (Atomics.load(this.words, p + P_STATE) !== state || Atomics.load(this.words, p + P_ID) !== id) return null;
		return { index: state - 1, info };
	}

	private holderBase(slot: number): number {
		return this.layout.holders + slot * HOLDER_WORDS;
	}

	private pendingBase(slot: number): number {
		return this.layout.pending + slot * PENDING_WORDS;
	}

	private nameBase(i: number): number {
		return this.layout.names + i * NAME_WORDS;
	}

	private nameMatches(i: number, nameBytes: Uint8Array, hash: number): boolean {
		const base = this.nameBase(i);
		if (this.words[base + N_HASH] !== hash || this.words[base + N_LEN] !== nameBytes.length) return false;
		const at = (base + N_BYTES) * 4;
		return nameBytes.every((b, k) => this.bytes[at + k] === b);
	}

	/** The name stored in a published slot. */
	protected nameAt(i: number): string {
		const base = this.nameBase(i);
		const at = (base + N_BYTES) * 4;
		return decoder.decode(this.bytes.slice(at, at + this.words[base + N_LEN]!));
	}

	/**
	 * Take a mutex word (value: owner threadId + 1). Critical sections are a few
	 * atomic writes, so a taken mutex is retried; between retries the thread
	 * yields to its event loop, so the main thread can still reclaim a mutex
	 * left by a worker that died inside it.
	 */
	protected async lockMutex(index: number): Promise<void> {
		const mine = this.threadId + 1;
		for (let spins = 0; ; spins++) {
			const held = Atomics.compareExchange(this.words, index, 0, mine);
			if (held === 0) return;
			if (spins >= 64) await this.yieldOn(index, held);
		}
	}

	/** Wait (at most 1 ms, never blocking the event loop) for the word at `index` to change from `value`. */
	private async yieldOn(index: number, value: number): Promise<void> {
		const wait = waitAsync(this.words, index, value, 1);
		if (!wait.async) return;
		// A pending waitAsync does not keep a thread alive; a timer for its length does.
		const keepAlive = setTimeout(() => {}, 1);
		try { await wait.value; } finally { clearTimeout(keepAlive); }
	}

	protected unlockMutex(index: number): void {
		Atomics.store(this.words, index, 0);
		Atomics.notify(this.words, index);
	}
}

/**
 * On the main thread, right after starting a daemon worker: when the worker
 * exits, reclaim every named lock it held or waited for. The threadId is
 * captured now, because worker.threadId reads -1 once the thread has stopped.
 * Store-guard permits are reclaimed separately (StoreGuard.reclaim).
 * Resolves, after the exit, once the reclaim is done (with what it reclaimed;
 * empty when it failed, which is logged), so a supervisor can order the
 * worker's replacement after it.
 */
export function watchWorker(worker: Worker): Promise<readonly LockInfo[]> {
	const threadId = worker.threadId;
	return new Promise(resolve => {
		worker.once('exit', () => {
			getLockManager().reclaim(threadId).then(resolve, (err: unknown) => {
				log.error({ threadId, err }, 'locks: reclaiming an exited worker\'s locks failed');
				resolve([]);
			});
		});
	});
}

const TIMED_OUT = Symbol('timed-out');

/** Wait for `p`, rejecting with the signal's reason on abort; TIMED_OUT after `ms`. */
async function settleWithin<T>(p: Promise<T>, signal: AbortSignal | undefined, ms: number): Promise<T | typeof TIMED_OUT> {
	if (ms === Infinity) return waitOrAbort(p, signal);
	// A promise that has already settled wins the race even at ms <= 0: the timer fires a macrotask later.
	let timer: NodeJS.Timeout | undefined;
	const expired = new Promise<typeof TIMED_OUT>(r => { timer = setTimeout(() => r(TIMED_OUT), Math.min(Math.max(ms, 0), 2 ** 31 - 1)); });
	try {
		return await Promise.race([waitOrAbort(p, signal), expired]);
	} finally {
		clearTimeout(timer);
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

// ---------------------------------------------------------------------------
// Process singleton
// ---------------------------------------------------------------------------

let _manager: LockManager | null = null;

/** Install this thread's manager over the process block (the main thread creates the block; workers receive it). */
export function installLockManager(block: SharedArrayBuffer, deps: LockManagerDeps = {}): LockManager {
	_manager = new LockManager(block, deps);
	return _manager;
}

/** This thread's manager; on first use without an installed block (tests, tools), a private block is created. */
export function getLockManager(): LockManager {
	if (_manager === null) _manager = new LockManager(createLockBlock());
	return _manager;
}

