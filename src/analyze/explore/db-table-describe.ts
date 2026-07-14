/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * db.table.describe exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 5. Describe one
 * table (rdbms) / namespace (kv) / file target (file). Wraps the
 * same primitives that back `db_sql_describe` +
 * `db_kv_describe_namespace`. Deterministic. No LLM.
 */

import { acquirePool } from '../../daemon/db/index.js';
import { getLogger } from '../../shared/logger.js';
import type { KvDriver, RdbmsDriver, FileDriver } from '../../daemon/db/index.js';

import type {
	DbColumnSummary,
	DbTableDescribeOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';

const log = getLogger('analyze:explore:db-table-describe');

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface DbTableDescribeParams {
	readonly connectionId: string;
	readonly target:       string;
}

function parseParams(exp: Exploration): DbTableDescribeParams {
	const p = exp.params as Record<string, unknown>;
	const connectionId = typeof p['connectionId'] === 'string' ? (p['connectionId'] as string).trim() : '';
	const target       = typeof p['target']       === 'string' ? (p['target']       as string).trim() : '';
	if (connectionId.length === 0 || target.length === 0) {
		throw new Error('db.table.describe: params.connectionId and params.target are required');
	}
	return { connectionId, target };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runDbTableDescribe(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<DbTableDescribeOutput> {
	const params = parseParams(exp);

	let pool;
	try {
		pool = await acquirePool(ctx.repoPath);
	} catch (err) {
		return empty(params, 'file', `Pool acquisition failed: ${(err as Error).message}`);
	}

	let driver;
	try {
		driver = await pool.acquire(params.connectionId);
	} catch (err) {
		return empty(params, 'file', (err as Error).message);
	}

	const family = driver.family;
	let columns: DbColumnSummary[] = [];
	let shapeSummary = '';
	let notFoundNote = '';

	if (family === 'rdbms') {
		try {
			const schema = await (driver as RdbmsDriver).describe(params.target);
			columns = schema.columns.map(c => ({
				name:      c.name,
				type:      c.type,
				...(c.nullable   !== undefined ? { nullable:   c.nullable   } : {}),
				...(c.primaryKey !== undefined ? { primaryKey: c.primaryKey } : {}),
				...(c.foreignKey !== undefined ? { foreignKey: {
					table:  c.foreignKey.table,
					column: c.foreignKey.column,
				} } : {}),
			}));
		} catch (err) {
			notFoundNote = `rdbms describe failed: ${(err as Error).message}`;
		}
	} else if (family === 'kv') {
		const kv = driver as KvDriver;
		if (kv.describeNamespace === undefined) {
			notFoundNote = `Driver kind '${driver.kind}' does not implement describeNamespace.`;
		} else {
			try {
				const desc = await kv.describeNamespace(params.target);
				shapeSummary = summariseKvDescription(desc);
			} catch (err) {
				notFoundNote = `describeNamespace failed: ${(err as Error).message}`;
			}
		}
	} else if (family === 'file') {
		const fd = driver as FileDriver;
		if (fd.describe === undefined) {
			notFoundNote = `Driver kind '${driver.kind}' does not implement describe.`;
		} else {
			try {
				const schema = await fd.describe(params.target);
				columns = schema.columns.map(c => ({
					name: c.name,
					type: c.type,
					...(c.nullable !== undefined ? { nullable: c.nullable } : {}),
				}));
			} catch (err) {
				notFoundNote = `file describe failed: ${(err as Error).message}`;
			}
		}
	}

	log.info(
		{
			runId:        ctx.runId,
			connectionId: params.connectionId,
			target:       params.target,
			family,
			columns:      columns.length,
		},
		'db.table.describe: complete',
	);

	return {
		type:         'db.table.describe',
		connectionId: params.connectionId,
		target:       params.target,
		family,
		columns,
		shapeSummary,
		notFoundNote,
	};
}

function empty(
	params: DbTableDescribeParams,
	family: 'rdbms' | 'kv' | 'file',
	note:   string,
): DbTableDescribeOutput {
	return {
		type:         'db.table.describe',
		connectionId: params.connectionId,
		target:       params.target,
		family,
		columns:      [],
		shapeSummary: '',
		notFoundNote: note,
	};
}

function summariseKvDescription(desc: {
	name:        string;
	kind?:       string;
	approxCount: number | null;
	sampleKeys:  readonly string[];
	fields:      readonly { path: string; types: readonly string[]; nullable: boolean; frequency: number }[];
	supported:   boolean;
}): string {
	const parts: string[] = [];
	parts.push(`namespace: ${desc.name}`);
	if (desc.kind !== undefined)   parts.push(`kind: ${desc.kind}`);
	if (desc.approxCount !== null) parts.push(`keys≈${desc.approxCount}`);
	if (desc.fields.length > 0) {
		parts.push(
			`fields: ${desc.fields
				.slice(0, 8)
				.map(f => `${f.path}:${f.types.join('|')}`)
				.join(', ')}`,
		);
	}
	if (desc.sampleKeys.length > 0) {
		parts.push(`sampleKeys: ${desc.sampleKeys.slice(0, 5).join(', ')}`);
	}
	if (!desc.supported) parts.push('(unsupported)');
	return parts.join(' | ');
}
