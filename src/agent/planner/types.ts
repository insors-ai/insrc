// ---------------------------------------------------------------------------
// Planner Module — Type Definitions
//
// Generic Plan<T> / Step<T> with typed data payloads, dependency tracking,
// status history, and progress summaries.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Status types
// ---------------------------------------------------------------------------

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'blocked' | 'failed' | 'skipped';

/** Derived from aggregate step statuses via computePlanStatus(). */
export type PlanStatus = 'active' | 'completed' | 'blocked' | 'abandoned';

// ---------------------------------------------------------------------------
// Metadata & history
// ---------------------------------------------------------------------------

export interface PlanMetadata {
  createdAt: string;   // ISO-8601 UTC
  updatedAt: string;   // ISO-8601 UTC
  author?:   string | undefined;
}

export interface StatusTransition {
  stepId:    string;
  oldStatus: StepStatus;
  newStatus: StepStatus;
  timestamp: string;    // ISO-8601 UTC
  reason?:   string | undefined;
}

// ---------------------------------------------------------------------------
// Core generic types
// ---------------------------------------------------------------------------

export interface Step<T = unknown> {
  id:           string;
  title:        string;
  description:  string;
  status:       StepStatus;
  dependencies: string[];                          // IDs of prerequisite steps
  assignee?:    string | undefined;
  notes?:       string | undefined;
  metadata:     PlanMetadata;
  subSteps?:    Step<T>[] | undefined;             // Nested sub-steps (tree)
  data?:        T | undefined;                     // Domain-specific payload
  statusHistory?: StatusTransition[] | undefined;
}

export interface Plan<T = unknown> {
  id:          string;
  repoPath:    string;
  title:       string;
  description: string;
  status:      PlanStatus;
  steps:       Step<T>[];
  metadata:    PlanMetadata;
}

// ---------------------------------------------------------------------------
// Progress summary
// ---------------------------------------------------------------------------

export interface ProgressSummary {
  total:       number;
  byStatus:    Record<StepStatus, number>;
  pctComplete: number;  // 0–100
}

// ---------------------------------------------------------------------------
// Domain-specific step data payloads
// ---------------------------------------------------------------------------

export interface ImplementationStepData {
  filePaths:           string[];
  codeReferences?:     Array<{ file: string; line: number; symbol?: string | undefined }> | undefined;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export interface TestStepData {
  testCategory:   'unit' | 'integration' | 'e2e';
  coverageTarget?: number | undefined;  // percentage 0–100
  fixtures?:       string[] | undefined;
}

export interface MigrationStepData {
  rollbackSteps?:         string[] | undefined;  // IDs of rollback steps
  validationCheckpoints?: Array<{ description: string; query?: string | undefined }> | undefined;
}

// ---------------------------------------------------------------------------
// Convenience type aliases
// ---------------------------------------------------------------------------

export type ImplementationPlan = Plan<ImplementationStepData>;
export type TestPlan           = Plan<TestStepData>;
export type MigrationPlan      = Plan<MigrationStepData>;
