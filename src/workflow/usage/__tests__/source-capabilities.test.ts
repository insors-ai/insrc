/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSourceCapability } from '../capabilities.js';
import { capability } from './fixtures/domain-fixtures.js';

test('capability declarations reject malformed or unqualified native completeness', () => {
  assert.deepEqual(validateSourceCapability(capability), []);
  assert.deepEqual(validateSourceCapability({ ...capability, version: null, sourceRevision: 'fixture-revision' }), []);
  for (const bad of [
    { ...capability, unknown: true }, { ...capability, provider: '' }, { ...capability, version: undefined },
    { ...capability, granularity: 'future' }, { ...capability, supportedCounterBuckets: ['inputTokens'] },
    { ...capability, supportedCounterBuckets: ['outputTokens', 'outputTokens'] },
    { ...capability, version: null, sourceRevision: null }, { ...capability, evidenceRefs: [] },
    { ...capability, evidenceRefs: ['same', 'same'] }, { ...capability, qualification: 'unqualified' },
    { ...capability, qualification: 'recorded-fixture' }, { ...capability, granularity: 'invocation-total' },
    { ...capability, granularity: 'cumulative-snapshot', physicalCallCoverage: 'unknown', baselineRequired: false },
  ]) assert.ok(validateSourceCapability(bad).length > 0);
  const unknown = { ...capability, version: null, sourceRevision: null, evidenceRefs: [], qualification: 'unqualified', physicalCallCoverage: 'unknown', granularity: 'unknown', observedModelIdentity: 'unknown', inputConvention: 'unknown', reasoningInOutput: 'unknown', supportedCounterBuckets: [] };
  assert.deepEqual(validateSourceCapability(unknown), []);
  assert.equal(unknown.physicalCallCoverage, 'unknown');
  let calls = 0;
  assert.ok(validateSourceCapability(Object.defineProperty({}, 'capabilityId', { enumerable: true, get() { calls++; return 'fixture'; } })).length);
  assert.equal(calls, 0);
  assert.ok(validateSourceCapability(new Date()).length);
});
