/**
 * Tester agent definition — scenario-level test planning, code generation,
 * classify-then-fix execution, and Pair agent handoff.
 *
 * Steps: analyze → generate-test-plan → review-test-plan → write-tests →
 *   review-tests → execute-tests → impl-bug-gate → report
 */

import type { AgentDefinition } from '../../framework/types.js';
import type { TesterState } from './agent-state.js';
import type { TesterInput } from './types.js';
import {
  analyzeStep,
  generateTestPlanStep,
  reviewTestPlanStep,
  writeTestsStep,
  reviewTestsStep,
  executeTestsStep,
  implBugGateStep,
  reportStep,
} from './steps.js';

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export const testerAgent: AgentDefinition<TesterState> = {
  id: 'tester',
  version: 1,
  configNamespace: 'tester',
  firstStep: 'analyze',

  steps: {
    'analyze':            analyzeStep,
    'generate-test-plan': generateTestPlanStep,
    'review-test-plan':   reviewTestPlanStep,
    'write-tests':        writeTestsStep,
    'review-tests':       reviewTestsStep,
    'execute-tests':      executeTestsStep,
    'impl-bug-gate':      implBugGateStep,
    'report':             reportStep,
  },

  initialState(input: unknown): TesterState {
    const ti = input as TesterInput;
    return {
      input: {
        message:      ti.message,
        codeContext:   ti.codeContext,
        designSpec:   ti.designSpec,
        repoPath:     ti.session.repoPath,
        closureRepos: ti.session.closureRepos,
      },
      investigationSummary: '',
      detectedFramework:    'unknown',
      existingTests:        [],
      sourceFiles:          [],
      testPlan:             null,
      currentEntryIndex:    0,
      fileResults:          [],
      reviewTests:          false,
      allPassing:           false,
      implementationBugs:   [],
      editRounds:           {},
      filesChanged:         [],
    };
  },
};
