/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6, Story s5, Task t14 -- the daemon's built-in graph tools
 * apply the guard and the filtering of the search requests: a tool that names
 * an entity or roots in a repository under index fails with 'repo-indexing',
 * traversal results leave such a repository's entities out, and graph_search
 * searches the other repositories.
 *
 * The tools run in this process over a temporary store. The embedding model
 * graph_search uses is a stand-in Ollama served here: HOME is pointed at a
 * temporary directory whose config names it BEFORE any insrc module is loaded
 * (the embedder fixes its host when it is loaded), so no model is reached.
 *
 * Run: npx tsx --test src/daemon/tools/builtins/graph/__tests__/graph-guard.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Entity, ToolResult } from '../../../../../shared/types.js';
import type { Tool, ToolDeps } from '../../../types.js';

const DIM = 8;
const MODEL = 'stub-embed';
const A = '/graph-guard/app';
const X = '/graph-guard/indexing';
const BEGAN = Date.UTC(2026, 9, 13, 15, 0);

let home: string;
let stub: Server;
let tools: { entity: Tool; search: Tool; callers: Tool; callees: Tool; query: Tool };
let updateRepoStatus: (db: null, path: string, status: 'ready' | 'indexing', lastIndexed?: string) => Promise<void>;
const ids = { fnA: '', fnX: '', fileX: '', fileA: '', fileB: '' };
const deps = { closureRepos: [A, X] } as unknown as ToolDeps;

function axis(i: number): number[] {
	return Array.from({ length: DIM }, (_, j) => (j === i ? 1 : 0));
}

test.before(async () => {
	// The stand-in Ollama: every text embeds to the first axis.
	stub = createServer((req, res) => {
		let body = '';
		req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
		req.on('end', () => {
			res.setHeader('content-type', 'application/json');
			if (req.url === '/api/embed') {
				const input = (JSON.parse(body || '{}') as { input?: string | string[] }).input;
				res.end(JSON.stringify({ model: MODEL, embeddings: (Array.isArray(input) ? input : [input]).map(() => axis(0)) }));
			} else {
				res.end(JSON.stringify({ models: [{ name: `${MODEL}:latest` }] }));
			}
		});
	});
	const port = await new Promise<number>(r => stub.listen(0, '127.0.0.1', () => r((stub.address() as { port: number }).port)));
	home = mkdtempSync(join(tmpdir(), 'graph-guard-home-'));
	mkdirSync(join(home, '.insrc'), { recursive: true });
	writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({
		models: { local: { host: `http://127.0.0.1:${port}`, embeddingModel: MODEL, embeddingDim: DIM } },
	}), 'utf8');
	process.env['HOME'] = home;

	// Every insrc module is loaded only now, under that HOME.
	const { setActiveEmbedderBackend } = await import('../../../../../indexer/embedder.js');
	const { closeGraphStore, setGraphStorePath } = await import('../../../../../db/graph/store.js');
	const { setLanceConnPath } = await import('../../../../../db/lance/conn.js');
	const { addEntityEmbeddings } = await import('../../../../../db/lance/entity-vec.js');
	const { upsertEntities } = await import('../../../../../db/entities.js');
	const { upsertRelations } = await import('../../../../../db/relations.js');
	const repos = await import('../../../../../db/repos.js');
	const { makeEntityId } = await import('../../../../../indexer/parser/base.js');
	const { openIndexRun, setIndexRunSelected, bumpIndexRunDone } = await import('../../../../../indexer/run-record.js');
	const graph = await import('../index.js');
	tools = { entity: graph.graphEntityTool, search: graph.graphSearchTool, callers: graph.graphCallersTool, callees: graph.graphCalleesTool, query: graph.graphQueryTool };
	updateRepoStatus = repos.updateRepoStatus as typeof updateRepoStatus;

	setActiveEmbedderBackend('ollama');
	await closeGraphStore();
	// Not the default path under HOME: that one belongs to the daemon alone.
	setGraphStorePath(join(home, 'store', 'graph.lmdb'));
	setLanceConnPath(join(home, 'store', 'lance'));
	await repos.addRepo(null, { path: A, name: 'app', addedAt: '2026-10-13T00:00:00.000Z', status: 'ready', lastIndexed: '2026-10-13T00:00:00.000Z' });
	await repos.addRepo(null, { path: X, name: 'indexing', addedAt: '2026-10-13T00:00:00.000Z', status: 'ready', lastIndexed: '2026-10-13T00:00:00.000Z' });
	const ent = (repo: string, file: string, kind: Entity['kind'], name: string): Entity => ({
		id: makeEntityId(repo, file, kind, name), kind, name, language: 'typescript', repoId: 1, repo, file,
		startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: '2026-10-13T00:00:00.000Z',
	} as unknown as Entity);
	const fnA = ent(A, `${A}/a.ts`, 'function', 'fnA');
	const fnX = ent(X, `${X}/x.ts`, 'function', 'fnX');
	const fileX = ent(X, `${X}/x.ts`, 'file', 'x.ts');
	const fileA = ent(A, `${A}/a.ts`, 'file', 'a.ts');
	const fileB = ent(A, `${A}/b.ts`, 'file', 'b.ts');
	Object.assign(ids, { fnA: fnA.id, fnX: fnX.id, fileX: fileX.id, fileA: fileA.id, fileB: fileB.id });
	await upsertEntities(null, [fnA, fnX, fileX, fileA, fileB]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: fnA.id, to: fnX.id, resolved: true },
		{ kind: 'CALLS', from: fnX.id, to: fnA.id, resolved: true },
		{ kind: 'DEFINES', from: fileX.id, to: fnX.id, resolved: true },
		// a.ts imports b.ts (same repository) and x.ts (the repository that goes under index).
		{ kind: 'IMPORTS', from: fileA.id, to: fileB.id, resolved: true },
		{ kind: 'IMPORTS', from: fileA.id, to: fileX.id, resolved: true },
	]);
	await addEntityEmbeddings([
		{ id: fnA.id, embedding: axis(0), repo: A, kind: 'function', artifact: false },
		{ id: fnX.id, embedding: axis(0), repo: X, kind: 'function', artifact: false },
	]);
	// X's full index runs: began at BEGAN, 7 of 20 files done.
	openIndexRun(X, BEGAN);
	setIndexRunSelected(X, 20);
	for (let i = 0; i < 7; i++) bumpIndexRunDone(X);
});

test.after(async () => {
	const { closeGraphStore } = await import('../../../../../db/graph/store.js');
	const { closeLanceConn } = await import('../../../../../db/lance/conn.js');
	await closeGraphStore();
	await closeLanceConn();
	await new Promise<void>(r => stub.close(() => r()));
	rmSync(home, { recursive: true, force: true });
});

const REFUSAL = /^repo-indexing: The repository \/graph-guard\/indexing is being indexed: the run began at 2026-10-13T15:00:00\.000Z, 7 of 20 files done\. Retry once the index is ready\.$/;
const idsIn = (r: ToolResult, key: 'entities' | 'results'): string[] => ((r.data as Record<string, Array<{ id: string }>>)[key] ?? []).map(e => e.id);

async function refused(tool: Tool, input: Record<string, unknown>, label: string): Promise<void> {
	const r = await tool.execute(input, deps);
	assert.equal(r.success, false, `${label}: refused`);
	assert.match(r.error ?? '', REFUSAL, `${label}: the code first, then how far the run got`);
}

test("the built-in graph tools (graph_entity, graph_callers, graph_callees, graph_query) about a repository under index fail with 'repo-indexing'; graph_search leaves such a repository out", async () => {
	// While X is ready, graph_search finds its entity.
	const before = await tools.search.execute({ query: 'q', limit: 10 }, deps);
	assert.ok(idsIn(before, 'results').includes(ids.fnX), JSON.stringify(before.data));

	await updateRepoStatus(null, X, 'indexing');
	try {
		await refused(tools.entity, { id: ids.fnX }, 'graph_entity');
		await refused(tools.callers, { entityId: ids.fnX }, 'graph_callers');
		await refused(tools.callees, { entityId: ids.fnX }, 'graph_callees');
		await refused(tools.query, { op: 'defined_in', fileEntityId: ids.fileX }, 'graph_query defined_in');
		await refused(tools.query, { op: 'closure', roots: [ids.fnA, ids.fnX] }, 'graph_query closure, one root under index');
		await refused(tools.query, { op: 'unreachable', roots: [ids.fnX], candidateKinds: ['function'] }, 'graph_query unreachable');
		await refused(tools.query, { op: 'scc', roots: [ids.fnX] }, 'graph_query scc');

		// The ready repository's entity is answered.
		const entityA = await tools.entity.execute({ id: ids.fnA }, deps);
		assert.equal(entityA.success, true);

		// graph_search: X is left out, A is searched, and the tool answers.
		const during = await tools.search.execute({ query: 'q', limit: 10 }, deps);
		assert.equal(during.success, true);
		assert.deepEqual(idsIn(during, 'results'), [ids.fnA]);
	} finally {
		await updateRepoStatus(null, X, 'ready', '2026-10-13T00:00:00.000Z');
	}
});

test("graph_query from a ready repository whose closure reaches a repository under index leaves that repository's entities out", async () => {
	// While X is ready, fnA's CALLS closure reaches fnX, and fnX calls fnA.
	const before = await tools.query.execute({ op: 'closure', roots: [ids.fnA], kindFilter: ['CALLS'], direction: 'out', maxDepth: 2 }, deps);
	assert.ok(idsIn(before, 'entities').includes(ids.fnX));

	await updateRepoStatus(null, X, 'indexing');
	try {
		const closure = await tools.query.execute({ op: 'closure', roots: [ids.fnA], kindFilter: ['CALLS'], direction: 'out', maxDepth: 2 }, deps);
		assert.equal(closure.success, true);
		assert.ok(!idsIn(closure, 'entities').includes(ids.fnX), 'graph_query closure: X left out');
		const callers = await tools.callers.execute({ entityId: ids.fnA }, deps);
		assert.equal(callers.success, true);
		assert.ok(!idsIn(callers, 'results').includes(ids.fnX), 'graph_callers: X left out');
		const scc = await tools.query.execute({ op: 'scc', roots: [ids.fnA], kindFilter: ['CALLS'] }, deps);
		assert.ok(!JSON.stringify(scc.data).includes(ids.fnX), 'graph_query scc: X left out');
	} finally {
		await updateRepoStatus(null, X, 'ready', '2026-10-13T00:00:00.000Z');
	}
});

test("graph_search reports as closureRepos the repositories it searched, leaving out one under index; graph_query op=imports refuses a file under index and leaves such a repository's files out of another file's imports", async () => {
	// While X is ready: both repositories searched; a.ts imports b.ts and x.ts.
	const before = await tools.search.execute({ query: 'q', limit: 10 }, deps);
	assert.deepEqual((before.data as { closureRepos: string[] }).closureRepos, [A, X]);
	const importsBefore = await tools.query.execute({ op: 'imports', fileEntityId: ids.fileA }, deps);
	assert.deepEqual(idsIn(importsBefore, 'entities').sort(), [ids.fileB, ids.fileX].sort());

	await updateRepoStatus(null, X, 'indexing');
	try {
		const during = await tools.search.execute({ query: 'q', limit: 10 }, deps);
		assert.deepEqual((during.data as { closureRepos: string[] }).closureRepos, [A], 'the searched repositories only');
		assert.match(during.output ?? '', /across 1 repo\(s\)/);
		await refused(tools.query, { op: 'imports', fileEntityId: ids.fileX }, 'graph_query imports of a file under index');
		const importsDuring = await tools.query.execute({ op: 'imports', fileEntityId: ids.fileA }, deps);
		assert.equal(importsDuring.success, true);
		assert.deepEqual(idsIn(importsDuring, 'entities'), [ids.fileB], 'x.ts left out');
	} finally {
		await updateRepoStatus(null, X, 'ready', '2026-10-13T00:00:00.000Z');
	}
});
