/**
 * Designer AgentDefinition — wires steps into a runnable agent.
 *
 * Usage:
 *   import { designerAgent } from './agent.js';
 *   import { runAgent } from '../../framework/runner.js';
 *
 *   const result = await runAgent({
 *     definition: designerAgent,
 *     channel,
 *     options: { input: designerInput },
 *     config,
 *     providers,
 *   });
 */

import type { AgentDefinition } from '../../framework/types.js';
import type { DesignerState } from './agent-state.js';
import type { DesignerInput } from './types.js';
import {
  extractRequirementsStep,
  validateRequirementsStep,
  parseRequirementsStep,
  pickNextRequirementStep,
  sketchStep,
  validateSketchStep,
  detailStep,
  validateDetailStep,
  assembleStep,
} from './steps.js';

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export const designerAgent: AgentDefinition<DesignerState> = {
  id: 'designer',
  version: 1,
  configNamespace: 'designer',
  firstStep: 'extract-requirements',

  initialState(input: unknown): DesignerState {
    const di = input as DesignerInput;
    return {
      input: {
        message: di.message,
        codeContext: di.codeContext,
        template: di.template,
        intent: di.intent,
        requirementsDoc: di.requirementsDoc,
        repoPath: di.session.repoPath,
        closureRepos: di.session.closureRepos,
      },
      rawRequirements: '',
      enhancedRequirements: '',
      parsedRequirements: [],
      todos: [],
      currentTodoIndex: 0,
      editRounds: {},
      completedSketches: [],
    };
  },

  steps: {
    'extract-requirements': extractRequirementsStep,
    'validate-requirements': validateRequirementsStep,
    'parse-requirements': parseRequirementsStep,
    'pick-next-requirement': pickNextRequirementStep,
    'sketch': sketchStep,
    'validate-sketch': validateSketchStep,
    'detail': detailStep,
    'validate-detail': validateDetailStep,
    'assemble': assembleStep,
  },
};
