import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { History } from '../history.js';
import { createMemorySidecar } from '../sidecar.js';
import { ArtifactStore } from '../store.js';
import { InvalidArtifactKeyError } from '../../artifact-ids.js';
import { artifactJsonPath } from '../../storage.js';

const H = '0123456789abcdef';
const STORY = `STORY-${H}-s1`;
const parentOf = (entityId: string, type = 'STORY') => ({ envelope: { description: '', references: [], attachments: [], parent: { entityId, type, relation: 'derived-from' } } });

describe('ArtifactStore.childrenOf', () => {
	it('children are derived from the parent link and are never stored on the parent', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'store-children-'));
		try {
			mkdirSync(join(dir, '.insrc', 'artifacts'), { recursive: true });
			const put = (id: string, content: string) => writeFileSync(artifactJsonPath(dir, id), content);
			const head = (meta: object) => JSON.stringify({ meta, body: {} });
			put(STORY, head({ workflow: 'x' }));
			put(`TASK-${H}-s1-t2`, head(parentOf(STORY)));
			put(`TASK-${H}-s1-t1`, head(parentOf(STORY)));
			put(`TASKS-${H}-s1`, head(parentOf(STORY)));
			put(`TASK-${H}-s2-t1`, head(parentOf(`STORY-${H}-s2`)));
			put(`LLD-${H}-s1`, head({ workflow: 'design.story' }));      // no parent link
			put(`PLAN-${H}-s1`, '{not json');                            // unreadable: skipped
			put(`AMD-${H}-1`, JSON.stringify({ id: 'flat' }));           // unconverted amendment: skipped
			writeFileSync(join(dir, '.insrc', 'artifacts', 'notes.json'), '{}');   // not an artifact id: ignored
			const parentBytes = readFileSync(artifactJsonPath(dir, STORY), 'utf8');

			const store = new ArtifactStore({ repoPath: dir, history: new History(createMemorySidecar()) });
			assert.deepEqual(await store.childrenOf(STORY), [`TASK-${H}-s1-t1`, `TASK-${H}-s1-t2`, `TASKS-${H}-s1`]);
			assert.deepEqual(await store.childrenOf(`STORY-${H}-s3`), []);
			assert.equal(readFileSync(artifactJsonPath(dir, STORY), 'utf8'), parentBytes, 'nothing is stored on the parent');
			await assert.rejects(store.childrenOf('nope'), InvalidArtifactKeyError);

			// no artifact directory at all
			const empty = mkdtempSync(join(tmpdir(), 'store-empty-'));
			try { assert.deepEqual(await new ArtifactStore({ repoPath: empty, history: new History(createMemorySidecar()) }).childrenOf(STORY), []); }
			finally { rmSync(empty, { recursive: true, force: true }); }
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
});
