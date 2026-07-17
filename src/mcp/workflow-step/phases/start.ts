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
import { deriveSlug } from '../../../workflow/slug.js';
import { assertEpicHash, computeEpicHash } from '../../../workflow/hash.js';
import type { WorkflowIntent } from '../../../workflow/types.js';
import { prepareDecompose } from '../../../workflow/orchestrator.js';
import { encodeState, STATE_VERSION, type WorkflowStepStatePayload } from '../state.js';
import type { WorkflowStepEmitPlan, WorkflowStepInputStart } from '../types.js';

const log = getLogger('mcp:workflow-step:start');

export async function handleStart(
	input: WorkflowStepInputStart,
): Promise<WorkflowStepEmitPlan> {
	const repoPath = resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		throw new Error(
			`insrc_workflow_step[start]: no repo. Pass \`repo\` explicitly or set INSRC_REPO ` +
			`in the MCP server's environment.`,
		);
	}
	const runId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const params = input.params ?? {};
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

function resolveRepoPath(explicit: string | undefined): string | undefined {
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const env = process.env['INSRC_REPO'];
	if (env !== undefined && env.length > 0) return env;
	return undefined;
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
	    workflow === 'tracker.push' || workflow === 'tracker.sync' || workflow === 'tracker.post') {
		const h = params['epicHash'];
		assertEpicHash(h, `insrc_workflow_step[start]: workflow '${workflow}' requires params.epicHash`);
		return h;
	}
	return deriveSlug(focus);
}
