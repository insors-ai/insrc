/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A real daemon over a seeded store, for the tests of the graph-reading search
 * requests and tools (Epic c2ba6fa6, Story s5).
 *
 * HOME is a short temporary directory (the daemon's socket path must fit a
 * Unix socket name, about 104 bytes on macOS). The store is seeded before the
 * daemon opens it so that every parameter a request reads decides its answer:
 *   - two registered repositories, A depending on B;
 *   - a call chain fnD -> fnA -> fnB (fnD and fnA in A, fnB in B), and fnA
 *     REFERENCES fnC (in A);
 *   - one story artifact in A: an ownership record citing a.ts, and an
 *     artifact document with a vector;
 *   - one vector axis per entity.
 * The embedding model is a stand-in Ollama served in-process: it embeds a text
 * to the axis of the entity the text names (fnA, fnB, fnD or 'LLD'; fnC's for
 * any other), so the text searches are deterministic and reach no model.
 *
 * `bigRepos` adds registered repositories of many small files that are NOT
 * indexed yet: a reindex of one is a full index that runs long enough for a
 * test to make requests about a repository under index, with its figures.
 * `linkBig` ties each of them to the ready repositories, so that results which
 * cross repositories reach it: A DEPENDS_ON it, its fn0 CALLS fnB, and fnB
 * CALLS its fn0.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadLocalProviderConfig } from '../../../config/local.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../../db/lance/conn.js';
import { _resetEntityVecCache, addEntityEmbeddings } from '../../../db/lance/entity-vec.js';
import { upsertRelations } from '../../../db/relations.js';
import { addRepo } from '../../../db/repos.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { Entity } from '../../../shared/types.js';
import { rpc, startDaemon } from '../../../mcp/__tests__/helpers/mcp-e2e.js';
import type { RunningDaemon } from '../../../mcp/__tests__/helpers/mcp-e2e.js';

const DIM = loadLocalProviderConfig().embeddingDim;   // at least five: one axis per entity
const MODEL = 'stub-embed';
export const DOC_DIR = 'docs/epics/demo-E20261013aaaaaaaa/S001';

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

function entity(repo: string, file: string, kind: Entity['kind'], name: string): Entity {
	return {
		id: makeEntityId(repo, file, kind, name), kind, name, language: 'typescript', repoId: 1, repo, file,
		...(kind === 'repo' ? { rootPath: repo } : {}),
		startLine: kind === 'repo' ? 0 : 1, endLine: kind === 'repo' ? 0 : 1,
		body: kind === 'repo' ? '' : `export function ${name}() {}`, embedding: [], indexedAt: '2026-10-13T00:00:00.000Z',
	} as unknown as Entity;
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

export interface SeededIds {
	readonly repoA: string; readonly repoB: string;
	readonly fnA: string; readonly fnB: string; readonly fnC: string; readonly fnD: string; readonly doc: string;
}

export interface SeededDaemon {
	readonly daemon: RunningDaemon;
	readonly home:   string;
	readonly repoA:  string;
	readonly repoB:  string;
	/** The large repositories, not indexed yet; and the id of the one function seeded in each (in f0.ts). */
	readonly big:    ReadonlyArray<{ readonly path: string; readonly fn0: string }>;
	readonly ids:    SeededIds;
	call(method: string, params: Record<string, unknown>): Promise<unknown>;
	stop(): Promise<void>;
}

export async function startSeededDaemon(opts: { readonly bigRepos?: readonly number[]; readonly linkBig?: boolean } = {}): Promise<SeededDaemon> {
	const home = mkdtempSync('/tmp/isc-');
	const repoA = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-seeded-a-')));
	const repoB = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-seeded-b-')));
	writeFileSync(join(repoA, 'a.ts'), 'export function fnA() {}\nexport function fnC() {}\nexport function fnD() {}\n', 'utf8');
	writeFileSync(join(repoB, 'b.ts'), 'export function fnB() {}\n', 'utf8');
	mkdirSync(join(repoA, DOC_DIR), { recursive: true });
	writeFileSync(join(repoA, DOC_DIR, 'LLD.md'), '# LLD\n', 'utf8');
	// The story's ownership record: it cites a.ts.
	mkdirSync(join(repoA, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repoA, '.insrc', 'artifacts', 'LLD-aaaaaaaa-s1.json'), JSON.stringify({
		meta: { epicHash: 'aaaaaaaa', storyId: 's1', epicSlug: 'demo' },
		citations: [{ id: 'c1', kind: 'code', ref: 'a.ts:1' }],
	}), 'utf8');

	const big: Array<{ path: string; fn0: string }> = [];
	for (const files of opts.bigRepos ?? []) {
		const path = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-seeded-big-')));
		for (let i = 0; i < files; i++) writeFileSync(join(path, `f${i}.ts`), `export function fn${i}() { return ${i}; }\n`, 'utf8');
		big.push({ path, fn0: makeEntityId(path, join(path, 'f0.ts'), 'function', 'fn0') });
	}

	const stub = await standInOllama();
	mkdirSync(join(home, '.insrc'), { recursive: true });
	writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({
		models: { local: { host: stub.host, embeddingModel: MODEL, embeddingDim: DIM } },
	}), 'utf8');

	// The store, seeded before the daemon opens it.
	setGraphStorePath(join(home, '.insrc', 'graph.lmdb'));
	setLanceConnPath(join(home, '.insrc', 'lance'));
	// lastIndexed after every file's mtime: the daemon's start finds nothing to re-index.
	for (const path of [repoA, repoB, ...big.map(b => b.path)]) {
		await addRepo(null, { path, name: path, addedAt: '2026-10-13T00:00:00.000Z', status: 'ready', lastIndexed: '2099-01-01T00:00:00.000Z' });
	}
	const rA = entity(repoA, '', 'repo', repoA);
	const rB = entity(repoB, '', 'repo', repoB);
	const fnA = entity(repoA, join(repoA, 'a.ts'), 'function', 'fnA');
	const fnC = entity(repoA, join(repoA, 'a.ts'), 'function', 'fnC');
	const fnD = entity(repoA, join(repoA, 'a.ts'), 'function', 'fnD');
	const fnB = entity(repoB, join(repoB, 'b.ts'), 'function', 'fnB');
	const doc = entity(repoA, join(repoA, DOC_DIR, 'LLD.md'), 'section', 'LLD');
	// One function stored in each large repository, so a request can name one by an entity.
	const bigFns = big.map(b => entity(b.path, join(b.path, 'f0.ts'), 'function', 'fn0'));
	const bigRepoEntities = opts.linkBig === true ? big.map(b => entity(b.path, '', 'repo', b.path)) : [];
	await upsertEntities(null, [rA, rB, fnA, fnC, fnD, fnB, doc, ...bigFns, ...bigRepoEntities]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: fnD.id, to: fnA.id, resolved: true },
		{ kind: 'CALLS', from: fnA.id, to: fnB.id, resolved: true },
		{ kind: 'REFERENCES', from: fnA.id, to: fnC.id, resolved: true },
		{ kind: 'DEPENDS_ON', from: rA.id, to: rB.id, resolved: true },
		...(opts.linkBig === true ? big.flatMap((b, i) => [
			{ kind: 'DEPENDS_ON' as const, from: rA.id, to: bigRepoEntities[i]!.id, resolved: true },
			{ kind: 'CALLS' as const, from: b.fn0, to: fnB.id, resolved: true },
			{ kind: 'CALLS' as const, from: fnB.id, to: b.fn0, resolved: true },
		]) : []),
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

	let daemon: RunningDaemon | undefined;
	const cleanup = async (): Promise<void> => {
		await daemon?.stop();
		await new Promise<void>(r => stub.server.close(() => r()));
		for (const d of [home, repoA, repoB, ...big.map(b => b.path)]) rmSync(d, { recursive: true, force: true });
	};
	try {
		daemon = await startDaemon(home);
		// The embedder is picked at start, in the background: wait until a text search answers.
		const deadline = Date.now() + 30_000;
		for (;;) {
			const hits = await rpc(daemon.sock, 'search.query', { text: 'ready?', limit: 5 }) as unknown[];
			if (hits.length > 0) break;
			if (Date.now() > deadline) throw new Error('the daemon never answered a text search (embedder not ready)');
			await new Promise(r => setTimeout(r, 250));
		}
	} catch (err) {
		await cleanup();
		throw err;
	}
	const running = daemon;
	return {
		daemon: running, home, repoA, repoB, big,
		ids: { repoA: rA.id, repoB: rB.id, fnA: fnA.id, fnB: fnB.id, fnC: fnC.id, fnD: fnD.id, doc: doc.id },
		call: (method, params) => rpc(running.sock, method, params),
		stop: cleanup,
	};
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The refusal a request about `repo` gets while its full index of `files` files runs, with the run's figures. */
export function underIndexRefusal(repo: string, files: number): RegExp {
	return new RegExp(`^repo-indexing: The repository ${escapeRe(repo)} is being indexed: the run began at \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z, \\d+ of ${files} files done\\. Retry once the index is ready\\.$`);
}

/**
 * Start a full index of `repo` (`files` files) and run `during` while it runs;
 * the index is shown to still be running afterwards. The index queue runs one
 * job at a time: a full index queued behind another starts when that one ends.
 */
export async function whileIndexing(seeded: SeededDaemon, repo: string, files: number, during: () => Promise<void>): Promise<void> {
	await seeded.call('repo.reindex', { path: repo });
	const refused = async (): Promise<string | undefined> =>
		seeded.call('search.closure', { repoPath: repo }).then(() => undefined, (e: Error) => e.message);
	const deadline = Date.now() + 180_000;
	for (;;) {
		const answer = await refused();
		if (answer !== undefined && underIndexRefusal(repo, files).test(answer)) break;
		if (Date.now() > deadline) throw new Error(`the full index of ${repo} was never seen running (last answer: ${answer ?? 'answered'})`);
		await new Promise(r => setTimeout(r, 20));
	}
	await during();
	const after = await refused();
	if (after === undefined || !underIndexRefusal(repo, files).test(after)) {
		throw new Error(`the full index of ${repo} ended before the requests were done (answer after: ${after ?? 'answered'})`);
	}
}
