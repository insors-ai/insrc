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
 *   1. List every module entity in the repo (kind='module').
 *   2. For each module, find every file under that module's
 *      directory prefix (via listEntitiesForRepo + file-prefix
 *      filter, same approach as code.surface.functional).
 *   3. For each in-module file, follow IMPORTS edges to collect
 *      target entities. Map each target back to its containing
 *      module (longest-prefix match) -> module-to-module edge.
 *   4. Drop self-loops + dedupe parallel edges.
 *
 * Output:
 *   { module-tree: {
 *       repo: string,
 *       modules: Array<{ id, name, path, language }>,
 *       edges:   Array<{ from: moduleId, to: moduleId, viaImports: number }>
 *     } }
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
import {
	modulePrefixOf,
	readScopeRef,
	resolveRepoPath,
} from './_shared.js';

const TEMPLATE_ID = 'code.structure.module-tree';
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
		const repoPath = resolveRepoPath(scopeRef, TEMPLATE_ID);

		const db       = await getDb();
		const entities = await listEntitiesForRepo(db, repoPath);

		// (1) Module entities -> nodes.
		const modules = entities.filter(e => e.kind === 'module');
		modules.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
		const moduleNodes: ModuleNode[] = modules.map(m => ({
			id:       m.id,
			name:     m.name,
			path:     m.file,
			language: m.language,
		}));

		// Module prefix index: every module entity contributes a directory
		// prefix that "owns" every file under it. Sort prefixes longest-
		// first so longest-prefix lookups are deterministic when modules
		// nest (e.g. monorepo `packages/api/sub`).
		const prefixToModuleId: Array<{ prefix: string; moduleId: string }> = modules
			.map(m => ({ prefix: modulePrefixOf(m.file), moduleId: m.id }))
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

		for (const f of files) {
			const owningModule = moduleForFile(f.file);
			if (owningModule === null) continue;

			let imports: Entity[] = [];
			try {
				imports = await findImports(db, f.id);
			} catch (err) {
				log.warn({ fileId: f.id, err: (err as Error).message }, 'findImports failed -- skipping');
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
		};
	},
};
