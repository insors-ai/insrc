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
import { buildCompleteness } from '../../completeness.js';
import type { PartlyReadItem, SkippedItem } from '../../completeness.js';
import { DOC_INDEX_RULE } from '../../explore/completeness-facts.js';
import { createItemMeasurer, summarisedFrom } from '../../explore/item-measure.js';
import { SUMMARISER_BODY_CHARS } from '../../summariser/driver.js';
import { countedSkip } from './family-summarise.js';

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
		// For the completeness record: summaries that rest on part of their
		// document, and entries whose summary fields are missing.
		const measurer = createItemMeasurer(db);
		const partlyRead: PartlyReadItem[] = [];
		const failedSummaries: string[] = [];
		const noSummary: string[] = [];
		for (const e of entities) {
			const family = inferDocFamily(e.file);
			familyCounts[family] += 1;
			const s = summaryById.get(e.id);
			// A summary row exists = summariser ran; errorCode present =
			// LLM failed for this doc (placeholder written); errorCode
			// absent = ready.
			let hasSummary = false;
			const label = e.kind === 'section' ? `${e.file} § ${e.name}` : e.file;
			if (s !== undefined) {
				if (s.errorCode === undefined) {
					summariesReady += 1;
					hasSummary = true;
					// The entry's title, status and counts come from the summary, and
					// the summariser reads the first part of a long document.
					const cut = await summarisedFrom(measurer, e, SUMMARISER_BODY_CHARS);
					if (cut !== undefined) partlyRead.push({ ...cut, what: label });
				} else {
					summariesPending += 1;
					failedSummaries.push(label);
				}
			} else {
				summariesPending += 1;
				// Only documents and sections are summarised; a config entity has none by design.
				if (e.kind !== 'config') noSummary.push(label);
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
			// Every document, section and config entity of the index is listed.
			completeness: buildCompleteness({
				returned: inventory.length,
				partlyRead,
				skipped:  [
					...countedSkip(failedSummaries, 'summarising failed for them, so their entries carry no status, subjects or counts'),
					...countedSkip(noSummary, 'they have no summary yet, so their entries carry no status, subjects or counts'),
				] satisfies SkippedItem[],
				basis:     'doc-index',
				basisNote: DOC_INDEX_RULE,
			}),
		};
	},
};
