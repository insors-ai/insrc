/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live project context assembler.
 *
 * plans/docs-module.md Section 8.4. Rolls up the per-doc summaries
 * persisted by the summariser into a compact `LiveProjectContext`
 * view: family breakdown, top subjects, all recorded decisions +
 * constraints, recent activity.
 *
 * This is a CHEAP read: it iterates the doc-summary secondary
 * index for the repo, dedupes into rollup structures, returns.
 * No LLM calls, no vector search, no filesystem I/O.
 *
 * Consumers (the future docs shaper, adherence-check templates,
 * cross-cutting shaper enrichment) call this once per shaper
 * invocation to seed their bundles. In-process caching lives at
 * the CALLER's boundary (typically the shaper's cache); this
 * function itself is stateless.
 */

import type { DbClient } from '../../db/client.js';
import {
	countDocSummariesForRepo,
	listDocSummariesForRepo,
	listDocSummaryEntityIdsForRepo,
} from '../../db/doc-summaries.js';
import { listEntitiesForRepo } from '../../db/entities.js';
import type {
	DocFamily,
	DocSummary,
} from '../../shared/analyze-types.js';

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface CitedDecision {
	readonly decision:       string;
	readonly sourceEntityId: string;
	readonly family:         DocFamily;
	readonly docTitle:       string;
}

export interface CitedConstraint {
	readonly constraint:     string;
	readonly sourceEntityId: string;
	readonly family:         DocFamily;
	readonly docTitle:       string;
}

export interface SubjectRollup {
	readonly subject:  string;
	readonly docCount: number;
}

export interface DocRecentActivity {
	readonly entityId:      string;
	readonly file:          string;
	readonly title:         string;
	readonly family:        DocFamily;
	readonly summarisedAt:  string;
}

export interface LiveProjectContext {
	readonly repo:             string;
	readonly generatedAt:      string;
	readonly totalDocs:        number;
	readonly totalCodeEntities: number;
	readonly familyBreakdown:  Readonly<Record<DocFamily, number>>;
	readonly decisions:        readonly CitedDecision[];
	readonly constraints:      readonly CitedConstraint[];
	readonly topSubjects:      readonly SubjectRollup[];
	readonly recentActivity:   readonly DocRecentActivity[];
	/**
	 * Count of doc entities that have a placeholder summary
	 * (`errorCode` set). Signals a partial/broken index -- callers
	 * can surface a warning if this is >0.
	 */
	readonly placeholderCount: number;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AssembleLiveProjectContextOpts {
	/** Max decisions to include. Default 100. */
	readonly maxDecisions?: number;
	/** Max constraints to include. Default 100. */
	readonly maxConstraints?: number;
	/** Max subjects in topSubjects. Default 30. */
	readonly maxSubjects?: number;
	/** Max entries in recentActivity. Default 20. */
	readonly maxRecentActivity?: number;
}

const DEFAULTS = {
	maxDecisions:      100,
	maxConstraints:    100,
	maxSubjects:       30,
	maxRecentActivity: 20,
} as const;

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Build a `LiveProjectContext` for a single repo. Repo must be
 * registered; unregistered repos return a zero-doc context with
 * `totalDocs=0`.
 */
export async function assembleLiveProjectContext(
	db:   DbClient,
	repo: string,
	opts: AssembleLiveProjectContextOpts = {},
): Promise<LiveProjectContext> {
	const maxDecisions      = opts.maxDecisions      ?? DEFAULTS.maxDecisions;
	const maxConstraints    = opts.maxConstraints    ?? DEFAULTS.maxConstraints;
	const maxSubjects       = opts.maxSubjects       ?? DEFAULTS.maxSubjects;
	const maxRecentActivity = opts.maxRecentActivity ?? DEFAULTS.maxRecentActivity;

	const summaries = await listDocSummariesForRepo(db, repo);
	const entityIds = await listDocSummaryEntityIdsForRepo(db, repo);
	const totalDocs = summaries.length;

	// If we have summaries but the entity-id list is shorter (an entity
	// was deleted between the two calls), zip up to the shorter length.
	// This is a snapshot inconsistency, not a bug -- the next assemble
	// call will see the reconciled state.
	const pairs: Array<{ summary: DocSummary; entityId: string }> = [];
	const zipLen = Math.min(summaries.length, entityIds.length);
	for (let i = 0; i < zipLen; i++) {
		pairs.push({ summary: summaries[i]!, entityId: entityIds[i]! });
	}

	// Family breakdown -- initialise every family to 0 so callers can
	// iterate without missing-key checks.
	const familyBreakdown: Record<DocFamily, number> = {
		design: 0, plans: 0, docs: 0, adr: 0, rfc: 0, spec: 0,
		changelog: 0, readme: 0, other: 0,
	};
	for (const { summary } of pairs) {
		familyBreakdown[summary.family] += 1;
	}

	// Total code entities -- for the summary's "how much of the repo is
	// code vs docs" comparison. Cheap point count over the entity table
	// filtered by non-artefact.
	const allEntities = await listEntitiesForRepo(db, repo);
	const totalCodeEntities = allEntities.filter(e => e.artifact !== true).length;

	// Placeholder count -- summaries where the LLM call failed and
	// left an errorCode.
	const placeholderCount = pairs.filter(p => p.summary.errorCode !== undefined).length;

	// Decisions: gather all keyDecisions, cite source. Skip placeholder
	// rows (their empty arrays contribute nothing). Cap at maxDecisions.
	const decisions: CitedDecision[] = [];
	for (const { summary, entityId } of pairs) {
		if (summary.errorCode !== undefined) continue;
		for (const d of summary.keyDecisions) {
			if (decisions.length >= maxDecisions) break;
			decisions.push({
				decision:       d,
				sourceEntityId: entityId,
				family:         summary.family,
				docTitle:       summary.title,
			});
		}
		if (decisions.length >= maxDecisions) break;
	}

	// Constraints: same shape.
	const constraints: CitedConstraint[] = [];
	for (const { summary, entityId } of pairs) {
		if (summary.errorCode !== undefined) continue;
		for (const c of summary.keyConstraints) {
			if (constraints.length >= maxConstraints) break;
			constraints.push({
				constraint:     c,
				sourceEntityId: entityId,
				family:         summary.family,
				docTitle:       summary.title,
			});
		}
		if (constraints.length >= maxConstraints) break;
	}

	// Top subjects: tally, sort by count desc.
	const subjectCounts = new Map<string, number>();
	for (const { summary } of pairs) {
		if (summary.errorCode !== undefined) continue;
		for (const s of summary.subjects) {
			const key = s.toLowerCase();
			subjectCounts.set(key, (subjectCounts.get(key) ?? 0) + 1);
		}
	}
	const topSubjects: SubjectRollup[] = Array.from(subjectCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, maxSubjects)
		.map(([subject, docCount]) => ({ subject, docCount }));

	// Recent activity: sort by summarisedAt desc.
	const recentActivity: DocRecentActivity[] = pairs
		.filter(p => p.summary.errorCode === undefined)
		.map(({ summary, entityId }) => {
			// entity.file lookup would be an extra LMDB read per entity;
			// the summary title carries enough for the UI to render.
			// If the file path is critical, callers can hydrate via
			// getEntity(entityId).
			return {
				entityId,
				file:         '',      // populated below via a single sweep
				title:        summary.title,
				family:       summary.family,
				summarisedAt: summary.summarisedAt,
			};
		})
		.sort((a, b) => b.summarisedAt.localeCompare(a.summarisedAt))
		.slice(0, maxRecentActivity);

	// Populate file paths for the recent-activity entries. One LMDB
	// sweep to build entityId -> file map, then join. Bounded by
	// maxRecentActivity so the sweep cost is trivial.
	if (recentActivity.length > 0) {
		const fileByEntity = new Map<string, string>();
		for (const e of allEntities) {
			fileByEntity.set(e.id, e.file);
		}
		for (let i = 0; i < recentActivity.length; i++) {
			const cur = recentActivity[i]!;
			(recentActivity as DocRecentActivity[])[i] = {
				...cur,
				file: fileByEntity.get(cur.entityId) ?? '',
			};
		}
	}

	// Double-check totalDocs against the secondary-index count -- if
	// they disagree, prefer the index count (it's the authoritative
	// per-repo tally).
	const indexCount = await countDocSummariesForRepo(db, repo);

	return {
		repo,
		generatedAt: new Date().toISOString(),
		totalDocs:   Math.max(totalDocs, indexCount),
		totalCodeEntities,
		familyBreakdown,
		decisions,
		constraints,
		topSubjects,
		recentActivity,
		placeholderCount,
	};
}
