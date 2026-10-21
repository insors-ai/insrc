import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IllegalTransitionError } from '../types.js';
import type { ChangeLogEntry } from '../types.js';
import { H, bob, kit } from './store-kit.js';
import type { Kit } from './store-kit.js';
import { DIAGS, EPIC, RECORDS, STORY, T1, T2, TASKS, seedEpic, service, stubEvidence } from './lifecycle-kit.js';

const completes = (log: readonly ChangeLogEntry[]): ChangeLogEntry[] => log.filter(e => e.operation === 'complete');
const log = async (k: Kit, id: string): Promise<ChangeLogEntry[]> => (await k.store.readWithHistory(id)).changeLog;
const status = async (k: Kit, id: string) => (await k.store.read(id)).lifecycle.status;
const MEMBERS = [...RECORDS, STORY, TASKS, ...DIAGS];

describe('LifecycleService.completeIfRolledUp', () => {
	it('completeIfRolledUp records the Story once, members first and the unit last, and the Epic follows', async () => {
		const k = kit();
		try {
			await seedEpic(k);
			const evidence = stubEvidence([T1, T2]);
			const svc = service(k, evidence);

			// the first Task alone completes only itself: the Story still has an unfinished Task
			assert.deepEqual((await svc.completeIfRolledUp(T1, bob)).completed, [T1]);
			assert.equal(await status(k, STORY), 'draft');

			// a blocked or missing review holds the Story back even when every Task is done
			evidence.review = { kind: 'blocked' };
			assert.deepEqual((await svc.completeIfRolledUp(T2, bob)).completed, [T2]);
			assert.equal(await status(k, STORY), 'draft');
			evidence.review = { kind: 'missing' };
			assert.deepEqual((await svc.completeIfRolledUp(T2, bob)).completed, []);

			// an overridden review completes it, and the reason goes on the Story's entry
			evidence.review = { kind: 'overridden', overrideReason: 'accepted gap' };
			assert.deepEqual((await svc.completeIfRolledUp(T2, bob)).completed, [STORY, EPIC], 'the Story, then the Epic once the Story is done');

			// every member was completed first, the Story and Epic last
			for (const member of MEMBERS.filter(m => m !== STORY)) {
				assert.equal(await status(k, member), 'completed', member);
				assert.equal(completes(await log(k, member)).length, 1, `${member} is completed once`);
			}
			const storyEntry = completes(await log(k, STORY));
			assert.equal(storyEntry.length, 1);
			assert.equal(storyEntry[0]?.outcome?.result, 'completed');
			assert.deepEqual(storyEntry[0]?.outcome?.data, { codeReviewOverride: 'accepted gap' });
			for (const member of [...RECORDS, TASKS, ...DIAGS]) {
				assert.ok((completes(await log(k, member))[0]?.timestamp ?? '') < (storyEntry[0]?.timestamp ?? ''), `${member} is completed before the Story`);
			}
			const epicEntry = completes(await log(k, EPIC));
			assert.equal(epicEntry.length, 1);
			assert.ok((storyEntry[0]?.timestamp ?? '') < (epicEntry[0]?.timestamp ?? ''), 'the Epic follows the Story');
			for (const member of [`DEF-${H}`, `HLD-${H}`]) assert.equal(await status(k, member), 'completed', member);

			// again: nothing new is recorded, and apply says so
			assert.deepEqual((await svc.completeIfRolledUp(T2, bob)).completed, []);
			const again = await svc.apply(STORY, 'complete', bob);
			assert.equal(again.recorded, false);
			assert.equal(completes(await log(k, STORY)).length, 1);
			// Tasks complete through their own roll-up and are not members
			assert.equal(completes(await log(k, T1)).length, 1);
		} finally { k.done(); }
	});

	it('a completion that fails part-way is finished by a retry, and reopen reopens the frozen members and is refused while the Epic is completed', async () => {
		const k = kit();
		try {
			await seedEpic(k);
			const svc = service(k, stubEvidence([T1, T2]));
			// a unit whose completion condition is not met cannot be completed by hand
			await assert.rejects(service(k, stubEvidence([])).apply(T1, 'complete', bob), IllegalTransitionError);
			assert.equal(await status(k, T1), 'draft');
			await svc.completeIfRolledUp(T1, bob);

			// the last Task is completed on its own, so the failure below falls in the Story's cascade and not in the Task's write
			assert.equal((await svc.apply(T2, 'complete', bob)).recorded, true);

			// the first head replace of the Story's cascade fails: a member's entry is logged but its head is still old
			k.faults.replace = true;
			await assert.rejects(svc.completeIfRolledUp(T2, bob), /injected replace failure/);
			assert.notEqual(await status(k, STORY), 'completed', 'the unit is not completed after a failure part-way');
			assert.equal(completes(await log(k, STORY)).length, 0, 'the unit has no complete entry yet');
			const stalled = (await Promise.all(MEMBERS.filter(m => m !== STORY).map(async m => [m, await status(k, m), completes(await log(k, m)).length] as const)))
				.filter(([, , entries]) => entries === 1);
			assert.equal(stalled.length, 1, 'exactly one member has its entry logged');
			assert.notEqual(stalled[0]?.[1], 'completed', 'and its head was not replaced');

			// the retry finishes it, and nothing is recorded twice
			const retry = await svc.completeIfRolledUp(T2, bob);
			assert.deepEqual(retry.completed, [STORY, EPIC]);
			for (const id of [...MEMBERS, EPIC, T1, T2]) {
				assert.equal(await status(k, id), 'completed', id);
				assert.equal(completes(await log(k, id)).length, 1, `${id} has one complete entry`);
			}

			// reopen is refused while the parent is completed
			await assert.rejects(svc.apply(STORY, 'reopen', bob), (e: unknown) => e instanceof IllegalTransitionError && /EPIC/.test(e.message));
			assert.equal(await status(k, STORY), 'completed');

			// reopening the Epic reopens what its completion froze (DEF, HLD), and then the Story can be reopened with its members
			await svc.apply(EPIC, 'reopen', bob);
			for (const id of [EPIC, `DEF-${H}`, `HLD-${H}`]) assert.equal(await status(k, id), 'draft', id);
			assert.equal(await status(k, STORY), 'completed', 'the Epic reopen does not reach the Story');
			await svc.apply(STORY, 'reopen', bob);
			for (const id of MEMBERS) assert.equal(await status(k, id), 'draft', id);
			assert.equal(await status(k, T1), 'completed', 'Tasks are not members, so they stay completed');
			// a completed-once check follows the reopen: the Story can be completed again and is recorded again
			const second = await svc.completeIfRolledUp(T2, bob);
			assert.ok(second.completed.includes(STORY));
			assert.equal(completes(await log(k, STORY)).length, 2);
		} finally { k.done(); }
	});
});
