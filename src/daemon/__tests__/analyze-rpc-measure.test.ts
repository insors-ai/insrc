/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's run, plan and classify requests take the measured size
 * (LLD-b9d5c5c40df5a574-s2, task t5).
 *
 * The handlers are called as the daemon calls them, over a sandboxed graph
 * store with the real templates and runtimes. The model is a stand-in: it
 * answers the planner with a plan built here and every other call with the
 * smallest value its schema accepts. The classifier is a stand-in too (its
 * own context build is a tool loop on a local model).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runWithRoutingContext } from '../../analyze/context/shaper-provider.js';
import type { RoutingSeamContext } from '../../analyze/context/shaper-provider.js';
import type { RequestMeasure } from '../../analyze/measure.js';
import { purgeRunForTests } from '../../analyze/orchestrator/persistence.js';
import { registerBuiltinTemplates } from '../../analyze/planner/templates/bootstrap.js';
import { registerBuiltinRuntimes } from '../../analyze/runtimes/bootstrap.js';
import { upsertEntities } from '../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { addRepo } from '../../db/repos.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { AnalyzeScope, AnalyzeScopeRef, ClassifiedIntent } from '../../shared/analyze-types.js';
import type { Entity, IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import { renderCompletenessLine, renderMeasureLine } from '../../analyze/completeness.js';
import { renderBundleAsMarkdown } from '../../mcp/bundle-md.js';
import { oneShotRunParams } from '../../mcp/server.js';
import { _setClassifierForTest, buildRun, classify, plan, planDepthScope, runStart } from '../analyze-rpc.js';
import { _groundingForTest, _groundingIntentForTest } from '../workflow-rpc.js';

let sandbox: string;
/** A registered repo of one file: it measures XS. */
let small: string;
/** A registered repo of thirty files: it measures M. */
let mid: string;
/** A directory no registered repo contains. */
let unregistered: string;
const runIds: string[] = [];

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
	sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'analyze-rpc-measure-')));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	small = join(sandbox, 'small');
	mid = join(sandbox, 'mid');
	unregistered = join(sandbox, 'elsewhere');
	mkdirSync(unregistered);
	await repoOf(small, 1);
	await repoOf(mid, 30);
});

test.afterEach(async () => {
	roles.length = 0;
	_setClassifierForTest(undefined);
	for (const id of runIds.splice(0)) purgeRunForTests(id);
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

/** The roles a model was asked for, in order, since the test began. */
const roles: string[] = [];
/** The lookups the stand-in model plans for a run context: a text search, which needs no model. */
const LOOKUPS = { answerType: 'how-does-it-work', synthesisHint: 'say where it is', explorations: [{ id: 'e1', type: 'search.text', purpose: 'where the function is', params: { pattern: 'fn0' } }] };

/** Call a handler with the stand-in model answering the planner with `planAnswer`, and the run context's planning call with `lookups` when given. */
function withModel<T>(planAnswer: unknown, call: () => Promise<T>, lookups?: unknown): Promise<T> {
	const routing = { router: { resolveProviderForRole: (role: string) => {
		roles.push(role);
		const completeStructured = async (_m: unknown, schema: unknown): Promise<unknown> => {
			if (role === 'analyze.plan') return planAnswer;
			if (role === 'analyze.decompose' && lookups !== undefined) return lookups;
			return smallest(schema);
		};
		return { provider: { completeStructured } as unknown as LLMProvider };
	} } } as unknown as RoutingSeamContext;
	return runWithRoutingContext(routing, call);
}

const id = (tag: string): string => { const runId = `rpc-measure-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`; runIds.push(runId); return runId; };
const repo = (value: string): AnalyzeScopeRef => ({ kind: 'repo', value });
const intentOn = (path: string, stated: AnalyzeScope): ClassifiedIntent => ({ target: 'code', scope: stated, focused: false, scopeRef: repo(path), reasoning: 'a request on a repository of code' });
const SMALL: RequestMeasure = { source: 'named-area', items: 2, files: 1, characters: null, size: 'XS', determined: true };

test("the daemon's run request, plan request and classify request treat a stated size as a hint and return the measured size; a plan request at depth 0 takes the measured size for the band and the depth, and one at a greater depth takes the measured size for the band and the caller's root size for the depth (mutation: take the child's size for the depth)", async () => {
	// --- The run request: the caller states L, the repo holds one file. ---
	const frames: IpcStreamMessage[] = [];
	await withModel(fourTaskPlan(small, 'L'), () => runStart(
		{ runId: id('run'), userPrompt: 'what is here', scopeRef: repo(small), targetHint: 'code', scopeHint: 'L' },
		(m) => { frames.push(m); }, new AbortController().signal,
	));
	const terminal = frames.find(f => f.stream === 'analyze.result')?.data as { ok: boolean; intent?: ClassifiedIntent; report?: { measure?: RequestMeasure }; error?: { code: string; message: string } };
	assert.equal(terminal.ok, true, terminal.error?.message);
	assert.equal(terminal.intent?.scope, 'XS', 'the run returns the measured size');
	assert.deepEqual(terminal.report?.measure, { ...SMALL, sizeHint: 'L' });

	// --- The classify request: the classifier says XL, the scope it names holds one file. ---
	_setClassifierForTest(async () => intentOn(small, 'XL'));
	const classified = await classify({ runId: id('classify'), userPrompt: 'what is here', scopeRef: repo(small) });
	assert.ok(classified.ok);
	if (!classified.ok) return;
	assert.deepEqual(classified.intent, { ...intentOn(small, 'XL'), scope: 'XS' }, "the response keeps the field, with the measured size");
	assert.deepEqual(classified.measure, SMALL, "the classifier's figure is not a hint");
	// A scope that cannot be counted is not refused here: the size is the largest, and the measure says why.
	_setClassifierForTest(async () => intentOn(unregistered, 'XS'));
	const uncounted = await classify({ runId: id('classify-uncounted'), userPrompt: 'what is here', scopeRef: repo(unregistered) });
	assert.ok(uncounted.ok);
	if (!uncounted.ok) return;
	assert.equal(uncounted.intent.scope, 'XL');
	assert.deepEqual([uncounted.measure.determined, uncounted.measure.size], [false, 'XL']);

	// --- The plan request at depth 0: the intent states L and the request states a root size of XL. ---
	// The plan of four tasks is accepted only in the band of XS, the measured size.
	const root = await withModel(fourTaskPlan(small, 'L'), () => plan({ runId: id('plan-root'), intent: intentOn(small, 'L'), rootScope: 'XL' }));
	assert.ok(root.ok, root.ok ? '' : root.error.message);
	if (!root.ok) return;
	assert.deepEqual(root.measure, { ...SMALL, sizeHint: 'L' });
	assert.equal(root.plan.scope, 'XS');
	assert.equal(root.plan.tasks.length, 4);
	// The same request on the larger repo: the band is M's, and the four tasks are refused for it.
	const rootMid = await withModel(fourTaskPlan(mid, 'XS'), () => plan({ runId: id('plan-root-mid'), intent: intentOn(mid, 'XS') }));
	assert.ok(!rootMid.ok);
	if (rootMid.ok) return;
	assert.equal(rootMid.error.code, 'plan-invariant-failed');
	assert.match(rootMid.error.message, /task count 4 is outside the scope band for M/);
	// At depth 0 the intent is the root: its measured size is the size the depth cap is read for, and a root size
	// in the request is a hint.
	assert.equal(planDepthScope(0, 'XL', 'XS'), 'XS');
	assert.equal(planDepthScope(0, undefined, 'M'), 'M');

	// --- The plan request at a greater depth. ---
	// The band is the child's measured size (XS); the depth cap is the root size the caller hands down. Here that
	// is XL (six levels), so a request at depth 2 is planned. For the child's own XS (two levels) it would be refused.
	const child = await withModel(fourTaskPlan(small, 'L'), () => plan({ runId: id('plan-child'), intent: intentOn(small, 'L'), currentDepth: 2, rootScope: 'XL', parentTaskPath: 't02.t02' }));
	assert.ok(child.ok, child.ok ? '' : child.error.message);
	if (!child.ok) return;
	assert.deepEqual(child.measure, { ...SMALL, sizeHint: 'L' });
	assert.equal(child.plan.scope, 'XS');
	assert.equal(planDepthScope(2, 'XL', 'XS'), 'XL');
	// The caller hands down XS: refused at depth 2, though the child's own size (M, four levels) would allow it.
	const refused = await withModel(fourTaskPlan(mid, 'M'), () => plan({ runId: id('plan-child-refused'), intent: intentOn(mid, 'M'), currentDepth: 2, rootScope: 'XS', parentTaskPath: 't02.t02' }));
	assert.ok(!refused.ok);
	if (refused.ok) return;
	assert.equal(refused.error.code, 'max-plan-depth-exceeded');
	assert.deepEqual(refused.error.data, { currentDepth: 2, rootScope: 'XS', cap: 2 });
	// With no root size handed down, the child's measured size is used: XS here, whatever its intent states.
	const noRoot = await withModel(fourTaskPlan(small, 'XL'), () => plan({ runId: id('plan-child-no-root'), intent: intentOn(small, 'XL'), currentDepth: 2, parentTaskPath: 't02.t02' }));
	assert.ok(!noRoot.ok);
	if (noRoot.ok) return;
	assert.equal(noRoot.error.code, 'max-plan-depth-exceeded');
	assert.deepEqual(noRoot.error.data, { currentDepth: 2, rootScope: 'XS', cap: 2 });
	assert.equal(planDepthScope(2, undefined, 'XS'), 'XS');

	// --- A request refused for its scope is refused as before, with the same code. ---
	const unindexed = await withModel(fourTaskPlan(unregistered, 'S'), () => plan({ runId: id('plan-unindexed'), intent: intentOn(unregistered, 'S') }));
	assert.ok(!unindexed.ok);
	if (unindexed.ok) return;
	assert.equal(unindexed.error.code, 'scope-not-indexed');
});

test("the one-shot tool and the workflow runner state no size of their own and their answers carry the measure line; a run-level request needs no size on its intent, and a run and a plan request for the same scope share one cached run bundle", async () => {
	// --- What the two callers send: an intent with no size. Only a size the caller stated goes along, as a hint. ---
	const unstated = oneShotRunParams({ focus: 'where is fn0' }, small, id('one-shot'));
	assert.ok(!('scope' in unstated.intent) && !('sizeHint' in unstated), 'the one-shot tool sets no size');
	const stated = oneShotRunParams({ focus: 'where is fn0', scope: 'L' }, small, id('one-shot-stated'));
	assert.ok(!('scope' in stated.intent));
	assert.equal(stated.sizeHint, 'L');
	const grounding = _groundingIntentForTest({ focus: 'where is fn0', repoPath: small } as never);
	assert.ok(!('scope' in grounding), 'the workflow runner sets no size');
	assert.deepEqual(grounding.scopeRef, { kind: 'workspace', value: small });

	// --- The one-shot tool's answer. The request is accepted with no size on its intent. ---
	const answered = await withModel(null, () => buildRun(stated), LOOKUPS);
	assert.ok(answered.ok, answered.ok ? '' : answered.error.message);
	if (!answered.ok) return;
	const measure = answered.bundle.report?.measure;
	assert.ok(measure !== undefined, 'the report carries a measure');
	assert.deepEqual([measure.source, measure.determined, measure.sizeHint], ['lookup-results', true, 'L']);
	assert.ok(measure.items > 0, 'the stored function was found and counted');
	assert.deepEqual(renderBundleAsMarkdown(answered.bundle, { includeMeta: false }).split('\n\n')[0]!.split('\n'),
		[renderCompletenessLine(answered.bundle.report!), renderMeasureLine(measure)]);
	assert.match(renderMeasureLine(measure), /^Size: \w+, measured from what the lookups returned: .* The caller asked for L\.$/);
	// With none stated the measure has no hint.
	const plain = await withModel(null, () => buildRun(unstated), LOOKUPS);
	assert.ok(plain.ok);
	if (!plain.ok) return;
	const { sizeHint: _hint, ...counted } = measure;
	assert.deepEqual(plain.bundle.report?.measure, counted);

	// A size on the intent is still checked when present, and a stated size must be a size.
	const badSize = await buildRun({ runId: 'x', intent: { ...stated.intent, scope: 'huge' } });
	assert.ok(!badSize.ok && badSize.error.code === 'invalid-params' && /intent\.scope/.test(badSize.error.message));
	const badHint = await buildRun({ runId: 'x', intent: stated.intent, sizeHint: 'huge' });
	assert.ok(!badHint.ok && badHint.error.code === 'invalid-params' && /sizeHint/.test(badHint.error.message));

	// --- The workflow runner's grounding text: the measure line under the completeness line, and no hint. ---
	const text = await withModel(null, () => _groundingForTest('context.assemble', { runId: id('grounding'), intent: grounding }), LOOKUPS);
	const head = text.split('\n\n')[0]!.split('\n');
	assert.equal(head.length, 2);
	assert.equal(head[1], renderMeasureLine(counted));
	assert.ok(!head[1]!.includes('The caller asked for'));

	// --- One cached run bundle for a run and the plan request that follows it. ---
	// The run's context is built for the scope, with L stated. The plan request for the same run and scope carries
	// another size on its intent: it gets the cached bundle, so the run context's planning call is not made again.
	const shared = id('shared');
	roles.length = 0;
	const first = await withModel(null, () => buildRun({ ...stated, runId: shared }), LOOKUPS);
	assert.ok(first.ok);
	assert.deepEqual(roles.filter(r => r === 'analyze.decompose'), ['analyze.decompose']);
	const planned = await withModel(fourTaskPlan(small, 'XL'), () => plan({ runId: shared, intent: { ...intentOn(small, 'XL'), focused: true, focus: 'where is fn0', reasoning: stated.intent.reasoning, scopeRef: stated.intent.scopeRef } }), LOOKUPS);
	assert.ok(planned.ok, planned.ok ? '' : planned.error.message);
	assert.deepEqual(roles.filter(r => r === 'analyze.decompose'), ['analyze.decompose'], "the run context was not built again for the plan request");
	assert.ok(roles.includes('analyze.plan'), 'the planner was asked');
});
