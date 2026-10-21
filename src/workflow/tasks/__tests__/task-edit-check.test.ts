import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkTaskEdit } from '../pure.js';
import { TaskStructureError } from '../types.js';

describe('task-edit-check', () => {
	it('a patch that names order or a dependency, or a Task that is completed or withdrawn, is refused with a pointer to a re-plan', () => {
		// the editable fields pass on an open Task
		for (const status of ['draft', 'approved', 'pending-review', 'in-signoff', 'changes-requested'] as const) {
			assert.doesNotThrow(() => checkTaskEdit({ title: 'a', summary: 'b', size: 'M', acceptanceChecks: ['c'], tests: [] }, status), status);
		}
		assert.doesNotThrow(() => checkTaskEdit({}, 'draft'), 'an empty patch is not structural');

		// order, a dependency, the plan row key and an unknown field are refused, with the pointer
		for (const patch of [{ order: 3 }, { dependsOn: ['t1'] }, { planTaskId: 't9' }, { nonsense: 1 }, { summary: 'x', order: 2 }]) {
			assert.throws(() => checkTaskEdit(patch, 'draft'), (e: Error) => e instanceof TaskStructureError && /re-plann?ing|re-plan/.test(e.message) && /plan workflow/.test(e.message), JSON.stringify(patch));
		}
		assert.throws(() => checkTaskEdit({ order: 3 }, 'draft'), /'order' cannot be edited/);

		// a completed, withdrawn or superseded Task is refused, naming the status
		for (const status of ['completed', 'withdrawn', 'superseded'] as const) {
			assert.throws(() => checkTaskEdit({ summary: 'x' }, status), (e: Error) => e instanceof TaskStructureError && e.message.includes(status) && /re-plan/.test(e.message), status);
		}
	});
});
