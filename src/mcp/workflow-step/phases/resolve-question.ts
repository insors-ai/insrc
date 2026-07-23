/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_workflow_step` phase='resolve_question'.
 *
 * Records the human's answer to ONE open question on the consuming stage's
 * IMMEDIATE-UPSTREAM artifact (design.epic→DEF, design.story→HLD, plan→LLD),
 * re-renders + commits that artifact, comments on its tracker issue, and
 * returns the next unresolved question (with fresh options) or
 * `{ next: 'ready' }` when none remain (re-call phase='start' to proceed).
 *
 * Pre-run gate: no `state` token — the upstream artifact is addressed by
 * `workflow` + `params`. The controller presents each question to the human;
 * this handler just records the answer.
 */

import { getLogger } from '../../../shared/logger.js';
import { resolveRepoPath } from '../../resolve-repo.js';
import { assertEpicHash } from '../../../workflow/hash.js';
import { questionsWithOptions, recordResolution } from '../../../workflow/questions.js';
import type { QuestionResolutionStatus } from '../../../workflow/types.js';
import { storyIdParam, upstreamKindFor } from '../questions-gate.js';
import type {
	WorkflowStepError,
	WorkflowStepInputResolveQuestion,
	WorkflowStepReady,
	WorkflowStepResolveQuestions,
} from '../types.js';

const log = getLogger('mcp:workflow-step:resolve-question');


export async function handleResolveQuestion(
	input: WorkflowStepInputResolveQuestion,
): Promise<WorkflowStepResolveQuestions | WorkflowStepReady | WorkflowStepError> {
	const repoPath = await resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		return err('no-repo', `insrc_workflow_step[resolve_question]: no repo. Pass \`repo\` or set INSRC_REPO.`);
	}
	if (typeof input.questionId !== 'string' || input.questionId.length === 0) {
		return err('bad-input', `insrc_workflow_step[resolve_question]: questionId is required.`);
	}
	const kind = upstreamKindFor(input.workflow);
	if (kind === undefined) {
		return err(
			'not-a-gated-stage',
			`insrc_workflow_step[resolve_question]: workflow '${input.workflow}' has no gated upstream artifact. ` +
			`Only design.epic / design.story / plan resolve open questions.`,
		);
	}
	const params = input.params ?? {};
	const epicHash = params['epicHash'];
	try {
		assertEpicHash(epicHash, `insrc_workflow_step[resolve_question]: workflow '${input.workflow}' requires params.epicHash`);
	} catch (e) {
		return err('bad-input', e instanceof Error ? e.message : String(e));
	}
	const storyId = kind === 'lld' ? storyIdParam(params) : undefined;
	if (kind === 'lld' && storyId === undefined) {
		return err('bad-input', `insrc_workflow_step[resolve_question]: workflow '${input.workflow}' requires params.storyId.`);
	}

	// resolve (with choice) | defer | ignore — exactly one intent.
	const status: QuestionResolutionStatus = input.defer === true
		? 'deferred'
		: input.ignore === true
			? 'ignored'
			: 'resolved';
	if (status === 'resolved' && (typeof input.choice !== 'string' || input.choice.length === 0)) {
		return err('bad-input', `insrc_workflow_step[resolve_question]: pass a \`choice\`, or set \`defer:true\` / \`ignore:true\`.`);
	}

	let remainingOpen;
	try {
		const res = recordResolution(
			repoPath, kind, epicHash, storyId, input.questionId, status,
			input.choice, input.rationale,
		);
		remainingOpen = res.remainingOpen;
	} catch (e) {
		return err('unknown-question', e instanceof Error ? e.message : String(e));
	}

	log.info({ workflow: input.workflow, kind, epicHash, storyId, questionId: input.questionId, status }, 'insrc_workflow_step[resolve_question]: recorded');

	if (remainingOpen.length === 0) {
		return { next: 'ready', message: `all upstream questions resolved; call phase=start again to proceed` };
	}
	const context = `${input.workflow} start — upstream ${kind.toUpperCase()}${storyId !== undefined ? ` (Story ${storyId})` : ''}`;
	const questions = await questionsWithOptions(remainingOpen, context);
	return { next: 'resolve_questions', questions };
}

function err(code: string, message: string): WorkflowStepError {
	return { next: 'error', error: { code, message, retryable: false } };
}
