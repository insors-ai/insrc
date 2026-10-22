/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery facts of every legacy head, computed from the stamps themselves: the BEFORE snapshot of the conversion.
 * The delivery reader reads the lifecycle once the reader group is done, so the old reader's rules live here, once,
 * and go with the conversion. Pure: no file is read or written, and nothing throws on a malformed head.
 *
 * The rules are those of the old reader (`approvalOf` in delivery/load.ts, the gate pass in delivery/gate.ts):
 * approval is `meta.approvedAt` or `status: approved` (rejection likewise), a flat AMD record is read at its top
 * level, a design artifact's review is `meta.review` with malformed findings dropped, resolutions applied and
 * `reviewOverride` honoured, and a review blocks while its effective verdict is `block`, the gate it guards is
 * unapproved and no override is recorded. A code review guards its story's BUILD.
 */

import { effectiveReviewVerdict } from '../review/resolve.js';
import type { Finding, ReviewReport } from '../review/types.js';
import type { ReviewResolution } from '../types.js';
import type { RawHead, UnitView } from './types.js';

const KINDS: ReadonlySet<string> = new Set(['SPEC', 'DEF', 'HLD', 'LLD', 'PLAN', 'BUILD', 'CR', 'ISSUE', 'EXT', 'AMD']);
const VERDICTS: ReadonlySet<string> = new Set(['pass', 'warn', 'block']);

type Fields = Readonly<Record<string, unknown>>;
type ReviewView = NonNullable<UnitView['review']>;

const asObject = (v: unknown): Fields | null => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Fields : null;
const asString = (v: unknown): string | null => typeof v === 'string' ? v : null;

function approvalOf(fields: Fields): UnitView['approval'] {
	const status = asString(fields['status']);
	if (asString(fields['approvedAt']) !== null || status === 'approved') return 'approved';
	if (asString(fields['rejectedAt']) !== null || status === 'rejected') return 'rejected';
	return 'pending';
}

function countsOf(value: unknown): ReviewView['counts'] {
	const o = asObject(value);
	const n = (key: string): number => { const v = o?.[key]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };
	return { high: n('high'), med: n('med'), low: n('low') };
}

function hasOverride(meta: Fields): boolean {
	return typeof asObject(meta['reviewOverride'])?.['reason'] === 'string';
}

function wellFormedFindings(value: unknown): Finding[] | null {
	if (!Array.isArray(value)) return null;
	return value.filter((f): f is Finding => {
		const o = asObject(f);
		return o !== null && typeof o['claimId'] === 'string' && typeof o['severity'] === 'string';
	});
}

/** A design artifact's review from meta.review, with the effective verdict after the resolutions; blocking is the caller's. */
function designReview(meta: Fields): Omit<ReviewView, 'blocking'> | null {
	const review = asObject(meta['review']);
	const verdict = review === null ? null : asString(review['verdict']);
	if (review === null || verdict === null || !VERDICTS.has(verdict)) return null;
	const recorded = verdict as ReviewView['verdict'];
	const findings = wellFormedFindings(review['findings']);
	let effective = recorded;
	if (findings !== null) {
		const resolutions = asObject(meta['reviewResolutions']) as Readonly<Record<string, ReviewResolution>> | null;
		const outcome = effectiveReviewVerdict({ ...review, findings } as unknown as ReviewReport, resolutions ?? undefined);
		if (outcome === 'block') effective = 'block';
		else if (recorded === 'block') effective = 'pass';
	}
	return { verdict: recorded, effectiveVerdict: effective, counts: countsOf(review['counts']) };
}

/** The delivery facts of each head, sorted by artifact id. A file of a kind the delivery reader does not read is left out. */
export function legacyDeliveryView(heads: readonly RawHead[]): readonly UnitView[] {
	const rows = heads.flatMap(h => {
		const kind = h.artifactId.split('-')[0] ?? '';
		const top = asObject(h.json);
		if (!KINDS.has(kind) || top === null) return [];
		const isAmendment = kind === 'AMD';
		const meta = isAmendment ? top : asObject(top['meta']);
		return meta === null ? [] : [{ h, kind, top, meta, body: isAmendment ? top['amendment'] : top['body'] }];
	});

	const buildsOfStory = (epic: unknown, story: unknown): typeof rows =>
		rows.filter(r => r.kind === 'BUILD' && r.meta['epicHash'] === epic && r.meta['storyId'] === story);

	const views = rows.map((r): UnitView => {
		const approval = approvalOf(r.meta);
		const revision = typeof r.meta['revision'] === 'number' ? r.meta['revision'] : null;
		const feedback = asObject(r.body)?.['feedback'];
		const openFeedback = Array.isArray(feedback) ? feedback.length : 0;
		let review: UnitView['review'] = null;
		if (r.kind === 'CR') {
			const body = asObject(r.body);
			const verdict = asString(body?.['verdict']);
			if (verdict !== null && VERDICTS.has(verdict)) {
				const builds = buildsOfStory(r.meta['epicHash'], r.meta['storyId']);
				const guardApproved = builds.some(b => approvalOf(b.meta) === 'approved');
				// the override may sit on the code review itself or on one of its story's builds
				const overridden = hasOverride(r.meta) || builds.some(b => hasOverride(b.meta));
				const v = verdict as ReviewView['verdict'];
				review = { verdict: v, effectiveVerdict: v, counts: countsOf(body?.['counts']), blocking: v === 'block' && !guardApproved && !overridden };
			}
		} else if (r.kind !== 'BUILD' && r.kind !== 'AMD') {
			const d = designReview(r.meta);
			if (d !== null) review = { ...d, blocking: d.effectiveVerdict === 'block' && approval !== 'approved' && !hasOverride(r.meta) };
		}
		return { artifactId: r.h.artifactId, kind: r.kind, approval, revision, review, openFeedback };
	});
	return views.sort((a, b) => a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0);
}
