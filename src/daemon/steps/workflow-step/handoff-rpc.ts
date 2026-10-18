/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon operations `team.park` and `team.resume`: the terminal's way to the same park and resume the workflow-step phases
 * offer, answering with the same step outputs (so a gate refusal is `team-gate-refused` here too).
 */

import type { ResumeDeps } from '../../../workflow/team/handoff.js';
import type { RpcHandlers } from '../../server.js';
import { handlePark } from './phases/park.js';
import { handleResume } from './phases/resume.js';
import type { ApplyDeps } from './resume.js';
import type { WorkflowStepInputPark, WorkflowStepInputResume } from './types.js';

type Params = Omit<WorkflowStepInputPark, 'phase'> | Omit<WorkflowStepInputResume, 'phase'>;

export function handoffRpcHandlers(deps: ResumeDeps & ApplyDeps = {}): RpcHandlers {
	return {
		'team.park':   async (params) => handlePark({ ...(params as Params), phase: 'park' } as WorkflowStepInputPark, deps),
		'team.resume': async (params) => handleResume({ ...(params as Params), phase: 'resume' } as WorkflowStepInputResume, deps),
	};
}
