/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compaction is safe against a crash at any point (Epic 86197ac6, Story s2,
 * t16). A compaction is stopped at each step of its swap, leaving the files as
 * a kill -9 there would (nothing after the point runs, the store is closed),
 * and the next open must come up on the original or on a checked copy with
 * every row; a copy that does not match its manifest is replaced by the
 * original. A write committed while the copy is taken stops the compaction.
 *
 * Run: npx tsx --test src/db/graph/__tests__/compact-crash-recovery.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	SimulatedCrash, closeGraphStore, compactGraphStore, getGraphStore, setCompactionCrashPointForTests, setGraphStorePath, withWriteTxn,
} from '../store.js';
import type { CompactionCrashPoint } from '../store.js';

const ROWS = 3000;
let dir: string;
let path: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-compact-crash-'));
	path = join(dir, 'graph.lmdb');
	setGraphStorePath(path);
});
test.afterEach(async () => {
	setCompactionCrashPointForTests(undefined);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

/** ROWS rows kept, as many written and deleted (so the copy is smaller), in two named databases. */
async function seed(): Promise<void> {
	await withWriteTxn(s => {
		for (let i = 0; i < 2 * ROWS; i++) {
			s.meta.put(`k${i}`, Buffer.alloc(512, i % 251));
			s.conversationSession.put(`s${i}`, Buffer.alloc(64, 1));
		}
	});
	await withWriteTxn(s => {
		for (let i = ROWS; i < 2 * ROWS; i++) { s.meta.remove(`k${i}`); s.conversationSession.remove(`s${i}`); }
	});
}
async function rows(): Promise<{ meta: number; sessions: number; sample: number | undefined }> {
	const s = await getGraphStore();
	let meta = 0;
	for (const { key } of s.meta.getRange()) if (String(key).startsWith('k')) meta++;
	let sessions = 0;
	for (const _ of s.conversationSession.getRange()) sessions++;
	const v = s.meta.get('k7') as Buffer | undefined;
	return { meta, sessions, sample: v?.[0] };
}
const leftovers = (): string[] => ['.compact', '.bak', '.compact-manifest'].filter(x => existsSync(path + x));

/** Compact, stopped at `point` as a crash; then the process "restarts" (the store is closed, the next open recovers). */
async function crashAt(point: CompactionCrashPoint): Promise<void> {
	setCompactionCrashPointForTests(point);
	await assert.rejects(compactGraphStore(), SimulatedCrash);
	await closeGraphStore();
}

const POINTS: readonly [CompactionCrashPoint, string][] = [
	['before-swap', 'the copy is written, nothing renamed'],
	['after-manifest', 'the manifest is written'],
	['after-link', 'the original has its second name (.bak)'],
	['after-rename', 'the copy replaced the store name, not yet checked'],
];

for (const [point, what] of POINTS) {
	test(`a crash during compaction at ${point} (${what}): the next open has every row and no leftover files`, async () => {
		await seed();
		const before = await rows();
		const size = statSync(path).size;
		await crashAt(point);
		assert.ok(existsSync(path), 'a store file exists at every point of the swap');
		assert.deepEqual(await rows(), before, 'every row is there after the open');
		assert.deepEqual(leftovers(), [], 'the open cleared what the crash left');
		if (point === 'after-rename') assert.ok(statSync(path).size < size, 'the checked copy was kept: the file shrank');
		else assert.equal(statSync(path).size, size, 'the original was kept');
		// The store serves writes as usual.
		await withWriteTxn(s => { s.meta.put('after', Buffer.from([1])); });
		assert.deepEqual((await getGraphStore()).meta.get('after'), Buffer.from([1]));
	});
}

test('a swapped-in copy that does not match its manifest is replaced by the original on the next open', async () => {
	await seed();
	const before = await rows();
	await crashAt('after-rename');
	// The copy is wrong: the manifest says it must hold one more session than it does.
	const manifestPath = `${path}.compact-manifest`;
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { counts: Record<string, number> };
	manifest.counts['conversationSession'] = (manifest.counts['conversationSession'] ?? 0) + 1;
	writeFileSync(manifestPath, JSON.stringify(manifest));
	const original = statSync(`${path}.bak`).ino;
	assert.deepEqual(await rows(), before, 'the original serves every row');
	assert.equal(statSync(path).ino, original, 'the store file is the pre-compaction original');
	assert.deepEqual(leftovers(), []);
});

test('a store file missing beside a .bak (a crash between the two renames of the earlier swap) is restored from it', async () => {
	await seed();
	const before = await rows();
	await closeGraphStore();
	renameSync(path, `${path}.bak`);
	writeFileSync(`${path}.compact`, 'a partial copy');
	assert.deepEqual(await rows(), before);
	assert.deepEqual(leftovers(), []);
});

test('a write committed while the copy is taken stops the compaction: nothing renamed, every row and the write are kept', async () => {
	await seed();
	const before = await rows();
	const compaction = compactGraphStore();
	// Lands while the (compacting) copy is written.
	await withWriteTxn(s => { s.meta.put('during', Buffer.from([7])); });
	await assert.rejects(compaction, /a write was committed while the copy was taken; nothing renamed/);
	assert.deepEqual(leftovers(), []);
	const after = await rows();
	assert.deepEqual({ ...after }, { ...before });
	assert.deepEqual((await getGraphStore()).meta.get('during'), Buffer.from([7]));
});

test('a completed compaction leaves only the checked copy', async () => {
	await seed();
	const before = await rows();
	const result = await compactGraphStore();
	assert.ok(result.savedBytes > 0);
	assert.deepEqual(leftovers(), []);
	assert.deepEqual(await rows(), before);
});
