/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: data.aggregate.report
 *
 * Terminal aggregator for data-target plans. Thin wrapper around
 * the shared runAggregator base; contributes:
 *   - the per-target prompt path (prompts/analyze/data.aggregate.system.md)
 *   - target='data' stamping in the report metadata
 */

import { runAggregator } from '../shared/aggregator.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import type { AnalyzeScope } from '../../../shared/analyze-types.js';

export const DATA_AGGREGATE_PROMPT_PATH = 'prompts/analyze/data.aggregate.system.md';

export const dataAggregateReportRuntime: TemplateRuntime = {
	templateId: 'data.aggregate.report',

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const report = await runAggregator({
			promptRelPath:   DATA_AGGREGATE_PROMPT_PATH,
			target:          'data',
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
