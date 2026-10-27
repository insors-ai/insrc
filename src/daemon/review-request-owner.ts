import { randomUUID } from 'node:crypto';
import { isMainThread, type MessagePort } from 'node:worker_threads';
import { getStepStateStore } from './threads/step-state.js';
import { ReviewStateRefused } from './threads/review-state-contract.js';

interface Owner { readonly connection: string; readonly requestId: string; readonly signal?: AbortSignal | undefined; readonly assertActive?: (() => void) | undefined; readonly onAbort?: (() => void) | undefined; }
const owners = new Map<string, Owner>();
const connections = new Set<string>();
const ports = new WeakMap<MessagePort, string>();

/** A fresh nonce per channel generation, independent of worker/thread/session labels. */
export function registerReviewWorkerConnection(port: MessagePort): string {
	const nonce = randomUUID(); connections.add(nonce); ports.set(port, nonce); return nonce;
}
export function reviewWorkerConnection(port: MessagePort): string | undefined { return ports.get(port); }
export function assertReviewOwnerActive(owner: string, connection?: string): void {
	const entry = owners.get(owner);
	if (!entry || !connections.has(entry.connection) || entry.signal?.aborted || (connection !== undefined && entry.connection !== connection)) throw new ReviewStateRefused('review-state-owner-mismatch');
	try { entry.assertActive?.(); } catch { throw new ReviewStateRefused('review-state-owner-mismatch'); }
}
export function retireReviewOwner(owner: string): void {
	const entry = owners.get(owner);
	if (!entry || !owners.delete(owner)) return;
	if (entry.signal && entry.onAbort) entry.signal.removeEventListener('abort', entry.onAbort);
	// Invalidation happens synchronously in the local store before its promise returns.
	void getStepStateStore().invalidateReviewOwner(owner);
}
export function disconnectReviewWorker(connection: string): void {
	connections.delete(connection);
	for (const [nonce, owner] of owners) if (owner.connection === connection) retireReviewOwner(nonce);
}
export function registerReviewRequestOwner(connection: string, requestId: string, signal?: AbortSignal, assertActive?: (() => void)): string {
	if (!connections.has(connection)) throw new ReviewStateRefused('review-state-owner-mismatch');
	const nonce = randomUUID();
	const onAbort = () => retireReviewOwner(nonce);
	owners.set(nonce, { connection, requestId, signal, assertActive, onAbort });
	if (signal) {
		if (signal.aborted) retireReviewOwner(nonce);
		else signal.addEventListener('abort', onAbort, { once: true });
	}
	return nonce;
}
export function registerLocalReviewOwner(signal: AbortSignal, assertActive?: (() => void)): { readonly nonce: string; readonly close: () => void } {
	if (!isMainThread) throw new ReviewStateRefused('review-state-owner-mismatch');
	const connection = randomUUID(); connections.add(connection);
	const nonce = registerReviewRequestOwner(connection, randomUUID(), signal, assertActive);
	return { nonce, close: () => disconnectReviewWorker(connection) };
}
