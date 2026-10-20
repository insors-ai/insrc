import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { History } from '../history.js';
import { createMemorySidecar } from '../sidecar.js';
import { ArtifactStore } from '../store.js';
import { ArtifactNotFoundError, ArtifactShapeError, HistoryReadError } from '../types.js';
import type { Actor, ChangeLogEntry, Feedback, Lifecycle, Reference } from '../types.js';
import { InvalidArtifactKeyError } from '../../artifact-ids.js';
import { artifactJsonPath } from '../../storage.js';

const H = '0123456789abcdef';
const LLD = `LLD-${H}-s1`;
const actor: Actor = { id: 'github:alice', kind: 'person', properties: {} };

function repo(): { dir: string; put: (id: string, head: object) => void; done: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'store-read-'));
	mkdirSync(join(dir, '.insrc', 'artifacts'), { recursive: true });
	return { dir, put: (id, head) => writeFileSync(artifactJsonPath(dir, id), JSON.stringify(head)), done: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('ArtifactStore read side', () => {
	it('readWithHistory exposes identity, description, parent, references, change log, feedback and lifecycle in one shape for an artifact with non-empty history and feedback', async () => {
		const r = repo();
		try {
			const sidecar = createMemorySidecar();
			const history = new History(sidecar);
			const ref: Reference = { entityId: 'o/r#9', type: 'github:issue', relation: 'tracked-by' };
			const story: Reference = { entityId: `STORY-${H}-s1`, type: 'STORY', relation: 'derived-from' };
			const lifecycle: Lifecycle = { status: 'approved', revision: { number: 2, contentHash: 'h', at: 't', by: actor }, signoffs: [] };
			r.put(LLD, {
				meta: { workflow: 'design.story', revision: 2, lifecycle, envelope: { description: 'the LLD', parent: story, references: [ref], attachments: [] } },
				body: { x: 1 }, citations: [],
			});
			const entry: ChangeLogEntry = { id: 'e1', actor, timestamp: '2026-10-20T10:00:00Z', operation: 'create', revision: { number: 1, contentHash: 'h' } };
			const fb: Feedback = { id: 'f1', text: 'hm', actor, timestamp: '2026-10-20T10:05:00Z', feedback: [], kind: 'comment' };
			await history.appendLog(LLD, entry);
			await history.appendFeedback(LLD, fb);

			const store = new ArtifactStore({ repoPath: r.dir, history });
			const a = await store.readWithHistory(LLD);
			assert.equal(a.id, LLD);
			assert.equal(a.description, 'the LLD');
			assert.deepEqual(a.parent, story);
			assert.deepEqual(a.references, [ref]);
			assert.deepEqual(a.lifecycle, lifecycle);
			assert.deepEqual(a.payload, { body: { x: 1 }, citations: [] });
			assert.deepEqual(a.changeLog, [entry]);
			assert.deepEqual(a.feedback, [fb]);

			// read alone calls no History method and writes nothing
			const before = sidecar.records.length;
			const plain = await store.read(LLD);
			assert.equal('changeLog' in plain, false);
			assert.equal(sidecar.records.length, before);

			// an artifact with no sidecar lines gets empty arrays
			r.put(`PLAN-${H}-s1`, { meta: {}, body: {} });
			const bare = await store.readWithHistory(`PLAN-${H}-s1`);
			assert.deepEqual([bare.changeLog, bare.feedback], [[], []]);

			// errors
			await assert.rejects(store.read('LLD-nope'), InvalidArtifactKeyError);
			await assert.rejects(store.read(`LLD-${H}-s9`), ArtifactNotFoundError);
			r.put(`LLD-${H}-s2`, { id: 'flat' });
			await assert.rejects(store.read(`LLD-${H}-s2`), ArtifactShapeError);
			const broken = new ArtifactStore({ repoPath: r.dir, history: new History({ appendRecord: () => Promise.resolve(), readRecords: () => Promise.reject(new Error('disk')) }) });
			await assert.rejects(broken.readWithHistory(LLD), HistoryReadError);
		} finally { r.done(); }
	});

	it('a head with no envelope or lifecycle part reads an empty part and does not fail', async () => {
		const r = repo();
		try {
			r.put(`HLD-${H}`, { meta: { workflow: 'design.epic', revision: 5 }, body: {} });
			const a = await new ArtifactStore({ repoPath: r.dir, history: new History(createMemorySidecar()) }).read(`HLD-${H}`);
			assert.equal(a.description, '');
			assert.deepEqual(a.references, []);
			assert.deepEqual(a.attachments, []);
			assert.equal(a.lifecycle.status, 'draft');
			assert.equal(a.lifecycle.revision.number, 5);
			assert.deepEqual(a.lifecycle.signoffs, []);
			assert.equal(a.lifecycle.approval, undefined);
			assert.equal(a.lifecycle.review, undefined);
			assert.equal(a.lifecycle.stale, undefined);
		} finally { r.done(); }
	});

	it('a reference names its target, type and relation, external targets are accepted, and the parent chain is given by the parent link', async () => {
		const r = repo();
		try {
			const external: Reference[] = [
				{ entityId: 'owner/repo#12', type: 'github:issue', relation: 'tracked-by' },
				{ entityId: 'src/workflow/storage.ts', type: 'code-path', relation: 'implements', fragment: 'L10-20' },
				{ entityId: 'https://example.com/spec', type: 'url', relation: 'cites', quote: 'q' },
			];
			const story = `STORY-${H}-s1`;
			r.put(`LLD-${H}-s1`, {
				meta: { envelope: { description: 'd', parent: { entityId: story, type: 'STORY', relation: 'derived-from' }, references: external, attachments: [] } },
				body: {},
			});
			const a = await new ArtifactStore({ repoPath: r.dir, history: new History(createMemorySidecar()) }).read(`LLD-${H}-s1`);
			assert.deepEqual(a.references, external);
			assert.deepEqual(a.references.map(x => [x.entityId, x.type, x.relation]), external.map(x => [x.entityId, x.type, x.relation]));
			// the parent is a reference read from the head, one link up the chain
			assert.equal(a.parent?.entityId, story);
			assert.equal(a.parent?.relation, 'derived-from');
		} finally { r.done(); }
	});
});
