import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { H, alice, artifact } from '../../artifact-core/__tests__/store-kit.js';
import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { bindArtifact, hasStagedWrite, readBinding, recordPosted, setPendingLink } from '../binding.js';

const LLD = `LLD-${H}-s6`;
const issue = (n: number) => `acme/demo#${n}`;

describe('binding-staged', () => {
	it('a binding, post or attachment patch is refused while the store has a write staged for the artifact, and the staged write then completes with no head-changed-after-stage conflict', async () => {
		const k = durableKit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			await k.store.write(artifact(LLD), alice);
			assert.ok(bindArtifact(k.repo, LLD, issue(7)).ok);
			assert.equal(hasStagedWrite(k.repo, LLD), false);

			// a store write that fails after it staged leaves its operation in the journal
			const current = await k.store.read(LLD);
			k.faults.append = true;
			await assert.rejects(k.store.write({ ...current, payload: { body: { text: 'staged' }, citations: [] } }, alice), /injected append failure/);
			assert.equal(hasStagedWrite(k.repo, LLD), true);

			// every writer refuses, and the head is untouched
			const headBefore = JSON.stringify(readBinding(k.repo, LLD));
			assert.equal(recordPosted(k.repo, LLD, 'design'), false);
			assert.equal(setPendingLink(k.repo, LLD, { parent: { entityId: issue(1), type: 'github:issue', relation: 'tracked-by' }, childId: 3 }), false);
			const bound = bindArtifact(k.repo, `LLD-${H}-s6`, issue(7));
			assert.equal(bound.ok, false);
			assert.equal(!bound.ok && bound.kind, 'staged');
			assert.equal(JSON.stringify(readBinding(k.repo, LLD)), headBefore);

			// the staged write then completes: the next store write finishes it first, with no head-changed-after-stage conflict
			await k.restart().store.write({ ...current, payload: { body: { text: 'next' }, citations: [] } }, alice);
			assert.equal(hasStagedWrite(k.repo, LLD), false);
			const done = await k.store.read(LLD);
			assert.deepEqual(done.payload.body, { text: 'next' });
			assert.equal(done.binding?.reference.entityId, issue(7), 'the binding is still there');

			// with nothing staged the patches work again
			assert.equal(recordPosted(k.repo, LLD, 'design'), true);
		} finally { k.done(); }
	});
});
