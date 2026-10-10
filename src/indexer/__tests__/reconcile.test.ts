/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-2764c29d S001 — the index clean-up pass (`reconcile` job): it
 * removes the stored files of a repo that are gone from disk or that the
 * repo's ignore list excludes, and nothing else. Over a temp graph store
 * and a temp vector store (removing an entity always opens the vector
 * table, whose path is the live store unless it is set).
 *
 * Run: npx tsx --test src/indexer/__tests__/reconcile.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../db/lance/conn.js';
import { _resetEntityVecCache, searchEntityVecs } from '../../db/lance/entity-vec.js';
import { addRepo, listRepos } from '../../db/repos.js';
import {
	upsertEntities,
	getEntity,
	entityU64ForId,
	findEntitiesByFile,
	listEntityFilesForRepo,
} from '../../db/entities.js';
import { upsertRelations, listUnresolvedRelations } from '../../db/relations.js';
import { outNeighbors, inNeighbors } from '../../db/graph/edges.js';
import { getCachedExploration, putCachedExploration } from '../../db/exploration-cache.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, IndexJob, RegisteredRepo, Relation } from '../../shared/types.js';
import type { Exploration, ExplorationOutput } from '../../analyze/explore/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService, type FilePresenceCheck } from '../index.js';
import { makeEntityId } from '../parser/base.js';

const NOW = '2026-10-10T00:00:00.000Z';
const db = null as unknown as DbClient;
const DIM = loadLocalProviderConfig().embeddingDim;
const ZERO = { compared: 0, removedAbsent: 0, removedIgnored: 0, notChecked: 0 };

let store: string;
let repoA: string;
let repoC: string;

test.beforeEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	store = mkdtempSync(join(tmpdir(), 'insrc-2764-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	setLanceConnPath(join(store, 'lance'));
	repoA = mkdtempSync(join(tmpdir(), 'insrc-2764-a-'));
	repoC = mkdtempSync(join(tmpdir(), 'insrc-2764-c-'));
	await addRepo(null, { path: repoA, name: '', addedAt: NOW, status: 'ready', lastIndexed: NOW });
	await addRepo(null, { path: repoC, name: '', addedAt: NOW, status: 'ready', lastIndexed: NOW });
});
test.afterEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	rmSync(store, { recursive: true, force: true });
	rmSync(repoA, { recursive: true, force: true });
	rmSync(repoC, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A watcher that watches nothing: jobs are processed by direct calls. */
function standInWatcher(): Watcher {
	return {
		onEvents() { /* no events */ },
		async addRepo() { /* not watching */ },
		async removeRepo() { /* not watching */ },
		async addConfigDir() { /* not watching */ },
	} as unknown as Watcher;
}

/** Counts the resolver runs the clean-up job makes, and can make a store
 *  removal or the resolver run fail. */
class ProbeService extends IndexerService {
	resolverRuns: string[] = [];
	removed: string[] = [];
	failRemovalOf: string | null = null;
	failResolver = false;
	protected override async resolveAfterReconcile(repoPath: string): Promise<void> {
		this.resolverRuns.push(repoPath);
		if (this.failResolver) throw new Error('resolver failed');
		await super.resolveAfterReconcile(repoPath);
	}
	protected override async removeStoredFile(repoPath: string, file: string, ids: readonly string[]): Promise<void> {
		if (file === this.failRemovalOf) throw new Error('store write failed');
		await super.removeStoredFile(repoPath, file, ids);
		this.removed.push(file);
	}
}

/** A queue that records what is enqueued (nothing drains it). */
class RecordingQueue extends IndexQueue {
	jobs: IndexJob[] = [];
	override enqueue(job: IndexJob): void {
		this.jobs.push(job);
		super.enqueue(job);
	}
	of(repoPath: string): string[] {
		return this.jobs
			.filter(j => 'repoPath' in j && j.repoPath === repoPath)
			.map(j => j.kind);
	}
}

function service(filePresence?: FilePresenceCheck): ProbeService {
	// A long settle window: no settle pass fires inside a test.
	return new ProbeService(db, new IndexQueue(), standInWatcher(), undefined, 600_000, filePresence);
}

function ent(repo: string, file: string, kind: Entity['kind'], name: string, embedding: number[] = []): Entity {
	return {
		id: makeEntityId(repo, file, kind, name),
		kind, name, language: 'typescript',
		repoId: 1, repo, file, startLine: 1, endLine: 1,
		body: embedding.length > 0 ? `function ${name}() {}` : '',
		embedding, indexedAt: NOW,
		...(embedding.length > 0 ? { embeddingModel: 'test-model' } : {}),
	};
}

function vec(seed: number): number[] {
	const v: number[] = new Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	return v;
}

/** Create `file` on disk (with its directories). */
function onDisk(file: string, content = 'export const x = 1;\n'): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

function calls(from: Entity, to: Entity): Relation {
	return { kind: 'CALLS', from: from.id, to: to.id, resolved: true };
}

function unresolvedCall(repo: string, from: Entity, toName: string): Relation {
	return { kind: 'CALLS', from: from.id, to: toName, resolved: false, meta: { repo, file: from.file } };
}

async function exists(e: Entity): Promise<boolean> {
	return (await getEntity(null, e.id)) !== null;
}

async function callees(e: Entity): Promise<number> {
	const u64 = await entityU64ForId(e.id);
	assert.ok(u64 !== undefined, `entity ${e.name} is stored`);
	return (await outNeighbors(u64, { kindFilter: ['CALLS'] })).length;
}

async function callers(e: Entity): Promise<number> {
	const u64 = await entityU64ForId(e.id);
	assert.ok(u64 !== undefined, `entity ${e.name} is stored`);
	return (await inNeighbors(u64, { kindFilter: ['CALLS'] })).length;
}

const EXP: Exploration = { id: 'e1', type: 'concept.resolve', purpose: 'test probe', params: { query: 'q' } };
const OUTPUT = { type: 'concept.resolve', query: 'q', hits: [] } as unknown as ExplorationOutput;

async function cached(repo: string): Promise<boolean> {
	return (await getCachedExploration(repo, 1n, EXP)) !== null;
}

// ---------------------------------------------------------------------------
// The job is dispatched
// ---------------------------------------------------------------------------

test('a clean-up job for a registered repository with nothing stored is processed without error', async () => {
	const svc = service();

	await svc.processJob({ kind: 'reconcile', repoPath: repoA });

	// Nothing was removed, so nothing followed. (That the job reaches the pass at
	// all is shown by every test below that runs it against a stale file.)
	assert.deepEqual(svc.removed, []);
	assert.deepEqual(svc.resolverRuns, []);
	assert.deepEqual(await svc.reconcileRepo(repoA), ZERO);
});

// ---------------------------------------------------------------------------
// What the clean-up removes
// ---------------------------------------------------------------------------

test('the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was', async () => {
	const keepFile = join(repoA, 'src', 'keep.ts');
	const goneFile = join(repoA, 'src', 'gone.ts');
	const builtFile = join(repoA, 'out', 'built.js');
	const cFile = join(repoC, 'src', 'c.ts');
	const cGoneFile = join(repoC, 'src', 'c-gone.ts');
	onDisk(keepFile); onDisk(builtFile); onDisk(cFile);   // goneFile and cGoneFile are not on disk

	const keep = ent(repoA, keepFile, 'function', 'keep');
	const gone = ent(repoA, goneFile, 'function', 'gone');
	const goneCls = ent(repoA, goneFile, 'class', 'Gone');
	const built = ent(repoA, builtFile, 'function', 'built');
	const c = ent(repoC, cFile, 'function', 'c');
	const cGone = ent(repoC, cGoneFile, 'function', 'cGone');
	await upsertEntities(null, [keep, gone, goneCls, built, c, cGone]);
	await upsertRelations(null, [
		calls(gone, keep), calls(built, keep), calls(cGone, c),
		unresolvedCall(repoA, gone, 'missing'), unresolvedCall(repoA, built, 'missing'),
		unresolvedCall(repoA, keep, 'missing'), unresolvedCall(repoC, cGone, 'missing'),
	]);
	assert.equal(await callers(keep), 2);
	assert.equal((await listUnresolvedRelations(null, repoA)).length, 3);

	await service().processJob({ kind: 'reconcile', repoPath: repoA });

	// The gone file and the ignored file are out, with all their entities.
	assert.equal(await exists(gone), false);
	assert.equal(await exists(goneCls), false);
	assert.equal(await exists(built), false);
	assert.deepEqual([...(await listEntityFilesForRepo(null, repoA)).keys()], [keepFile]);
	// Their relations into the kept file and their unresolved relations went with them.
	assert.equal(await callers(keep), 0);
	const leftA = await listUnresolvedRelations(null, repoA);
	assert.deepEqual(leftA.map(r => r.fromEntity), [keep.id]);
	// The kept file is as it was.
	assert.equal(await exists(keep), true);
	// The other repository is untouched, its own stale file included.
	assert.equal(await exists(c), true);
	assert.equal(await exists(cGone), true);
	assert.equal(await callers(c), 1);
	assert.equal((await listUnresolvedRelations(null, repoC)).length, 1);
});

test('a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept', async () => {
	// A minified file: the full pass skips it and it has no place in the listing's
	// supported set, but it exists and is not ignored.
	const minified = join(repoA, 'src', 'app.min.js');
	const outline = join(repoA, 'outline.ts');            // contains `out` in its name only
	const output = join(repoA, 'src', 'output', 'a.ts');   // segment `output`, not `out`
	onDisk(minified); onDisk(outline); onDisk(output);
	const eMin = ent(repoA, minified, 'function', 'm');
	const eOutline = ent(repoA, outline, 'function', 'o');
	const eOutput = ent(repoA, output, 'function', 'p');
	const noFile = ent(repoA, '', 'function', 'endpoint');
	await upsertEntities(null, [eMin, eOutline, eOutput, noFile]);

	const result = await service().reconcileRepo(repoA);

	assert.deepEqual(result, { ...ZERO, compared: 3 });
	for (const e of [eMin, eOutline, eOutput, noFile]) {
		assert.equal(await exists(e), true, `${e.name} is kept`);
	}
});

test('a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept', async () => {
	const keepFile = join(repoA, 'src', 'keep.ts');
	const lockedFile = join(repoA, 'src', 'locked.ts');   // NOT on disk: only the stand-in speaks for it
	onDisk(keepFile);
	const keep = ent(repoA, keepFile, 'function', 'keep');
	const locked = ent(repoA, lockedFile, 'function', 'locked');
	await upsertEntities(null, [keep, locked]);

	// The stand-in answers with a permission error for one file and the real stat for the rest.
	const asked: string[] = [];
	const presence: FilePresenceCheck = file => {
		asked.push(file);
		if (file === lockedFile) {
			throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
		}
		statSync(file);
	};
	const result = await service(presence).reconcileRepo(repoA);

	assert.deepEqual(result, { compared: 2, removedAbsent: 0, removedIgnored: 0, notChecked: 1 });
	assert.ok(asked.includes(lockedFile), 'the stand-in was asked about the file');
	assert.equal(await exists(locked), true);
	assert.equal(await exists(keep), true);

	// Now the repository's own directory goes away: every stored file would look deleted.
	rmSync(repoA, { recursive: true, force: true });
	const svc = service();
	assert.deepEqual(await svc.reconcileRepo(repoA), ZERO);
	await svc.processJob({ kind: 'reconcile', repoPath: repoA });
	assert.equal(await exists(locked), true);
	assert.equal(await exists(keep), true);
	assert.deepEqual(svc.resolverRuns, []);
});

test('running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was', async () => {
	const keepFile = join(repoA, 'src', 'keep.ts');
	const goneFile = join(repoA, 'src', 'gone.ts');
	const cFile = join(repoC, 'src', 'c.ts');
	onDisk(keepFile); onDisk(cFile);
	const keep = ent(repoA, keepFile, 'function', 'keep');
	const gone = ent(repoA, goneFile, 'function', 'gone');
	const c = ent(repoC, cFile, 'function', 'c');
	const c2 = ent(repoC, cFile, 'class', 'C');
	await upsertEntities(null, [keep, gone, c, c2]);
	await upsertRelations(null, [calls(c, c2), unresolvedCall(repoC, c, 'missing')]);
	const svc = service();

	assert.deepEqual(await svc.reconcileRepo(repoA), { compared: 2, removedAbsent: 1, removedIgnored: 0, notChecked: 0 });
	assert.deepEqual(await svc.reconcileRepo(repoA), { ...ZERO, compared: 1 });
	assert.equal(await exists(keep), true);

	// Nothing stale in repoC: nothing changes there.
	assert.deepEqual(await svc.reconcileRepo(repoC), { ...ZERO, compared: 1 });
	assert.equal(await exists(c), true);
	assert.equal(await exists(c2), true);
	assert.equal(await callees(c), 1);
	assert.equal((await listUnresolvedRelations(null, repoC)).length, 1);
});

test('a file whose parent directory became a file is removed as absent', async () => {
	const stored = join(repoA, 'src', 'dir', 'a.ts');
	const keepFile = join(repoA, 'src', 'keep.ts');
	onDisk(keepFile);
	onDisk(join(repoA, 'src', 'dir'), 'now a file\n');   // `dir` is a regular file
	const a = ent(repoA, stored, 'function', 'a');
	const keep = ent(repoA, keepFile, 'function', 'keep');
	await upsertEntities(null, [a, keep]);
	// The file system does not answer "no such file" here.
	assert.throws(() => statSync(stored), (err: NodeJS.ErrnoException) => err.code === 'ENOTDIR');

	const result = await service().reconcileRepo(repoA);

	assert.deepEqual(result, { compared: 2, removedAbsent: 1, removedIgnored: 0, notChecked: 0 });
	assert.equal(await exists(a), false);
	assert.equal(await exists(keep), true);
});

test('the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it', async () => {
	// `vendor` is in the universal ignore list; the child repo is registered under it.
	const child = join(repoA, 'vendor', 'lib');
	const shared = join(child, 'x.ts');
	onDisk(shared);
	await addRepo(null, { path: child, name: '', addedAt: NOW, status: 'ready', lastIndexed: NOW });
	const parents = ent(repoA, shared, 'function', 'x');
	const childs = ent(child, shared, 'function', 'x');
	const childOther = ent(child, shared, 'class', 'X');
	await upsertEntities(null, [parents, childs, childOther]);
	await upsertRelations(null, [
		calls(childs, childOther),
		unresolvedCall(repoA, parents, 'missing'), unresolvedCall(child, childs, 'missing'),
	]);

	const result = await service().reconcileRepo(repoA);

	assert.deepEqual(result, { compared: 1, removedAbsent: 0, removedIgnored: 1, notChecked: 0 });
	assert.equal(await exists(parents), false);
	assert.equal((await listUnresolvedRelations(null, repoA)).length, 0);
	// The child's entities, relation and unresolved relation for the same path stay.
	assert.equal(await exists(childs), true);
	assert.equal(await exists(childOther), true);
	assert.equal(await callees(childs), 1);
	assert.equal((await listUnresolvedRelations(null, child)).length, 1);
	// The child's own clean-up keeps the file: relative to the child it is not ignored.
	assert.deepEqual(await service().reconcileRepo(child), { ...ZERO, compared: 1 });
	assert.equal(await exists(childs), true);
});

test('the vector rows of a removed file are gone after the clean-up and those of a kept file remain', async () => {
	const keepFile = join(repoA, 'src', 'keep.ts');
	const goneFile = join(repoA, 'src', 'gone.ts');
	onDisk(keepFile);
	const keep = ent(repoA, keepFile, 'function', 'keep', vec(1));
	const gone = ent(repoA, goneFile, 'function', 'gone', vec(2));
	await upsertEntities(null, [keep, gone]);
	const idsInVectorTable = async (): Promise<string[]> =>
		(await searchEntityVecs(vec(1), [repoA], 10)).map(h => h.id).sort();
	assert.deepEqual(await idsInVectorTable(), [keep.id, gone.id].sort(), 'both rows are stored before the clean-up');

	await service().processJob({ kind: 'reconcile', repoPath: repoA });

	assert.deepEqual(await idsInVectorTable(), [keep.id]);
});

test('a kept file\'s link into a removed entity is removed with it, and the kept file\'s other links and entities stay', async () => {
	const keepFile = join(repoA, 'src', 'keep.ts');
	const otherFile = join(repoA, 'src', 'other.ts');
	const goneFile = join(repoA, 'src', 'gone.ts');
	onDisk(keepFile); onDisk(otherFile);
	const keep = ent(repoA, keepFile, 'function', 'keep');
	const keepCls = ent(repoA, keepFile, 'class', 'Keep');
	const other = ent(repoA, otherFile, 'function', 'other');
	const gone = ent(repoA, goneFile, 'function', 'gone');
	await upsertEntities(null, [keep, keepCls, other, gone]);
	await upsertRelations(null, [calls(keep, gone), calls(keep, other), calls(other, keep)]);
	assert.equal(await callees(keep), 2);

	await service().processJob({ kind: 'reconcile', repoPath: repoA });

	assert.equal(await exists(gone), false);
	assert.equal(await callees(keep), 1, 'only the link to the kept file is left');
	assert.equal(await callers(other), 1);
	assert.equal(await callers(keep), 1);
	assert.equal(await exists(keep), true);
	assert.equal(await exists(keepCls), true);
	assert.equal(await exists(other), true);
	// The design's stated limit: no unresolved relation is put back for the lost link.
	assert.equal((await listUnresolvedRelations(null, repoA)).length, 0);
});

// ---------------------------------------------------------------------------
// What follows the removals
// ---------------------------------------------------------------------------

test('a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository\'s cached exploration results, and one that removed nothing leaves them', async () => {
	const keepFile = join(repoA, 'src', 'keep.ts');
	const cFile = join(repoC, 'src', 'c.ts');
	onDisk(keepFile); onDisk(cFile);
	const stale = ['one', 'two', 'three'].map(n => ent(repoA, join(repoA, 'src', `${n}.ts`), 'function', n));
	await upsertEntities(null, [ent(repoA, keepFile, 'function', 'keep'), ...stale, ent(repoC, cFile, 'function', 'c')]);
	await putCachedExploration(repoA, 1n, EXP, OUTPUT);
	await putCachedExploration(repoC, 1n, EXP, OUTPUT);
	assert.equal(await cached(repoA), true);
	const svc = service();

	await svc.processJob({ kind: 'reconcile', repoPath: repoA });

	// Three files removed, ONE resolver run for the repository, and it has finished:
	// the job awaited it, nothing is left on a timer.
	assert.deepEqual(svc.resolverRuns, [repoA]);
	assert.equal(svc._armedSettleTimersForTest(), 0);
	assert.equal(await cached(repoA), false);
	assert.equal(await cached(repoC), true, 'another repository keeps its cached results');

	// Nothing stale in repoC: no resolver run and its cached results stay.
	await svc.processJob({ kind: 'reconcile', repoPath: repoC });
	assert.deepEqual(svc.resolverRuns, [repoA]);
	assert.equal(await cached(repoC), true);
	assert.equal(svc._armedSettleTimersForTest(), 0);
});

test('the clean-up method called directly removes the stale files, runs no resolver and removes no cached result', async () => {
	const keepFile = join(repoA, 'src', 'keep.ts');
	onDisk(keepFile);
	const keep = ent(repoA, keepFile, 'function', 'keep');
	const gone = ent(repoA, join(repoA, 'src', 'gone.ts'), 'function', 'gone');
	await upsertEntities(null, [keep, gone]);
	await putCachedExploration(repoA, 1n, EXP, OUTPUT);
	const svc = service();

	const result = await svc.reconcileRepo(repoA);

	assert.deepEqual(result, { compared: 2, removedAbsent: 1, removedIgnored: 0, notChecked: 0 });
	assert.equal(await exists(gone), false);
	assert.deepEqual(svc.resolverRuns, []);
	assert.equal(await cached(repoA), true);
	assert.equal(svc._armedSettleTimersForTest(), 0);
});

test('a store failure part-way through a clean-up job still drops the cached results and runs the resolver for the files already removed, and the job fails', async () => {
	const keepFile = join(repoA, 'src', 'keep.ts');
	onDisk(keepFile);
	const stale = ['one', 'two', 'three'].map(n => ent(repoA, join(repoA, 'src', `${n}.ts`), 'function', n));
	await upsertEntities(null, [ent(repoA, keepFile, 'function', 'keep'), ...stale]);
	await putCachedExploration(repoA, 1n, EXP, OUTPUT);
	const svc = service();
	// Fail on the LAST stale file the pass reaches, so the others are already removed.
	const order = [...(await listEntityFilesForRepo(null, repoA)).keys()].filter(f => f !== keepFile);
	svc.failRemovalOf = order[order.length - 1] ?? null;

	await assert.rejects(svc.processJob({ kind: 'reconcile', repoPath: repoA }), /store write failed/);

	assert.equal(svc.removed.length, 2, 'two files were removed before the failure');
	assert.deepEqual(svc.resolverRuns, [repoA], 'the resolver still ran for them');
	assert.equal(await cached(repoA), false, 'and the cached results were dropped');

	// The next pass finishes the job: one file left to remove.
	svc.failRemovalOf = null;
	await svc.processJob({ kind: 'reconcile', repoPath: repoA });
	assert.deepEqual([...(await listEntityFilesForRepo(null, repoA)).keys()], [keepFile]);
});

test('a resolver failure after a clean-up fails the job with the cached results already dropped', async () => {
	const gone = ent(repoA, join(repoA, 'src', 'gone.ts'), 'function', 'gone');
	await upsertEntities(null, [gone]);
	await putCachedExploration(repoA, 1n, EXP, OUTPUT);
	const svc = service();
	svc.failResolver = true;

	await assert.rejects(svc.processJob({ kind: 'reconcile', repoPath: repoA }), /resolver failed/);

	assert.equal(await exists(gone), false);
	assert.equal(await cached(repoA), false);
});

test('a clean-up failure inside a full index fails the full index and marks the repository error', async () => {
	onDisk(join(repoA, 'src', 'real.ts'), 'export function hello(): number { return 1; }\n');
	const gone = join(repoA, 'src', 'gone.ts');
	await upsertEntities(null, [ent(repoA, gone, 'function', 'gone')]);
	const svc = service();
	svc.failRemovalOf = gone;

	await assert.rejects(svc.processJob({ kind: 'full', repoPath: repoA }), /store write failed/);

	const row = (await listRepos(null)).find(r => r.path === repoA);
	assert.equal(row?.status, 'error');
});

// ---------------------------------------------------------------------------
// An ignored file does not come back through a file job
// ---------------------------------------------------------------------------

test('a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed', async () => {
	const ignored = join(repoA, 'out', 'gen.ts');
	const real = join(repoA, 'src', 'real.ts');
	const source = 'export function hello(): number { return 1; }\n';
	onDisk(ignored, source); onDisk(real, source);
	const svc = service();
	await svc.addRepo(repoA);   // registers the root with the service; the stand-in watches nothing

	await svc.processJob({ kind: 'file', filePath: ignored, event: 'update' });
	await svc.processJob({ kind: 'file', filePath: ignored, event: 'create' });
	assert.deepEqual(await findEntitiesByFile(null, ignored), []);

	await svc.processJob({ kind: 'file', filePath: real, event: 'update' });
	const indexed = await findEntitiesByFile(null, real);
	assert.ok(indexed.some(e => e.kind === 'function' && e.name === 'hello'), 'the file elsewhere is indexed');

	// A delete for an ignored file still removes what the index holds for it.
	const leftover = ent(repoA, ignored, 'function', 'leftover');
	await upsertEntities(null, [leftover]);
	await svc.processJob({ kind: 'file', filePath: ignored, event: 'delete' });
	assert.equal(await exists(leftover), false);
});

// ---------------------------------------------------------------------------
// When the clean-up runs
// ---------------------------------------------------------------------------

function registered(path: string, status: RegisteredRepo['status'], lastIndexed?: string): RegisteredRepo {
	return { path, name: '', addedAt: NOW, status, ...(lastIndexed !== undefined ? { lastIndexed } : {}) };
}

test('a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready', async () => {
	const realFile = join(repoA, 'src', 'real.ts');
	onDisk(realFile, 'export function hello(): number { return 1; }\n');
	const queue = new RecordingQueue();
	const svc = new ProbeService(db, queue, standInWatcher(), undefined, 600_000);

	// repoA is ready and unchanged since its last index; repoC was never indexed.
	const future = new Date(Date.now() + 3_600_000).toISOString();
	await svc.start([registered(repoA, 'ready', future), registered(repoC, 'pending')]);

	assert.deepEqual(queue.of(repoA), ['reconcile'], 'no changed file, and still one clean-up job');
	assert.deepEqual(queue.of(repoC), ['full'], 'the full index cleans up itself: no separate job');

	// A full index of a repository that holds a stale stored file.
	const stale = ent(repoA, join(repoA, 'src', 'gone.ts'), 'function', 'gone');
	await upsertEntities(null, [stale]);
	const statusAtCleanUp: string[] = [];
	const real = svc.reconcileRepo.bind(svc);
	svc.reconcileRepo = async (repoPath: string) => {
		const row = (await listRepos(null)).find(r => r.path === repoPath);
		statusAtCleanUp.push(row?.status ?? 'missing');
		return real(repoPath);
	};

	await svc.processJob({ kind: 'full', repoPath: repoA });

	assert.deepEqual(statusAtCleanUp, ['indexing'], 'the clean-up ran once, before the repository was marked ready');
	assert.equal(await exists(stale), false);
	assert.ok((await findEntitiesByFile(null, realFile)).some(e => e.name === 'hello'), 'the file on disk is indexed');
	assert.equal((await listRepos(null)).find(r => r.path === repoA)?.status, 'ready');
	// The full index's own resolver run covers the removals: none of the clean-up's, no timer.
	assert.deepEqual(svc.resolverRuns, []);
	assert.equal(svc._armedSettleTimersForTest(), 0);
});

test('a repository left indexing with a last-indexed time gets a clean-up job at daemon start', async () => {
	const queue = new RecordingQueue();
	const svc = new ProbeService(db, queue, standInWatcher(), undefined, 600_000);

	await svc.start([
		registered(repoA, 'indexing', NOW),   // neither re-indexed nor delta-indexed today
		registered(repoC, 'indexing'),        // interrupted before its first checkpoint: full index
	]);

	assert.deepEqual(queue.of(repoA), ['reconcile']);
	assert.deepEqual(queue.of(repoC), ['full']);
});
