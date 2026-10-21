import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { allocateNumber } from '../pure.js';
import type { TasksPayload } from '../types.js';

describe('task-numbers', () => {
	it("the next number only grows and never takes a withdrawn Task's id", () => {
		let tasks: TasksPayload = { planRevision: 1, taskIds: [], nextNumber: 1 };
		const given: string[] = [];
		for (let i = 0; i < 3; i++) { const a = allocateNumber(tasks); given.push(a.taskId); tasks = a.next; }
		assert.deepEqual(given, ['t1', 't2', 't3']);
		assert.deepEqual(tasks, { planRevision: 1, taskIds: ['t1', 't2', 't3'], nextNumber: 4 });

		// a withdrawn Task keeps its id in taskIds, so its number is not given again
		const next = allocateNumber(tasks);
		assert.equal(next.taskId, 't4');
		assert.ok(next.next.nextNumber > tasks.nextNumber, 'nextNumber only grows');

		// even a nextNumber that fell behind the listed ids skips every listed one
		assert.equal(allocateNumber({ planRevision: 1, taskIds: ['t1', 't2', 't3'], nextNumber: 2 }).taskId, 't4');
		// the allocation does not change the payload it was given
		const before = JSON.stringify(tasks);
		allocateNumber(tasks);
		assert.equal(JSON.stringify(tasks), before);
	});
});
