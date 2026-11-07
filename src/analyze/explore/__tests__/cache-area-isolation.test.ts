/**
 * Consecutive same-question requests on different modules do not share a
 * cache entry (Story 65b643840a294422/s1, task t12): on the one-shot
 * executor, the step executor and the narrow phase's write, including
 * capability.reuse-check. A row keyed the old way (no area) is not read.
 * Real graph store and cache; no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getCachedExploration, putCachedExploration } from '../../../db/exploration-cache.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { handleAnalyzeStep } from '../../../daemon/steps/analyze-step/handler.js';
import { encodeState, STATE_VERSION, type StepStatePayload } from '../../../daemon/steps/analyze-step/state.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import { resolveScopeForTarget, type ResolvedScope } from '../../context/scope.js';
import type { Entity } from '../../../shared/types.js';
import { executeSavedPlan, stepSavedPlan } from '../../__tests__/fixtures/saved-exploration-executor.js';
import { cacheExplorationFor } from '../exploration-cache-key.js';
import { _getRunnersForTest, _overrideRunnerForTest } from '../executor.js';
import type { ConceptResolveOutput, Exploration, ExplorationPlan } from '../types.js';
import '../../../workflow/__tests__/helpers/converted-repos.js';

let sandbox: string;
let repo: string;
const file = (...parts: string[]): string => join(repo, ...parts);
const LAST = 5n;

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'cache-area-isolation-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	for (const dir of ['src/pay', 'src/billing']) mkdirSync(join(repo, dir), { recursive: true });
	const files = ['src/pay/pay.ts', 'src/billing/bill.ts'];
	for (const f of files) writeFileSync(join(repo, f), '');
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	const fileEntity = (f: string): Record<string, unknown> => ({ id: `f-${f}`, repo, file: file(f), kind: 'file', name: f.split('/').pop(), language: 'typescript', startLine: 1, endLine: 1 });
	const fn = (id: string, f: string, name: string): Record<string, unknown> => ({ id, repo, file: file(f), kind: 'function', name, language: 'typescript', startLine: 1, endLine: 2 });
	await upsertEntities(null, [
		...files.map(fileEntity),
		fn('e-pay', 'src/pay/pay.ts', 'handlePayment'),
		fn('e-bill', 'src/billing/bill.ts', 'handleBilling'),
	] as unknown as Entity[]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

const exp = (id: string, type: string, params: Record<string, unknown>): Exploration => ({ id, type, purpose: 'p', params }) as Exploration;
const scopeOf = (dir: string): Promise<ResolvedScope> => resolveScopeForTarget({ kind: 'module', value: file('src', dir) }, 'code');
const args = (explorations: Exploration[], scope: ResolvedScope) => ({
	connectionExecution: savedAnalysisExecution(repo), runId: 'r1', repoPath: repo, closureRepos: [repo], repoLastIndexedAtMs: LAST,
	plan: { answerType: 'structural-map', synthesisHint: 'h', explorations } as ExplorationPlan, scope,
});

test('two consecutive same-question requests on different modules do not share an entry on the one-shot executor and the step executor', async () => {
	const pay = await scopeOf('pay');
	const billing = await scopeOf('billing');

	for (const [mode, run] of [
		['one-shot executor', async (s: ResolvedScope) => (await executeSavedPlan(args([exp('e1', 'concept.resolve', { query: 'handle one-shot' })], s))).results[0]!],
		['step executor', async (s: ResolvedScope) => { const r = await stepSavedPlan(args([exp('e1', 'concept.resolve', { query: 'handle stepwise' })], s)); assert.equal(r.kind, 'done'); return (r as { executed: { results: Array<{ output: unknown; cached: boolean }> } }).executed.results[0]!; }],
	] as const) {
		// each mode starts from an empty entry for this question
		const first = await run(pay) as { output: unknown; cached: boolean };
		const second = await run(billing) as { output: unknown; cached: boolean };
		const a = first.output as ConceptResolveOutput;
		const b = second.output as ConceptResolveOutput;
		assert.equal(a.anchor?.path, file('src', 'pay'), `${mode}: the first request is about the pay module`);
		assert.equal(b.anchor?.path, file('src', 'billing'), `${mode}: the second request is about the billing module, not the first one's entry`);
		assert.equal(second.cached, false, `${mode}: the second request did not read the first request's entry`);
		assert.ok(b.hits.every(h => h.path.startsWith(file('src', 'billing'))), `${mode}: no hit from the first request's area`);
		// the same area again is served from its own entry
		const again = await run(pay) as { output: unknown; cached: boolean };
		assert.equal(again.cached, true, `${mode}: the same area reads its own entry`);
		assert.equal((again.output as ConceptResolveOutput).anchor?.path, file('src', 'pay'));
	}
});

test('capability.reuse-check on different modules does not share an entry on either executor', async () => {
	const capability = exp('e1', 'capability.reuse-check', { capability: 'handle things' });
	const pay = await scopeOf('pay');
	const billing = await scopeOf('billing');
	const seeded = { type: 'capability.reuse-check', capability: 'handle things', candidates: [{ path: file('src', 'pay'), moduleName: 'pay', verdict: 'clear-match', rationale: 'seeded for pay', evidenceEntities: [], conceptScore: 1 }], completeness: { complete: true } } as never;
	await putCachedExploration(repo, LAST, cacheExplorationFor(capability, pay), seeded);

	// the pay request reads its entry on both executors
	assert.equal((await executeSavedPlan(args([capability], pay))).results[0]!.cached, true, 'one-shot: the same area reads its entry');
	const stepPay = await stepSavedPlan(args([capability], pay));
	assert.equal(stepPay.kind, 'done');
	if (stepPay.kind === 'done') assert.equal(stepPay.executed.results[0]!.cached, true, 'step: the same area reads its entry');

	// the billing request does not read the pay entry: checked on the step executor first (the one-shot run below may cache its own billing entry)
	const stepBilling = await stepSavedPlan(args([capability], billing));
	if (stepBilling.kind === 'done') {
		assert.equal(stepBilling.executed.results[0]!.cached, false, 'step: another area does not read the entry');
		assert.doesNotMatch(JSON.stringify(stepBilling.executed.results[0]!.output), /seeded for pay/);
	} // else: the lookup paused for the outer model, which is not a read of the pay entry either
	// (the one-shot lookup itself needs a model; a stand-in runner shows only that it ran instead of reading the entry)
	const real = _getRunnersForTest()['capability.reuse-check'];
	_overrideRunnerForTest('capability.reuse-check', async () => ({ type: 'capability.reuse-check', capability: 'handle things', candidates: [], completeness: { complete: true }, notFoundNote: 'ran for billing' }) as never);
	try {
		const oneShotBilling = await executeSavedPlan(args([capability], billing));
		assert.equal(oneShotBilling.results[0]!.cached, false, 'one-shot: another area does not read the entry');
		assert.match(JSON.stringify(oneShotBilling.results[0]!.output), /ran for billing/);
		assert.doesNotMatch(JSON.stringify(oneShotBilling.results[0]!.output), /seeded for pay/);
	} finally {
		_overrideRunnerForTest('capability.reuse-check', real);
	}
});

test('a row keyed the old way is not read, and the narrow phase writes under the area-aware key', async () => {
	const concept = exp('e1', 'concept.resolve', { query: 'handle' });
	const pay = await scopeOf('pay');
	const stale = { type: 'concept.resolve', completeness: { complete: true }, query: 'handle', hits: [{ kind: 'dir', path: '/stale', name: 'stale', score: 1, diagnostics: {} }] } as never;
	await putCachedExploration(repo, LAST, concept, stale);      // no area in the key: the old shape
	const executed = await executeSavedPlan(args([concept], pay));
	assert.equal(executed.results[0]!.cached, false, 'the old-shape row was not read');
	assert.notEqual((executed.results[0]!.output as ConceptResolveOutput).hits[0]?.path, '/stale');

	// the narrow phase: finalize writes under cacheExplorationFor(exp, scope)
	const decision = exp('e1', 'doc.decision.trace', { topic: 't' });
	const payload: StepStatePayload = {
		version: STATE_VERSION, runId: 'narrow-1', repoPath: repo, repoIndexedAt: Number(LAST),
		intent: { target: 'code', scope: 'M', focused: true, focus: 'q', scopeRef: { kind: 'module', value: file('src', 'pay') }, reasoning: 'r', scopeSource: 'request' },
		synthesizerKey: 'adherence', stage: 'awaiting_narrow',
		plan: { answerType: 'adherence-check', synthesisHint: 'h', explorations: [decision] },
		narrow: { explorationId: 'e1', explorationType: 'doc.decision.trace', preparedBlob: { topic: 't', retrievedSectionCount: 0, validEntityIds: [] }, resumeState: { results: [], outputs: [], totalCached: 0, totalMsSoFar: 0 } },
	};
	const envelope = await handleAnalyzeStep({ phase: 'narrow', explorationId: 'e1', narrow: { topic: 't', decisions: [], notFoundNote: '' }, state: await encodeState(payload) });
	assert.equal(envelope.isError === true, false);
	assert.notEqual(await getCachedExploration(repo, LAST, cacheExplorationFor(decision, pay)), null, 'the pay area has the narrow output');
	assert.equal(await getCachedExploration(repo, LAST, cacheExplorationFor(decision, await scopeOf('billing'))), null, 'another area does not');
	assert.equal(await getCachedExploration(repo, LAST, decision), null, 'nor does the old-shape key');
});

test('a version-2 row, written exactly as the previous code wrote it, is not read by either executor', async () => {
	const { createHash } = await import('node:crypto');
	const { getGraphStore, withWriteTxn } = await import('../../../db/graph/store.js');
	const { lookupRepoIdInTxn } = await import('../../../db/repos.js');
	const { Packr } = await import('msgpackr');
	const concept = exp('e1', 'concept.resolve', { query: 'handle version two' });
	const pay = await scopeOf('pay');

	// the key the previous code computed: version 2, the lookup's own params, no area
	const v2Hash = createHash('sha256').update(JSON.stringify({ v: 2, type: concept.type, params: { query: 'handle version two' } }), 'utf8').digest('hex').slice(0, 16);
	const stale = { type: 'concept.resolve', completeness: { complete: true }, query: 'handle version two', hits: [{ kind: 'dir', path: '/stale', name: 'stale', score: 1, diagnostics: {} }] };
	await withWriteTxn(s => {
		const key = Buffer.alloc(20);
		key.writeUInt32BE(lookupRepoIdInTxn(s, repo)!, 0);
		key.writeBigUInt64BE(LAST, 4);
		Buffer.from(v2Hash, 'hex').copy(key, 12, 0, 8);
		s.explorationCache.put(key, new Packr({ useRecords: false }).pack({ exploration: concept, output: stale, cachedAt: 1 }));
	});
	const store = await getGraphStore();
	assert.equal([...store.explorationCache.getKeys()].length, 1, 'the version-2 row is in the store');

	// neither the whole-repository key nor the area key of the current code addresses it
	assert.equal(await getCachedExploration(repo, LAST, concept), null);
	assert.equal(await getCachedExploration(repo, LAST, cacheExplorationFor(concept, pay)), null);
	const workspace = await resolveScopeForTarget({ kind: 'workspace', value: repo }, 'code');
	assert.equal(await getCachedExploration(repo, LAST, cacheExplorationFor(concept, workspace)), null);

	// ... and neither executor serves it
	const oneShot = await executeSavedPlan(args([concept], pay));
	assert.equal(oneShot.results[0]!.cached, false);
	assert.doesNotMatch(JSON.stringify(oneShot.results[0]!.output), /\/stale/);
	for (const scope of [workspace]) {
		const stepped = await stepSavedPlan(args([concept], scope));
		assert.equal(stepped.kind, 'done');
		if (stepped.kind === 'done') {
			assert.equal(stepped.executed.results[0]!.cached, false);
			assert.doesNotMatch(JSON.stringify(stepped.executed.results[0]!.output), /\/stale/);
		}
	}

	// a lookup that has no area in its key: only the version keeps its version-2 row from being read
	const text = exp('e2', 'search.text', { pattern: 'needle' });
	const v2Text = createHash('sha256').update(JSON.stringify({ v: 2, type: text.type, params: { pattern: 'needle' } }), 'utf8').digest('hex').slice(0, 16);
	await withWriteTxn(s => {
		const key = Buffer.alloc(20);
		key.writeUInt32BE(lookupRepoIdInTxn(s, repo)!, 0);
		key.writeBigUInt64BE(LAST, 4);
		Buffer.from(v2Text, 'hex').copy(key, 12, 0, 8);
		s.explorationCache.put(key, new Packr({ useRecords: false }).pack({ exploration: text, output: { type: 'search.text', pattern: 'needle', hits: [], backend: 'node', root: repo }, cachedAt: 1 }));
	});
	assert.ok([...store.explorationCache.getKeys()].length >= 2, 'the version-2 rows are in the store beside what the executors wrote');
	assert.equal(await getCachedExploration(repo, LAST, text), null, 'the version-2 row of a lookup with no area is not read');
});
