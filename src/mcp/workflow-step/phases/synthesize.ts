/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_workflow_step` phase='synthesize' handler.
 *
 * The client emitted the artifact JSON. We:
 *   1. Validate JSON shape + citations + boundary via
 *      `finalizeArtifact`.
 *   2. Resolve the on-disk paths from the finalized artifact's meta
 *      (which carries `epicHash` for every Epic-scoped workflow).
 *   3. Write the artifact (md + json) atomically.
 *   4. Release the state token + return `next: 'done'`.
 */

import { getLogger } from '../../../shared/logger.js';
import { finalizeArtifact } from '../../../workflow/orchestrator.js';
import { unresolvedOpen } from '../../../workflow/questions.js';
import { appendRunLog, pathsForWorkflow, writeAtomic } from '../../../workflow/storage.js';
import { assertStage, decodeState } from '../state.js';
import { releaseState } from '../state-store.js';
import type {
	WorkflowStepDone,
	WorkflowStepError,
	WorkflowStepInputSynthesize,
} from '../types.js';

const log = getLogger('mcp:workflow-step:synthesize');

export async function handleSynthesize(
	input: WorkflowStepInputSynthesize,
): Promise<WorkflowStepDone | WorkflowStepError> {
	const state = decodeState(input.state);
	assertStage(state, 'awaiting_synthesize');

	if (state.stepOutputs === undefined) {
		return errorResult(
			'no-step-outputs',
			`state stage is 'awaiting_synthesize' but stepOutputs is missing`,
			false,
		);
	}
	const elapsedMs = Date.now() - state.startedAtMs;
	const result = finalizeArtifact(
		state.intent,
		state.stepOutputs,
		state.runId,
		elapsedMs,
		input.artifact,
	);
	if (!result.ok) {
		const failure = result.failure;
		const code = failure.ok ? 'synthesize-unknown' : `synthesize-${failure.kind}`;
		// Non-retryable failures (e.g. a checklist scope-boundary hard-fail)
		// derive from a fixed step output — re-emitting won't fix them.
		const retryable = failure.ok ? true : (failure.retryable ?? true);
		return errorResult(code, formatFailure(failure), retryable);
	}
	// The finalized artifact carries the definitive epicHash in its
	// meta (Define mints it; downstream workflows echo it). Read it
	// back to pick paths, so we never diverge from the artifact.
	const finalizedMeta = (result.finalized.artifact as { meta?: { epicHash?: string; epicSlug?: string; storyId?: string } }).meta ?? {};
	const storyIdParam = typeof state.intent.params['storyId'] === 'string' ? state.intent.params['storyId'] as string : undefined;
	const paths = pathsForWorkflow({
		workflow: state.intent.workflow, repoPath: state.intent.repoPath,
		epicKey: state.epicKey, runId: state.runId,
		epicHash: finalizedMeta.epicHash, epicSlug: finalizedMeta.epicSlug,
		storyId: finalizedMeta.storyId, storyIdParam,
	});
	writeAtomic(paths.md,   result.finalized.renderedMd);
	writeAtomic(paths.json, result.finalized.renderedJson);
	appendRunLog(state.epicKey, state.intent.workflow, state.runId, {
		ts:    new Date().toISOString(),
		event: 'artifact-written',
		md:    paths.md,
		json:  paths.json,
		elapsedMs,
	});
	log.info(
		{ runId: state.runId, workflow: state.intent.workflow, path: paths.md, elapsedMs },
		'insrc_workflow_step[synthesize]: artifact written; releasing state',
	);
	releaseState(inputStateToken(input.state));

	// Optional end-of-stage offer: surface the just-produced artifact's own
	// still-open questions (DEF/HLD/LLD carry `body.openQuestions`). The
	// controller MAY loop them through phase='resolve_question' now; the
	// stage is complete regardless.
	const stillOpen = openQuestionsOf(result.finalized.artifact);

	return {
		next:     'done',
		path:     paths.md,
		markdown: result.finalized.renderedMd,
		artifact: result.finalized.artifact,
		...(stillOpen.length > 0 ? { openQuestions: stillOpen } : {}),
		pendingApproval: {
			artifactPath: paths.md,
			...(finalizedMeta.epicHash !== undefined ? { epicHash: finalizedMeta.epicHash } : {}),
			guidance:
				'This artifact is a workflow GATE. Do NOT auto-approve. Present a concise ' +
				'summary of it to the user and ASK whether to approve and proceed. Only on ' +
				'the user\'s explicit in-chat yes, call insrc_workflow_approve({ artifactPath }) ' +
				'(or { epicHash } to batch every pending artifact under this epic). A review-' +
				'blocked artifact comes back in skipped[] with a reason — relay that to the user.',
		},
	};
}

/** The freshly-produced artifact's open questions with no resolution yet. */
function openQuestionsOf(artifact: unknown): { readonly questionId: string; readonly text: string }[] {
	const a = artifact as { body?: { openQuestions?: unknown }; meta?: { questionResolutions?: Record<string, unknown> } };
	const texts = Array.isArray(a.body?.openQuestions)
		? (a.body!.openQuestions as unknown[]).filter((t): t is string => typeof t === 'string')
		: [];
	if (texts.length === 0) return [];
	return unresolvedOpen(texts, a.meta?.questionResolutions as never)
		.map(q => ({ questionId: q.id, text: q.text }));
}

function formatFailure(f: import('../../../workflow/synthesizer.js').ValidationResult): string {
	if (f.ok) return 'ok';
	const details = f.details === undefined ? '' : ` — details: ${f.details.join(' | ')}`;
	return `${f.message}${details}`;
}

function inputStateToken(state: string): string {
	return state;
}

function errorResult(code: string, message: string, retryable: boolean): WorkflowStepError {
	return { next: 'error', error: { code, message, retryable } };
}
