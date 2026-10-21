import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LIFECYCLE_OPERATIONS, LIFECYCLE_TABLE, assertLegalStatusChange, nextLifecycle } from '../lifecycle.js';
import type { LifecycleOperation } from '../lifecycle.js';
import { IllegalTransitionError } from '../types.js';
import type { Actor, Lifecycle, Status } from '../types.js';
import { emptyLifecycle } from '../decode.js';

const STATUSES: readonly Status[] = ['draft', 'pending-review', 'approved', 'in-signoff', 'changes-requested', 'signed-off', 'rejected', 'completed', 'withdrawn', 'superseded'];
const by: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const ref = { entityId: 'x', type: 'ISSUE', relation: 'cites' as const };

describe('lifecycle table', () => {
	it('every lifecycle operation from every status lands where the closed table says or throws IllegalTransitionError', () => {
		assert.equal(LIFECYCLE_OPERATIONS.length, 13);
		assert.equal(STATUSES.length, 10);
		for (const op of LIFECYCLE_OPERATIONS) {
			for (const from of STATUSES) {
				const step = LIFECYCLE_TABLE[op];
				const legal = step.from.includes(from);
				const target = step.to === 'same' ? from : step.to;
				const label = `${op} from ${from}`;
				if (legal) assert.doesNotThrow(() => assertLegalStatusChange(from, target, op), label);
				else assert.throws(() => assertLegalStatusChange(from, target, op), IllegalTransitionError, label);
				for (const to of STATUSES) {
					if (legal && to === target) continue;
					assert.throws(() => assertLegalStatusChange(from, to, op), IllegalTransitionError, `${label} to ${to}`);
				}
			}
		}
		assert.throws(() => assertLegalStatusChange('draft', 'draft', 'create' as LifecycleOperation), IllegalTransitionError);
		// the cascade lets complete start from any non-terminal status, and nothing else
		assert.doesNotThrow(() => assertLegalStatusChange('draft', 'completed', 'complete', true));
		assert.throws(() => assertLegalStatusChange('withdrawn', 'completed', 'complete', true), IllegalTransitionError);
		// with no operation any step of the table will do, and staying put is fine
		assert.doesNotThrow(() => assertLegalStatusChange('draft', 'approved'));
		assert.doesNotThrow(() => assertLegalStatusChange('approved', 'approved'));
		assert.throws(() => assertLegalStatusChange('draft', 'completed'), IllegalTransitionError);
		// nextLifecycle agrees with the table for every operation that needs no detail beyond a reason
		const lc: Lifecycle = emptyLifecycle(1);
		for (const from of STATUSES) {
			const base = { id: 'PLAN-0123456789abcdef-s1', lifecycle: { ...lc, status: from } };
			const legal = LIFECYCLE_TABLE['withdraw'].from.includes(from);
			const call = () => nextLifecycle(base, 'withdraw', by, 't', { reason: 'r' });
			if (legal) assert.equal(call().status, 'withdrawn'); else assert.throws(call, IllegalTransitionError);
		}
		assert.equal(nextLifecycle({ id: 'PLAN-0123456789abcdef-s1', lifecycle: { ...lc, status: 'approved' } }, 'supersede', by, 't', { supersededBy: ref }).status, 'superseded');
	});
});
