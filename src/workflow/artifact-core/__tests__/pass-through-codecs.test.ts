import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ArtifactIds } from '../../artifact-ids.js';
import type { ArtifactKey } from '../../artifact-ids.js';
import { codecFor, registeredKinds } from '../codecs.js';
import { ArtifactShapeError } from '../types.js';
import type { Reference } from '../types.js';
import { H, alice, artifact, kit } from './store-kit.js';

const ref = (entityId: string, type: string): Reference => ({ entityId, type, relation: 'derived-from' });

describe('pass-through codecs (EPIC, STORY, DIAG; TASK and TASKS keep a typed body)', () => {
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
			const parents = new Map<string, string>();
			for (const key of keys) {
				const id = ArtifactIds.make(key);
				const expected = ArtifactIds.parentOf(key);
				const parentId = expected === undefined ? undefined : ArtifactIds.make(expected);
				if (parentId !== undefined) parents.set(id, parentId);
				const parent = parentId === undefined || expected === undefined ? {} : { parent: ref(parentId, expected.kind) };
				// a TASK and a TASKS body are typed (s7); the other kinds keep an opaque body
				const body = key.kind === 'TASK' || key.kind === 'TASKS' ? artifact(id).payload.body : { opaque: [1, { two: 2 }] };
				await k.store.write(artifact(id, { payload: { body, citations: [{ any: 'thing' }] }, ...parent }), alice);
				const read = await k.store.read(id);
				assert.deepEqual(read.payload.body, body, `${key.kind} body round-trips`);
				assert.deepEqual(read.payload.citations, [{ any: 'thing' }]);
				assert.equal(read.lifecycle.revision.number, 1);
			}

			for (const key of keys) {
				const id = ArtifactIds.make(key);
				// listed: a head that has a parent is among its parent's children
				const parentId = parents.get(id);
				if (parentId !== undefined) assert.ok((await k.store.childrenOf(parentId)).includes(id), `${key.kind} is listed under ${parentId}`);

				// given a status: draft to approved with the content unchanged moves no revision
				const head = await k.store.read(id);
				await k.store.write({ ...head, lifecycle: { ...head.lifecycle, status: 'approved' } }, alice);
				const approved = await k.store.read(id);
				assert.equal(approved.lifecycle.status, 'approved', key.kind);
				assert.equal(approved.lifecycle.revision.number, 1, key.kind);
			}
			// every kind's own listing, the Epic's and the Story's included
			const listed = async (key: ArtifactKey): Promise<string[]> => [...(await k.store.childrenOf(ArtifactIds.make(key)))];
			assert.deepEqual(await listed(keys[1]!), [STORY], 'the Story is listed under its Epic');
			assert.deepEqual(await listed(keys[2]!), [ArtifactIds.make(keys[5]!), ArtifactIds.make(keys[3]!), TASK].sort(), 'the Story lists its Tasks, Tasks head and Diagram');
			for (const key of [keys[3]!, keys[4]!, keys[5]!]) assert.deepEqual(await listed(key), [], `${key.kind} has no children`);
			assert.ok(parents.has(TASK) && (await k.store.childrenOf(STORY)).includes(TASK));

			// a Task with a wrong parent still fails on its parent first
			await assert.rejects(k.store.write(artifact(TASK, { parent: ref(`STORY-${H}-s2`, 'STORY') }), alice), ArtifactShapeError);
		} finally { k.done(); }
	});
});
