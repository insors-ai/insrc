import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ArtifactNotFoundError, IllegalTransitionError } from '../types.js';
import type { Artifact, Lifecycle } from '../types.js';
import type { HeadPayload } from '../codecs.js';
import { H, alice, artifact, bob, kit } from './store-kit.js';

const ID = `PLAN-${H}-s1`;
const ref = { entityId: `ISSUE-${H}`, type: 'ISSUE', relation: 'cites' as const };
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const lifecycleOf = (a: Artifact<HeadPayload>, over: Partial<Lifecycle>): Artifact<HeadPayload> => ({ ...a, lifecycle: { ...a.lifecycle, ...over } });

async function seeded() {
	const k = kit();
	await k.store.write(artifact(`DEF-${H}`), alice);
	await k.store.write(artifact(ID), alice);
	return k;
}

describe('ArtifactStore.update', () => {
	it('update runs read, mutate and write inside the queue, awaits an async mutate, keeps two competing operations in order and writes nothing when mutate throws', async () => {
		const k = await seeded();
		try {
			const order: string[] = [];
			const approve = k.store.update(ID, bob, async current => {
				order.push('approve:start');
				await pause(40);   // a slow mutate: the competing update must wait for it
				order.push('approve:end');
				return { next: lifecycleOf(current, { status: 'approved', approval: { revision: 1, by: bob, at: 't' } }), options: { operation: 'approve' } };
			});
			const signoff = k.store.update(ID, bob, current => {
				order.push(`signoff:sees-${current.lifecycle.status}`);
				return {
					next: lifecycleOf(current, { status: 'in-signoff', signoffs: [{ revision: 1, request: ref, state: 'open', actors: [], at: 't' }] }),
					options: { operation: 'open-signoff' },
				};
			});
			assert.deepEqual(await Promise.all([approve, signoff]), [true, true]);
			assert.deepEqual(order, ['approve:start', 'approve:end', 'signoff:sees-approved']);
			const { changeLog, lifecycle } = await k.store.readWithHistory(ID);
			assert.deepEqual(changeLog.map(e => e.operation), ['create', 'approve', 'open-signoff']);
			assert.equal(lifecycle.status, 'in-signoff');
			assert.equal(lifecycle.signoffs.length, 1);

			// nothing to do: false and no entry
			assert.equal(await k.store.update(ID, bob, () => undefined), false);
			// a mutate that throws writes nothing, and the queue keeps working
			const before = await k.store.readWithHistory(ID);
			await assert.rejects(k.store.update(ID, bob, async () => { await pause(5); throw new Error('mutate failed'); }), /mutate failed/);
			await assert.rejects(k.store.update(ID, bob, current => ({ next: lifecycleOf(current, { status: 'draft' }), options: { operation: 'approve' } })), IllegalTransitionError);
			const after = await k.store.readWithHistory(ID);
			assert.equal(after.changeLog.length, before.changeLog.length);
			assert.deepEqual(after.lifecycle, before.lifecycle);
			assert.equal(await k.store.update(ID, bob, current => ({ next: lifecycleOf(current, { status: 'changes-requested' }), options: { operation: 'signoff-changes' } })), true);

			await assert.rejects(k.store.update(`PLAN-${H}-s9`, bob, () => undefined), ArtifactNotFoundError);
		} finally { k.done(); }
	});

	it('a head replace that failed after the log append is finished before update reads, and the retry is logged once', async () => {
		const k = await seeded();
		try {
			const current = await k.store.read(ID);
			k.faults.replace = true;
			await assert.rejects(k.store.write({ ...current, payload: { body: { text: 'two' }, citations: [] } }, bob), /injected replace failure/);
			// the entry is in the log and the head is still the old one
			assert.equal((await k.store.readWithHistory(ID)).changeLog.length, 2);
			assert.deepEqual((await k.store.read(ID)).payload.body, { text: 'one' });

			let seen: { body: unknown; entries: number } | undefined;
			const wrote = await k.store.update(ID, bob, c => {
				seen = { body: c.payload.body, entries: c.changeLog.length };
				return { next: lifecycleOf(c, { status: 'approved', approval: { revision: 2, by: bob, at: 't' } }), options: { operation: 'approve' } };
			});
			assert.equal(wrote, true);
			assert.deepEqual(seen, { body: { text: 'two' }, entries: 2 }, 'mutate saw the finished head and the appended entry');
			const { changeLog } = await k.store.readWithHistory(ID);
			assert.deepEqual(changeLog.map(e => e.operation), ['create', 'update', 'approve']);
			assert.deepEqual((await k.store.read(ID)).payload.body, { text: 'two' });
		} finally { k.done(); }
	});
});
