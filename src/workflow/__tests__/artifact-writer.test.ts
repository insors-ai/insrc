/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * writeArtifact / readRevision / patchTrackerMeta (sc3): revision minting on
 * content writes only, and the whole tracker block surviving a replacement.
 *
 * Run: npx tsx --test src/workflow/__tests__/artifact-writer.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readRevision, writeArtifact } from '../storage.js';
import { patchTrackerMeta } from '../tracker/refs.js';
import { approvalStateOf } from '../artifact-core/approval-view.js';
import { approvedMeta } from './lifecycle-fixtures.js';

type Json = Record<string, any>;

function withDir(fn: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-writer-'));
	try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const read = (p: string): Json => JSON.parse(readFileSync(p, 'utf8')) as Json;
const art = (meta: Json = {}, body: Json = { v: 1 }): Json => ({ meta: { workflow: 'x', ...meta }, body, citations: [] });

const FULL_TRACKER = {
	adapter: 'github', epicRef: 'o/r#1', storyRef: 'o/r#2', issueRef: 'o/r#3',
	storyRefs: { s1: 'o/r#2' }, taskRefs: { t1: 'o/r#4' }, milestoneRef: 'm', labelsCreated: ['a'],
	epicStatus: 'open', storyStatus: { s1: 'open' }, pushedAt: 'p', lastSyncedAt: 'l',
	units: { epic: { unit: 'epic', unitId: 'epic', issue: 'o/r#1', createdAtRevision: 1, extrasDone: { milestone: 't' } } },
};

test('writeArtifact mints and keeps revisions, carries the whole tracker block, and rejects a value without meta', () => {
	withDir(dir => {
		const p = join(dir, 'A.json');
		assert.equal(writeArtifact(p, art(), 'content'), 1, 'a first draft is revision 1');
		assert.equal(writeArtifact(p, art(), 'content'), 1, 'rewriting identical content keeps the revision');
		assert.equal(writeArtifact(p, art({}, { v: 2 }), 'content'), 2, 'changed content mints the next revision');
		assert.equal(read(p).meta.revision, 2);

		// meta-only keeps the on-disk revision, even if next claims another
		assert.equal(writeArtifact(p, art({ revision: 99, rangeBase: 'abc' }), 'meta-only'), 2);
		assert.equal(read(p).meta.revision, 2);
		assert.equal(read(p).meta.rangeBase, 'abc');

		// a meta-only write to a file with no revision leaves it absent
		const q = join(dir, 'B.json');
		writeFileSync(q, JSON.stringify(art()));
		assert.equal(writeArtifact(q, art({ revision: 7 }), 'meta-only'), 0);
		assert.equal('revision' in read(q).meta, false);

		// content write over a file carrying a full tracker block + approval + review
		const r = join(dir, 'C.json');
		writeFileSync(r, JSON.stringify(art({ ...approvedMeta({ revision: 3 }), tracker: FULL_TRACKER })));
		assert.equal(writeArtifact(r, art({ tracker: { storyRefs: { s2: 'o/r#9' }, units: { 'story:s2': { unit: 'story', unitId: 's2', issue: 'o/r#9', createdAtRevision: 4 } } } }), 'content'), 4);
		const m = read(r).meta;
		assert.equal(m.lifecycle, undefined, 'the lifecycle is not carried by a write that names none');
		assert.equal(m.tracker.epicRef, 'o/r#1');
		assert.equal(m.tracker.pushedAt, 'p');
		assert.deepEqual(m.tracker.storyRefs, { s2: 'o/r#9' }, 'next wins per key');
		assert.deepEqual(Object.keys(m.tracker.units).sort(), ['epic', 'story:s2'], 'units merge key by key');
		assert.deepEqual(m.tracker.units.epic.extrasDone, { milestone: 't' });

		// a value without meta throws and leaves the file untouched
		const before = readFileSync(p, 'utf8');
		assert.throws(() => writeArtifact(p, { body: {} }, 'content'), TypeError);
		assert.throws(() => writeArtifact(p, null, 'meta-only'), TypeError);
		assert.throws(() => writeArtifact(p, { meta: [] }, 'content'), TypeError);
		assert.equal(readFileSync(p, 'utf8'), before);
		const none = join(dir, 'never.json');
		assert.throws(() => writeArtifact(none, {}, 'content'), TypeError);
		assert.equal(existsSync(none), false);
	});
});

test('readRevision reads 0 for bad values; patchTrackerMeta keeps every field, merges units and preserves the tracker kind', () => {
	assert.equal(readRevision(undefined), 0);
	assert.equal(readRevision({}), 0);
	assert.equal(readRevision({ meta: {} }), 0);
	for (const bad of [-1, 1.5, '2', null, NaN]) assert.equal(readRevision({ meta: { revision: bad } }), 0);
	assert.equal(readRevision({ meta: { revision: 5 } }), 5);

	withDir(dir => {
		const p = join(dir, 'D.json');
		writeFileSync(p, JSON.stringify(art({ revision: 6, tracker: { ...FULL_TRACKER, adapter: 'jira' } })));
		const merged = patchTrackerMeta(p, {
			pushedAt: 'p2',
			units: { 'task:s1/t1': { unit: 'task', unitId: 't1', issue: 'o/r#4', createdAtRevision: 6 } },
		});
		assert.equal(merged.adapter, 'jira', 'the tracker kind is preserved');
		assert.equal(merged.pushedAt, 'p2');
		assert.equal(merged.epicRef, 'o/r#1');
		assert.deepEqual(Object.keys(merged.units ?? {}).sort(), ['epic', 'task:s1/t1']);
		const onDisk = read(p);
		assert.equal(onDisk.meta.revision, 6, 'a tracker patch never changes the revision');
		assert.deepEqual(onDisk.body, { v: 1 });

		// legacy artifact with no adapter: the default stays 'github'
		const q = join(dir, 'E.json');
		writeFileSync(q, JSON.stringify(art()));
		assert.equal(patchTrackerMeta(q, { epicRef: 'o/r#1' }).adapter, 'github');
		assert.equal('units' in (read(q).meta.tracker as Json), false);
		assert.equal('revision' in read(q).meta, false);
	});
});

test('artifact-writer.test.ts: the writer tests run on lifecycle fixtures', () => {
	withDir(dir => {
		const p = join(dir, 'A.json');
		// an approved head: a meta-only write keeps its revision and its approval, with no stamp written beside the lifecycle
		writeFileSync(p, JSON.stringify(art({ ...approvedMeta({ revision: 4 }), revision: 4 })));
		assert.equal(writeArtifact(p, { ...art({ ...approvedMeta({ revision: 4 }), revision: 99, rangeBase: 'abc' }) }, 'meta-only'), 4);
		let m = read(p).meta;
		assert.equal(approvalStateOf(m), 'approved');
		assert.equal(m.revision, 4);
		assert.equal(m.rangeBase, 'abc');
		assert.deepEqual(Object.keys(m).sort(), ['envelope', 'lifecycle', 'rangeBase', 'revision', 'workflow'], 'the approval is the lifecycle alone, with no stamp beside it');

		// a content write over it mints the next revision and returns the head to draft
		assert.equal(writeArtifact(p, art({ ...approvedMeta({ revision: 4 }) }, { v: 2 }), 'content'), 5);
		m = read(p).meta;
		assert.equal(m.revision, 5);
		assert.equal(approvalStateOf(m), 'pending', 'a change of content returns the head to draft');
	});
});
