/**
 * Delegate agent definition — plan-driven autonomous coding agent.
 *
 * Steps: invoke-planner → approve-plan-gate → execute-step → advance → failure-gate → report
 */

import type { AgentDefinition } from '../../framework/types.js';
import type { DelegateState } from './agent-state.js';
import type { DelegateInput } from './types.js';
import {
  invokePlannerStep,
  approvePlanGateStep,
  executeStepStep,
  advanceStep,
  failureGateStep,
  reportStep,
} from './steps.js';

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export const delegateAgent: AgentDefinition<DelegateState> = {
  id: 'delegate',
  version: 1,
  firstStep: 'invoke-planner',

  steps: {
    'invoke-planner': invokePlannerStep,
    'approve-plan-gate': approvePlanGateStep,
    'execute-step': executeStepStep,
    'advance': advanceStep,
    'failure-gate': failureGateStep,
    'report': reportStep,
  },

  initialState(input: unknown): DelegateState {
    const di = input as DelegateInput;
    return {
      input: {
        message: di.message,
        codeContext: di.codeContext,
        designSpec: di.designSpec,
        repoPath: di.session.repoPath,
        closureRepos: di.session.closureRepos,
      },
      plan: null,
      currentStepIndex: 0,
      stepResults: [],
      gateLevel: 'normal',
      commitStrategy: { kind: 'at-points', points: [] },
      testAfterEach: false,
      rollbackOnFailure: false,
      filesChanged: [],
      testsRun: 0,
      pendingCommitFiles: [],
      commits: [],
      editRounds: {},
    };
  },
};
