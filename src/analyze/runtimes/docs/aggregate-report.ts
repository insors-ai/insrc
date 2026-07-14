/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: docs.aggregate.report
 *
 * Terminal aggregator for docs-target plans. Delegates to the
 * shared aggregator base for the LLM call; this module contributes
 * the docs-specific prompt path + target stamping.
 *
 * Same wire-shape as other target aggregators -- callers get a
 * uniform AggregateReport regardless of target.
 */

import { runAggregator } from '../shared/aggregator.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import type { AnalyzeScope } from '../../../shared/analyze-types.js';

export const DOCS_AGGREGATE_PROMPT_PATH = 'prompts/analyze/docs.aggregate.system.md';

export const docsAggregateReportRuntime: TemplateRuntime = {
	templateId: 'docs.aggregate.report',

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const report = await runAggregator({
			promptRelPath:   DOCS_AGGREGATE_PROMPT_PATH,
			target:          'docs',
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
