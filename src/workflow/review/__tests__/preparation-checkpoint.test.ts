import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decodePreparationCheckpoint } from '../preparation-checkpoint.js';
import { designFixture, admissionFixture } from '../design-review/__tests__/fixtures.js';

const refs = { runtime: { runtimeId: 'runtime-1', inputDigest: 'a'.repeat(64) } };
test('code checkpoint codec reads historical history and exact version three without embedded guards', () => {
 const cp = JSON.parse(gunzipSync(readFileSync(new URL('../../../daemon/threads/__tests__/fixtures/review-preparation/history.json.gz', import.meta.url))).toString());
 const key = { project: cp.project, family: 'code' as const, reviewId: cp.reviewId };
 assert.equal(decodePreparationCheckpoint(cp, key).format, 'historical');
 const current = { ...cp, schemaVersion: 3, ...refs, attempts: cp.attempts.map((a: Record<string, unknown>) => { const { resourceGuard, ...rest } = a; return rest; }) };
 assert.equal(decodePreparationCheckpoint(current, key).format, 'current');
 assert.throws(() => decodePreparationCheckpoint({ ...current, schemaVersion: 4 }, key), /Unsupported/);
 assert.throws(() => decodePreparationCheckpoint({ ...current, runtime: { ...refs.runtime, path: '/tmp/foreign' } }, key), /version-3/);
 assert.throws(() => decodePreparationCheckpoint({ ...current, attempts: cp.attempts }, key), /version-3/);
 assert.throws(() => decodePreparationCheckpoint(current, { ...key, reviewId: 'foreign' }), /Foreign/);
});
test('design checkpoint codec preserves historical qualified and admission records on version three decode', t => {
 const f = designFixture(t), key = { project: f.repo, family: 'design' as const, reviewId: f.checkpoint.reviewId };
 assert.equal(decodePreparationCheckpoint(f.checkpoint, key).format, 'historical');
 const admission = admissionFixture(f);
 assert.equal(decodePreparationCheckpoint(admission, key).format, 'historical');
 const current = { ...admission, schemaVersion: 3, ...refs };
 assert.equal(decodePreparationCheckpoint(current, key).format, 'current');
 assert.throws(() => decodePreparationCheckpoint({ ...current, runtime: undefined }, key), /version-3/);
 assert.throws(() => decodePreparationCheckpoint({ ...current, schemaVersion: 99 }, key), /Unsupported/);
});
