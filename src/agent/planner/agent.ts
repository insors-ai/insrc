/**
 * Planner AgentDefinition — wires 8 steps into a runnable agent.
 *
 * Usage:
 *   import { plannerAgent } from './agent.js';
 *   import { runAgent } from '../../framework/runner.js';
 *
 *   const result = await runAgent({
 *     definition: plannerAgent,
 *     channel,
 *     options: { input: plannerInput },
 *     config,
 *     providers,
 *   });
 */

import type { AgentDefinition } from '../framework/types.js';
import type { PlannerState } from './agent-state.js';
import type { PlannerInput } from './agent-state.js';
import {
  analyzeRequestStep,
  gatherContextStep,
  draftPlanStep,
  validatePlanStep,
  resolveDepsStep,
  detailStepsStep,
  validateDetailsStep,
  serializeStep,
} from './steps.js';

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export const plannerAgent: AgentDefinition<PlannerState> = {
  id: 'planner',
  version: 1,
  firstStep: 'analyze-request',

  initialState(input: unknown): PlannerState {
    const pi = input as PlannerInput;
    return {
      input: {
        message:      pi.message,
        codeContext:   pi.codeContext,
        planType:     pi.planType ?? 'generic',
        existingPlan: pi.existingPlan,
        repoPath:     pi.session.repoPath,
        closureRepos: pi.session.closureRepos,
      },
      analysis:         '',
      inferredPlanType: pi.planType ?? 'generic',
      codebaseFindings: '',
      draftSteps:       '',
      plan:             null,
      dependencyIssues: [],
      editRounds:       {},
    };
  },

  steps: {
    'analyze-request':   analyzeRequestStep,
    'gather-context':    gatherContextStep,
    'draft-plan':        draftPlanStep,
    'validate-plan':     validatePlanStep,
    'resolve-deps':      resolveDepsStep,
    'detail-steps':      detailStepsStep,
    'validate-details':  validateDetailsStep,
    'serialize':         serializeStep,
  },
};
