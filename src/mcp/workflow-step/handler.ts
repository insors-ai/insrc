/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level dispatcher for `insrc_workflow_step`. Mirrors the shape
 * of `mcp/analyze-step/handler.ts`.
 */

import { appendFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { handlePlan } from './phases/plan.js';
import { handleResolveQuestion } from './phases/resolve-question.js';
import { handleReviewDeferred } from './phases/review-deferred.js';
import { handleStart } from './phases/start.js';
import { handleStep } from './phases/step.js';
import { handleSynthesize } from './phases/synthesize.js';
import type {
	WorkflowStepInput,
	WorkflowStepMcpEnvelope,
	WorkflowStepOutput,
	WorkflowStepError,
} from './types.js';

const TRACE_PATH = process.env['INSRC_WORKFLOW_STEP_TRACE'];

const log = getLogger('mcp:workflow-step:handler');

export async function handleWorkflowStep(input: unknown): Promise<WorkflowStepMcpEnvelope> {
	const result = await dispatch(input);
	if (TRACE_PATH !== undefined) {
		try {
			appendFileSync(
				TRACE_PATH,
				JSON.stringify({ input, output: result }) + '\n',
				'utf8',
			);
		} catch { /* trace is best-effort */ }
	}
	return {
		content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
		...(result.next === 'error' ? { isError: true } : {}),
	};
}

async function dispatch(input: unknown): Promise<WorkflowStepOutput> {
	if (typeof input !== 'object' || input === null || !('phase' in input)) {
		return errorResult(
			'bad-input',
			'insrc_workflow_step: input must be an object with a `phase` field.',
			false,
		);
	}
	const step = input as WorkflowStepInput;
	try {
		switch (step.phase) {
			case 'start':            return await handleStart(step);
			case 'plan':             return await handlePlan(step);
			case 'step':             return await handleStep(step);
			case 'synthesize':       return await handleSynthesize(step);
			case 'resolve_question': return await handleResolveQuestion(step);
			case 'review_deferred':  return await handleReviewDeferred(step);
			default:
				return errorResult(
					'bad-phase',
					`insrc_workflow_step: unknown phase '${(step as { phase: string }).phase}'. ` +
					`Expected 'start' | 'plan' | 'step' | 'synthesize' | 'resolve_question' | 'review_deferred'.`,
					false,
				);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ phase: step.phase, err: msg }, 'insrc_workflow_step: uncaught error');
		return errorResult('internal', msg, false);
	}
}

function errorResult(code: string, message: string, retryable: boolean): WorkflowStepError {
	return {
		next:  'error',
		error: { code, message, retryable },
	};
}
