/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * db.tables.list exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 5. Given a
 * connectionId, enumerate the tables (rdbms) / namespaces (kv) /
 * file targets (file). Wraps the same primitives that back
 * `db_sql_list_tables` + `db_kv_list_namespaces`.
 *
 * Deterministic per-driver. No LLM. Graceful degradation: when a
 * driver doesn't implement the listing primitive, the runner
 * returns an empty output with a `notFoundNote` explaining why.
 */

import { acquirePool } from '../../daemon/db/index.js';
import { getLogger } from '../../shared/logger.js';
import type { KvDriver, RdbmsDriver } from '../../daemon/db/index.js';

import type {
	DbTableSummary,
	DbTablesListOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';

const log = getLogger('analyze:explore:db-tables-list');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 40;
const MAX_LIMIT     = 500;

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface DbTablesListParams {
	readonly connectionId: string;
	readonly schema?:      string;
	readonly limit?:       number;
}

function parseParams(exp: Exploration): DbTablesListParams {
	const p = exp.params as Record<string, unknown>;
	const connectionId = typeof p['connectionId'] === 'string' ? (p['connectionId'] as string).trim() : '';
	if (connectionId.length === 0) {
		throw new Error('db.tables.list: params.connectionId is required (non-empty string)');
	}
	const schema = typeof p['schema'] === 'string' && (p['schema'] as string).length > 0
		? (p['schema'] as string)
		: undefined;
	const limit = typeof p['limit'] === 'number' && p['limit']! > 0
		? Math.min(MAX_LIMIT, Math.floor(p['limit'] as number))
		: DEFAULT_LIMIT;
	return {
		connectionId,
		...(schema !== undefined ? { schema } : {}),
		limit,
	};
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runDbTablesList(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<DbTablesListOutput> {
	const params = parseParams(exp);
	const limit = params.limit ?? DEFAULT_LIMIT;

	let pool;
	try {
		pool = await acquirePool(ctx.repoPath);
	} catch (err) {
		return emptyOutput(params.connectionId, 'file', `Pool acquisition failed: ${(err as Error).message}`);
	}

	let driver;
	try {
		driver = await pool.acquire(params.connectionId);
	} catch (err) {
		return emptyOutput(params.connectionId, 'file', (err as Error).message);
	}

	const family = driver.family;
	let tables: DbTableSummary[] = [];
	let truncated = false;
	let notFoundNote = '';

	if (family === 'rdbms') {
		const rdbms = driver as RdbmsDriver;
		if (rdbms.listTables === undefined) {
			notFoundNote = `Driver kind '${driver.kind}' does not implement listTables.`;
		} else {
			try {
				const opts: { readonly schema?: string; readonly limit?: number } =
					params.schema !== undefined ? { schema: params.schema, limit } : { limit };
				const listing = await rdbms.listTables(opts);
				tables = listing.tables.map(t => ({
					name:   t.name,
					...(t.schema !== undefined ? { schema: t.schema } : {}),
					kind:   t.kind,
					...(t.approxRowCount !== undefined ? { rowEstimate: t.approxRowCount } : {}),
				}));
				truncated = listing.truncated;
			} catch (err) {
				notFoundNote = `listTables failed: ${(err as Error).message}`;
			}
		}
	} else if (family === 'kv') {
		const kv = driver as KvDriver;
		if (kv.listNamespaces === undefined) {
			notFoundNote = `Driver kind '${driver.kind}' does not implement listNamespaces.`;
		} else {
			try {
				const listing = await kv.listNamespaces({ limit });
				tables = listing.namespaces.map(n => ({
					name: n.name,
					kind: n.kind ?? 'namespace',
					...(n.approxCount !== undefined ? { rowEstimate: n.approxCount } : {}),
				}));
				truncated = listing.truncated;
				if (!listing.supported) {
					notFoundNote = `Driver kind '${driver.kind}' reports listNamespaces not supported on this instance.`;
				}
			} catch (err) {
				notFoundNote = `listNamespaces failed: ${(err as Error).message}`;
			}
		}
	} else {
		// family === 'file'; each connection is a single target (a
		// file or a directory-as-table). No cross-target listing --
		// surface the connection itself as the only "table".
		notFoundNote =
			`Connection '${params.connectionId}' is a file-family driver -- ` +
			`each connection is a single target and does not enumerate multiple tables.`;
	}

	log.info(
		{
			runId:        ctx.runId,
			connectionId: params.connectionId,
			family,
			tables:       tables.length,
			truncated,
		},
		'db.tables.list: complete',
	);

	return {
		type:         'db.tables.list',
		connectionId: params.connectionId,
		family,
		tables,
		truncated,
		notFoundNote,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyOutput(
	connectionId: string,
	family:       'rdbms' | 'kv' | 'file',
	note:         string,
): DbTablesListOutput {
	return {
		type:         'db.tables.list',
		connectionId,
		family,
		tables:       [],
		truncated:    false,
		notFoundNote: note,
	};
}
