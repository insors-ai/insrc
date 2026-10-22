/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level dispatcher for `insrc_workflow_step`. Mirrors the shape
 * of `daemon/steps/analyze-step/handler.ts`.
 */

import { appendFileSync } from 'node:fs';

import { getLogger } from '../../../shared/logger.js';
import { TeamGateRefusedError } from '../../../workflow/team/gate.js';
import type { ResumeDeps } from '../../../workflow/team/handoff.js';
import type { ApplyDeps } from './resume.js';
import { handlePark } from './phases/park.js';
import { handlePlan } from './phases/plan.js';
import { handleResume } from './phases/resume.js';
import { handleResolveQuestion } from './phases/resolve-question.js';
import { handleReviewDeferred } from './phases/review-deferred.js';
import { handleStart } from './phases/start.js';
import { handleStep } from './phases/step.js';
import { handleSynthesize } from './phases/synthesize.js';
import { repoSchemaRefusalOfInput } from '../../repo-schema-guard.js';
import type {
	WorkflowStepInput,
	WorkflowStepMcpEnvelope,
	WorkflowStepOutput,
	WorkflowStepError,
} from './types.js';

const TRACE_PATH = process.env['INSRC_WORKFLOW_STEP_TRACE'];

const log = getLogger('mcp:workflow-step:handler');

/** Test seam: the git, registry and write dependencies the park and resume phases run with. */
let handoffDeps: ResumeDeps & ApplyDeps = {};
export function _setHandoffDepsForTests(deps: ResumeDeps & ApplyDeps = {}): void { handoffDeps = deps; }

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
	const refusal = repoSchemaRefusalOfInput(step);
	if (refusal !== undefined) return errorResult('repo-schema-unconverted', refusal, false);
	try {
		switch (step.phase) {
			case 'start':            return await handleStart(step);
			case 'plan':             return await handlePlan(step);
			case 'step':             return await handleStep(step);
			case 'synthesize':       return await handleSynthesize(step);
			case 'resolve_question': return await handleResolveQuestion(step);
			case 'review_deferred':  return await handleReviewDeferred(step);
			case 'park':             return await handlePark(step, handoffDeps);
			case 'resume':           return await handleResume(step, handoffDeps);
			default:
				return errorResult(
					'bad-phase',
					`insrc_workflow_step: unknown phase '${(step as { phase: string }).phase}'. ` +
					`Expected 'start' | 'plan' | 'step' | 'synthesize' | 'resolve_question' | 'review_deferred' | 'park' | 'resume'.`,
					false,
				);
		}
	} catch (err) {
		// The team gate refused the action: say so with its own code and the reason (it names the holder).
		if (err instanceof TeamGateRefusedError) return errorResult('team-gate-refused', err.reason, false);
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
