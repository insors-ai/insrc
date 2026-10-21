import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

import { InvalidArtifactKeyError } from '../../artifact-ids.js';
import { artifactJsonPath } from '../../storage.js';
import type { Reference } from '../types.js';
import { H, alice, artifact, kit } from './store-kit.js';

const STORY = `STORY-${H}-s1`;
const parent: Reference = { entityId: STORY, type: 'STORY', relation: 'derived-from' };

describe('ArtifactStore.childrenOfStrict', () => {
	it('childrenOfStrict returns an unreadable child that childrenOf skips', async () => {
		const k = kit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			await k.store.write(artifact(`EPIC-${H}`), alice);
			await k.store.write(artifact(STORY), alice);
			await k.store.write(artifact(`TASK-${H}-s1-t1`, { parent }), alice);
			await k.store.write(artifact(`TASK-${H}-s1-t2`, { parent }), alice);
			// t3 is a head that cannot be parsed; t4 parses but has no body
			writeFileSync(artifactJsonPath(k.repo, `TASK-${H}-s1-t3`), '{ not json');
			writeFileSync(artifactJsonPath(k.repo, `TASK-${H}-s1-t4`), JSON.stringify({ meta: {} }));

			const t1 = `TASK-${H}-s1-t1`;
			const t2 = `TASK-${H}-s1-t2`;
			assert.deepEqual(await k.store.childrenOf(STORY), [t1, t2], 'childrenOf skips what it cannot read');
			assert.deepEqual(await k.store.childrenOfStrict(STORY), { children: [t1, t2], unreadable: [`TASK-${H}-s1-t3`, `TASK-${H}-s1-t4`] });
			// the same answer for a parent with no children of its own: the unreadable heads are still reported
			assert.deepEqual((await k.store.childrenOfStrict(`STORY-${H}-s2`)).children, []);
			assert.equal((await k.store.childrenOfStrict(`STORY-${H}-s2`)).unreadable.length, 2);
			await assert.rejects(k.store.childrenOfStrict('nope'), InvalidArtifactKeyError);
		} finally { k.done(); }
	});
});
