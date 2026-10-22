import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkHeadIntegrity, checkIntegrity, contentHash } from '../../artifact-core/lifecycle.js';
import type { Actor, Lifecycle } from '../../artifact-core/types.js';
import { readReviewReport } from '../../review/report-log.js';
import { backfillHead } from '../backfill.js';
import { migratedEntryId } from '../entry-ids.js';
import { ConversionUnreadable } from '../types.js';
import type { RawHead } from '../types.js';

const H = 'aaaaaaaaaaaaaaaa';
const ID = `LLD-${H}-s1`;
const NOW = '2026-10-23T09:00:00.000Z';
const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const finding = (claimId: string, severity: string) => ({ claimId, severity, kind: 'k', premise: 'p', evidence: 'e', action: 'a', fixability: 'manual' });
const report = (reviewedAt: string, findings: unknown[] = [finding('p1', 'HIGH')]) => ({ artifact: 'LLD', stage: 'design.story', verdict: 'block', findings, counts: { high: 1, med: 0, low: 0 }, reviewedAt, model: 'cli-claude:opus', reviewedBy: 'daemon' });
const legacy = (meta: Record<string, unknown>, body: Record<string, unknown> = { goal: 'g', feedback: [{ id: 'f1' }] }): RawHead => ({
	artifactId: ID, json: { meta: { workflow: 'design.story', epicHash: H, storyId: 's1', createdAt: '2026-10-20T10:00:00.000Z', revision: 3, ...meta }, body, citations: [{ id: 'c1' }] },
});
const run = (head: RawHead, hasLog = false) => backfillHead({ head, hasLog, now: NOW, actor: MIGRATION });
const parse = (bytes: string) => JSON.parse(bytes) as { meta: Record<string, any>; body: Record<string, unknown>; citations: unknown[] };

describe('convert-lifecycle-backfill', () => {
	it('convert-lifecycle-backfill.test.ts: the lifecycle and the migrated entries are computed from the legacy fields', async () => {
		// an approved, reviewed head with a resolution, a rangeBase and old feedback
		const out = run(legacy({
			approvedAt: '2026-10-21T10:00:00.000Z', rangeBase: 'abc123', review: report('2026-10-21T09:00:00.000Z'),
			reviewResolutions: { p1: { findingId: 'p1', status: 'resolved', resolvedAt: '2026-10-21T09:30:00.000Z' } },
			reviewOverride: { reason: 'owner accepted' },
		}));
		const head = parse(out.converted.bytes);
		for (const f of ['approvedAt', 'rejectedAt', 'rejectReason', 'reviewOverride', 'staleAckedAt', 'review', 'reviewResolutions']) assert.equal(head.meta[f], undefined, `${f} is gone`);
		assert.equal(head.meta['rangeBase'], 'abc123', 'meta.rangeBase is not stripped');
		assert.equal(head.meta['revision'], 3, 'meta.revision is not touched');
		assert.equal(head.body['feedback'], undefined, 'body.feedback is stripped (its lines are appended by their own rule)');
		assert.deepEqual(head.body['goal'], 'g');
		assert.deepEqual(out.legacyFields.sort(), ['approvedAt', 'body.feedback', 'review', 'reviewOverride', 'reviewResolutions']);
		const lifecycle = head.meta['lifecycle'] as Lifecycle;
		assert.equal(lifecycle.status, 'approved');
		assert.equal(lifecycle.revision.number, 3);
		assert.equal(lifecycle.approval?.revision, 3);
		assert.equal(lifecycle.approval?.at, '2026-10-21T10:00:00.000Z');
		assert.deepEqual(lifecycle.approval?.override, { reason: 'owner accepted' });
		assert.equal(lifecycle.review?.verdict, 'pass', 'the resolution turns the block into pass, as the approval gate read it');
		assert.equal(lifecycle.review?.party, 'daemon');
		assert.equal(lifecycle.review?.revision, 3);

		// the hash is of the CONVERTED content, and head and log agree
		const expected = contentHash('', { body: head.body, citations: head.citations });
		assert.equal(lifecycle.revision.contentHash, expected);
		const view = { description: '', payload: { body: head.body, citations: head.citations }, lifecycle };
		assert.deepEqual(checkHeadIntegrity(view), { ok: true });
		const entries = out.converted.entries;
		assert.deepEqual(checkIntegrity(view, entries), { ok: true });
		const last = entries.at(-1)!;
		assert.deepEqual([last.id, last.operation, last.timestamp, last.revision], [migratedEntryId(ID), 'create', NOW, { number: 3, contentHash: expected }]);
		assert.equal(entries.filter(e => e.revision !== undefined).length, 1, 'only the migrated entry carries a revision');
		assert.deepEqual(entries.map(e => e.id), [migratedEntryId(ID, 'review'), migratedEntryId(ID, 'approve'), migratedEntryId(ID)]);
		assert.equal(entries[1]!.timestamp, '2026-10-21T10:00:00.000Z', 'the stamp entry keeps its original time');

		// the review entry carries the full report and the resolutions, and the lifecycle references it
		const record = await readReviewReport({ log: async () => entries }, ID, lifecycle.review!);
		assert.equal(record?.report.model, 'cli-claude:opus');
		assert.equal(record?.resolutions['p1']?.status, 'resolved');

		// a second pass over the converted head changes nothing
		const again = run({ artifactId: ID, json: JSON.parse(out.converted.bytes) }, true);
		assert.equal(again.converted.bytes, out.converted.bytes);
		assert.deepEqual(again.legacyFields, []);
		assert.equal(again.converted.entries.at(-1)?.operation, 'update', 'an artifact with a log gets an update entry');
		assert.equal(again.converted.entries.length, 1, 'no stamp entry is made twice');
	});

	it('convert-lifecycle-backfill.test.ts: the later stamp decides the status and a review older than the revision is not bound', () => {
		const t1 = '2026-10-21T10:00:00.000Z';
		const t2 = '2026-10-22T10:00:00.000Z';
		const rejectedLater = run(legacy({ approvedAt: t1, rejectedAt: t2, rejectReason: 'wrong scope' }));
		assert.equal(parse(rejectedLater.converted.bytes).meta['lifecycle'].status, 'rejected');
		assert.equal(parse(rejectedLater.converted.bytes).meta['lifecycle'].approval, undefined);
		assert.deepEqual(rejectedLater.converted.entries.map(e => [e.operation, e.timestamp]).slice(0, 2), [['approve', t1], ['reject', t2]]);
		assert.deepEqual(rejectedLater.converted.entries[1]!.status, { from: 'approved', to: 'rejected' }, 'a rejection after an approval leaves approved');
		assert.equal(rejectedLater.converted.entries[1]!.outcome?.summary, 'wrong scope');
		const approvedLater = run(legacy({ rejectedAt: t1, approvedAt: t2 }));
		assert.equal(parse(approvedLater.converted.bytes).meta['lifecycle'].status, 'approved');
		assert.equal(run(legacy({ status: 'approved' })).converted.entries[0]!.timestamp, '2026-10-20T10:00:00.000Z', 'a bare status takes the head\'s creation time');
		assert.equal(parse(run(legacy({})).converted.bytes).meta['lifecycle'].status, 'draft');

		// a review made before the head was written did not review it: the entry records it, the lifecycle does not carry it
		const old = run(legacy({ review: report('2026-10-19T00:00:00.000Z', [finding('p1', 'LOW'), 'junk']) }));
		assert.equal(old.unboundReview, true);
		assert.equal(old.malformedFindings, 1);
		assert.equal(parse(old.converted.bytes).meta['lifecycle'].review, undefined);
		assert.equal(old.converted.entries[0]!.id, migratedEntryId(ID, 'review'));
		assert.equal(run(legacy({ review: report('2026-10-21T00:00:00.000Z') })).unboundReview, false);

		// a stale acknowledgement is an ack-stale entry with its own time
		const ack = run(legacy({ staleAckedAt: t2 }));
		assert.deepEqual(ack.converted.entries.slice(0, 1).map(e => [e.id, e.operation, e.timestamp]), [[migratedEntryId(ID, 'mark-stale'), 'ack-stale', t2]]);
	});

	it('convert-lifecycle-backfill.test.ts: an existing lifecycle keeps its approval actor and an unreadable head is refused', () => {
		const actor: Actor = { id: 'github:alice', kind: 'person', properties: {} };
		const existing: Lifecycle = {
			status: 'approved', revision: { number: 3, contentHash: 'old', at: '2026-10-20T10:00:00.000Z', by: actor },
			approval: { revision: 3, by: actor, at: '2026-10-21T10:00:00.000Z' }, signoffs: [],
		};
		const out = run(legacy({ approvedAt: '2026-10-21T10:00:00.000Z', lifecycle: existing }));
		const lifecycle = parse(out.converted.bytes).meta['lifecycle'] as Lifecycle;
		assert.deepEqual(lifecycle.approval?.by, actor, 'the person who approved stays the approver');
		assert.deepEqual(lifecycle.revision.by, actor);
		assert.notEqual(lifecycle.revision.contentHash, 'old', 'the hash is refreshed for the converted content');
		// a lifecycle past approval keeps its status although the head still carries the approval stamp
		const completed = run(legacy({ approvedAt: '2026-10-21T10:00:00.000Z', lifecycle: { ...existing, status: 'completed' } }));
		assert.equal((parse(completed.converted.bytes).meta['lifecycle'] as Lifecycle).status, 'completed');
		// ... but a draft lifecycle with an approval stamp is approved by the stamp
		const draft = run(legacy({ approvedAt: '2026-10-21T10:00:00.000Z', lifecycle: { ...existing, status: 'draft', approval: undefined } }));
		assert.equal((parse(draft.converted.bytes).meta['lifecycle'] as Lifecycle).status, 'approved');
		assert.throws(() => run({ artifactId: ID, json: { meta: {} } }), ConversionUnreadable);
		assert.throws(() => run({ artifactId: ID, json: 'x' }), ConversionUnreadable);
	});
});
