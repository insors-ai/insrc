/** Explicit saved boundary for legacy saved-only executor tests. Never used by production relays. */
import { executePlan, stepPlan } from '../../explore/executor.js';
import type { ExecutePlanArgs } from '../../explore/executor.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import { assertExplicitConnectionExecution } from '../../../shared/step-context.js';
type SavedArgs = Omit<ExecutePlanArgs, 'connectionExecution'> & Partial<Pick<ExecutePlanArgs, 'connectionExecution'>>;
export function executeSavedPlan(args: SavedArgs) {
 assertExplicitConnectionExecution(args.connectionExecution);
 return executePlan({ ...args, connectionExecution: args.connectionExecution ?? savedAnalysisExecution(args.repoPath) });
}
export function stepSavedPlan(args: SavedArgs & Pick<Parameters<typeof stepPlan>[0], 'resumeState'>) {
 assertExplicitConnectionExecution(args.connectionExecution);
 return stepPlan({ ...args, connectionExecution: args.connectionExecution ?? savedAnalysisExecution(args.repoPath) });
}
