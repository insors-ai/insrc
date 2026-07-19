/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_build_step` phase='implement'.
 *
 * Resolve the task, run the admission gate, then (stage 3) the open-question
 * gate, and finally return the rendered implement prompt. The CONTROLLER runs
 * the returned prompt — the daemon does NOT edit code here.
 */

import { getLogger } from '../../../shared/logger.js';
import { readLldArtifact } from '../../../workflow/gates.js';
import { admitBuild } from '../../../workflow/runners/build/admission.js';
import { renderImplementPrompt, resolveRepoPath, resolveTaskRef } from '../render.js';
import { questionsWithOptions, unresolvedQuestions } from '../questions.js';
import { renderResolvedDecisions } from '../resolutions.js';
import type {
	BuildStepError,
	BuildStepImplement,
	BuildStepInputImplement,
	BuildStepRefused,
	BuildStepResolveQuestions,
} from '../types.js';

const log = getLogger('mcp:build-step:implement');

export async function handleImplement(
	input: BuildStepInputImplement,
): Promise<BuildStepImplement | BuildStepRefused | BuildStepResolveQuestions | BuildStepError> {
	const repoPath = resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		return err('no-repo', `insrc_build_step[implement]: no repo. Pass \`repo\` or set INSRC_REPO.`);
	}
	const resolved = resolveTaskRef(repoPath, input.target);
	if (!resolved.ok) return err('unresolved-target', resolved.message);
	const ref = resolved.ref;

	// Admission gate — refuse when the Story's plan is missing / unapproved /
	// stale. Read-only; the tree is untouched.
	const verdict = admitBuild(repoPath, ref.epicHash, ref.storyId);
	if (!verdict.admitted) {
		log.info(
			{ taskId: ref.taskId, storyId: ref.storyId, reason: verdict.refusal.reason },
			'insrc_build_step[implement]: admission refused',
		);
		return { next: 'refused', refusal: verdict.refusal };
	}

	// Open-question gate — scope is the Story LLD ONLY. Any UNRESOLVED
	// openQuestion blocks implement: the daemon formalizes each into options +
	// a recommendation and returns them for the controller to put to the human.
	const lld = readLldArtifact(repoPath, ref.epicHash, ref.storyId);
	const unresolved = unresolvedQuestions(lld);
	if (unresolved.length > 0) {
		log.info(
			{ taskId: ref.taskId, storyId: ref.storyId, unresolved: unresolved.length },
			'insrc_build_step[implement]: unresolved open questions — gating',
		);
		const storyContext = `${ref.epicSlug} / ${ref.storyId} — Task ${ref.taskId} (${ref.task.title})`;
		const questions = await questionsWithOptions(unresolved, storyContext);
		return { next: 'resolve_questions', questions };
	}

	// No unresolved questions — inject the recorded resolutions into the
	// template's "## Resolved design decisions" section and hand off.
	const prompt = renderImplementPrompt(repoPath, ref, renderResolvedDecisions(lld));
	log.info({ taskId: ref.taskId, storyId: ref.storyId, workflowId: ref.workflowId }, 'insrc_build_step[implement]: emitting prompt');
	return {
		next:       'implement',
		taskId:     ref.taskId,
		workflowId: ref.workflowId,
		issueRef:   ref.issueRef,
		prompt,
	};
}

function err(code: string, message: string): BuildStepError {
	return { next: 'error', error: { code, message, retryable: false } };
}
