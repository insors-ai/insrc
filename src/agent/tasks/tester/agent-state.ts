/**
 * TesterState — serializable agent state for the tester agent.
 *
 * Tracks the test plan, per-file execution results, failure classifications,
 * and accumulated implementation bugs for Pair agent handoff.
 */

import type { AgentState } from '../../framework/types.js';
import type { HasProviderOverride } from '../../framework/provider-mention.js';
import type { TestFramework } from '../test-runner.js';
import type { TestPlan, TestFileResult, ImplementationBug } from './types.js';

// ---------------------------------------------------------------------------
// Tester agent state
// ---------------------------------------------------------------------------

export interface TesterState extends AgentState, HasProviderOverride {
  input: {
    message:       string;
    codeContext:    string;
    designSpec?:   string | undefined;
    repoPath:      string;
    closureRepos:  string[];
  };

  // Analyze results
  /** Investigation summary from the analyze step. */
  investigationSummary: string;
  /** Auto-detected test framework. */
  detectedFramework:    TestFramework;
  /** Existing test files discovered during analysis. */
  existingTests:        string[];
  /** Source files in scope for testing. */
  sourceFiles:          string[];

  // Test plan
  /** The scenario-level test plan (populated after generate-test-plan). */
  testPlan:             TestPlan | null;
  /** Config context from conventions/feedback/templates (loaded in analyze). */
  configContext?:       string | undefined;

  // Execution
  /** Index of the current test plan entry being processed (0-based). */
  currentEntryIndex:    number;
  /** Per-file execution results. */
  fileResults:          TestFileResult[];
  /** Whether Claude should review each test file before execution. */
  reviewTests:          boolean;
  /** Whether all test files are passing. */
  allPassing:           boolean;

  // Bug tracking
  /** Accumulated implementation bugs for Pair agent handoff. */
  implementationBugs:   ImplementationBug[];

  // Tracking
  /** Edit round counters, keyed by stage tag. */
  editRounds:           Record<string, number>;
  /** All files changed during the session. */
  filesChanged:         string[];
  /** Final summary for session carry-forward. */
  summary?:             string | undefined;
}
