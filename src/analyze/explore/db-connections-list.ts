import { captureAnalysisDiagnostics } from '../connection-access.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * db.connections.list exploration runner.
 *
 * docs/plans/exploration-based-context-build.md Phase 5. Enumerate the
 * data-driver connections registered for the active repo. Wraps the
 * same primitive that powers `db_list_connections` (see
 * daemon/tools/builtins/db/index.ts) -- one code path, two consumers.
 *
 * Deterministic + repo-scoped. No LLM. Fail-open: when the pool has
 * zero entries, the runner returns an empty output with a
 * `notFoundNote` instead of throwing -- the synthesizer renders an
 * honest "0 sources" bundle.
 */

import { acquirePool } from '../../daemon/db/index.js';
import { createConnectionResolver } from '../../daemon/db/pool-cache.js';
import { analysisConnectionContext, savedAnalysisExecution, assertAnalysisConnectionExecution } from '../connection-access.js';
import { getLogger } from '../../shared/logger.js';

import type {
	DbConnectionSummary,
	DbConnectionsListOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';
import { buildCompleteness } from '../completeness.js';

const log = getLogger('analyze:explore:db-connections-list');

// ---------------------------------------------------------------------------
// Params (none -- listing is unconditional)
// ---------------------------------------------------------------------------

export async function runDbConnectionsList(
	_exp: Exploration,
	ctx: ExplorationRunnerContext,
	/** The connection pool's source; a test passes a stand-in. */
	acquire: typeof acquirePool = acquirePool,
): Promise<DbConnectionsListOutput> {
	assertAnalysisConnectionExecution(ctx.connectionExecution);
	// A registry that cannot be read is a lookup that could not run: it throws,
	// and the executor reports it as failed. "No connections" is said only when
	// the registry was read and holds none.
	const resolver = createConnectionResolver({ poolSource: acquire });
	const list = await resolver.list(analysisConnectionContext(ctx.repoPath, ctx.connectionExecution ?? savedAnalysisExecution(ctx.repoPath)));
	const connections: DbConnectionSummary[] = list.map(c => {
		const fam = c.family;
		return {
			id:     c.key.id,
			kind:   c.kind,
			family: (fam ?? 'file') as DbConnectionSummary['family'],
			label:  c.label ?? c.key.id,
			...(typeof c.publicConfig['path'] === 'string' ? { path: c.publicConfig['path'] } : {}),
		};
	});

	captureAnalysisDiagnostics(log, ctx.connectionExecution).emit('info', () => [{ runId: ctx.runId, repoPath: ctx.repoPath, count: connections.length }, 'db.connections.list: complete']);

	return {
		type:        'db.connections.list',
		completeness: buildCompleteness({ returned: connections.length, basis: 'data-source' }),
		connections,
		notFoundNote: connections.length === 0
			? `No data-driver connections registered for repo "${ctx.repoPath}".`
			: '',
	};
}
