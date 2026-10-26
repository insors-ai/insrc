/** Provider privacy admission. Production starts with no verified adapter/service proof. */
import type { LLMProvider } from './types.js';
import { assertExplicitConnectionExecution, currentStepContext, ConnectionExecutionError } from './step-context.js';
import type { ConnectionExecutionContext } from './step-context.js';

/** Immutable diagnostic status; neither this value nor caller evidence grants authority. */
export const connectionProviderPrivacyStatus = Object.freeze({
	status: 'pending' as const,
	mode: 'unsupported' as const,
	reason: 'Actual local Ollama adapter and isolated service privacy evidence has not been verified.',
});

/** Before configuration, prompt construction, injected factories, cache access or SDK calls.
 * No production identity has the required adapter + actual-service proof. In particular,
 * execution.provider, kind strings, capabilities and supplied evidence are not proof.
 * Admission must remain closed until reviewed identity-bound evidence is installed.
 */
export function assertConnectionProviderAdmission(execution?: ConnectionExecutionContext): void {
	const bound = currentStepContext()?.connectionExecution;
	if (execution !== undefined || bound?.mode === 'session-memory') assertExplicitConnectionExecution(execution);
	else bound?.assertActive();
	if (execution?.mode === 'session-memory') throw new ConnectionExecutionError('unsupported-temporary');
}

/** Saved behavior is unchanged. Never inspect an unproven candidate or its methods. */
export function admitConnectionProvider(candidate: LLMProvider, execution?: ConnectionExecutionContext, _evidence?: unknown): LLMProvider {
	assertConnectionProviderAdmission(execution);
	return candidate;
}
