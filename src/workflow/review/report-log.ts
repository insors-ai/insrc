/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Where a design review's full report lives once `meta.review` is retired (s9). The lifecycle `Review` keeps only the
 * verdict, the counts and an optional `report` Reference; the report itself (findings, claims, model) and the
 * resolutions of its findings are the outcome data of the artifact's 'review' change-log entries:
 *
 *   - the review entry: `outcome.data = { kind: 'review', report, resolutions }`;
 *   - a later resolution: another 'review' entry with `outcome.data = { kind: 'review-resolution', findingId, resolution }`.
 *
 * `readReviewReport` is the one reader: the report with the resolutions applied in log order, ready for
 * `effectiveReviewVerdict`.
 */

import type { Actor, ChangeLogEntry, Reference, Review } from '../artifact-core/types.js';
import type { History } from '../artifact-core/history.js';
import type { ReviewResolution } from '../types.js';
import type { ReviewReport } from './types.js';

export interface ReviewEntryData {
	readonly kind:        'review';
	readonly report:      ReviewReport;
	readonly resolutions: Readonly<Record<string, ReviewResolution>>;
}

export interface ResolutionEntryData {
	readonly kind:       'review-resolution';
	readonly findingId:  string;
	readonly resolution: ReviewResolution;
}

/** A review as read back: the stored report and the resolutions in force. */
export interface ReviewRecord {
	readonly report:      ReviewReport;
	readonly resolutions: Readonly<Record<string, ReviewResolution>>;
}

export interface ReviewEntryInput {
	readonly id:           string;
	readonly actor:        Actor;
	readonly timestamp:    string;
	readonly report:       ReviewReport;
	readonly resolutions?: Readonly<Record<string, ReviewResolution>> | undefined;
}

export interface ResolutionEntryInput {
	readonly id:         string;
	readonly actor:      Actor;
	readonly timestamp:  string;
	readonly findingId:  string;
	readonly resolution: ReviewResolution;
}

/** The 'review' log entry that holds a review's full report (and the resolutions it already had). */
export function reviewEntryOf(input: ReviewEntryInput): ChangeLogEntry {
	const data: ReviewEntryData = { kind: 'review', report: input.report, resolutions: input.resolutions ?? {} };
	return {
		id: input.id, actor: input.actor, timestamp: input.timestamp, operation: 'review',
		outcome: { result: input.report.verdict, summary: `review: ${input.report.verdict}`, data },
	};
}

/** The 'review' log entry that records the resolution of one finding. */
export function resolutionEntryOf(input: ResolutionEntryInput): ChangeLogEntry {
	const data: ResolutionEntryData = { kind: 'review-resolution', findingId: input.findingId, resolution: input.resolution };
	return {
		id: input.id, actor: input.actor, timestamp: input.timestamp, operation: 'review',
		outcome: { result: input.resolution.status, summary: `finding ${input.findingId} ${input.resolution.status}`, data },
	};
}

/** The Reference a lifecycle Review carries to name its review entry. */
export function reviewReference(artifactId: string, entryId: string): Reference {
	return { entityId: artifactId, type: 'change-log-entry', relation: 'reviews', fragment: entryId };
}

function dataOf(e: ChangeLogEntry): { kind?: unknown } | undefined {
	const d = e.outcome?.data;
	return typeof d === 'object' && d !== null ? d as { kind?: unknown } : undefined;
}

/**
 * The report a lifecycle Review names, with the resolutions recorded since applied in log order (a later resolution of
 * the same finding wins). `undefined` when the Review has no report Reference, the Reference names another artifact, or
 * the entry is not in the log.
 */
export async function readReviewReport(history: Pick<History, 'log'>, artifactId: string, review: Pick<Review, 'report'>): Promise<ReviewRecord | undefined> {
	const ref = review.report;
	if (ref === undefined || ref.entityId !== artifactId || ref.type !== 'change-log-entry' || ref.fragment === undefined) return undefined;
	const log = await history.log(artifactId);
	const at = log.findIndex(e => e.id === ref.fragment);
	const entry = log[at];
	const data = entry === undefined ? undefined : dataOf(entry);
	if (entry === undefined || entry.operation !== 'review' || data?.kind !== 'review') return undefined;
	const first = data as unknown as ReviewEntryData;
	const resolutions: Record<string, ReviewResolution> = { ...first.resolutions };
	for (const later of log.slice(at + 1)) {
		const d = dataOf(later);
		if (later.operation !== 'review' || d?.kind !== 'review-resolution') continue;
		const r = d as unknown as ResolutionEntryData;
		resolutions[r.findingId] = r.resolution;
	}
	return { report: first.report, resolutions };
}
