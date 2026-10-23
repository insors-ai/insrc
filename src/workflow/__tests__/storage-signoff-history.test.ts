/**
 * The content write keeps the Signoff history (Story s8): a revision of an artifact in signoff must still name the request it
 * was sent to, whichever way the next head is built.
 *
 * Run: npx tsx --test src/workflow/__tests__/storage-signoff-history.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeArtifact } from '../storage.js';
import { contentHash } from '../artifact-core/lifecycle.js';
import type { Actor, Lifecycle, Signoff, Status } from '../artifact-core/types.js';

const by: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const reviewer: Actor = { id: 'insrc:daemon', kind: 'system', properties: {} };
const ref = { entityId: 'acme/demo#12', type: 'signoff-request', relation: 'tracked-by' as const };
const entry: Signoff = { revision: 2, request: ref, state: 'open', actors: [], at: '2026-10-22T00:00:00.000Z' };

let dir: string;
let path: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'signoff-history-')); path = join(dir, 'LLD.json'); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const body = (text: string) => ({ text });
function lifecycleOf(status: Status, text: string, signoffs: Signoff[]): Lifecycle {
	return {
		status,
		revision: { number: 2, contentHash: contentHash('', { body: body(text), citations: [] }), at: '2026-10-21T00:00:00.000Z', by },
		approval: { revision: 2, by, at: '2026-10-21T01:00:00.000Z' },
		review: { revision: 2, reviewer, party: 'daemon', verdict: 'pass', counts: {}, at: '2026-10-21T00:30:00.000Z' },
		signoffs,
	};
}
const head = (text: string, lifecycle?: Lifecycle) => ({ meta: { revision: 2, ...(lifecycle !== undefined ? { lifecycle } : {}) }, body: body(text), citations: [] });
const stored = () => JSON.parse(readFileSync(path, 'utf8')) as { meta: { revision?: number; lifecycle?: Lifecycle } };
const seed = (status: Status, signoffs: Signoff[] = [entry]) => writeFileSync(path, JSON.stringify(head('old', lifecycleOf(status, 'old', signoffs))));
const freshDraft = (signoffs: Signoff[] = []): Lifecycle => ({ status: 'draft', revision: { number: 0, contentHash: '', at: '', by }, signoffs });

test('a changed content write keeps the prior Signoff entries and carries neither approval nor review, whether the next head has no lifecycle or a fresh draft one', () => {
	for (const next of [head('new'), head('new', freshDraft())]) {
		seed('in-signoff');
		assert.equal(writeArtifact(path, next, 'content'), 3);
		const lc = stored().meta.lifecycle;
		assert.equal(lc?.status, 'draft');
		assert.deepEqual(lc?.signoffs, [entry]);
		assert.equal(lc?.approval, undefined);
		assert.equal(lc?.review, undefined);
		assert.equal(lc?.revision.number, 3);
		assert.equal(lc?.revision.contentHash, contentHash('', { body: body('new'), citations: [] }));
	}
	// entries the next head carries are kept, not replaced by the prior ones
	seed('changes-requested');
	const own: Signoff = { ...entry, revision: 3, state: 'changes-requested' };
	writeArtifact(path, head('newer', freshDraft([own])), 'content');
	assert.deepEqual(stored().meta.lifecycle?.signoffs, [own]);
});

test('an identical content write of an in-signoff or changes-requested head with no next lifecycle neither throws nor changes its lifecycle, and a prior head with no Signoff entry is written as before', () => {
	for (const status of ['in-signoff', 'changes-requested'] as const) {
		seed(status);
		const before = stored().meta.lifecycle;
		assert.equal(writeArtifact(path, head('old'), 'content'), 2);
		assert.deepEqual(stored().meta.lifecycle, before, status);
	}
	// a prior head with no Signoff entry: the next head with no lifecycle leaves none, as before
	seed('approved', []);
	writeArtifact(path, head('new'), 'content');
	assert.equal(stored().meta.lifecycle, undefined);
	// and a fresh draft lifecycle over unchanged content keeps behaving as before
	seed('draft', []);
	assert.equal(writeArtifact(path, head('old', freshDraft()), 'content'), 2);
	assert.deepEqual(stored().meta.lifecycle?.signoffs, []);
});
