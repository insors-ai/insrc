import { test } from 'node:test';
import { mkdtempSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { MessageChannel, Worker } from 'node:worker_threads';
import { serveHub } from '../channel.js';
import { LocalStepStateStore, stepStateHubHandlers } from '../step-state.js';
import type { ReviewStateClaim } from '../review-state-contract.js';

function connect(store: LocalStepStateStore) {
	const { port1, port2 } = new MessageChannel();
	const stop = serveHub(port1, stepStateHubHandlers(store));
	const worker = new Worker(new URL('./helpers/step-state-worker-bootstrap.mjs', import.meta.url), { workerData: { port: port2 }, transferList: [port2] });
	const inbox: Record<string, unknown>[] = [];
	const waiting: ((v: Record<string, unknown>) => void)[] = [];
	worker.on('message', (value: Record<string, unknown>) => { const next = waiting.shift(); if (next) next(value); else inbox.push(value); });
	const receive = (): Promise<Record<string, unknown>> => inbox.length ? Promise.resolve(inbox.shift()!) : new Promise(resolve => waiting.push(resolve));
	const ready = receive();
	return {
		ask: async (message: Record<string, unknown>) => { await ready; worker.postMessage(message); return receive(); },
		close: async () => { await worker.terminate(); stop(); port1.close(); },
	};
}

test('two actual hub connections cannot consume or persist the same pending call twice', async () => {
	const store = new LocalStepStateStore();
	const dir = mkdtempSync(join(tmpdir(), 'review-atomic-persist-'));
	const left = connect(store), right = connect(store);
	try {
		for (const kind of ['review', 'code-review'] as const) {
			const minted = await left.ask({ op: 'mint-review', kind, payload: { source: 'private' }, expected: { generation: 0, callId: 'c1' } });
			assert.equal(minted['ok'], true);
			const access = { kind, token: minted['token'], generation: 0, callId: 'c1', owner: 'left' };
			// These are hub operations, not LLM calls; racing them tests the central atomic boundary.
			const results = await Promise.all([left.ask({ op: 'claim', kind, access }), right.ask({ op: 'claim', kind, access: { ...access, owner: 'right' } })]);
			assert.equal(results.filter(r => r['ok']).length, 1);
			assert.match(String(results.find(r => !r['ok'])!['message']), /busy/);
			const wonLeft = results[0]!['ok'] === true;
			const winner = wonLeft ? left : right, loser = wonLeft ? right : left;
			const result = results.find(r => r['ok'])!['result'] as { claim: ReviewStateClaim };
			const claim = result.claim;
			const receipt = { status: 'completed', callId: 'c1', artifactId: 'CR-abc-s1' };
			assert.equal((await loser.ask({ op: 'commit', kind, claim: { ...claim, owner: 'forged' }, next: { status: 'completed', receipt } }))['ok'], false);
			// Proven no-write failure releases; an invalid reply can be corrected.
			assert.equal((await winner.ask({ op: 'release-claim', kind, claim }))['ok'], true);
			const reclaimed = await winner.ask({ op: 'claim', kind, access: { ...access, owner: claim.owner } });
			const current = (reclaimed['result'] as { claim: ReviewStateClaim }).claim;
			let writes = 0;
			appendFileSync(join(dir, kind), 'completed\n');
			writes++; // one persistence operation held under this exclusive claim
			assert.equal((await winner.ask({ op: 'commit', kind, claim: current, next: { status: 'completed', receipt } }))['ok'], true);
			const replay = await loser.ask({ op: 'claim', kind, access: { ...access, owner: 'replay' } });
			assert.deepEqual(replay['result'], { status: 'completed', receipt });
			assert.equal(writes, 1);
			assert.equal(readFileSync(join(dir, kind), 'utf8'), 'completed\n');
			const uncertainToken = await store.mintReviewState(kind, {}, { generation: 0, callId: 'uncertain' });
			const uncertain = await winner.ask({ op: 'claim', kind, access: { ...access, token: uncertainToken, callId: 'uncertain', owner: 'uncertain-owner' } });
			const uncertainClaim = (uncertain['result'] as { claim: ReviewStateClaim }).claim;
			appendFileSync(join(dir, kind), 'uncertain-write\n');
			await store.invalidateReviewOwner('uncertain-owner'); // write may have happened before connection loss
			assert.equal((await winner.ask({ op: 'commit', kind, claim: uncertainClaim, next: { status: 'completed', receipt: { ...receipt, callId: 'uncertain' } } }))['ok'], false);
			assert.equal((await loser.ask({ op: 'claim', kind, access: { ...access, token: uncertainToken, callId: 'uncertain' } }))['ok'], false);
		}
	} finally { await left.close(); await right.close(); rmSync(dir, { recursive: true, force: true }); }
});
