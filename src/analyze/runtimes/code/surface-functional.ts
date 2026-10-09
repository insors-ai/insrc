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
 * The `module` param names the module in one of three forms:
 *   - a directory of the repository, as an absolute path;
 *   - a directory of the repository, relative to the repo;
 *   - the entity id of a stored module entity.
 * A plan writes a directory path: the planner cannot know an entity
 * id, and no parser stores a module entity for a repository's own
 * directories. The value is read in shared/source-modules.ts.
 *
 * An entity id is read exactly as before Story s8: no scope is
 * resolved, the entity's own repo is read whole, and the surface is
 * every function / method / class under the directory of the
 * entity's file. Any other value is a directory path under the
 * run's scope: the repo of that scope is read, narrowed to the
 * scope's area, and the surface is everything under the directory,
 * at any depth.
 *
 * For `depth: 'shallow'` (default), `body` is omitted from the
 * output (signature + location only). For `depth: 'deep'`, body
 * is included.
 *
 * Output:
 *   { functional-surface: {
 *       module:          { name, path, directory, entityId? },
 *       exports:         SurfaceSymbol[],
 *       internalHelpers: SurfaceSymbol[]
 *     } }
 *
 * Deterministic. Throws on:
 *   - missing params.module
 *   - an entity id of an entity that is not a module entity
 *   - a directory path under a file or symbol scope, outside the
 *     area of the run's scope, or with no stored source file under it
 */

import { getLogger } from '../../../shared/logger.js';
import { getDb } from '../../../db/client.js';
import { getEntity, listEntitiesForRepo } from '../../../db/entities.js';

import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import type { Entity } from '../../../shared/types.js';
import { compareEntitiesByLocation, modulePrefixOf } from './_shared.js';
import { liesUnder, moduleOfDirectory, moduleOfEntityId } from '../shared/source-modules.js';
import type { NamedModule } from '../shared/source-modules.js';
import { graphRepoOf, inAreaOf, resolveTaskScope } from '../shared/task-scope.js';
import { graphCompleteness } from '../../explore/completeness-facts.js';

const TEMPLATE_ID = 'code.surface.functional';
const log = getLogger('analyze:runtimes:code:surface-functional');

const SURFACE_KINDS = new Set(['function', 'method', 'class']);

/** What the surface rests on, for its completeness record. */
export const SURFACE_RULE =
	"The surface lists the functions, methods and classes of every stored source file under the module's directory, including its sub-directories.";

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

		// Step 1: is the value the id of a stored entity? Asked before any scope
		// is resolved, so an id is read exactly as before this Story.
		const byId = await moduleOfEntityId(moduleId, id => getEntity(db, id), args.task.taskId);

		let named:    NamedModule;
		let inModule: Entity[];
		if (byId !== null) {
			// The entity's own repo, whole, and everything under the directory of its file.
			named = byId;
			const prefix   = modulePrefixOf(byId.path);
			const entities = await listEntitiesForRepo(db, byId.entity!.repo);
			inModule = entities.filter(e => SURFACE_KINDS.has(e.kind) && e.file.startsWith(prefix));
		} else {
			// Step 2: a directory path, under the run's scope. The one scope function
			// gives the repo to read and the area to keep to.
			const scope    = await resolveTaskScope(args.intent.scopeRef, 'code', TEMPLATE_ID);
			const entities = (await listEntitiesForRepo(db, graphRepoOf(scope))).filter(inAreaOf(scope));
			named = moduleOfDirectory(moduleId, scope, entities);
			const directory = named.directory;
			inModule = entities.filter(e => SURFACE_KINDS.has(e.kind) && liesUnder(directory, e.file));
		}
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
				name:      named.name,
				path:      named.path,
				directory: named.directory,
				// Only a stored module entity has an id; a directory is known by its path.
				...(named.entity !== undefined ? { entityId: named.entity.id } : {}),
			},
			exports,
			internalHelpers,
		};

		log.info(
			{
				runId:                args.runId,
				taskId:               args.task.taskId,
				moduleId,
				moduleDirectory:      named.directory,
				exportCount:          exports.length,
				internalHelperCount:  internalHelpers.length,
				depth:                deep ? 'deep' : 'shallow',
			},
			'code.surface.functional: extracted surface',
		);

		return {
			outputs: new Map<string, unknown>([['functional-surface', surface]]),
			// Every surface symbol under the module's directory is listed.
			completeness: graphCompleteness({ returned: exports.length + internalHelpers.length, rule: SURFACE_RULE }),
		};
	},
};
