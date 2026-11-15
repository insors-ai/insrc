import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { ReviewRuntime } from '../../../shared/review-preparation.js';
import { upgradePreparationHistory, preparationSubmission } from '../preparation-migration.js';
import { decodePreparationCheckpoint } from '../preparation-checkpoint.js';
import { preparationDigest } from '../prepared-context.js';
import { designFixture, admissionFixture } from '../design-review/__tests__/fixtures.js';
import { impactFixture } from '../design-review/__tests__/impact-fixtures.js';
import { DesignPreparation } from '../design-preparation.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { join } from 'node:path';
import { fixture as codeFixture } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { decodeStoredCheckpoint } from '../../code-review/task-review/admission-checkpoint.js';
import { decodeStoredDesignCheckpoint } from '../design-review/admission-checkpoint.js';

function runtime(project: string, family: 'code' | 'design', reviewId: string, attempt: number, input: unknown): ReviewRuntime {
 return { schemaVersion: 1, key: { project, family, reviewId }, attempt, runtimeId: 'migration-runtime', daemonEpoch: 'epoch-new', workerIncarnation: 'worker-new', sequence: 0,
  checkpointBinding: { inputDigest: preparationDigest(input), semanticSequence: 0 }, state: 'initializing', resourceGuard: { daemonInstance: 'epoch-new', openLeases: [] },
  progress: { completedUnits: 0, totalUnits: null, observedAt: '2026-11-15T00:00:00.000Z', lastMeaningfulActivityAt: null } };
}

test('inactive version-one migration preserves code and design history and old readers reject format three', async t => {
 const code = await codeFixture(); t.after(code.cleanup);
 const design = designFixture(t), codeInput = code.checkpoint();
 codeInput.attempts[0]!.header.status = 'passed';
 const designInput = design.checkpoint;
 designInput.attempts[0]!.status = 'failed';
 designInput.attempts[0]!.finishedAt = designInput.attempts[0]!.startedAt;
 designInput.attempts[0]!.failure = { code: 'process_failed', summary: 'Historical reviewer process failed' };
 for (const [family, input, oldReader] of [
  ['code', codeInput, decodeStoredCheckpoint], ['design', designInput, decodeStoredDesignCheckpoint],
 ] as const) {
  const original = JSON.stringify(input), key = { project: input.project, family, reviewId: input.reviewId };
  assert.equal(input.schemaVersion, 1);
  assert.doesNotThrow(() => oldReader(input));
  const migrated = upgradePreparationHistory(input, key, runtime(input.project, family, input.reviewId, 1, preparationSubmission(input, key)));
  assert.equal(JSON.stringify(input), original, 'migration leaves historical input bytes unchanged');
  assert.equal(migrated.migration!.sourceVersion, 1);
  assert.deepEqual(migrated.migration!.guards, []);
  assert.deepEqual(migrated.attempts, input.attempts);
  assert.equal(decodePreparationCheckpoint(migrated, key).format, 'current');
  const current = JSON.stringify(migrated);
  // These are the historical readers, not the new read-only v3 projections.
  assert.throws(() => oldReader(migrated), 'an unsupported old reader must refuse the new format');
  assert.equal(JSON.stringify(migrated), current, 'rejected reads cannot downgrade or rewrite history');
 }
});

test('inactive historical migration preserves both family submissions feedback and closed guard audit without mutating originals', t => {
 const code = JSON.parse(gunzipSync(readFileSync(new URL('../../../daemon/threads/__tests__/fixtures/review-preparation/history.json.gz', import.meta.url))).toString());
 // The retained stopped fixture itself is never changed. Only this in-memory
 // copy represents an explicitly cleared inactive historical review.
 for (const a of code.attempts) if (a.resourceGuard) a.resourceGuard.openLeases = [];
 const f = designFixture(t), design = admissionFixture(f);
 design.attempts[0]!.resourceGuard = { daemonInstance: 'old-design', openLeases: [] };
 for (const [family, input] of [['code', code], ['design', design]] as const) {
  const original = JSON.stringify(input), latest = input.attempts.at(-1)!;
  const n = 'header' in latest ? latest.header.attempt : latest.number;
  const host = runtime(input.project, family, input.reviewId, n, latest.submitted);
  const migrated = upgradePreparationHistory(input, host.key, host);
  assert.equal(JSON.stringify(input), original);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.migration!.sourceVersion, input.schemaVersion);
  assert.equal(migrated.migration!.guards.length, input.attempts.filter(a => 'resourceGuard' in a && a.resourceGuard).length);
  assert.deepEqual(migrated.attempts, input.attempts.map(a => { const { resourceGuard: _guard, ...rest } = a as typeof a & { resourceGuard?: unknown }; return rest; }));
  assert.equal(decodePreparationCheckpoint(migrated, host.key).format, 'current');
  assert.throws(() => upgradePreparationHistory(migrated, host.key, host), /historical migration/);
  assert.throws(() => decodePreparationCheckpoint({ ...migrated, schemaVersion: 4 }, host.key), /Unsupported/);
 }
});

test('inactive migration refuses unresolved and unverifiable legacy guards and mismatched initialization', t => {
 const f = designFixture(t), input = f.checkpoint;
 const host = runtime(f.repo, 'design', input.reviewId, 1, input.submitted);
 assert.throws(() => upgradePreparationHistory(input, host.key, host), /unverifiable/);
 const v2 = admissionFixture(f);
 v2.attempts[0]!.resourceGuard = { daemonInstance: 'old-design', openLeases: [{ operationId: 'retained', workerIncarnation: 'old-worker', kind: 'cli', openedAt: '2026-11-15T00:00:00.000Z' }] };
 const original = JSON.stringify(v2), v2host = runtime(f.repo, 'design', input.reviewId, 1, v2.attempts[0]!.submitted);
 assert.throws(() => upgradePreparationHistory(v2, v2host.key, v2host), /unresolved/);
 assert.equal(JSON.stringify(v2), original);
 v2.attempts[0]!.resourceGuard.openLeases = [];
 assert.throws(() => upgradePreparationHistory(v2, v2host.key, { ...v2host, state: 'active' }), /initializing/);
 assert.throws(() => upgradePreparationHistory(v2, v2host.key, { ...v2host, checkpointBinding: { inputDigest: 'f'.repeat(64), semanticSequence: 0 } }), /digest mismatch/);
 assert.throws(() => upgradePreparationHistory({ ...v2, schemaVersion: 100 }, v2host.key, v2host), /Unsupported/);
});

test('historical design migration derives the current attempt locator without rewriting its original submission', async t => {
 const f = impactFixture(t), guard = { daemonInstance: 'old-design', openLeases: [] };
 const input = { ...f.checkpoint, schemaVersion: 2, attempts: [{ ...f.baseline, resourceGuard: guard }, { ...f.current, preparationKind: 'planning', resourceGuard: guard }] };
 const original = JSON.stringify(input), key = { project: f.repo, family: 'design' as const, reviewId: input.reviewId };
 const submitted = preparationSubmission(input, key) as { artifactPath: string; attempt: number };
 assert.deepEqual(submitted, { artifactPath: input.submitted.artifactPath, attempt: 2 });
 const migrated = upgradePreparationHistory(input, key, runtime(f.repo, 'design', input.reviewId, 2, submitted));
 assert.equal(JSON.stringify(input), original);
 assert.ok('submitted' in migrated); assert.deepEqual(migrated.submitted, input.submitted);
 const limits = reviewPreparationLimits(join(f.repo, 'no-config.json'));
 const preparation = new DesignPreparation(key, 2, limits, new ReviewPreparationCapacity(limits.cacheMaxBytes), submitted);
 preparation.prepare(f.repo, submitted.artifactPath); const source = await preparation.seal();
 assert.equal(source.inputDigest, migrated.runtime.inputDigest); preparation.close();
});

test('explicit next-attempt migration binds its exact input and preserves history without inventing an admission', t => {
 const f = designFixture(t), input = admissionFixture(f);
 input.attempts[0]!.status = 'failed';
 input.attempts[0]!.finishedAt = '2026-11-09T00:01:00.000Z';
 input.attempts[0]!.error = { code: 'process_failed', field: 'artifactPath', summary: 'Prior admission failed' };
 input.attempts[0]!.resourceGuard = { daemonInstance: 'old-design', openLeases: [] };
 const submitted = { artifactPath: f.checkpoint.submitted.artifactPath, attempt: 2 };
 const host = runtime(f.repo, 'design', input.reviewId, 2, submitted), before = JSON.stringify(input);
 assert.throws(() => upgradePreparationHistory(input, host.key, host), /attempt mismatch/);
 assert.throws(() => upgradePreparationHistory(input, host.key, host, { attempt: 3, submitted }), /attempt mismatch/);
 assert.throws(() => upgradePreparationHistory(input, host.key, host, { attempt: 2, submitted: { ...submitted, attempt: 3 } }), /digest mismatch/);
 const migrated = upgradePreparationHistory(input, host.key, host, { attempt: 2, submitted });
 assert.equal(JSON.stringify(input), before);
 assert.equal(migrated.attempts.length, 1, 'only the family admission owner may append the next attempt');
 assert.deepEqual(migrated.runtime, { runtimeId: host.runtimeId, inputDigest: host.checkpointBinding.inputDigest });
 assert.deepEqual(migrated.migration!.guards, [{ attempt: 1, guard: input.attempts[0]!.resourceGuard }]);
});
