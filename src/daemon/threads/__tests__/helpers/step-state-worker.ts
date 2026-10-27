/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for step-state.test.ts: runs the main thread's step-state operations
// over the hub and reports results.
import { appendFile } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { HubClient } from '../../channel.js';
import { getStepStateStore, HubStepStateStore, installStepStateStore } from '../../step-state.js';
import type { ReviewStateAccess, ReviewStateClaim, ReviewStateExpected, ReviewStateCommit, ReviewStateKind } from '../../review-state-contract.js';
import type { StepKind } from '../../step-state.js';

let fixtureOwner = ''; // Explicit trusted-owner injection for the isolated t8 store fixture only.
installStepStateStore(new HubStepStateStore(new HubClient((workerData as { port: MessagePort }).port), () => fixtureOwner));
parentPort!.on('message', async (m: { op: 'mint' | 'mint-unclonable' | 'read' | 'mint-review' | 'claim' | 'commit' | 'release-claim' | 'invalidate' | 'consume'; kind: StepKind; token?: string | undefined; payload?: unknown | undefined; expected?: ReviewStateExpected | undefined; access?: ReviewStateAccess | undefined; claim?: ReviewStateClaim | undefined; next?: ReviewStateCommit<unknown> | undefined; declaration?: boolean | undefined; answer?: unknown | undefined; failure?: 'before-write' | 'after-write' | undefined; persistencePath?: string | undefined }) => {
	fixtureOwner = m.access?.owner ?? m.claim?.owner ?? '';
	try {
		const store = getStepStateStore();
		if (m.op === 'consume') {
			// Minimal consumer fixture for the store contract; production protocol validation is t10/t12.
			if (m.declaration !== true) throw new Error('missing-declaration');
			const claimed = await store.claimReviewState(m.access!);
			if (claimed.status === 'completed') { parentPort!.postMessage({ ok: true, result: claimed }); return; }
			let writeStarted = false;
			try {
				if (m.answer !== 'accepted') throw new Error('invalid-reply');
				if (m.failure === 'before-write') throw new Error('before-write-failure');
				writeStarted = true;
				await appendFile(m.persistencePath!, 'persisted\n');
				if (m.failure === 'after-write') throw new Error('after-write-failure');
				const result = await store.commitReviewState(claimed.claim, { status: 'completed', receipt: { status: 'completed', callId: claimed.claim.callId, artifactId: 'CR-fixture-s1' } });
				parentPort!.postMessage({ ok: true, result });
			} catch (error) {
				if (writeStarted) await store.invalidateReviewClaim(claimed.claim);
				else await store.releaseReviewClaim(claimed.claim, true);
				throw error;
			}
		}
		else if (m.op === 'mint-review') parentPort!.postMessage({ ok: true, token: await store.mintReviewState(m.kind as ReviewStateKind, m.payload, m.expected!) });
		else if (m.op === 'claim') parentPort!.postMessage({ ok: true, result: await store.claimReviewState(m.access!) });
		else if (m.op === 'commit') parentPort!.postMessage({ ok: true, result: await store.commitReviewState(m.claim!, m.next!) });
		else if (m.op === 'release-claim') { await store.releaseReviewClaim(m.claim!, true); parentPort!.postMessage({ ok: true }); }
		else if (m.op === 'invalidate') { await store.invalidateReviewClaim(m.claim!); parentPort!.postMessage({ ok: true }); }
		else if (m.op === 'mint') parentPort!.postMessage({ ok: true, token: await store.mint(m.kind, m.payload) });
		else if (m.op === 'mint-unclonable') parentPort!.postMessage({ ok: true, token: await store.mint(m.kind, { run: () => 1 }) });
		else parentPort!.postMessage({ ok: true, entry: await store.read(m.kind, m.token!) });
	} catch (e) {
		parentPort!.postMessage({ ok: false, name: (e as Error).name, message: (e as Error).message, evidence: (e as { evidence?: unknown | undefined }).evidence });
	}
});
parentPort!.postMessage({ ok: true, ready: true });
