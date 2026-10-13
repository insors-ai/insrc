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
 * seeded before it starts so that EVERY parameter a request reads decides its
 * answer: two registered repositories, A depending on B; a call chain
 * fnD -> fnA -> fnB (so the hop count and the depth matter), fnA REFERENCES
 * fnC (so the edge kind matters); one story artifact in A (an ownership record
 * citing a.ts, and an artifact document with a vector), so the touched paths
 * and the defect description each bring a candidate; more vectors than the
 * limits ask for. Its embedding model is a stand-in Ollama served by this
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

const DIM = loadLocalProviderConfig().embeddingDim;   // at least five: one axis per entity
const MODEL = 'stub-embed';

let home: string;
let repoA: string;
let repoB: string;
let daemon: RunningDaemon | undefined;
let ollama: Server;
const ids = { repoA: '', repoB: '', fnA: '', fnB: '', fnC: '', fnD: '', doc: '' };
const DOC_DIR = 'docs/epics/demo-E20261013aaaaaaaa/S001';

function entity(repo: string, file: string, kind: Entity['kind'], name: string): Entity {
	return {
		id: makeEntityId(repo, file, kind, name), kind, name, language: 'typescript', repoId: 1, repo, file,
		...(kind === 'repo' ? { rootPath: repo } : {}),
		startLine: kind === 'repo' ? 0 : 1, endLine: kind === 'repo' ? 0 : 1,
		body: kind === 'repo' ? '' : `export function ${name}() {}`, embedding: [], indexedAt: '2026-10-13T00:00:00.000Z',
	} as unknown as Entity;
}

/** Each entity's vector is its own unit axis, so a text names the entity it is nearest. */
const AXIS = { fnA: 0, fnB: 1, fnC: 2, fnD: 3, doc: 4 } as const;
function axis(i: number): number[] {
	return Array.from({ length: DIM }, (_, j) => (j === i ? 1 : 0));
}
/** The vector the stand-in gives a text: the axis of the entity it names (fnC's for any other). */
function vectorOf(text: string): number[] {
	for (const name of ['fnA', 'fnB', 'fnD'] as const) if (text.includes(name)) return axis(AXIS[name]);
	if (text.includes('LLD')) return axis(AXIS.doc);
	return axis(AXIS.fnC);
}

/** A stand-in Ollama: lists the embedding model and embeds each text by what it names. */
function standInOllama(): Promise<{ server: Server; host: string }> {
	const server = createServer((req, res) => {
		let body = '';
		req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
		req.on('end', () => {
			res.setHeader('content-type', 'application/json');
			if (req.url === '/api/tags') {
				res.end(JSON.stringify({ models: [{ name: `${MODEL}:latest`, model: `${MODEL}:latest`, modified_at: '2026-10-13T00:00:00Z', size: 1, digest: 'x', details: {} }] }));
			} else if (req.url === '/api/embed') {
				const input = (JSON.parse(body || '{}') as { input?: string | string[] }).input;
				const texts = Array.isArray(input) ? input : [String(input)];
				res.end(JSON.stringify({ model: MODEL, embeddings: texts.map(vectorOf) }));
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
	writeFileSync(join(repoA, 'a.ts'), 'export function fnA() {}\nexport function fnC() {}\nexport function fnD() {}\n', 'utf8');
	mkdirSync(join(repoA, DOC_DIR), { recursive: true });
	writeFileSync(join(repoA, DOC_DIR, 'LLD.md'), '# LLD\n', 'utf8');
	// The story's ownership record: it cites a.ts.
	mkdirSync(join(repoA, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repoA, '.insrc', 'artifacts', 'LLD-aaaaaaaa-s1.json'), JSON.stringify({
		meta: { epicHash: 'aaaaaaaa', storyId: 's1', epicSlug: 'demo' },
		citations: [{ id: 'c1', kind: 'code', ref: 'a.ts:1' }],
	}), 'utf8');
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
	const fnD = entity(repoA, join(repoA, 'a.ts'), 'function', 'fnD');
	const fnB = entity(repoB, join(repoB, 'b.ts'), 'function', 'fnB');
	const doc = entity(repoA, join(repoA, DOC_DIR, 'LLD.md'), 'section', 'LLD');
	Object.assign(ids, { repoA: rA.id, repoB: rB.id, fnA: fnA.id, fnB: fnB.id, fnC: fnC.id, fnD: fnD.id, doc: doc.id });
	await upsertEntities(null, [rA, rB, fnA, fnC, fnD, fnB, doc]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: fnD.id, to: fnA.id, resolved: true },
		{ kind: 'CALLS', from: fnA.id, to: fnB.id, resolved: true },
		{ kind: 'REFERENCES', from: fnA.id, to: fnC.id, resolved: true },
		{ kind: 'DEPENDS_ON', from: rA.id, to: rB.id, resolved: true },
	]);
	await addEntityEmbeddings([
		{ id: fnA.id, embedding: axis(AXIS.fnA), repo: repoA, kind: 'function', artifact: false },
		{ id: fnC.id, embedding: axis(AXIS.fnC), repo: repoA, kind: 'function', artifact: false },
		{ id: fnD.id, embedding: axis(AXIS.fnD), repo: repoA, kind: 'function', artifact: false },
		{ id: fnB.id, embedding: axis(AXIS.fnB), repo: repoB, kind: 'function', artifact: false },
		{ id: doc.id, embedding: axis(AXIS.doc), repo: repoA, kind: 'section', artifact: true },
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
	const pinned = new Set<string>();
	const pin = async (method: string, params: Record<string, unknown>, check: (answer: unknown) => void): Promise<void> => {
		const answer = await call(method, params);
		check(answer);
		pinned.add(method);
	};
	const sorted = (xs: string[]): string[] => [...xs].sort();
	const code = sorted([ids.fnA, ids.fnB, ids.fnC, ids.fnD]);

	// entityId
	await pin('search.callers', { entityId: ids.fnB }, a => assert.deepEqual(idsOf(a), [ids.fnA], 'search.callers'));
	await pin('search.callees', { entityId: ids.fnA }, a => assert.deepEqual(idsOf(a), [ids.fnB], 'search.callees'));
	// entityId; hops: two hops reach fnD, the default one does not
	await pin('search.callers_nhop', { entityId: ids.fnB, hops: 2 }, a => assert.deepEqual(sorted(idsOf(a)), sorted([ids.fnA, ids.fnD]), 'search.callers_nhop'));
	// filePath
	await pin('search.by_file', { filePath: join(repoA, 'a.ts') }, a => assert.deepEqual(sorted(idsOf(a)), sorted([ids.fnA, ids.fnC, ids.fnD]), 'search.by_file'));
	// repoPath
	await pin('search.closure', { repoPath: repoA }, a => assert.deepEqual(sorted(a as string[]), sorted([repoA, repoB]), 'search.closure'));
	// entityId
	await pin('entity.summary', { entityId: ids.fnA }, a => assert.equal((a as { name: string }).name, 'fnA', 'entity.summary'));
	// rootIds + maxDepth: one CALLS step from fnD reaches fnA, not fnB
	await pin('entity.closure', { rootIds: [ids.fnD], edgeKind: 'CALLS', direction: 'out', maxDepth: 1 }, a => {
		assert.ok(idsOf(a).includes(ids.fnA), 'entity.closure: fnA');
		assert.ok(!idsOf(a).includes(ids.fnB), 'entity.closure: maxDepth 1 stops before fnB');
	});
	// edgeKind: from fnA, CALLS reaches fnB and not fnC (fnC is only REFERENCED)
	await pin('entity.closure', { rootIds: [ids.fnA], edgeKind: 'CALLS', direction: 'out', maxDepth: 2 }, a => {
		assert.ok(idsOf(a).includes(ids.fnB), 'entity.closure: fnB');
		assert.ok(!idsOf(a).includes(ids.fnC), 'entity.closure: the CALLS filter leaves fnC out');
	});
	// direction: into fnB, one CALLS step back is fnA
	await pin('entity.closure', { rootIds: [ids.fnB], edgeKind: 'CALLS', direction: 'in', maxDepth: 1 }, a =>
		assert.ok(idsOf(a).includes(ids.fnA), 'entity.closure: direction in reaches the caller'));
	// rootIds, candidateKinds, edgeKind: by CALLS from fnA, fnC is unreachable and fnB is not
	await pin('entity.unreachable', { rootIds: [ids.fnA], candidateKinds: ['function'], edgeKind: 'CALLS', maxDepth: 3 }, a => {
		assert.ok(idsOf(a).includes(ids.fnC), 'entity.unreachable: fnC is not reached by CALLS');
		assert.ok(!idsOf(a).includes(ids.fnB), 'entity.unreachable: fnB is reached from fnA');
		assert.ok((a as Array<{ kind: string }>).every(e => e.kind === 'function'), 'entity.unreachable: only the candidate kinds');
	});
	// maxDepth: one CALLS step from fnD does not reach fnB
	await pin('entity.unreachable', { rootIds: [ids.fnD], candidateKinds: ['function'], edgeKind: 'CALLS', maxDepth: 1 }, a =>
		assert.ok(idsOf(a).includes(ids.fnB), 'entity.unreachable: fnB lies beyond maxDepth 1'));
	// repoId
	await pin('repo.depends_on', { repoId: repoA }, a => assert.deepEqual(sorted(pathsOf(a)), sorted([repoA, repoB]), 'repo.depends_on'));
	// query (nearest is the entity it names), repoId (B is in A's closure), limit (one)
	await pin('repo.search_cross_repo', { query: 'about fnB', repoId: repoA, limit: 1 }, a =>
		assert.deepEqual(idsOf(a), [ids.fnB], 'repo.search_cross_repo: the one nearest code entity of the closure A and B'));
	// repoPath, touchedPaths (a graph candidate: the story citing a.ts), defectDescription (a semantic candidate: its document)
	await pin('locate.inferParents', { repoPath: repoA, touchedPaths: [join(repoA, 'a.ts')], defectDescription: 'fnA fails' }, a => {
		const out = a as { graph?: Array<{ parentRef: { storyId?: string } }>; semantic?: Array<{ parentRef: { storyId?: string } }> };
		assert.equal(out.graph?.[0]?.parentRef.storyId, 's1', `locate.inferParents: graph tier ${JSON.stringify(a)}`);
		assert.equal(out.semantic?.[0]?.parentRef.storyId, 's1', `locate.inferParents: semantic tier ${JSON.stringify(a)}`);
	});
	// text, limit, filter: every code entity of every registered repository, the artifact left out
	await pin('search.query', { text: 'a function', limit: 10, filter: 'code' }, a => assert.deepEqual(sorted(idsOf(a)), code, 'search.query: filter code'));
	await pin('search.query', { text: 'about fnD', limit: 1, filter: 'code' }, a => assert.deepEqual(idsOf(a), [ids.fnD], 'search.query: the text and the limit'));

	assert.deepEqual([...pinned].sort(), [
		'entity.closure', 'entity.summary', 'entity.unreachable', 'locate.inferParents', 'repo.depends_on', 'repo.search_cross_repo',
		'search.by_file', 'search.callees', 'search.callers', 'search.callers_nhop', 'search.closure', 'search.query',
	], 'the twelve requests the guard covers');
});
