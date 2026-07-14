/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: generic.aggregate.report
 *
 * Terminal aggregator for generic-target plans (intents that don't
 * fit code / data / infra cleanly -- e.g. cross-target documentation
 * synthesis, freeform Q&A, multi-domain summaries). Delegates to
 * the shared aggregator base for the LLM call; this module
 * contributes:
 *   - the per-target prompt path (prompts/analyze/generic.aggregate.system.md)
 *   - target='generic' stamping in the report metadata
 *
 * Same wire-shape as code.aggregate.report -- callers get a
 * uniform AggregateReport regardless of which target's aggregator
 * produced it.
 */

import { runAggregator } from '../shared/aggregator.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import type { AnalyzeScope } from '../../../shared/analyze-types.js';

export const GENERIC_AGGREGATE_PROMPT_PATH = 'prompts/analyze/generic.aggregate.system.md';

export const genericAggregateReportRuntime: TemplateRuntime = {
	templateId: 'generic.aggregate.report',

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const report = await runAggregator({
			promptRelPath:   GENERIC_AGGREGATE_PROMPT_PATH,
			target:          'generic',
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
