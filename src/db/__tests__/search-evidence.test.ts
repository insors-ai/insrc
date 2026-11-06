/**
 * Epic c2ba6fa6, Story s7, t5 -- the reads that return relationships return
 * their evidence. Against a real temporary graph store: findCallers and
 * findCallees return each entity with the evidence of the relationship that
 * reached it; edges written with an empty value, as every daemon before s7
 * wrote them, read 'unknown' with no migration (ac3); outNeighbors' opt-in
 * withEvidence form returns one row per relationship across kinds while the
 * id-only form still dedupes; a traversal's result does not depend on the
 * evidence its edges hold.
 *
 * Run: npx tsx --test src/db/__tests__/search-evidence.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, SCHEMA_VERSION, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { encodeInEdgeKey, encodeOutEdgeKey, RELATION_KIND_BYTE, type RelationKind } from '../graph/keys.js';
import { inNeighbors, outNeighbors } from '../graph/edges.js';
import { transitiveClosure } from '../graph/traversal.js';
import { entityU64ForId, upsertEntities } from '../entities.js';
import { findCallees, findCallers } from '../search.js';
import { addRepo } from '../repos.js';
import { upsertResolvedRelationsInTxn } from '../relations.js';
import type { Entity, Relation, RelationEvidence } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const REPO = '/repo/search-evidence';

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-search-evidence-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'search-evidence', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function entity(name: string): Entity {
	const file = `${REPO}/src/${name}.ts`;
	return {
		id: createHash('sha256').update(`${REPO}\x00${file}\x00function\x00${name}`).digest('hex').slice(0, 32),
		kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine: 1, endLine: 2, body: `function ${name}() {}`, embedding: [], indexedAt: '2026-11-02T00:00:00.000Z',
	};
}
const rel = (kind: RelationKind, from: Entity, to: Entity, evidence?: RelationEvidence): Relation =>
	({ kind: kind as Relation['kind'], from: from.id, to: to.id, resolved: true, meta: { repo: REPO }, ...(evidence !== undefined && { evidence }) });
const write = (...relations: Relation[]) => withWriteTxn(s => { upsertResolvedRelationsInTxn(s, relations); });
const byName = (es: ReadonlyArray<Entity & { evidence: RelationEvidence }>) => es.map(e => `${e.name}: ${e.evidence}`).sort();

test('s7 t5: findCallers and findCallees return each entity with the evidence of the relationship that reached it', async () => {
	const [target, a, b, c] = ['target', 'a', 'b', 'c'].map(entity) as [Entity, Entity, Entity, Entity];
	await upsertEntities(null, [target, a, b, c]);
	await write(rel('CALLS', a, target, 'extracted'), rel('CALLS', b, target, 'inferred'), rel('CALLS', c, target), rel('CALLS', a, b, 'inferred'));

	assert.deepEqual(byName(await findCallers(null, target.id)), ['a: extracted', 'b: inferred', 'c: unknown']);
	assert.deepEqual(byName(await findCallees(null, a.id)), ['b: inferred', 'target: extracted']);
});

test('s7 t5: edges written with an empty value, as before s7, read unknown after a reopen with no migration and the schema version unchanged (ac3)', async () => {
	const [target, a] = [entity('target'), entity('a')];
	await upsertEntities(null, [target, a]);
	const [t, f] = [(await entityU64ForId(target.id))!, (await entityU64ForId(a.id))!];
	// The rows exactly as a daemon before s7 wrote them: keys only, empty values.
	await withWriteTxn(s => {
		s.outEdge.put(encodeOutEdgeKey(f, RELATION_KIND_BYTE['CALLS'], t), Buffer.alloc(0));
		s.inEdge.put(encodeInEdgeKey(t, RELATION_KIND_BYTE['CALLS'], f), Buffer.alloc(0));
	});

	await closeGraphStore();
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await getGraphStore();

	assert.equal(SCHEMA_VERSION, 10, 'no schema step was added for evidence; 7 is the s9 step for kinds and namespaces, 8 the s8 subsystem tables, 9 the s10 document-relationship tables, 10 the repair of the retired v2 entity index');
	assert.deepEqual(byName(await findCallers(null, target.id)), ['a: unknown']);
	assert.deepEqual(byName(await findCallees(null, a.id)), ['target: unknown']);
});

test('s7 t5: outNeighbors with withEvidence returns one row per stored relationship across kinds with its kind and evidence; the id-only form still dedupes', async () => {
	const [a, b] = [entity('a'), entity('b')];
	await upsertEntities(null, [a, b]);
	await write(rel('CALLS', a, b, 'inferred'), rel('REFERENCES', a, b, 'extracted'));
	const [fa, fb] = [(await entityU64ForId(a.id))!, (await entityU64ForId(b.id))!];

	const out = await outNeighbors(fa, { withEvidence: true });
	assert.deepEqual(out.map(r => `${r.kind} ${r.u64 === fb ? 'b' : '?'}: ${r.evidence}`).sort(), ['CALLS b: inferred', 'REFERENCES b: extracted']);
	assert.deepEqual(await outNeighbors(fa), [fb], 'the id-only form keeps one entry per neighbour');
	const into = await inNeighbors(fb, { kindFilter: ['CALLS'], withEvidence: true });
	assert.deepEqual(into.map(r => [r.u64, r.kind, r.evidence]), [[fa, 'CALLS', 'inferred']]);
});

test('s7 t5: a transitive closure is the same whatever evidence its edges hold', async () => {
	const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(entity) as [Entity, Entity, Entity, Entity];
	await upsertEntities(null, [a, b, c, d]);
	await write(rel('CALLS', a, b), rel('CALLS', b, c), rel('CALLS', c, d));
	const root = (await entityU64ForId(a.id))!;
	const before = [...await transitiveClosure([root], { kindFilter: ['CALLS'] })].sort();

	await write(rel('CALLS', a, b, 'extracted'), rel('CALLS', b, c, 'inferred'), rel('CALLS', c, d, 'model'));
	const after = [...await transitiveClosure([root], { kindFilter: ['CALLS'] })].sort();

	assert.equal(before.length, 4);
	assert.deepEqual(after, before);
});

test('s7 review: a withEvidence read skips a row whose kind byte this build does not know, instead of failing the read', async () => {
	const [a, b, c] = [entity('a'), entity('b'), entity('c')];
	await upsertEntities(null, [a, b, c]);
	await write(rel('CALLS', a, b, 'inferred'));
	const [fa, fc] = [(await entityU64ForId(a.id))!, (await entityU64ForId(c.id))!];
	await withWriteTxn(s => { s.outEdge.put(encodeOutEdgeKey(fa, 250, fc), Buffer.from([0x01])); });   // a kind from a newer daemon

	const out = await outNeighbors(fa, { withEvidence: true });
	assert.deepEqual(out.map(r => `${r.kind}: ${r.evidence}`), ['CALLS: inferred']);
});
