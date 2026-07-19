/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_workflow_step` phase='review_deferred'.
 *
 * Deferred open questions never auto-resurface at a stage boundary — this is
 * the ONLY flow that brings them back. Returns every `deferred` question
 * across the Epic's DEF + HLD + all LLDs, each with regenerated options + its
 * artifact location + the exact `resolve_question` call the controller should
 * make to resolve / ignore it.
 *
 * Stateless: addressed by `params.epicHash` (or `params.epicSlug`).
 */

import { getLogger } from '../../../shared/logger.js';
import { epicCatalog } from '../../../workflow/gates.js';
import { assertEpicHash } from '../../../workflow/hash.js';
import { generateQuestionOptions, listDeferred } from '../../../workflow/questions.js';
import { consumerFor } from '../questions-gate.js';
import type { WorkflowStepDeferred, WorkflowStepError, WorkflowStepInputReviewDeferred } from '../types.js';

const log = getLogger('mcp:workflow-step:review-deferred');

function resolveRepoPath(explicit: string | undefined): string | undefined {
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const env = process.env['INSRC_REPO'];
	if (env !== undefined && env.length > 0) return env;
	return undefined;
}

/** Resolve `params.epicHash` directly, or map `params.epicSlug` → hash via
 *  the Epic catalog. Returns undefined when neither resolves. */
function resolveEpicHash(repoPath: string, params: Record<string, unknown>): string | undefined {
	const h = params['epicHash'];
	if (typeof h === 'string' && /^[0-9a-f]{16}$/.test(h)) return h;
	const slug = params['epicSlug'];
	if (typeof slug === 'string' && slug.length > 0) {
		const match = epicCatalog(repoPath).find(e => e.epicSlug === slug);
		if (match !== undefined) return match.epicHash;
	}
	return undefined;
}

export async function handleReviewDeferred(
	input: WorkflowStepInputReviewDeferred,
): Promise<WorkflowStepDeferred | WorkflowStepError> {
	const repoPath = resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		return err('no-repo', `insrc_workflow_step[review_deferred]: no repo. Pass \`repo\` or set INSRC_REPO.`);
	}
	const params = input.params ?? {};
	const epicHash = resolveEpicHash(repoPath, params);
	if (epicHash === undefined) {
		return err('bad-input', `insrc_workflow_step[review_deferred]: pass params.epicHash (16-hex) or a known params.epicSlug.`);
	}
	try {
		assertEpicHash(epicHash, `insrc_workflow_step[review_deferred]: invalid epicHash`);
	} catch (e) {
		return err('bad-input', e instanceof Error ? e.message : String(e));
	}

	const deferred = listDeferred(repoPath, epicHash);
	const questions: WorkflowStepDeferred['questions'][number][] = [];
	// SERIAL — never Promise.all over provider calls (CLAUDE.md).
	for (const d of deferred) {
		const context = `deferred review — ${d.kind.toUpperCase()}${d.storyId !== undefined ? ` (Story ${d.storyId})` : ''} of Epic ${epicHash}`;
		const gen = await generateQuestionOptions(d.text, context);
		questions.push({
			questionId:     d.questionId,
			text:           d.text,
			options:        gen.options,
			recommendation: gen.recommendation,
			kind:           d.kind,
			...(d.storyId !== undefined ? { storyId: d.storyId } : {}),
			resolveWith:    consumerFor(d.kind, epicHash, d.storyId),
		});
	}
	log.info({ epicHash, deferred: questions.length }, 'insrc_workflow_step[review_deferred]: enumerated deferred questions');
	return { next: 'deferred', questions };
}

function err(code: string, message: string): WorkflowStepError {
	return { next: 'error', error: { code, message, retryable: false } };
}
