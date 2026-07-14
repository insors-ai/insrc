/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: data.schema.table
 *
 * Describe the schema of a single SQL table or one target in a
 * file-family connection.
 *
 * Required params:
 *   - connectionId : registered connection in this repo
 *   - table        : table name (rdbms) or target (file family)
 * Optional params:
 *   - depth        : 'shallow' (default) | 'deep'
 *                    'deep' attempts listIndexes() on RDBMS drivers
 *                    that support it; failures are non-fatal.
 *
 * Output:
 *   { 'table-schema': {
 *       connectionId, table,
 *       columns: ColumnDescription[],
 *       source:  'introspect' | 'prisma' | 'header' | 'inferred',
 *       indexes?: IndexDescription[]  // depth='deep' only
 *     } }
 *
 * Family support in this revision:
 *   - rdbms : driver.describe(table) + optional listIndexes (deep)
 *   - file  : driver.describe?(table) if exposed by the FileDriver
 *   - kv    : not supported -- throws
 */

import { getLogger } from '../../../shared/logger.js';
import { acquirePool } from '../../../daemon/db/index.js';

import type {
	FileDriver,
	IndexListing,
	RdbmsDriver,
	SchemaDescription,
} from '../../../shared/db-driver.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import {
	optionalStringParam,
	requireStringParam,
	resolveRepoPathFromIntent,
} from './_shared.js';

const TEMPLATE_ID = 'data.schema.table';
const log = getLogger('analyze:runtimes:data:schema-table');

export const dataSchemaTableRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const repoPath     = resolveRepoPathFromIntent(args, TEMPLATE_ID);
		const connectionId = requireStringParam(args, 'connectionId', TEMPLATE_ID);
		const table        = requireStringParam(args, 'table',        TEMPLATE_ID);
		const depthOpt     = optionalStringParam(args, 'depth',       TEMPLATE_ID);
		const deep         = depthOpt === 'deep';

		const pool   = await acquirePool(repoPath);
		await pool.reload();
		const driver = await pool.acquire(connectionId);

		let schema: SchemaDescription;
		let indexes: IndexListing | undefined = undefined;

		switch (driver.family) {
			case 'rdbms': {
				const r = driver as RdbmsDriver;
				schema = await r.describe(table);
				if (deep && typeof r.listIndexes === 'function') {
					try {
						indexes = await r.listIndexes(table);
					} catch (err) {
						// Non-fatal: some dialects/permissions don't expose
						// indexes. Log + omit; the schema itself is still valuable.
						log.warn(
							{ runId: args.runId, taskId: args.task.taskId, connectionId, table,
							  err: (err as Error).message },
							'listIndexes failed; omitting indexes from deep schema',
						);
					}
				}
				break;
			}
			case 'file': {
				const f = driver as FileDriver;
				if (typeof f.describe !== 'function') {
					throw new Error(
						`${TEMPLATE_ID}: file driver '${driver.kind}' does not expose describe()`,
					);
				}
				schema = await f.describe(table);
				break;
			}
			case 'kv':
				throw new Error(
					`${TEMPLATE_ID}: kv driver '${driver.kind}' has no table concept; use a different family or template`,
				);
			default:
				throw new Error(
					`${TEMPLATE_ID}: driver family '${(driver as { family: string }).family}' not supported`,
				);
		}

		const result = {
			connectionId,
			table,
			columns: schema.columns,
			source:  schema.source,
			...(indexes !== undefined ? { indexes: indexes.indexes } : {}),
		};

		log.info(
			{
				runId:        args.runId,
				taskId:       args.task.taskId,
				connectionId,
				table,
				columnCount:  schema.columns.length,
				source:       schema.source,
				depth:        deep ? 'deep' : 'shallow',
				indexCount:   indexes?.indexes.length ?? 0,
			},
			'data.schema.table: extracted',
		);

		return {
			outputs: new Map<string, unknown>([['table-schema', result]]),
		};
	},
};
