// ---------------------------------------------------------------------------
// Planner Module — Public API
// ---------------------------------------------------------------------------

// Types
export type {
  Plan, Step, StepStatus, PlanStatus, PlanMetadata,
  StatusTransition, ProgressSummary,
  ImplementationPlan, TestPlan, MigrationPlan,
  ImplementationStepData, TestStepData, MigrationStepData,
} from './types.js';

// Utilities
export { generateId, detectCycle } from './utils.js';

// Engine — status transitions & validation
export {
  updateStepStatus,
  validateDependencies,
  detectCycles,
  detectBlockedSteps,
  computePlanStatus,
} from './engine.js';

// Progress tracking
export { getProgressSummary, getStatusHistory, recordStatusTransition } from './progress.js';

// Markdown serialization
export { toMarkdown, fromMarkdown, updateStepInMarkdown } from './markdown.js';

// Agent (Phase 2)
export { plannerAgent } from './agent.js';
export type { PlannerState } from './agent-state.js';
export type { PlannerInput } from './agent-state.js';
