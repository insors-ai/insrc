/** Admission precedes request, continuation, prompt, trace and error-evidence reads. */
import { assertExplicitConnectionExecution, ConnectionExecutionError } from '../../shared/step-context.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
export class UnverifiedAnalysisError extends Error {
 readonly code = 'unsupported-temporary';
 constructor() { super('Temporary connections are unavailable for this operation.'); this.name = 'UnverifiedAnalysisError'; }
}
export function assertAnalysisAudience(execution: ConnectionExecutionContext | undefined): void {
 assertExplicitConnectionExecution(execution);
 if (execution?.mode === 'session-memory' && execution.audience !== 'workbench-ui') throw new UnverifiedAnalysisError();
}
export function analysisAdmissionFailure(error: unknown) {
 const code = error instanceof UnverifiedAnalysisError ? 'unsupported-temporary' : error instanceof ConnectionExecutionError ? error.code : 'session-expired';
 return { next: 'error' as const, error: { code, message: code === 'unsupported-temporary' ? 'Temporary connections are unavailable for this operation.' : 'Connection session is unavailable.', retryable: false } };
}
export function analysisAdmissionEnvelope(error: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(analysisAdmissionFailure(error)) }], isError: true as const }; }
