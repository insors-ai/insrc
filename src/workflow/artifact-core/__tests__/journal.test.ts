import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { artifactJsonPath, writeAtomic } from '../../storage.js';
import { H, alice, artifact, bob, kit } from './store-kit.js';
import type { Kit } from './store-kit.js';

const LLD = `LLD-${H}-s1`;
const DEF = `DEF-${H}`;

/** A repository with a Define (the anchor) and a created LLD. */
async function seeded(): Promise<Kit> {
	const k = kit();
	await k.store.write(artifact(DEF), alice);
	await k.store.write(artifact(LLD), alice);
	return k;
}
const logOf = async (k: Kit) => (await k.store.readWithHistory(LLD)).changeLog;
const headText = (k: Kit) => readFileSync(artifactJsonPath(k.repo, LLD), 'utf8');
const describedAs = async (k: Kit, description: string) => ({ ...(await k.store.read(LLD)), description });

describe('WriteJournal recovery', () => {
	it('a failure at stage, log append, head replace and clear each leaves the documented state and the next write completes the staged operation once', async () => {
		const k = await seeded();
		try {
			const base = (await logOf(k)).length;               // the create
			const head0 = headText(k);

			// stage fails: nothing logged, head unchanged, nothing pending; a retry works
			k.faults.stage = true;
			await assert.rejects(async () => k.store.write(await describedAs(k, 'one'), alice));
			assert.equal((await logOf(k)).length, base);
			assert.equal(headText(k), head0);
			assert.equal(await k.journal.pending(LLD), undefined);
			await k.store.write(await describedAs(k, 'one'), alice);
			assert.equal((await logOf(k)).length, base + 1);

			// log append fails: staged, head unchanged; the next write completes it under the SAME operation id, once
			const head1 = headText(k);
			k.faults.append = true;
			await assert.rejects(async () => k.store.write(await describedAs(k, 'two'), alice));
			const staged = await k.journal.pending(LLD);
			assert.ok(staged, 'the operation stays staged');
			assert.equal(headText(k), head1, 'the head is unchanged');
			assert.equal((await logOf(k)).length, base + 1, 'nothing was logged');
			await k.store.write(await describedAs(k, 'two'), alice);   // the retry
			const afterAppendRetry = await logOf(k);
			assert.equal(afterAppendRetry.length, base + 2, 'the log shows the write once');
			assert.equal(afterAppendRetry[afterAppendRetry.length - 1]?.id, staged.operationId, 'under the staged operation id');
			assert.equal((await k.store.read(LLD)).description, 'two');
			assert.equal(await k.journal.pending(LLD), undefined);

			// head replace fails after the append: logged, head unchanged, still pending; the next write only finishes the replace
			k.faults.replace = true;
			await assert.rejects(async () => k.store.write(await describedAs(k, 'three'), alice));
			const stagedReplace = await k.journal.pending(LLD);
			assert.ok(stagedReplace);
			assert.equal((await logOf(k)).length, base + 3, 'the entry is in the log');
			assert.equal((await k.store.read(LLD)).description, 'two', 'the head cannot be reached yet');
			await k.store.write(await describedAs(k, 'three'), alice);
			assert.equal((await logOf(k)).length, base + 3, 'no second entry for the same write');
			assert.equal((await k.store.read(LLD)).description, 'three');
			assert.equal(await k.journal.pending(LLD), undefined);

			// clear fails after the head was replaced: the write still resolves; the next write only clears
			k.faults.clear = true;
			await k.store.write(await describedAs(k, 'four'), alice);
			assert.equal((await k.store.read(LLD)).description, 'four');
			const leftover = await k.journal.pending(LLD);
			assert.ok(leftover, 'the journal entry is left behind');
			assert.equal((await logOf(k)).length, base + 4);
			await k.store.write(await describedAs(k, 'four'), alice);   // a no-op write: it only cleans up
			assert.equal(await k.journal.pending(LLD), undefined);
			assert.equal((await logOf(k)).length, base + 4, 'clearing appends nothing');

			// an unrelated write while an operation is pending completes the pending one first
			k.faults.append = true;
			await assert.rejects(async () => k.store.write(await describedAs(k, 'five'), alice));
			const pendingFive = await k.journal.pending(LLD);
			assert.ok(pendingFive);
			await k.store.write(await describedAs(k, 'six'), alice);
			const log = await logOf(k);
			assert.equal(log.length, base + 6, 'both operations are logged, in order');
			assert.equal(log[log.length - 2]?.id, pendingFive.operationId, 'the pending operation came first');
			assert.equal((await k.store.read(LLD)).description, 'six');

			// the operation id is the same for a replay and differs when the bytes or the prior revision differ
			const ids = new Set(log.map(e => e.id));
			assert.equal(ids.size, log.length, 'every logged operation has its own id');
		} finally { k.done(); }
	});

	it('a restart before the append, a retry by a different actor and an identical-head append failure all recover the original entry', async () => {
		const k = await seeded();
		try {
			// restart before the append: a fresh store over the same journal and sidecar finishes the staged write
			k.faults.append = true;
			await assert.rejects(async () => k.store.write(await describedAs(k, 'restarted'), alice));
			const staged = await k.journal.pending(LLD);
			assert.ok(staged);
			const fresh = k.restart();
			await fresh.write(await describedAs(k, 'restarted'), alice);
			let log = await logOf(k);
			assert.equal(log.filter(e => e.id === staged.operationId).length, 1);
			assert.equal(log[log.length - 1]?.actor.id, 'github:alice');
			assert.equal((await fresh.read(LLD)).description, 'restarted');

			// a retry by a different actor recovers the ORIGINAL entry: alice's actor and timestamp, no entry for bob
			k.faults.append = true;
			await assert.rejects(async () => k.store.write(await describedAs(k, 'by alice'), alice));
			const aliceOp = await k.journal.pending(LLD);
			assert.ok(aliceOp);
			await k.store.write(await describedAs(k, 'by alice'), bob);
			log = await logOf(k);
			const recovered = log.find(e => e.id === aliceOp.operationId);
			assert.equal(recovered?.actor.id, 'github:alice');
			assert.equal(recovered?.timestamp, aliceOp.entry.timestamp);
			assert.equal(log.some(e => e.actor.id === 'github:bob'), false, 'the retry added nothing of its own');

			// an append failure where the head already equals the staged bytes: recovery still appends the staged entry
			k.faults.append = true;
			await assert.rejects(async () => k.store.write(await describedAs(k, 'identical'), alice));
			const identical = await k.journal.pending(LLD);
			assert.ok(identical);
			writeAtomic(artifactJsonPath(k.repo, LLD), identical.bytes);        // the head got there without the log
			assert.equal(headText(k), identical.bytes);
			assert.equal((await logOf(k)).some(e => e.id === identical.operationId), false);
			await k.store.write(await describedAs(k, 'identical'), bob);
			log = await logOf(k);
			assert.equal(log.filter(e => e.id === identical.operationId).length, 1, 'the entry is appended exactly once');
			assert.equal(log.find(e => e.id === identical.operationId)?.actor.id, 'github:alice');
			assert.equal(await k.journal.pending(LLD), undefined);
		} finally { k.done(); }
	});
});
