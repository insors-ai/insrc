/**
 * Epic c2ba6fa6, Story s10, t9 -- document relationships in the analyzer.
 * evidenceOrigin's document wording (the caller wording unchanged); the
 * related links of doc.mention hits attached on every executor path -- fresh,
 * an executePlan cache hit, a stepPlan cache hit -- and recomputed for outputs
 * restored on resume, so a measurement that switches proposals off takes
 * effect at once; and a cached context bundle that is stale when the
 * document-relations revision moves.
 *
 * Run: npx tsx --test src/analyze/explore/__tests__/doc-relations-attach.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../../db/graph/store.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, lookupRepoId } from '../../../db/repos.js';
import { findEntitiesByFile } from '../../../db/entities.js';
import { getCachedExploration } from '../../../db/exploration-cache.js';
import { fileEntityHashInTxn, writeDocRelationQualityInTxn, writeDocRelationRowInTxn } from '../../../db/doc-relations.js';
import type { DbClient } from '../../../db/client.js';
import type { Entity } from '../../../shared/types.js';
import { IndexQueue } from '../../../daemon/queue.js';
import type { Watcher } from '../../../indexer/watcher.js';
import { IndexerService } from '../../../indexer/index.js';
import { _overrideDocRelationsSwitchForTest, docRelationsRevision } from '../../../indexer/doc-relations-read.js';
import { executeSavedPlan, stepSavedPlan } from '../../__tests__/fixtures/saved-exploration-executor.js';
import { _getRunnersForTest, _overrideRunnerForTest } from '../executor.js';
import { evidenceOrigin, DOCUMENT_LINK_NOUN } from '../usage-example.js';
import type { DocMentionOutput, Exploration, ExplorationOutput, ExplorationPlan } from '../types.js';
import { docRelationsFresh } from '../../context/driver.js';
import type { AnalyzeContextBundle } from '../../context/types.js';
import { makeEntityId } from '../../../indexer/parser/base.js';

useTemporaryLance();

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
let store: string;
let repo: string;
let svc: IndexerService;
let section: Entity;
let switchState: 'on' | 'off' = 'on';
const savedRunner = _getRunnersForTest()['doc.mention'];

const write = (rel: string, text: string): void => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const fileId = (rel: string): string => makeEntityId(repo, join(repo, rel), 'file', join(repo, rel));
const exp: Exploration = { id: 'd1', type: 'doc.mention', purpose: 'test', params: { subject: 'lexer' } };
const plan: ExplorationPlan = { explorations: [exp] } as unknown as ExplorationPlan;
const run = (extra: Record<string, unknown> = {}) => ({ runId: 'r1', repoPath: repo, closureRepos: [repo], repoLastIndexedAtMs: 1n, plan, ...extra });
/** What the runner returns: a hit on the section, carrying a stale 'related' list that must be replaced. */
const runnerOutput = (): DocMentionOutput => ({
	type: 'doc.mention', subject: 'lexer', completeness: { complete: true } as never,
	hits: [{ entityId: section.id, file: 'docs/a.md', heading: 'A', kind: 'section', score: 1, related: [{ entityId: 'stale', file: 'x', evidence: 'model' }] }],
});
const relatedOf = (out: ExplorationOutput) => (out as DocMentionOutput).hits[0]!.related?.map(r => [r.file, r.evidence]) ?? [];

async function setUp(): Promise<void> {
	write('docs/a.md', '# A\nThe lexer; see [b](b.md).\n');
	write('docs/b.md', '# B\nText.\n');
	write('src/lexer.ts', 'export function lex(): void {}\n');
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'pending' });
	svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'ready' }]);
	section = (await findEntitiesByFile(db, join(repo, 'docs/a.md'))).find(e => e.kind === 'section')!;
	const s = await getGraphStore();
	const repoId = (await lookupRepoId(repo))!;
	await withWriteTxn(t => writeDocRelationRowInTxn(t, repoId, 'docs/a.md', {
		contentHash: fileEntityHashInTxn(s, repo, 'docs/a.md')!, modelId: 'm1', computedAtGeneration: 1,
		proposals: [{ from: section.id, to: fileId('src/lexer.ts'), rationale: 'names the lexer' }],
	}));
	_overrideDocRelationsSwitchForTest(() => ({ state: switchState, modelId: 'm1' }));
	_overrideRunnerForTest('doc.mention', async () => runnerOutput());
}

test.beforeEach(async () => {
	await closeGraphStore();
	switchState = 'on';
	store = mkdtempSync(join(tmpdir(), 'insrc-s10-t9-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-t9-repo-')));
});
test.afterEach(async () => {
	_overrideDocRelationsSwitchForTest(undefined);
	_overrideRunnerForTest('doc.mention', savedRunner);
	svc?.disposeSubsystemScheduler();
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

test('s10 t9: evidenceOrigin document noun and unchanged default wording', () => {
	// The caller wording, byte for byte.
	assert.equal(evidenceOrigin([]).note, 'No callers are listed.');
	assert.equal(evidenceOrigin(['unknown']).note, 'The origin of the listed caller is unknown: its relationship was stored before the index recorded how relationships are established, so none is known to be read from the source.');
	assert.equal(evidenceOrigin(['unknown', 'unknown']).note, 'The origin of all 2 listed callers is unknown: their relationships were stored before the index recorded how relationships are established, so none is known to be read from the source.');
	assert.equal(evidenceOrigin(['extracted', 'model', 'inferred']).note, '1 of 3 listed callers read directly from the source; 1 of 3 listed callers inferred by resolution across files; 1 of 3 listed callers proposed by a model.');
	// The document wording.
	assert.equal(evidenceOrigin([], DOCUMENT_LINK_NOUN).note, 'No related document links are listed.');
	assert.equal(evidenceOrigin(['extracted', 'model', 'model', 'model', 'model'], DOCUMENT_LINK_NOUN).note, '1 of 5 related document links read directly from the source; 4 of 5 related document links proposed by a model.');
	assert.equal(evidenceOrigin(['model'], DOCUMENT_LINK_NOUN).note, '1 of 1 related document link proposed by a model.');
});

test('s10 t9: attachDocRelations on fresh, executePlanWithContext and stepPlanWithContext hits', async () => {
	await setUp();
	// Fresh: the runner's stale list is replaced by the store's links, the proposal included while on.
	const fresh = await executeSavedPlan(run());
	assert.equal(fresh.results[0]!.cached, false);
	assert.deepEqual(relatedOf(fresh.results[0]!.output).sort(), [['docs/b.md', 'extracted'], ['src/lexer.ts', 'model']]);
	assert.match((fresh.results[0]!.output as DocMentionOutput).relatedOrigin!, /1 of 2 related document links proposed by a model/);
	assert.match((fresh.results[0]!.output as DocMentionOutput).relatedStale!, /computed from an older index \(generation 1; the index is now at generation \d+\)/);
	// The cache holds the runner's output without anything attached.
	const cachedRow = await getCachedExploration(repo, 1n, exp);
	assert.ok(cachedRow !== null);
	assert.equal((cachedRow as DocMentionOutput).relatedOrigin, undefined);

	// A measurement switches proposals off: both executors' cache hits drop the model link.
	switchState = 'off';
	const hit = await executeSavedPlan(run());
	assert.equal(hit.results[0]!.cached, true, 'served from the cache');
	assert.deepEqual(relatedOf(hit.results[0]!.output), [['docs/b.md', 'extracted']]);
	const stepped = await stepSavedPlan(run());
	assert.equal(stepped.kind, 'done');
	if (stepped.kind === 'done') {
		assert.equal(stepped.executed.results[0]!.cached, true);
		assert.deepEqual(relatedOf(stepped.executed.results[0]!.output), [['docs/b.md', 'extracted']]);
	}
	// Switched back on, without clearing the cache.
	switchState = 'on';
	assert.deepEqual(relatedOf((await executeSavedPlan(run())).results[0]!.output).sort(), [['docs/b.md', 'extracted'], ['src/lexer.ts', 'model']]);
});

test('s10 t9: resume of a paused step recomputes related links', async () => {
	await setUp();
	const first = await executeSavedPlan(run());
	const carried = first.results[0]!;
	assert.deepEqual(relatedOf(carried.output).sort(), [['docs/b.md', 'extracted'], ['src/lexer.ts', 'model']], 'the paused output carried the proposal');
	switchState = 'off';
	const resumed = await stepSavedPlan(run({ resumeState: { results: [carried], outputs: [{ id: exp.id, output: carried.output }], totalCached: 0, totalMsSoFar: 0 } }));
	assert.equal(resumed.kind, 'done');
	if (resumed.kind === 'done') {
		assert.deepEqual(relatedOf(resumed.executed.results[0]!.output), [['docs/b.md', 'extracted']], 'the restored result is recomputed');
		assert.equal(resumed.executed.results.length, 1, 'the restored exploration is not run again');
	}
});

test('s10 t9: bundle cache stale by docRelationsRevision', async () => {
	await setUp();
	_overrideDocRelationsSwitchForTest(undefined);
	const driver = readFileSync(new URL('../../context/driver.ts', import.meta.url), 'utf8');
	assert.match(driver, /if \(current !== undefined && isStaleByIndexer\(bundle, current\)\) return false;\n\treturn docRelationsFresh\(bundle\);/, 'servedFromCache applies the check');
	const bundleAt = async (): Promise<AnalyzeContextBundle> => ({ meta: { repoPath: repo, docRelationsRevision: await docRelationsRevision(repo) } } as unknown as AnalyzeContextBundle);
	const repoId = (await lookupRepoId(repo))!;

	let b = await bundleAt();
	assert.equal(await docRelationsFresh(b), true, 'fresh when nothing changed');
	assert.equal(await docRelationsFresh({ meta: { repoPath: repo } } as unknown as AnalyzeContextBundle), false, 'a bundle written before the revision was recorded');
	assert.equal(await docRelationsFresh({ meta: { repoPath: null } } as unknown as AnalyzeContextBundle), true, 'a bundle over no repository keeps the old rule');

	// A measurement.
	await withWriteTxn(t => writeDocRelationQualityInTxn(t, repoId, { figures: { checked: 100, proposed: 1, right: 1, found: 1, precision: 1, recall: 1, extractedRecovery: 1, modelId: 'm1', setHash: 'h', measuredAt: 'x' }, extraction: { state: 'ok', examined: 1, failed: 0, updatedAt: 'x' } }));
	assert.equal(await docRelationsFresh(b), false, 'after a measurement');
	b = await bundleAt();
	// A publication.
	await withWriteTxn(t => writeDocRelationRowInTxn(t, repoId, 'docs/b.md', { contentHash: 'h', modelId: 'm1', computedAtGeneration: 2, proposals: [] }));
	assert.equal(await docRelationsFresh(b), false, 'after a publication');
	b = await bundleAt();
	// An endpoint deleted, before any derived pass runs.
	unlinkSync(join(repo, 'src/lexer.ts'));
	await svc.processJob({ kind: 'file', filePath: join(repo, 'src/lexer.ts'), event: 'delete' });
	assert.equal(await docRelationsFresh(b), false, 'after an endpoint deletion');
	b = await bundleAt();
	// A second file of a name.
	write('lib/b.md', '# Another b\nText.\n');
	await svc.processJob({ kind: 'file', filePath: join(repo, 'lib/b.md'), event: 'create' });
	assert.equal(await docRelationsFresh(b), false, 'after a second same-named file');
});
