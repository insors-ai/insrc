import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prepareArtifactWrite, writeArtifact } from '../storage.js';
import { contentHash } from '../artifact-core/lifecycle.js';
import type { Actor, Lifecycle } from '../artifact-core/types.js';

const alice: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const bob: Actor = { id: 'github:bob', kind: 'person', properties: {} };
const T0 = '2026-10-20T00:00:00.000Z';
const T1 = '2026-10-21T00:00:00.000Z';

const lc = (over: Partial<Lifecycle> = {}): Lifecycle => ({
	status: 'draft', revision: { number: 0, contentHash: '', at: '', by: alice }, signoffs: [], ...over,
});
const head = (text: string, over: { lifecycle?: Lifecycle | undefined; description?: string; extra?: Record<string, unknown> } = {}) => ({
	meta: {
		workflow: 'x',
		envelope: { description: over.description ?? 'd', references: [], attachments: [] },
		...(over.lifecycle !== undefined ? { lifecycle: over.lifecycle } : {}),
		...(over.extra ?? {}),
	},
	body: { text },
	citations: [],
});
const parse = (bytes: string) => JSON.parse(bytes) as { meta: { revision?: number; lifecycle: Lifecycle } };

describe('prepareArtifactWrite with meta.lifecycle', () => {
	it('prepareArtifactWrite reconciles meta.lifecycle for a content write, leaves it for a meta-only write, mints no revision for a metadata-only or key-order-only change, and prepares a head without meta.lifecycle as before', () => {
		const dir = mkdtempSync(join(tmpdir(), 'prep-lc-'));
		try {
			const path = join(dir, 'a.json');
			const opts = { by: alice, at: T0 };

			// create: number 1, hash computed, whatever the caller supplied
			const forged = lc({ revision: { number: 99, contentHash: 'f'.repeat(64), at: 'x', by: bob } });
			const first = prepareArtifactWrite(path, head('one', { lifecycle: forged }), 'content', opts);
			const created = parse(first.bytes);
			assert.equal(first.contentChanged, true);
			assert.equal(first.revision, 1);
			assert.equal(created.meta.lifecycle.revision.number, 1);
			assert.equal(created.meta.lifecycle.revision.contentHash, contentHash('d', { body: { text: 'one' }, citations: [] }));
			assert.equal(created.meta.lifecycle.revision.at, T0);
			assert.equal(created.meta.lifecycle.revision.by.id, 'github:alice');
			writeArtifact(path, head('one', { lifecycle: forged }), 'content', opts);

			// a metadata-only change and a key-order-only change written as content mint no revision
			const metaChange = prepareArtifactWrite(path, head('one', { lifecycle: created.meta.lifecycle, extra: { note: 'n' } }), 'content', { by: bob, at: T1 });
			assert.equal(metaChange.contentChanged, false);
			assert.equal(metaChange.revision, 1);
			assert.equal(parse(metaChange.bytes).meta.lifecycle.revision.at, T0);
			assert.equal(parse(metaChange.bytes).meta.lifecycle.revision.number, 1);
			assert.equal(parse(metaChange.bytes).meta.lifecycle.revision.by.id, 'github:alice');
			const reordered = { citations: [], body: { text: 'one' }, meta: head('one', { lifecycle: created.meta.lifecycle }).meta };
			const reorder = prepareArtifactWrite(path, reordered, 'content', { by: bob, at: T1 });
			assert.equal(reorder.contentChanged, false);
			assert.equal(reorder.revision, 1);

			// approval at revision 1, then a content change returns the head to draft and leaves the approval at revision 1
			const approved = lc({ ...created.meta.lifecycle, status: 'approved', approval: { revision: 1, by: alice, at: T0 } });
			writeArtifact(path, head('one', { lifecycle: approved }), 'content', opts);
			const changed = prepareArtifactWrite(path, head('two', { lifecycle: approved }), 'content', { by: bob, at: T1 });
			const after = parse(changed.bytes);
			assert.equal(changed.contentChanged, true);
			assert.equal(changed.revision, 2);
			assert.equal(after.meta.lifecycle.status, 'draft');
			assert.equal(after.meta.lifecycle.revision.number, 2);
			assert.equal(after.meta.lifecycle.revision.by.id, 'github:bob');
			assert.equal(after.meta.lifecycle.approval?.revision, 1);

			// a meta-only write leaves the revision and takes the lifecycle as given
			const metaOnly = prepareArtifactWrite(path, head('one', { lifecycle: approved, extra: { note: 'n' } }), 'meta-only', opts);
			assert.equal(metaOnly.revision, 1);
			assert.equal(metaOnly.contentChanged, false);
			assert.equal(parse(metaOnly.bytes).meta.lifecycle.status, 'approved');
			assert.deepEqual(parse(metaOnly.bytes).meta.lifecycle.revision, created.meta.lifecycle.revision);
			// even a forged revision supplied with a meta-only write is replaced by the stored one
			const forgedMeta = prepareArtifactWrite(path, head('one', { lifecycle: lc({ status: 'approved', revision: { number: 7, contentHash: 'abc', at: 'x', by: bob } }) }), 'meta-only', opts);
			assert.deepEqual(parse(forgedMeta.bytes).meta.lifecycle.revision, created.meta.lifecycle.revision);

			// a meta-only write of changed content leaves the lifecycle as given and the revision alone
			const metaOnlyChanged = prepareArtifactWrite(path, head('three', { lifecycle: approved }), 'meta-only', opts);
			assert.equal(metaOnlyChanged.revision, 1);
			assert.equal(parse(metaOnlyChanged.bytes).meta.lifecycle.status, 'approved');
			assert.deepEqual(parse(metaOnlyChanged.bytes).meta.lifecycle.revision, created.meta.lifecycle.revision);

			// a head without meta.lifecycle is prepared as before: legacy comparison, no lifecycle added
			const legacy = join(dir, 'legacy.json');
			const l1 = prepareArtifactWrite(legacy, head('one'), 'content');
			assert.equal(l1.revision, 1);
			assert.equal('lifecycle' in parse(l1.bytes).meta, false);
			writeArtifact(legacy, head('one'), 'content');
			assert.equal(prepareArtifactWrite(legacy, head('one'), 'content').contentChanged, false);
			assert.equal(prepareArtifactWrite(legacy, head('one', { extra: { note: 'n' } }), 'content').revision, 2);

			// the default actor and clock apply when no opts are given
			const dflt = parse(prepareArtifactWrite(join(dir, 'b.json'), head('x', { lifecycle: lc() }), 'content').bytes);
			assert.equal(dflt.meta.lifecycle.revision.by.id, 'insrc:system');
			assert.ok(dflt.meta.lifecycle.revision.at.length > 0);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
});
