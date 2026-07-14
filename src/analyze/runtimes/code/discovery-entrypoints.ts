/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: code.discovery.entrypoints
 *
 * Enumerates the functional entrypoints in scope. An "entrypoint"
 * here is any exported function / method / class within the repo's
 * indexed entities. Exports are the natural cross-module surface;
 * higher-fidelity classification (HTTP route vs CLI vs cron vs RPC)
 * requires per-language conventions and is intentionally NOT in
 * this revision -- the aggregator can ask follow-up tasks if it
 * needs the breakdown.
 *
 * Output:
 *   { entrypoints: Array<{ name, kind, file, startLine, endLine,
 *                          language, signature?, entityId }> }
 *
 * Supported scopeRef kinds: repo, manifest-dir.
 * Output sorted by (file, startLine, name) for deterministic
 * plan-replay.
 *
 * Deterministic: no LLM involvement.
 */

import { getLogger } from '../../../shared/logger.js';
import { getDb } from '../../../db/client.js';
import { listEntitiesForRepo } from '../../../db/entities.js';

import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import {
	compareEntitiesByLocation,
	readScopeRef,
	resolveRepoPath,
} from './_shared.js';

const TEMPLATE_ID = 'code.discovery.entrypoints';
const log = getLogger('analyze:runtimes:code:discovery-entrypoints');

const ENTRYPOINT_KINDS = new Set(['function', 'method', 'class']);

interface EntrypointRecord {
	readonly name:       string;
	readonly kind:       string;
	readonly file:       string;
	readonly startLine:  number;
	readonly endLine:    number;
	readonly language:   string;
	readonly signature?: string;
	readonly entityId:   string;
}

export const codeDiscoveryEntrypointsRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		const repoPath = resolveRepoPath(scopeRef, TEMPLATE_ID);

		const db       = await getDb();
		const entities = await listEntitiesForRepo(db, repoPath);

		const filtered = entities.filter(
			e => ENTRYPOINT_KINDS.has(e.kind) && e.isExported === true,
		);
		filtered.sort(compareEntitiesByLocation);

		const entrypoints: EntrypointRecord[] = filtered.map(e => ({
			name:      e.name,
			kind:      e.kind,
			file:      e.file,
			startLine: e.startLine,
			endLine:   e.endLine,
			language:  e.language,
			...(e.signature !== undefined ? { signature: e.signature } : {}),
			entityId:  e.id,
		}));

		log.info(
			{
				runId:           args.runId,
				taskId:          args.task.taskId,
				repoPath,
				entrypointCount: entrypoints.length,
			},
			'code.discovery.entrypoints: enumerated entrypoints',
		);

		return {
			outputs: new Map<string, unknown>([['entrypoints', entrypoints]]),
		};
	},
};
