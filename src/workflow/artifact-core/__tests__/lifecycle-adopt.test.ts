/**
 * A raw writer (writeArtifact kind 'content') changes the content of a head that already has history, which leaves the head
 * one revision past its log. LifecycleService.apply logs that revision as an adopted update before it approves, reviews or
 * completes the head; a number raised by hand, a hash mismatch, a log ahead of the head and restored content stay refused.
 * Run: npx tsx --test src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { artifactJsonPath, writeArtifact } from '../../storage.js';
import { History } from '../history.js';
import { LifecycleService } from '../lifecycle-service.js';
import { LifecycleConflictError } from '../types.js';
import type { ChangeLogEntry } from '../types.js';
import { H, alice, artifact, bob, clock, kit } from './store-kit.js';
import type { Kit } from './store-kit.js';
import { STORY, T1, T2, RECORDS, seedEpic, service, stubEvidence } from './lifecycle-kit.js';

const review = { reviewer: bob, party: 'controller' as const, verdict: 'pass' as const, counts: {} };
const logOf = async (k: Kit, id: string): Promise<ChangeLogEntry[]> => (await k.store.readWithHistory(id)).changeLog;
const bytesOf = (k: Kit, id: string): string => readFileSync(artifactJsonPath(k.repo, id), 'utf8');

/** What a raw writer does: read the head, change its body and write it with writeArtifact kind 'content'. */
function rawEdit(k: Kit, id: string, text: string): void {
	const path = artifactJsonPath(k.repo, id);
	const head = JSON.parse(readFileSync(path, 'utf8'));
	head.body = { text };
	writeArtifact(path, head, 'content');
}

const revisionOf = (k: Kit, id: string): number => JSON.parse(bytesOf(k, id)).meta.lifecycle.revision.number;
const adopted = (log: readonly ChangeLogEntry[]): ChangeLogEntry[] => log.filter(e => e.outcome?.result === 'adopted');

async function seeded(k: Kit, n: number): Promise<string> {
	await k.store.write(artifact(`DEF-${H}`), alice);
	const id = `PLAN-${H}-s${n}`;
	await k.store.write(artifact(id), alice);
	return id;
}

describe('LifecycleService adopts a raw content write', () => {
	it('a head moved past its log by a raw content write is approved with one adopted entry before the approve', async () => {
		const k = kit();
		try {
			const id = await seeded(k, 1);
			rawEdit(k, id, 'redrafted by a raw writer');
			assert.equal(revisionOf(k, id), 2, 'the raw write moved the head past its log (revision 1)');
			const svc = service(k, stubEvidence([]));
			const result = await svc.apply(id, 'approve', bob);
			assert.equal(result.lifecycle.status, 'approved');
			const log = await logOf(k, id);
			assert.deepEqual(log.map(e => e.operation), ['create', 'update', 'approve']);
			const [entry] = adopted(log);
			assert.equal(entry?.actor.id, 'insrc:system');
			assert.equal(entry?.actor.kind, 'system');
			assert.equal(entry?.revision?.number, 2);
			assert.equal(entry?.revision?.contentHash, JSON.parse(bytesOf(k, id)).meta.lifecycle.revision.contentHash);
			assert.equal(log[2]?.revision?.number, 2, 'the approve is at the adopted revision');
			assert.equal(adopted(log).length, 1);
		} finally { k.done(); }
	});

	it('the same head is reviewed and then completed with the same adoption', async () => {
		const k = kit();
		try {
			const id = await seeded(k, 1);
			const svc = service(k, stubEvidence([]));
			rawEdit(k, id, 'first redraft');
			await svc.apply(id, 'review', bob, { review });
			assert.deepEqual((await logOf(k, id)).map(e => e.operation), ['create', 'update', 'review']);
			await svc.apply(id, 'approve', bob);
			assert.equal(adopted(await logOf(k, id)).length, 1, 'a head in step adds no entry');
			// approved content changed by a raw writer goes back to draft and is adopted again before the next operation
			rawEdit(k, id, 'second redraft');
			await svc.apply(id, 'approve', bob);
			const log = await logOf(k, id);
			assert.equal(adopted(log).length, 2);
			assert.equal(log[log.length - 2]?.outcome?.result, 'adopted');
			assert.equal(log[log.length - 1]?.operation, 'approve');
			const done = await svc.apply(id, 'complete', bob);
			assert.equal(done.lifecycle.status, 'completed');
			assert.equal(adopted(await logOf(k, id)).length, 2, 'complete on a head in step adopts nothing');
		} finally { k.done(); }
	});

	it('a hand-edited number, a hash mismatch, a log ahead of the head and restored content are refused with nothing written or logged', async () => {
		const k = kit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			const svc = service(k, stubEvidence([]));
			const cases: Array<[string, string, (id: string) => Promise<void> | void]> = [
				['head-ahead-of-log', 'a number raised by hand', id => {
					const head = JSON.parse(bytesOf(k, id)); head.meta.lifecycle.revision.number = 5; writeFileSync(artifactJsonPath(k.repo, id), JSON.stringify(head, null, 2) + '\n');
				}],
				['hash-mismatch', 'a body edited by hand without its hash', id => {
					const head = JSON.parse(bytesOf(k, id)); head.body = { text: 'edited by hand' }; writeFileSync(artifactJsonPath(k.repo, id), JSON.stringify(head, null, 2) + '\n');
				}],
				['log-ahead-of-head', 'a later revision in the log', async id => {
					await new History(k.sidecar).appendLog(id, { id: 'e-ahead', actor: bob, timestamp: 't', operation: 'update', revision: { number: 3, contentHash: H } });
				}],
				['head-ahead-of-log', 'content put back to what was logged', id => { rawEdit(k, id, 'changed'); rawEdit(k, id, 'one'); }],
			];
			let n = 0;
			for (const [reason, what, damage] of cases) {
				const id = `PLAN-${H}-s${++n}`;
				await k.store.write(artifact(id), alice);
				await damage(id);
				const before = { bytes: bytesOf(k, id), log: (await logOf(k, id)).length };
				for (const op of ['approve', 'review', 'complete'] as const) {
					await assert.rejects(svc.apply(id, op, bob, op === 'review' ? { review } : {}), (e: unknown) => e instanceof LifecycleConflictError && e.reason === reason, `${op} on ${what}`);
				}
				assert.equal(bytesOf(k, id), before.bytes, `${what}: the head is untouched`);
				assert.equal((await logOf(k, id)).length, before.log, `${what}: nothing was logged`);
			}
		} finally { k.done(); }
	});

	it('a head with no revision-bearing entry is approved with no adopted entry and two raw writes give one adopted entry', async () => {
		const k = kit();
		const other = kit();
		try {
			const id = await seeded(k, 1);
			// the same head in a repository whose history holds nothing of it
			mkdirSync(dirname(artifactJsonPath(other.repo, id)), { recursive: true });
			copyFileSync(artifactJsonPath(k.repo, id), artifactJsonPath(other.repo, id));
			await other.store.write(artifact(`DEF-${H}`), alice);
			const result = await service(other, stubEvidence([])).apply(id, 'approve', bob);
			assert.equal(result.lifecycle.status, 'approved');
			assert.equal(adopted(await logOf(other, id)).length, 0);

			rawEdit(k, id, 'second');
			rawEdit(k, id, 'third');
			assert.equal(revisionOf(k, id), 3);
			await service(k, stubEvidence([])).apply(id, 'approve', bob);
			const log = await logOf(k, id);
			assert.deepEqual(adopted(log).map(e => e.revision?.number), [3], 'one entry at the last revision; revision 2 is not logged');
			assert.deepEqual(log.map(e => e.operation), ['create', 'update', 'approve']);
		} finally { k.done(); other.done(); }
	});

	it('an adopted entry that cannot be appended fails the operation and a later attempt adopts', async () => {
		const k = kit();
		try {
			const id = await seeded(k, 1);
			rawEdit(k, id, 'redrafted');
			let failures = 1;
			class Failing extends History {
				override async appendLog(target: string, e: ChangeLogEntry): Promise<void> {
					if (failures > 0 && e.outcome?.result === 'adopted') { failures -= 1; throw new Error('injected append failure'); }
					return super.appendLog(target, e);
				}
			}
			const broken = new LifecycleService({ store: k.restart({ history: new Failing(k.sidecar) }), evidence: stubEvidence([]), now: clock() });
			const before = { bytes: bytesOf(k, id), log: (await logOf(k, id)).length };
			await assert.rejects(broken.apply(id, 'approve', bob), /injected append failure/);
			assert.equal(bytesOf(k, id), before.bytes, 'no head was written');
			assert.equal((await logOf(k, id)).length, before.log, 'nothing was logged');
			await broken.apply(id, 'approve', bob);
			assert.equal(adopted(await logOf(k, id)).length, 1, 'the next attempt adopts');
			assert.equal((await k.store.read(id)).lifecycle.status, 'approved');
		} finally { k.done(); }
	});

	it('inspect answers the strict integrity unless the caller is about to approve and asks for adoptable, and logs nothing either way', async () => {
		const k = kit();
		try {
			const id = await seeded(k, 1);
			const byHand = await seeded(k, 2);
			rawEdit(k, id, 'a raw redraft');
			const head = JSON.parse(bytesOf(k, byHand)); head.meta.lifecycle.revision.number = 5; writeFileSync(artifactJsonPath(k.repo, byHand), JSON.stringify(head, null, 2) + '\n');
			const svc = service(k, stubEvidence([]));
			const before = (await logOf(k, id)).length;
			assert.deepEqual((await svc.inspect(id))?.integrity, { ok: false, reason: 'head-ahead-of-log' });
			assert.deepEqual((await svc.inspect(id, { adoptable: true }))?.integrity, { ok: true });
			assert.deepEqual((await svc.inspect(byHand, { adoptable: true }))?.integrity, { ok: false, reason: 'head-ahead-of-log' }, 'a number raised by hand is not adoptable');
			assert.equal((await logOf(k, id)).length, before, 'inspect logs nothing');
		} finally { k.done(); }
	});

	it('a Story completed with a member that has a raw content write follows the same rule', async () => {
		const k = kit();
		const stuck = kit();
		try {
			for (const [kt, edit] of [[k, 'content'], [stuck, 'number']] as const) {
				await seedEpic(kt);
				const member = RECORDS[0]!;
				if (edit === 'content') rawEdit(kt, member, 'a raw redraft of a member');
				else {
					const head = JSON.parse(bytesOf(kt, member)); head.meta.lifecycle.revision.number = 9; writeFileSync(artifactJsonPath(kt.repo, member), JSON.stringify(head, null, 2) + '\n');
				}
			}
			const member = RECORDS[0]!;
			const svc = service(k, stubEvidence([T1, T2]));
			await svc.apply(T1, 'complete', bob);
			const done = await svc.completeIfRolledUp(T2, bob);
			assert.ok(done.completed.includes(STORY), 'the Story is completed');
			assert.equal((await k.store.read(member)).lifecycle.status, 'completed');
			assert.equal(adopted(await logOf(k, member)).length, 1, 'the member is adopted under its own queue slot');

			const refused = service(stuck, stubEvidence([T1, T2]));
			await refused.apply(T1, 'complete', bob);
			await assert.rejects(refused.completeIfRolledUp(T2, bob), (e: unknown) => e instanceof LifecycleConflictError && e.reason === 'head-ahead-of-log');
			assert.equal(adopted(await logOf(stuck, member)).length, 0);
		} finally { k.done(); stuck.done(); }
	});
});
