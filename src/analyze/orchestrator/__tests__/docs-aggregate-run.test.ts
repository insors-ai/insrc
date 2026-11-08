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

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { AnalyzeScope } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider, LLMMessage } from '../../../shared/types.js';
import { buildCompleteness } from '../../completeness.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import { registerTemplateRuntime, _resetRuntimeRegistryForTests } from '../../executor/index.js';
import type { PlanTask, PlannedTask, TemplateExecuteArgs, TemplateRuntime } from '../../executor/types.js';
import type { PlanTreeNode } from '../../planner/recursive.js';
import { docsAggregateReportRuntime } from '../../runtimes/docs/aggregate-report.js';
import { _setOrchestratorStagesForTest, runAnalyze } from '../driver.js';
import { purgeRunForTests, readRunRecord } from '../persistence.js';

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


let sandbox: string;
let small: string;
const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'analyze-docs-run-')));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	small = join(sandbox, 'small');
	await repoOf(small, 1);
});
test.afterEach(async () => {
	_setOrchestratorStagesForTest(undefined);
	_resetRuntimeRegistryForTests();
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

function task(over: Partial<PlannedTask> & { taskId: string }): PlannedTask {
	return { template: 'demo.leaf', kind: 'leaf', params: { dir: 'docs' }, produces: ['out'], rationale: 'fixture task for the docs run through the orchestrator', ...over };
}
const plan = (scope: AnalyzeScope, tasks: PlannedTask[]): PlanTask => ({ planId: 'p', goal: 'g', target: 'docs', scope, reasoning: 'fixture plan for the docs run through the orchestrator', tasks });
const node = (p: PlanTask, children = new Map<string, PlanTreeNode>()): PlanTreeNode => ({ plan: p, children, childErrors: new Map() });

test('the broad docs run completes through the orchestrator with a final report', async () => {
	const leaf: TemplateRuntime = {
		templateId: 'demo.leaf',
		execute: async (a: TemplateExecuteArgs) => ({
			outputs: new Map(a.task.produces.map(n => [n, { files: [`docs/${a.task.taskId}.md`], text: `body ${a.task.taskId} ${'x'.repeat(a.task.params['dir'] === 'big' ? 14_000 : 800)}` }])), completeness: WHOLE,
		}),
	};
	// The planner is a stand-in that returns a docs plan tree with a nested plan; the executor, the walk and the aggregates are real.
	const child = node(plan('L', [
		task({ taskId: 't01', params: { dir: 'big' }, produces: ['inventory'] }),
		task({ taskId: 't02', template: 'docs.aggregate.report', produces: ['report'], consumes: ['inventory'] }),
	]));
	const tree = node(plan('L', [
		task({ taskId: 't01', params: { dir: 'big' }, produces: ['inventory'] }),
		task({ taskId: 't02', params: { dir: 'big' }, produces: ['inventory'] }),
		task({ taskId: 't03', template: 'docs.subrun.deep-dive', kind: 'planner', produces: ['deep'] }),
		task({ taskId: 't04', template: 'docs.aggregate.report', produces: ['report'], consumes: ['inventory', 'deep'] }),
	]), new Map([['t03', child]]));
	_setOrchestratorStagesForTest({ planner: (async () => tree) as never });
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(leaf);
	registerTemplateRuntime(docsAggregateReportRuntime);
	const aggregateCalls: string[] = [];
	const runId = `docs-orch-${Math.floor(Math.random() * 1e9).toString(16)}`;
	const routing = { router: { resolveProviderForRole: (role: string) => {
		const completeStructured = async (messages: LLMMessage[], schema: { required?: string[] }): Promise<unknown> => {
			if (role === 'analyze.aggregate') {
				aggregateCalls.push(String(messages[1]?.content).slice(0, 40));
				return (schema.required ?? []).length === 1 ? { summary: 'the executive summary of the whole docs report' } : { summary: 'a part of the docs report that covers its files', findings: [{ title: 'T', detail: 'D', sources: ['t01'] }] };
			}
			return smallest(schema);
		};
		return { provider: { inputBudgetChars: 16_000 + 20_000, completeStructured } as unknown as LLMProvider };
	} } } as unknown as RoutingSeamContext;
	try {
		const result = await runWithRoutingContext(routing, () => runAnalyze({ runId, userPrompt: 'what do the docs say', scopeRef: { kind: 'repo', value: small }, targetHint: 'docs' }));
		assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.error).slice(0, 400));
		if (!result.ok) return;
		const final = result.finalReport as { summary: string };
		assert.ok(final !== undefined, 'a final report is delivered');
		// The head states the completeness and how the answer steps were handled; the body is the combined summary.
		const head = final.summary.split('\n\n')[0]!.split('\n');
		assert.ok(head.some(l => /^Handling: divided into \d+ parts?/.test(l)), head.join(' | '));
		assert.ok(final.summary.endsWith('the executive summary of the whole docs report'));
		assert.equal(result.report?.handling?.method, 'partitioned');
		assert.ok(aggregateCalls.length >= 3, 'the oversized terminal input was answered in parts and combined');
		// The stored run record carries the same report and final report.
		assert.deepEqual(readRunRecord(runId)?.report?.handling, result.report?.handling);
	} finally { purgeRunForTests(runId); }
});
