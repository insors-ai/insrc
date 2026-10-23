import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LIFECYCLE_OPERATIONS, LIFECYCLE_TABLE, assertLegalStatusChange, nextLifecycle } from '../lifecycle.js';
import { IllegalTransitionError } from '../types.js';
import type { Actor, Lifecycle, Signoff, Status } from '../types.js';
import { emptyLifecycle } from '../decode.js';

const by: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const ref = { entityId: 'PR-7', type: 'signoff-request', relation: 'tracked-by' as const };
const at = '2026-10-23T00:00:00.000Z';
const earlier: Signoff = { revision: 2, request: ref, state: 'changes-requested', actors: [by], at: '2026-10-22T00:00:00.000Z' };
const changesRequested = (): Lifecycle => ({ ...emptyLifecycle(2), status: 'changes-requested', signoffs: [earlier] });
const art = (lifecycle: Lifecycle) => ({ id: 'LLD-0123456789abcdef-s1', lifecycle });

describe('open-signoff from changes-requested', () => {
	it('open-signoff from changes-requested appends a Signoff entry at the current revision and moves to in-signoff, and every other operation from changes-requested is as before', () => {
		assert.deepEqual(LIFECYCLE_TABLE['open-signoff'].from, ['approved', 'changes-requested']);
		assert.doesNotThrow(() => assertLegalStatusChange('changes-requested', 'in-signoff', 'open-signoff'));
		// no other operation takes changes-requested to in-signoff
		for (const op of LIFECYCLE_OPERATIONS) {
			if (op === 'open-signoff') continue;
			assert.throws(() => assertLegalStatusChange('changes-requested', 'in-signoff', op), IllegalTransitionError, op);
		}

		const reopened = nextLifecycle(art(changesRequested()), 'open-signoff', by, at, { request: ref });
		assert.equal(reopened.status, 'in-signoff');
		assert.equal(reopened.signoffs.length, 2);
		assert.deepEqual(reopened.signoffs[0], earlier);
		assert.deepEqual(reopened.signoffs[1], { revision: 2, request: ref, state: 'open', actors: [], at });
		assert.throws(() => nextLifecycle(art(changesRequested()), 'open-signoff', by, at), IllegalTransitionError);

		// the other steps from changes-requested are unchanged
		const statuses = (from: Status) => LIFECYCLE_OPERATIONS.filter(op => LIFECYCLE_TABLE[op].from.includes(from));
		assert.deepEqual(statuses('changes-requested'), ['open-signoff', 'withdraw', 'supersede', 'mark-stale', 'ack-stale']);
		assert.deepEqual(statuses('approved'), ['reject', 'open-signoff', 'complete', 'withdraw', 'supersede', 'mark-stale', 'ack-stale']);
		assert.deepEqual(statuses('in-signoff'), ['reject', 'signoff-changes', 'signed-off', 'withdraw', 'supersede', 'mark-stale', 'ack-stale']);
	});
});
