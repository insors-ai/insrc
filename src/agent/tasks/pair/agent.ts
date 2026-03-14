/**
 * Pair agent definition — collaborative multi-turn coding agent.
 *
 * Steps: check-context → analyze → propose → review-gate → apply → validate → summarize
 */

import type { AgentDefinition } from '../../framework/types.js';
import type { PairState } from './agent-state.js';
import type { PairInput, PairMode } from './types.js';
import {
  checkContextStep,
  analyzeStep,
  proposeStep,
  reviewGateStep,
  applyStep,
  validateStep,
  summarizeStep,
} from './steps.js';

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export const pairAgent: AgentDefinition<PairState> = {
  id: 'pair',
  version: 1,
  firstStep: 'check-context',

  steps: {
    'check-context': checkContextStep,
    'analyze': analyzeStep,
    'propose': proposeStep,
    'review-gate': reviewGateStep,
    'apply': applyStep,
    'validate': validateStep,
    'summarize': summarizeStep,
  },

  initialState(input: unknown): PairState {
    const pi = input as PairInput;
    return {
      input: {
        message: pi.message,
        codeContext: pi.codeContext,
        designSpec: pi.designSpec,
        repoPath: pi.session.repoPath,
        closureRepos: pi.session.closureRepos,
        mode: pi.mode,
      },
      mode: pi.mode,
      hasDesignContext: false,
      filesInScope: [],
      changesApplied: [],
      pendingProposal: null,
      activeTodos: null,
      currentTodoIndex: 0,
      findings: [],
      hypotheses: [],
      conversationSummary: '',
      currentFocus: '',
      investigationSummary: '',
      iterationCount: 0,
      editRounds: {},
    };
  },
};
