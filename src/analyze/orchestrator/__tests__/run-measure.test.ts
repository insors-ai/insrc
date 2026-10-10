/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A run's size is measured (LLD-b9d5c5c40df5a574-s2, task t5).
 *
 * Whole runs over a sandboxed graph store, with the real templates and
 * runtimes. The model is a stand-in: it answers the planner with a plan built
 * here and every other call with the smallest value its schema accepts, and
 * it keeps the roles it was asked for. The classifier is a stand-in too: its
 * own context build is a tool loop on a local model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listEntitiesForRepo, upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { AnalyzeScope, AnalyzeScopeRef, ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import { renderCompletenessLine, renderMeasureLine } from '../../completeness.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import { CANCELLED_BEFORE_MEASURE, _setMeasureDepsForTest } from '../../measure.js';
import type { RequestMeasure } from '../../measure.js';
import { registerBuiltinTemplates } from '../../planner/templates/bootstrap.js';
import { registerBuiltinRuntimes } from '../../runtimes/bootstrap.js';
import { _setClassifyForTest, runAnalyze } from '../driver.js';
import { purgeRunForTests, readRunRecord } from '../persistence.js';
import type { AnalyzeRunEvent, RunAnalyzeArgs, RunRecord } from '../types.js';

let sandbox: string;
/** A registered repo of one file: it measures XS. */
let small: string;
/** A registered repo of thirty files: it measures M. */
let mid: string;
/** A directory no registered repo contains. */
let unregistered: string;

async function repoOf(path: string, files: number): Promise<void> {
	mkdirSync(join(path, 'src'), { recursive: true });
	await addRepo(null, { path, name: path, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	const entities: Entity[] = [];
	for (let i = 0; i < files; i++) {
		const file = join(path, 'src', `f${i}.ts`);
		writeFileSync(file, `export function fn${i}() { return ${i}; }\n`, 'utf8');
		entities.push(
			{ id: makeEntityId(path, file, 'file', `f${i}.ts`), repo: path, file, kind: 'file', name: `f${i}.ts`, language: 'typescript', startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: 'x' } as unknown as Entity,
			{ id: makeEntityId(path, file, 'function', `fn${i}`), repo: path, file, kind: 'function', name: `fn${i}`, language: 'typescript', startLine: 1, endLine: 1, body: `export function fn${i}() { return ${i}; }`, embedding: [], indexedAt: 'x' } as unknown as Entity,
		);
	}
	await upsertEntities(null, entities);
}

test.before(() => {
	registerBuiltinTemplates();
	registerBuiltinRuntimes();
});

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'analyze-run-measure-')));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	small = join(sandbox, 'small');
	mid = join(sandbox, 'mid');
	unregistered = join(sandbox, 'elsewhere');
	mkdirSync(unregistered);
	await repoOf(small, 1);
	await repoOf(mid, 30);
});

test.afterEach(async () => {
	_setClassifyForTest(undefined);
	_setMeasureDepsForTest(undefined);
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

/** The smallest value a JSON schema accepts. */
function smallest(schema: unknown): unknown {
	const s = (schema ?? {}) as Record<string, unknown>;
	if (s['const'] !== undefined) return s['const'];
	if (Array.isArray(s['enum'])) return s['enum'][0];
	const type = Array.isArray(s['type']) ? s['type'][0] : s['type'];
	const properties = s['properties'] as Record<string, unknown> | undefined;
	if (type === 'object' || properties !== undefined) {
		const out: Record<string, unknown> = {};
		for (const key of (s['required'] as string[] | undefined) ?? Object.keys(properties ?? {})) out[key] = smallest(properties?.[key]);
		return out;
	}
	if (type === 'array') return Array.from({ length: (s['minItems'] as number | undefined) ?? 0 }, () => smallest(s['items']));
	if (type === 'string') return 'x'.repeat(Math.max(1, (s['minLength'] as number | undefined) ?? 1));
	if (type === 'number' || type === 'integer') return (s['minimum'] as number | undefined) ?? 0;
	if (type === 'boolean') return false;
	return null;
}

/** A plan of four tasks: within the band of XS (3 to 8) and of no other size. The size it states is the model's own. */
function fourTaskPlan(repo: string, statedSize: AnalyzeScope): unknown {
	return {
		planId: 'p-four', goal: 'say what the repo holds', target: 'code', scope: statedSize,
		reasoning: 'a plan of four tasks for a request of the smallest size, with one aggregate task at its end',
		tasks: [
			{ taskId: 't01', template: 'code.discovery.modules', kind: 'leaf', params: { scopeRef: { kind: 'repo', value: repo } }, produces: ['modules'], rationale: 'discover the modules of the repo for the report' },
			{ taskId: 't02', template: 'code.surface.functional', kind: 'leaf', params: { module: 'src' }, produces: ['functional-surface'], rationale: 'surface scan of the one module of the repo' },
			{ taskId: 't03', template: 'code.surface.functional', kind: 'leaf', params: { module: 'src' }, produces: ['functional-surface'], rationale: 'surface scan of the one module, a second time' },
			{ taskId: 't04', template: 'code.aggregate.report', kind: 'leaf', params: {}, produces: ['report'], rationale: 'aggregate the task outputs into the final report' },
		],
	};
}

interface Run {
	readonly result: Awaited<ReturnType<typeof runAnalyze>>;
	readonly events: AnalyzeRunEvent[];
	/** The roles a model was asked for, in order. */
	readonly roles:  string[];
	readonly record: RunRecord | null;
}

async function run(tag: string, args: Omit<RunAnalyzeArgs, 'runId'>, answers: { plan?: unknown } = {}, signal?: AbortSignal): Promise<Run> {
	const runId = `run-measure-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`;
	const roles: string[] = [];
	const routing = { router: { resolveProviderForRole: (role: string) => {
		roles.push(role);
		const completeStructured = async (_m: unknown, schema: unknown): Promise<unknown> => {
			if (role === 'analyze.plan' && answers.plan !== undefined) return answers.plan;
			return smallest(schema);
		};
		return { provider: { completeStructured } as unknown as LLMProvider };
	} } } as unknown as RoutingSeamContext;
	const events: AnalyzeRunEvent[] = [];
	try {
		const result = await runWithRoutingContext(routing, () => runAnalyze({ runId, ...args }, { onEvent: e => { events.push(e); }, ...(signal !== undefined ? { signal } : {}) }));
		return { result, events, roles, record: readRunRecord(runId) };
	} finally {
		purgeRunForTests(runId);
	}
}

const repo = (value: string): AnalyzeScopeRef => ({ kind: 'repo', value });
const classifiedOf = (r: Run): Extract<AnalyzeRunEvent, { type: 'classified' }> => {
	const e = r.events.find(x => x.type === 'classified');
	assert.ok(e !== undefined && e.type === 'classified', 'the classify stage completed');
	return e;
};
const substeps = (r: Run): string[] => r.events.flatMap(e => (e.type === 'stage-substep' ? [e.substep] : []));
const outcome = (r: Run): string => (r.result.ok ? 'ok' : `${r.result.stage}/${r.result.error.code}`);
/** No model is asked for a size: the size-picking role is never resolved, and the classify stage has only the measure step. */
function assertNoSizePick(r: Run): void {
	assert.ok(!r.roles.includes('analyze.scope.pick'), `no size-picking role among ${r.roles.join(', ')}`);
	assert.ok(!substeps(r).includes('scope-picker'));
	assert.equal(substeps(r)[0], 'measure', 'the measure step is the first step of the run');
}

test('runAnalyze sets the intent\'s size from the measure on both classification branches, keeps a stated size as the hint, puts the measure on the classified event, in the run record and in the final report, and makes no model call to pick a size (mutation: take the stated size as the size)', async () => {
	const SMALL: RequestMeasure = { source: 'named-area', items: 2, files: 1, characters: null, size: 'XS', determined: true };

	// --- The branch with a stated kind of source. The caller states L; the repo holds one file. ---
	// The stand-in planner answers with a plan of four tasks, which only the band of XS accepts, and writes "L" as
	// its plan's size: the run completes only because the plan is built for the measured size.
	const stated = await run('stated', { userPrompt: 'what is here', scopeRef: repo(small), targetHint: 'code', scopeHint: 'L' }, { plan: fourTaskPlan(small, 'L') });
	assert.equal(outcome(stated), 'ok');
	if (!stated.result.ok) return;
	const measure: RequestMeasure = { ...SMALL, sizeHint: 'L' };
	// The intent's size is the measure's; the stated size is the hint.
	assert.equal(stated.result.intent.scope, 'XS');
	assert.equal(stated.result.intent.reasoning, 'target hinted via slash command (classifier skipped)');
	// On the classified event ...
	assert.deepEqual(classifiedOf(stated).measure, measure);
	assert.equal(classifiedOf(stated).intent.scope, 'XS');
	// ... in the run record ...
	assert.deepEqual(stated.record?.measure, measure);
	assert.equal(stated.record?.intent?.scope, 'XS');
	// ... and in the final report: the answer report carries it, and the text's head has the measure line under
	// the completeness line.
	assert.deepEqual(stated.result.report?.measure, measure);
	assert.deepEqual(stated.record?.report?.measure, measure);
	const head = (stated.result.finalReport as { summary: string }).summary.split('\n\n')[0]!.split('\n');
	assert.deepEqual(head, [renderCompletenessLine(stated.result.report!), renderMeasureLine(measure)]);
	assert.equal(head[1], 'Size: XS, measured from the area the request names: 1 file, 2 entities. The caller asked for L.');
	// No model picked a size.
	assertNoSizePick(stated);
	assert.deepEqual(stated.roles, ['analyze.decompose', 'analyze.synthesize', 'analyze.plan', 'analyze.aggregate']);

	// With no size stated the measure has no hint, and still no model is asked for one.
	const unstated = await run('unstated', { userPrompt: 'what is here', scopeRef: repo(small), targetHint: 'code' }, { plan: fourTaskPlan(small, 'XS') });
	assert.equal(outcome(unstated), 'ok');
	assert.deepEqual(classifiedOf(unstated).measure, SMALL);
	assert.ok(!('sizeHint' in classifiedOf(unstated).measure!));
	assertNoSizePick(unstated);
	assert.deepEqual(unstated.roles, stated.roles);

	// The same request on the larger repo is a larger size, and the plan of four tasks is refused for it: the
	// band is the measured size's (M: 20 to 40 tasks), whatever the caller stated and whatever the plan says.
	const larger = await run('larger', { userPrompt: 'what is here', scopeRef: repo(mid), targetHint: 'code', scopeHint: 'XS' }, { plan: fourTaskPlan(mid, 'XS') });
	assert.equal(outcome(larger), 'plan/plan-invariant-failed');
	assert.deepEqual(classifiedOf(larger).measure, { source: 'named-area', items: 60, files: 30, characters: null, size: 'M', determined: true, sizeHint: 'XS' });
	assert.equal(larger.result.intent?.scope, 'M');
	if (larger.result.ok) return;
	assert.match(larger.result.error.message, /INV-13 -- task count 4 is outside the scope band for M/);
	assert.deepEqual(larger.record?.measure, classifiedOf(larger).measure, 'a failed run keeps its measure in the record');

	// --- The branch with the classifier. The model says XL; the caller states M; the repo holds one file. ---
	const classifierAnswer: ClassifiedIntent = { target: 'code', scope: 'XL', focused: false, scopeRef: repo(small), reasoning: 'the request names a repository of code' };
	let classifierCalls = 0;
	_setClassifyForTest(async () => { classifierCalls += 1; return classifierAnswer; });
	const classified = await run('classified', { userPrompt: 'what is here', scopeRef: repo(small), scopeHint: 'M' }, { plan: fourTaskPlan(small, 'XL') });
	assert.equal(classifierCalls, 1, 'the classifier ran');
	assert.equal(outcome(classified), 'ok');
	assert.equal(classified.result.intent?.scope, 'XS', "the classifier's size is not used");
	assert.equal(classified.result.intent?.reasoning, 'the request names a repository of code');
	assert.deepEqual(classifiedOf(classified).measure, { ...SMALL, sizeHint: 'M' }, "the hint is the caller's stated size, never the classifier's");
	assert.deepEqual(classified.record?.measure, { ...SMALL, sizeHint: 'M' });
	assert.deepEqual(classified.result.report?.measure, { ...SMALL, sizeHint: 'M' });
	assertNoSizePick(classified);
	// With no size stated on this branch the measure has no hint: the classifier's XL is not one.
	const classifiedUnstated = await run('classified-unstated', { userPrompt: 'what is here', scopeRef: repo(small) }, { plan: fourTaskPlan(small, 'XL') });
	assert.equal(outcome(classifiedUnstated), 'ok');
	assert.deepEqual(classifiedOf(classifiedUnstated).measure, SMALL);
	assert.equal(classifiedOf(classifiedUnstated).intent.scope, 'XS');
	_setClassifyForTest(undefined);

	// --- A request refused for its scope is refused where it was, with the same code. ---
	// The measure does not refuse: it says the size could not be determined, and the indexed check refuses.
	const refused = await run('refused', { userPrompt: 'what is here', scopeRef: repo(unregistered), targetHint: 'code', scopeHint: 'S' });
	assert.equal(outcome(refused), 'plan/scope-not-indexed');
	const notDetermined = classifiedOf(refused).measure!;
	assert.deepEqual([notDetermined.size, notDetermined.determined, notDetermined.sizeHint, notDetermined.items], ['XL', false, 'S', 0]);
	assert.ok(notDetermined.note!.includes(unregistered), notDetermined.note);
	assert.deepEqual(refused.roles, [], 'refused before any model call, as before');
	// A pairing the table refuses still ends at classify, before anything is measured.
	const pairing = await run('pairing', { userPrompt: 'what is here', scopeRef: { kind: 'connection', value: 'ledger' }, targetHint: 'code', scopeHint: 'S' });
	assert.equal(outcome(pairing), 'classify/scope-ref-kind-target-mismatch');
	assert.deepEqual(substeps(pairing), []);
	assert.equal(pairing.record?.measure, undefined);
});

// ---------------------------------------------------------------------------
// One measure per run, under the run's signal (ISSUE-008e146a)
// ---------------------------------------------------------------------------

test("a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way", async () => {
	// The measure's own read of the repo, counted: nothing else in a run reads through it.
	let measured = 0;
	_setMeasureDepsForTest({ listEntities: async path => { measured += 1; return listEntitiesForRepo(null, path); } });
	const whole = await run('one-measure', { userPrompt: 'what is here', scopeRef: repo(small), targetHint: 'code', scopeHint: 'L' }, { plan: fourTaskPlan(small, 'L') });
	assert.equal(outcome(whole), 'ok');
	// The run went through its context build, its plan and its tasks ...
	assert.deepEqual(whole.roles, ['analyze.decompose', 'analyze.synthesize', 'analyze.plan', 'analyze.aggregate']);
	// ... and the area it names was measured once: the context builder took no measure of its own.
	assert.equal(measured, 1);
	assert.deepEqual(classifiedOf(whole).measure, { source: 'named-area', items: 2, files: 1, characters: null, size: 'XS', determined: true, sizeHint: 'L' });
	assert.equal(whole.result.intent?.scope, 'XS');

	// A run whose plan is refused has measured once too.
	measured = 0;
	const refused = await run('one-measure-mid', { userPrompt: 'what is here', scopeRef: repo(mid), targetHint: 'code' }, { plan: fourTaskPlan(mid, 'XS') });
	assert.equal(outcome(refused), 'plan/plan-invariant-failed');
	assert.equal(measured, 1);
});

test("the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan", async () => {
	// The request is cancelled while it is being classified. The measure that follows is handed the run's signal:
	// it reads nothing and says so, and the run then ends as cancelled, at the stage it had not started.
	let measured = 0;
	_setMeasureDepsForTest({ listEntities: async path => { measured += 1; return listEntitiesForRepo(null, path); } });
	const cancel = new AbortController();
	const answer: ClassifiedIntent = { target: 'code', scope: 'XS', focused: false, scopeRef: repo(small), reasoning: 'the request names a repository of code' };
	_setClassifyForTest(async () => { cancel.abort(); return answer; });
	const cancelled = await run('cancelled', { userPrompt: 'what is here', scopeRef: repo(small) }, { plan: fourTaskPlan(small, 'XS') }, cancel.signal);
	assert.equal(outcome(cancelled), 'plan/aborted');
	const measure = classifiedOf(cancelled).measure!;
	assert.deepEqual([measure.determined, measure.size, measure.note], [false, 'XL', CANCELLED_BEFORE_MEASURE]);
	assert.equal(measured, 0, 'nothing was read for the measure');
	assert.deepEqual(cancelled.roles, [], 'no model was asked for anything after the cancellation');

	// The same request with a signal that does not fire is measured.
	_setClassifyForTest(async () => answer);
	const live = await run('not-cancelled', { userPrompt: 'what is here', scopeRef: repo(small) }, { plan: fourTaskPlan(small, 'XS') }, new AbortController().signal);
	assert.equal(outcome(live), 'ok');
	assert.equal(classifiedOf(live).measure?.determined, true);
	assert.equal(measured, 1);

	// The run hands the same signal to the recursive planner, which hands it to the measure of each child plan
	// (the planner's own test shows a child measured under it). Read from the source: the planner's options are
	// built in one place.
	const driver = readFileSync(fileURLToPath(new URL('../driver.ts', import.meta.url)), 'utf8');
	const plannerCall = driver.slice(driver.indexOf('tree = await runRecursivePlanner({'));
	const plannerOpts = plannerCall.slice(0, plannerCall.indexOf('} catch (err) {'));
	assert.match(plannerOpts, /\.\.\.\(opts\.signal !== undefined \? \{ signal: opts\.signal \} : \{\}\),/);
	assert.match(driver, /measureRequestScope\(unsized\.scopeRef, unsized\.target, args\.scopeHint, \{ signal: opts\.signal \}\)/);
});
