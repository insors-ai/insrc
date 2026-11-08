import './private-paths.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * An aggregate failure reaches the run's failure through the orchestrator
 * (LLD-b9d5c5c40df5a574-s3, task t11): whole runs over a sandboxed graph store with the real templates and runtimes; the
 * model is a stand-in that fails the aggregate step.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ModelCallFailedError } from '../../../agent/providers/model-call-error.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { AnalyzeScope } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import { runExecutor } from '../../executor/index.js';
import { registerBuiltinTemplates } from '../../planner/templates/bootstrap.js';
import { registerBuiltinRuntimes } from '../../runtimes/bootstrap.js';
import { _setOrchestratorStagesForTest, runAnalyze } from '../driver.js';
import { purgeRunForTests, readRunRecord } from '../persistence.js';

/** What a call of the aggregate step may hold beyond the 16,000 characters kept back: small enough that its three inputs are not one part. */
const AGGREGATE_ROOM = 4_500;
let sandbox: string;
let small: string;

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
			{ taskId: 't04', template: 'code.aggregate.report', kind: 'leaf', params: {}, consumes: ['modules', 'functional-surface'], produces: ['report'], rationale: 'aggregate the task outputs into the final report' },
		],
	};
}


test.before(() => {
	registerBuiltinTemplates();
	registerBuiltinRuntimes();
});
test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'analyze-aggregate-failure-')));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	small = join(sandbox, 'small');
	await repoOf(small, 1);
});
test.afterEach(async () => {
	_setOrchestratorStagesForTest(undefined);
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

test('failure data including partFailures and upstream reaches RunFailure.data under \'executor-aggregator-failed\' through the orchestrator', async () => {
	// The aggregate step is given the size L (the table divides it) and every call of its model fails at the transport.
	_setOrchestratorStagesForTest({ executor: args => runExecutor({ ...args, intent: { ...args.intent, scope: 'L' as AnalyzeScope } }) });
	const runId = `aggregate-failure-orch-${Math.floor(Math.random() * 1e9).toString(16)}`;
	let aggregateCalls = 0;
	const routing = { router: { resolveProviderForRole: (role: string) => {
		const completeStructured = async (_m: unknown, schema: unknown): Promise<unknown> => {
			if (role === 'analyze.plan') return fourTaskPlan(small, 'XS');
			// Every call fails with its own words, so each part's cause chain can be told from the others.
			if (role === 'analyze.aggregate') { const n = ++aggregateCalls; throw new ModelCallFailedError(`claude exited with 1 on call ${n}.`, { cause: new Error(`socket closed on call ${n}`) }); }
			return smallest(schema);
		};
		// A small input budget for the aggregate step only, so its inputs are several parts.
		return { provider: { completeStructured, ...(role === 'analyze.aggregate' ? { inputBudgetChars: 16_000 + AGGREGATE_ROOM } : {}) } as unknown as LLMProvider };
	} } } as unknown as RoutingSeamContext;
	try {
		const result = await runWithRoutingContext(routing, () => runAnalyze({ runId, userPrompt: 'what is here', scopeRef: { kind: 'repo', value: small }, targetHint: 'code' }));
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.equal(result.error.code, 'executor-aggregator-failed');
		assert.equal(result.error.message, 'Run executor completed but the aggregator produced no report.');
		const data = result.error.data as { tasksFailed: Array<{ taskId: string }>; aggregate: {
			kind: string; reason: string; upstream: Array<{ taskId: string; template: string }>;
			partFailures: Array<{ kind: string; cause?: { message: string; cause?: { message: string } } }>;
		} };
		assert.deepEqual(data.tasksFailed.map(t => t.taskId), ['t04']);
		// The kept failure: the typed reason, the upstream inputs with their producers, and every part's cause chain.
		assert.equal(data.aggregate.kind, 'answer-step', JSON.stringify(data.aggregate).slice(0, 600));
		assert.equal(data.aggregate.reason, 'model-failed');
		assert.deepEqual(data.aggregate.upstream.map(u => u.taskId).sort(), ['t01', 't02', 't03']);
		assert.ok(data.aggregate.upstream.some(u => u.template === 'code.discovery.modules'));
		// Every failed part is kept, each with its own cause chain: none is dropped and none copies another's.
		assert.ok(data.aggregate.partFailures.length >= 2, `several parts failed: ${data.aggregate.partFailures.length}`);
		const outer = data.aggregate.partFailures.map(f => f.cause?.message);
		const inner = data.aggregate.partFailures.map(f => f.cause?.cause?.message);
		assert.equal(new Set(outer).size, outer.length, 'distinct outer messages');
		assert.equal(new Set(inner).size, inner.length, 'distinct inner messages');
		for (const f of data.aggregate.partFailures) {
			assert.equal(f.kind, 'call-failed');
			const n = /call (\d+)\./.exec(f.cause?.message ?? '')?.[1];
			assert.ok(n !== undefined, `outer message names its call: ${f.cause?.message}`);
			assert.equal(f.cause?.cause?.message, `socket closed on call ${n}`, 'the inner message belongs to the same call');
		}
		// The stored run record holds the same failure, as JSON.
		assert.deepEqual(readRunRecord(runId)?.error?.data, JSON.parse(JSON.stringify(result.error.data)));
	} finally { purgeRunForTests(runId); }
});
