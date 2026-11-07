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

import './helpers/mid-tier-home.js';   // first: a known mid tier for the computed switch
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../../db/graph/store.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, lookupRepoId } from '../../../db/repos.js';
import { findEntitiesByFile } from '../../../db/entities.js';
import { getCachedExploration } from '../../../db/exploration-cache.js';
import { cacheExplorationFor } from '../exploration-cache-key.js';
import { fileEntityHashInTxn, writeDocRelationQualityInTxn, writeDocRelationRowInTxn } from '../../../db/doc-relations.js';
import type { DbClient } from '../../../db/client.js';
import type { Entity } from '../../../shared/types.js';
import { IndexQueue } from '../../../daemon/queue.js';
import type { Watcher } from '../../../indexer/watcher.js';
import { IndexerService } from '../../../indexer/index.js';
import { DOC_RELATIONS_SET_FILE, docRelationsSetHash } from '../../../indexer/doc-relations-read.js';
import { validatedDocRelationsModel } from '../../../indexer/doc-relations-provider.js';
import { loadAnalyzeConfig } from '../../../config/analyze.js';
import { executeSavedPlan, stepSavedPlan } from '../../__tests__/fixtures/saved-exploration-executor.js';
import { _getRunnersForTest, _overrideNarrowRunnerForTest, _overrideRunnerForTest, getNarrowRunner } from '../executor.js';
import { evidenceOrigin, DOCUMENT_LINK_NOUN } from '../usage-example.js';
import type { DocMentionOutput, Exploration, ExplorationOutput, ExplorationPlan } from '../types.js';
import { makeEntityId } from '../../../indexer/parser/base.js';

useTemporaryLance();

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
let store: string;
let repo: string;
let svc: IndexerService;
let section: Entity;
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
		contentHash: fileEntityHashInTxn(s, repo, 'docs/a.md')!, modelId: (validatedDocRelationsModel(loadAnalyzeConfig(), repo) as { model: { id: string } }).model.id, computedAtGeneration: 1,
		proposals: [{ from: section.id, to: fileId('src/lexer.ts'), rationale: 'names the lexer' }],
	}));
	write(DOC_RELATIONS_SET_FILE, JSON.stringify({ links: [] }));
	_overrideRunnerForTest('doc.mention', async () => runnerOutput());
	await measured(0.96);   // switched on by a real measurement row
}

/** Record a measurement: figures for the validated mid-tier model and the current set, at the given precision. */
async function measured(precision: number): Promise<void> {
	const model = validatedDocRelationsModel(loadAnalyzeConfig(), repo);
	assert.ok(model.ok, 'the test HOME names a CLI mid tier');
	const repoId = (await lookupRepoId(repo))!;
	await withWriteTxn(t => writeDocRelationQualityInTxn(t, repoId, {
		figures: { checked: 100, proposed: 100, right: Math.round(precision * 100), found: 70, precision, recall: 0.7, extractedRecovery: 1, modelId: model.model.id, setHash: docRelationsSetHash(repo)!, measuredAt: '2026-11-04T00:00:00.000Z' },
		extraction: { state: 'ok', examined: 1, failed: 0, updatedAt: '2026-11-04T00:00:00.000Z' },
	}));
}

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s10-t9-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-t9-repo-')));
});
test.afterEach(async () => {
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
	const cachedRow = await getCachedExploration(repo, 1n, cacheExplorationFor(exp, undefined));
	assert.ok(cachedRow !== null);
	assert.equal((cachedRow as DocMentionOutput).relatedOrigin, undefined);

	// A new measurement below the bar switches proposals off: both executors' cache hits drop the model link.
	await measured(0.5);
	const hit = await executeSavedPlan(run());
	assert.equal(hit.results[0]!.cached, true, 'served from the cache');
	assert.deepEqual(relatedOf(hit.results[0]!.output), [['docs/b.md', 'extracted']]);
	const stepped = await stepSavedPlan(run());
	assert.equal(stepped.kind, 'done');
	if (stepped.kind === 'done') {
		assert.equal(stepped.executed.results[0]!.cached, true);
		assert.deepEqual(relatedOf(stepped.executed.results[0]!.output), [['docs/b.md', 'extracted']]);
	}
	// Switched back on by another measurement, without clearing the cache.
	await measured(0.96);
	assert.deepEqual(relatedOf((await executeSavedPlan(run())).results[0]!.output).sort(), [['docs/b.md', 'extracted'], ['src/lexer.ts', 'model']]);
});

test('s10 t9: resume of a paused step recomputes related links', async () => {
	await setUp();
	// A plan that pauses after doc.mention at a narrow lookup, and a third lookup that reads doc.mention's output.
	const narrowExp: Exploration = { id: 'n1', type: 'doc.decision.trace', purpose: 'test', params: { topic: 'lexer' } };
	const readerExp: Exploration = { id: 'c1', type: 'concept.resolve', purpose: 'test', params: { query: 'lexer' }, dependsOn: ['d1'] } as Exploration;
	const pausing: ExplorationPlan = { explorations: [exp, narrowExp, readerExp] } as unknown as ExplorationPlan;
	const savedNarrow = getNarrowRunner('doc.decision.trace');
	const savedReader = _getRunnersForTest()['concept.resolve'];
	let seenByReader: ExplorationOutput | undefined;
	_overrideNarrowRunnerForTest('doc.decision.trace', {
		schema: { type: 'object' },
		async prepare() { return { kind: 'narrow-llm', systemPrompt: 's', userTurn: 'u', schema: { type: 'object' }, prepared: {} }; },
		finalize: () => ({ type: 'doc.decision.trace', topic: 'lexer', decisions: [], completeness: { complete: true } } as unknown as ExplorationOutput),
	});
	_overrideRunnerForTest('concept.resolve', async (_e, ctx) => { seenByReader = ctx.readDep('d1'); return { type: 'concept.resolve', query: 'lexer', candidates: [], completeness: { complete: true } } as unknown as ExplorationOutput; });
	try {
		const paused = await stepSavedPlan(run({ plan: pausing }));
		assert.equal(paused.kind, 'pending', 'the step paused at the narrow lookup');
		if (paused.kind !== 'pending') return;
		const carried = paused.resumeState.outputs.find(o => o.id === 'd1')!.output;
		assert.deepEqual(relatedOf(carried).sort(), [['docs/b.md', 'extracted'], ['src/lexer.ts', 'model']], 'the paused output carried the proposal');

		// While paused, a measurement switches proposals off. The narrow answer arrives and the step resumes.
		await measured(0.5);
		const finalized = getNarrowRunner('doc.decision.trace')!.finalize({}, {}, 'r1');
		const resumeState = {
			...paused.resumeState,
			results: [...paused.resumeState.results, { exploration: narrowExp, output: finalized, cached: false, elapsedMs: 0 }],
			outputs: [...paused.resumeState.outputs, { id: narrowExp.id, output: finalized }],
		};
		const resumed = await stepSavedPlan(run({ plan: pausing, resumeState }));
		assert.equal(resumed.kind, 'done');
		if (resumed.kind !== 'done') return;
		const restored = resumed.executed.results.find(r => r.exploration.id === 'd1')!;
		assert.deepEqual(relatedOf(restored.output), [['docs/b.md', 'extracted']], 'the restored result is recomputed');
		assert.deepEqual(relatedOf(seenByReader!), [['docs/b.md', 'extracted']], 'and so is the restored output a later lookup reads');
	} finally {
		_overrideNarrowRunnerForTest('doc.decision.trace', savedNarrow);
		_overrideRunnerForTest('concept.resolve', savedReader);
	}
});
