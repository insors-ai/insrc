import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Actor, ChangeLogEntry, Review } from '../../artifact-core/types.js';
import { readReviewReport, resolutionEntryOf, reviewEntryOf, reviewReference } from '../report-log.js';
import { effectiveReviewVerdict } from '../resolve.js';
import type { Finding, ReviewReport } from '../types.js';

const ART = 'LLD-aaaaaaaaaaaaaaaa-s1';
const actor: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const finding = (claimId: string, severity: Finding['severity']): Finding => ({
	claimId, kind: 'closed-union', severity, premise: 'p', evidence: 'e', action: 'a', fixability: 'manual',
} as Finding);
const report: ReviewReport = {
	artifact: 'LLD', stage: 'design.story', verdict: 'block', findings: [finding('p01', 'HIGH'), finding('p02', 'MED'), finding('p03', 'LOW')],
	counts: { high: 1, med: 1, low: 1 }, reviewedAt: '2026-10-22T00:00:00.000Z', model: 'cli-claude:opus', reviewedBy: 'daemon',
};
const resolved = (findingId: string, status: 'resolved' | 'overridden' | 'deferred' = 'resolved') => ({ findingId, status, resolvedAt: '2026-10-22T01:00:00.000Z' }) as const;
const logOf = (entries: ChangeLogEntry[]) => ({ log: async (_id: string) => entries });
const lifecycleReview = (entryId: string): Pick<Review, 'report'> => ({ report: reviewReference(ART, entryId) });

describe('report-log', () => {
	it('report-log.test.ts: the review report and its resolutions are read back from the review entry and give the verdict the old stamp gave', async () => {
		const review = reviewEntryOf({ id: 'migrated-x-review', actor, timestamp: '2026-10-22T00:00:00.000Z', report, resolutions: { p01: resolved('p01') } });
		const more = [
			resolutionEntryOf({ id: 'r1', actor, timestamp: '2026-10-22T02:00:00.000Z', findingId: 'p02', resolution: resolved('p02', 'deferred') }),
			resolutionEntryOf({ id: 'r2', actor, timestamp: '2026-10-22T03:00:00.000Z', findingId: 'p02', resolution: resolved('p02', 'overridden') }),
		];
		const unrelated: ChangeLogEntry = { id: 'u', actor, timestamp: '2026-10-22T02:30:00.000Z', operation: 'update' };
		const history = logOf([review, unrelated, ...more]);

		const read = await readReviewReport(history, ART, lifecycleReview('migrated-x-review'));
		assert.ok(read);
		assert.deepEqual(read.report, report, 'the full report is read back');
		assert.equal(read.resolutions['p01']?.status, 'resolved');
		assert.equal(read.resolutions['p02']?.status, 'overridden', 'a later resolution of the same finding wins, in log order');

		// the verdict the old stamp gave: meta.review plus meta.reviewResolutions
		const oldStamp = effectiveReviewVerdict(report, { p01: resolved('p01'), p02: resolved('p02', 'overridden') });
		assert.equal(effectiveReviewVerdict(read.report, read.resolutions), oldStamp);
		assert.equal(oldStamp, 'pass');
		const unresolved = await readReviewReport(logOf([review]), ART, lifecycleReview('migrated-x-review'));
		assert.equal(effectiveReviewVerdict(unresolved!.report, unresolved!.resolutions), effectiveReviewVerdict(report, { p01: resolved('p01') }));

		// a resolution that comes BEFORE the review entry is not applied to it
		const early = resolutionEntryOf({ id: 'early', actor, timestamp: '2026-10-21T00:00:00.000Z', findingId: 'p02', resolution: resolved('p02') });
		const earlyRead = await readReviewReport(logOf([early, review]), ART, lifecycleReview('migrated-x-review'));
		assert.equal(earlyRead!.resolutions['p02'], undefined);

		// absent: no Reference, another artifact, an unknown entry, an entry that is not a review
		assert.equal(await readReviewReport(history, ART, {}), undefined);
		assert.equal(await readReviewReport(history, 'LLD-bbbbbbbbbbbbbbbb-s1', lifecycleReview('migrated-x-review')), undefined);
		assert.equal(await readReviewReport(history, ART, lifecycleReview('nope')), undefined);
		assert.equal(await readReviewReport(history, ART, lifecycleReview('u')), undefined);
		assert.equal(await readReviewReport(history, ART, lifecycleReview('r1')), undefined, 'a resolution entry is not a review');
	});
});
