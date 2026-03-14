/**
 * Brainstorm AgentDefinition — wires steps into a runnable agent.
 *
 * Usage:
 *   import { brainstormAgent } from './agent.js';
 *   import { runAgent } from '../../framework/runner.js';
 *
 *   const result = await runAgent({
 *     definition: brainstormAgent,
 *     channel,
 *     options: { input: brainstormInput },
 *     config,
 *     providers,
 *   });
 */

import type { AgentDefinition } from '../../framework/types.js';
import type { BrainstormState } from './agent-state.js';
import type { BrainstormInput } from './types.js';
import {
  seedStep,
  validateSeedStep,
  divergeStep,
  reactStep,
  convergeStep,
  validateConvergenceStep,
  updateSpecStep,
  reviewSpecStep,
  iterateStep,
  finalizeStep,
} from './steps.js';

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export const brainstormAgent: AgentDefinition<BrainstormState> = {
  id: 'brainstorm',
  version: 1,
  firstStep: 'seed',

  initialState(input: unknown): BrainstormState {
    const bi = input as BrainstormInput;
    return {
      input: {
        message: bi.message,
        codeContext: bi.codeContext,
        existingSpec: bi.existingSpec,
        repoPath: bi.session.repoPath,
        closureRepos: bi.session.closureRepos,
      },

      // Session tracking
      round: 1,
      mode: 'diverge',
      maxRounds: 5,

      // Idea pool
      ideas: [],
      nextIdeaIndex: 1,

      // Themes
      themes: [],

      // Live requirements spec
      requirements: [],
      nextReqIndex: 1,
      revisions: [],

      // Pending proposals
      pendingPromotions: [],
      pendingMerges: [],

      // Context management
      codebaseFindings: '',
      compressedHistory: '',
      seedAnalysis: '',

      // Edit tracking
      editRounds: {},

      // Flags
      userRequestedContinue: false,
    };
  },

  steps: {
    'seed': seedStep,
    'validate-seed': validateSeedStep,
    'diverge': divergeStep,
    'react': reactStep,
    'converge': convergeStep,
    'validate-convergence': validateConvergenceStep,
    'update-spec': updateSpecStep,
    'review-spec': reviewSpecStep,
    'iterate': iterateStep,
    'finalize': finalizeStep,
  },
};
