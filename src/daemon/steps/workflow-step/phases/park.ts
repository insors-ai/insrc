/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_workflow_step` phase='park' (also served as the daemon operation `team.park`): hand the unit's unfinished work to
 * whoever takes it over. The git and tracker work is `parkDraft`; this maps its answer to a step output.
 */

import { getLogger } from '../../../../shared/logger.js';
import { assertEpicHash } from '../../../../workflow/hash.js';
import { TeamGateRefusedError } from '../../../../workflow/team/gate.js';
import { parkDraft, type ParkDeps } from '../../../../workflow/team/handoff.js';
import type { UnitRef } from '../../../../workflow/tracker/refs.js';
import { resolveRepoPath } from '../../resolve-repo.js';
import type { WorkflowStepError, WorkflowStepInputPark, WorkflowStepParked } from '../types.js';

const log = getLogger('mcp:workflow-step:park');

const failure = (code: string, message: string): WorkflowStepError => ({ next: 'error', error: { code, message, retryable: false } });

/** The unit a park or resume addresses: the Story when a story id is given, else the Epic. */
export function handoffUnit(repoPath: string, epicHash: string, storyId: string | undefined): UnitRef {
	return storyId !== undefined && storyId.length > 0 ? { unit: 'story', repoPath, epicHash, storyId } : { unit: 'epic', repoPath, epicHash };
}

export async function handlePark(input: WorkflowStepInputPark, deps: ParkDeps = {}): Promise<WorkflowStepParked | WorkflowStepError> {
	try {
		assertEpicHash(input.epicHash, 'insrc_workflow_step[park]: epicHash');
	} catch (err) {
		return failure('bad-input', err instanceof Error ? err.message : String(err));
	}
	const repoPath = await resolveRepoPath(input.repo);
	if (repoPath === undefined) return failure('bad-input', 'insrc_workflow_step[park]: no repo. Pass `repo` explicitly or set INSRC_REPO in the MCP server\'s environment.');
	try {
		const res = await parkDraft(repoPath, handoffUnit(repoPath, input.epicHash, input.storyId), { runToken: input.runToken }, deps);
		if (!res.ok) return failure('park-refused', res.reason);
		log.info({ branch: res.branch, variant: res.variant }, 'insrc_workflow_step[park]: parked');
		return { next: 'parked', branch: res.branch, commit: res.commit, variant: res.variant, noted: res.noted, noteFailure: res.noteFailure, cleanupWarning: res.cleanupWarning };
	} catch (err) {
		// the team gate named a holder: say so with its own code, as every gated phase does
		if (err instanceof TeamGateRefusedError) return failure('team-gate-refused', err.reason);
		throw err;
	}
}
