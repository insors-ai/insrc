import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { nextLifecycle, transition } from '../lifecycle.js';
import { IllegalTransitionError, ReviewRequiredError } from '../types.js';
import type { Actor, Lifecycle, Status } from '../types.js';
import { emptyLifecycle } from '../decode.js';

const by: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const rev: Actor = { id: 'insrc:daemon', kind: 'system', properties: {} };
const ref = { entityId: 'ISSUE-0123456789abcdef-1', type: 'ISSUE', relation: 'cites' as const };
const H = '0123456789abcdef';
const at = '2026-10-21T00:00:00.000Z';

const lcOf = (status: Status, rest: Partial<Lifecycle> = {}): Lifecycle => ({ ...emptyLifecycle(3), status, ...rest });
const art = (kind: string, lifecycle: Lifecycle) => ({ id: kind === 'DEF' || kind === 'HLD' ? `${kind}-${H}` : `${kind}-${H}-s1`, lifecycle });

describe('transition', () => {
	it('sets approval, review, signoff and stale as the table says and refuses a missing detail', async () => {
		const reviewed = nextLifecycle(art('LLD', lcOf('draft')), 'review', rev, at, { review: { reviewer: rev, party: 'daemon', verdict: 'pass', counts: { high: 0 } } });
		assert.equal(reviewed.status, 'draft');
		assert.equal(reviewed.review?.revision, 3);
		assert.equal(reviewed.review?.verdict, 'pass');
		assert.throws(() => nextLifecycle(art('LLD', lcOf('draft')), 'review', rev, at), IllegalTransitionError);

		const approved = nextLifecycle(art('PLAN', lcOf('draft')), 'approve', by, at);
		assert.equal(approved.status, 'approved');
		assert.deepEqual(approved.approval, { revision: 3, by, at });

		const opened = nextLifecycle(art('PLAN', approved), 'open-signoff', by, at, { request: ref });
		assert.equal(opened.status, 'in-signoff');
		assert.equal(opened.signoffs.length, 1);
		assert.equal(opened.signoffs[0]?.state, 'open');
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'open-signoff', by, at), IllegalTransitionError);
		const done = nextLifecycle(art('PLAN', opened), 'signed-off', by, at);
		assert.equal(done.status, 'signed-off');
		assert.equal(done.signoffs[0]?.state, 'completed');
		assert.equal(nextLifecycle(art('PLAN', opened), 'signoff-changes', by, at).status, 'changes-requested');
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'signed-off', by, at), IllegalTransitionError);

		const stale = nextLifecycle(art('PLAN', approved), 'mark-stale', by, at, { upstream: { upstream: ref, upstreamRevision: 4 } });
		assert.equal(stale.status, 'approved');
		assert.equal(stale.stale?.upstreamRevision, 4);
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'mark-stale', by, at), IllegalTransitionError);
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'ack-stale', by, at, { reason: 'r' }), IllegalTransitionError);
		assert.equal(nextLifecycle(art('PLAN', stale), 'ack-stale', by, at, { reason: 'checked' }).stale, undefined);
		assert.throws(() => nextLifecycle(art('PLAN', stale), 'ack-stale', by, at), IllegalTransitionError);

		assert.throws(() => nextLifecycle(art('PLAN', approved), 'withdraw', by, at), IllegalTransitionError);
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'supersede', by, at), IllegalTransitionError);
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'reject', by, at, { reason: ' ' }), IllegalTransitionError);
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'update' as never, by, at), IllegalTransitionError);
		assert.equal(nextLifecycle(art('PLAN', approved), 'complete', by, at).status, 'completed');
		assert.equal(nextLifecycle(art('PLAN', lcOf('draft')), 'complete', by, at, { cascade: true }).status, 'completed');
		assert.throws(() => nextLifecycle(art('PLAN', lcOf('draft')), 'complete', by, at), IllegalTransitionError);
		assert.equal(nextLifecycle(art('PLAN', lcOf('completed')), 'reopen', by, at).status, 'draft');

		// a detail with the wrong shape is refused like a missing one
		assert.throws(() => nextLifecycle(art('LLD', lcOf('draft')), 'review', rev, at, { review: {} as never }), IllegalTransitionError);
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'supersede', by, at, { supersededBy: {} as never }), IllegalTransitionError);
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'open-signoff', by, at, { request: { entityId: '' } as never }), IllegalTransitionError);
		assert.throws(() => nextLifecycle(art('PLAN', approved), 'mark-stale', by, at, { upstream: { upstream: ref, upstreamRevision: 1.5 } }), IllegalTransitionError);

		// the async form reads the clock
		assert.equal((await transition(art('PLAN', lcOf('draft')), 'approve', by)).status, 'approved');
	});

	it('approve on a DEF, HLD or LLD needs a review bound to the current revision or an override, and a PLAN, ISSUE or SPEC needs none', () => {
		for (const kind of ['DEF', 'HLD', 'LLD']) {
			assert.throws(() => nextLifecycle(art(kind, lcOf('draft')), 'approve', by, at), ReviewRequiredError, `${kind} without a review`);
			const stale = lcOf('draft', { review: { revision: 2, reviewer: rev, party: 'daemon', verdict: 'pass', counts: {}, at } });
			assert.throws(() => nextLifecycle(art(kind, stale), 'approve', by, at), ReviewRequiredError, `${kind} with a review of an older revision`);
			const blocked = lcOf('draft', { review: { revision: 3, reviewer: rev, party: 'daemon', verdict: 'block', counts: {}, at } });
			assert.throws(() => nextLifecycle(art(kind, blocked), 'approve', by, at), ReviewRequiredError, `${kind} blocked`);
			const ok = lcOf('draft', { review: { revision: 3, reviewer: rev, party: 'daemon', verdict: 'warn', counts: {}, at } });
			assert.equal(nextLifecycle(art(kind, ok), 'approve', by, at).status, 'approved');
			const overridden = nextLifecycle(art(kind, blocked), 'approve', by, at, { override: { reason: 'accepted' } });
			assert.equal(overridden.approval?.override?.reason, 'accepted');
		}
		for (const kind of ['PLAN', 'ISSUE', 'SPEC']) {
			assert.equal(nextLifecycle(art(kind, lcOf('draft')), 'approve', by, at).status, 'approved', kind);
		}
	});
});
