/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 — the messaging-endpoint resolution pass over a temp graph store.
 *
 * Mirrors external-endpoints.test.ts: seeds code entities + unresolved
 * PUBLISHES_TO / SUBSCRIBES_TO rows, runs resolveMessagingEndpoints with an
 * injected sc2, and asserts ac1 (one node per topic, direction on the edge,
 * pub+sub share one node), ac2 (resolved + unresolved-not-dropped), idempotency,
 * distinct-edge counting, and — the key regression — protocol-scoped GC (a
 * co-located HTTP endpoint survives the messaging pass, and vice-versa).
 *
 * Run: npx tsx --test src/indexer/__tests__/messaging-endpoints.test.ts
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
import type { Entity, Relation, RelationKind, ResolvedTarget } from '../../shared/types.js';
import { resolveMessagingEndpoints } from '../messaging-endpoints.js';
import { resolveExternalEndpoints } from '../external-endpoints.js';

const NOW = '2026-08-07T00:00:00.000Z';

let store: string;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s004-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
});

// --- fixtures -------------------------------------------------------------

function fnEntity(repo: string, file: string, name: string): Entity {
	return {
		id: makeEntityId(repo, file, 'function', name),
		kind: 'function', name, language: 'typescript',
		repoId: 1, repo, file,
		startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: NOW,
	};
}

function msg(from: Entity, rawTopic: string, direction: 'publish' | 'subscribe'): Relation {
	return {
		kind: direction === 'publish' ? 'PUBLISHES_TO' : 'SUBSCRIBES_TO',
		from: from.id, to: rawTopic, resolved: false, meta: { file: from.file, repo: from.repo },
	};
}

/** A counting sc2 stub for the messaging protocol. */
function stubResolver(map: Record<string, string | null>) {
	let calls = 0;
	const resolve = async (_repo: string, _p: 'http' | 'messaging' | 'rpc', expr: string): Promise<ResolvedTarget> => {
		calls++;
		const identity = map[expr];
		return identity != null
			? { resolved: true, protocol: 'messaging', identity }
			: { resolved: false, rawExpression: expr };
	};
	return { resolve, calls: () => calls };
}

async function newRepo(): Promise<string> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-s004-repo-'));
	await addRepo(null, { path: repo, name: '', addedAt: NOW, status: 'pending' });
	return repo;
}

/** Endpoint ids reachable via a given boundary kind from a caller. */
async function targets(callerId: string, kind: RelationKind): Promise<string[]> {
	const u64 = await entityU64ForId(callerId);
	if (u64 === undefined) return [];
	const tos = await outNeighbors(u64, { kindFilter: [kind] });
	return [...(await entityIdsByU64s(tos)).values()];
}

function httpEndpointSeed(repo: string, host: string): Entity {
	return {
		id: makeExternalEndpointId(repo, 'http', host, host), kind: 'externalEndpoint',
		name: `http:${host}`, language: 'config', repoId: 1, repo, file: '',
		startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: NOW,
		protocol: 'http', resolved: true, target: host,
	};
}

// --- ac1 ------------------------------------------------------------------

test('ac1: publish + subscribe to the SAME topic => ONE node, TWO edges (direction on the edge)', async () => {
	const repo = await newRepo();
	const p = fnEntity(repo, `${repo}/p.ts`, 'p');
	const c = fnEntity(repo, `${repo}/c.ts`, 'c');
	await upsertEntities(null, [p, c]);
	await upsertRelations(null, [msg(p, `'orders'`, 'publish'), msg(c, `'orders'`, 'subscribe')]);

	const stub = stubResolver({ "'orders'": 'orders' });
	const r = await resolveMessagingEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.equal(r.endpoints, 1, 'one topic node');
	assert.equal(r.edges, 2, 'a publish edge + a subscribe edge');
	const nodes = await listEntitiesByKind(null, 'externalEndpoint');
	assert.equal(nodes.length, 1);
	assert.equal(nodes[0]!.protocol, 'messaging');
	assert.equal(nodes[0]!.name, 'messaging:orders');

	const id = makeExternalEndpointId(repo, 'messaging', 'orders', `'orders'`);
	assert.deepEqual(await targets(p.id, 'PUBLISHES_TO'), [id]);
	assert.deepEqual(await targets(c.id, 'SUBSCRIBES_TO'), [id]);
	assert.deepEqual(await targets(p.id, 'SUBSCRIBES_TO'), [], 'publisher has no subscribe edge');
});

test('ac1 dedup: three producers to one topic => one node, three PUBLISHES_TO edges; sc2 called once', async () => {
	const repo = await newRepo();
	const callers = ['a', 'b', 'c'].map(n => fnEntity(repo, `${repo}/${n}.ts`, n));
	await upsertEntities(null, callers);
	await upsertRelations(null, callers.map(x => msg(x, `'T'`, 'publish')));

	const stub = stubResolver({ "'T'": 'topic-t' });
	const r = await resolveMessagingEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.equal(r.endpoints, 1);
	assert.equal(r.edges, 3);
	assert.equal(stub.calls(), 1, 'one distinct expr => one resolve call');
});

// --- ac2 unresolved-not-dropped (k5) --------------------------------------

test('ac2: a config-built topic resolves to an identity; an un-pinnable one still mints a resolved:false node', async () => {
	const repo = await newRepo();
	const a = fnEntity(repo, `${repo}/a.ts`, 'a');
	const b = fnEntity(repo, `${repo}/b.ts`, 'b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [msg(a, 'process.env.TOPIC', 'publish'), msg(b, 'dynamicTopic', 'publish')]);

	const stub = stubResolver({ 'process.env.TOPIC': 'billing-events' });  // dynamicTopic -> unresolved
	const r = await resolveMessagingEndpoints({ db: null, repo, resolve: stub.resolve });

	assert.equal(r.endpoints, 2);
	const resolvedId = makeExternalEndpointId(repo, 'messaging', 'billing-events', 'process.env.TOPIC');
	const resolved = await getEntity(null, resolvedId);
	assert.equal(resolved!.resolved, true);
	assert.equal(resolved!.target, 'billing-events');

	const unresolvedId = makeExternalEndpointId(repo, 'messaging', '', 'dynamicTopic');
	const unresolved = await getEntity(null, unresolvedId);
	assert.ok(unresolved, 'unresolved topic still minted (k5)');
	assert.equal(unresolved!.resolved, false);
	assert.equal(unresolved!.rawExpression, 'dynamicTopic');
});

// --- idempotency ----------------------------------------------------------

test('idempotency: re-running over identical rows yields the identical node set and GC deletes nothing', async () => {
	const repo = await newRepo();
	const a = fnEntity(repo, `${repo}/a.ts`, 'a');
	await upsertEntities(null, [a]);
	const seed = () => upsertRelations(null, [msg(a, `'X'`, 'publish')]);

	await seed();
	const r1 = await resolveMessagingEndpoints({ db: null, repo, resolve: stubResolver({ "'X'": 'x' }).resolve });
	const nodes1 = (await listEntitiesByKind(null, 'externalEndpoint')).map(n => n.id).sort();

	await seed();
	const r2 = await resolveMessagingEndpoints({ db: null, repo, resolve: stubResolver({ "'X'": 'x' }).resolve });
	const nodes2 = (await listEntitiesByKind(null, 'externalEndpoint')).map(n => n.id).sort();

	assert.deepEqual(nodes2, nodes1);
	assert.equal(r1.gcDeleted, 0);
	assert.equal(r2.gcDeleted, 0);
	assert.equal(r2.edges, 1);
});

// --- protocol-scoped GC (the cross-protocol regression) -------------------

test('cross-protocol GC: the messaging pass GCs an orphan messaging node but NEVER an HTTP node', async () => {
	const repo = await newRepo();
	const p = fnEntity(repo, `${repo}/p.ts`, 'p');
	await upsertEntities(null, [p]);
	await upsertRelations(null, [msg(p, `'live-topic'`, 'publish')]);

	// A co-located, live HTTP endpoint (would be a false orphan under a protocol-blind GC)...
	const httpId = makeExternalEndpointId(repo, 'http', 'api.example.com', 'api.example.com');
	// ...and an orphan MESSAGING endpoint (no incident PUBLISHES_TO/SUBSCRIBES_TO edge).
	const orphanMsgId = makeExternalEndpointId(repo, 'messaging', 'gone-topic', 'gone-topic');
	await upsertEntities(null, [
		httpEndpointSeed(repo, 'api.example.com'),
		{
			id: orphanMsgId, kind: 'externalEndpoint', name: 'messaging:gone-topic', language: 'config',
			repoId: 1, repo, file: '', startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: NOW,
			protocol: 'messaging', resolved: true, target: 'gone-topic',
		},
	]);

	const r = await resolveMessagingEndpoints({ db: null, repo, resolve: stubResolver({ "'live-topic'": 'live-topic' }).resolve });

	assert.equal(r.gcDeleted, 1, 'only the orphan messaging node is GC’d');
	assert.equal(await getEntity(null, orphanMsgId), null, 'orphan messaging node deleted');
	assert.ok(await getEntity(null, httpId), 'the HTTP endpoint SURVIVES the messaging GC (protocol-scoped)');
	const liveId = makeExternalEndpointId(repo, 'messaging', 'live-topic', `'live-topic'`);
	assert.ok(await getEntity(null, liveId), 'the live messaging endpoint survives');
});

test('cross-protocol GC (symmetric): the HTTP pass never deletes a messaging endpoint', async () => {
	const repo = await newRepo();
	const a = fnEntity(repo, `${repo}/a.ts`, 'a');
	await upsertEntities(null, [a]);
	// An HTTP call to resolve, plus a live messaging endpoint reached by a subscribe edge.
	await upsertRelations(null, [
		{ kind: 'CALLS_HTTP', from: a.id, to: `'https://api'`, resolved: false, meta: { file: a.file, repo } },
		msg(a, `'kept-topic'`, 'subscribe'),
	]);
	// Resolve messaging first so the messaging endpoint + its edge exist.
	await resolveMessagingEndpoints({ db: null, repo, resolve: stubResolver({ "'kept-topic'": 'kept-topic' }).resolve });
	const msgId = makeExternalEndpointId(repo, 'messaging', 'kept-topic', `'kept-topic'`);
	assert.ok(await getEntity(null, msgId), 'messaging endpoint exists before the HTTP pass');

	// Now run the HTTP pass — its protocol-scoped GC must leave the messaging node alone.
	const httpStub = async (_r: string, _p: 'http' | 'messaging' | 'rpc', e: string): Promise<ResolvedTarget> =>
		({ resolved: true, protocol: 'http', identity: e.replace(/'/g, '') });
	const r = await resolveExternalEndpoints({ db: null, repo, resolve: httpStub });

	assert.equal(r.gcDeleted, 0, 'the HTTP GC finds no HTTP orphan and never touches the messaging node');
	assert.ok(await getEntity(null, msgId), 'messaging endpoint SURVIVES the HTTP pass');
});

// --- no-op ----------------------------------------------------------------

test('no-op: a repo with no messaging rows produces no endpoints', async () => {
	const repo = await newRepo();
	const a = fnEntity(repo, `${repo}/a.ts`, 'a');
	await upsertEntities(null, [a]);
	await upsertRelations(null, [{ kind: 'CALLS', from: a.id, to: 'helper', resolved: false, meta: { file: a.file, repo } }]);

	const r = await resolveMessagingEndpoints({ db: null, repo, resolve: stubResolver({}).resolve });
	assert.deepEqual(r, { endpoints: 0, edges: 0, skipped: 0, gcDeleted: 0 });
	assert.equal((await listEntitiesByKind(null, 'externalEndpoint')).length, 0);
});
