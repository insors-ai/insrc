/**
 * Epic c2ba6fa6, Story s2, t10 -- the vector backfill. Through the real
 * IndexerService on a real file and a real temporary vector table: after a
 * commit whose vector write failed, the backfill queued at start writes the
 * vectors, sets the markers and the repository reads complete (ac3); a backend
 * that returns no vectors records embeddingAvailable false without failing the
 * job; listUnembeddedEntities never selects an empty-body entity, an embedded
 * one, or another repository's; each backfill round is one upsert (t11).
 *
 * Run: npx tsx --test src/indexer/__tests__/backfill.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { updateIndexStateRowInTxn } from '../../db/graph/index-state-rows.js';
import { _setVectorWriterForTest, commitFile, findEntitiesByFile, listUnembeddedEntities } from '../../db/entities.js';
import { completenessOf, readIndexState } from '../../db/index-state.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import * as entityVec from '../../db/lance/entity-vec.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, IndexJob, RegisteredRepo } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const DIM = loadLocalProviderConfig().embeddingDim;
const MODEL = loadLocalProviderConfig().embeddingModel;

let dir: string;
let repo: string;
let file: string;
const REG = (): RegisteredRepo => ({ path: repo, name: 'backfill', addedAt: '2026-11-01T00:00:00.000Z', status: 'ready', lastIndexed: '2026-11-01T00:00:00.000Z' }) as RegisteredRepo;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s2-backfill-')));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = join(dir, 'repo');
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, '.gitignore'), '.gitignore\n');
	file = join(repo, 'src', 'a.ts');
	await addRepo(null, REG());
});
test.afterEach(async () => {
	_setVectorWriterForTest(undefined);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const watcher = { onEvents() {}, onFilterRefreshed() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {}, async syncIgnores() {} } as unknown as Watcher;
const vec = (seed: number): number[] => Array.from({ length: DIM }, (_, i) => Math.sin(seed * 17 + i));

/** The real indexer with its embed step replaceable and its queued jobs recorded, not run. */
class BackfillProbe extends IndexerService {
	readonly queued: IndexJob[] = [];
	embedded = 0;
	/** Default: the embed step gives every selected entity a vector, as a reachable backend does. */
	embedStep: (entities: Entity[]) => Promise<void> = async entities => {
		for (const e of entities) if (e.embedding.length === 0 && e.body !== '') { e.embedding = vec(++this.embedded); }
	};
	constructor() {
		const queue = new IndexQueue();
		const queued: IndexJob[] = [];
		queue.enqueue = ((job: IndexJob) => { queued.push(job); }) as typeof queue.enqueue;
		super(null as unknown as DbClient, queue, watcher, undefined, 600_000);
		this.queued = queued;
	}
	protected override async embed(entities: Entity[]): Promise<void> { await this.embedStep(entities); }
}

const SOURCE = 'export function a() { return 1; }\nexport function b() { return a(); }\n';
const markers = async (): Promise<string[]> =>
	(await findEntitiesByFile(null, file)).filter(e => e.body !== '').map(e => e.embeddingModel ?? '');

/** The file indexed with every vector write refused, and the full index recorded as finished. */
async function indexedWithoutVectors(): Promise<void> {
	const svc = new BackfillProbe();
	await svc.addRepo(repo);
	writeFileSync(file, SOURCE);
	const refuse = async (): Promise<never> => { throw new Error('vector store refused the write'); };
	_setVectorWriterForTest({ addEntityEmbeddings: refuse, writeEntityEmbeddings: refuse, writeEntityEmbedding: refuse });
	try { await svc.processJob({ kind: 'file', filePath: file, event: 'update' }); }
	finally { _setVectorWriterForTest(undefined); }
	const repoId = (await lookupRepoId(repo))!;
	await withWriteTxn(s => { updateIndexStateRowInTxn(s, repoId, row => { row.fullIndexFinished = true; }); });
}

test('t10 (ac3): after a commit whose vector write failed, the backfill queued at start writes the vectors, sets the markers and the repository reads complete', async () => {
	await indexedWithoutVectors();
	const before = await readIndexState(repo);
	assert.ok((before?.unembedded ?? 0) > 0, 'the failed vector write left entities unembedded');
	assert.equal(completenessOf(before).complete, false);
	assert.ok((await markers()).every(m => m === ''));

	const svc = new BackfillProbe();
	await svc.start([REG()]);
	const backfill = svc.queued.find(j => j.kind === 'reembed' && j.repoPath === repo);
	assert.ok(backfill, `start queued the backfill: ${JSON.stringify(svc.queued)}`);
	await svc.processJob(backfill);

	const after = await readIndexState(repo);
	assert.equal(after?.unembedded, 0);
	assert.equal(after?.embeddingAvailable, true);
	assert.equal(completenessOf(after).complete, true, completenessOf(after).reasons.join('; '));
	const set = await markers();
	assert.ok(set.length > 0 && set.every(m => m === MODEL), JSON.stringify(set));
});

test('t10: a backend that returns no vectors records embeddingAvailable false and the job does not fail', async () => {
	await indexedWithoutVectors();
	const svc = new BackfillProbe();
	svc.embedStep = async () => {};   // disabled or unreachable: embedEntities no-ops
	await svc.processJob({ kind: 'reembed', repoPath: repo });

	const state = await readIndexState(repo);
	assert.equal(state?.embeddingAvailable, false);
	assert.ok((state?.unembedded ?? 0) > 0, 'nothing was written');
	assert.equal(completenessOf(state).complete, true, 'an unavailable backend is not a reason against completeness');

	// The backend is back: the next backfill writes the vectors and records it available.
	svc.embedStep = new BackfillProbe().embedStep;
	await svc.processJob({ kind: 'reembed', repoPath: repo });
	assert.deepEqual([(await readIndexState(repo))?.unembedded, (await readIndexState(repo))?.embeddingAvailable], [0, true]);
});

test('t10: the backfill is queued after a full index and after a clean-up', async () => {
	const svc = new BackfillProbe();
	await svc.addRepo(repo);
	writeFileSync(file, SOURCE);
	svc.queued.length = 0;
	await svc.processJob({ kind: 'full', repoPath: repo });
	assert.ok(svc.queued.some(j => j.kind === 'reembed' && j.repoPath === repo), `after the full index: ${JSON.stringify(svc.queued)}`);
	svc.queued.length = 0;
	await svc.processJob({ kind: 'reconcile', repoPath: repo });
	assert.ok(svc.queued.some(j => j.kind === 'reembed' && j.repoPath === repo), `after the clean-up: ${JSON.stringify(svc.queued)}`);
});

test('t11: the backfill writes each round\'s vectors with one upsert, never one write per entity (a Lance write is ~25 ms whatever its size)', async () => {
	await indexedWithoutVectors();
	const pending = (await readIndexState(repo))?.unembedded ?? 0;
	assert.ok(pending >= 2, 'more than one entity to write');
	const calls = { upsert: [] as number[], single: 0, add: 0 };
	_setVectorWriterForTest({
		writeEntityEmbeddings: async rows => { calls.upsert.push(rows.length); await entityVec.writeEntityEmbeddings(rows); },
		writeEntityEmbedding: async row => { calls.single++; await entityVec.writeEntityEmbedding(row); },
		addEntityEmbeddings: async rows => { calls.add++; await entityVec.addEntityEmbeddings(rows); },
	});
	await new BackfillProbe().processJob({ kind: 'reembed', repoPath: repo });

	assert.deepEqual(calls, { upsert: [pending], single: 0, add: 0 });
	assert.equal((await readIndexState(repo))?.unembedded, 0);
});

function entity(path: string, name: string, body: string, owner = repo): Entity {
	return {
		id: createHash('sha256').update(`${owner}\x00${path}\x00function\x00${name}`).digest('hex').slice(0, 32),
		kind: 'function', name, language: 'typescript', repoId: 1, repo: owner, file: path,
		startLine: 1, endLine: 2, body, embedding: [], indexedAt: '2026-11-01T00:00:00.000Z',
	};
}

test('t10: listUnembeddedEntities selects the repository\'s entities with a body and no marker -- never an empty body, an embedded entity or another repository\'s', async () => {
	const other = join(dir, 'other');
	await addRepo(null, { ...REG(), path: other, name: 'other' });
	const [stub, waiting, done] = [entity(file, 'stub', ''), entity(file, 'waiting', 'function waiting() {}'), { ...entity(file, 'done', 'function done() {}'), embedding: vec(1) }];
	await commitFile({ repoPath: repo, filePath: file, contentHash: 'h1', entities: [stub, waiting, done], relations: [] });
	const foreign = entity(join(other, 'b.ts'), 'foreign', 'function foreign() {}', other);
	await commitFile({ repoPath: other, filePath: foreign.file, contentHash: 'h1', entities: [foreign], relations: [] });

	const selected = await listUnembeddedEntities(null as unknown as DbClient, repo);
	assert.deepEqual(selected.map(e => e.name), ['waiting']);
	assert.deepEqual(await listUnembeddedEntities(null as unknown as DbClient, join(dir, 'never-registered')), []);
});
