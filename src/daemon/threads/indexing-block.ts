/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The indexing shared block (Epic 86197ac6, Story s2): two words the index
 * queue on the code-indexing worker writes at every change and the
 * document-summary worker reads, so a summary yields to code work across
 * threads without a request.
 *
 * - code-busy: the index lane has a job running or queued.
 * - stopping: the queue was stopped (shutdown).
 *
 * A version word is bumped on every change; waiters wait on it with
 * Atomics.waitAsync, never blocking their thread.
 */

/** Atomics.waitAsync (Node 16+); the project's TypeScript lib target predates its declaration. */
type WaitAsyncResult = { readonly async: false; readonly value: 'not-equal' | 'timed-out' } | { readonly async: true; readonly value: Promise<'ok' | 'timed-out'> };
const waitAsync = (Atomics as unknown as { waitAsync(typed: Int32Array, index: number, value: number, timeoutMs: number): WaitAsyncResult }).waitAsync;

const W_CODE_BUSY = 0;
const W_STOPPING  = 1;
const W_VERSION   = 2;
const WORDS       = 3;

/** A wait is re-armed at least this often, so it and its keep-alive timer are finite. */
const WAIT_SLICE_MS = 60_000;

/** Create the block. The main thread creates it once and passes it to both indexing workers. */
export function createIndexingBlock(): SharedArrayBuffer {
	return new SharedArrayBuffer(WORDS * 4);
}

export class IndexingBlock {
	private readonly words: Int32Array;

	constructor(readonly block: SharedArrayBuffer) {
		this.words = new Int32Array(block, 0, WORDS);
	}

	/** The index lane has a job running or queued. */
	get codeBusy(): boolean { return Atomics.load(this.words, W_CODE_BUSY) !== 0; }

	/** The queue was stopped. */
	get stopping(): boolean { return Atomics.load(this.words, W_STOPPING) !== 0; }

	setCodeBusy(busy: boolean): void {
		if (Atomics.exchange(this.words, W_CODE_BUSY, busy ? 1 : 0) !== (busy ? 1 : 0)) this.bump();
	}

	setStopping(): void {
		if (Atomics.exchange(this.words, W_STOPPING, 1) !== 1) this.bump();
	}

	/** Resolves once code work is done or the queue is stopping (at once when either holds). */
	async waitForCodeIdle(): Promise<void> {
		for (;;) {
			const version = Atomics.load(this.words, W_VERSION);
			if (!this.codeBusy || this.stopping) return;
			const wait = waitAsync(this.words, W_VERSION, version, WAIT_SLICE_MS);
			if (!wait.async) continue;
			// A pending waitAsync does not keep a thread alive; a timer for its length does.
			const keepAlive = setTimeout(() => {}, WAIT_SLICE_MS);
			try { await wait.value; } finally { clearTimeout(keepAlive); }
		}
	}

	private bump(): void {
		Atomics.add(this.words, W_VERSION, 1);
		Atomics.notify(this.words, W_VERSION);
	}
}
