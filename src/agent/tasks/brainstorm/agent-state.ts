/**
 * BrainstormState — serializable agent state for the brainstorm pipeline.
 *
 * Tracks ideas, themes, and a live requirements spec that builds
 * incrementally across diverge/converge rounds.
 */

import type { AgentState } from '../../framework/types.js';
import type {
  Idea, Theme, SpecRequirement, SpecRevision,
  ProviderOverride, PromotionProposal, MergeProposal,
} from './types.js';

// ---------------------------------------------------------------------------
// Brainstorm agent state
// ---------------------------------------------------------------------------

export interface BrainstormState extends AgentState {
  input: {
    message:       string;
    codeContext:    string;
    existingSpec?: string | undefined;
    repoPath:      string;
    closureRepos:  string[];
  };

  // Session tracking
  /** Current diverge/converge cycle (1-based). */
  round:     number;
  /** Current thinking mode. */
  mode:      'diverge' | 'converge';
  /** Max rounds before forced finalization (default: 5). */
  maxRounds: number;

  // Idea pool
  ideas:          Idea[];
  nextIdeaIndex:  number;

  // Themes (populated after first converge)
  themes: Theme[];

  // Live requirements spec
  requirements:  SpecRequirement[];
  nextReqIndex:  number;
  revisions:     SpecRevision[];

  // Pending proposals from converge step (consumed by update-spec)
  pendingPromotions: PromotionProposal[];
  pendingMerges:     MergeProposal[];

  // Context management
  /** Daemon search results from seed phase. */
  codebaseFindings:  string;
  /** Compressed summaries of prior rounds. */
  compressedHistory: string;
  /** Initial problem decomposition from seed phase. */
  seedAnalysis:      string;
  /** Last user direction from gate feedback. */
  recentFeedback?:   string | undefined;

  // Provider override (@-mention)
  providerOverride?: ProviderOverride | undefined;

  // Edit tracking
  /** Edit round counters, keyed by stage tag (e.g. 'seed', 'diverge-2', 'spec-1'). */
  editRounds: Record<string, number>;

  // Flags
  /** Whether the user chose 'continue' at the last review-spec gate. */
  userRequestedContinue: boolean;

  // Output
  assembledOutput?: string | undefined;
  summary?:         string | undefined;
}
