/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: docs.discovery.inventory
 *
 * Deterministic doc-corpus inventory. Enumerates every doc,
 * section, and config entity in the scope repo, groups by
 * path-inferred family, and cross-references each entry against
 * its DocSummary (if the summariser has run yet).
 *
 * Output:
 *   { inventory: Array<{
 *       entityId, file, family, kind, title, status?, hasSummary,
 *       subjects?, keyDecisionsCount?, keyConstraintsCount?,
 *     }>,
 *     familyCounts: Record<DocFamily, number>,
 *     summariesReady: number,
 *     summariesPending: number,
 *   }
 *
 * No LLM. Same graph + summary state -> same output.
 */

import { getLogger } from '../../../shared/logger.js';
import { getDb } from '../../../db/client.js';
import { listDocSummariesForRepo, listDocSummaryEntityIdsForRepo } from '../../../db/doc-summaries.js';
import { listEntitiesByKinds } from '../../../db/entities.js';
import type { DocFamily, DocSummary } from '../../../shared/analyze-types.js';

import { inferDocFamily } from '../../summariser/family.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import { readScopeRef, resolveRepoPath } from '../code/_shared.js';

const TEMPLATE_ID = 'docs.discovery.inventory';
const log = getLogger('analyze:runtimes:docs:discovery-inventory');

interface InventoryEntry {
	readonly entityId:  string;
	readonly file:      string;
	readonly family:    DocFamily;
	readonly kind:      string;
	readonly title:     string;
	readonly hasSummary: boolean;
	readonly status?:              string;
	readonly subjects?:            readonly string[];
	readonly keyDecisionsCount?:   number;
	readonly keyConstraintsCount?: number;
}

interface InventoryOutput {
	readonly inventory:        readonly InventoryEntry[];
	readonly familyCounts:     Readonly<Record<DocFamily, number>>;
	readonly summariesReady:   number;
	readonly summariesPending: number;
}

export const docsDiscoveryInventoryRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		const repoPath = resolveRepoPath(scopeRef, TEMPLATE_ID);

		const db = await getDb();

		// (1) Every doc + section + config entity in the repo. One LMDB
		//     scan filtered by kind.
		const entities = await listEntitiesByKinds(
			db,
			['document', 'section', 'config'],
			{ repo: repoPath },
		);

		// (2) Every DocSummary the summariser has produced so far.
		//     Keyed by entityId for O(1) lookup during zip below.
		const summaries       = await listDocSummariesForRepo(db, repoPath);
		const summaryEntityIds = await listDocSummaryEntityIdsForRepo(db, repoPath);
		const summaryById = new Map<string, DocSummary>();
		const zipLen = Math.min(summaries.length, summaryEntityIds.length);
		for (let i = 0; i < zipLen; i++) {
			summaryById.set(summaryEntityIds[i]!, summaries[i]!);
		}

		// (3) Build inventory rows. Sort by (family, file) for stable
		//     iteration across runs.
		const familyCounts: Record<DocFamily, number> = {
			design: 0, plans: 0, docs: 0, adr: 0, rfc: 0, spec: 0,
			changelog: 0, readme: 0, other: 0,
		};
		let summariesReady = 0;
		let summariesPending = 0;
		const inventory: InventoryEntry[] = [];
		for (const e of entities) {
			const family = inferDocFamily(e.file);
			familyCounts[family] += 1;
			const s = summaryById.get(e.id);
			// A summary row exists = summariser ran; errorCode present =
			// LLM failed for this doc (placeholder written); errorCode
			// absent = ready.
			let hasSummary = false;
			if (s !== undefined) {
				if (s.errorCode === undefined) {
					summariesReady += 1;
					hasSummary = true;
				} else {
					summariesPending += 1;
				}
			} else {
				summariesPending += 1;
			}
			inventory.push({
				entityId: e.id,
				file:     e.file,
				family,
				kind:     e.kind,
				title:    s?.title ?? e.name,
				hasSummary,
				...(s !== undefined && s.errorCode === undefined ? {
					status:              s.status,
					subjects:            s.subjects,
					keyDecisionsCount:   s.keyDecisions.length,
					keyConstraintsCount: s.keyConstraints.length,
				} : {}),
			});
		}
		inventory.sort((a, b) => {
			if (a.family !== b.family) return a.family.localeCompare(b.family);
			return a.file.localeCompare(b.file);
		});

		const output: InventoryOutput = {
			inventory,
			familyCounts,
			summariesReady,
			summariesPending,
		};

		log.info(
			{
				runId:            args.runId,
				taskId:           args.task.taskId,
				repoPath,
				totalDocs:        inventory.length,
				summariesReady,
				summariesPending,
			},
			'docs.discovery.inventory: enumerated corpus',
		);

		return {
			outputs: new Map<string, unknown>([['docs-inventory', output]]),
		};
	},
};
