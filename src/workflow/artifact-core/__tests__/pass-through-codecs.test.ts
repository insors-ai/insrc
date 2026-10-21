import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ArtifactIds } from '../../artifact-ids.js';
import type { ArtifactKey } from '../../artifact-ids.js';
import { codecFor, registeredKinds } from '../codecs.js';
import { ArtifactShapeError } from '../types.js';
import type { Reference } from '../types.js';
import { H, alice, artifact, kit } from './store-kit.js';

const ref = (entityId: string, type: string): Reference => ({ entityId, type, relation: 'derived-from' });

describe('pass-through codecs', () => {
	it('a TASK, STORY, EPIC, TASKS and DIAG head is written, read, listed and given a status through the store, and registeredKinds lists sixteen kinds', async () => {
		assert.equal(registeredKinds().length, 16);
		for (const kind of registeredKinds()) assert.doesNotThrow(() => codecFor(kind), kind);

		const k = kit();
		try {
			const keys: ArtifactKey[] = [
				{ kind: 'DEF', epicHash: H },
				{ kind: 'EPIC', epicHash: H },
				{ kind: 'STORY', epicHash: H, story: 's1' },
				{ kind: 'TASKS', epicHash: H, story: 's1' },
				{ kind: 'TASK', epicHash: H, story: 's1', task: 't1' },
				{ kind: 'DIAG', epicHash: H, story: 's1', seq: 1 },
			];
			const STORY = ArtifactIds.make(keys[2]!);
			const TASK = ArtifactIds.make(keys[4]!);
			for (const key of keys) {
				const id = ArtifactIds.make(key);
				const parent = key.kind === 'TASK' ? { parent: ref(STORY, 'STORY') } : {};
				await k.store.write(artifact(id, { payload: { body: { opaque: [1, { two: 2 }] }, citations: [{ any: 'thing' }] }, ...parent }), alice);
				const read = await k.store.read(id);
				assert.deepEqual(read.payload.body, { opaque: [1, { two: 2 }] }, `${key.kind} body is opaque`);
				assert.deepEqual(read.payload.citations, [{ any: 'thing' }]);
				assert.equal(read.lifecycle.revision.number, 1);
			}

			// listed: the Task is a child of its Story
			assert.deepEqual(await k.store.childrenOf(STORY), [TASK]);

			// given a status: a Task moves from draft to approved with its content unchanged
			const task = await k.store.read(TASK);
			await k.store.write({ ...task, lifecycle: { ...task.lifecycle, status: 'approved' } }, alice);
			assert.equal((await k.store.read(TASK)).lifecycle.status, 'approved');
			assert.equal((await k.store.read(TASK)).lifecycle.revision.number, 1);

			// a Task with a wrong parent still fails on its parent first
			await assert.rejects(k.store.write(artifact(TASK, { parent: ref(`STORY-${H}-s2`, 'STORY') }), alice), ArtifactShapeError);
		} finally { k.done(); }
	});
});
