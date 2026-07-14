/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: docs.decision.trace
 *
 * Thin wrapper around the shared runner at
 * `analyze/explore/doc-decision-trace.ts`. Same primitive powers
 * the shaper-level exploration (`doc.decision.trace`) and this
 * template runtime -- guaranteed identical output for the same
 * params. See plans/exploration-based-context-build.md Section 4.2.
 */

import { getDb } from '../../../db/client.js';

import {
	DOC_DECISION_TRACE_PROMPT_PATH as SHARED_PROMPT_PATH,
	runSharedDocDecisionTrace,
} from '../../explore/doc-decision-trace.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';

const TEMPLATE_ID = 'docs.decision.trace';

export const docsDecisionTraceRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const params = args.task.params as Record<string, unknown>;
		const topic  = params['topic'];
		if (typeof topic !== 'string' || topic.trim().length === 0) {
			throw new Error(`${TEMPLATE_ID}: params.topic is required (non-empty string)`);
		}
		const maxSources = typeof params['maxSources'] === 'number'
			? params['maxSources'] as number
			: undefined;

		const db = await getDb();
		const output = await runSharedDocDecisionTrace({
			topic:      topic.trim(),
			repoPath:   args.intent.scopeRef.value,
			db,
			...(maxSources !== undefined ? { maxSources } : {}),
			runId:      args.runId,
			logContext: `template:${args.task.taskId}`,
		});

		// Strip the type discriminator so the template output shape
		// matches the pre-refactor contract (planner-visible schema).
		const { type: _type, ...templateShape } = output;
		return {
			outputs: new Map<string, unknown>([['decision-trace', templateShape]]),
		};
	},
};

// Re-export the prompt path so the boot validator can pick it up
// through the runtimes/docs barrel unchanged.
export const DOCS_DECISION_TRACE_PROMPT_PATH = SHARED_PROMPT_PATH;
