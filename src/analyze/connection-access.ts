/** Explicit saved entry and staged fail-closed trusted carrier consumption. */
import type { ConnectionAccessContext } from '../shared/connection-management.js';
import { assertExplicitConnectionExecution, requireConnectionExecution, savedConnectionExecution, ConnectionExecutionError, currentStepContext } from '../shared/step-context.js';
import type { ConnectionExecutionContext, ConnectionExecutionLifetime, SavedConnectionExecution, ConnectionExecutionDiagnostics } from '../shared/step-context.js';
import { RequestLifetime } from '../daemon/request-context.js';
import { getLogger } from '../shared/logger.js';

/** Compatibility entry for an unattached saved caller. No session is inferred. */
export function savedAnalysisExecution(lookupRoot: string, lifetime: ConnectionExecutionLifetime = new RequestLifetime()): SavedConnectionExecution {
	return savedConnectionExecution({ lookupRoot, daemonEpoch: 'saved-analysis' }, lifetime, {
		emit: (level, format) => getLogger('analyze:connection-access')[level]({ detail: format() }, 'analysis execution'),
	});
}

/** Validate the explicit carrier before inspecting tool/runtime inputs. */
export function assertAnalysisConnectionExecution(execution: ConnectionExecutionContext | undefined): void {
 assertExplicitConnectionExecution(execution);
 if (execution?.mode === 'session-memory' && execution.audience !== 'workbench-ui') throw new ConnectionExecutionError('unsupported-temporary');
}

export function analysisConnectionContext(lookupRoot: string, execution: ConnectionExecutionContext): ConnectionAccessContext {
	assertAnalysisConnectionExecution(execution);
	const trusted = requireConnectionExecution(execution);
	if (trusted.connectionAccess.lookupRoot !== lookupRoot) throw new ConnectionExecutionError('session-expired');
	return trusted.connectionAccess;
}

/** Capture the immutable diagnostic policy before evaluating any source-bearing
 * formatter. It deliberately does not revalidate authority: late work stays
 * quiet after expiry, cancellation, or owner teardown. ALS is denial-only for
 * legacy internal callers; it never grants connection access. */
export function captureAnalysisDiagnostics(logger: object, execution?: ConnectionExecutionContext): ConnectionExecutionDiagnostics {
	const quiet = execution?.mode === 'session-memory' || currentStepContext()?.connectionExecution?.mode === 'session-memory';
	const sink: ConnectionExecutionDiagnostics = {
		emit(level, format) {
			if (quiet) return;
			const values = format() as readonly unknown[];
			const saved = logger as Record<string, (...args: unknown[]) => void>;
			saved[level]!.apply(logger, [...values]);
		}
	};
	return Object.freeze(sink);
}
