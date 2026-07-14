/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: data.discovery.connections
 *
 * Enumerate every registered data connection visible to the active
 * scope. Reads from the per-repo data-driver pool; emits a safe
 * summary that NEVER leaks secrets (url + secretRef are projected
 * to has* booleans).
 *
 * Output:
 *   { connections: Array<{
 *       id, kind, family?, label?, hasUrl, hasPath, ephemeral?
 *     }> }
 *
 * Repo path resolution:
 *   - task.params.scopeRefValue (optional override) takes precedence
 *   - else, intent.scopeRef.value when scopeRef.kind in
 *     {workspace, repo, manifest-dir}
 *
 * Deterministic. No LLM. Sorts by connection id for plan-replay.
 */

import { getLogger } from '../../../shared/logger.js';
import { acquirePool, familyOf } from '../../../daemon/db/index.js';

import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import {
	optionalStringParam,
	resolveRepoPathFromIntent,
} from './_shared.js';

const TEMPLATE_ID = 'data.discovery.connections';
const log = getLogger('analyze:runtimes:data:discovery-connections');

interface ConnectionRecord {
	readonly id:         string;
	readonly kind:       string;
	readonly family?:    string;
	readonly label?:     string;
	readonly hasUrl:     boolean;
	readonly hasPath:    boolean;
	readonly ephemeral?: true;
}

export const dataDiscoveryConnectionsRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const explicit = optionalStringParam(args, 'scopeRefValue', TEMPLATE_ID);
		const repoPath = explicit ?? resolveRepoPathFromIntent(args, TEMPLATE_ID);

		const pool = await acquirePool(repoPath);
		// reload() is idempotent + cheap; ensures we see edits made to
		// db-connections.json after the pool was first acquired.
		await pool.reload();
		const configs = pool.list();

		const connections: ConnectionRecord[] = configs.map(c => ({
			id:       c.id,
			kind:     c.kind,
			...(c.family !== undefined || familyOf(c.kind) !== undefined
				? { family: (c.family ?? familyOf(c.kind))! }
				: {}),
			...(c.label !== undefined ? { label: c.label } : {}),
			hasUrl:   c.url  !== undefined,
			hasPath:  c.path !== undefined,
			...(c.ephemeral === true ? { ephemeral: true as const } : {}),
		}));

		connections.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

		log.info(
			{
				runId:           args.runId,
				taskId:          args.task.taskId,
				repoPath,
				connectionCount: connections.length,
			},
			'data.discovery.connections: enumerated',
		);

		return {
			outputs: new Map<string, unknown>([['connections', connections]]),
		};
	},
};
