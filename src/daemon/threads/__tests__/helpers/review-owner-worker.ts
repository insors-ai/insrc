import { parentPort, workerData } from 'node:worker_threads';
import { currentStepContext, runInStepContext } from '../../../../shared/step-context.js';
import { createReviewOwnerContext } from '../../../../shared/review-owner-context.js';
import { createStepCallHandler } from '../../../steps/host.js';
import { directDispatch } from '../../../server.js';
import type { TrustedRpcContext } from '../../../request-context.js';
import { getStepStateStore } from '../../step-state.js';
import { startDaemonWorker } from '../../worker-entry.js';
import type { DaemonWorkerInit } from '../../worker-entry.js';
import { serveRequests } from '../../worker-requests.js';
import type { ReviewStateClaim } from '../../review-state-contract.js';

const hub = startDaemonWorker(workerData as DaemonWorkerInit);
const finishers = new Map<string, () => void>();
parentPort!.on('message', (msg: { finish?: string | undefined }) => { if (msg.finish) finishers.get(msg.finish)?.(); });
const envelope = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], isError: false });
async function operation(args: unknown, signal: AbortSignal, progress: (data: unknown) => void) {
	const p = args as { mode?: string | undefined; token?: string | undefined; claim?: ReviewStateClaim | undefined };
	const owner = currentStepContext()!.reviewOwner!.nonce;
	const store = getStepStateStore();
	if (p.mode === 'attack') {
		let proxy = false, central = false;
		try { await store.commitReviewState(p.claim!, { status: 'completed', receipt: { status: 'completed', callId: p.claim!.callId } }); } catch { proxy = true; }
		try { await hub.request('step.review.commit', { claim: p.claim!, next: { status: 'completed', receipt: { status: 'completed', callId: p.claim!.callId } } }); } catch { central = true; }
		return envelope({ proxy, central });
	}
	const token = p.token ?? await store.mintReviewState('review', {}, { generation: 0, callId: 'call-1' });
	const result = await store.claimReviewState({ kind: 'review', token, generation: 0, callId: 'call-1', owner });
	if (result.status === 'completed') return envelope(result);
	progress({ event: 'claimed', token, owner, claim: result.claim });
	if (p.mode === 'leave') return envelope({ token });
	if (p.mode !== 'complete') {
		await new Promise<void>(resolve => {
			finishers.set(owner, resolve);
			if (p.mode !== 'ignore-cancel') signal.addEventListener('abort', () => resolve(), { once: true });
		});
	}
	try {
		await store.commitReviewState(result.claim, { status: 'completed', receipt: { status: 'completed', callId: 'call-1', artifactId: 'CR-owner-s1' } });
		parentPort!.postMessage({ event: 'committed', owner });
		return envelope({ token });
	} catch {
		parentPort!.postMessage({ event: 'late-blocked', owner });
		return envelope({ blocked: true });
	} finally { finishers.delete(owner); }
}
const host = createStepCallHandler({ insrc_review_step: operation });
serveRequests((workerData as DaemonWorkerInit).hubPort, directDispatch({
	'step.call': async (params, trusted?: TrustedRpcContext) => {
		const signal = trusted?.signal ?? new AbortController().signal;
		const reviewOwner = createReviewOwnerContext(trusted!.reviewOwnerNonce!, signal, trusted?.assertRequestActive);
		return runInStepContext({ cwd: '/tmp', reviewOwner }, () => operation((params as { args: unknown }).args, signal, data => parentPort!.postMessage(data)));
	},
}, { 'step.call': host }));
parentPort!.postMessage('worker-ready');
