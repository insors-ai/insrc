import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { ReviewRuntime } from '../../../shared/review-preparation.js';
import { upgradePreparationHistory } from '../preparation-migration.js';
import { decodePreparationCheckpoint } from '../preparation-checkpoint.js';
import { preparationDigest } from '../prepared-context.js';
import { designFixture, admissionFixture } from '../design-review/__tests__/fixtures.js';

function runtime(project: string, family: 'code' | 'design', reviewId: string, attempt: number, input: unknown): ReviewRuntime {
 return { schemaVersion: 1, key: { project, family, reviewId }, attempt, runtimeId: 'migration-runtime', daemonEpoch: 'epoch-new', workerIncarnation: 'worker-new', sequence: 0,
  checkpointBinding: { inputDigest: preparationDigest(input), semanticSequence: 0 }, state: 'initializing', resourceGuard: { daemonInstance: 'epoch-new', openLeases: [] },
  progress: { completedUnits: 0, totalUnits: null, observedAt: '2026-11-15T00:00:00.000Z', lastMeaningfulActivityAt: null } };
}

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
