/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: code.aggregate.report
 *
 * Terminal aggregator for code-target plans. Delegates to the
 * shared aggregator base (runAggregator) for the LLM call; this
 * module only contributes:
 *   - the per-target prompt path (prompts/analyze/code.aggregate.system.md)
 *   - target='code' stamping in the report metadata
 *
 * Output:
 *   { report: AggregateReport { summary, findings[], metadata } }
 *
 * Failure modes (surface to the executor as TaskExecutionRecord.error):
 *   - 'aggregator prompt missing: <path>'        -> prompt file ENOENT
 *   - 'aggregator-llm-unavailable: <msg>'        -> Ollama down etc.
 *   - 'aggregator-schema-unrecoverable: <msg>'   -> retries exhausted
 *
 * The executor wraps these as 'runtime-threw: <msg>' so callers see
 * the underlying classification in the task record's error field.
 */

import { runAggregator } from '../shared/aggregator.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import type { AnalyzeScope } from '../../../shared/analyze-types.js';

export const CODE_AGGREGATE_PROMPT_PATH = 'prompts/analyze/code.aggregate.system.md';

export const codeAggregateReportRuntime: TemplateRuntime = {
	templateId: 'code.aggregate.report',

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const report = await runAggregator({
			promptRelPath:   CODE_AGGREGATE_PROMPT_PATH,
			target:          'code',
			scope:           args.intent.scope as AnalyzeScope,
			runId:           args.runId,
			upstreamOutputs: args.upstreamOutputs,
			...(args.intent.focus !== undefined ? { focus: args.intent.focus } : {}),
		});

		return {
			outputs: new Map<string, unknown>([['report', report]]),
		};
	},
};
