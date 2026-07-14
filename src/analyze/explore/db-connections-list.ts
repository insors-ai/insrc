/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * db.connections.list exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 5. Enumerate the
 * data-driver connections registered for the active repo. Wraps the
 * same primitive that powers `db_list_connections` (see
 * daemon/tools/builtins/db/index.ts) -- one code path, two consumers.
 *
 * Deterministic + repo-scoped. No LLM. Fail-open: when the pool has
 * zero entries, the runner returns an empty output with a
 * `notFoundNote` instead of throwing -- the synthesizer renders an
 * honest "0 sources" bundle.
 */

import { familyOf } from '../../daemon/db/index.js';
import { acquirePool } from '../../daemon/db/index.js';
import { getLogger } from '../../shared/logger.js';

import type {
	DbConnectionSummary,
	DbConnectionsListOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';

const log = getLogger('analyze:explore:db-connections-list');

// ---------------------------------------------------------------------------
// Params (none -- listing is unconditional)
// ---------------------------------------------------------------------------

export async function runDbConnectionsList(
	_exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<DbConnectionsListOutput> {
	let pool;
	try {
		pool = await acquirePool(ctx.repoPath);
	} catch (err) {
		log.info(
			{ runId: ctx.runId, repoPath: ctx.repoPath, err: (err as Error).message },
			'db.connections.list: pool acquisition failed; treating as no-connections',
		);
		return {
			type:        'db.connections.list',
			connections: [],
			notFoundNote: `Pool acquisition for repo "${ctx.repoPath}" failed: ${(err as Error).message}`,
		};
	}

	const list = pool.list();
	const connections: DbConnectionSummary[] = list.map(c => {
		const fam = c.family ?? familyOf(c.kind);
		return {
			id:     c.id,
			kind:   c.kind,
			family: (fam ?? 'file') as DbConnectionSummary['family'],
			label:  c.label ?? c.id,
			...(c.path !== undefined ? { path: c.path } : {}),
		};
	});

	log.info(
		{ runId: ctx.runId, repoPath: ctx.repoPath, count: connections.length },
		'db.connections.list: complete',
	);

	return {
		type:        'db.connections.list',
		connections,
		notFoundNote: connections.length === 0
			? `No data-driver connections registered for repo "${ctx.repoPath}".`
			: '',
	};
}
