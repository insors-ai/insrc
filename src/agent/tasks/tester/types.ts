/**
 * Types for the Tester agent — scenario-level test planning, execution,
 * failure classification, and Pair agent handoff for implementation bugs.
 */

import type { ProviderOverride } from '../../framework/provider-mention.js';
import type { TestResult, TestFramework } from '../test-runner.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** Input from the REPL to start a tester session. */
export interface TesterInput {
  message:      string;
  codeContext:   string;
  designSpec?:   string | undefined;
  session: {
    repoPath:      string;
    closureRepos:  string[];
  };
}

// ---------------------------------------------------------------------------
// Test Plan
// ---------------------------------------------------------------------------

export interface TestPlan {
  framework: TestFramework;
  summary:   string;
  entries:   TestPlanEntry[];
}

export interface TestPlanEntry {
  index:       number;
  targetFile:  string;
  testFile:    string;
  kind:        'unit' | 'live';
  scenarios:   string[];
  fixtures:    string[];
  setup:       TestSetupConfig | null;
  priority:    'high' | 'medium' | 'low';
}

export interface TestSetupConfig {
  services?: Record<string, { url?: string | undefined; envVar?: string | undefined; check: string }> | undefined;
  config?:   string | undefined;
  envVars?:  string[] | undefined;
}

// ---------------------------------------------------------------------------
// Execution Results
// ---------------------------------------------------------------------------

export type TestFileStatus =
  | 'pending'
  | 'written'
  | 'passing'
  | 'failing'
  | 'impl-bug'
  | 'fix-exhausted'
  | 'prereq-not-met'
  | 'setup-skipped'
  | 'codegen-failed'
  | 'skipped';

export interface TestFileResult {
  testFile:      string;
  targetFile:    string;
  kind:          'unit' | 'live';
  status:        TestFileStatus;
  scenarios:     string[];
  fixAttempts:   number;
  claudeRounds:  number;
  testResult?:   TestResult | undefined;
  error?:        string | undefined;
  filesWritten:  string[];
}

// ---------------------------------------------------------------------------
// Failure Classification
// ---------------------------------------------------------------------------

export interface FailureClassification {
  category:     'test_issue' | 'implementation_bug' | 'setup_issue';
  confidence:   'high' | 'medium' | 'low';
  reasoning:    string;
  suggestedFix: string;
}

// ---------------------------------------------------------------------------
// Implementation Bug Tracking
// ---------------------------------------------------------------------------

export interface ImplementationBug {
  testFile:         string;
  testName:         string;
  sourceFile:       string;
  description:      string;
  classification:   FailureClassification;
  status:           'detected' | 'fixing' | 'fixed' | 'skipped';
  pairRunId?:       string | undefined;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface TesterResult {
  kind: 'test-execution';
  filesChanged:       string[];
  summary:            string;
  fileResults:        TestFileResult[];
  implementationBugs: ImplementationBug[];
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { ProviderOverride, TestResult, TestFramework };
