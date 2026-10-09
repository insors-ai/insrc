/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: code.discovery.modules
 *
 * Enumerates the modules in the task's scope (per its scopeRef param)
 * via the LMDB graph layer's entity store. What a module is, is decided in
 * one place, shared/source-modules.ts: a stored module entity in the area,
 * or a directory that directly holds source files the index stores. No
 * parser stores a module entity for a repository's own directories, so on
 * an indexed repository the list is its source directories.
 *
 * Output:
 *   { modules: Array<{ name, path, repo, directory, fileCount, entityId? }> }
 *   `entityId` is present only for a stored module entity.
 *
 * The scope is resolved by shared/task-scope.ts: every kind the code
 * family accepts (repo, module, file, symbol, manifest-dir, workspace).
 * The modules listed are those of the area the scope names; a kind
 * outside the family's row is refused there.
 *
 * Deterministic: no LLM involvement. Same graph state -> same output.
 */

import { getLogger } from '../../../shared/logger.js';
import { getDb } from '../../../db/client.js';
import { listEntitiesForRepo } from '../../../db/entities.js';

import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import { readScopeRef } from './_shared.js';
import { MODULE_RULE, sourceModulesOf } from '../shared/source-modules.js';
import { graphRepoOf, inAreaOf, resolveTaskScope } from '../shared/task-scope.js';
import type { AnalyzeScopeRef } from '../../../shared/analyze-types.js';

const TEMPLATE_ID = 'code.discovery.modules';
const log = getLogger('analyze:runtimes:code:discovery-modules');

interface ModuleRecord {
	readonly name:      string;
	readonly path:      string;
	readonly repo:      string;
	/** The module's directory: absolute, no trailing slash. */
	readonly directory: string;
	/** Source files directly in the directory. */
	readonly fileCount: number;
	/** Present only when the module is a stored entity of kind 'module'. */
	readonly entityId?: string | undefined;
}

export const codeDiscoveryModulesRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		// The one scope function: the kinds a code task accepts, the repo whose
		// graph it reads, and the area of that repo it keeps to.
		const scope    = await resolveTaskScope(scopeRef as AnalyzeScopeRef, 'code', TEMPLATE_ID);
		const repoPath = graphRepoOf(scope);

		const db       = await getDb();
		// The one read of the repo's entities, kept whole: the modules listed come
		// from the area's entities, and the repo's stored module entities decide
		// whether a directory of the area is a module of its own.
		const repoEntities = await listEntitiesForRepo(db, repoPath);
		const entities     = repoEntities.filter(inAreaOf(scope));
		const storedModulesOfRepo = repoEntities.filter(e => e.kind === 'module');

		// Sorted by directory, by the one definition. A stored module entity keeps
		// the fields it always had; a directory has no entity and so no entityId.
		const modules: ModuleRecord[] = sourceModulesOf(scope, entities, storedModulesOfRepo).map(m =>
			m.entity !== undefined
				? { name: m.entity.name, path: m.entity.file, repo: m.entity.repo, directory: m.directory, fileCount: m.fileCount, entityId: m.entity.id }
				: { name: m.name, path: m.directory, repo: repoPath, directory: m.directory, fileCount: m.fileCount });

		log.info(
			{
				runId:    args.runId,
				taskId:   args.task.taskId,
				repoPath,
				moduleCount: modules.length,
			},
			'code.discovery.modules: enumerated modules',
		);

		return {
			outputs: new Map<string, unknown>([['modules', modules]]),
			// Every module of the area is listed; nothing is cut by count.
			completeness: graphCompleteness({ returned: modules.length, rule: MODULE_RULE }),
		};
	},
};

// ---------------------------------------------------------------------------
// Test hooks (helpers themselves are exported from _shared.ts).
// ---------------------------------------------------------------------------

export { readScopeRef as _readScopeRefForTest } from './_shared.js';
import { graphCompleteness } from '../../explore/completeness-facts.js';
