/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_build_step` phase='implement'.
 *
 * Resolve the task, run the admission gate, then return the rendered implement
 * prompt. The CONTROLLER runs the returned prompt — the daemon does NOT edit
 * code here.
 *
 * There is NO open-question gate at build: open questions are resolved at the
 * START of each consuming stage on its immediate-upstream artifact (see
 * `workflow/questions.ts` + `insrc_workflow_step`). Build's upstream is the
 * PLAN, which carries no open questions. The decisions made at plan-start —
 * recorded on the Story LLD's `meta.questionResolutions` — are still surfaced
 * to the implementer via the prompt's "## Resolved design decisions" section.
 */

import { getLogger } from '../../../shared/logger.js';
import { readLldArtifact } from '../../../workflow/gates.js';
import { renderResolvedDecisions } from '../../../workflow/questions.js';
import { admitBuild } from '../../../workflow/runners/build/admission.js';
import { renderImplementPrompt, resolveRepoPath, resolveTaskRef } from '../render.js';
import type {
	BuildStepError,
	BuildStepImplement,
	BuildStepInputImplement,
	BuildStepRefused,
} from '../types.js';

const log = getLogger('mcp:build-step:implement');

export async function handleImplement(
	input: BuildStepInputImplement,
): Promise<BuildStepImplement | BuildStepRefused | BuildStepError> {
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

	// Surface the design decisions made at plan-start (recorded on the Story
	// LLD's meta.questionResolutions) into the template's "## Resolved design
	// decisions" section. Best-effort — a missing LLD just leaves it empty.
	let resolvedDecisions = '';
	try {
		const lld = readLldArtifact(repoPath, ref.epicHash, ref.storyId);
		resolvedDecisions = renderResolvedDecisions(lld.meta.questionResolutions);
	} catch (e) {
		log.info({ storyId: ref.storyId, err: e instanceof Error ? e.message : String(e) }, 'insrc_build_step[implement]: LLD unreadable for resolved decisions');
	}

	const prompt = renderImplementPrompt(repoPath, ref, resolvedDecisions);
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
