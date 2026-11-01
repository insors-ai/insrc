/**
 * Epic c2ba6fa6, Story s7, t2 -- the evidence of a relationship is the value of
 * both of its edge rows. Against a real temporary graph store: both writers put
 * the same byte on both rows and a rewrite replaces it; an evidence that is not
 * a value is stored empty with a warn log and the relationship is still stored;
 * a relationship kept awaiting its target carries its evidence and its later
 * promotion stores it; an edge returned to pending keeps its evidence when it
 * is promoted again.
 *
 * Run: npx tsx --test src/db/__tests__/relations-evidence.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { decodeEvidence } from '../graph/codec.js';
import { encodeInEdgeKey, encodeOutEdgeKey, RELATION_KIND_BYTE } from '../graph/keys.js';
import { commitFile, entityU64ForId } from '../entities.js';
import { addRepo } from '../repos.js';
import { listUnresolvedRelations, promoteResolvedBatch, upsertResolvedRelationsInTxn } from '../relations.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity, Relation, RelationEvidence } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const REPO = '/repo/evidence';
const A = `${REPO}/src/a.ts`;
const B = `${REPO}/src/b.ts`;

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-relations-evidence-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'evidence', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function entity(file: string, name: string): Entity {
	return {
		id: createHash('sha256').update(`${REPO}\x00${file}\x00function\x00${name}`).digest('hex').slice(0, 32),
		kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine: 1, endLine: 2, body: `function ${name}() {}`, embedding: [], indexedAt: '2026-11-02T00:00:00.000Z',
	};
}
const calls = (from: Entity, to: Entity, evidence?: string): Relation =>
	({ kind: 'CALLS', from: from.id, to: to.id, resolved: true, meta: { repo: REPO, file: from.file }, ...(evidence !== undefined && { evidence: evidence as RelationEvidence }) });
const write = (...relations: Relation[]) => withWriteTxn(s => upsertResolvedRelationsInTxn(s, relations));

/** The evidence on each of the two rows of from -CALLS-> to (undefined when a row is absent). */
async function rows(from: Entity, to: Entity): Promise<{ out: RelationEvidence | undefined; in: RelationEvidence | undefined; outBytes: number; inBytes: number }> {
	const store = await getGraphStore();
	const [f, t] = [await entityU64ForId(from.id), await entityU64ForId(to.id)];
	if (f === undefined || t === undefined) return { out: undefined, in: undefined, outBytes: -1, inBytes: -1 };
	const kind = RELATION_KIND_BYTE['CALLS'];
	const out = store.outEdge.get(encodeOutEdgeKey(f, kind, t)) as Buffer | undefined;
	const inn = store.inEdge.get(encodeInEdgeKey(t, kind, f)) as Buffer | undefined;
	return {
		out: out === undefined ? undefined : decodeEvidence(out), in: inn === undefined ? undefined : decodeEvidence(inn),
		outBytes: out?.length ?? -1, inBytes: inn?.length ?? -1,
	};
}

test('s7 t2: upsertResolvedRelationsInTxn writes the evidence byte to both edge rows, and a rewrite with another evidence replaces it on both', async () => {
	const [a, b] = [entity(A, 'a'), entity(B, 'b')];
	await commitFile({ repoPath: REPO, filePath: B, contentHash: 'h', entities: [b], relations: [] });
	await commitFile({ repoPath: REPO, filePath: A, contentHash: 'h', entities: [a], relations: [] });

	await write(calls(a, b, 'extracted'));
	assert.deepEqual(await rows(a, b), { out: 'extracted', in: 'extracted', outBytes: 1, inBytes: 1 });

	await write(calls(a, b, 'inferred'));
	assert.deepEqual(await rows(a, b), { out: 'inferred', in: 'inferred', outBytes: 1, inBytes: 1 });

	await write(calls(a, b));   // a writer that does not know: stored empty, reads unknown
	assert.deepEqual(await rows(a, b), { out: 'unknown', in: 'unknown', outBytes: 0, inBytes: 0 });
});

test('s7 t2: an evidence that is not a value stores the relationship with an empty value and a warn log; it is not refused', async (t) => {
	const [a, b] = [entity(A, 'a'), entity(B, 'b')];
	await commitFile({ repoPath: REPO, filePath: B, contentHash: 'h', entities: [b], relations: [] });
	await commitFile({ repoPath: REPO, filePath: A, contentHash: 'h', entities: [a], relations: [] });
	const warn = t.mock.method(getLogger('db.relations'), 'warn');

	const counts = await write(calls(a, b, 'guessed'));

	assert.equal(counts.stored, 1);
	assert.deepEqual(await rows(a, b), { out: 'unknown', in: 'unknown', outBytes: 0, inBytes: 0 });
	assert.ok(warn.mock.calls.some(c => JSON.stringify(c.arguments).includes('guessed')), 'warned about the evidence');
});

test('s7 t2: a relationship kept awaiting its target carries its evidence, and promoteResolvedBatch without an evidence stores the carried one; a given evidence wins', async () => {
	const [a, b, c] = [entity(A, 'a'), entity(B, 'b'), entity(B, 'c')];
	await commitFile({ repoPath: REPO, filePath: A, contentHash: 'h', entities: [a], relations: [] });

	// b and c are not stored yet: both relationships wait, with their evidence.
	const counts = await write(calls(a, b, 'extracted'), calls(a, c, 'extracted'));
	assert.equal(counts.pending, 2);
	const waiting = await listUnresolvedRelations(null, REPO);
	assert.deepEqual(waiting.map(r => r.meta?.['evidence']), ['extracted', 'extracted']);

	await commitFile({ repoPath: REPO, filePath: B, contentHash: 'h', entities: [b, c], relations: [] });
	const toB = waiting.find(r => r.rawTo === b.id)!;
	const toC = waiting.find(r => r.rawTo === c.id)!;
	const result = await promoteResolvedBatch(null, [
		{ unresolved: toB, targetEntityId: b.id },                         // as Pass 0 completes it: the carried value
		{ unresolved: toC, targetEntityId: c.id, evidence: 'inferred' },   // a promoter that decides
	]);

	assert.equal(result.promoted, 2);
	assert.deepEqual(await rows(a, b), { out: 'extracted', in: 'extracted', outBytes: 1, inBytes: 1 });
	assert.deepEqual(await rows(a, c), { out: 'inferred', in: 'inferred', outBytes: 1, inBytes: 1 });
});

test('s7 t2: an edge returned to pending when its target is removed keeps its evidence, and is promoted again with it', async () => {
	const [a, b] = [entity(A, 'a'), entity(B, 'b')];
	await commitFile({ repoPath: REPO, filePath: B, contentHash: 'h', entities: [b], relations: [] });
	await commitFile({ repoPath: REPO, filePath: A, contentHash: 'h', entities: [a], relations: [] });
	await write(calls(a, b, 'inferred'));

	// b's file is removed: a's call to b returns to pending, awaiting b's id.
	const removal = await commitFile({ repoPath: REPO, filePath: B, contentHash: null, entities: [], relations: [] });
	assert.equal(removal.relationsReturnedToPending, 1);
	const [returned] = await listUnresolvedRelations(null, REPO);
	assert.equal(returned?.meta?.['evidence'], 'inferred');

	await commitFile({ repoPath: REPO, filePath: B, contentHash: 'h2', entities: [b], relations: [] });
	await promoteResolvedBatch(null, [{ unresolved: returned!, targetEntityId: b.id }]);
	assert.deepEqual(await rows(a, b), { out: 'inferred', in: 'inferred', outBytes: 1, inBytes: 1 });
});
