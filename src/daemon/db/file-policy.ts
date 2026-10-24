import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { ConnectionConfig } from '../../shared/db-driver.js';
import type { FileExecutionPolicy } from '../../shared/connection-management.js';
/** Authority is supplied by the daemon owner, never by config.options. */
export function fileExecutionPolicy(config: ConnectionConfig, authority: {
	readonly lookupRoot: string;
	readonly ownerId: string;
	readonly revision: string;
	readonly persistence: 'saved-cache' | 'memory-only';
}): FileExecutionPolicy {
	const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
	return { identity: { lookupRoot: resolve(authority.lookupRoot), ownerId: authority.ownerId,
			connectionId: config.id, revision: authority.revision,
			sourceIdentity: digest({ kind: config.kind, path: config.path }),
			converterOptionsDigest: digest(config.options ?? {}),
		}, persistence: authority.persistence, memoryBudgetBytes: 256 * 1024 * 1024, allowSpill: false };
}
