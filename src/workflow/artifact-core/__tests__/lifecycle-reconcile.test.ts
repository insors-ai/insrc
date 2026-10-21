import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { contentHash, reconcileLifecycle } from '../lifecycle.js';
import type { ContentView } from '../lifecycle.js';
import { IllegalTransitionError, TerminalArtifactError } from '../types.js';
import type { Actor, Lifecycle, Status } from '../types.js';

const alice: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const bob: Actor = { id: 'github:bob', kind: 'person', properties: {} };
const T0 = '2026-10-20T00:00:00.000Z';
const T1 = '2026-10-21T00:00:00.000Z';
const ref = { entityId: 'x', type: 'ISSUE', relation: 'cites' as const };

function view(over: { description?: string; body?: unknown; status?: Status; number?: number; stored?: string | undefined; rest?: Partial<Lifecycle> } = {}): ContentView {
	const description = over.description ?? 'd';
	const payload = { body: over.body ?? { a: 1 }, citations: [] };
	const stored = 'stored' in over ? (over.stored ?? '') : contentHash(description, payload);
	return {
		description, payload,
		lifecycle: { status: over.status ?? 'draft', revision: { number: over.number ?? 1, contentHash: stored, at: T0, by: alice }, signoffs: [], ...(over.rest ?? {}) },
	};
}

describe('reconcileLifecycle', () => {
	it('a create, an identical rewrite, a head with an empty stored hash, a description-only change, a reference-only change and a forged revision', () => {
		const created = reconcileLifecycle(undefined, view({ stored: '' }), 1, alice, T1);
		assert.equal(created.contentChanged, true);
		assert.equal(created.lifecycle.revision.number, 1);
		assert.equal(created.lifecycle.revision.contentHash, contentHash('d', { body: { a: 1 }, citations: [] }));
		assert.equal(created.lifecycle.revision.at, T1);

		const prior = view({ number: 2 });
		const same = reconcileLifecycle(prior, view({ number: 2 }), 2, bob, T1);
		assert.equal(same.contentChanged, false);
		assert.equal(same.lifecycle.revision.number, 2);
		assert.equal(same.lifecycle.revision.at, T0, 'an identical rewrite keeps the revision time and author');
		assert.equal(same.lifecycle.revision.by.id, 'github:alice');

		// a reference-only change is not a content change: the next view differs from the prior only in references and parent
		const withRefs = { ...view({ number: 2 }), references: [ref], parent: ref } as ContentView;
		const refOnly = reconcileLifecycle(prior, withRefs, 2, bob, T1);
		assert.equal(refOnly.contentChanged, false);
		assert.equal(refOnly.lifecycle.revision.number, 2);

		// an empty stored hash on the prior head: its own content decides, so an identical rewrite stays at the number
		const unhashed = reconcileLifecycle(view({ number: 4, stored: '' }), view({ number: 4, stored: '' }), 4, alice, T1);
		assert.equal(unhashed.contentChanged, false);
		assert.equal(unhashed.lifecycle.revision.number, 4);
		assert.equal(unhashed.lifecycle.revision.contentHash, contentHash('d', { body: { a: 1 }, citations: [] }));

		const desc = reconcileLifecycle(prior, view({ number: 2, description: 'other' }), 3, bob, T1);
		assert.equal(desc.contentChanged, true);
		assert.equal(desc.lifecycle.revision.number, 3);
		assert.equal(desc.lifecycle.revision.by.id, 'github:bob');

		// a forged hash and number supplied by the caller are replaced
		const forged = reconcileLifecycle(prior, view({ number: 99, stored: 'f'.repeat(64) }), 2, alice, T1);
		assert.equal(forged.lifecycle.revision.number, 2);
		assert.equal(forged.lifecycle.revision.contentHash, contentHash('d', { body: { a: 1 }, citations: [] }));
	});

	it('reconcileLifecycle after a content change to an approved artifact with a review and a signoff', () => {
		const rest: Partial<Lifecycle> = {
			approval: { revision: 2, by: alice, at: T0 },
			review: { revision: 2, reviewer: alice, party: 'controller', verdict: 'pass', counts: {}, at: T0 },
			signoffs: [{ revision: 2, request: ref, state: 'completed', actors: [alice], at: T0 }],
		};
		const prior = view({ number: 2, status: 'approved', rest });
		const out = reconcileLifecycle(prior, view({ number: 2, status: 'approved', body: { a: 2 }, rest }), 3, bob, T1);
		assert.equal(out.contentChanged, true);
		assert.equal(out.lifecycle.status, 'draft');
		assert.equal(out.lifecycle.revision.number, 3);
		assert.equal(out.lifecycle.approval?.revision, 2);
		assert.equal(out.lifecycle.review?.revision, 2);
		assert.equal(out.lifecycle.signoffs[0]?.revision, 2);
	});

	it('a content change on a terminal artifact and a create that is not draft are refused', () => {
		for (const status of ['completed', 'withdrawn', 'superseded'] as const) {
			assert.throws(() => reconcileLifecycle(view({ status }), view({ status, body: { a: 2 } }), 2, alice, T1), TerminalArtifactError, status);
		}
		assert.throws(() => reconcileLifecycle(undefined, view({ status: 'approved' }), 1, alice, T1), IllegalTransitionError);
		// without a content change a status change must be a table step
		assert.throws(() => reconcileLifecycle(view({ status: 'draft' }), view({ status: 'completed' }), 1, alice, T1), IllegalTransitionError);
		assert.equal(reconcileLifecycle(view({ status: 'draft' }), view({ status: 'approved' }), 1, alice, T1).lifecycle.status, 'approved');
	});
});
