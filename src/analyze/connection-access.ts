/** Explicit saved entry and staged fail-closed trusted carrier consumption. */
import type { ConnectionAccessContext } from '../shared/connection-management.js';
import { requireConnectionExecution, savedConnectionExecution, ConnectionExecutionError } from '../shared/step-context.js';
import type { ConnectionExecutionContext, ConnectionExecutionLifetime, SavedConnectionExecution } from '../shared/step-context.js';
import { RequestLifetime } from '../daemon/request-context.js';
import { getLogger } from '../shared/logger.js';

/** Compatibility entry for an unattached saved caller. No session is inferred. */
export function savedAnalysisExecution(lookupRoot: string, lifetime: ConnectionExecutionLifetime = new RequestLifetime()): SavedConnectionExecution {
	return savedConnectionExecution({ lookupRoot, daemonEpoch: 'saved-analysis' }, lifetime, {
		emit: (level, format) => getLogger('analyze:connection-access')[level]({ detail: format() }, 'analysis execution'),
	});
}

export function analysisConnectionContext(lookupRoot: string, execution?: ConnectionExecutionContext): ConnectionAccessContext {
	const trusted = requireConnectionExecution(execution === undefined ? savedAnalysisExecution(lookupRoot) : execution);
	if (trusted.connectionAccess.lookupRoot !== lookupRoot) throw new ConnectionExecutionError('session-expired');
	return trusted.connectionAccess;
}
