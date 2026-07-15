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

import { join } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import { finalizeArtifact } from '../../../workflow/orchestrator.js';
import {
	appendRunLog,
	defineArtifactPaths,
	extendArtifactPaths,
	hldArtifactPaths,
	lldArtifactPaths,
	runsDirFor,
	stubArtifactPaths,
	writeAtomic,
} from '../../../workflow/storage.js';
import type { WorkflowIntent } from '../../../workflow/types.js';
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
		return errorResult(code, formatFailure(failure), true);
	}
	// The finalized artifact carries the definitive epicHash in its
	// meta (Define mints it; downstream workflows echo it). Read it
	// back to pick paths, so we never diverge from the artifact.
	const finalizedMeta = (result.finalized.artifact as { meta?: { epicHash?: string; epicSlug?: string; storyId?: string } }).meta ?? {};
	const paths = pathsForWorkflow(state.intent, state.epicKey, state.runId, finalizedMeta.epicHash, finalizedMeta.epicSlug, finalizedMeta.storyId);
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
	return {
		next:     'done',
		path:     paths.md,
		markdown: result.finalized.renderedMd,
		artifact: result.finalized.artifact,
	};
}

function pathsForWorkflow(
	intent:   WorkflowIntent,
	epicKey:  string,
	runId:    string,
	epicHash: string | undefined,
	epicSlug: string | undefined,
	storyId:  string | undefined,
): { readonly md: string; readonly json: string } {
	const { workflow, repoPath } = intent;
	if (workflow === 'stub') return stubArtifactPaths(repoPath, epicKey);
	// Every Epic-scoped workflow reads the hash from the finalized
	// artifact's meta. `epicKey` is the trace-log dir key — for
	// Epic-scoped workflows it equals the Epic hash, but we prefer
	// the meta value so the two can't diverge. `epicSlug` names the
	// human-facing markdown; the JSON stays hash-named.
	if (epicHash === undefined) {
		throw new Error(`pathsForWorkflow: workflow '${workflow}' finalized without meta.epicHash`);
	}
	if (workflow === 'define') {
		// The `define` extend branch emits an ExtendArtifact whose meta
		// carries a storyId — route those to the EXT-* paths, not DEF-*.
		if (typeof storyId === 'string' && storyId.length > 0) {
			return extendArtifactPaths(repoPath, epicHash, storyId, epicSlug);
		}
		return defineArtifactPaths(repoPath, epicHash, epicSlug);
	}
	if (workflow === 'design.epic') return hldArtifactPaths(repoPath, epicHash, epicSlug);
	if (workflow === 'design.story') {
		const storyId = intent.params['storyId'];
		if (typeof storyId !== 'string' || storyId.length === 0) {
			throw new Error(`design.story synthesize requires params.storyId`);
		}
		return lldArtifactPaths(repoPath, epicHash, storyId, epicSlug);
	}
	if (workflow === 'tracker.push' || workflow === 'tracker.sync' || workflow === 'tracker.post') {
		const dir = runsDirFor(epicHash);
		return {
			md:   join(dir, `${workflow}-${runId}.md`),
			json: join(dir, `${workflow}-${runId}.json`),
		};
	}
	throw new Error(`pathsForWorkflow: workflow '${workflow}' not yet supported`);
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
