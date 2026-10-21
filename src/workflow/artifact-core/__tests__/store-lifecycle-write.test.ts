import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { artifactJsonPath } from '../../storage.js';
import { ArtifactShapeError, IllegalTransitionError, LifecycleConflictError, TerminalArtifactError } from '../types.js';
import type { Artifact, Lifecycle, Reference, Status } from '../types.js';
import type { HeadPayload } from '../codecs.js';
import { H, alice, artifact, bob, kit } from './store-kit.js';

const ID = `PLAN-${H}-s1`;
const ref: Reference = { entityId: `ISSUE-${H}`, type: 'ISSUE', relation: 'cites' };

const withLifecycle = (a: Artifact<HeadPayload>, over: Partial<Lifecycle>): Artifact<HeadPayload> => ({ ...a, lifecycle: { ...a.lifecycle, ...over } });

describe('ArtifactStore.write lifecycle rules', () => {
	it('write logs a lifecycle operation with status {from, to}, keeps revision on every entry, and refuses a step outside the table', async () => {
		const k = kit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);   // stamps the work item's anchor
			await k.store.write(artifact(ID), alice);
			const stale = { upstream: ref, upstreamRevision: 2, since: 't' };
			const step = async (over: Partial<Lifecycle>, operation: never, options: object = {}) => {
				await k.store.write(withLifecycle(await k.store.read(ID), over), bob, { operation, ...options });
				return (await k.store.readWithHistory(ID)).changeLog.at(-1)!;
			};

			const approved = await step({ status: 'approved', approval: { revision: 1, by: bob, at: 't' } }, 'approve' as never);
			assert.equal(approved.operation, 'approve');
			assert.deepEqual(approved.status, { from: 'draft', to: 'approved' });

			// mark-stale and ack-stale keep the status, so they log none
			const marked = await step({ stale }, 'mark-stale' as never);
			assert.equal(marked.operation, 'mark-stale');
			assert.equal(marked.status, undefined);
			const acked = await step({ stale: undefined }, 'ack-stale' as never);
			assert.equal(acked.operation, 'ack-stale');
			assert.equal(acked.status, undefined);

			// outcome and references reach the entry
			const completed = await step({ status: 'completed' }, 'complete' as never, { outcome: { result: 'completed', summary: 'all done' }, references: [ref] });
			assert.deepEqual(completed.status, { from: 'approved', to: 'completed' });
			assert.deepEqual(completed.outcome, { result: 'completed', summary: 'all done' });
			assert.deepEqual(completed.references, [ref]);

			// every entry carries the revision {number, contentHash} of the stored head
			const { changeLog, lifecycle } = await k.store.readWithHistory(ID);
			for (const entry of changeLog) {
				assert.equal(entry.revision?.number, 1);
				assert.equal(entry.revision?.contentHash, lifecycle.revision.contentHash);
			}
			assert.match(lifecycle.revision.contentHash, /^[0-9a-f]{64}$/);

			// outside the table: a status the operation cannot make, a step with no operation, an operation that does not fit the status
			const draft = `PLAN-${H}-s2`;
			await k.store.write(artifact(draft), alice);
			const fresh = await k.store.read(draft);
			const jump = (status: Status, options: object) => k.store.write(withLifecycle(fresh, { status }), bob, options);
			await assert.rejects(jump('completed', { operation: 'complete' }), IllegalTransitionError);
			await assert.rejects(jump('completed', {}), IllegalTransitionError);
			await assert.rejects(jump('approved', { operation: 'reject' }), IllegalTransitionError);
			await assert.rejects(k.store.write(fresh, bob, { operation: 'approve' }), IllegalTransitionError);
			// a cascade lets complete start from draft
			await jump('completed', { operation: 'complete', cascade: true });
			assert.equal((await k.store.read(draft)).lifecycle.status, 'completed');
			// a content operation other than create and update is not loggable by a write
			await assert.rejects(k.store.write(artifact(`PLAN-${H}-s3`), alice, { operation: 'delete' }), ArtifactShapeError);
			// a content change on a completed artifact is refused
			const done = await k.store.read(draft);
			await assert.rejects(k.store.write({ ...done, payload: { body: { text: 'two' }, citations: [] } }, bob), TerminalArtifactError);
			// nothing was logged by any refusal
			assert.equal((await k.store.readWithHistory(draft)).changeLog.length, 2);
		} finally { k.done(); }
	});

	it('an ordinary write on a conflicted head is refused and a conflict-resolved write adopts the content', async () => {
		const k = kit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			await k.store.write(artifact(ID), alice);
			const path = artifactJsonPath(k.repo, ID);
			const head = JSON.parse(readFileSync(path, 'utf8'));
			head.body = { text: 'edited by hand' };
			writeFileSync(path, JSON.stringify(head, null, 2) + '\n');

			const current = await k.store.read(ID);
			await assert.rejects(k.store.write({ ...current, description: 'new' }, bob), (e: unknown) => e instanceof LifecycleConflictError && e.reason === 'hash-mismatch' && e.artifactId === ID);
			assert.equal((await k.store.readWithHistory(ID)).changeLog.length, 1, 'the refusal logged nothing');

			// the resolution ignores the content offered and takes the head's, recomputes the hash and logs an update
			await k.store.write({ ...current, payload: { body: { text: 'offered' }, citations: [] } }, bob, { outcome: { result: 'conflict-resolved', summary: 'adopted the hand edit' } });
			const after = await k.store.readWithHistory(ID);
			assert.deepEqual(after.payload.body, { text: 'edited by hand' });
			const last = after.changeLog.at(-1)!;
			assert.equal(last.operation, 'update');
			assert.equal(last.outcome?.result, 'conflict-resolved');
			assert.equal(last.revision?.contentHash, after.lifecycle.revision.contentHash);

			// the head is consistent again, so an ordinary write goes through
			await k.store.write({ ...after, payload: { body: { text: 'next' }, citations: [] } }, bob);
			assert.deepEqual((await k.store.read(ID)).payload.body, { text: 'next' });
		} finally { k.done(); }
	});
});
