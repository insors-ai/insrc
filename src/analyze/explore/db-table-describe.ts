/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * db.table.describe exploration runner.
 *
 * docs/plans/exploration-based-context-build.md Phase 5. Describe one
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
import { buildCompleteness } from '../completeness.js';
import type { ReachedLimit } from '../completeness.js';
import { reachedLimit } from './completeness-facts.js';

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
	/** The connection pool's source; a test passes a stand-in. */
	acquire: typeof acquirePool = acquirePool,
): Promise<DbTableDescribeOutput> {
	const params = parseParams(exp);

	let pool;
	try {
		pool = await acquire(ctx.repoPath);
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
	// For the completeness record: the call failed, this driver cannot
	// describe, or the key-value summary kept fewer fields or keys than exist.
	let failure: string | undefined;
	let unsupported: string | undefined;
	let returned = 0;
	const limited: ReachedLimit[] = [];

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
			failure = notFoundNote;
		}
	} else if (family === 'kv') {
		const kv = driver as KvDriver;
		if (kv.describeNamespace === undefined) {
			notFoundNote = `Driver kind '${driver.kind}' does not implement describeNamespace.`;
			unsupported = notFoundNote;
		} else {
			try {
				const desc = await kv.describeNamespace(params.target);
				shapeSummary = summariseKvDescription(desc);
				returned = Math.min(desc.fields.length, KV_SUMMARY_FIELDS);
				if (desc.fields.length > KV_SUMMARY_FIELDS) {
					limited.push(reachedLimit('fields', KV_SUMMARY_FIELDS, 'overall', desc.fields.length));
				}
				if (desc.sampleKeys.length > KV_SUMMARY_KEYS) {
					limited.push(reachedLimit('sample keys', KV_SUMMARY_KEYS, 'source', desc.sampleKeys.length));
				}
			} catch (err) {
				notFoundNote = `describeNamespace failed: ${(err as Error).message}`;
				failure = notFoundNote;
			}
		}
	} else if (family === 'file') {
		const fd = driver as FileDriver;
		if (fd.describe === undefined) {
			notFoundNote = `Driver kind '${driver.kind}' does not implement describe.`;
			unsupported = notFoundNote;
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
				failure = notFoundNote;
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

	if (family !== 'kv') returned = columns.length;
	const completeness = buildCompleteness({
		returned,
		limited,
		skipped: unsupported !== undefined ? [{ what: 'the description', reason: unsupported }] : [],
		basis:   'data-source',
		...(failure !== undefined
			? { notEstablished: true, basisNote: failure }
			: family === 'kv' ? { basisNote: 'a key-value namespace is described from a sample of its keys, not from every key' } : {}),
	});

	return {
		type:         'db.table.describe',
		completeness,
		connectionId: params.connectionId,
		target:       params.target,
		family,
		columns,
		shapeSummary,
		// A note that reports a failure or an unsupported description is in the record.
		notFoundNote: failure !== undefined || unsupported !== undefined ? '' : notFoundNote,
	};
}

/** How many fields and sample keys a key-value namespace's summary names. */
const KV_SUMMARY_FIELDS = 8;
const KV_SUMMARY_KEYS   = 5;

function empty(
	params: DbTableDescribeParams,
	family: 'rdbms' | 'kv' | 'file',
	note:   string,
): DbTableDescribeOutput {
	return {
		type:         'db.table.describe',
		// The connection could not be opened, so the target's shape is not known.
		completeness: buildCompleteness({ returned: 0, basis: 'data-source', notEstablished: true, basisNote: note }),
		connectionId: params.connectionId,
		target:       params.target,
		family,
		columns:      [],
		shapeSummary: '',
		notFoundNote: '',
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
				.slice(0, KV_SUMMARY_FIELDS)
				.map(f => `${f.path}:${f.types.join('|')}`)
				.join(', ')}`,
		);
	}
	if (desc.sampleKeys.length > 0) {
		parts.push(`sampleKeys: ${desc.sampleKeys.slice(0, KV_SUMMARY_KEYS).join(', ')}`);
	}
	if (!desc.supported) parts.push('(unsupported)');
	return parts.join(' | ');
}
