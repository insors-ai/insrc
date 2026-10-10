/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The lookup pipeline takes the measured size (LLD-b9d5c5c40df5a574-s2, tasks t6 and t7).
 *
 * The context builder is called as its callers call it, over a sandboxed
 * graph store. Its three steps (the planning call, the lookups, the answer
 * step) are stand-ins that keep what they were given; the measuring is real.
 * The free-form lookup is run with a stand-in tool loop. No model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { AnalyzeScope, AnalyzeScopeRef, ClassifiedIntent } from '../../../shared/analyze-types.js';
import { PATHS } from '../../../shared/paths.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import { buildCompleteness, renderCompletenessLine, renderMeasureLine } from '../../completeness.js';
import { executePlan, _getRunnersForTest, _overrideRunnerForTest } from '../../explore/executor.js';
import { measureOwnRequest, runFreeformProbe } from '../../explore/freeform-probe.js';
import type { ExecutedPlan, Exploration, ExplorationPlan, ExplorationRunnerContext } from '../../explore/types.js';
import type { RequestMeasure } from '../../measure.js';
import { renderBundleAsMarkdown } from '../../../mcp/bundle-md.js';
import { runShaper, _computeCacheKeyForTest, _realPipelineStepsForTest, type PipelineSteps } from '../driver.js';
import { resolveScope } from '../scope.js';
import type { AnalyzeContextBundle, RunShapeInput } from '../types.js';

type RawBundle = Omit<AnalyzeContextBundle, 'meta'>;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

let sandbox: string;
/** A registered repo of five files and ten entities (S); its directory `src/one` holds one file (XS). */
let repo: string;
const runIds: string[] = [];

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'analyze-lookup-measure-')));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	mkdirSync(join(repo, 'src', 'one'), { recursive: true });
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	const entities: Entity[] = [];
	for (const rel of ['src/one/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts']) {
		const file = join(repo, rel);
		for (const [kind, name] of [['file', rel], ['function', `fn of ${rel}`]] as const) {
			entities.push({ id: makeEntityId(repo, file, kind, name), repo, file, kind, name, language: 'typescript', startLine: 1, endLine: 3, body: '', embedding: [], indexedAt: 'x' } as unknown as Entity);
		}
	}
	await upsertEntities(null, entities);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
	for (const id of runIds.splice(0)) rmSync(PATHS.analyzeContext(id), { recursive: true, force: true });
});

function runId(tag: string): string {
	const id = `lookup-measure-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`;
	runIds.push(id);
	return id;
}

const PLAN: ExplorationPlan = {
	answerType: 'structural-map', synthesisHint: 'h',
	explorations: [{ id: 'e1', type: 'search.text', purpose: 'p', params: { pattern: 'charge' } }],
} as unknown as ExplorationPlan;
const RAW: RawBundle = { system: 'sys', focus: 'Intent focus: none', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };

/** What a search returned: `hits` hits in `files` files. Shaped as the search's own output. */
function searchOutput(hits: number, files: number): unknown {
	return {
		type: 'search.text', completeness: buildCompleteness({ returned: hits, basis: 'text' }), pattern: 'charge', backend: 'node', root: repo,
		hits: Array.from({ length: hits }, (_, i) => ({ file: `src/f${i % files}.ts`, line: i + 1, text: 'charge' })),
	};
}

interface Seen {
	planning:  ClassifiedIntent[];
	executed:  Array<{ requestSize?: AnalyzeScope | undefined }>;
	answering: ClassifiedIntent[];
}

/** The pipeline's steps as stand-ins. The lookups return `output`; the measuring step is the real one. */
function standIns(output: unknown): { steps: PipelineSteps; seen: Seen } {
	const seen: Seen = { planning: [], executed: [], answering: [] };
	const steps: PipelineSteps = {
		..._realPipelineStepsForTest,
		decompose: async (a) => { seen.planning.push(a.intent); return PLAN; },
		executePlan: async (a) => {
			seen.executed.push({ requestSize: a.requestSize });
			return {
				plan: a.plan,
				results: a.plan.explorations.map(e => ({ exploration: e, output: output as never, cached: false, elapsedMs: 0 })),
				totalMs: 0, totalCached: 0,
			} as unknown as ExecutedPlan;
		},
		synthesize: async (a) => { seen.answering.push(a.intent); return RAW; },
	};
	return { steps, seen };
}

/** A tool-loop provider that must never be used by a run-level request. */
const forbidden = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => { throw new Error(`the tool loop was reached (${String(prop)})`); }) }) as unknown as LLMProvider;

function build(inputs: RunShapeInput, steps: PipelineSteps, id: string): Promise<AnalyzeContextBundle> {
	return runShaper({
		promptPath: 'prompts/analyze/code.system.md', invocationMode: 'run', shaperId: 'code',
		inputs, opts: { runId: id }, provider: forbidden, pipelineSteps: steps,
	});
}

const unsized = (scopeRef: AnalyzeScopeRef, focus = 'how are charges made'): RunShapeInput['intent'] =>
	({ target: 'code', focused: true, focus, scopeRef, reasoning: 'r' });

// ---------------------------------------------------------------------------
// The context builder
// ---------------------------------------------------------------------------

test("the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path", async () => {
	// --- The whole repo (five files: S). The lookups return 40 hits in 25 files (M). The caller states L. ---
	// The three sizes differ, and none is the old default.
	const whole = standIns(searchOutput(40, 25));
	const bundle = await build({ intent: unsized({ kind: 'repo', value: repo }), sizeHint: 'L' }, whole.steps, runId('repo'));

	// The planning call: the size of the area the request names.
	assert.equal(whole.seen.planning.length, 1);
	assert.equal(whole.seen.planning[0]!.scope, 'S');
	// The lookups are handed that size, for a lookup that sizes its own work.
	assert.deepEqual(whole.seen.executed, [{ requestSize: 'S' }]);
	// The answer step: the size of what the lookups returned.
	assert.equal(whole.seen.answering.length, 1);
	assert.equal(whole.seen.answering[0]!.scope, 'M');
	// Apart from the size the two steps get the same intent, which is the request's.
	assert.deepEqual({ ...whole.seen.planning[0], scope: undefined }, { ...unsized({ kind: 'repo', value: repo }), scope: undefined });
	assert.deepEqual({ ...whole.seen.answering[0], scope: undefined }, { ...whole.seen.planning[0], scope: undefined });
	// The report's measure is the one from the lookup results, with the caller's size as its hint.
	const characters = JSON.stringify(searchOutput(40, 25), null, 2).length;
	const measure: RequestMeasure = { source: 'lookup-results', items: 40, files: 25, characters, size: 'M', determined: true, sizeHint: 'L' };
	assert.deepEqual(bundle.report?.measure, measure);
	// The answer an agent reads carries the measure line under the completeness line.
	assert.deepEqual(renderBundleAsMarkdown(bundle, { includeMeta: false }).split('\n\n')[0]!.split('\n'),
		[renderCompletenessLine(bundle.report!), renderMeasureLine(measure)]);
	assert.match(renderMeasureLine(measure), /^Size: M, measured from what the lookups returned: 25 files, 40 items, .* The caller asked for L\.$/);

	// --- A size on the intent the builder is given is not read, and with no size stated there is no hint. ---
	const sized = standIns(searchOutput(1, 1));
	const sizedBundle = await build({ intent: { ...unsized({ kind: 'module', value: join(repo, 'src', 'one') }), scope: 'XL' } }, sized.steps, runId('module'));
	assert.equal(sized.seen.planning[0]!.scope, 'XS', 'the directory holds one file, whatever the intent said');
	assert.deepEqual(sized.seen.executed, [{ requestSize: 'XS' }]);
	assert.equal(sized.seen.answering[0]!.scope, 'XS');
	assert.deepEqual([sizedBundle.report?.measure?.size, sizedBundle.report?.measure?.items, sizedBundle.report?.measure?.files], ['XS', 1, 1]);
	assert.ok(!('sizeHint' in sizedBundle.report!.measure!));

	// --- A lookup whose output is not shaped as its type says does not cost the request its answer. ---
	// Its items are counted, its files are not, and the measure's note names it.
	const malformed = standIns({ type: 'search.text', completeness: buildCompleteness({ returned: 7, basis: 'text' }) });
	const malformedBundle = await build({ intent: unsized({ kind: 'repo', value: repo }) }, malformed.steps, runId('malformed'));
	assert.equal(malformed.seen.answering.length, 1, 'the answer was written');
	assert.deepEqual([malformedBundle.report?.measure?.items, malformedBundle.report?.measure?.files, malformedBundle.report?.measure?.determined], [7, 0, true]);
	assert.equal(malformedBundle.report?.measure?.note, 'the files named by 1 result(s) could not be read and are not counted: search.text [e1]');

	// --- No lookup returned a result to count: the answer step gets the largest size, and the report says why. ---
	const none = standIns({ type: 'failed', requested: 'search.text', errorCode: 'runtime-error', message: 'the search could not run' });
	const noneBundle = await build({ intent: unsized({ kind: 'repo', value: repo }) }, none.steps, runId('none'));
	assert.equal(none.seen.planning[0]!.scope, 'S');
	assert.equal(none.seen.answering[0]!.scope, 'XL');
	assert.deepEqual([noneBundle.report?.measure?.determined, noneBundle.report?.measure?.size], [false, 'XL']);
	assert.match(noneBundle.report!.measure!.note!, /no lookup returned a result to count/);
});

test("the builder's cache key leaves out the intent's size and the size hint: a run and a plan request for the same scope share one cached run bundle", async () => {
	const prompt = readFileSync(join(REPO_ROOT, 'src/prompts/analyze/code.system.md'), 'utf8');
	const intent = unsized({ kind: 'repo', value: repo });
	const key = (inputs: RunShapeInput): string => _computeCacheKeyForTest(prompt, inputs);

	// The key: the same whatever size the intent carries and whatever size is stated ...
	const base = key({ intent });
	for (const inputs of [
		{ intent: { ...intent, scope: 'XS' } }, { intent: { ...intent, scope: 'XL' } },
		{ intent, sizeHint: 'S' }, { intent: { ...intent, scope: 'M' }, sizeHint: 'L' },
	] as RunShapeInput[]) {
		assert.equal(key(inputs), base, JSON.stringify(inputs));
	}
	// ... and still different for another scope, another focus or another kind of source.
	assert.notEqual(key({ intent: unsized({ kind: 'module', value: join(repo, 'src') }) }), base);
	assert.notEqual(key({ intent: unsized({ kind: 'repo', value: repo }, 'another question') }), base);
	assert.notEqual(key({ intent: { ...intent, target: 'docs' } }), base);

	// One run id, as a run and the plan request that follows it have. The run builds the bundle, stating S.
	const id = runId('shared');
	const first = standIns(searchOutput(40, 25));
	const built = await build({ intent: { ...intent, scope: 'S' }, sizeHint: 'S' }, first.steps, id);
	assert.equal(first.seen.planning.length, 1);
	assert.equal(built.report?.measure?.sizeHint, 'S');

	// The plan request for the same scope carries another size on its intent and states none. It gets the cached
	// bundle: no step runs again.
	const second = standIns(searchOutput(1, 1));
	const again = await build({ intent: { ...intent, scope: 'XL' } }, second.steps, id);
	assert.deepEqual(second.seen, { planning: [], executed: [], answering: [] }, 'nothing was planned, looked up or answered again');
	assert.equal(again.summary, built.summary);
	// The cached report keeps its measure; the hint on it is the current call's, and this call stated none.
	const { sizeHint: _hint, ...counted } = built.report!.measure!;
	assert.deepEqual(again.report?.measure, counted);
	assert.ok(!('sizeHint' in again.report!.measure!));
	assert.deepEqual(again.report?.completeness, built.report?.completeness);
	// A third call that states L gets the same cached bundle with L as the hint.
	const third = await build({ intent, sizeHint: 'L' }, standIns(searchOutput(1, 1)).steps, id);
	assert.deepEqual(third.report?.measure, { ...counted, sizeHint: 'L' });
	// Another scope under the same run id is not served from that slot.
	const other = standIns(searchOutput(1, 1));
	await build({ intent: unsized({ kind: 'module', value: join(repo, 'src', 'one') }) }, other.steps, id);
	assert.equal(other.seen.planning.length, 1);
});

// ---------------------------------------------------------------------------
// The free-form lookup
// ---------------------------------------------------------------------------

test('the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path; it never takes a default', async () => {
	const exp: Exploration = { id: 'e1', type: 'freeform.probe', purpose: 'p', params: { purpose: 'how are charges made', shaperId: 'code' } } as unknown as Exploration;
	const ctxOf = (extra: Partial<ExplorationRunnerContext>): ExplorationRunnerContext =>
		({ runId: 'r1', repoPath: repo, closureRepos: [repo], readDep: () => undefined, ...extra }) as unknown as ExplorationRunnerContext;
	/** Run the lookup with a stand-in loop; the size the loop was told. */
	async function sizeTold(ctx: ExplorationRunnerContext): Promise<unknown> {
		let told: unknown;
		await runFreeformProbe(exp, ctx, (async (args: { inputs: RunShapeInput }) => {
			told = args.inputs.intent.scope;
			return { rawBundle: RAW, toolCallCount: 1 };
		}) as never);
		return told;
	}

	// The request's size is in the context: it is used as it is, whatever the area would measure.
	assert.equal(await sizeTold(ctxOf({ requestSize: 'L' })), 'L');
	const moduleScope = await resolveScope({ kind: 'module', value: join(repo, 'src', 'one') });
	assert.equal(await sizeTold(ctxOf({ requestSize: 'L', scope: moduleScope })), 'L');

	// No size in the context, a resolved scope: that scope is measured (one file: XS).
	assert.equal(await sizeTold(ctxOf({ scope: moduleScope })), 'XS');
	assert.deepEqual([(await measureOwnRequest({ scope: moduleScope, repoPath: repo }, 'code')).files, (await measureOwnRequest({ scope: moduleScope, repoPath: repo }, 'code')).determined], [1, true]);

	// No size and no scope (a plan executed on a bare repo path): a repo scope at that path is measured, so the
	// registered repo is found (five files: S). The scope the lookup builds for itself has no repo and would
	// always read as a path the index does not hold, which is the largest size.
	assert.equal(await sizeTold(ctxOf({})), 'S');
	const own = await measureOwnRequest({ repoPath: repo }, 'code');
	assert.deepEqual([own.source, own.items, own.files, own.size, own.determined], ['named-area', 10, 5, 'S', true]);

	// The same for a bare path INSIDE the registered repo: the repo that contains it is found and the area under
	// the path is counted (one file: XS). Measured as the workspace scope with no repo that the lookup builds, it
	// would read as holding no registered repo.
	assert.equal(await sizeTold(ctxOf({ repoPath: join(repo, 'src', 'one') })), 'XS');
	const inside = await measureOwnRequest({ repoPath: join(repo, 'src', 'one') }, 'code');
	assert.deepEqual([inside.items, inside.files, inside.determined], [2, 1, true]);

	// The executor hands a lookup the request size it was given, and none when it was given none.
	const handed: Array<AnalyzeScope | undefined> = [];
	const realSearch = _getRunnersForTest()['search.text'];
	_overrideRunnerForTest('search.text', async (_exp, ctx) => { handed.push(ctx.requestSize); return searchOutput(1, 1) as never; });
	try {
		const planOf = (pattern: string): ExplorationPlan => ({ ...PLAN, explorations: [{ id: 'e1', type: 'search.text', purpose: 'p', params: { pattern } }] }) as unknown as ExplorationPlan;
		const args = { runId: 'r1', repoPath: repo, closureRepos: [repo], repoLastIndexedAtMs: 0n };
		await executePlan({ ...args, plan: planOf('first'), requestSize: 'L' });
		await executePlan({ ...args, plan: planOf('second') });
	} finally {
		_overrideRunnerForTest('search.text', realSearch);
	}
	assert.deepEqual(handed, ['L', undefined]);

	// A path the index does not hold is the largest size with its reason: never the old default of M.
	const elsewhere = join(sandbox, 'elsewhere');
	mkdirSync(elsewhere);
	assert.equal(await sizeTold(ctxOf({ repoPath: elsewhere })), 'XL');
	assert.equal((await measureOwnRequest({ repoPath: elsewhere }, 'code')).determined, false);
});
