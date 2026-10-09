/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: code.structure.module-tree
 *
 * Walks the module-dependency graph rooted at the scope target and
 * emits a node+edges representation. The aggregator can render the
 * tree (with depth caps, cycle annotations, etc.) from this flat
 * graph view.
 *
 * Strategy (this revision):
 *   1. Take the modules of the scope's area from the one definition,
 *      shared/source-modules.ts: a stored module entity in the area,
 *      or a directory that directly holds source files the index
 *      stores and lies under no stored module entity's directory.
 *   2. Every file of the area belongs to the module with the longest
 *      directory that contains it: its own directory, or the stored
 *      module entity it lies under, at any depth.
 *   3. For each file, follow IMPORTS edges to collect target
 *      entities. Map each target back to its module in the same way
 *      -> module-to-module edge.
 *   4. Drop self-loops + dedupe parallel edges.
 *
 * Output:
 *   { module-tree: {
 *       repo: string,
 *       modules: Array<{ id, name, path, language }>,
 *       edges:   Array<{ from: id, to: id, viaImports: number }>
 *     } }
 *   A node's `id` is the entity id of a stored module entity, and the
 *   module's directory otherwise; `from` and `to` hold the same values.
 *
 * `maxDepth` param is accepted (for forward-compat with the
 * template's inputSchema) but ignored in this revision -- the
 * runtime emits the FULL module graph and the aggregator handles
 * depth truncation. Truncating at runtime risks losing edges the
 * aggregator might cite; the graph itself is small (~10s of modules
 * per repo typically).
 *
 * Deterministic. No LLM involvement.
 */

import { getLogger } from '../../../shared/logger.js';
import { getDb } from '../../../db/client.js';
import { listEntitiesForRepo } from '../../../db/entities.js';
import { findImports } from '../../../db/search.js';

import type { Entity } from '../../../shared/types.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import { readScopeRef } from './_shared.js';
import { MODULE_RULE, sourceModulesOf } from '../shared/source-modules.js';
import { graphRepoOf, inAreaOf, resolveTaskScope } from '../shared/task-scope.js';
import type { AnalyzeScopeRef } from '../../../shared/analyze-types.js';
import type { SkippedItem } from '../../completeness.js';
import { graphCompleteness } from '../../explore/completeness-facts.js';

const TEMPLATE_ID = 'code.structure.module-tree';

/** What the tree rests on, for its completeness record. */
export const MODULE_TREE_RULE =
	`${MODULE_RULE} A file whose module is not in the area is not part of the tree, and neither are its imports. ` +
	'An import whose target lies outside the area is not an edge.';
const log = getLogger('analyze:runtimes:code:structure-module-tree');

interface ModuleNode {
	readonly id:       string;
	readonly name:     string;
	readonly path:     string;
	readonly language: string;
}

interface ModuleEdge {
	readonly from:       string;
	readonly to:         string;
	readonly viaImports: number;
}

export const codeStructureModuleTreeRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		// The one scope function: the kinds a code task accepts, the repo whose
		// graph it reads, and the area of that repo it keeps to.
		const scope    = await resolveTaskScope(scopeRef as AnalyzeScopeRef, 'code', TEMPLATE_ID);
		const repoPath = graphRepoOf(scope);

		const db       = await getDb();
		// The one read of the repo's entities, kept whole: the modules of the tree
		// come from the area's entities, and the repo's stored module entities
		// decide whether a directory of the area is a module of its own.
		const repoEntities = await listEntitiesForRepo(db, repoPath);
		const entities     = repoEntities.filter(inAreaOf(scope));
		const storedModulesOfRepo = repoEntities.filter(e => e.kind === 'module');

		// (1) The modules of the area -> nodes, in the definition's order. A stored
		//     module entity keeps the id, name and path it always had; a directory
		//     is known by its path.
		const modules = sourceModulesOf(scope, entities, storedModulesOfRepo).map(m => ({
			id:        m.entity !== undefined ? m.entity.id : m.directory,
			name:      m.entity !== undefined ? m.entity.name : m.name,
			path:      m.entity !== undefined ? m.entity.file : m.directory,
			language:  m.language,
			directory: m.directory,
		}));
		const moduleNodes: ModuleNode[] = modules.map(({ id, name, path, language }) => ({ id, name, path, language }));

		// Module prefix index: every module's directory "owns" every file under
		// it. Sort prefixes longest-first so that a file belongs to the module
		// with the longest directory that contains it: its own directory, or the
		// innermost stored module entity it lies under.
		const prefixToModuleId: Array<{ prefix: string; moduleId: string }> = modules
			.map(m => ({ prefix: `${m.directory}/`, moduleId: m.id }))
			.sort((a, b) => b.prefix.length - a.prefix.length);

		const moduleForFile = (filePath: string): string | null => {
			for (const { prefix, moduleId } of prefixToModuleId) {
				if (filePath.startsWith(prefix)) return moduleId;
			}
			return null;
		};

		// (2) + (3): collect file -> file imports, then collapse to
		// module -> module edges.
		const files = entities.filter(e => e.kind === 'file');
		const edgeCounts = new Map<string, ModuleEdge>();  // key: from|to
		const skipped: SkippedItem[] = [];

		for (const f of files) {
			const owningModule = moduleForFile(f.file);
			if (owningModule === null) continue;

			let imports: Entity[] = [];
			try {
				imports = await findImports(db, f.id);
			} catch (err) {
				// Expected for a single file: its imports are missing from the tree,
				// and the record names it so the missing edges are not read as none.
				log.warn({ fileId: f.id, err: (err as Error).message }, 'findImports failed -- skipping');
				skipped.push({ what: f.file, reason: `its imports could not be read from the graph (${(err as Error).message})` });
				continue;
			}

			for (const tgt of imports) {
				const tgtModule = moduleForFile(tgt.file);
				if (tgtModule === null)            continue;
				if (tgtModule === owningModule)    continue;  // self-loop

				const key = `${owningModule}|${tgtModule}`;
				const prior = edgeCounts.get(key);
				edgeCounts.set(key, {
					from:       owningModule,
					to:         tgtModule,
					viaImports: prior !== undefined ? prior.viaImports + 1 : 1,
				});
			}
		}

		const edges: ModuleEdge[] = Array.from(edgeCounts.values())
			.sort((a, b) => {
				if (a.from !== b.from) return a.from < b.from ? -1 : 1;
				return a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
			});

		const tree = { repo: repoPath, modules: moduleNodes, edges };

		log.info(
			{
				runId:        args.runId,
				taskId:       args.task.taskId,
				repoPath,
				moduleCount:  moduleNodes.length,
				edgeCount:    edges.length,
			},
			'code.structure.module-tree: emitted module graph',
		);

		return {
			outputs: new Map<string, unknown>([['module-tree', tree]]),
			completeness: graphCompleteness({
				returned: moduleNodes.length,
				skipped,
				rule:     MODULE_TREE_RULE,
			}),
		};
	},
};
