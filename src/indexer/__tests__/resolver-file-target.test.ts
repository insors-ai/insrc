/**
 * Epic c2ba6fa6, Story s1, t5 -- the indexer's writers name their repository
 * and file, and an import of a missing file is classed.
 *
 * Run: npx tsx --test src/indexer/__tests__/resolver-file-target.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { readUnattributedUnwritableInTxn, putIndexStateRowInTxn } from '../../db/graph/index-state-rows.js';
import { emptyIndexStateRow } from '../../db/graph/pending-class.js';
import { decodeUnresolvedRow } from '../../db/graph/codec.js';
import { upsertEntities } from '../../db/entities.js';
import { readIndexState } from '../../db/index-state.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import { deleteUnresolvedForFile, deleteUnresolvedForRepo, upsertRelations } from '../../db/relations.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, Relation } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { makeEntityId } from '../parser/base.js';
import { resolveRelations } from '../resolver.js';
import { rewireImportRelation } from '../cross-file-resolver.js';
import { IndexerService } from '../index.js';

useTemporaryLance();

let dir: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-file-target-store-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-file-target-repo-')));
	mkdirSync(join(repo, 'src'));
	writeFileSync(join(repo, 'src', 'a.ts'), "import { b } from './b';\nimport './missing.js';\nexport function a() { b(); }\n");
	writeFileSync(join(repo, 'src', 'b.ts'), 'export function b() {}\n');
	writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { 'left-pad': '^1.0.0' } }));
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-10-16T00:00:00.000Z', status: 'ready' });
	const repoId = (await lookupRepoId(repo))!;
	await withWriteTxn(s => { putIndexStateRowInTxn(s, repoId, { ...emptyIndexStateRow(), fullIndexFinished: true }); });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

test('a relative import of a missing file is no-candidate with reason target-file-missing; one of an existing file resolves to its file id with meta.repo', async () => {
	const file = join(repo, 'src', 'a.ts');
	const fileId = makeEntityId(repo, file, 'file', file);
	const rels: Relation[] = [
		{ kind: 'IMPORTS', from: fileId, to: './b', resolved: false, meta: { file, repo, isRelative: true } },
		{ kind: 'IMPORTS', from: fileId, to: './missing.js', resolved: false, meta: { file, repo, isRelative: true } },
		{ kind: 'IMPORTS', from: fileId, to: 'npm-stub-id', resolved: true },                // already resolved by the parser
	];
	const [b, missing, stub] = resolveRelations(rels, file, repo);
	const bFile = join(repo, 'src', 'b.ts');
	assert.deepEqual({ to: b!.to, resolved: b!.resolved, repo: b!.meta?.['repo'] }, { to: makeEntityId(repo, bFile, 'file', bFile), resolved: true, repo });
	assert.equal(missing!.resolved, false);
	assert.equal(missing!.meta?.['class'], 'no-candidate');
	assert.equal(missing!.meta?.['reason'], 'target-file-missing');
	assert.equal(stub!.meta?.['repo'], repo, 'every resolved relation names its repository');

	// Stored, the missing import counts as no-candidate, not as awaiting a target.
	await upsertEntities(null, [{ id: fileId, kind: 'file', name: file, language: 'typescript', repoId: 1, repo, file, startLine: 1, endLine: 3, body: '', embedding: [], indexedAt: '2026-10-16T00:00:00.000Z' } as Entity]);
	await upsertRelations(null, [missing!]);
	const state = (await readIndexState(repo))!;
	assert.equal(state.pending['no-candidate'], 1);
	assert.equal(state.pending['awaiting-target'], 0);
	assert.equal(state.complete, true, 'a missing-file import does not make the repository incomplete');
});

test('a refused DEPENDS_ON from the manifest step is counted against the repository, not the unattributed counter', async () => {
	class NoQueue extends IndexQueue { override enqueue(): void { /* not run */ } }
	const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
	const svc = new IndexerService(null as unknown as DbClient, new NoQueue(), watcher, undefined, 600_000);
	// The repository entity is not stored, so each DEPENDS_ON from it is refused (source missing).
	await (svc as unknown as { indexManifest(repoPath: string): Promise<void> }).indexManifest(repo);
	const state = (await readIndexState(repo))!;
	assert.equal(state.unwritable, 1);
	assert.deepEqual(state.reasonCounts.unwritable, { 'source-missing': 1 });
	assert.deepEqual(readUnattributedUnwritableInTxn(await getGraphStore()), { total: 0, reasons: {} });
});

test('a DEPENDS_ON kept awaiting (manifest meta: repo and file are the repository path) is removed only by deleteUnresolvedForRepo', async () => {
	const repoEntityId = makeEntityId(repo, '', 'repo', repo);
	await upsertEntities(null, [{ id: repoEntityId, kind: 'repo', name: repo, language: 'typescript', repoId: 1, repo, file: '', startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: '2026-10-16T00:00:00.000Z' } as unknown as Entity]);
	// The same relation the manifest step writes, to a module that is not stored.
	await upsertRelations(null, [{ kind: 'DEPENDS_ON', from: repoEntityId, to: 'no-such-module', resolved: true, meta: { repo, file: repo } }]);
	const rows = [...(await getGraphStore()).unresolved.getRange()].map(({ value }) => decodeUnresolvedRow(value as Buffer));
	assert.equal(rows.length, 1);
	assert.equal(rows[0]!.fromFile, repo);

	await deleteUnresolvedForFile(null, join(repo, 'src', 'a.ts'));
	await deleteUnresolvedForFile(null, join(repo, 'package.json'));
	assert.equal([...(await getGraphStore()).unresolved.getRange()].length, 1, 'a file delete leaves it');
	await deleteUnresolvedForRepo(null, repo);
	assert.equal([...(await getGraphStore()).unresolved.getRange()].length, 0, 'the repository delete removes it');
	assert.equal((await readIndexState(repo))!.pending['awaiting-target'], 0);
});

test('a Pass 1 rewire carries the repository and the importing file\'s absolute path', () => {
	const file = join(repo, 'src', 'a.ts');
	const byId = new Map<string, Entity>([['f1', { id: 'f1', kind: 'file', file } as Entity]]);
	assert.deepEqual(
		rewireImportRelation({ fromId: 'f1', oldModuleId: 'm', targetFileId: 't' }, repo, byId),
		{ kind: 'IMPORTS', from: 'f1', to: 't', resolved: true, meta: { repo, file } },
	);
});
