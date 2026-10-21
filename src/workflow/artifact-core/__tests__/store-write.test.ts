import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ArtifactIds } from '../../artifact-ids.js';
import type { ArtifactIdKind, ArtifactKey } from '../../artifact-ids.js';
import { artifactJsonPath, workItemAnchorCreatedAt } from '../../storage.js';
import { renderDefineMarkdown } from '../../artifacts/define.js';
import type { DefineArtifact } from '../../artifacts/define.js';
import { registeredKinds } from '../codecs.js';
import { ArtifactShapeError } from '../types.js';
import type { Reference } from '../types.js';
import { InvalidArtifactKeyError } from '../../artifact-ids.js';
import { H, alice, artifact, kit } from './store-kit.js';

const keyFor = (kind: ArtifactIdKind): ArtifactKey => {
	switch (kind) {
		case 'SPEC': case 'ISSUE': return { kind, epicHash: '89abcdef' };
		case 'AMD': return { kind, epicHash: H, seq: 1 };
		case 'DIAG': return { kind, epicHash: H, story: 's1', seq: 1 };
		case 'TASK': return { kind, epicHash: H, story: 's1', task: 't1' };
		case 'DEF': case 'HLD': case 'EPIC': return { kind, epicHash: H };
		default: return { kind, epicHash: H, story: 's1' };
	}
};
const external: Reference = { entityId: 'owner/repo#7', type: 'github:issue', relation: 'tracked-by' };

describe('ArtifactStore.write', () => {
	it('write then read round trip keeps the revision rule for every registered kind', async () => {
		const k = kit();
		try {
			// the Define first: it stamps the work item's anchor that the other kinds read
			const kinds = [...registeredKinds()].sort((a, b) => (a === 'DEF' ? -1 : b === 'DEF' ? 1 : 0));
			for (const kind of kinds) {
				const id = ArtifactIds.make(keyFor(kind));
				await k.store.write(artifact(id), alice);
				const created = await k.store.read(id);
				assert.equal(created.lifecycle.revision.number, 1, `${kind} create is revision 1`);
				assert.equal(JSON.parse(readFileSync(artifactJsonPath(k.repo, id), 'utf8')).meta.revision, 1);
				assert.deepEqual(created.payload.body, { text: 'one' });

				// an identical rewrite keeps the revision and logs nothing
				const logged = (await k.store.readWithHistory(id)).changeLog.length;
				await k.store.write(created, alice);
				assert.equal((await k.store.read(id)).lifecycle.revision.number, 1, `${kind} identical`);
				assert.equal((await k.store.readWithHistory(id)).changeLog.length, logged, `${kind} identical logs nothing`);

				// a reference change keeps it
				await k.store.write({ ...created, references: [external] }, alice);
				const withRef = await k.store.read(id);
				assert.equal(withRef.lifecycle.revision.number, 1, `${kind} reference change`);
				assert.deepEqual(withRef.references, [external]);

				// a description change moves it
				await k.store.write({ ...withRef, description: 'changed' }, alice);
				assert.equal((await k.store.read(id)).lifecycle.revision.number, 2, `${kind} description`);

				// a payload change moves it by one
				const described = await k.store.read(id);
				await k.store.write({ ...described, payload: { body: { text: 'two' }, citations: [{ id: 'c1' }] } }, alice);
				const last = await k.store.read(id);
				assert.equal(last.lifecycle.revision.number, 3, `${kind} payload`);
				assert.equal(JSON.parse(readFileSync(artifactJsonPath(k.repo, id), 'utf8')).meta.revision, 3);
				assert.equal((await k.store.readWithHistory(id)).changeLog.length, 4, `${kind}: create, reference, description, payload`);
			}
		} finally { k.done(); }
	});

	it('only a content change moves the revision, and a description change is content', async () => {
		const k = kit();
		try {
			const id = `DEF-${H}`;
			await k.store.write(artifact(id), alice);
			const a = await k.store.read(id);
			const lifecycleOnly = { ...a, lifecycle: { ...a.lifecycle, status: 'approved' as const } };
			await k.store.write(lifecycleOnly, alice);
			const b = await k.store.read(id);
			assert.equal(b.lifecycle.status, 'approved');
			assert.equal(b.lifecycle.revision.number, 1, 'a lifecycle change is meta-only');
			await k.store.write({ ...b, attachments: [{ target: external, revision: 1, at: 't' }] }, alice);
			assert.equal((await k.store.read(id)).lifecycle.revision.number, 1, 'attachments are meta-only');
			await k.store.write({ ...(await k.store.read(id)), description: 'new words' }, alice);
			assert.equal((await k.store.read(id)).lifecycle.revision.number, 2, 'a description change is content');
			// the revision in the log and in the lifecycle is the one the prepare step returned
			const log = (await k.store.readWithHistory(id)).changeLog;
			assert.deepEqual(log.map(e => [e.operation, e.revision?.number]), [['create', 1], ['update', 1], ['update', 1], ['update', 2]]);
			assert.equal(log[0]?.actor.id, 'github:alice');
		} finally { k.done(); }
	});

	it('a bad parent or artifact-typed reference is refused and external references are accepted', async () => {
		const k = kit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			const id = `LLD-${H}-s1`;
			const parent = (entityId: string): Reference => ({ entityId, type: 'STORY', relation: 'derived-from' });
			// a parent that is not an artifact id
			await assert.rejects(k.store.write(artifact(id, { parent: parent('not an id') }), alice), ArtifactShapeError);
			// a TASK's parent must be exactly its STORY
			const task = `TASK-${H}-s1-t1`;
			await assert.rejects(k.store.write(artifact(task, { parent: parent(`STORY-${H}-s2`) }), alice), (e: unknown) => e instanceof ArtifactShapeError && /has to be STORY-0123456789abcdef-s1/.test(e.message));
			// the right parent passes the link check and the Task is written
			await k.store.write(artifact(task, { parent: parent(`STORY-${H}-s1`) }), alice);
			// an artifact-typed reference with a bad id
			await assert.rejects(k.store.write(artifact(id, { references: [{ entityId: 'LLD-bad', type: 'LLD', relation: 'cites' }] }), alice), ArtifactShapeError);
			// a valid id of another kind than the declared type
			await assert.rejects(k.store.write(artifact(id, { references: [{ entityId: `PLAN-${H}-s1`, type: 'HLD', relation: 'cites' }] }), alice), ArtifactShapeError);
			await assert.rejects(k.store.write(artifact(id, { attachments: [{ target: { entityId: 'x', type: 'PLAN', relation: 'documents' }, revision: 1, at: 't' }] }), alice), ArtifactShapeError);
			// nothing was written by any refusal
			assert.equal((await k.store.readWithHistory(`DEF-${H}`)).changeLog.length, 1);
			// external targets and artifact-typed references with good ids are accepted
			const ok: Reference[] = [
				external,
				{ entityId: 'src/workflow/storage.ts', type: 'code-path', relation: 'implements' },
				{ entityId: 'https://example.com', type: 'url', relation: 'cites' },
				{ entityId: `HLD-${H}`, type: 'HLD', relation: 'derived-from' },
			];
			await k.store.write(artifact(id, { references: ok, parent: parent(`STORY-${H}-s1`) }), alice);
			assert.deepEqual((await k.store.read(id)).references, ok);
			// bad ids, kinds and actors
			await assert.rejects(k.store.write(artifact('LLD-nope'), alice), InvalidArtifactKeyError);
			await assert.rejects(k.store.write(artifact(id), { ...alice, id: 'Alice' }), ArtifactShapeError);
			// an actor with a good id but no kind is refused BEFORE staging, so it cannot block the artifact
			await assert.rejects(k.store.write(artifact(id), { id: 'github:eve' } as never), ArtifactShapeError);
			await assert.rejects(k.store.write(artifact(id), { id: 'github:eve', kind: 'robot', properties: {} } as never), ArtifactShapeError);
			assert.equal(await k.journal.pending(id), undefined);
			// a malformed lifecycle or binding is refused before staging, so a readable head is never overwritten by an unreadable one
			const current = await k.store.read(id);
			const before = (await k.store.readWithHistory(id)).changeLog.length;
			await assert.rejects(k.store.write({ ...current, lifecycle: { ...current.lifecycle, status: 'nope' as never } }, alice), ArtifactShapeError);
			await assert.rejects(k.store.write({ ...current, binding: { reference: external, createdAtRevision: 'x' as never, posted: [] } }, alice), ArtifactShapeError);
			assert.equal(await k.journal.pending(id), undefined);
			assert.equal((await k.store.readWithHistory(id)).changeLog.length, before);
			assert.equal((await k.store.read(id)).lifecycle.status, current.lifecycle.status, 'the head is still readable');
			await k.store.write(artifact(id), alice);       // and the artifact is still writable
		} finally { k.done(); }
	});

	it('a store write keeps the prior meta so workItemAnchorCreatedAt and the Define renderer give the same results', async () => {
		const k = kit();
		try {
			const id = `DEF-${H}`;
			const body = {
				flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [],
				stories: [{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'g', when: 'w', then: 't', operationalizes: [] }] }],
				openQuestions: [],
			};
			await k.store.write(artifact(id, { payload: { body, citations: [] } }), alice);
			const pathOf = artifactJsonPath(k.repo, id);
			// a field the codec does not know, stamped by another writer between two store writes
			const stamped = JSON.parse(readFileSync(pathOf, 'utf8'));
			stamped.meta.approvedAt = '2026-10-21T00:00:00Z';
			stamped.meta.tracker = { units: { s1: { issue: 5 } } };
			const { writeFileSync } = await import('node:fs');
			writeFileSync(pathOf, JSON.stringify(stamped));
			const anchor = workItemAnchorCreatedAt(stamped.meta);
			const rendered = renderDefineMarkdown({ meta: stamped.meta, body, citations: [] } as unknown as DefineArtifact);

			await k.store.write({ ...(await k.store.read(id)), description: 'moved' }, alice);
			const after = JSON.parse(readFileSync(pathOf, 'utf8'));
			assert.equal(after.meta.approvedAt, '2026-10-21T00:00:00Z', 'prior meta is kept');
			assert.deepEqual(after.meta.tracker, stamped.meta.tracker);
			assert.equal(workItemAnchorCreatedAt(after.meta), anchor, 'the same anchor');
			assert.equal(renderDefineMarkdown(after as DefineArtifact), rendered.replace(/^/, ''), 'the same markdown');
			assert.deepEqual(Object.keys(after.meta).filter(x => !(x in stamped.meta)).sort(), ['envelope', 'lifecycle'].filter(x => !(x in stamped.meta)).sort());
		} finally { k.done(); }
	});

	it('concurrent writes to one artifact are serialised, so none is lost', async () => {
		const k = kit();
		try {
			const id = `DEF-${H}`;
			await k.store.write(artifact(id), alice);
			const base = await k.store.read(id);
			// five writers read the same prior revision and write at once, from two store instances
			const other = k.restart();
			await Promise.all([1, 2, 3, 4, 5].map(n => (n % 2 === 0 ? other : k.store).write({ ...base, description: `d${n}` }, alice)));
			const after = await k.store.readWithHistory(id);
			assert.equal(after.lifecycle.revision.number, 6, 'each of the five content changes minted its own revision');
			assert.equal(after.changeLog.length, 6);
			assert.equal(new Set(after.changeLog.map(e => e.id)).size, 6);
			assert.equal(after.description, 'd5', 'the last queued write wins, none overwrote another');
			assert.equal(await k.journal.pending(id), undefined);
			// a failed write does not block the queue behind it
			k.faults.append = true;
			const failing = k.store.write({ ...after, description: 'x' }, alice);
			const next = k.store.write({ ...after, description: 'y' }, alice);
			await assert.rejects(failing);
			await next;
			assert.equal((await k.store.read(id)).description, 'y');
		} finally { k.done(); }
	});

	it('a binding, its pending links and a parent relation are checked like other links', async () => {
		const k = kit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			const id = `LLD-${H}-s1`;
			const bad: Reference = { entityId: 'PLAN-nope', type: 'PLAN', relation: 'tracked-by' };
			const good: Reference = { entityId: 'o/r#1', type: 'github:issue', relation: 'tracked-by' };
			await assert.rejects(k.store.write(artifact(id, { binding: { reference: bad, createdAtRevision: 1, posted: [] } }), alice), ArtifactShapeError);
			await assert.rejects(k.store.write(artifact(id, { binding: { reference: good, createdAtRevision: 1, posted: [], pendingLink: { parent: bad } } }), alice), ArtifactShapeError);
			await assert.rejects(k.store.write(artifact(id, { binding: { reference: good, createdAtRevision: 1, posted: [], pendingLink: { parent: good, child: bad } } }), alice), ArtifactShapeError);
			await assert.rejects(k.store.write(artifact(id, { parent: { entityId: `HLD-${H}`, type: 'HLD', relation: 'cites' } }), alice), ArtifactShapeError);
			await k.store.write(artifact(id, { binding: { reference: good, createdAtRevision: 1, posted: [], pendingLink: { parent: good, child: good } } }), alice);
			assert.equal((await k.store.read(id)).binding?.reference.entityId, 'o/r#1');
		} finally { k.done(); }
	});

	it('the same metadata transition made twice is logged twice, and a malformed payload is refused before anything is staged', async () => {
		const k = kit();
		try {
			const id = `DEF-${H}`;
			const refA: Reference[] = [external];
			const refB: Reference[] = [{ ...external, entityId: 'owner/repo#8' }];
			await k.store.write(artifact(id, { references: refA }), alice);
			const current = async () => k.store.read(id);
			for (const refs of [refB, refA, refB, refA, refB]) await k.store.write({ ...(await current()), references: refs }, alice);
			const log = (await k.store.readWithHistory(id)).changeLog;
			assert.equal(log.length, 6, 'create plus five reference changes, none merged as a duplicate');
			assert.equal(new Set(log.map(e => e.id)).size, 6);
			assert.equal((await current()).lifecycle.revision.number, 1, 'metadata changes never moved the revision');
			// malformed payloads
			await assert.rejects(k.store.write(artifact(id, { payload: { body: 'x' as never, citations: [] } }), alice), ArtifactShapeError);
			await assert.rejects(k.store.write(artifact(id, { payload: { body: {}, citations: 'x' as never } }), alice), ArtifactShapeError);
			await assert.rejects(k.store.write(artifact(`LLD-${H}-s1`, { payload: { body: [] as never, citations: [] } }), alice), ArtifactShapeError);
			assert.equal(await k.journal.pending(id), undefined, 'nothing was staged');
			assert.equal((await k.store.readWithHistory(id)).changeLog.length, 6);
		} finally { k.done(); }
	});
});
