/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The stage-start open-question gate wiring for `insrc_workflow_step`.
 *
 * Open-question resolution is an OPTIONAL step at the END of each stage and a
 * MANDATORY trigger at the START of the next (consuming) stage, on the
 * IMMEDIATE-UPSTREAM artifact only:
 *
 *   - design.epic  start → resolve DEF's open questions
 *   - design.story start → resolve HLD's open questions
 *   - plan         start → resolve LLD's open questions
 *   - build        start → (PLAN carries no open questions → no gate)
 *
 * This module maps a consuming workflow to its upstream artifact kind and
 * (via the shared `workflow/questions.ts` machinery) computes the unresolved
 * open questions + their daemon-generated options.
 */

import { getLogger } from '../../shared/logger.js';
import { assertEpicHash } from '../../workflow/hash.js';
import {
	artifactOpenQuestions,
	questionsWithOptions,
	unresolvedOpen,
	type QuestionArtifactKind,
} from '../../workflow/questions.js';
import type { WorkflowName } from '../../workflow/types.js';
import type { WorkflowStepResolveQuestions } from './types.js';

const log = getLogger('mcp:workflow-step:questions-gate');

/** The immediate-upstream artifact kind whose open questions gate this
 *  workflow's start, or undefined when the workflow has no gated upstream. */
export function upstreamKindFor(workflow: WorkflowName): QuestionArtifactKind | undefined {
	switch (workflow) {
		case 'design.epic':  return 'define';
		case 'design.story': return 'hld';
		case 'plan':         return 'lld';
		default:             return undefined;
	}
}

/** The consuming workflow + params that re-open a deferred question of a
 *  given upstream kind (used by the review flow to tell the controller
 *  exactly how to call resolve_question). */
export function consumerFor(
	kind:     QuestionArtifactKind,
	epicHash: string,
	storyId:  string | undefined,
): { readonly workflow: WorkflowName; readonly params: Record<string, unknown> } {
	if (kind === 'define') return { workflow: 'design.epic', params: { epicHash } };
	if (kind === 'hld')    return { workflow: 'design.story', params: { epicHash, ...(storyId !== undefined ? { storyId } : {}) } };
	return { workflow: 'plan', params: { epicHash, ...(storyId !== undefined ? { storyId } : {}) } };
}

/** Read `params.storyId` when present + non-empty. */
export function storyIdParam(params: Record<string, unknown>): string | undefined {
	const v = params['storyId'];
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Pre-flight the mandatory start gate. Returns a `resolve_questions` payload
 *  when the immediate-upstream artifact has unresolved open questions, else
 *  undefined (start proceeds). Best-effort — a missing / unreadable upstream
 *  artifact skips the gate so the stage's own downstream gate produces the
 *  canonical error. */
export async function preflightUpstreamQuestions(
	workflow: WorkflowName,
	repoPath: string,
	params:   Record<string, unknown>,
): Promise<WorkflowStepResolveQuestions | undefined> {
	const kind = upstreamKindFor(workflow);
	if (kind === undefined) return undefined;

	let texts: readonly string[];
	let resolutions: Parameters<typeof unresolvedOpen>[1];
	let storyId: string | undefined;
	try {
		const epicHash = params['epicHash'];
		assertEpicHash(epicHash, `insrc_workflow_step[start]: workflow '${workflow}' requires params.epicHash`);
		storyId = kind === 'lld' ? storyIdParam(params) : undefined;
		const read = artifactOpenQuestions(repoPath, kind, epicHash, storyId);
		texts = read.texts;
		resolutions = read.resolutions;
	} catch (err) {
		log.info(
			{ workflow, err: err instanceof Error ? err.message : String(err) },
			'start gate: upstream artifact unreadable — skipping question gate',
		);
		return undefined;
	}

	const open = unresolvedOpen(texts, resolutions);
	if (open.length === 0) return undefined;

	const context = `${workflow} start — upstream ${kind.toUpperCase()}${storyId !== undefined ? ` (Story ${storyId})` : ''}`;
	log.info({ workflow, kind, unresolved: open.length }, 'start gate: unresolved upstream open questions — gating');
	const questions = await questionsWithOptions(open, context);
	return { next: 'resolve_questions', questions };
}
