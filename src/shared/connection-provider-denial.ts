/** Denial-only admission for providers without a supported Session backend. Grants no proof or access. */
import { assertExplicitConnectionExecution, currentStepContext, ConnectionExecutionError } from './step-context.js';
import type { ConnectionExecutionContext } from './step-context.js';
export function assertNoSessionProvider(execution?: ConnectionExecutionContext): void {
	const bound = currentStepContext()?.connectionExecution;
	if (execution !== undefined || bound?.mode === 'session-memory') assertExplicitConnectionExecution(execution);
	else bound?.assertActive();
	if (execution?.mode === 'session-memory') throw new ConnectionExecutionError('unsupported-temporary');
}

