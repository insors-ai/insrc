import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ThreadServices } from '../main-services.js';
import { LocalStepStateStore } from '../step-state.js';
import { Router } from '../router.js';
import { Supervisor } from '../supervisor.js';
import { directDispatch } from '../../server.js';
import { RequestLifetime } from '../../request-context.js';
import { wireRequest, type MethodClass } from '../channel.js';
import type { IpcStreamMessage } from '../../../shared/types.js';
import type { ReviewStateClaim } from '../review-state-contract.js';
import { assertReviewOwnerActive } from '../../review-request-owner.js';

async function until(test: () => boolean) {
	for (let i = 0; i < 400; i++) { if (test()) return; await delay(10); }
	throw new Error('timed out waiting for worker fixture');
}

test('real worker connection request and exit cancellation hooks bind and invalidate trusted owners', { timeout: 30000 }, async () => {
	const store = new LocalStepStateStore();
	const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }), store);
	let selected: MethodClass = 'admin';
	const router = new Router({ classOf: () => selected, registry: services.registry, routed: new Set(['admin', 'indexing']), local: directDispatch({}) });
	const supervisor = new Supervisor({ services, router, shutdown: () => { throw new Error('unexpected shutdown'); } });
	let seq = 0;
	const events: Record<string, unknown>[] = [];
	const observe = (worker: { worker: import('node:worker_threads').Worker }) => worker.worker.on('message', m => { if (m && typeof m === 'object') events.push(m as Record<string, unknown>); });
	const send = (args: Record<string, unknown>, stream = true, tracked = false) => {
		const frames: IpcStreamMessage[] = [];
		const lifetime = tracked ? new RequestLifetime() : undefined;
		const cancel = router.forward({ kind: 'request', requestId: `owner-test-${++seq}`, method: 'step.call', params: { tool: 'insrc_review_step', args, context: { cwd: '/tmp', reviewOwner: { nonce: 'forged' } } }, stream,
			trustedContext: { connectionIdentity: `socket-${seq}`, daemonEpoch: 'test' }, ...(lifetime ? { lifetime } : {}) }, e => {
			if (e.kind === 'frame') frames.push(e.frame as IpcStreamMessage); else frames.push({ id: 0, stream: 'done', data: e.result });
		});
		return { frames, cancel, lifetime };
	};
	const claimed = async (request: ReturnType<typeof send>) => {
		await until(() => request.frames.some(f => (f.data as { event?: string | undefined } | undefined)?.event === 'claimed'));
		return request.frames.find(f => (f.data as { event?: string | undefined } | undefined)?.event === 'claimed')!.data as { token: string; owner: string; claim: ReviewStateClaim };
	};
	try {
		const base = { kind: 'request' as const, requestId: 'wire-test', method: 'step.call', params: {}, stream: true };
		assert.throws(() => wireRequest({ ...base, trustedContext: { connectionIdentity: 'c', daemonEpoch: 'e', connectionExecution: {} as never } }), /cannot cross/);
		assert.deepEqual(wireRequest({ ...base, trustedContext: { connectionIdentity: 'c', daemonEpoch: 'e', reviewOwnerNonce: 'opaque', signal: new AbortController().signal } }).trustedContext, { connectionIdentity: 'c', daemonEpoch: 'e', reviewOwnerNonce: 'opaque' });
		const first = await supervisor.start({ name: 'owner-admin', cls: 'admin', script: '__tests__/helpers/review-owner-worker', started: observe });
		const other = await supervisor.start({ name: 'owner-index', cls: 'indexing', script: '__tests__/helpers/review-owner-worker', started: observe });
		const failedDispatch = send({ mode: 'complete', unclonable: () => 1 }, true, true);
		assert.equal(failedDispatch.frames.at(-1)?.stream, 'done', 'synchronous dispatch failure is returned');
		await failedDispatch.lifetime!.completed;
		const waiting = send({ mode: 'hold' }, true, true);
		const held = await claimed(waiting);
		assert.notEqual(held.owner, 'forged'); assertReviewOwnerActive(held.owner);
		selected = 'indexing';
		const attack = send({ mode: 'attack', claim: held.claim });
		await until(() => attack.frames.some(f => f.stream === 'done'));
		const attackResult = JSON.parse((attack.frames.at(-1)!.data as { content: { text: string }[] }).content[0]!.text) as { proxy: boolean; central: boolean };
		assert.deepEqual(attackResult, { proxy: true, central: true }, 'both proxy and real channel binding refuse a foreign owner');
		selected = 'admin';
		waiting.cancel();
		assert.throws(() => assertReviewOwnerActive(held.owner));
		await assert.rejects(store.commitReviewState(held.claim, { status: 'completed', receipt: { status: 'completed', callId: 'call-1' } }), /owner-mismatch|uncertain/);
		await until(() => events.some(e => e['event'] === 'late-blocked' && e['owner'] === held.owner));
		const receiptRequest = send({ mode: 'complete' }); const completed = await claimed(receiptRequest);
		await until(() => receiptRequest.frames.some(f => f.stream === 'done'));
		assert.throws(() => assertReviewOwnerActive(completed.owner));
		selected = 'indexing';
		const replay = send({ mode: 'complete', token: completed.token });
		await until(() => replay.frames.some(f => f.stream === 'done'));
		assert.match(JSON.stringify(replay.frames.at(-1)), /completed/);
		selected = 'admin';
		const abandoned = send({ mode: 'leave' }); const left = await claimed(abandoned);
		await until(() => abandoned.frames.some(f => f.stream === 'done'));
		const retry = send({ mode: 'complete', token: left.token });
		await until(() => retry.frames.some(f => f.stream === 'error'));
		assert.match(JSON.stringify(retry.frames), /uncertain/);
		const death = send({ mode: 'ignore-cancel' }, true, true); const dead = await claimed(death);
		await first.worker.terminate();
		await until(() => supervisor.current('owner-admin')?.threadId !== undefined && supervisor.current('owner-admin')!.threadId !== first.threadId);
		assert.throws(() => assertReviewOwnerActive(dead.owner));
		await assert.rejects(store.commitReviewState(dead.claim, { status: 'completed', receipt: { status: 'completed', callId: 'call-1' } }), /owner-mismatch|uncertain/);
		const unary = send({ mode: 'hold' }, false, true);
		await until(() => events.some(e => e['event'] === 'claimed' && e['owner'] !== held.owner && e['owner'] !== dead.owner));
		const unaryEvent = events.filter(e => e['event'] === 'claimed').at(-1)!;
		unary.lifetime!.abort(); // real IPC socket close aborts this lifetime too
		unary.cancel(); // ordinary unary disconnect must not revoke admitted, uncancelled work
		assertReviewOwnerActive(unaryEvent['owner'] as string);
		supervisor.current('owner-admin')!.worker.postMessage({ finish: unaryEvent['owner'] });
		await until(() => unary.frames.length > 0);
		assert.throws(() => assertReviewOwnerActive(unaryEvent['owner'] as string));
		// Disconnect invalidation is independent of exit and router cancellation.
		selected = 'indexing';
		const disconnected = send({ mode: 'ignore-cancel' }); const gone = await claimed(disconnected);
		other.disconnect();
		assert.throws(() => assertReviewOwnerActive(gone.owner));
	} finally { supervisor.stop(); await supervisor.terminateAll(); }
});
