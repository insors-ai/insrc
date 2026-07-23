/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_workflow_step` phase='start' handler.
 *
 * 1. Resolve the repo path (explicit param > INSRC_REPO env).
 * 2. Mint a runId.
 * 3. Derive the Epic hash key that groups this run's trace log:
 *    - `define`  → hash the freshly-minted runId (this Define IS the
 *      Epic; its hash becomes the canonical Epic identity).
 *    - `design.epic` / `design.story` / `tracker.*` → read
 *      `params.epicHash` (must be present; every downstream workflow
 *      addresses its Epic by hash).
 *    - `stub` → derive a display slug from the focus for the trace
 *      dir (stub has no Epic scope).
 * 4. Build a WorkflowIntent from focus + workflow + params.
 * 5. Look up the workflow's decomposer prompt + schema.
 * 6. Seed the state (stage='awaiting_plan').
 * 7. Return emit_plan.
 */

import { getLogger } from '../../../shared/logger.js';
import { resolveRepoPath } from '../../resolve-repo.js';
import { deriveSlug } from '../../../workflow/slug.js';
import { assertEpicHash, computeEpicHash } from '../../../workflow/hash.js';
import type { WorkflowIntent } from '../../../workflow/types.js';
import { prepareDecompose } from '../../../workflow/orchestrator.js';
import { preflightUpstreamQuestions } from '../questions-gate.js';
import { encodeState, STATE_VERSION, type WorkflowStepStatePayload } from '../state.js';
import type { WorkflowStepEmitPlan, WorkflowStepInputStart, WorkflowStepResolveQuestions } from '../types.js';

const log = getLogger('mcp:workflow-step:start');

export async function handleStart(
	input: WorkflowStepInputStart,
): Promise<WorkflowStepEmitPlan | WorkflowStepResolveQuestions> {
	const repoPath = await resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		throw new Error(
			`insrc_workflow_step[start]: no repo. Pass \`repo\` explicitly or set INSRC_REPO ` +
			`in the MCP server's environment.`,
		);
	}
	const params = { ...(input.params ?? {}) };

	const runId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	// Standalone runs (triage routed a non-Epic feature here) have no caller-
	// provided epicHash — mint a self-hash (like `define`) and thread it +
	// a default storyId through params so the runner + storage key identically.
	augmentStandaloneParams(params, runId);

	// Mandatory start gate: resolve the IMMEDIATE-UPSTREAM artifact's open
	// questions before this consuming stage runs. Pre-run — no state token yet.
	const gate = await preflightUpstreamQuestions(input.workflow, repoPath, params);
	if (gate !== undefined) return gate;

	const epicKey = epicKeyFor(input.workflow, input.focus, params, runId);

	const intent: WorkflowIntent = {
		workflow:      input.workflow,
		focus:         input.focus,
		repoPath,
		repoIndexedAt: null,
		params,
	};

	const prepared = prepareDecompose(intent);

	const state: WorkflowStepStatePayload = {
		version:     STATE_VERSION,
		runId,
		epicKey,
		startedAtMs: Date.now(),
		intent,
		stage:       'awaiting_plan',
	};

	log.info(
		{ runId, workflow: intent.workflow, epicKey, focus: input.focus.slice(0, 80) },
		'insrc_workflow_step[start]: emitting decomposer prompt',
	);

	return {
		next:     'emit_plan',
		guidance:
			`Emit a WorkflowPlan JSON matching the schema below, then call ` +
			`insrc_workflow_step again with phase="plan", plan=<your JSON>, ` +
			`state=<the state field verbatim>.`,
		prompt:   prepared.systemPrompt,
		userTurn: prepared.userTurn,
		schema:   prepared.schema,
		state:    encodeState(state),
	};
}


/** Key that groups this run's trace log under `~/.insrc/workflow-runs/`.
 *  Epic-scoped workflows key by the 16-char Epic hash so every
 *  workflow for the same Epic writes into the same trace dir.
 *  `define` mints its own hash from the runId (the Define IS the
 *  Epic). `stub` has no Epic scope so it derives a display slug. */
export function epicKeyFor(
	workflow: string,
	focus:    string,
	params:   Record<string, unknown>,
	runId:    string,
): string {
	if (workflow === 'define') {
		return computeEpicHash(runId);
	}
	if (workflow === 'design.epic' || workflow === 'design.story' || workflow === 'plan' ||
	    workflow === 'build' ||
	    workflow === 'tracker.push' || workflow === 'tracker.sync' || workflow === 'tracker.post') {
		const h = params['epicHash'];
		assertEpicHash(h, `insrc_workflow_step[start]: workflow '${workflow}' requires params.epicHash`);
		return h;
	}
	return deriveSlug(focus);
}

/** A STANDALONE run (triage routed a non-Epic feature to `design.story` /
 *  `build`) carries no caller-provided `epicHash`. Mint a self-hash from the
 *  runId — the same identity move `define` makes — and default `storyId` to
 *  `S001`, so the runner's synthetic-context path and storage key identically.
 *  No-op unless `params.standalone === true`. Idempotent: an already-set
 *  `epicHash` / `storyId` is preserved. Exported so the daemon `workflow.run`
 *  entry can apply the identical augmentation. */
export function augmentStandaloneParams(params: Record<string, unknown>, runId: string): void {
	if (params['standalone'] !== true) return;
	if (typeof params['epicHash'] !== 'string' || (params['epicHash'] as string).length === 0) {
		params['epicHash'] = computeEpicHash(runId);
	}
	if (typeof params['storyId'] !== 'string' || (params['storyId'] as string).length === 0) {
		params['storyId'] = 'S001';
	}
}
