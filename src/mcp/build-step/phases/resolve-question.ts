/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_build_step` phase='resolve_question'.
 *
 * Records the human's answer to ONE open question into the Story LLD
 * (`meta.questionResolutions`), re-renders + commits the LLD, posts a summary
 * on the Story issue, and returns the next unresolved question (with fresh
 * options) or `{ next: 'ready' }` when none remain.
 *
 * The controller is what presents each question to the human; this handler
 * just records the answer.
 */

import { getLogger } from '../../../shared/logger.js';
import { readLldArtifact } from '../../../workflow/gates.js';
import type { QuestionResolution } from '../../../workflow/artifacts/lld.js';
import { resolveRepoPath, resolveTaskRef } from '../render.js';
import { deriveQuestionId, questionsWithOptions, unresolvedQuestions } from '../questions.js';
import { commitAndCommentResolution, persistResolution } from '../resolutions.js';
import type {
	BuildStepError,
	BuildStepInputResolveQuestion,
	BuildStepReady,
	BuildStepResolveQuestions,
} from '../types.js';

const log = getLogger('mcp:build-step:resolve-question');

export async function handleResolveQuestion(
	input: BuildStepInputResolveQuestion,
): Promise<BuildStepResolveQuestions | BuildStepReady | BuildStepError> {
	const repoPath = resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		return err('no-repo', `insrc_build_step[resolve_question]: no repo. Pass \`repo\` or set INSRC_REPO.`);
	}
	if (typeof input.questionId !== 'string' || input.questionId.length === 0) {
		return err('bad-input', `insrc_build_step[resolve_question]: questionId is required.`);
	}
	const resolved = resolveTaskRef(repoPath, input.target);
	if (!resolved.ok) return err('unresolved-target', resolved.message);
	const ref = resolved.ref;

	const lld = readLldArtifact(repoPath, ref.epicHash, ref.storyId);

	// Find the open question this id names (verbatim text for the record).
	const questionText = lld.body.openQuestions.find(q => deriveQuestionId(q) === input.questionId);
	if (questionText === undefined) {
		return err(
			'unknown-question',
			`insrc_build_step[resolve_question]: no open question with id '${input.questionId}' on LLD for Story '${ref.storyId}'.`,
		);
	}

	const ignore = input.ignore === true;
	if (!ignore && (typeof input.choice !== 'string' || input.choice.length === 0)) {
		return err('bad-input', `insrc_build_step[resolve_question]: pass a \`choice\` or set \`ignore:true\`.`);
	}

	const resolution: QuestionResolution = {
		question:   questionText,
		status:     ignore ? 'ignored' : 'resolved',
		...(ignore ? {} : { choice: input.choice! }),
		...(typeof input.rationale === 'string' && input.rationale.length > 0 ? { rationale: input.rationale } : {}),
		resolvedAt: new Date().toISOString(),
	};

	const persisted = persistResolution(repoPath, ref.epicHash, ref.storyId, ref.epicSlug, input.questionId, resolution);

	const summary = ignore
		? `Build open question \`${input.questionId}\` for Story ${ref.storyId} left to implementer judgment` +
			`${resolution.rationale ? `: ${resolution.rationale}` : '.'}`
		: `Build open question \`${input.questionId}\` for Story ${ref.storyId} resolved: ${resolution.choice}` +
			`${resolution.rationale ? ` (${resolution.rationale})` : '.'}`;
	commitAndCommentResolution(repoPath, persisted, ref.storyRef, summary);

	log.info({ taskId: ref.taskId, storyId: ref.storyId, questionId: input.questionId, status: resolution.status }, 'insrc_build_step[resolve_question]: recorded');

	// Next unresolved question, or ready.
	const remaining = unresolvedQuestions(persisted.lld);
	if (remaining.length === 0) {
		return { next: 'ready', message: 'all questions resolved; call implement again' };
	}
	const storyContext = `${ref.epicSlug} / ${ref.storyId} — Task ${ref.taskId} (${ref.task.title})`;
	const questions = await questionsWithOptions(remaining, storyContext);
	return { next: 'resolve_questions', questions };
}

function err(code: string, message: string): BuildStepError {
	return { next: 'error', error: { code, message, retryable: false } };
}
