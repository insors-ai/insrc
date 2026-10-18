/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_workflow_step` phase='resume' (also served as the daemon operation `team.resume`): take over parked work and return the
 * turn the run stopped at. The verification, restore and rebinding are `resumeStage`; this maps its answer to a step output.
 */

import { assertEpicHash } from '../../../../workflow/hash.js';
import { TeamGateRefusedError } from '../../../../workflow/team/gate.js';
import { resolveRepoPath } from '../../resolve-repo.js';
import { resumeStage, type ApplyDeps } from '../resume.js';
import type { ResumeDeps } from '../../../../workflow/team/handoff.js';
import type {
	WorkflowStepEmitPlan, WorkflowStepEmitStep, WorkflowStepEmitSynthesize, WorkflowStepError, WorkflowStepInputResume,
	WorkflowStepNothingToResume, WorkflowStepRestart,
} from '../types.js';
import { handoffUnit } from './park.js';

const failure = (code: string, message: string): WorkflowStepError => ({ next: 'error', error: { code, message, retryable: false } });

export async function handleResume(
	input: WorkflowStepInputResume,
	deps: ResumeDeps & ApplyDeps = {},
): Promise<WorkflowStepEmitPlan | WorkflowStepEmitStep | WorkflowStepEmitSynthesize | WorkflowStepRestart | WorkflowStepNothingToResume | WorkflowStepError> {
	try {
		assertEpicHash(input.epicHash, 'insrc_workflow_step[resume]: epicHash');
	} catch (err) {
		return failure('bad-input', err instanceof Error ? err.message : String(err));
	}
	const repoPath = await resolveRepoPath(input.repo);
	if (repoPath === undefined) return failure('bad-input', 'insrc_workflow_step[resume]: no repo. Pass `repo` explicitly or set INSRC_REPO in the MCP server\'s environment.');
	try {
		const res = await resumeStage(repoPath, handoffUnit(repoPath, input.epicHash, input.storyId), { workflow: input.workflow }, deps);
		switch (res.kind) {
			case 'resumed':           return res.turn;
			case 'restart':           return { next: 'restart', workflow: res.workflow, params: res.params, reason: res.reason, draftRestored: res.draftRestored };
			case 'nothing-to-resume': return { next: 'nothing_to_resume', reason: res.reason };
			case 'refused':           return failure('resume-refused', res.reason);
		}
	} catch (err) {
		if (err instanceof TeamGateRefusedError) return failure('team-gate-refused', err.reason);
		throw err;
	}
}
