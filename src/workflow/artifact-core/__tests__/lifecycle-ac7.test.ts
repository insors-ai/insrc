import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { artifactJsonPath, writeArtifact } from '../../storage.js';
import { decodeArtifactHead } from '../decode.js';
import { contentHash, reconcileLifecycle } from '../lifecycle.js';
import type { ContentView } from '../lifecycle.js';
import type { ChangeLogEntry, Lifecycle, Status } from '../types.js';
import { H, alice, artifact, bob, kit } from './store-kit.js';
import { service, stubEvidence } from './lifecycle-kit.js';

const ID = `PLAN-${H}-s1`;
const T0 = '2026-10-20T00:00:00.000Z';
const T1 = '2026-10-21T00:00:00.000Z';

/** The status a log replays to: each entry that names a status change moves it. */
const replay = (log: readonly ChangeLogEntry[]): Status => log.reduce<Status>((s, e) => (e.status !== undefined ? e.status.to as Status : s), 'draft');

describe('ac7: a content change to an approved artifact', () => {
	it('after a content change to an approved artifact the status is draft, the revision moved, and the earlier approval and review keep their original revision numbers (unit, then through LifecycleService and readWithHistory, then through writeArtifact)', async () => {
		// unit: the pure rule
		const content = { body: { a: 1 }, citations: [] };
		const approved: Lifecycle = {
			status: 'approved', revision: { number: 1, contentHash: contentHash('d', content), at: T0, by: alice }, signoffs: [],
			approval: { revision: 1, by: alice, at: T0 },
			review: { revision: 1, reviewer: bob, party: 'controller', verdict: 'pass', counts: {}, at: T0 },
		};
		const view = (c: typeof content, lifecycle: Lifecycle): ContentView => ({ description: 'd', payload: c, lifecycle });
		const pure = reconcileLifecycle(view(content, approved), view({ body: { a: 2 }, citations: [] }, approved), 2, bob, T1);
		assert.equal(pure.lifecycle.status, 'draft');
		assert.equal(pure.lifecycle.revision.number, 2);
		assert.equal(pure.lifecycle.approval?.revision, 1);
		assert.equal(pure.lifecycle.review?.revision, 1);

		// through the service and the store
		const k = kit();
		try {
			const svc = service(k, stubEvidence([]));
			await k.store.write(artifact(`DEF-${H}`), alice);
			await k.store.write(artifact(ID), alice);
			await svc.apply(ID, 'review', bob, { review: { reviewer: bob, party: 'controller', verdict: 'pass', counts: {} } });
			await svc.apply(ID, 'approve', bob);
			assert.equal((await k.store.read(ID)).lifecycle.status, 'approved');

			const head = await k.store.read(ID);
			await k.store.write({ ...head, payload: { body: { text: 'changed' }, citations: [] } }, alice);
			const after = await k.store.readWithHistory(ID);
			assert.equal(after.lifecycle.status, 'draft');
			assert.equal(after.lifecycle.revision.number, 2);
			assert.equal(after.lifecycle.approval?.revision, 1, 'the approval stays at the revision it was made at');
			assert.equal(after.lifecycle.review?.revision, 1, 'so does the review');
			assert.deepEqual(after.changeLog.map(e => e.operation), ['create', 'review', 'approve', 'update']);
			assert.deepEqual(after.changeLog.at(-1)?.status, { from: 'approved', to: 'draft' });
			assert.equal(after.changeLog.at(-1)?.revision?.number, 2);
			assert.equal(replay(after.changeLog), after.lifecycle.status, 'the log replays to the same status');
			// the approval no longer covers the head: approve is needed again, and the review is of an older revision
			assert.notEqual(after.lifecycle.review?.revision, after.lifecycle.revision.number);
		} finally { k.done(); }

		// through writeArtifact, the writer the BUILD hook and the review auto-fix use
		const k2 = kit();
		try {
			const path = artifactJsonPath(k2.repo, ID);
			const head = (text: string, lifecycle: Lifecycle) => ({ meta: { workflow: 'plan', envelope: { description: 'd', references: [], attachments: [] }, lifecycle }, body: { text }, citations: [] });
			writeArtifact(path, head('one', { ...approved, status: 'draft', approval: undefined }), 'content');
			const stored = decodeArtifactHead(ID, readFileSync(path, 'utf8')).artifact.lifecycle;
			writeArtifact(path, head('one', { ...stored, status: 'approved', approval: { revision: 1, by: alice, at: T0 }, review: approved.review }), 'meta-only');
			assert.equal(decodeArtifactHead(ID, readFileSync(path, 'utf8')).artifact.lifecycle.status, 'approved');
			writeArtifact(path, head('two', decodeArtifactHead(ID, readFileSync(path, 'utf8')).artifact.lifecycle), 'content');
			const written = decodeArtifactHead(ID, readFileSync(path, 'utf8')).artifact.lifecycle;
			assert.equal(written.status, 'draft');
			assert.equal(written.revision.number, 2);
			assert.equal(written.approval?.revision, 1);
			assert.equal(written.review?.revision, 1, 'the review stays at the revision it was made at');
			assert.equal(written.revision.contentHash, contentHash('d', { body: { text: 'two' }, citations: [] }));
		} finally { k2.done(); }
	});
});
