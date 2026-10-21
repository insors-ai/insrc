import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { artifactJsonPath, writeAtomic } from '../../storage.js';
import { LifecycleService } from '../lifecycle-service.js';
import { HistoryEntryError, LifecycleConflictError } from '../types.js';
import { H, alice, artifact } from './store-kit.js';
import { durableKit } from './durable-kit.js';
import { stubEvidence } from './lifecycle-kit.js';
import type { DurableKit } from './durable-kit.js';

const LLD = `LLD-${H}-s1`;
const DEF = `DEF-${H}`;

async function seeded(): Promise<DurableKit> {
	const k = durableKit();
	await k.store.write(artifact(DEF), alice);
	await k.store.write(artifact(LLD), alice);
	return k;
}
const logOf = async (k: DurableKit) => (await k.store.readWithHistory(LLD)).changeLog;
const headText = (k: DurableKit) => readFileSync(artifactJsonPath(k.repo, LLD), 'utf8');
const described = async (k: DurableKit, description: string) => ({ ...(await k.store.read(LLD)), description });

describe('journal-recovery-durable', () => {
	it('a staged write is finished at each crash point and refused with LifecycleConflictError when the head moved on, and the head is never overwritten', async () => {
		const k = await seeded();
		try {
			const base = (await logOf(k)).length;

			// Crash before the append: staged, nothing logged, head unchanged. A restarted store finishes it once.
			k.faults.append = true;
			await assert.rejects(async () => k.store.write(await described(k, 'one'), alice));
			const stagedOne = await k.journal.pending(LLD);
			assert.ok(stagedOne);
			let restarted = k.restart();
			await restarted.store.write(await described(restarted, 'one'), alice);
			assert.equal((await logOf(restarted)).length, base + 1);
			assert.equal((await logOf(restarted)).at(-1)?.id, stagedOne.operationId);
			assert.equal(await restarted.journal.pending(LLD), undefined);

			// Crash after the append, before the replace.
			restarted.faults.replace = true;
			await assert.rejects(async () => restarted.store.write(await described(restarted, 'two'), alice));
			assert.equal((await logOf(restarted)).length, base + 2);
			restarted = restarted.restart();
			assert.equal((await restarted.store.read(LLD)).description, 'one');
			await restarted.store.write(await described(restarted, 'two'), alice);
			assert.equal((await restarted.store.read(LLD)).description, 'two');
			assert.equal((await logOf(restarted)).length, base + 2, 'the entry is not logged twice');

			// Crash after the replace, before the clear.
			restarted.faults.clear = true;
			await restarted.store.write(await described(restarted, 'three'), alice);
			assert.ok(await restarted.journal.pending(LLD));
			restarted = restarted.restart();
			await restarted.store.write(await described(restarted, 'three'), alice);
			assert.equal(await restarted.journal.pending(LLD), undefined);
			assert.equal((await logOf(restarted)).length, base + 3);

			// The head moved on after the stage (a merge, an editor): the staged bytes never overwrite it.
			restarted.faults.append = true;
			await assert.rejects(async () => restarted.store.write(await described(restarted, 'four'), alice));
			const moved = headText(restarted).replace('"three"', '"edited elsewhere"');
			assert.notEqual(moved, headText(restarted));
			writeAtomic(artifactJsonPath(restarted.repo, LLD), moved);
			const logLength = (await logOf(restarted)).length;
			await assert.rejects(async () => restarted.restart().store.write(await described(restarted, 'five'), alice), LifecycleConflictError);
			assert.equal(headText(restarted), moved, 'the head is never overwritten');
			assert.ok(await restarted.journal.pending(LLD), 'the journal file is kept');
			assert.equal((await logOf(restarted)).length, logLength, 'the staged entry was not appended');
		} finally { k.done(); }
	});

	it('an oversized entry is rejected before it is staged and a later valid write of the artifact goes through', async () => {
		const k = await seeded();
		try {
			const base = (await logOf(k)).length;
			const head = headText(k);
			await assert.rejects(
				async () => k.store.write(await described(k, 'big'), alice, { outcome: { result: 'noted', summary: 'x'.repeat(300 * 1024) } }),
				HistoryEntryError,
			);
			assert.equal(await k.journal.pending(LLD), undefined, 'nothing was staged');
			assert.equal(headText(k), head);
			await k.store.write(await described(k, 'small'), alice);
			assert.equal((await k.store.read(LLD)).description, 'small');
			assert.equal((await logOf(k)).length, base + 1);
		} finally { k.done(); }
	});

	it('LifecycleService.inspect finishes a staged write before it reads', async () => {
		const k = await seeded();
		try {
			// A crash between the log append and the head replace leaves the log ahead of the head.
			k.faults.replace = true;
			await assert.rejects(async () => k.store.write(await described(k, 'staged'), alice));
			const restarted = k.restart();
			assert.ok(await restarted.journal.pending(LLD));
			const service = new LifecycleService({ store: restarted.store, evidence: stubEvidence([]) });
			const state = await service.inspect(LLD);
			assert.equal(state?.integrity.ok, true, 'the head and the log agree');
			assert.equal((await restarted.store.read(LLD)).description, 'staged');
			assert.equal(await restarted.journal.pending(LLD), undefined);
		} finally { k.done(); }
	});

	it('an ordinary write on an artifact whose log is ahead of its head is refused and a conflict-resolved write is accepted', async () => {
		const k = await seeded();
		try {
			// A merge brought in a log entry of a later revision than the head git kept.
			const head = await k.store.read(LLD);
			const tail = (await logOf(k)).at(-1);
			assert.ok(tail?.revision);
			await k.sidecar.appendRecord('log', {
				artifactId: LLD,
				entry: { ...tail, id: 'merged-from-other-clone', timestamp: new Date(Date.parse(tail.timestamp) + 1).toISOString(), revision: { number: tail.revision.number + 1, contentHash: tail.revision.contentHash } },
			});
			const before = headText(k);
			await assert.rejects(async () => k.store.write({ ...head, description: 'ordinary' }, alice), (err: unknown) => err instanceof LifecycleConflictError && err.reason === 'log-ahead-of-head');
			assert.equal(headText(k), before);
			// A conflict-resolved write adopts the head's content and records the resolution in the log.
			await k.store.write({ ...head, description: 'resolved' }, alice, { outcome: { result: 'conflict-resolved', summary: 'the merged log was reviewed' } });
			const resolution = (await logOf(k)).at(-1);
			assert.equal(resolution?.outcome?.result, 'conflict-resolved');
			assert.equal((await new LifecycleService({ store: k.store, evidence: stubEvidence([]) }).inspect(LLD))?.integrity.ok, true, 'the head and the log agree again');
			await k.store.write({ ...head, description: 'after' }, alice);
		} finally { k.done(); }
	});
});
