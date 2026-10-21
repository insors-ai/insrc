import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertPlanRows, diffTask, taskPayloadFromRow, validatePlanRows } from '../pure.js';
import { TaskSetError } from '../types.js';
import { citations, row } from './task-kit.js';

describe('task-diff', () => {
	it('a plan row maps to a Task payload, the diff reports an equal Task as unchanged, and row validation rejects a bad size, a duplicate id and an order gap', () => {
		const r = row('t2', 2, { tests: [{ level: 'integration', name: 'a.test.ts: b' }], acceptanceChecks: ['x', 'y'] });
		const payload = taskPayloadFromRow(r);
		assert.deepEqual(payload, { title: 'Task t2', summary: 'does t2', size: 'S', order: 2, acceptanceChecks: ['x', 'y'], tests: [{ level: 'integration', name: 'a.test.ts: b' }], planTaskId: 't2' });
		assert.equal('dependsOn' in payload, false, 'dependencies are References, not payload');

		// an equal Task is unchanged; each differing field is named
		assert.deepEqual(diffTask(payload, r), { unchanged: true, changed: [] });
		assert.deepEqual(diffTask(payload, { ...r, summary: 'other', size: 'L' }), { unchanged: false, changed: ['summary', 'size'] });
		assert.deepEqual(diffTask(payload, { ...r, order: 3 }).changed, ['order']);
		assert.deepEqual(diffTask(payload, { ...r, tests: [] }).changed, ['tests']);

		// good rows pass, with the plan's citations given to the graph check
		const good = [row('t1', 1), row('t2', 2), row('t3', 3)];
		assert.deepEqual(validatePlanRows(good, citations), []);
		assert.doesNotThrow(() => assertPlanRows(good, citations));
		// without the citations the plan's own check reports every row as ungrounded
		assert.ok(validatePlanRows(good, []).some(i => /does not resolve to a citation/.test(i)));

		// a bad size, a duplicate id and an order gap are each reported
		assert.ok(validatePlanRows([row('t1', 1, { size: 'XL' as never })], citations).some(i => /size 'XL'/.test(i)));
		assert.ok(validatePlanRows([row('t1', 1), row('t1', 2)], citations).some(i => /duplicate Task id 't1'/.test(i)));
		assert.ok(validatePlanRows([row('t1', 1), row('t2', 3, { dependsOn: [] })], citations).some(i => /order is not 1\.\.2/.test(i)));
		assert.ok(validatePlanRows([row('t1', 1), row('t2', 1, { dependsOn: [] })], citations).some(i => /order is not 1\.\.2/.test(i)), 'a repeat is a gap too');
		assert.throws(() => assertPlanRows([row('t1', 2, { dependsOn: [] })], citations), TaskSetError);
	});
});
