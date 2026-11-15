import { captureAnalysisDiagnostics } from '../../connection-access.js';
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
import { analysisConnectionContext, savedAnalysisExecution, assertAnalysisConnectionExecution } from '../../connection-access.js';
import { resolve } from 'node:path';
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
	dataConnectionResolver,
	optionalStringParam,
	requireStringParam,
	connectionWithinScope,
	resolveDataScope,
} from './_shared.js';
import { buildCompleteness } from '../../completeness.js';
import type { SkippedItem } from '../../completeness.js';

const TEMPLATE_ID = 'data.discovery.objects';
const log = getLogger('analyze:runtimes:data:discovery-objects');

interface ObjectRecord {
	readonly kind:   string;
	readonly name?:  string;
	readonly path?:  string;
	readonly size?:  number;
	readonly mtime?: string;
	readonly schema?: string;
}

/**
 * A listing that is not the whole: a store that derives its namespaces from a sample of its keys (Redis, etcd),
 * or a driver that stopped early. It is reported as sampled and incomplete, never as a limit.
 */
function sampleSkip(what: string, sampled: boolean): SkippedItem {
	return {
		what:   `${what} outside the listing`,
		reason: sampled
			? `the store has no ${what}; they are derived from a sample of its keys, which are not scanned in full`
			: `the driver stopped before the end of its listing of ${what}`,
	};
}

export const dataDiscoveryObjectsRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		assertAnalysisConnectionExecution(args.connectionExecution);
		const scope        = await resolveDataScope(args, TEMPLATE_ID);
		const repoPath     = scope.poolPath;
		const connectionId = connectionWithinScope(scope, requireStringParam(args, 'connectionId', TEMPLATE_ID), TEMPLATE_ID);
		const kindFilter   = optionalStringParam(args, 'kind', TEMPLATE_ID);

		const access = analysisConnectionContext(repoPath, args.connectionExecution ?? savedAnalysisExecution(repoPath));
		return dataConnectionResolver.withConnection(access, connectionId, async driver => {


			const objects: ObjectRecord[] = [];
			// A listing that is only a sample, or that the driver stopped, for the completeness record.
			const skipped: SkippedItem[] = [];
			switch (driver.family) {
				case 'rdbms': {
					const r = driver as RdbmsDriver;
					if (typeof r.listTables !== 'function') {
						throw new Error(
							`${TEMPLATE_ID}: driver '${driver.kind}' does not support listTables`,
						);
					}
					// The driver's complete listing: every table, with no limit.
					const listing = await r.listTables({ complete: true });
					for (const t of listing.tables) {
						objects.push({
							kind:   'table',
							name:   t.name,
							...(t.schema !== undefined ? { schema: t.schema } : {}),
						});
					}
					if (listing.truncated) skipped.push(sampleSkip('tables', false));
					break;
				}
				case 'kv': {
					const k = driver as KvDriver;
					if (typeof k.listNamespaces !== 'function') {
						throw new Error(
							`${TEMPLATE_ID}: driver '${driver.kind}' does not support listNamespaces`,
						);
					}
					// Every namespace where the store has them to list; a store that derives them from a key sample stays a sample.
					const listing = await k.listNamespaces({ complete: true });
					for (const ns of listing.namespaces) {
						objects.push({ kind: 'namespace', name: ns.name });
					}
					if (listing.truncated || listing.sampled === true) skipped.push(sampleSkip('namespaces', listing.sampled === true));
					break;
				}
				case 'file': {
					// File drivers store the filesystem root on the
					// Safe metadata supplies its path; the lease also covers the filesystem walk.
					const config = (await dataConnectionResolver.list(access)).find(c => c.key.id === connectionId);
	 const path = config?.publicConfig['path'];
					if (config === undefined || typeof path !== 'string') {
						throw new Error(
							`${TEMPLATE_ID}: file connection '${connectionId}' missing config.path`,
						);
					}
					const result = await listFilesForConnection(resolve(repoPath, path), {
						recursive: config.publicConfig['recursive'] === true,
					});
					for (const f of result.files) {
						objects.push({
							kind:  'file',
							path:  f.path,
							size:  f.size,
							mtime: f.mtime,
						});
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

			captureAnalysisDiagnostics(log, args.connectionExecution).emit('info', () => [{
					runId:        args.runId,
					taskId:       args.task.taskId,
					connectionId,
					driverFamily: driver.family,
					kindFilter:   kindFilter ?? '(none)',
					objectCount:  filtered.length,
			}, 'data.discovery.objects: enumerated']);

			return {
				outputs: new Map<string, unknown>([['objects', filtered]]),
				completeness: buildCompleteness({ returned: filtered.length, skipped, basis: 'data-source' }),
			};
		});
	},
};
