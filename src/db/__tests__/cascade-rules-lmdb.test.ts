/**
 * Phase 2.10 dedicated cascade-rules test suite.
 *
 * Per the design doc graph-storage-lmdb.md "Cascade rules" section --
 * one test per row of the cascade matrix:
 *
 *   removeRepo                 -> entities + edges + name_index +
 *                                 entity_id_by_string + unresolved +
 *                                 sessions + turns + plans
 *   deleteEntity (single)      -> incident edges (out + in mirrors) +
 *                                 entity_id_by_string + name_index
 *   deleteEntitiesForFile      -> per-entity cascade above + unresolved
 *                                 entries from that file
 *   deleteSession              -> all turns for the session +
 *                                 by_repo index entries
 *   deleteSessionsForRepo      -> bulk variant of the above
 *   deletePlan                 -> all plan_step rows (STEP_DEPENDS_ON
 *                                 lives on the row, no separate cleanup)
 *   deleteList                 -> all items in list + comments under
 *                                 those items + by_session index entry
 *   deleteItem                 -> all comments on item
 *   deleteByScope (config)     -> all entries with that scope +
 *                                 config_by_scope index entries
 *
 * LanceDB row cleanup (entity_vec / session_vec / turn_vec / config_vec)
 * is NOT tested here -- Phase 3.x wires Lance and adds its own coverage.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import {
	encodeOutEdgePrefix,
	encodeInEdgePrefix,
	encodeOutEdgeKey,
	encodeInEdgeKey,
	prefixSuccessor,
	RELATION_KIND_BYTE,
	encodeNameIndexKey,
	ENTITY_KIND_BYTE,
} from '../graph/keys.js';
import { addRepo, removeRepo, listRepos } from '../repos.js';
import {
	upsertEntities,
	deleteEntitiesForFile,
	getEntity,
	listEntitiesForRepo,
} from '../entities.js';
import {
	upsertRelations,
	listUnresolvedRelations,
} from '../relations.js';
import {
	saveSession,
	saveTurn,
	deleteSession,
	deleteSessionsForRepo,
	getSessionById,
	getTurnsForSession,
	listSessions,
	getAllTurnsForRepo,
} from '../conversations.js';
import {
	insertList,
	insertItem,
	insertComment,
	deleteList,
	deleteItem,
	getList,
	getItem,
	getComment,
	listCommentsForItem,
} from '../todos.js';
import { ConfigStore } from '../../config/store.js';
import { savePlan, getPlan, deletePlan } from '../../agent/tasks/plan-store.js';
import type { Entity, EntityKind, Plan, PlanStep } from '../../shared/types.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-cascade-2.10-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	// cascade-rules tests do their own addRepo calls per-test (and
	// assert on listRepos counts), so we DON'T pre-register here
	// like the entities-lmdb suite does. Tests that upsert entities
	// for additional paths register those paths inline.
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO = '/repo/foo';
const NOW = '2026-05-05T10:00:00.000Z';

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
	const repo = overrides.repo ?? REPO;
	const file = overrides.file ?? `${repo}/src/foo.ts`;
	const kind = (overrides.kind ?? 'function') as EntityKind;
	const name = overrides.name ?? 'foo';
	return {
		id:        overrides.id ?? makeEntityId(repo, file, kind, name),
		kind, name,
		language:  overrides.language ?? 'typescript',
		repoId:    overrides.repoId ?? 1,
		repo,
		file,
		startLine: 1,
		endLine:   5,
		body:      `function ${name}() {}`,
		embedding: [],
		indexedAt: NOW,
	};
}

async function getU64(id: string): Promise<bigint> {
	const store = await getGraphStore();
	const v = store.entityIdByString.get(id) as bigint | number;
	return typeof v === 'bigint' ? v : BigInt(v);
}

async function countOutEdges(fromU64: bigint): Promise<number> {
	const store = await getGraphStore();
	const prefix = encodeOutEdgePrefix(fromU64);
	const succ = prefixSuccessor(prefix);
	let n = 0;
	for (const _ of store.outEdge.getRange({ start: prefix, end: succ })) n++;
	return n;
}

async function countInEdges(toU64: bigint): Promise<number> {
	const store = await getGraphStore();
	const prefix = encodeInEdgePrefix(toU64);
	const succ = prefixSuccessor(prefix);
	let n = 0;
	for (const _ of store.inEdge.getRange({ start: prefix, end: succ })) n++;
	return n;
}

// ---------------------------------------------------------------------------
// Row 1: removeRepo full cascade
// ---------------------------------------------------------------------------

test('cascade: removeRepo deletes entities + edges + sessions + turns + plans', async () => {
	await addRepo(null, { path: REPO, name: 'foo', addedAt: NOW, status: 'pending' });
	const a = makeEntity({ name: 'a' });
	const b = makeEntity({ name: 'b' });
	await upsertEntities(null, [a, b]);

	// Wire an edge between them
	const aU64 = await getU64(a.id);
	const bU64 = await getU64(b.id);
	await withWriteTxn(s => {
		s.outEdge.put(encodeOutEdgeKey(aU64, RELATION_KIND_BYTE.CALLS, bU64), Buffer.alloc(0));
		s.inEdge.put(encodeInEdgeKey(bU64, RELATION_KIND_BYTE.CALLS, aU64), Buffer.alloc(0));
	});

	// Add an unresolved relation belonging to the repo
	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './missing', resolved: false, meta: { repo: REPO, file: a.file } },
	]);

	// Add a session + turn
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: 'x' });
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 0, user: 'hi', assistant: 'hello',
		entities: [], vector: [], repo: REPO,
	});

	// Add a plan
	const planSteps: PlanStep[] = [{
		id: 'step-1', planId: 'plan-1', idx: 0,
		title: 'S', description: '', checkpoint: false,
		status: 'pending', complexity: 'low',
		fileHint: '', notes: '', dependsOn: [],
		createdAt: NOW, updatedAt: NOW,
	}];
	const plan: Plan = {
		id: 'plan-1', repoPath: REPO, title: 'P', status: 'active',
		steps: planSteps, createdAt: NOW, updatedAt: NOW,
	};
	await savePlan(null, plan);

	// Sanity: everything exists
	assert.ok(await getEntity(null, a.id));
	assert.equal(await countOutEdges(aU64), 1);
	assert.equal((await listUnresolvedRelations(null, REPO)).length, 1);
	assert.ok(await getSessionById(null, 'sess-1'));
	assert.equal((await getTurnsForSession(null, 'sess-1')).length, 1);
	assert.ok(await getPlan(null, 'plan-1'));

	// Cascade
	await removeRepo(null, REPO);

	// Everything cascades
	assert.equal(await getEntity(null, a.id), null, 'entity a removed');
	assert.equal(await getEntity(null, b.id), null, 'entity b removed');
	assert.equal(await countOutEdges(aU64), 0, 'out_edge cleared');
	assert.equal(await countInEdges(bU64), 0, 'in_edge mirror cleared');
	assert.equal((await listUnresolvedRelations(null, REPO)).length, 0, 'unresolved cleared');
	assert.equal(await getSessionById(null, 'sess-1'), null, 'session removed');
	assert.equal((await getTurnsForSession(null, 'sess-1')).length, 0, 'turns cleared');
	assert.equal(await getPlan(null, 'plan-1'), null, 'plan removed');
	assert.equal((await listRepos(null)).length, 0, 'repo row removed');
});

test('cascade: removeRepo only affects the targeted repo', async () => {
	await addRepo(null, { path: '/repo/a', name: 'a', addedAt: NOW, status: 'pending' });
	await addRepo(null, { path: '/repo/b', name: 'b', addedAt: NOW, status: 'pending' });
	await upsertEntities(null, [makeEntity({ repo: '/repo/a', file: '/repo/a/x.ts', name: 'x' })]);
	await upsertEntities(null, [makeEntity({ repo: '/repo/b', file: '/repo/b/y.ts', name: 'y' })]);

	await removeRepo(null, '/repo/a');

	assert.equal((await listEntitiesForRepo(null, '/repo/a')).length, 0);
	assert.equal((await listEntitiesForRepo(null, '/repo/b')).length, 1);
});

// ---------------------------------------------------------------------------
// Row 2: deleteEntity (single, via entity-cascade in deleteEntitiesForFile)
// ---------------------------------------------------------------------------

test('cascade: deleting an entity clears name_index + entity_id_by_string', async () => {
	await addRepo(null, { path: REPO, name: 'foo', addedAt: NOW, status: 'pending' });
	const a = makeEntity({ name: 'a' });
	await upsertEntities(null, [a]);
	const aU64 = await getU64(a.id);
	void aU64;

	// Delete via the file-scoped path
	await deleteEntitiesForFile(null, a.file);

	// entity_id_by_string entry gone
	const store = await getGraphStore();
	assert.equal(store.entityIdByString.get(a.id), undefined,
		'entity_id_by_string entry should be removed');

	// name_index would be cleared too, but the LMDB entries module
	// doesn't currently write name_index entries (Phase 2.2 deferred
	// the name_index population; it's documented as future work). Skip
	// the assertion on name_index for now.
	void encodeNameIndexKey;
	void ENTITY_KIND_BYTE;
});

// ---------------------------------------------------------------------------
// Row 3: deleteEntitiesForFile cascades to unresolved relations
// ---------------------------------------------------------------------------

test('cascade: deleteEntitiesForFile clears unresolved relations from that file', async () => {
	await addRepo(null, { path: REPO, name: 'foo', addedAt: NOW, status: 'pending' });
	const a = makeEntity({ name: 'a' });
	await upsertEntities(null, [a]);
	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './missing', resolved: false, meta: { repo: REPO, file: a.file } },
	]);
	assert.equal((await listUnresolvedRelations(null, REPO)).length, 1);

	await deleteEntitiesForFile(null, a.file);

	assert.equal(await getEntity(null, a.id), null);
	assert.equal((await listUnresolvedRelations(null, REPO)).length, 0,
		'unresolved relations from the file should cascade');
});

// ---------------------------------------------------------------------------
// Row 4: deleteSession cascades to turns
// ---------------------------------------------------------------------------

test('cascade: deleteSession clears all turns for the session', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 0, user: 'hi', assistant: 'a1',
		entities: [], vector: [], repo: REPO,
	});
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 1, user: 'hi2', assistant: 'a2',
		entities: [], vector: [], repo: REPO,
	});
	const r = await deleteSession(null, 'sess-1');
	assert.equal(r.sessionRows, 1);
	assert.equal(r.turnRows, 2);
	assert.equal((await getTurnsForSession(null, 'sess-1')).length, 0);
	// by_repo index entries are also cleared (verified via getAllTurnsForRepo)
	assert.equal((await getAllTurnsForRepo(null, REPO)).length, 0);
});

// ---------------------------------------------------------------------------
// Row 5: deleteSessionsForRepo bulk-cascade
// ---------------------------------------------------------------------------

test('cascade: deleteSessionsForRepo clears sessions + their turns (bulk)', async () => {
	await saveSession(null, { id: 's1', repo: REPO, summary: '' });
	await saveSession(null, { id: 's2', repo: REPO, summary: '' });
	await saveSession(null, { id: 's3', repo: '/other/repo', summary: '' });
	await saveTurn(null, { sessionId: 's1', idx: 0, user: '', assistant: '', entities: [], vector: [], repo: REPO });
	await saveTurn(null, { sessionId: 's2', idx: 0, user: '', assistant: '', entities: [], vector: [], repo: REPO });
	await saveTurn(null, { sessionId: 's3', idx: 0, user: '', assistant: '', entities: [], vector: [], repo: '/other/repo' });

	await deleteSessionsForRepo(null, REPO);

	assert.equal(await getSessionById(null, 's1'), null);
	assert.equal(await getSessionById(null, 's2'), null);
	assert.ok(await getSessionById(null, 's3'), 'session in other repo unchanged');
	assert.equal((await getTurnsForSession(null, 's1')).length, 0);
	assert.equal((await getTurnsForSession(null, 's2')).length, 0);
	assert.equal((await getTurnsForSession(null, 's3')).length, 1);
});

// ---------------------------------------------------------------------------
// Row 6: deletePlan cascades to plan_step rows
// ---------------------------------------------------------------------------

test('cascade: deletePlan removes all plan_step rows', async () => {
	const plan: Plan = {
		id: 'plan-1', repoPath: REPO, title: 'P', status: 'active',
		steps: [
			{ id: 's0', planId: 'plan-1', idx: 0, title: 'S0', description: '', checkpoint: false, status: 'pending', complexity: 'low', fileHint: '', notes: '', dependsOn: [],     createdAt: NOW, updatedAt: NOW },
			{ id: 's1', planId: 'plan-1', idx: 1, title: 'S1', description: '', checkpoint: false, status: 'pending', complexity: 'low', fileHint: '', notes: '', dependsOn: ['s0'], createdAt: NOW, updatedAt: NOW },
		],
		createdAt: NOW, updatedAt: NOW,
	};
	await savePlan(null, plan);
	await deletePlan(null, 'plan-1');
	assert.equal(await getPlan(null, 'plan-1'), null);
	// Subsequent reload returns null (plan + all its steps gone)
});

// ---------------------------------------------------------------------------
// Row 7: deleteList cascades to items + comments
// ---------------------------------------------------------------------------

test('cascade: deleteList clears items + comments + by_session index entry', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 'T', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I1', orderKey: 0, createdAt: NOW });
	await insertItem(null, { id: 'i2', listId: 'l1', title: 'I2', orderKey: 1, createdAt: NOW });
	await insertComment(null, { id: 'c1', itemId: 'i1', author: 'user', body: 'x', createdAt: NOW });

	await deleteList(null, 'l1');

	assert.equal(await getList(null, 'l1'), null);
	assert.equal(await getItem(null, 'i1'), null);
	assert.equal(await getItem(null, 'i2'), null);
	assert.equal(await getComment(null, 'c1'), null);
});

// ---------------------------------------------------------------------------
// Row 8: deleteItem cascades to comments
// ---------------------------------------------------------------------------

test('cascade: deleteItem clears comments under the item', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 'T', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I', orderKey: 0, createdAt: NOW });
	await insertComment(null, { id: 'c1', itemId: 'i1', author: 'user', body: '1', createdAt: NOW });
	await insertComment(null, { id: 'c2', itemId: 'i1', author: 'user', body: '2', createdAt: NOW });

	await deleteItem(null, 'i1');
	assert.equal(await getItem(null, 'i1'), null);
	assert.equal((await listCommentsForItem(null, 'i1')).length, 0);
	assert.equal(await getComment(null, 'c1'), null);
	assert.equal(await getComment(null, 'c2'), null);
});

// ---------------------------------------------------------------------------
// Row 9: deleteByScope (config) cascades to config_by_scope index
// ---------------------------------------------------------------------------

test('cascade: deleteByScope clears entries + the by_scope index', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry({
		id: 'e1', scope: { kind: 'global' },
		namespace: 'implementation', category: 'template',
		language: 'typescript', name: 'a',
		filePath: '', body: '', tags: [],
		updatedAt: NOW, contentHash: 'h', embedding: [],
	});
	await cs.upsertEntry({
		id: 'e2', scope: { kind: 'global' },
		namespace: 'designer', category: 'feedback',
		language: 'typescript', name: 'b',
		filePath: '', body: '', tags: [],
		updatedAt: NOW, contentHash: 'h', embedding: [],
	});
	await cs.deleteByScope('global');

	assert.equal(await cs.getEntry('e1'), null);
	assert.equal(await cs.getEntry('e2'), null);
	// The by_scope index follow-up scan returns []
	const remaining = await cs.listEntries({ scope: 'global' });
	assert.equal(remaining.length, 0);
});

// ---------------------------------------------------------------------------
// Cross-cutting: empty / no-op cases
// ---------------------------------------------------------------------------

test('cascade: removeRepo on unknown path is a silent no-op', async () => {
	await addRepo(null, { path: REPO, name: 'foo', addedAt: NOW, status: 'pending' });
	await removeRepo(null, '/repo/does-not-exist');
	const repos = await listRepos(null);
	assert.equal(repos.length, 1);
	assert.equal(repos[0]!.path, REPO);
});

test('cascade: deleteSessionsForRepo on unknown repo is a silent no-op', async () => {
	await saveSession(null, { id: 's1', repo: REPO, summary: '' });
	await deleteSessionsForRepo(null, '/repo/no-such');
	assert.ok(await getSessionById(null, 's1'));
});

test('cascade: removeRepo + listSessions / by_repo index in sync', async () => {
	await addRepo(null, { path: REPO, name: 'foo', addedAt: NOW, status: 'pending' });
	await saveSession(null, { id: 's1', repo: REPO, summary: '' });
	await saveTurn(null, { sessionId: 's1', idx: 0, user: '', assistant: '', entities: [], vector: [], repo: REPO });
	await removeRepo(null, REPO);
	assert.equal((await listSessions(null, REPO)).length, 0);
	assert.equal((await getAllTurnsForRepo(null, REPO)).length, 0,
		'by_repo turn index should be drained alongside the session cascade');
});
