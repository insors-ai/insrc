/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: docs.constraint.enumerate
 *
 * Thin wrapper around the shared runner at
 * `analyze/explore/doc-constraint-enumerate.ts`. Same primitive
 * powers the shaper-level exploration + this template runtime.
 * See docs/plans/exploration-based-context-build.md Section 4.2.
 */

import { getDb } from '../../../db/client.js';

import {
	DOC_CONSTRAINT_ENUMERATE_PROMPT_PATH as SHARED_PROMPT_PATH,
	runSharedDocConstraintEnumerate,
} from '../../explore/doc-constraint-enumerate.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';

import { docsAreaOf, graphRepoOf, resolveTaskScope } from '../shared/task-scope.js';

const TEMPLATE_ID = 'docs.constraint.enumerate';

export const docsConstraintEnumerateRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const params  = args.task.params as Record<string, unknown>;
		const subject = params['subject'];
		if (typeof subject !== 'string' || subject.trim().length === 0) {
			throw new Error(`${TEMPLATE_ID}: params.subject is required (non-empty string)`);
		}
		const maxSources = typeof params['maxSources'] === 'number'
			? params['maxSources'] as number
			: undefined;

		// The one scope function: the kinds a docs task accepts, the repo whose
		// documents it reads, and the area of that repo retrieval keeps to.
		const scope    = await resolveTaskScope(args.intent.scopeRef, 'docs', TEMPLATE_ID);
		const repoPath = graphRepoOf(scope);
		const area     = docsAreaOf(scope);

		const db = await getDb();
		const output = await runSharedDocConstraintEnumerate({
			subject:    subject.trim(),
			repoPath,
			db,
			...(area !== undefined ? { area } : {}),
			...(maxSources !== undefined ? { maxSources } : {}),
			runId:      args.runId,
			logContext: `template:${args.task.taskId}`,
		});

		// The shared lookup built the record; it is the task's record, not part of its output.
		const { type: _type, completeness, ...templateShape } = output;
		return {
			outputs: new Map<string, unknown>([['constraints', templateShape]]),
			completeness,
		};
	},
};

export const DOCS_CONSTRAINT_ENUMERATE_PROMPT_PATH = SHARED_PROMPT_PATH;
