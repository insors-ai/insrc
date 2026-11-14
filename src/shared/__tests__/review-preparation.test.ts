import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeReviewRuntime, decodePreparedContextManifest, decodeHistoryBinding, decodeCleanupClaim, matchIssuedPreparationAccess, REVIEW_RUNTIME_MAX_BYTES } from '../review-preparation.js';
import type { ReviewRuntime } from '../review-preparation.js';

const digest = 'a'.repeat(64), other = 'b'.repeat(64), key = { project: '/tmp/review-fixture', family: 'code' as const, reviewId: 'review-1' };
const time = '2026-11-14T00:00:00.000Z', limit = 8 * 1024 * 1024;
const runtime = (): ReviewRuntime => ({ schemaVersion: 1, key, attempt: 1, runtimeId: 'runtime-1', daemonEpoch: 'epoch', workerIncarnation: 'worker', sequence: 0, checkpointBinding: { inputDigest: digest, semanticSequence: 0 }, state: 'initializing', resourceGuard: { daemonInstance: 'epoch', openLeases: [] }, progress: { completedUnits: 0, totalUnits: null, observedAt: time, lastMeaningfulActivityAt: null } });

test('compact runtime rejects foreign ownership impossible completion and oversized encoding', () => {
 assert.deepEqual(decodeReviewRuntime(runtime(), key), runtime());
 assert.throws(() => decodeReviewRuntime(runtime(), { ...key, reviewId: 'foreign' }), /Foreign/);
 const bad = runtime(); bad.resourceGuard.daemonInstance = 'old';
 assert.throws(() => decodeReviewRuntime(bad, key), /owner/);
 assert.throws(() => decodeReviewRuntime({ ...runtime(), progress: { ...runtime().progress, completedUnits: 2, totalUnits: 1 } }, key), /completion/);
 assert.throws(() => decodeReviewRuntime({ ...runtime(), committedResultBoundary: { semanticSequence: 1, historyBindingDigest: digest } }, key), /boundary/);
 assert.throws(() => decodeReviewRuntime({ ...runtime(), surprise: 'x'.repeat(REVIEW_RUNTIME_MAX_BYTES) }, key), /oversized/);
 assert.throws(() => decodeReviewRuntime({ ...runtime(), pid: 1 }, key), /Invalid/);
});

test('source history and cleanup contracts bind exact identities without conferring authority', () => {
 const manifest = { schemaVersion: 1, key, attempt: 1, generationId: digest, identityDigest: digest, inputDigest: other, validatorVersion: 1, sourceIdentity: digest, manifestDigest: other, objects: [{ queryDigest: digest, contentDigest: other, bytes: 5 }], views: [{ id: 'task-1', objectDigests: [other] }], byteTotals: { stored: 5, decoded: 5 } };
 assert.deepEqual(decodePreparedContextManifest(manifest, key, limit), manifest);
 assert.throws(() => decodePreparedContextManifest({ ...manifest, objects: [...manifest.objects, ...manifest.objects] }, key, limit), /Duplicate/);
 assert.throws(() => decodePreparedContextManifest({ ...manifest, views: [{ id: 'task-1', objectDigests: [digest] }] }, key, limit), /Unresolved/);
 assert.throws(() => decodePreparedContextManifest({ ...manifest, byteTotals: { stored: 4, decoded: 5 } }, key, limit), /Unaccounted/);
 const history = { schemaVersion: 1, key, attempt: 1, generationId: digest, priorBindingDigest: null, semanticSequence: 1, historyPrefixDigest: other, evidenceManifestDigest: other, bindingDigest: digest };
 assert.deepEqual(decodeHistoryBinding(history, key, limit), history);
 assert.throws(() => decodeHistoryBinding({ ...history, priorBindingDigest: digest }, key, limit), /Self/);
 const claim = { schemaVersion: 1, key, attempt: 1, claimId: 'claim-1', runtimeId: 'runtime-1', checkpointDigest: digest, checkpointFileIdentity: { dev: '1', ino: '2' }, closedAuditDigest: other, approvalRevision: 1, permanent: { artifactId: 'CR-fixture', historyEntryId: 'entry-1', preservationDigest: digest }, deletions: [{ kind: 'runtime', relativePath: '', nodeType: 'file', identity: digest, contentDigest: digest }, { kind: 'checkpoint', relativePath: '', nodeType: 'file', identity: other, contentDigest: digest }] };
 assert.deepEqual(decodeCleanupClaim(claim, key, limit), claim);
 assert.throws(() => decodeCleanupClaim({ ...claim, deletions: claim.deletions.slice(1) }, key, limit), /inventory/);
 assert.throws(() => decodeCleanupClaim({ ...claim, path: '/arbitrary' }, key, limit), /Invalid/);
 const issued = { capabilityId: 'private-1', daemonEpoch: 'epoch', expectedGenerationId: digest };
 assert.throws(() => matchIssuedPreparationAccess(issued, undefined), /Unissued/);
 assert.throws(() => matchIssuedPreparationAccess({ ...issued, daemonEpoch: 'old' }, issued), /Unissued/);
 assert.deepEqual(matchIssuedPreparationAccess({ ...issued }, issued), issued);
});
