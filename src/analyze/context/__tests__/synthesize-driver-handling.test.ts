/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivered report on the ordinary success path (LLD-b9d5c5c40df5a574-s3,
 * task t8): through the real context driver, the answer step's handling reaches
 * the report the bundle is stamped with. The lookups and the model are
 * stand-ins; the driver, the real synthesizer and its prompt are real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { savedAnalysisExecution } from '../../connection-access.js';
import { ModelResponseShapeError } from '../../../agent/providers/model-call-error.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import { buildCompleteness } from '../../completeness.js';
import type { ExecutedPlan, ExplorationPlan } from '../../explore/types.js';
import type { RequestMeasure } from '../../measure.js';
import {
	ShaperAnswerStepFailedError, _fallbackFreeformPlanForTest, _runExplorationPipelineForTest as pipeline,
} from '../driver.js';
import type { PipelineOutcome, PipelineSteps } from '../driver.js';
import type { ResolvedScope } from '../scope.js';
import { synthesizeHandled } from '../synthesizer.js';

const REPO = '/work/app';
const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });
const LAYERS = { system: 'code-shaper', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: '' };
// The model writing a report of its own: the delivered one must never be this.
const MODEL_REPORT = { completeness: { complete: false, incomplete: [{ sourceId: 'model', sourceKind: 'lookup', reason: 'invented' }], failed: [] }, handling: { method: 'single-pass', parts: 99, notCovered: [], budgets: [] } };

const intent = (scope: ClassifiedIntent['scope']): ClassifiedIntent =>
	({ target: 'code', scope, focused: true, focus: 'how does settlement work', scopeRef: { kind: 'repo', value: REPO }, reasoning: 'r' });
const scope: ResolvedScope = { kind: 'repo', value: REPO, repoPath: REPO, lookupPath: REPO };

function planOf(count: number): ExplorationPlan {
	return { answerType: 'how-does-it-work', synthesisHint: 'walk the flow', explorations: Array.from({ length: count }, (_, i) => ({ id: `e${i + 1}`, type: 'search.text', purpose: 'p', params: {} })) } as unknown as ExplorationPlan;
}

async function drive(args: { size: ClassifiedIntent['scope']; evidence: number; chars: number; budget: number; respond: (prompt: string, combine: boolean) => unknown }): Promise<PipelineOutcome> {
	const provider = {
		inputBudgetChars: 16_000 + args.budget,
		completeStructured: async (messages: LLMMessage[], schema: { required?: string[] }) => {
			const out = args.respond(String(messages[1]?.content), (schema.required ?? []).length === 3);
			if (out instanceof Error) throw out;
			return out;
		},
	} as unknown as LLMProvider;
	const steps: PipelineSteps = {
		decompose: async () => planOf(args.evidence),
		executePlan: async (a) => ({
			plan: a.plan,
			results: a.plan.explorations.map((e, i) => ({
				exploration: e, cached: false, elapsedMs: 0,
				output: { type: 'search.text', completeness: WHOLE, hits: [{ file: `src/m${i}.ts`, line: i + 1, snippet: `code${i} ${'c'.repeat(args.chars)}` }] } as never,
			})),
			elapsedMs: 0, cacheHits: 0, cacheMisses: 0,
		}) as unknown as ExecutedPlan,
		synthesize: async () => { throw new Error('the unhandled synthesize must not be used when synthesizeHandled is given'); },
		synthesizeHandled: a => synthesizeHandled({ ...a, provider }),
		fallbackFreeformPlan: _fallbackFreeformPlanForTest,
		lastIndexedAt: async () => 1_700_000_000_000,
		measureArea: async (_s, _t, hint) => ({ source: 'named-area', items: 600, files: 100, characters: null, size: 'M', determined: true, ...(hint !== undefined ? { sizeHint: hint } : {}) }) as RequestMeasure,
	};
	return pipeline({ connectionExecution: savedAnalysisExecution(REPO), invocationMode: 'run', shaperId: 'code', inputs: { intent: intent(args.size) } as never, runId: 'r1', scope }, steps);
}

const part = (prompt: string): unknown => ({ ...LAYERS, report: MODEL_REPORT, summary: `covers ${[...prompt.matchAll(/code(\d)/g)].map(m => m[1]).join(',')}` });
const respond = (prompt: string, combine: boolean): unknown => (combine ? { system: 'S', focus: 'F', summary: 'combined' } : part(prompt));

function foundOf(outcome: PipelineOutcome) {
	assert.equal(outcome.kind, 'bundle', JSON.stringify(outcome).slice(0, 300));
	return (outcome as Extract<PipelineOutcome, { kind: 'bundle' }>).found;
}

test('through the real context driver a partitioned success, a failed part and the combine fallback deliver the report with handling, uncovered parts and complete false; single pass keeps lookup completeness; the model\'s own report is never used', async () => {
	// A single pass: the lookups' completeness is kept, and the handling says single pass.
	const single = foundOf(await drive({ size: 'S', evidence: 2, chars: 300, budget: 60_000, respond: () => ({ ...LAYERS, report: MODEL_REPORT }) }));
	assert.equal(single.report.completeness.complete, true);
	assert.equal(single.report.handling?.method, 'single-pass');
	assert.equal(single.report.handling?.parts, 1);
	assert.notEqual(single.report.handling?.parts, 99, 'the model\'s own report is never used');
	assert.deepEqual(single.report.completeness.incomplete, []);

	// A partitioned success: the handling is the partitioned handling, nothing uncovered, the lookups' completeness kept.
	const ok = foundOf(await drive({ size: 'L', evidence: 8, chars: 4_500, budget: 20_000, respond }));
	assert.equal(ok.report.handling?.method, 'partitioned');
	assert.ok((ok.report.handling?.parts ?? 0) >= 3);
	assert.deepEqual(ok.report.handling?.notCovered, []);
	assert.equal(ok.report.completeness.complete, true);

	// A failed part: named in the handling, in the incomplete sources, and complete is false.
	const failed = foundOf(await drive({
		size: 'L', evidence: 8, chars: 4_500, budget: 20_000,
		respond: (prompt, combine) => (!combine && prompt.includes('code3 ') ? new ModelResponseShapeError('reply failed validation', ['bad']) : respond(prompt, combine)),
	}));
	assert.ok((failed.report.handling?.notCovered.length ?? 0) >= 1);
	assert.equal(failed.report.completeness.complete, false);
	const uncovered = failed.report.handling?.notCovered.map(n => n.part) ?? [];
	assert.deepEqual(failed.report.completeness.incomplete.map(n => n.sourceId), uncovered.map(p => `answer step / ${p}`));
	assert.ok(failed.report.completeness.incomplete.every(n => n.sourceKind === 'lookup'));

	// The combine fallback: the per-part results are delivered with 'combine' in notCovered and complete false.
	const fallback = foundOf(await drive({
		size: 'L', evidence: 8, chars: 4_500, budget: 20_000,
		respond: (prompt, combine) => (combine ? new ModelResponseShapeError('reply failed validation', ['bad']) : part(prompt)),
	}));
	assert.deepEqual(fallback.report.handling?.notCovered.map(n => n.part), ['combine']);
	assert.equal(fallback.report.completeness.complete, false);
	assert.deepEqual(fallback.report.completeness.incomplete.map(n => n.sourceId), ['answer step / combine']);

	// A divided call that covers no part ends in the typed failure, carrying the results and the report; the driver passes it through.
	await assert.rejects(
		drive({ size: 'L', evidence: 3, chars: 4_500, budget: 20_000, respond: () => new ModelResponseShapeError('reply failed validation', ['bad']) }),
		(err: unknown) => err instanceof ShaperAnswerStepFailedError && err.reason === 'invalid-answer' && err.found.results.length === 3 && err.found.report.handling?.method === 'partitioned',
	);
});
