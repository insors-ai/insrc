/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: infra.aggregate.report
 *
 * Terminal aggregator for infra-target plans. Thin wrapper around
 * the shared runAggregator base; contributes:
 *   - the per-target prompt path (prompts/analyze/infra.aggregate.system.md)
 *   - target='infra' stamping in the report metadata
 */

import { runAggregator } from '../shared/aggregator.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import type { AnalyzeScope } from '../../../shared/analyze-types.js';

export const INFRA_AGGREGATE_PROMPT_PATH = 'prompts/analyze/infra.aggregate.system.md';

export const infraAggregateReportRuntime: TemplateRuntime = {
	templateId: 'infra.aggregate.report',

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const report = await runAggregator({
			promptRelPath:   INFRA_AGGREGATE_PROMPT_PATH,
			target:          'infra',
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
