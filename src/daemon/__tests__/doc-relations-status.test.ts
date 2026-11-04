/**
 * Epic c2ba6fa6, Story s10, t10 -- the document-relations status where status
 * is read. The doc-relations pass (as the summary worker runs it) persists its
 * extraction state in the store; withCompleteness -- the one function behind
 * repo.list, repo.stats and the indexing worker's status-board store slot --
 * reads it beside completeness, and completeness itself does not change.
 *
 * Run: npx tsx --test src/daemon/__tests__/doc-relations-status.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, listRepos, lookupRepoId } from '../../db/repos.js';
import { writeDocRelationQualityInTxn } from '../../db/doc-relations.js';
import type { DbClient } from '../../db/client.js';
import { IndexQueue } from '../queue.js';
import type { Watcher } from '../../indexer/watcher.js';
import { IndexerService } from '../../indexer/index.js';
import { runDocRelationsPass } from '../../indexer/doc-relations-pass.js';
import { collectRepoStats } from '../repo-stats.js';
import { completenessFor, withCompleteness } from '../repo-completeness.js';

useTemporaryLance();

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
let store: string;
let repo: string;
let svc: IndexerService;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s10-t10-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-t10-repo-')));
	for (const [rel, text] of Object.entries({ 'docs/a.md': '# A\nSee [b](b.md).\n', 'docs/b.md': '# B\nText.\n' })) {
		mkdirSync(dirname(join(repo, rel)), { recursive: true });
		writeFileSync(join(repo, rel), text);
	}
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'pending' });
	svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
});
test.afterEach(async () => {
	svc.disposeSubsystemScheduler();
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

test('s10 t10: repo.stats and the status board read the persisted docRelations status', async () => {
	const before = await completenessFor(repo);
	assert.ok(before !== undefined, 'completeness is read');

	// The pass, as the summary worker runs it, finds no CLI provider: it persists the cause.
	await runDocRelationsPass({ repoPath: repo, select: () => ({ ok: false, reason: 'the mid tier runs ollama, which is not a CLI provider' }) });

	// repo.list / the status board's store slot: withCompleteness over the registry.
	const [listed] = await withCompleteness(await listRepos(db), r => r.path);
	assert.equal(listed!.docRelations?.switch, 'not-measured');
	assert.equal(listed!.docRelations?.extraction?.state, 'unavailable');
	assert.equal(listed!.docRelations?.extraction?.reason, 'the mid tier runs ollama, which is not a CLI provider');
	assert.deepEqual(listed!.completeness, before, 'completeness is unchanged by the document-relations state');

	// repo.stats: the same function over collectRepoStats, as the handler builds its reply.
	const [stats] = await withCompleteness(await collectRepoStats(await getGraphStore(), await listRepos(db), { depthForRepo: () => 0 }), s => s.repoPath);
	assert.deepEqual(stats!.docRelations, listed!.docRelations);
	assert.deepEqual(stats!.completeness, before);

	// Measured figures appear in both, and completeness still does not move.
	await withWriteTxn(t => writeDocRelationQualityInTxn(t, (repoId), {
		figures: { checked: 110, proposed: 72, right: 70, found: 70, precision: 70 / 72, recall: 70 / 110, extractedRecovery: 1, modelId: 'm1', setHash: 'h', measuredAt: 'x' },
		extraction: { state: 'ok', examined: 2, failed: 0, updatedAt: 'x' },
	}));
	const [measured] = await withCompleteness(await listRepos(db), r => r.path);
	assert.equal(measured!.docRelations?.figures?.checked, 110);
	assert.equal(measured!.docRelations?.switch, 'off', 'figures for a model and set that do not run now read off');
	assert.deepEqual(measured!.completeness, before);

	// Both daemon readers build their rows through withCompleteness.
	const runtime = readFileSync(new URL('../handler-runtime.ts', import.meta.url), 'utf8');
	assert.match(runtime, /'repo\.stats': async[\s\S]{0,300}withCompleteness\(await collectRepoStats\(/);
	const worker = readFileSync(new URL('../threads/indexing-worker.ts', import.meta.url), 'utf8');
	assert.match(worker, /function publishStore[\s\S]{0,600}repos: await withCompleteness\(await listRepos\(db\)/);
});

let repoId: number;
test.beforeEach(async () => { repoId = (await lookupRepoId(repo))!; });
