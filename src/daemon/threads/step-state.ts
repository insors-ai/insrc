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
 * daemon restarts. Payloads are stored as a structured clone, the same copy a
 * worker's payload becomes when it crosses threads.
 */

import { ReviewStateRefused } from './review-state-contract.js';
import type { ReviewStateKind, ReviewStateExpected, ReviewStateAccess, ReviewStateClaim, ReviewClaimResult, ReviewStateCommit, ReviewCommitResult, ReviewCompletionReceipt } from './review-state-contract.js';
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
	mintReviewState<P>(kind: ReviewStateKind, payload: P, expected: ReviewStateExpected): Promise<string>;
	claimReviewState<P>(access: ReviewStateAccess): Promise<ReviewClaimResult<P>>;
	commitReviewState<P>(claim: ReviewStateClaim, next: ReviewStateCommit<P>): Promise<ReviewCommitResult>;
	releaseReviewClaim(claim: ReviewStateClaim, noSideEffects: true): Promise<void>;
	invalidateReviewClaim(claim: ReviewStateClaim): Promise<void>;
	invalidateReviewOwner(owner: string): Promise<void>;

	lifecycle(kind: StepKind): StepLifecycle;
	mint<P>(kind: StepKind, payload: P): Promise<string>;
	read<P>(kind: StepKind, token: string): Promise<StepStateEntry<P> | undefined>;
	/**
	 * Returns the token to use next: the same one for a stable-token kind (whose
	 * token must exist), a new one otherwise (the old one, if any, is released).
	 */
	update<P>(kind: StepKind, token: string | undefined, payload: P): Promise<string>;
	release(kind: StepKind, token: string): Promise<void>;
	/**
	 * Every live entry of `kind`, most recently touched first, read synchronously (the team gate asks while it decides).
	 * Changes nothing: no expiry moves, and an entry past its time to live is left out (not swept; the next mint does the
	 * sweeping). Only the main thread, which holds the entries, can answer: a worker's store throws.
	 */
	listLocal<P>(kind: StepKind): readonly StepStateEntry<P>[];
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

interface ReviewEntry extends ReviewStateExpected {
	claim?: ReviewStateClaim | undefined;
	receipt?: ReviewCompletionReceipt | undefined;
	uncertain?: boolean | undefined;
}
interface Entry { review?: ReviewEntry | undefined; payload: unknown; readonly createdAt: number; touchedAt: number; }

function mintToken(): string {
	return randomBytes(16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** The store itself; lives on the main thread. */
export class LocalStepStateStore implements SharedStepStateStore {
	private readonly stores = new Map<StepKind, Map<string, Entry>>(STEP_KINDS.map(k => [k, new Map()]));

	constructor(private readonly now: () => number = () => Date.now()) {}

	lifecycle(kind: StepKind): StepLifecycle { return LIFECYCLES[kind]; }

	async mint<P>(kind: StepKind, payload: P): Promise<string> { return this.mintSync(kind, payload); }

	async read<P>(kind: StepKind, token: string): Promise<StepStateEntry<P> | undefined> {
		const entry = this.map(kind).get(token);
		if (entry === undefined) return undefined;
		entry.touchedAt = this.now();
		return { token, kind, payload: structuredClone(entry.payload) as P, touchedAt: entry.touchedAt };
	}

	async update<P>(kind: StepKind, token: string | undefined, payload: P): Promise<string> {
		if (token !== undefined && this.map(kind).get(token)?.review !== undefined) throw new ReviewStateRefused('review-state-invalid');
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

	async release(kind: StepKind, token: string): Promise<void> {
		if (this.map(kind).get(token)?.review !== undefined) throw new ReviewStateRefused('review-state-invalid');
		this.map(kind).delete(token);
	}

	listLocal<P>(kind: StepKind): readonly StepStateEntry<P>[] {
		const now = this.now();
		const { ttlMs } = LIFECYCLES[kind];
		return [...this.map(kind).entries()]
			.filter(([, e]) => e.review?.claim !== undefined || now - e.touchedAt <= ttlMs)
			.sort((a, b) => b[1].touchedAt - a[1].touchedAt || b[1].createdAt - a[1].createdAt)
			.map(([token, e]) => ({ token, kind, payload: structuredClone(e.payload) as P, touchedAt: e.touchedAt }));
	}
	async clearForTests(kind: StepKind): Promise<void> { this.map(kind).clear(); }
	async sizeForTests(kind: StepKind): Promise<number> { return this.map(kind).size; }

	async mintReviewState<P>(kind: ReviewStateKind, payload: P, expected: ReviewStateExpected): Promise<string> {
		this.validateExpected(kind, expected);
		const token = this.mintSync(kind, payload);
		this.map(kind).get(token)!.review = { generation: expected.generation, callId: expected.callId };
		return token;
	}

	async claimReviewState<P>(access: ReviewStateAccess): Promise<ReviewClaimResult<P>> {
		this.validateExpected(access.kind, access);
		if (typeof access.owner !== 'string' || access.owner.length === 0) throw new ReviewStateRefused('review-state-owner-mismatch');
		const entry = this.reviewEntry(access.kind, access.token);
		const review = entry.review!;
		if ((review.receipt === undefined ? review.generation : review.generation - 1) !== access.generation || review.callId !== access.callId) throw new ReviewStateRefused('review-state-stale');
		if (review.receipt !== undefined) return { status: 'completed', receipt: structuredClone(review.receipt) };
		if (review.claim !== undefined) throw new ReviewStateRefused('review-state-busy');
		const payload = structuredClone(entry.payload) as P;
		const claim: ReviewStateClaim = { kind: access.kind, token: access.token, generation: access.generation, callId: access.callId, owner: access.owner, claimId: mintToken() };
		review.claim = claim;
		entry.touchedAt = this.now();
		return { status: 'claimed', claim: { ...claim }, payload };
	}

	async commitReviewState<P>(claim: ReviewStateClaim, next: ReviewStateCommit<P>): Promise<ReviewCommitResult> {
		const entry = this.claimEntry(claim);
		const generation = claim.generation + 1;
		if (!Number.isSafeInteger(generation)) throw new ReviewStateRefused('review-state-invalid');
		if (next.status === 'completed') {
			const receipt = this.completionReceipt(next.receipt, claim.callId);
			entry.payload = undefined;
			// Keep the advanced generation and consumed call as a bounded replay receipt, never grant another claim.
			entry.review = { generation, callId: claim.callId, receipt };
			entry.touchedAt = this.now();
			return { token: claim.token, generation };
		}
		this.validateExpected(claim.kind, { generation, callId: next.callId });
		const payload = structuredClone(next.payload); // clone failures must not consume the claim
		const token = LIFECYCLES[claim.kind].update === 'stable-token' ? claim.token : mintToken();
		const replacement: Entry = { payload, createdAt: entry.createdAt, touchedAt: this.now(), review: { generation, callId: next.callId } };
		this.map(claim.kind).set(token, replacement);
		if (token !== claim.token) this.map(claim.kind).delete(claim.token);
		return { token, generation };
	}

	async releaseReviewClaim(claim: ReviewStateClaim, noSideEffects: true): Promise<void> {
		const entry = this.claimEntry(claim);
		if (noSideEffects !== true) throw new ReviewStateRefused('review-state-uncertain');
		entry.review!.claim = undefined;
		entry.touchedAt = this.now();
	}
	async invalidateReviewClaim(claim: ReviewStateClaim): Promise<void> {
		this.invalidateEntry(this.claimEntry(claim));
	}
	async invalidateReviewOwner(owner: string): Promise<void> {
		for (const kind of ['review', 'code-review'] as const) {
			for (const entry of this.map(kind).values()) if (entry.review?.claim?.owner === owner) this.invalidateEntry(entry);
		}
	}
	private invalidateEntry(entry: Entry): void {
		const review = entry.review!;
		entry.review = { generation: review.generation, callId: review.callId, uncertain: true };
		entry.payload = undefined;
		entry.touchedAt = this.now();
	}
	private reviewEntry(kind: ReviewStateKind, token: string): Entry {
		if (kind !== 'review' && kind !== 'code-review') throw new ReviewStateRefused('review-state-invalid');
		const entry = this.map(kind).get(token);
		if (entry?.review === undefined) throw new ReviewStateRefused('review-state-stale');
		if (entry.review.claim === undefined && this.now() - entry.touchedAt > LIFECYCLES[kind].ttlMs) {
			this.map(kind).delete(token); throw new ReviewStateRefused('review-state-stale');
		}
		if (entry.review.uncertain) throw new ReviewStateRefused('review-state-uncertain');
		return entry;
	}
	private claimEntry(claim: ReviewStateClaim): Entry {
		const entry = this.reviewEntry(claim.kind, claim.token);
		const held = entry.review!.claim;
		if (held === undefined || held.claimId !== claim.claimId || held.owner !== claim.owner || held.generation !== claim.generation || held.callId !== claim.callId) throw new ReviewStateRefused('review-state-owner-mismatch');
		return entry;
	}
	private validateExpected(kind: ReviewStateKind, expected: ReviewStateExpected): void {
		if ((kind !== 'review' && kind !== 'code-review') || !Number.isSafeInteger(expected.generation) || expected.generation < 0 || typeof expected.callId !== 'string' || expected.callId.length === 0 || expected.callId.length > 256) throw new ReviewStateRefused('review-state-invalid');
	}
	private completionReceipt(receipt: ReviewCompletionReceipt, callId: string): ReviewCompletionReceipt {
		const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,256}$/.test(value);
		if (receipt.status !== 'completed' || receipt.callId !== callId || !validId(callId) || (receipt.artifactId !== undefined && !validId(receipt.artifactId)) || (receipt.runId !== undefined && !validId(receipt.runId))) throw new ReviewStateRefused('review-state-invalid');
		return { status: 'completed', callId, ...(receipt.artifactId !== undefined ? { artifactId: receipt.artifactId } : {}), ...(receipt.runId !== undefined ? { runId: receipt.runId } : {}) };
	}

	private map(kind: StepKind): Map<string, Entry> {
		const m = this.stores.get(kind);
		if (m === undefined) throw new Error(`unknown step kind '${String(kind)}'`);
		return m;
	}

	private mintSync(kind: StepKind, payload: unknown): string {
		const copied = structuredClone(payload);
		const store = this.map(kind);
		const { maxEntries, ttlMs } = LIFECYCLES[kind];
		const now = this.now();
		for (const [k, v] of store) if (v.review?.claim === undefined && now - v.touchedAt > ttlMs) store.delete(k);
		if (store.size >= maxEntries) {
			const oldest = [...store.entries()].filter(([, e]) => e.review?.claim === undefined).sort((a, b) => a[1].touchedAt - b[1].touchedAt);
			while (store.size >= maxEntries && oldest.length > 0) store.delete(oldest.shift()![0]);
		}
		if (store.size >= maxEntries) throw new ReviewStateRefused('review-state-capacity');
		const token = mintToken();
		store.set(token, { payload: copied, createdAt: now, touchedAt: now });
		if (store.size >= maxEntries / 2) log.warn({ kind, size: store.size, cap: maxEntries }, 'step-state store: entries approaching cap');
		return token;
	}
}

// ---------------------------------------------------------------------------
// Hub bindings
// ---------------------------------------------------------------------------

/** The main thread's hub services for the step-state store. */
export function stepStateHubHandlers(store: SharedStepStateStore): HubHandlers {
	type A = { kind: StepKind; token?: string; payload?: unknown };
	return {
		'step.review.mint': a => { const v = a as { kind: ReviewStateKind; payload: unknown; expected: ReviewStateExpected }; return store.mintReviewState(v.kind, v.payload, v.expected); },
		'step.review.claim': a => store.claimReviewState(a as ReviewStateAccess),
		'step.review.commit': a => { const v = a as { claim: ReviewStateClaim; next: ReviewStateCommit<unknown> }; return store.commitReviewState(v.claim, v.next); },
		'step.review.release': a => { const v = a as { claim: ReviewStateClaim; noSideEffects: true }; return store.releaseReviewClaim(v.claim, v.noSideEffects); },
		'step.review.invalidate': a => store.invalidateReviewClaim(a as ReviewStateClaim),
		'step.mint':    a => store.mint((a as A).kind, (a as A).payload),
		'step.read':    a => store.read((a as A).kind, (a as A).token!),
		'step.update':  a => store.update((a as A).kind, (a as A).token, (a as A).payload),
		'step.release': a => store.release((a as A).kind, (a as A).token!),
		'step.clear':   a => store.clearForTests((a as A).kind),
		'step.size':    a => store.sizeForTests((a as A).kind),
	};
}

/** A worker's view of the step-state store, one hub request per call. */
export class HubStepStateStore implements SharedStepStateStore {
	constructor(private readonly hub: HubClient) {}
	mintReviewState<P>(kind: ReviewStateKind, payload: P, expected: ReviewStateExpected): Promise<string> { return this.hub.request('step.review.mint', { kind, payload, expected }); }
	claimReviewState<P>(access: ReviewStateAccess): Promise<ReviewClaimResult<P>> { return this.hub.request('step.review.claim', access); }
	commitReviewState<P>(claim: ReviewStateClaim, next: ReviewStateCommit<P>): Promise<ReviewCommitResult> { return this.hub.request('step.review.commit', { claim, next }); }
	releaseReviewClaim(claim: ReviewStateClaim, noSideEffects: true): Promise<void> { return this.hub.request('step.review.release', { claim, noSideEffects }); }
	invalidateReviewClaim(claim: ReviewStateClaim): Promise<void> { return this.hub.request('step.review.invalidate', claim); }
	invalidateReviewOwner(_owner: string): Promise<void> { throw new Error('review owner invalidation is main-thread only'); }

	lifecycle(kind: StepKind): StepLifecycle { return LIFECYCLES[kind]; }
	mint<P>(kind: StepKind, payload: P): Promise<string> { return this.hub.request('step.mint', { kind, payload }); }
	read<P>(kind: StepKind, token: string): Promise<StepStateEntry<P> | undefined> { return this.hub.request('step.read', { kind, token }); }
	update<P>(kind: StepKind, token: string | undefined, payload: P): Promise<string> { return this.hub.request('step.update', { kind, token, payload }); }
	release(kind: StepKind, token: string): Promise<void> { return this.hub.request('step.release', { kind, token }); }
	listLocal<P>(_kind: StepKind): readonly StepStateEntry<P>[] { throw new Error('step-state entries are listed on the main thread only'); }
	clearForTests(kind: StepKind): Promise<void> { return this.hub.request('step.clear', { kind }); }
	sizeForTests(kind: StepKind): Promise<number> { return this.hub.request('step.size', { kind }); }
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
