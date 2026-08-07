/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 (t1) — the external-endpoint resolution pass over a temp graph store.
 *
 * Seeds code entities + unresolved CALLS_HTTP relations, runs
 * resolveExternalEndpoints with an injected (counting) sc2 resolver, and asserts
 * each behaviour as an independently-failing case: ac1 (one node per resolved
 * target + edge per caller), ac2 dedup + per-repo split, cross-language dedup,
 * resolved-vs-literal dedup, unresolved preservation (k5), dangling-`from` skip,
 * idempotency + sc2-once-per-distinct-expr, and the no-HTTP no-op.
 *
 * Run: npx tsx --test src/indexer/__tests__/external-endpoints.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { addRepo } from '../../db/repos.js';
import { upsertEntities, entityU64ForId, entityIdsByU64s, listEntitiesByKind, getEntity } from '../../db/entities.js';
import { upsertRelations } from '../../db/relations.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { makeEntityId, makeExternalEndpointId } from '../parser/base.js';
import type { Entity, Language, Relation, ResolvedTarget } from '../../shared/types.js';
import { resolveExternalEndpoints } from '../external-endpoints.js';

const NOW = '2026-08-07T00:00:00.000Z';

let store: string;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s003-t1-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
});

// --- fixtures -------------------------------------------------------------

function fnEntity(repo: string, file: string, name: string, language: Language = 'typescript'): Entity {
	return {
		id: makeEntityId(repo, file, 'function', name),
		kind: 'function', name, language,
		repoId: 1, repo, file,
		startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: NOW,
	};
}

function callsHttp(from: Entity, rawUrl: string): Relation {
	return { kind: 'CALLS_HTTP', from: from.id, to: rawUrl, resolved: false, meta: { file: from.file, repo: from.repo } };
}

/** A counting sc2 stub: resolves known exprs to identities; counts every call. */
function stubResolver(map: Record<string, string | null>) {
	let calls = 0;
	const resolve = async (_repo: string, _protocol: 'http' | 'messaging' | 'rpc', expr: string): Promise<ResolvedTarget> => {
		calls++;
		const identity = map[expr];
		return identity != null
			? { resolved: true, protocol: 'http', identity }
			: { resolved: false, rawExpression: expr };
	};
	return { resolve, calls: () => calls };
}

async function newRepo(): Promise<string> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-s003-repo-'));
	await addRepo(null, { path: repo, name: '', addedAt: NOW, status: 'pending' });
	return repo;
}

/** Endpoint ids reachable via CALLS_HTTP from a caller entity. */
async function httpTargets(callerId: string): Promise<string[]> {
	const u64 = await entityU64ForId(callerId);
	if (u64 === undefined) return [];
	const tos = await outNeighbors(u64, { kindFilter: ['CALLS_HTTP'] });
	const idMap = await entityIdsByU64s(tos);
	return [...idMap.values()];
}

// --- ac1 ------------------------------------------------------------------

test('t1 ac1: one externalEndpoint node per distinct resolved target, with a CALLS_HTTP edge from each caller', async () => {
	const repo = await newRepo();
	const a = fnEntity(repo, `${repo}/a.ts`, 'a');
	const b = fnEntity(repo, `${repo}/b.ts`, 'b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [callsHttp(a, `'A'`), callsHttp(b, `'B'`)]);

	const stub = stubResolver({ "'A'": 'api.example.com/a', "'B'": 'api.example.com/b' });
	const r = await resolveExternalEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.equal(r.endpoints, 2);
	assert.equal(r.edges, 2);
	const nodes = await listEntitiesByKind(null, 'externalEndpoint');
	assert.equal(nodes.length, 2);
	for (const n of nodes) {
		assert.equal(n.kind, 'externalEndpoint');
		assert.equal(n.protocol, 'http');
		assert.equal(n.resolved, true);
		assert.ok(n.target === 'api.example.com/a' || n.target === 'api.example.com/b');
	}
	const idA = makeExternalEndpointId(repo, 'http', 'api.example.com/a', `'A'`);
	assert.deepEqual(await httpTargets(a.id), [idA]);
});

// --- ac2 dedup + per-repo -------------------------------------------------

test('t1 ac2 dedup: three call-sites to one target => one node, three CALLS_HTTP edges', async () => {
	const repo = await newRepo();
	const callers = ['a', 'b', 'c'].map(n => fnEntity(repo, `${repo}/${n}.ts`, n));
	await upsertEntities(null, callers);
	await upsertRelations(null, callers.map(c => callsHttp(c, `'SVC'`)));

	const stub = stubResolver({ "'SVC'": 'svc.example.com' });
	const r = await resolveExternalEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.equal(r.endpoints, 1);
	assert.equal(r.edges, 3);
	assert.equal((await listEntitiesByKind(null, 'externalEndpoint')).length, 1);
	const id = makeExternalEndpointId(repo, 'http', 'svc.example.com', `'SVC'`);
	for (const c of callers) assert.deepEqual(await httpTargets(c.id), [id]);
});

test('t1 ac2 per-repo: two repos calling the same target => two distinct nodes', async () => {
	const repo1 = await newRepo();
	const repo2 = await newRepo();
	const a = fnEntity(repo1, `${repo1}/a.ts`, 'a');
	const b = fnEntity(repo2, `${repo2}/b.ts`, 'b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [callsHttp(a, `'SVC'`), callsHttp(b, `'SVC'`)]);

	const stub = stubResolver({ "'SVC'": 'svc.example.com' });
	await resolveExternalEndpoints({ db: null, repo: repo1, resolve: stub.resolve });
	await resolveExternalEndpoints({ db: null, repo: repo2, resolve: stub.resolve });

	const nodes = await listEntitiesByKind(null, 'externalEndpoint');
	assert.equal(nodes.length, 2, 'repo is part of the id => two distinct nodes');
	const id1 = makeExternalEndpointId(repo1, 'http', 'svc.example.com', `'SVC'`);
	const id2 = makeExternalEndpointId(repo2, 'http', 'svc.example.com', `'SVC'`);
	assert.notEqual(id1, id2);
	assert.deepEqual(await httpTargets(a.id), [id1]);
	assert.deepEqual(await httpTargets(b.id), [id2]);
});

// --- cross-language + resolved-vs-literal dedup ---------------------------

test('t1 cross-language: a TS and a Python edge to the same resolved identity share ONE language-agnostic node', async () => {
	const repo = await newRepo();
	const ts = fnEntity(repo, `${repo}/a.ts`, 'a', 'typescript');
	const py = fnEntity(repo, `${repo}/b.py`, 'b', 'python');
	await upsertEntities(null, [ts, py]);
	await upsertRelations(null, [callsHttp(ts, `'TS'`), callsHttp(py, `'PY'`)]);

	const stub = stubResolver({ "'TS'": 'api.example.com/v1', "'PY'": 'api.example.com/v1' });
	const r = await resolveExternalEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.equal(r.endpoints, 1, 'same identity => one node regardless of caller language');
	assert.equal(r.edges, 2);
	const nodes = await listEntitiesByKind(null, 'externalEndpoint');
	assert.equal(nodes.length, 1);
	const id = makeExternalEndpointId(repo, 'http', 'api.example.com/v1', `'TS'`);
	assert.deepEqual(await httpTargets(ts.id), [id]);
	assert.deepEqual(await httpTargets(py.id), [id]);
});

test('t1 resolved-vs-literal dedup: an interpolated expr resolving to the same host/path as a literal collapses to one node', async () => {
	const repo = await newRepo();
	const a = fnEntity(repo, `${repo}/a.ts`, 'a');
	const b = fnEntity(repo, `${repo}/b.ts`, 'b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [callsHttp(a, '`${API}/users`'), callsHttp(b, `'https://api.example.com/users'`)]);

	const stub = stubResolver({
		'`${API}/users`': 'api.example.com/users',
		"'https://api.example.com/users'": 'api.example.com/users',
	});
	const r = await resolveExternalEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.equal(r.endpoints, 1);
	assert.equal(r.edges, 2);
});

// --- unresolved (k5) ------------------------------------------------------

test('t1 unresolved (k5): an un-pinnable URL mints an unresolved node carrying rawExpression + a CALLS_HTTP edge, never dropped', async () => {
	const repo = await newRepo();
	const a = fnEntity(repo, `${repo}/a.ts`, 'a');
	await upsertEntities(null, [a]);
	await upsertRelations(null, [callsHttp(a, 'userInput')]);

	const stub = stubResolver({ userInput: null });  // sc2 returns unresolved
	const r = await resolveExternalEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.equal(r.endpoints, 1);
	assert.equal(r.edges, 1);
	const id = makeExternalEndpointId(repo, 'http', '', 'userInput');
	const node = await getEntity(null, id);
	assert.ok(node, 'unresolved node exists');
	assert.equal(node!.resolved, false);
	assert.equal(node!.target, '');
	assert.equal(node!.rawExpression, 'userInput');
	assert.deepEqual(await httpTargets(a.id), [id]);
});

// --- dangling from --------------------------------------------------------

test('t1 dangling `from`: a CALLS_HTTP whose caller no longer exists is skipped (no node, no edge)', async () => {
	const repo = await newRepo();
	const ghost = fnEntity(repo, `${repo}/ghost.ts`, 'ghost');
	// Seed the unresolved row WITHOUT upserting the caller entity (mid-reindex race).
	await upsertRelations(null, [callsHttp(ghost, `'X'`)]);

	const stub = stubResolver({ "'X'": 'x.example.com' });
	const r = await resolveExternalEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.equal(r.endpoints, 0);
	assert.equal(r.edges, 0);
	assert.equal(r.skipped, 1);
	assert.equal((await listEntitiesByKind(null, 'externalEndpoint')).length, 0);
});

// --- idempotency + sc2-once + no-op ---------------------------------------

test('t1 idempotency: re-running over identical rows yields the identical node/edge set; sc2 called once per distinct expr', async () => {
	const repo = await newRepo();
	const callers = ['a', 'b', 'c'].map(n => fnEntity(repo, `${repo}/${n}.ts`, n));
	await upsertEntities(null, callers);
	const seed = () => upsertRelations(null, [
		callsHttp(callers[0]!, `'SVC'`),   // duplicate target 'SVC'
		callsHttp(callers[1]!, `'SVC'`),
		callsHttp(callers[2]!, `'OTHER'`),
	]);

	await seed();
	const stub1 = stubResolver({ "'SVC'": 'svc.example.com', "'OTHER'": 'other.example.com' });
	const r1 = await resolveExternalEndpoints({ db: null, repo, resolve: stub1.resolve });
	assert.equal(r1.endpoints, 2);
	assert.equal(r1.edges, 3);
	assert.equal(stub1.calls(), 2, 'two distinct exprs => two resolve calls (dedup by expr), not three call-sites');

	const nodes1 = (await listEntitiesByKind(null, 'externalEndpoint')).map(n => n.id).sort();

	// Re-seed the same deterministic rows (a re-parse) and re-run.
	await seed();
	const stub2 = stubResolver({ "'SVC'": 'svc.example.com', "'OTHER'": 'other.example.com' });
	const r2 = await resolveExternalEndpoints({ db: null, repo, resolve: stub2.resolve });
	const nodes2 = (await listEntitiesByKind(null, 'externalEndpoint')).map(n => n.id).sort();

	assert.deepEqual(nodes2, nodes1, 're-run yields the identical node set (deterministic ids)');
	assert.equal(r2.endpoints, 2);
	assert.equal(r2.edges, 3);
});

test('t1 no-op: a repo with no CALLS_HTTP rows produces no endpoints and leaves the graph unchanged', async () => {
	const repo = await newRepo();
	const a = fnEntity(repo, `${repo}/a.ts`, 'a');
	await upsertEntities(null, [a]);
	// only a non-HTTP unresolved CALLS row exists
	await upsertRelations(null, [{ kind: 'CALLS', from: a.id, to: 'helper', resolved: false, meta: { file: a.file, repo } }]);

	const stub = stubResolver({});
	const r = await resolveExternalEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.deepEqual(r, { endpoints: 0, edges: 0, skipped: 0 });
	assert.equal(stub.calls(), 0);
	assert.equal((await listEntitiesByKind(null, 'externalEndpoint')).length, 0);
});
