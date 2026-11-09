/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './publication-fixture.js';
import { ReviewProgressTracker } from '../progress.js';
import { mergeCodeAdmissionFailure, mergeTaskSummary, codeReviewPreservationDigest } from '../record.js';
import { completedSummary } from '../summary.js';
import { prepareReviewPacket } from '../packet.js';
import type { CodeAdmissionAttempt } from '../contracts.js';
import { designPreservationDigest } from '../../../review/design-review/history.js';
import { designFixture } from '../../../review/design-review/__tests__/fixtures.js';

test('guard-only updates preserve report identity while reviewed-input or result mutations do not', async t => {
 const f = await fixture(); t.after(f.cleanup);
 const time = '2026-11-09T00:00:00.000Z', tracker = new ReviewProgressTracker(); tracker.phase('error');
 const failed: CodeAdmissionAttempt = { phase: 'admission', validation: 'unverified', operation: 'start', acceptedAt: time,
  header: { attempt: 1, status: 'failed', reviewer: 'daemon', createdAt: time, completedAt: time }, submitted: f.packet,
  error: { code: 'source_failed', field: 'reviewSet', summary: 'No code assessment' }, progress: tracker.snapshot(), resourceGuard: { daemonInstance: 'daemon-1', openLeases: [] },
 };
 const initial = mergeCodeAdmissionFailure(undefined, 'failed-scope', failed);
 const prepared = await prepareReviewPacket(f.packet, f.deps.sources, true);
 const body = mergeTaskSummary(initial, completedSummary(prepared, f.checkpoint().attempts[0]!, 'independent-scope'));
 const guardOnly = structuredClone(failed); guardOnly.resourceGuard!.daemonInstance = 'daemon-2';
 const replay = mergeCodeAdmissionFailure(body, 'failed-scope', guardOnly);
 assert.equal(codeReviewPreservationDigest(replay), codeReviewPreservationDigest(body));
 const changed = structuredClone(failed); changed.submitted.functionalSummary = 'Different request';
 assert.throws(() => mergeCodeAdmissionFailure(body, 'failed-scope', changed), /Conflicting/);
 const inputChanged = structuredClone(body); inputChanged.admissionFailures![0]!.attempt.submitted.functionalSummary = 'Changed';
 assert.notEqual(codeReviewPreservationDigest(inputChanged), codeReviewPreservationDigest(body));
 const resultChanged = structuredClone(body); resultChanged.reviews[0]!.tasks[0]!.summary = 'Changed review result';
 assert.notEqual(codeReviewPreservationDigest(resultChanged), codeReviewPreservationDigest(body));
 const sourceChanged = structuredClone(body); sourceChanged.reviews[0]!.scope.reviewSet[0]!.files[0]!.path = 'other.ts';
 assert.notEqual(codeReviewPreservationDigest(sourceChanged), codeReviewPreservationDigest(body));
 const d = designFixture(t), cp = { ...d.checkpoint, schemaVersion: 2 as const, attempts: d.checkpoint.attempts.map(a => ({ ...a, resourceGuard: { daemonInstance: 'one', openLeases: [] } })) };
 const digest = designPreservationDigest(cp); cp.attempts[0]!.resourceGuard.daemonInstance = 'two';
 assert.equal(designPreservationDigest(cp), digest);
 cp.attempts[0]!.baseline.reviewedContent.document += 'changed'; assert.notEqual(designPreservationDigest(cp), digest);
});
