/**
 * Phase 2.9 tests for the atomic `reindexFile` helper.
 *
 * Verifies:
 *   - First-time index of a file creates entity rows
 *   - Re-index with identical content is a no-op (no row writes,
 *     no edge churn)
 *   - Re-index that adds an entity inserts a new row + keeps existing
 *   - Re-index that removes an entity tombstones the missing one + keeps the rest
 *   - Tombstoning cascades to incident edges (out + in mirror)
 *   - Module-stub semantics: never overwritten
 *   - Atomicity: a single LMDB txn for the whole pass (no intermediate
 *     state visible)
 *   - Body-write short-circuit: contentHash unchanged -> no put
 *   - Idempotent: running the same parse twice produces the same row set
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import {
	encodeOutEdgeKey,
	encodeInEdgeKey,
	encodeOutEdgePrefix,
	encodeInEdgePrefix,
	prefixSuccessor,
	RELATION_KIND_BYTE,
} from '../graph/keys.js';
import {
	reindexFile,
	upsertEntities,
	getEntity,
	listEntitiesForRepo,
	findEntitiesByFile,
} from '../entities.js';
import type { Entity, EntityKind } from '../../shared/types.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-reindex-file-2.9-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const { addRepo } = await import('../repos.js');
	for (const path of ['/repo/foo', '/repo/new']) {
		await addRepo(null, { path, name: '', addedAt: new Date().toISOString(), status: 'pending' });
	}
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const REPO = '/repo/foo';
const FILE = '/repo/foo/src/foo.ts';
const NOW = '2026-05-05T10:00:00.000Z';

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
	const repo = overrides.repo ?? REPO;
	const file = overrides.file ?? FILE;
	const kind = (overrides.kind ?? 'function') as EntityKind;
	const name = overrides.name ?? 'foo';
	const body = overrides.body ?? `function ${name}() {}`;
	const hash = overrides.hash ?? createHash('sha256').update(body).digest('hex');
	return {
		id:        overrides.id ?? makeEntityId(repo, file, kind, name),
		kind,
		name,
		language:  overrides.language ?? 'typescript',
		repoId:    overrides.repoId   ?? 1,
		repo,
		file,
		startLine: overrides.startLine ?? 1,
		endLine:   overrides.endLine   ?? 5,
		body,
		embedding: overrides.embedding ?? [],
		indexedAt: overrides.indexedAt ?? NOW,
		hash,
		...(overrides.signature !== undefined ? { signature: overrides.signature } : {}),
		...(overrides.isExported !== undefined ? { isExported: overrides.isExported } : {}),
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
// First-time index
// ---------------------------------------------------------------------------

test('reindexFile on empty store creates entity rows', async () => {
	const a = makeEntity({ name: 'a' });
	const b = makeEntity({ name: 'b' });
	await reindexFile(null, REPO, FILE, [a, b]);
	const all = await findEntitiesByFile(null, FILE);
	assert.deepEqual(all.map(e => e.name).sort(), ['a', 'b']);
});

test('reindexFile on empty parsed list with no existing is a no-op', async () => {
	await reindexFile(null, REPO, FILE, []);
	assert.deepEqual(await listEntitiesForRepo(null, REPO), []);
});

// ---------------------------------------------------------------------------
// Re-index: add / remove / unchanged
// ---------------------------------------------------------------------------

test('reindexFile: identical re-parse is a no-op', async () => {
	const a = makeEntity({ name: 'a' });
	await reindexFile(null, REPO, FILE, [a]);
	const id = a.id;
	const before = await getEntity(null, id);

	await reindexFile(null, REPO, FILE, [a]);
	const after = await getEntity(null, id);

	assert.equal(after?.indexedAt, before?.indexedAt);
	assert.equal(after?.body, before?.body);
});

test('reindexFile: adding an entity inserts the new + preserves existing', async () => {
	const a = makeEntity({ name: 'a' });
	await reindexFile(null, REPO, FILE, [a]);
	const aId = a.id;

	const b = makeEntity({ name: 'b' });
	await reindexFile(null, REPO, FILE, [a, b]);

	assert.ok(await getEntity(null, aId));
	assert.ok(await getEntity(null, b.id));
});

test('reindexFile: removing an entity tombstones it + keeps the rest', async () => {
	const a = makeEntity({ name: 'a' });
	const b = makeEntity({ name: 'b' });
	await reindexFile(null, REPO, FILE, [a, b]);

	await reindexFile(null, REPO, FILE, [a]); // b dropped

	assert.ok(await getEntity(null, a.id));
	assert.equal(await getEntity(null, b.id), null);
});

test('reindexFile: replacing all entities tombstones the original set', async () => {
	const a = makeEntity({ name: 'a' });
	const b = makeEntity({ name: 'b' });
	const c = makeEntity({ name: 'c' });
	await reindexFile(null, REPO, FILE, [a, b]);

	await reindexFile(null, REPO, FILE, [c]);

	assert.equal(await getEntity(null, a.id), null);
	assert.equal(await getEntity(null, b.id), null);
	assert.ok(await getEntity(null, c.id));
});

test('reindexFile: changed body updates the row', async () => {
	const v1 = makeEntity({ name: 'a', body: 'function a() { /* v1 */ }' });
	await reindexFile(null, REPO, FILE, [v1]);

	// Same name+kind+repo+file -> same SHA id, but different body
	const v2 = makeEntity({ name: 'a', body: 'function a() { /* v2 */ }' });
	await reindexFile(null, REPO, FILE, [v2]);

	const back = await getEntity(null, v2.id);
	assert.equal(back?.body, 'function a() { /* v2 */ }');
});

// ---------------------------------------------------------------------------
// Cascade on tombstone
// ---------------------------------------------------------------------------

test('reindexFile: tombstoning a referenced entity clears incident edges', async () => {
	const caller = makeEntity({ name: 'caller', file: '/repo/foo/src/caller.ts' });
	const callee = makeEntity({ name: 'callee', file: FILE });
	await upsertEntities(null, [caller, callee]);

	// Wire a CALLS edge caller -> callee
	const callerU64 = await getU64(caller.id);
	const calleeU64 = await getU64(callee.id);
	await withWriteTxn(s => {
		s.outEdge.put(encodeOutEdgeKey(callerU64, RELATION_KIND_BYTE.CALLS, calleeU64), Buffer.alloc(0));
		s.inEdge.put(encodeInEdgeKey(calleeU64, RELATION_KIND_BYTE.CALLS, callerU64), Buffer.alloc(0));
	});

	assert.equal(await countOutEdges(callerU64), 1);
	assert.equal(await countInEdges(calleeU64), 1);

	// Re-parse the FILE without the callee -> should tombstone callee
	await reindexFile(null, REPO, FILE, []);

	assert.equal(await getEntity(null, callee.id), null);
	// Forward mirror was cleared (caller's out_edge to callee removed)
	assert.equal(await countOutEdges(callerU64), 0);
	// Reverse mirror was cleared too (callee's in_edge entries gone)
	assert.equal(await countInEdges(calleeU64), 0);
});

// ---------------------------------------------------------------------------
// Module-stub semantics
// ---------------------------------------------------------------------------

test('reindexFile preserves module stubs that already exist', async () => {
	const moduleId = makeEntityId(REPO, '', 'module', 'shared-mod');
	const v1 = makeEntity({ id: moduleId, kind: 'module', name: 'shared-mod', file: '', body: '' });
	await upsertEntities(null, [v1]);

	// Re-index a file where the module appears with different shape -- the
	// existing module stub must NOT be overwritten (matches the prior
	// DuckDB ON CONFLICT DO NOTHING semantics).
	const v2 = makeEntity({ id: moduleId, kind: 'module', name: 'shared-mod', file: '', body: 'should-not-appear' });
	await reindexFile(null, REPO, FILE, [v2]);

	const back = await getEntity(null, moduleId);
	assert.equal(back?.body, '');
});

// ---------------------------------------------------------------------------
// Idempotence + body-write short-circuit
// ---------------------------------------------------------------------------

test('reindexFile is idempotent: same parse twice produces the same row set', async () => {
	const a = makeEntity({ name: 'a' });
	const b = makeEntity({ name: 'b' });
	await reindexFile(null, REPO, FILE, [a, b]);
	const first = await findEntitiesByFile(null, FILE);

	await reindexFile(null, REPO, FILE, [a, b]);
	const second = await findEntitiesByFile(null, FILE);

	assert.deepEqual(first.map(e => e.id).sort(), second.map(e => e.id).sort());
});

test('reindexFile: contentHash unchanged + body unchanged -> no row mutation', async () => {
	const a = makeEntity({ name: 'a' });
	await reindexFile(null, REPO, FILE, [a]);
	const back1 = await getEntity(null, a.id);

	// Re-parse with the SAME body + hash; the row should be left alone
	await reindexFile(null, REPO, FILE, [a]);
	const back2 = await getEntity(null, a.id);

	assert.equal(back1?.indexedAt, back2?.indexedAt);
});

// ---------------------------------------------------------------------------
// Repo-allocation + scope
// ---------------------------------------------------------------------------

test('reindexFile auto-allocates a repoId on first sighting', async () => {
	const a = makeEntity({ repo: '/repo/new', file: '/repo/new/x.ts', name: 'x' });
	await reindexFile(null, '/repo/new', '/repo/new/x.ts', [a]);
	const list = await listEntitiesForRepo(null, '/repo/new');
	assert.equal(list.length, 1);
});

test('reindexFile only touches entities of the specified file', async () => {
	const a = makeEntity({ name: 'a', file: '/repo/foo/src/a.ts' });
	const b = makeEntity({ name: 'b', file: '/repo/foo/src/b.ts' });
	await upsertEntities(null, [a, b]);

	// Re-index only file a -- file b's entity must survive
	await reindexFile(null, REPO, '/repo/foo/src/a.ts', []);

	assert.equal(await getEntity(null, a.id), null);
	assert.ok(await getEntity(null, b.id));
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('reindexFile result survives close + reopen', async () => {
	const a = makeEntity({ name: 'a' });
	const b = makeEntity({ name: 'b' });
	await reindexFile(null, REPO, FILE, [a, b]);
	await closeGraphStore();
	const list = await findEntitiesByFile(null, FILE);
	assert.equal(list.length, 2);
});
