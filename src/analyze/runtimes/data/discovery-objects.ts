/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: data.discovery.objects
 *
 * Enumerate the tables / files / namespaces inside one registered
 * connection. Dispatches by driver family:
 *   - rdbms : driver.listTables() -> 'table' objects
 *   - kv    : driver.listNamespaces() -> 'namespace' objects
 *   - file  : listFilesForConnection() -> 'file' objects
 *
 * Required params:
 *   - connectionId : the id of a registered connection in this repo
 * Optional params:
 *   - kind         : 'table' | 'file' | 'collection' | 'namespace'
 *                    filter -- post-filters the dispatch result
 *
 * Output:
 *   { objects: Array<{ kind, name? | path?, ...details }> }
 *
 * Throws when:
 *   - intent.scopeRef isn't workspace/repo/manifest-dir
 *   - connection id isn't registered for this repo
 *   - driver family doesn't support enumeration in this revision
 *     (RDBMS without listTables, KV without listNamespaces, etc.)
 */

import { getLogger } from '../../../shared/logger.js';
import { listFilesForConnection } from '../../../daemon/db/list-files.js';

import type {
	FileDriver,
	KvDriver,
	RdbmsDriver,
} from '../../../shared/db-driver.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import {
	acquireDataPool,
	optionalStringParam,
	requireStringParam,
	connectionWithinScope,
	resolveDataScope,
} from './_shared.js';
import { buildCompleteness } from '../../completeness.js';
import type { ReachedLimit } from '../../completeness.js';

const TEMPLATE_ID = 'data.discovery.objects';
const log = getLogger('analyze:runtimes:data:discovery-objects');

/** File-listing cap. Plans never need >200 files; keeps the
 *  prompt envelope finite. */
const FILE_LIST_LIMIT = 200;

interface ObjectRecord {
	readonly kind:   string;
	readonly name?:  string;
	readonly path?:  string;
	readonly size?:  number;
	readonly mtime?: string;
	readonly schema?: string;
}

/** The limit a driver reached on its own listing; `listed` is how many it returned. */
function driverCut(what: string, listed: number): ReachedLimit {
	return {
		what, limit: listed, scope: 'source',
		reason: `the driver stopped its listing at ${listed} ${what}; how many more exist is not known`,
	};
}

export const dataDiscoveryObjectsRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scope        = await resolveDataScope(args, TEMPLATE_ID);
		const repoPath     = scope.poolPath;
		const connectionId = connectionWithinScope(scope, requireStringParam(args, 'connectionId', TEMPLATE_ID), TEMPLATE_ID);
		const kindFilter   = optionalStringParam(args, 'kind', TEMPLATE_ID);

		const pool = await acquireDataPool(repoPath);
		await pool.reload();
		const driver = await pool.acquire(connectionId);

		const objects: ObjectRecord[] = [];
		// A listing the driver or the file walk cut short, for the completeness record.
		const limited: ReachedLimit[] = [];
		switch (driver.family) {
			case 'rdbms': {
				const r = driver as RdbmsDriver;
				if (typeof r.listTables !== 'function') {
					throw new Error(
						`${TEMPLATE_ID}: driver '${driver.kind}' does not support listTables`,
					);
				}
				const listing = await r.listTables();
				for (const t of listing.tables) {
					objects.push({
						kind:   'table',
						name:   t.name,
						...(t.schema !== undefined ? { schema: t.schema } : {}),
					});
				}
				// The driver's own cut flag: it stopped at its default limit.
				if (listing.truncated) limited.push(driverCut('tables', listing.tables.length));
				break;
			}
			case 'kv': {
				const k = driver as KvDriver;
				if (typeof k.listNamespaces !== 'function') {
					throw new Error(
						`${TEMPLATE_ID}: driver '${driver.kind}' does not support listNamespaces`,
					);
				}
				const listing = await k.listNamespaces();
				for (const ns of listing.namespaces) {
					objects.push({ kind: 'namespace', name: ns.name });
				}
				if (listing.truncated) limited.push(driverCut('namespaces', listing.namespaces.length));
				break;
			}
			case 'file': {
				// File drivers store the filesystem root on the
				// ConnectionConfig (config.path). Pull it via pool.list().
				const config = pool.list().find(c => c.id === connectionId);
				if (config === undefined || typeof config.path !== 'string') {
					throw new Error(
						`${TEMPLATE_ID}: file connection '${connectionId}' missing config.path`,
					);
				}
				const result = await listFilesForConnection(config.path, {
					recursive: config.recursive === true,
					limit:     FILE_LIST_LIMIT,
				});
				for (const f of result.files) {
					objects.push({
						kind:  'file',
						path:  f.path,
						size:  f.size,
						mtime: f.mtime,
					});
				}
				if (result.truncated) {
					limited.push({
						what: 'files', limit: FILE_LIST_LIMIT, scope: 'source',
						reason: `the file listing stops at ${FILE_LIST_LIMIT} files; how many more the connection holds is not known`,
					});
					log.warn(
						{ runId: args.runId, taskId: args.task.taskId, connectionId, limit: FILE_LIST_LIMIT },
						'file listing truncated; raise FILE_LIST_LIMIT if downstream needs the full set',
					);
				}
				void (driver as FileDriver);
				break;
			}
			default:
				throw new Error(
					`${TEMPLATE_ID}: driver family '${(driver as { family: string }).family}' not supported`,
				);
		}

		const filtered = kindFilter !== undefined
			? objects.filter(o => o.kind === kindFilter)
			: objects;

		// Stable order: by name|path ascending.
		filtered.sort((a, b) => {
			const ka = a.name ?? a.path ?? '';
			const kb = b.name ?? b.path ?? '';
			return ka < kb ? -1 : ka > kb ? 1 : 0;
		});

		log.info(
			{
				runId:        args.runId,
				taskId:       args.task.taskId,
				connectionId,
				driverFamily: driver.family,
				kindFilter:   kindFilter ?? '(none)',
				objectCount:  filtered.length,
			},
			'data.discovery.objects: enumerated',
		);

		return {
			outputs: new Map<string, unknown>([['objects', filtered]]),
			completeness: buildCompleteness({ returned: filtered.length, limited, basis: 'data-source' }),
		};
	},
};
