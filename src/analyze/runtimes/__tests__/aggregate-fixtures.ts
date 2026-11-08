import '../../orchestrator/__tests__/private-paths.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** Fixtures shared by the aggregate tests of Story s3 task t10: a stand-in model behind the routing seam, and the plan walk. */

import { ModelCallFailedError, ModelResponseShapeError } from '../../../agent/providers/model-call-error.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import { buildCompleteness } from '../../completeness.js';
import type { RoutingSeamContext } from '../../context/role-router.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import { readTaskOutput } from '../../executor/cache.js';
import { registerTemplateRuntime, runExecutor, _resetRuntimeRegistryForTests } from '../../executor/index.js';
import type { PlanTask, PlannedTask, TemplateExecuteArgs, TemplateRuntime, UpstreamOutput } from '../../executor/types.js';
import type { PlanTreeNode } from '../../planner/recursive.js';
import { docsAggregateReportRuntime } from '../docs/aggregate-report.js';

void ModelCallFailedError; void ModelResponseShapeError;

export const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });
export const intent = (scope: ClassifiedIntent['scope']): ClassifiedIntent =>
	({ target: 'docs', scope, focused: true, focus: 'what the docs say about refunds', scopeRef: { kind: 'repo', value: '/work/app' }, reasoning: 'r' });

export interface Run { provider: LLMProvider; prompts: string[] }
export function model(respond: (prompt: string, combine: boolean) => unknown, limitChars = 60_000): Run {
	const prompts: string[] = [];
	const provider = {
		inputBudgetChars: 16_000 + limitChars,
		completeStructured: async (messages: LLMMessage[], schema: { required?: string[] }) => {
			const prompt = String(messages[1]?.content);
			prompts.push(prompt);
			const out = respond(prompt, (schema.required ?? []).length === 1);
			if (out instanceof Error) throw out;
			return out;
		},
	} as unknown as LLMProvider;
	return { provider, prompts };
}
export const routing = (run: Run): RoutingSeamContext => ({ router: { resolveProviderForRole: () => ({ provider: run.provider }) } }) as unknown as RoutingSeamContext;

export const big = (n: number, size: number): UpstreamOutput[] => Array.from({ length: n }, (_, i) => ({
	taskId: `t0${i + 1}`, template: 'docs.discovery.inventory', params: { dir: `docs/d${i}` }, value: { files: [`docs/d${i}/a.md`], text: `body${i} ${'x'.repeat(size)}` },
}));
export const reply = (prompt: string) => ({ summary: `a summary that covers ${[...prompt.matchAll(/body(\d)/g)].map(m => m[1]).join(',') || 'nothing'}`, findings: [{ title: `T`, detail: `D`, sources: ['t01'] }] });
export const respond = (prompt: string, combine: boolean): unknown => (combine ? { summary: 'the executive summary of the whole report' } : reply(prompt));

let n = 0;
export const leaf = (value: unknown, params: Record<string, unknown> = {}): TemplateRuntime => ({
	templateId: 'demo.leaf',
	execute: async (args: TemplateExecuteArgs) => ({ outputs: new Map(args.task.produces.map(name => [name, value])), completeness: WHOLE, ...({ params } as object) }),
});
export function task(over: Partial<PlannedTask> & { taskId: string }): PlannedTask {
	return { template: 'demo.leaf', kind: 'leaf', params: { dir: 'docs' }, produces: ['out'], rationale: 'fixture task for the aggregate failure tests', ...over };
}
export function plan(scope: PlanTask['scope'], tasks: PlannedTask[]): PlanTask {
	return { planId: 'p', goal: 'g', target: 'docs', scope, reasoning: 'fixture plan for the aggregate failure tests', tasks };
}
export const node = (p: PlanTask, children = new Map<string, PlanTreeNode>()): PlanTreeNode => ({ plan: p, children, childErrors: new Map() });
export const runIdOf = (label: string): string => `aggregate-failure-${label}-${++n}-${Math.floor(Math.random() * 1e9).toString(16)}`;

export async function runAggregate(scope: ClassifiedIntent['scope'], value: unknown, run: Run, runId: string) {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(leaf(value));
	registerTemplateRuntime(docsAggregateReportRuntime);
	const tree = node(plan(scope, [
		task({ taskId: 't01', produces: ['inventory'] }),
		task({ taskId: 't02', template: 'docs.aggregate.report', produces: ['report'], consumes: ['inventory'] }),
	]));
	const executed = await runWithRoutingContext(routing(run), () => runExecutor({ tree, intent: intent(scope), runId }));
	return { executed, record: executed.root.perTask.get('t02')!, stored: readTaskOutput(runId, 't02') };
}

