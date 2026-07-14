/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: docs.family.summarise
 *
 * Deterministic per-family rollup. Reads every DocSummary in the
 * repo, filters to the requested family, and aggregates:
 *   - shared subjects (tally + cap)
 *   - notable decisions (verbatim, cited)
 *   - notable constraints (verbatim, cited)
 *   - status flags (drafts / superseded)
 *
 * No LLM: the summariser already ran per-doc; this task just
 * de-duplicates + summarises across docs in a family. Faithful to
 * the source: no paraphrasing.
 */

import { getLogger } from '../../../shared/logger.js';
import { getDb } from '../../../db/client.js';
import { listDocSummariesForRepo, listDocSummaryEntityIdsForRepo } from '../../../db/doc-summaries.js';
import { getEntity } from '../../../db/entities.js';
import type { DocSummary, DocFamily } from '../../../shared/analyze-types.js';

import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';

const TEMPLATE_ID = 'docs.family.summarise';
const log = getLogger('analyze:runtimes:docs:family-summarise');

const KNOWN_FAMILIES: readonly DocFamily[] = [
	'design', 'plans', 'docs', 'adr', 'rfc', 'spec',
	'changelog', 'readme', 'other',
];

interface FamilySummaryEntry {
	readonly entityId: string;
	readonly file:     string;
	readonly title:    string;
	readonly summary:  string;
	readonly status:   string;
}

interface CitedDecisionOut {
	readonly decision:       string;
	readonly sourceEntityId: string;
	readonly file:           string;
	readonly title:          string;
}

interface CitedConstraintOut {
	readonly constraint:     string;
	readonly sourceEntityId: string;
	readonly file:           string;
	readonly title:          string;
}

interface FamilySubjectRollup {
	readonly subject:  string;
	readonly docCount: number;
}

interface FamilySummaryOutput {
	readonly family:            DocFamily;
	readonly docCount:          number;
	readonly documents:         readonly FamilySummaryEntry[];
	readonly topSubjects:       readonly FamilySubjectRollup[];
	readonly decisions:         readonly CitedDecisionOut[];
	readonly constraints:       readonly CitedConstraintOut[];
	readonly draftCount:        number;
	readonly supersededCount:   number;
	readonly placeholderCount:  number;
}

export const docsFamilySummariseRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const params = args.task.params as Record<string, unknown>;
		const family = params['family'];
		if (typeof family !== 'string' || !KNOWN_FAMILIES.includes(family as DocFamily)) {
			throw new Error(
				`${TEMPLATE_ID}: params.family missing or invalid; ` +
				`expected one of ${KNOWN_FAMILIES.join(', ')}; got ${JSON.stringify(family)}`,
			);
		}
		const familyKey = family as DocFamily;

		// Resolve the repo path from the intent's scopeRef. Docs
		// retrieval is V1 repo-scoped -- we always take the intent's
		// containing repo.
		const scopeRef = args.intent.scopeRef;
		const repoPath = scopeRef.value;

		const db = await getDb();
		const summaries        = await listDocSummariesForRepo(db, repoPath);
		const summaryEntityIds = await listDocSummaryEntityIdsForRepo(db, repoPath);
		const zipLen = Math.min(summaries.length, summaryEntityIds.length);

		const documents: FamilySummaryEntry[] = [];
		const decisions: CitedDecisionOut[] = [];
		const constraints: CitedConstraintOut[] = [];
		const subjectCounts = new Map<string, number>();
		let draftCount       = 0;
		let supersededCount  = 0;
		let placeholderCount = 0;

		for (let i = 0; i < zipLen; i++) {
			const s: DocSummary = summaries[i]!;
			const entityId = summaryEntityIds[i]!;
			if (s.family !== familyKey) continue;

			if (s.errorCode !== undefined) {
				placeholderCount += 1;
				continue;
			}

			// Hydrate the entity for the file path -- we don't store
			// file on the summary row itself. Cheap point lookup.
			const entity = await getEntity(db, entityId);
			const file = entity?.file ?? '';

			documents.push({
				entityId,
				file,
				title:   s.title,
				summary: s.summary,
				status:  s.status,
			});

			for (const d of s.keyDecisions) {
				decisions.push({
					decision:       d,
					sourceEntityId: entityId,
					file,
					title:          s.title,
				});
			}
			for (const c of s.keyConstraints) {
				constraints.push({
					constraint:     c,
					sourceEntityId: entityId,
					file,
					title:          s.title,
				});
			}
			for (const subj of s.subjects) {
				const key = subj.toLowerCase();
				subjectCounts.set(key, (subjectCounts.get(key) ?? 0) + 1);
			}
			if (s.status === 'draft')      draftCount      += 1;
			if (s.status === 'superseded') supersededCount += 1;
		}

		const topSubjects: FamilySubjectRollup[] = Array.from(subjectCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20)
			.map(([subject, docCount]) => ({ subject, docCount }));

		const output: FamilySummaryOutput = {
			family:           familyKey,
			docCount:         documents.length,
			documents,
			topSubjects,
			decisions,
			constraints,
			draftCount,
			supersededCount,
			placeholderCount,
		};

		log.info(
			{
				runId:           args.runId,
				taskId:          args.task.taskId,
				family:          familyKey,
				docCount:        documents.length,
				decisions:       decisions.length,
				constraints:     constraints.length,
			},
			'docs.family.summarise: rolled up family',
		);

		return {
			outputs: new Map<string, unknown>([['family-summary', output]]),
		};
	},
};
