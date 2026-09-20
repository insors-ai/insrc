/**
 * Story add-new-repo-stats-daemon-ipc / S001.
 *   unit(buildRepoStats)        — pure aggregation over in-memory rows.
 *   integration(collectRepoStats) — over a real tmpdir graph store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildRepoStats, collectRepoStats, type RepoStatsEntity } from '../repo-stats.js';
import { IndexQueue } from '../queue.js';
import type { RegisteredRepo } from '../../shared/types.js';
import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { encodeEntityKey, encodeOutEdgeKey, RELATION_KIND_BYTE } from '../../db/graph/keys.js';
import { encodeEntityRow, type EntityRow } from '../../db/graph/codec.js';

const A = '/work/repoA';
const B = '/work/repoB';

function repo(path: string, over: Partial<RegisteredRepo> = {}): RegisteredRepo {
	return { kind: 'workspace', path, name: path.split('/').pop() ?? '', addedAt: 'T0', status: 'ready', ...over };
}

// ---- unit: buildRepoStats (pure) ------------------------------------------

test('buildRepoStats: fileCount is distinct files; filesByLanguage counts a mixed-language file in each bucket', () => {
	const entities: RepoStatsEntity[] = [
		{ repo: A, file: `${A}/x.ts`, kind: 'function', language: 'typescript' },
		{ repo: A, file: `${A}/x.ts`, kind: 'class', language: 'typescript' }, // same file, still 1 distinct
		{ repo: A, file: `${A}/y.md`, kind: 'document', language: 'markdown' },
		{ repo: A, file: `${A}/y.md`, kind: 'function', language: 'typescript' }, // mixed-language file
	];
	const [a] = buildRepoStats({
		entities, relationSourceRepos: [], registeredRepos: [repo(A)],
		sizeOf: () => 0, pendingFor: () => 0,
	});
	assert.equal(a.fileCount, 2, 'x.ts + y.md distinct');
	assert.deepEqual(a.filesByLanguage, { typescript: 2, markdown: 1 }, 'y.md counts under both ts and md');
});

test('buildRepoStats: entityCount total + entityCountByKind grouped by EntityKind', () => {
	const entities: RepoStatsEntity[] = [
		{ repo: A, file: `${A}/x.ts`, kind: 'function', language: 'typescript' },
		{ repo: A, file: `${A}/x.ts`, kind: 'function', language: 'typescript' },
		{ repo: A, file: `${A}/x.ts`, kind: 'class', language: 'typescript' },
	];
	const [a] = buildRepoStats({
		entities, relationSourceRepos: [], registeredRepos: [repo(A)],
		sizeOf: () => 0, pendingFor: () => 0,
	});
	assert.equal(a.entityCount, 3);
	assert.deepEqual(a.entityCountByKind, { function: 2, class: 1 });
});

test('buildRepoStats: relationCount is per-repo; a source-repo not registered and a repo with 0 source are ignored', () => {
	const [a, b] = buildRepoStats({
		entities: [], registeredRepos: [repo(A), repo(B)],
		relationSourceRepos: [A, A, B, '/work/ghost'], // ghost is unregistered -> ignored
		sizeOf: () => 0, pendingFor: () => 0,
	});
	assert.equal(a.relationCount, 2);
	assert.equal(b.relationCount, 1);
});

test('buildRepoStats: registry fields verbatim; a never-indexed registered repo yields a zero-count RepoStats (present)', () => {
	const [a] = buildRepoStats({
		entities: [], relationSourceRepos: [], sizeOf: () => 0, pendingFor: () => 0,
		registeredRepos: [repo(A, { status: 'pending', addedAt: 'T7', errorMsg: 'boom' })],
	});
	assert.equal(a.repoPath, A);
	assert.equal(a.status, 'pending');
	assert.equal(a.addedAt, 'T7');
	assert.equal(a.errorMsg, 'boom');
	assert.equal(a.lastIndexed, undefined);
	assert.deepEqual(
		{ fileCount: a.fileCount, entityCount: a.entityCount, relationCount: a.relationCount, sizeBytes: a.sizeBytes },
		{ fileCount: 0, entityCount: 0, relationCount: 0, sizeBytes: 0 },
	);
	assert.deepEqual(a.filesByLanguage, {});
	assert.deepEqual(a.entityCountByKind, {});
});

test('buildRepoStats: sizeBytes = injected sizeOf; pendingJobs = injected pendingFor', () => {
	const [a] = buildRepoStats({
		entities: [{ repo: A, file: `${A}/x.ts`, kind: 'function', language: 'typescript' }],
		relationSourceRepos: [], registeredRepos: [repo(A)],
		sizeOf: (p, files) => (p === A ? files.size * 100 : -1),
		pendingFor: (p) => (p === A ? 5 : -1),
	});
	assert.equal(a.sizeBytes, 100);
	assert.equal(a.pendingJobs, 5);
});

test('buildRepoStats: an unregistered-repo entity row is ignored; empty inputs give all-zero RepoStats per repo', () => {
	const stats = buildRepoStats({
		entities: [{ repo: '/work/ghost', file: '/work/ghost/x.ts', kind: 'function', language: 'typescript' }],
		relationSourceRepos: [], registeredRepos: [repo(A), repo(B)],
		sizeOf: () => 0, pendingFor: () => 0,
	});
	assert.equal(stats.length, 2);
	assert.equal(stats[0].entityCount, 0);
	assert.equal(stats[1].entityCount, 0);
});

// ---- integration: collectRepoStats over a real tmpdir store ---------------

let dir: string;
let ra: string;
let rb: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-repo-stats-'));
	ra = join(dir, 'repoA');
	rb = join(dir, 'repoB');
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function entRow(rootPath: string, filePath: string, kind: EntityRow['kind'], language: EntityRow['language']): EntityRow {
	return {
		repoId: 1, kind, name: `${filePath}:${kind}`, filePath, startLine: 0, endLine: 0,
		language, rootPath, body: '', signature: '', summary: '',
		isExported: false, isAsync: false, isAbstract: false, artifact: false,
		contentHash: '', embeddingModel: '', indexedAt: 0,
	};
}

test('collectRepoStats: per-repo counts + cross-repo edge attributed to its source repo + best-effort size', async () => {
	await getGraphStore();

	// Real source files for sizing: repoA/a.ts (10 bytes) + repoA/b.py (3 bytes);
	// repoB/c.ts is indexed as an entity but left UNwritten on disk (best-effort 0).
	mkdirSync(ra, { recursive: true });
	mkdirSync(rb, { recursive: true });
	writeFileSync(join(ra, 'a.ts'), '0123456789');       // 10 bytes
	writeFileSync(join(ra, 'b.py'), 'abc');              // 3 bytes

	// Entities: 1,2 -> repoA/a.ts (fn+class, ts); 3 -> repoA/b.py (fn, python);
	//           4 -> repoB/c.ts (fn, ts, file NOT written).
	await withWriteTxn(s => {
		s.entity.put(encodeEntityKey(1n), encodeEntityRow(entRow(ra, 'a.ts', 'function', 'typescript')));
		s.entity.put(encodeEntityKey(2n), encodeEntityRow(entRow(ra, 'a.ts', 'class', 'typescript')));
		s.entity.put(encodeEntityKey(3n), encodeEntityRow(entRow(ra, 'b.py', 'function', 'python')));
		s.entity.put(encodeEntityKey(4n), encodeEntityRow(entRow(rb, 'c.ts', 'function', 'typescript')));
		// Edges: 1->2 within repoA; 4->1 cross-repo (source in repoB).
		s.outEdge.put(encodeOutEdgeKey(1n, RELATION_KIND_BYTE['CALLS'], 2n), Buffer.alloc(0));
		s.outEdge.put(encodeOutEdgeKey(4n, RELATION_KIND_BYTE['DEPENDS_ON'], 1n), Buffer.alloc(0));
	});

	const store = await getGraphStore();
	const stats = collectRepoStats(store, [repo(ra), repo(rb)], new IndexQueue());
	const byPath = new Map(stats.map(s => [s.repoPath, s]));

	const a = byPath.get(ra)!;
	assert.equal(a.fileCount, 2, 'a.ts + b.py');
	assert.deepEqual(a.filesByLanguage, { typescript: 1, python: 1 });
	assert.equal(a.entityCount, 3);
	assert.deepEqual(a.entityCountByKind, { function: 2, class: 1 });
	assert.equal(a.relationCount, 1, 'the 1->2 within-repo edge');
	assert.equal(a.sizeBytes, 13, '10 + 3 on-disk bytes');
	assert.equal(a.pendingJobs, 0);

	const b = byPath.get(rb)!;
	assert.equal(b.fileCount, 1);
	assert.deepEqual(b.filesByLanguage, { typescript: 1 });
	assert.equal(b.entityCount, 1);
	assert.equal(b.relationCount, 1, 'the cross-repo 4->1 edge attributed to its SOURCE repo B');
	assert.equal(b.sizeBytes, 0, 'c.ts was never written to disk — best-effort 0, no throw');
});
