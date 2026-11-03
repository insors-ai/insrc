/**
 * Epic c2ba6fa6, Story s2, t1 -- the relationship writers' in-transaction
 * bodies. The file commit calls them inside its own write transaction, so their
 * writes must take effect with the caller's commit and roll back with the
 * caller's failure, and they must apply the same rule as the async writers.
 *
 * Run: npx tsx --test src/db/__tests__/relations-in-txn.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { encodeOutEdgeKey, RELATION_KIND_BYTE } from '../graph/keys.js';
import { entityU64ForId, upsertEntities } from '../entities.js';
import { readIndexState } from '../index-state.js';
import { addRepo } from '../repos.js';
import { upsertResolvedRelationsInTxn, upsertUnresolvedRelationsInTxn } from '../relations.js';
import type { Entity, Relation } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const REPO = '/repo/in-txn';

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-relations-in-txn-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'in-txn', addedAt: '2026-11-01T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function id(file: string, kind: string, name: string): string {
	return createHash('sha256').update(`${REPO}\x00${file}\x00${kind}\x00${name}`).digest('hex').slice(0, 32);
}
function entity(name: string): Entity {
	const file = `${REPO}/src/${name}.ts`;
	return {
		id: id(file, 'function', name), kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine: 1, endLine: 2, body: `function ${name}() {}`, embedding: [], indexedAt: '2026-11-01T00:00:00.000Z',
	};
}

/** What the store holds after a reopen: the a->b CALLS edge, the pending row count, and the repository's pending/unwritable counts. */
async function storedAfterReopen(a: Entity, b: Entity): Promise<{ edge: boolean; pendingRows: number; awaiting: number; unwritable: number }> {
	await closeGraphStore();
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const store = await getGraphStore();
	const [fromU64, toU64] = [await entityU64ForId(a.id), await entityU64ForId(b.id)];
	const edge = fromU64 !== undefined && toU64 !== undefined
		&& store.outEdge.get(encodeOutEdgeKey(fromU64, RELATION_KIND_BYTE['CALLS'], toU64)) !== undefined;
	const state = await readIndexState(REPO);
	return { edge, pendingRows: [...store.unresolved.getKeys()].length, awaiting: state?.pending['awaiting-target'] ?? 0, unwritable: state?.unwritable ?? 0 };
}

function batch(a: Entity, b: Entity): { resolved: Relation[]; pending: Relation[] } {
	return {
		resolved: [
			{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },                                     // edge
			{ kind: 'CALLS', from: a.id, to: id(`${REPO}/src/later.ts`, 'function', 'later'), resolved: true, meta: { repo: REPO } }, // awaiting
			{ kind: 'CALLS', from: 'no-such-source', to: b.id, resolved: true, meta: { repo: REPO } },   // unwritable
		],
		pending: [
			{ kind: 'IMPORTS', from: a.id, to: './elsewhere', resolved: false, meta: { repo: REPO, file: a.file } }, // pending row
			{ kind: 'IMPORTS', from: a.id, to: './nowhere', resolved: false, meta: { repo: REPO } },                  // unwritable: no file
		],
	};
}

test('both in-transaction bodies write inside the caller\'s transaction and report what they did, by the same rule as the async writers', async () => {
	const [a, b] = [entity('a'), entity('b')];
	await upsertEntities(null, [a, b]);
	const { resolved, pending } = batch(a, b);

	const counts = await withWriteTxn(s => ({
		resolved: upsertResolvedRelationsInTxn(s, resolved),
		pending: upsertUnresolvedRelationsInTxn(s, pending),
	}));

	assert.deepEqual([counts.resolved.stored, counts.resolved.pending, counts.resolved.unwritable], [1, 1, 1]);
	assert.deepEqual([counts.pending.stored, counts.pending.pending, counts.pending.unwritable], [0, 1, 1]);
	assert.deepEqual(counts.resolved.refused.map(r => r.reason), ['source-missing']);
	assert.deepEqual(counts.pending.refused.map(r => r.reason), ['pending-without-file']);
	assert.deepEqual(await storedAfterReopen(a, b), { edge: true, pendingRows: 2, awaiting: 2, unwritable: 2 });
});

test('a caller\'s transaction that throws after both bodies ran keeps none of their writes (read after a reopen)', async () => {
	const [a, b] = [entity('a'), entity('b')];
	await upsertEntities(null, [a, b]);
	const before = await storedAfterReopen(a, b);
	const { resolved, pending } = batch(a, b);

	await assert.rejects(withWriteTxn(s => {
		upsertResolvedRelationsInTxn(s, resolved);
		upsertUnresolvedRelationsInTxn(s, pending);
		throw new Error('the caller fails after the relationship writes');
	}), /the caller fails/);

	assert.deepEqual(await storedAfterReopen(a, b), before);
	assert.deepEqual(before, { edge: false, pendingRows: 0, awaiting: 0, unwritable: 0 });
});
