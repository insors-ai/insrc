/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t11 — a full index (repo.reindex queues one) rebuilds the
 * repository from scratch and records its state: an edge lost from a store
 * whose file hashes are unchanged comes back; a file that cannot be read is an
 * uncommitted file; the repository entity and its DEPENDS_ON edges are stored;
 * an interrupted full index stays unfinished and start-up queues it again;
 * another repository's edge into the rebuilt one is restored without
 * reindexing that repository; and a reindex leaves no export_names under old
 * entity numbers.
 *
 * The real indexer over a temporary store; no embedding backend is set, so no
 * model runs.
 *
 * Run: npx tsx --test src/indexer/__tests__/full-index-rebuild.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { encodeEntityKey, encodeInEdgeKey, encodeOutEdgeKey, RELATION_KIND_BYTE } from '../../db/graph/keys.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, listRepos } from '../../db/repos.js';
import { findCallers } from '../../db/search.js';
import { entityU64ForId, getEntity, upsertEntities } from '../../db/entities.js';
import { listUnresolvedRelations, upsertRelations } from '../../db/relations.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { completenessOf, readIndexState } from '../../db/index-state.js';
import type { DbClient } from '../../db/client.js';
import type { IndexJob, RegisteredRepo } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { makeEntityId } from '../parser/base.js';

useTemporaryLance();

const NOW = '2026-10-18T00:00:00.000Z';
let store: string;
const repos: string[] = [];

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s1t11-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true });
});

async function newRepo(files: Record<string, string>): Promise<string> {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s1t11-repo-')));
	repos.push(repo);
	for (const [rel, text] of Object.entries(files)) {
		mkdirSync(dirname(join(repo, rel)), { recursive: true });
		writeFileSync(join(repo, rel), text);
	}
	await addRepo(null, { path: repo, name: 'fixture', addedAt: NOW, status: 'pending' });
	return repo;
}

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;

/** A queue that records what is enqueued (it is never started). */
class RecordingQueue extends IndexQueue {
	readonly jobs: IndexJob[] = [];
	override enqueue(job: IndexJob): void { this.jobs.push(job); super.enqueue(job); }
}

const service = (queue: IndexQueue = new IndexQueue()): IndexerService =>
	new IndexerService(null as unknown as DbClient, queue, watcher, undefined, 600_000);

/** What repo.reindex does: a full index of the repository. */
const reindex = (repo: string, svc: IndexerService = service()): Promise<void> => svc.processJob({ kind: 'full', repoPath: repo });

const fileId = (repo: string, rel: string): string => makeEntityId(repo, join(repo, rel), 'file', join(repo, rel));
const fnId = (repo: string, rel: string, name: string): string => makeEntityId(repo, join(repo, rel), 'function', name);

const AB = {
	'src/a.ts': "import { fn } from './b.js';\nexport function run(): number { return fn(); }\n",
	'src/b.ts': 'export function fn(): number { return 1; }\n',
};

test('ac2: a cross-file edge deleted by hand from a store whose file hashes are unchanged is restored by repo.reindex', async () => {
	const repo = await newRepo(AB);
	await reindex(repo);
	const fn = fnId(repo, 'src/b.ts', 'fn'), run = fnId(repo, 'src/a.ts', 'run');
	assert.deepEqual((await findCallers(null, fn)).map(e => e.id), [run]);

	// Lose the edge; no file changes, so every stored hash still matches.
	const runU64 = (await entityU64ForId(run))!, fnU64 = (await entityU64ForId(fn))!;
	await withWriteTxn(s => {
		s.outEdge.remove(encodeOutEdgeKey(runU64, RELATION_KIND_BYTE.CALLS, fnU64));
		s.inEdge.remove(encodeInEdgeKey(fnU64, RELATION_KIND_BYTE.CALLS, runU64));
	});
	assert.deepEqual(await findCallers(null, fn), [], 'the edge is gone');

	await reindex(repo);
	assert.deepEqual((await findCallers(null, fn)).map(e => e.id), [run], 'repo.reindex brought it back');
	const state = await readIndexState(repo);
	assert.equal(state?.fullIndexFinished, true);
	assert.equal(completenessOf(state).complete, true, completenessOf(state).reasons.join('; '));
});

test('a file whose read fails during a full index is an uncommitted file and the repository reads not complete', async () => {
	const repo = await newRepo({ ...AB, 'src/locked.ts': 'export const x = 1;\n' });
	const locked = join(repo, 'src', 'locked.ts');
	chmodSync(locked, 0o000);
	try {
		await reindex(repo);
	} finally {
		chmodSync(locked, 0o644);
	}
	const state = await readIndexState(repo);
	assert.deepEqual(state?.uncommittedFiles, [locked]);
	const completeness = completenessOf(state);
	assert.equal(completeness.complete, false);
	assert.ok(completeness.reasons.includes('1 file could not be indexed'), completeness.reasons.join('; '));
});

test('the repository entity is stored before the manifest step, so the manifest\'s DEPENDS_ON edges are stored', async () => {
	const repo = await newRepo({ ...AB, 'package.json': JSON.stringify({ name: 'fixture', dependencies: { lodash: '^4.0.0' } }) });
	await reindex(repo);
	const repoEntity = makeEntityId(repo, '', 'repo', repo);
	assert.equal((await getEntity(null, repoEntity))?.kind, 'repo');
	const lodash = (await entityU64ForId(makeEntityId('npm', '', 'module', 'lodash')))!;
	assert.deepEqual(await outNeighbors((await entityU64ForId(repoEntity))!, { kindFilter: ['DEPENDS_ON'] }), [lodash]);
	assert.equal((await readIndexState(repo))?.unwritable, 0, 'no DEPENDS_ON was refused');
});

test('a full index made to throw part-way leaves fullIndexFinished false, and start-up queues that repository for a full index', async () => {
	const repo = await newRepo(AB);
	class Interrupted extends IndexerService {
		override async reconcileRepo(): Promise<never> { throw new Error('interrupted'); }
	}
	await assert.rejects(reindex(repo, new Interrupted(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 600_000)), /interrupted/);
	assert.equal((await readIndexState(repo))?.fullIndexFinished, false);

	// Even with the status written 'ready' and a lastIndexed, start-up queues the full index again.
	const row = (await listRepos(null)).find(r => r.path === repo)!;
	const asReady: RegisteredRepo = { ...row, status: 'ready', lastIndexed: NOW };
	const queue = new RecordingQueue();
	await service(queue).start([asReady]);
	assert.ok(queue.jobs.some(j => j.kind === 'full' && j.repoPath === repo), JSON.stringify(queue.jobs));

	// A repository whose full index finished is not queued for one.
	await reindex(repo);
	const done = new RecordingQueue();
	await service(done).start([{ ...asReady, lastIndexed: new Date().toISOString() }]);
	assert.equal(done.jobs.filter(j => j.kind === 'full').length, 0, JSON.stringify(done.jobs));
});

test('repository B\'s reindex restores repository A\'s hand-written edge into B through Pass 0, without reindexing A', async () => {
	const repoB = await newRepo({ 'src/b.ts': 'export function target(): number { return 1; }\n' });
	await reindex(repoB);
	const repoA = await newRepo({});
	const a = { id: fnId(repoA, 'src/a.ts', 'caller'), kind: 'function' as const, name: 'caller', language: 'typescript' as const,
		repoId: 1, repo: repoA, file: join(repoA, 'src', 'a.ts'), startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: NOW };
	await upsertEntities(null, [a]);
	const target = fnId(repoB, 'src/b.ts', 'target');
	await upsertRelations(null, [{ kind: 'CALLS', from: a.id, to: target, resolved: true, meta: { repo: repoA, file: a.file } }]);

	await reindex(repoB);
	const aU64 = (await entityU64ForId(a.id))!;
	assert.deepEqual(await outNeighbors(aU64, { kindFilter: ['CALLS'] }), [(await entityU64ForId(target))!], 'A\'s edge into B is an edge again');
	assert.deepEqual(await listUnresolvedRelations(null, repoA), [], 'nothing of A is left pending');
	assert.equal((await readIndexState(repoA))?.pending['awaiting-target'] ?? 0, 0, 'and A\'s count is back to zero');
});

test('after a reindex of the ac3 fixture no export_names entry remains under an old u64 and calls through the barrel still resolve', async () => {
	const repo = await newRepo({
		'src/b.ts':     'export function f(): number { return 1; }\n',
		'src/index.ts': "export { f } from './b.js';\nexport { f as g } from './b.js';\n",
		'src/c.ts':     "import { f, g } from './index.js';\nexport function useF(): number { return f(); }\nexport function useG(): number { return g(); }\n",
	});
	await reindex(repo);
	const barrel = fileId(repo, 'src/index.ts');
	const oldU64 = (await entityU64ForId(barrel))!;
	await reindex(repo);
	const newU64 = (await entityU64ForId(barrel))!;
	assert.notEqual(newU64, oldU64);

	const s = await getGraphStore();
	const under = (u64: bigint) => [...s.exportNames.getKeys({ start: encodeEntityKey(u64), end: encodeEntityKey(u64 + 1n) })].length;
	assert.equal(under(oldU64), 0, 'nothing under the old u64');
	assert.equal(under(newU64), 2, 'f and g under the new one');
	assert.deepEqual((await findCallers(null, fnId(repo, 'src/b.ts', 'f'))).map(e => e.name).sort(), ['useF', 'useG']);
});
