/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: code.surface.functional
 *
 * Extract the functional surface of a single module:
 *   - exports         : externally-visible symbols (isExported=true)
 *   - internalHelpers : non-exported functions / methods / classes
 *
 * The `module` param is the entity ID of a module entity (the
 * `entityId` field that code.discovery.modules emits). The runtime
 * uses the module entity's file to determine the module's directory
 * prefix, then collects every function / method / class entity in
 * the same repo whose `file` lives under that prefix.
 *
 * For `depth: 'shallow'` (default), `body` is omitted from the
 * output (signature + location only). For `depth: 'deep'`, body
 * is included.
 *
 * Output:
 *   { functional-surface: {
 *       module:          { name, path, entityId },
 *       exports:         SurfaceSymbol[],
 *       internalHelpers: SurfaceSymbol[]
 *     } }
 *
 * Deterministic. Throws on:
 *   - missing params.module
 *   - params.module not a known entity OR not a module entity
 */

import { getLogger } from '../../../shared/logger.js';
import { getDb } from '../../../db/client.js';
import { getEntity, listEntitiesForRepo } from '../../../db/entities.js';

import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import { compareEntitiesByLocation, modulePrefixOf } from './_shared.js';

const TEMPLATE_ID = 'code.surface.functional';
const log = getLogger('analyze:runtimes:code:surface-functional');

const SURFACE_KINDS = new Set(['function', 'method', 'class']);

interface SurfaceSymbol {
	readonly name:       string;
	readonly kind:       string;
	readonly file:       string;
	readonly startLine:  number;
	readonly endLine:    number;
	readonly language:   string;
	readonly signature?: string;
	readonly body?:      string;
	readonly entityId:   string;
}

export const codeSurfaceFunctionalRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const params    = args.task.params as Record<string, unknown>;
		const moduleId  = params['module'];
		const depthRaw  = params['depth'];
		const deep      = depthRaw === 'deep';

		if (typeof moduleId !== 'string' || moduleId.length === 0) {
			throw new Error(
				`${TEMPLATE_ID}: task.params.module missing or not a string (taskId=${args.task.taskId}). ` +
					'INV-5 should have rejected this plan -- check the planner validator.',
			);
		}

		const db = await getDb();
		const moduleEntity = await getEntity(db, moduleId);
		if (moduleEntity === null) {
			throw new Error(
				`${TEMPLATE_ID}: module entity '${moduleId}' not found in the graph (taskId=${args.task.taskId})`,
			);
		}
		if (moduleEntity.kind !== 'module') {
			throw new Error(
				`${TEMPLATE_ID}: entity '${moduleId}' has kind='${moduleEntity.kind}', expected 'module' (taskId=${args.task.taskId})`,
			);
		}

		const prefix   = modulePrefixOf(moduleEntity.file);
		const entities = await listEntitiesForRepo(db, moduleEntity.repo);

		const inModule = entities.filter(
			e => SURFACE_KINDS.has(e.kind) && e.file.startsWith(prefix),
		);
		inModule.sort(compareEntitiesByLocation);

		const exports:         SurfaceSymbol[] = [];
		const internalHelpers: SurfaceSymbol[] = [];

		for (const e of inModule) {
			const sym: SurfaceSymbol = {
				name:      e.name,
				kind:      e.kind,
				file:      e.file,
				startLine: e.startLine,
				endLine:   e.endLine,
				language:  e.language,
				...(e.signature !== undefined ? { signature: e.signature } : {}),
				...(deep                     ? { body: e.body }            : {}),
				entityId:  e.id,
			};
			if (e.isExported === true) exports.push(sym);
			else                       internalHelpers.push(sym);
		}

		const surface = {
			module: {
				name:     moduleEntity.name,
				path:     moduleEntity.file,
				entityId: moduleEntity.id,
			},
			exports,
			internalHelpers,
		};

		log.info(
			{
				runId:                args.runId,
				taskId:               args.task.taskId,
				moduleId,
				modulePrefix:         prefix,
				exportCount:          exports.length,
				internalHelperCount:  internalHelpers.length,
				depth:                deep ? 'deep' : 'shallow',
			},
			'code.surface.functional: extracted surface',
		);

		return {
			outputs: new Map<string, unknown>([['functional-surface', surface]]),
		};
	},
};
