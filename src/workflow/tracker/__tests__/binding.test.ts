import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { ArtifactShapeError } from '../../artifact-core/types.js';
import { H, alice, artifact } from '../../artifact-core/__tests__/store-kit.js';
import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { artifactJsonPath } from '../../storage.js';
import { bindArtifact, readBinding, recordPosted, setPendingLink } from '../binding.js';

const DEF = `DEF-${H}`;
const LLD = `LLD-${H}-s6`;
const issue = (n: number) => `acme/demo#${n}`;
const parentRef = { entityId: issue(1), type: 'github:issue', relation: 'tracked-by' };

async function seeded() {
	const k = durableKit();
	await k.store.write(artifact(DEF), alice);
	await k.store.write(artifact(LLD), alice);
	return k;
}

describe('binding', () => {
	it('bindArtifact writes the typed binding with createdAtRevision, leaves the revision number and content hash unchanged, is idempotent for the same issue, refuses a different issue, and readBinding returns undefined for an unbound artifact', async () => {
		const k = await seeded();
		try {
			assert.equal(readBinding(k.repo, LLD), undefined, 'unbound');
			assert.equal(readBinding(k.repo, `LLD-${H}-s9`), undefined, 'a missing artifact');
			const before = await k.store.read(LLD);

			const bound = bindArtifact(k.repo, LLD, issue(7));
			assert.ok(bound.ok);
			assert.equal(bound.created, true);
			assert.deepEqual(bound.binding, { reference: { entityId: issue(7), type: 'github:issue', relation: 'tracked-by' }, createdAtRevision: before.lifecycle.revision.number, posted: [] });
			const after = await k.store.read(LLD);
			assert.deepEqual(after.binding, bound.binding, 'the store reads the same binding');
			assert.equal(after.lifecycle.revision.number, before.lifecycle.revision.number);
			assert.equal(after.lifecycle.revision.contentHash, before.lifecycle.revision.contentHash);
			assert.equal((await k.store.readWithHistory(LLD)).changeLog.length, 1, 'tracker bookkeeping appends no change log entry');

			// idempotent for the same issue
			const again = bindArtifact(k.repo, LLD, issue(7));
			assert.deepEqual(again, { ok: true, binding: bound.binding, created: false });
			// a different issue is refused and nothing changes
			const other = bindArtifact(k.repo, LLD, issue(8));
			assert.equal(other.ok, false);
			assert.equal(!other.ok && other.kind, 'conflict');
			assert.match(!other.ok ? other.reason : '', /acme\/demo#7.*acme\/demo#8/);
			assert.deepEqual(readBinding(k.repo, LLD), bound.binding);
			// the other artifact is untouched
			assert.equal(readBinding(k.repo, DEF), undefined);

			// no head to bind
			const missing = bindArtifact(k.repo, `LLD-${H}-s9`, issue(9));
			assert.equal(!missing.ok && missing.kind, 'unreadable');

			// a malformed binding is reported, not read as no binding, and is not overwritten
			const path = artifactJsonPath(k.repo, DEF);
			const head = JSON.parse(readFileSync(path, 'utf8')) as { meta: { envelope: Record<string, unknown> } };
			head.meta.envelope['binding'] = { reference: parentRef, createdAtRevision: 'x', posted: [] };
			writeFileSync(path, JSON.stringify(head));
			assert.throws(() => readBinding(k.repo, DEF), ArtifactShapeError);
			const refused = bindArtifact(k.repo, DEF, issue(2));
			assert.equal(!refused.ok && refused.kind, 'unreadable');
			assert.deepEqual((JSON.parse(readFileSync(path, 'utf8')) as typeof head).meta.envelope['binding'], head.meta.envelope['binding']);
		} finally { k.done(); }
	});

	it('recordPosted and setPendingLink record one entry per kind and a pending link that names a child ref or a child id, never twice, and without moving the revision', async () => {
		const k = await seeded();
		try {
			const before = await k.store.read(LLD);
			// nothing to record on an unbound artifact
			assert.equal(recordPosted(k.repo, LLD, 'design'), false);
			assert.equal(setPendingLink(k.repo, LLD, { parent: parentRef, childId: 5 }), false);

			assert.ok(bindArtifact(k.repo, LLD, issue(7)).ok);
			let tick = 0;
			const now = () => `2026-10-21T10:00:0${tick++}.000Z`;
			assert.equal(recordPosted(k.repo, LLD, 'design', undefined, now), true);
			assert.equal(recordPosted(k.repo, LLD, 'review', '4455', now), true);
			assert.equal(recordPosted(k.repo, LLD, 'design', '999', now), true, 'a kind already recorded stays as it was');
			const posted = readBinding(k.repo, LLD)!.posted;
			assert.deepEqual(posted, [{ kind: 'design', at: '2026-10-21T10:00:00.000Z' }, { kind: 'review', at: '2026-10-21T10:00:01.000Z', externalId: '4455' }]);

			// a pending link names a child ref or a child id; with neither it is refused
			assert.equal(setPendingLink(k.repo, LLD, { parent: parentRef }), false);
			assert.equal(setPendingLink(k.repo, LLD, { parent: parentRef, childId: 42 }), true);
			assert.deepEqual(readBinding(k.repo, LLD)!.pendingLink, { parent: parentRef, childId: 42 });
			assert.equal(setPendingLink(k.repo, LLD, { parent: parentRef, child: { entityId: issue(9), type: 'github:issue', relation: 'tracked-by' } }), true);
			assert.equal(readBinding(k.repo, LLD)!.pendingLink?.child?.entityId, issue(9));
			// clearing it keeps the posted marks
			assert.equal(setPendingLink(k.repo, LLD, undefined), true);
			assert.equal(readBinding(k.repo, LLD)!.pendingLink, undefined);
			assert.equal(readBinding(k.repo, LLD)!.posted.length, 2);

			const after = await k.store.read(LLD);
			assert.equal(after.lifecycle.revision.number, before.lifecycle.revision.number);
			assert.equal(after.lifecycle.revision.contentHash, before.lifecycle.revision.contentHash);
			assert.equal((await k.store.readWithHistory(LLD)).changeLog.length, 1);
		} finally { k.done(); }
	});
});
