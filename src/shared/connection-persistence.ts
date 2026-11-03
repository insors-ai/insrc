/** Denial-only backstop for shared durable sinks. Never grants connection access. */
import { assertExplicitConnectionExecution, currentStepContext, ConnectionExecutionError } from './step-context.js';
import type { ConnectionExecutionContext } from './step-context.js';
export function assertNoSessionPersistence(execution?: ConnectionExecutionContext): void {
	if (execution !== undefined) assertExplicitConnectionExecution(execution);
	if (execution?.mode === 'session-memory' || currentStepContext()?.connectionExecution?.mode === 'session-memory') {
		throw new ConnectionExecutionError('unsupported-temporary');
	}
}
