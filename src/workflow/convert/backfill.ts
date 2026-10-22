/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The conversion of one legacy head into the common model: its `meta.envelope` and `meta.lifecycle`, the head without the
 * legacy fields and without `body.feedback` (the feedback lines are appended by their own rule before the head is written),
 * and the log entries that record what the head already said. Pure: no file is read or written.
 *
 * The revision number, the status and the approval are the head's own: the lifecycle is computed from the legacy stamps and
 * `meta.revision` is not touched, so an approved head stays approved at the same revision. `contentHash` is the hash of the
 * CONVERTED content (the description, the body without `feedback`, the citations).
 *
 * Entries (ids from `migratedEntryId`): `-approve`, `-reject` and `-mark-stale` (the stale acknowledgement) are revision-less
 * and carry the original stamp times; `-review` holds the full review report and its resolutions; `migrated-<artifact id>`
 * is the revision-bearing entry (`create` when the artifact has no log, `update` otherwise) stamped with the conversion's clock,
 * so it is the last revision-bearing entry and `checkIntegrity` compares the head against it.
 */

import { contentHash } from '../artifact-core/lifecycle.js';
import type { Actor, ChangeLogEntry, Lifecycle, Review, Status } from '../artifact-core/types.js';
import { reviewerPartyOf } from '../review/party.js';
import { reviewEntryOf, reviewReference } from '../review/report-log.js';
import { effectiveReviewVerdict } from '../review/resolve.js';
import type { ReviewReport } from '../review/types.js';
import type { ReviewResolution } from '../types.js';
import { migratedEntryId } from './entry-ids.js';
import type { MigratedPart } from './entry-ids.js';
import { ConversionUnreadable } from './types.js';
import type { ConvertedHead, RawHead } from './types.js';

/** The meta fields the conversion removes. `rangeBase` is build bookkeeping, not approval state, and stays. */
export const LEGACY_META_FIELDS = ['approvedAt', 'rejectedAt', 'rejectReason', 'reviewOverride', 'staleAckedAt', 'review', 'reviewResolutions'] as const;

const LEGACY_ACTOR: Actor = { id: 'legacy:unknown', kind: 'person', properties: {} };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined => typeof v === 'string' && v.length > 0 ? v : undefined;
const time = (iso: string | undefined): number => iso === undefined ? Number.NaN : Date.parse(iso);

export interface BackfillInput {
	readonly head:   RawHead;
	/** Whether the artifact already has log entries (a head written after s4). */
	readonly hasLog: boolean;
	/** The conversion's clock, ISO. */
	readonly now:    string;
	/** The migration actor (`insrc:migration`). */
	readonly actor:  Actor;
}

export interface BackfillResult {
	readonly converted:        ConvertedHead;
	/** The legacy fields found on the head (including `body.feedback`); empty when it was already converted. */
	readonly legacyFields:     readonly string[];
	/** The head has a review that is older than its revision, so the lifecycle does not carry it. */
	readonly unboundReview:    boolean;
	/** Findings of the stored review that are not well formed (kept in the review entry as stored). */
	readonly malformedFindings: number;
}

function entry(artifactId: string, part: MigratedPart, e: Omit<ChangeLogEntry, 'id'>): ChangeLogEntry {
	return { id: migratedEntryId(artifactId, part), ...e };
}

export function backfillHead(input: BackfillInput): BackfillResult {
	const { head, now, actor } = input;
	const id = head.artifactId;
	const json = head.json;
	if (!isObj(json) || !isObj(json['meta']) || !isObj(json['body'])) throw new ConversionUnreadable(`${id} has no meta and body objects`, id);
	const oldMeta = json['meta'];
	const legacyFields: string[] = LEGACY_META_FIELDS.filter(f => oldMeta[f] !== undefined);

	// the converted head: the legacy meta fields and body.feedback are gone, the envelope exists
	const meta: Obj = {};
	for (const [k, v] of Object.entries(oldMeta)) if (!(LEGACY_META_FIELDS as readonly string[]).includes(k)) meta[k] = v;
	const body: Obj = { ...json['body'] };
	if (body['feedback'] !== undefined) { legacyFields.push('body.feedback'); delete body['feedback']; }
	const oldEnvelope = isObj(oldMeta['envelope']) ? oldMeta['envelope'] : {};
	const envelope: Obj = { references: [], attachments: [], ...oldEnvelope, description: typeof oldEnvelope['description'] === 'string' ? oldEnvelope['description'] : '' };
	meta['envelope'] = envelope;
	const citations = Array.isArray(json['citations']) ? json['citations'] : [];
	const hash = contentHash(envelope['description'] as string, { body, citations });

	// the stamps
	const revisionNumber = typeof oldMeta['revision'] === 'number' && Number.isInteger(oldMeta['revision']) && oldMeta['revision'] >= 0 ? oldMeta['revision'] : 0;
	const createdAt = text(oldMeta['createdAt']);
	const approvedAt = text(oldMeta['approvedAt']);
	const rejectedAt = text(oldMeta['rejectedAt']);
	const statusField = text(oldMeta['status']);
	const approvedByStatus = approvedAt === undefined && statusField === 'approved';
	const rejectedByStatus = rejectedAt === undefined && statusField === 'rejected';
	const approved = approvedAt !== undefined || approvedByStatus;
	const rejected = rejectedAt !== undefined || rejectedByStatus;
	const stampedAt = (t: string | undefined): string => t ?? createdAt ?? now;
	// the later stamp decides; with a tie the approval wins, as the old delivery reader read it
	const approvedLater = approved && (!rejected || !(time(stampedAt(rejectedAt)) > time(stampedAt(approvedAt))));

	const existing = isObj(oldMeta['lifecycle']) ? oldMeta['lifecycle'] as unknown as Lifecycle : undefined;
	const status: Status = approved || rejected ? (approvedLater ? 'approved' : 'rejected') : existing?.status ?? 'draft';
	const revision = existing?.revision !== undefined
		? { ...existing.revision, contentHash: hash }
		: { number: revisionNumber, contentHash: hash, at: createdAt ?? now, by: LEGACY_ACTOR };
	const override = isObj(oldMeta['reviewOverride']) ? text(oldMeta['reviewOverride']['reason']) : undefined;
	const approval = existing?.status === status && existing.approval !== undefined ? existing.approval
		: status === 'approved' ? { revision: revision.number, by: LEGACY_ACTOR, at: stampedAt(approvedAt), ...(override !== undefined ? { override: { reason: override } } : {}) }
		: undefined;

	// the review
	const storedReview = isObj(oldMeta['review']) ? oldMeta['review'] as unknown as ReviewReport : undefined;
	const resolutions = isObj(oldMeta['reviewResolutions']) ? oldMeta['reviewResolutions'] as Readonly<Record<string, ReviewResolution>> : {};
	const validVerdict = storedReview !== undefined && ['pass', 'warn', 'block'].includes(String(storedReview.verdict));
	const findings = storedReview !== undefined && Array.isArray(storedReview.findings) ? storedReview.findings : [];
	const wellFormed = findings.filter(f => isObj(f) && typeof f['claimId'] === 'string' && typeof f['severity'] === 'string');
	const reviewedAt = storedReview !== undefined ? text(storedReview.reviewedAt) : undefined;
	// a review made before the head's revision was written did not review it (the rule the approval gate applied)
	const unboundReview = validVerdict && time(reviewedAt) < time(createdAt);
	const entries: ChangeLogEntry[] = [];
	let review: Review | undefined = existing?.review;
	if (validVerdict && storedReview !== undefined) {
		const party = reviewerPartyOf(storedReview) === 'daemon' ? 'daemon' : 'controller';
		const reviewer: Actor = { id: `insrc:${party}`, kind: 'agent', properties: {} };
		const reviewEntry = reviewEntryOf({ id: migratedEntryId(id, 'review'), actor: reviewer, timestamp: reviewedAt ?? createdAt ?? now, report: { ...storedReview, findings: findings as ReviewReport['findings'] }, resolutions });
		entries.push(reviewEntry);
		if (!unboundReview) {
			review = {
				revision: revision.number, reviewer, party,
				verdict: effectiveReviewVerdict({ ...storedReview, findings: wellFormed as unknown as ReviewReport['findings'] }, resolutions),
				counts: { high: storedReview.counts?.high ?? 0, med: storedReview.counts?.med ?? 0, low: storedReview.counts?.low ?? 0 },
				at: reviewedAt ?? now, report: reviewReference(id, reviewEntry.id),
			};
		}
	}

	// the stamp entries, in the order they happened
	const migratedFrom = (fields: string[]) => ({ kind: 'migrated', from: fields });
	if (approved) {
		entries.push(entry(id, 'approve', {
			actor: LEGACY_ACTOR, timestamp: stampedAt(approvedAt), operation: 'approve', status: { from: 'draft', to: 'approved' },
			outcome: { result: 'approved', summary: 'approved (recorded by the conversion)', data: migratedFrom([approvedAt !== undefined ? 'approvedAt' : 'status', ...(override !== undefined ? ['reviewOverride'] : [])]) },
		}));
	}
	if (rejected) {
		entries.push(entry(id, 'reject', {
			actor: LEGACY_ACTOR, timestamp: stampedAt(rejectedAt), operation: 'reject', status: { from: approved && approvedLater === false ? 'approved' : 'draft', to: 'rejected' },
			outcome: { result: 'rejected', summary: text(oldMeta['rejectReason']) ?? 'rejected (recorded by the conversion)', data: migratedFrom([rejectedAt !== undefined ? 'rejectedAt' : 'status', ...(text(oldMeta['rejectReason']) !== undefined ? ['rejectReason'] : [])]) },
		}));
	}
	const staleAckedAt = text(oldMeta['staleAckedAt']);
	if (staleAckedAt !== undefined) {
		entries.push(entry(id, 'mark-stale', {
			actor: LEGACY_ACTOR, timestamp: staleAckedAt, operation: 'ack-stale',
			outcome: { result: 'acknowledged', summary: 'stale acknowledged (recorded by the conversion)', data: migratedFrom(['staleAckedAt']) },
		}));
	}
	entries.sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0);
	entries.push({
		id: migratedEntryId(id), actor: input.actor, timestamp: now, operation: input.hasLog ? 'update' : 'create',
		revision: { number: revision.number, contentHash: hash },
		outcome: { result: 'migrated', summary: 'converted to the common artifact model', data: migratedFrom(legacyFields) },
	});

	const lifecycle: Lifecycle = {
		status, revision,
		...(approval !== undefined ? { approval } : {}),
		...(review !== undefined ? { review } : {}),
		signoffs: existing?.signoffs ?? [],
		...(existing?.stale !== undefined ? { stale: existing.stale } : {}),
	};
	meta['lifecycle'] = lifecycle;

	const out: Obj = { ...json, meta, body };
	if (json['citations'] !== undefined) out['citations'] = citations;
	return {
		converted: { artifactId: id, bytes: JSON.stringify(out, null, 2) + '\n', entries },
		legacyFields, unboundReview,
		malformedFindings: findings.length - wellFormed.length,
	};
}
