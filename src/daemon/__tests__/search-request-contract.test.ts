/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6, Story s5, Task t11 -- the contract of the daemon's
 * graph-reading search requests, pinned BEFORE the guard of a repository
 * under index is added (decision q4e48e4a6): each request is called over the
 * real daemon's socket with the parameters it takes today, and each answer
 * is checked for content only those parameters produce, so renaming or
 * dropping a parameter a handler reads fails this test.
 *
 * The real daemon runs with HOME in a temporary directory (its socket, stores
 * and logs are all there; the user's daemon is never touched). Its store is
 * seeded before it starts: two registered repositories, A depending on B,
 * three functions (fnA in A calls fnB in B; fnC in A is reached by nothing)
 * and their vectors. Its embedding model is a stand-in Ollama served by this
 * test, which answers every text with the same vector, so the two requests
 * that search by text are deterministic and reach no model.
 *
 * Run: npx tsx --test src/daemon/__tests__/search-request-contract.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadLocalProviderConfig } from '../../config/local.js';
import { upsertEntities } from '../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../db/lance/conn.js';
import { _resetEntityVecCache, addEntityEmbeddings } from '../../db/lance/entity-vec.js';
import { upsertRelations } from '../../db/relations.js';
import { addRepo } from '../../db/repos.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { Entity } from '../../shared/types.js';
import { rpc, startDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import type { RunningDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';

const DIM = loadLocalProviderConfig().embeddingDim;
const MODEL = 'stub-embed';

let home: string;
let repoA: string;
let repoB: string;
let daemon: RunningDaemon | undefined;
let ollama: Server;
const ids = { repoA: '', repoB: '', fnA: '', fnB: '', fnC: '' };

function entity(repo: string, file: string, kind: Entity['kind'], name: string): Entity {
	return {
		id: makeEntityId(repo, file, kind, name), kind, name, language: 'typescript', repoId: 1, repo, file,
		...(kind === 'repo' ? { rootPath: repo } : {}),
		startLine: kind === 'repo' ? 0 : 1, endLine: kind === 'repo' ? 0 : 1,
		body: kind === 'repo' ? '' : `export function ${name}() {}`, embedding: [], indexedAt: '2026-10-13T00:00:00.000Z',
	} as unknown as Entity;
}

/** A stand-in Ollama: lists the embedding model and answers every text with one vector. */
function standInOllama(): Promise<{ server: Server; host: string }> {
	const vector = Array.from({ length: DIM }, () => 1 / Math.sqrt(DIM));
	const server = createServer((req, res) => {
		let body = '';
		req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
		req.on('end', () => {
			res.setHeader('content-type', 'application/json');
			if (req.url === '/api/tags') {
				res.end(JSON.stringify({ models: [{ name: `${MODEL}:latest`, model: `${MODEL}:latest`, modified_at: '2026-10-13T00:00:00Z', size: 1, digest: 'x', details: {} }] }));
			} else if (req.url === '/api/embed') {
				const input = (JSON.parse(body || '{}') as { input?: string | string[] }).input;
				const n = Array.isArray(input) ? input.length : 1;
				res.end(JSON.stringify({ model: MODEL, embeddings: Array.from({ length: n }, () => vector) }));
			} else {
				res.statusCode = 404;
				res.end('{}');
			}
		});
	});
	return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
		const addr = server.address() as { port: number };
		resolve({ server, host: `http://127.0.0.1:${addr.port}` });
	}));
}

test.before(async () => {
	// A short HOME: the daemon's socket path must fit a Unix socket name (about 104 bytes on macOS).
	home = mkdtempSync('/tmp/isc-');
	repoA = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-search-contract-a-')));
	repoB = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-search-contract-b-')));
	writeFileSync(join(repoA, 'a.ts'), 'export function fnA() {}\nexport function fnC() {}\n', 'utf8');
	writeFileSync(join(repoB, 'b.ts'), 'export function fnB() {}\n', 'utf8');

	const stub = await standInOllama();
	ollama = stub.server;
	mkdirSync(join(home, '.insrc'), { recursive: true });
	writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({
		models: { local: { host: stub.host, embeddingModel: MODEL, embeddingDim: DIM } },
	}), 'utf8');

	// The store, seeded before the daemon opens it.
	setGraphStorePath(join(home, '.insrc', 'graph.lmdb'));
	setLanceConnPath(join(home, '.insrc', 'lance'));
	// lastIndexed after every file's mtime: the daemon's start finds nothing to re-index.
	for (const path of [repoA, repoB]) {
		await addRepo(null, { path, name: path, addedAt: '2026-10-13T00:00:00.000Z', status: 'ready', lastIndexed: '2099-01-01T00:00:00.000Z' });
	}
	const rA = entity(repoA, '', 'repo', repoA);
	const rB = entity(repoB, '', 'repo', repoB);
	const fnA = entity(repoA, join(repoA, 'a.ts'), 'function', 'fnA');
	const fnC = entity(repoA, join(repoA, 'a.ts'), 'function', 'fnC');
	const fnB = entity(repoB, join(repoB, 'b.ts'), 'function', 'fnB');
	Object.assign(ids, { repoA: rA.id, repoB: rB.id, fnA: fnA.id, fnB: fnB.id, fnC: fnC.id });
	await upsertEntities(null, [rA, rB, fnA, fnC, fnB]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: fnA.id, to: fnB.id, resolved: true },
		{ kind: 'DEPENDS_ON', from: rA.id, to: rB.id, resolved: true },
	]);
	const vec = Array.from({ length: DIM }, () => 1 / Math.sqrt(DIM));
	await addEntityEmbeddings([
		{ id: fnA.id, embedding: vec, repo: repoA, kind: 'function', artifact: false },
		{ id: fnC.id, embedding: vec, repo: repoA, kind: 'function', artifact: false },
		{ id: fnB.id, embedding: vec, repo: repoB, kind: 'function', artifact: false },
	]);
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();

	daemon = await startDaemon(home);
	// The embedder is picked at start, in the background: wait until a text search answers.
	const deadline = Date.now() + 30_000;
	for (;;) {
		const hits = await rpc(daemon.sock, 'search.query', { text: 'ready?', limit: 5 }) as unknown[];
		if (hits.length > 0) break;
		if (Date.now() > deadline) throw new Error('the daemon never answered a text search (embedder not ready)');
		await new Promise(r => setTimeout(r, 250));
	}
});

test.after(async () => {
	await daemon?.stop();
	await new Promise<void>(r => ollama?.close(() => r()) ?? r());
	for (const d of [home, repoA, repoB]) rmSync(d, { recursive: true, force: true });
});

const idsOf = (rows: unknown): string[] => (rows as Array<{ id: string }>).map(r => r.id);
const pathsOf = (rows: unknown): string[] => (rows as Array<{ path: string }>).map(r => r.path);

test('search request contract: each guarded search request accepts its existing params and answers', async () => {
	const call = (method: string, params: Record<string, unknown>) => rpc(daemon!.sock, method, params);
	const pinned: string[] = [];
	const pin = async (method: string, params: Record<string, unknown>, check: (answer: unknown) => void): Promise<void> => {
		const answer = await call(method, params);
		check(answer);
		pinned.push(method);
	};

	await pin('search.callers', { entityId: ids.fnB }, a => assert.deepEqual(idsOf(a), [ids.fnA], 'search.callers'));
	await pin('search.callees', { entityId: ids.fnA }, a => assert.deepEqual(idsOf(a), [ids.fnB], 'search.callees'));
	await pin('search.callers_nhop', { entityId: ids.fnB, hops: 2 }, a => assert.deepEqual(idsOf(a), [ids.fnA], 'search.callers_nhop'));
	await pin('search.by_file', { filePath: join(repoA, 'a.ts') }, a => assert.deepEqual(idsOf(a).sort(), [ids.fnA, ids.fnC].sort(), 'search.by_file'));
	await pin('search.closure', { repoPath: repoA }, a => assert.deepEqual([...(a as string[])].sort(), [repoA, repoB].sort(), 'search.closure'));
	await pin('entity.summary', { entityId: ids.fnA }, a => assert.equal((a as { name: string }).name, 'fnA', 'entity.summary'));
	await pin('entity.closure', { rootIds: [ids.fnA], edgeKind: 'CALLS', direction: 'out', maxDepth: 2 }, a => assert.ok(idsOf(a).includes(ids.fnB), 'entity.closure'));
	await pin('entity.unreachable', { rootIds: [ids.fnA], candidateKinds: ['function'], edgeKind: 'CALLS', maxDepth: 2 }, a => {
		assert.ok(idsOf(a).includes(ids.fnC), 'entity.unreachable: fnC is reached by nothing');
		assert.ok(!idsOf(a).includes(ids.fnB), 'entity.unreachable: fnB is reached from fnA');
	});
	await pin('repo.depends_on', { repoId: repoA }, a => assert.deepEqual(pathsOf(a).sort(), [repoA, repoB].sort(), 'repo.depends_on'));
	await pin('repo.search_cross_repo', { query: 'a function', repoId: repoA, limit: 10 }, a =>
		assert.deepEqual(idsOf(a).sort(), [ids.fnA, ids.fnB, ids.fnC].sort(), 'repo.search_cross_repo: the closure A and B'));
	await pin('locate.inferParents', { repoPath: repoA, touchedPaths: [join(repoA, 'a.ts')], defectDescription: 'fnA fails' }, a =>
		assert.ok(typeof a === 'object' && a !== null && !('error' in a), `locate.inferParents: ${JSON.stringify(a)}`));
	await pin('search.query', { text: 'a function', limit: 10 }, a =>
		assert.deepEqual(idsOf(a).sort(), [ids.fnA, ids.fnB, ids.fnC].sort(), 'search.query: every registered repository'));

	assert.deepEqual(pinned, [
		'search.callers', 'search.callees', 'search.callers_nhop', 'search.by_file', 'search.closure',
		'entity.summary', 'entity.closure', 'entity.unreachable', 'repo.depends_on', 'repo.search_cross_repo',
		'locate.inferParents', 'search.query',
	], 'the twelve requests the guard covers');
});
