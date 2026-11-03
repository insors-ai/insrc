import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryError } from '../errors.js';
import { EMBEDDING_NORMALIZATION_VERSION, embeddingProfile, embeddingText, embeddingVector, requireProfile, validateProfile } from '../store/embedding-profile.js';

const fails = (run: () => unknown, code = 'INVALID_REQUEST') => assert.throws(run, e => e instanceof MemoryError && e.code === code);
test('store-embedding-profile-preserves-text-and-converts-float32-once', () => {
  const text = '  Mixed CASE\r\nCafe\u0301 😀  ';
  assert.equal(embeddingText(text, 4096), text);
  const profile = embeddingProfile('model-preprocessing-v1', 3);
  assert.equal(profile.normalizationVersion, EMBEDDING_NORMALIZATION_VERSION);
  assert.deepEqual(embeddingVector([3, 4, 0.1], profile), [3, 4, Math.fround(0.1)]);
  assert.ok(Object.is(embeddingVector([-0, 0, 1], profile)[0], -0));
  const converted = embeddingVector([3, 4, 0.1], profile);
  assert.deepEqual(embeddingVector(converted, profile), converted);
  assert.ok(Object.isFrozen(converted));
  assert.equal(Math.hypot(converted[0]!, converted[1]!), 5, 'no L2 renormalization');
});
test('store-embedding-profile-rejects-missing-or-mismatched-metadata', () => {
  const profile = embeddingProfile('model-v1', 2);
  for (const field of Object.keys(profile)) { const bad = { ...profile } as Record<string, unknown>; delete bad[field]; fails(() => validateProfile(bad)); }
  fails(() => requireProfile(embeddingProfile('model-v2', 2), profile), 'UNSUPPORTED_VERSION');
  fails(() => requireProfile(embeddingProfile('model-v1', 3), profile), 'UNSUPPORTED_VERSION');
  fails(() => requireProfile({ ...profile, normalizationVersion: 'semantic-normalizer-v1' }, profile), 'UNSUPPORTED_VERSION');
  fails(() => validateProfile({ ...profile, extra: true }));
  for (const dimension of [0, 8193, NaN, 1.5]) fails(() => embeddingProfile('model', dimension));
  assert.equal(embeddingProfile('model', 8192).dimension, 8192);
  let invoked = false;
  const getter = Object.defineProperty({}, 'model', { enumerable: true, get() { invoked = true; return 'fake'; } });
  fails(() => validateProfile(getter)); assert.equal(invoked, false);
});
test('store-embedding-profile-rejects-unsafe-text-and-vectors', () => {
  const profile = embeddingProfile('model', 2);
  for (const value of [[1], [1, 2, 3], [NaN, 1], [Infinity, 0], [Number.MAX_VALUE, 0], ['1', 2], new Float32Array([1, 2])]) fails(() => embeddingVector(value, profile));
  for (const text of ['', '\ud800', '\udfff', { toString() { throw Error('not called'); } }]) fails(() => embeddingText(text, 4096));
  fails(() => embeddingText('large', 2)); fails(() => embeddingText('x', Infinity));
});
