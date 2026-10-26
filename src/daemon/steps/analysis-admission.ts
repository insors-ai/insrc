/** Admission precedes request, continuation, prompt, trace and error-evidence reads. */
import { assertExplicitConnectionExecution, connectionExecutionErrorCode } from '../../shared/step-context.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
const unverifiedErrors = new WeakSet<object>();
export class UnverifiedAnalysisError extends Error {
 readonly code = 'unsupported-temporary';
	constructor() { super('Temporary connections are unavailable for this operation.'); this.name = 'UnverifiedAnalysisError'; unverifiedErrors.add(this); }
}
export function assertAnalysisAudience(execution: ConnectionExecutionContext | undefined): void {
 assertExplicitConnectionExecution(execution);
 if (execution?.mode === 'session-memory' && execution.audience !== 'workbench-ui') throw new UnverifiedAnalysisError();
}
export function analysisAdmissionFailure(error: unknown) {
	const code = error !== null && (typeof error === 'object' || typeof error === 'function') && unverifiedErrors.has(error) ? 'unsupported-temporary' : connectionExecutionErrorCode(error) ?? 'session-expired';
 return { next: 'error' as const, error: { code, message: code === 'unsupported-temporary' ? 'Temporary connections are unavailable for this operation.' : 'Connection session is unavailable.', retryable: false } };
}
export function analysisAdmissionEnvelope(error: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(analysisAdmissionFailure(error)) }], isError: true as const }; }
