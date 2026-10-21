import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { artifactJsonPath } from '../../storage.js';
import type { Attachment, TrackerBinding } from '../types.js';
import { H, alice, artifact } from './store-kit.js';
import { durableKit } from './durable-kit.js';

const PLAN = `PLAN-${H}-s6`;
const binding = (issue: string): TrackerBinding => ({ reference: { entityId: issue, type: 'github:issue', relation: 'tracked-by' }, createdAtRevision: 1, posted: [] });
const attachment = (rev: number): Attachment => ({ target: { entityId: `LLD-${H}-s6`, type: 'LLD', relation: 'documents' }, revision: rev, at: '2026-10-21T10:00:00.000Z' });

describe('binding-carry', () => {
	it('a content write by the store keeps the binding and attachments on disk, a first write keeps what the caller gave, and the carry leaves the revision number and content hash alone', async () => {
		const k = durableKit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			// a first write keeps what the caller gave
			await k.store.write(artifact(PLAN, { binding: binding('o/r#1'), attachments: [attachment(1)] }), alice);
			const first = await k.store.read(PLAN);
			assert.deepEqual(first.binding, binding('o/r#1'));
			assert.deepEqual(first.attachments, [attachment(1)]);

			// a content write of the existing head keeps the ones on disk whatever the caller's artifact carries
			await k.store.write({ ...first, binding: binding('o/r#999'), attachments: [], payload: { body: { text: 'two' }, citations: [] } }, alice);
			const second = await k.store.read(PLAN);
			assert.deepEqual(second.binding, binding('o/r#1'), 'the on-disk binding wins');
			assert.deepEqual(second.attachments, [attachment(1)], 'the on-disk attachments win');
			assert.equal(second.lifecycle.revision.number, 2, 'only the content moved the revision');

			// a patch from the binding module (meta-only, straight on the head) moves neither the revision nor the content hash ...
			const path = artifactJsonPath(k.repo, PLAN);
			const head = JSON.parse(readFileSync(path, 'utf8')) as { meta: { envelope: Record<string, unknown> } };
			head.meta.envelope['binding'] = { ...binding('o/r#1'), posted: [{ kind: 'design', at: '2026-10-21T10:05:00.000Z' }] };
			head.meta.envelope['attachments'] = [attachment(1), attachment(2)];
			writeFileSync(path, JSON.stringify(head, null, 2) + '\n');
			const patched = await k.store.read(PLAN);
			assert.equal(patched.lifecycle.revision.number, second.lifecycle.revision.number);
			assert.equal(patched.lifecycle.revision.contentHash, second.lifecycle.revision.contentHash);
			assert.equal(patched.binding?.posted.length, 1);

			// ... and a content write that prepares after it keeps it
			await k.store.write({ ...patched, payload: { body: { text: 'three' }, citations: [] } }, alice);
			const third = await k.store.read(PLAN);
			assert.equal(third.binding?.posted.length, 1, 'the patched binding survived the content write');
			assert.equal(third.attachments.length, 2);
			assert.equal(third.lifecycle.revision.number, 3);

			// a write that changes no content leaves the revision and hash alone as well
			await k.store.write({ ...third, binding: binding('o/r#5') }, alice);
			const same = await k.store.read(PLAN);
			assert.equal(same.lifecycle.revision.number, 3);
			assert.equal(same.lifecycle.revision.contentHash, third.lifecycle.revision.contentHash);
			assert.deepEqual(same.binding, third.binding);

			// a malformed binding is refused rather than dropped
			await assert.rejects(k.store.write({ ...third, binding: { reference: third.binding!.reference, createdAtRevision: 'x' as never, posted: [] } }, alice));
		} finally { k.done(); }
	});
});
