/** Saved-only analysis access. Registry management rights and future session ownership are separate. */
import type { ConnectionAccessContext } from '../shared/connection-management.js';
export function analysisConnectionContext(lookupRoot: string): ConnectionAccessContext {
	return { lookupRoot, daemonEpoch: 'saved-analysis' };
}
