/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { eventSetDigest, validateRecord, validateScope } from '../validation.js';
import { finish, signed, start, scope, binding, capability } from './fixtures/domain-fixtures.js';

const rejected = (value: unknown): void => { assert.ok(validateRecord(value).length, 'invalid record must produce notices'); };

test('record validation rejects unsafe shapes, versions, identities and digests without invoking hooks', () => {
  assert.deepEqual(validateRecord(finish()), []);
  assert.deepEqual(validateRecord(start()), []);
  assert.deepEqual(validateRecord({ ...finish(), schemaVersion: 2 }), ['unsupported-version:/schemaVersion']);
  assert.deepEqual(validateRecord({ ...finish(), recordKind: 'future' }), ['unknown-kind:/recordKind']);
  for (const bad of [null, [], true, {}, { ...finish(), extra: true }, { ...finish(), observation: null },
    { ...finish(), callId: null }, { ...finish(), context: start().context }, { ...finish(), sequence: -1 },
    { ...finish(), rootArtifactId: 'DEF-0123456789abcdef' }, { ...finish(), artifactId: 'TASK-0123456789abcdef-S1-t1' },
    { ...finish(), recordedAt: '2026-10-26' }, { ...finish(), payloadDigest: 'f'.repeat(64) },
    signed({ ...start(), context: { ...start().context, attempt: 0 } }),
    signed({ ...start(), context: { ...start().context, binding: { ...binding, artifactId: 'TASK-0123456789abcdef-s1-t2' } } }),
    signed({ ...start(), context: { ...start().context, granularity: 'invocation-total', invocationId: null } }),
    signed({ ...start(), context: { ...start().context, granularity: 'cumulative-snapshot' } }),
  ]) rejected(bad);
  let calls = 0;
  rejected(Object.defineProperty({ ...finish() }, 'observation', { enumerable: true, get() { calls++; return finish().observation; } }));
  rejected({ ...finish(), toJSON() { calls++; return finish(); } });
  assert.equal(calls, 0);
  const before = JSON.stringify(finish()); validateRecord(finish()); assert.equal(JSON.stringify(finish()), before);
});

test('counter and quality validation preserves unknown, pending, reported and estimated distinctions', () => {
  const base = finish().observation;
  assert.deepEqual(validateRecord(finish({ outcome: 'error' })), [], 'failure does not erase consumed counters');
  assert.deepEqual(validateRecord(finish({ counters: { ...base.counters, inputUncachedTokens: Number.MAX_SAFE_INTEGER, reasoningTokens: null } })), []);
  assert.deepEqual(validateRecord(finish({ counters: { inputUncachedTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 } })), []);
  assert.deepEqual(validateRecord(finish({ quality: 'estimated', reason: 'fixture:explicit-estimation-provenance' })), []);
  assert.ok(validateRecord(finish({ quality: 'estimated' })).includes('quality-conflict:/observation/reason'));
  assert.ok(validateRecord(finish({ quality: 'estimated', reason: ' ' })).includes('quality-conflict:/observation/reason'));
  const nulls = { inputUncachedTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null };
  assert.deepEqual(validateRecord(finish({ quality: 'unavailable', reason: 'provider omitted usage', counters: nulls })), []);
  assert.ok(validateRecord(finish({ quality: 'unavailable', counters: nulls })).includes('quality-conflict:/observation'));
  assert.ok(validateRecord(finish({ quality: 'unavailable', reason: 'missing' })).includes('quality-conflict:/observation'));
  assert.ok(validateRecord(finish({ counters: { ...base.counters, reasoningTokens: 3 } })).includes('counter-invalid:/observation/counters/reasoningTokens'));
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) assert.deepEqual(validateRecord({ ...finish(), observation: { ...base, counters: { ...base.counters, outputTokens: value } } }), ['counter-invalid:/observation/counters/outputTokens']);
  rejected({ ...finish(), observation: { ...base, quality: 'pending' } });
  assert.deepEqual(validateRecord(start()), [], 'pending work is represented by a start, never fabricated zero counters');
});

test('closed scope evidence rejects fabricated completeness, bad references and inconsistent bindings', () => {
  const valid = scope();
  assert.deepEqual(validateScope(valid), []);
  assert.equal(eventSetDigest(['start', 'finish']), eventSetDigest(['finish', 'start']));
  assert.notEqual(eventSetDigest(['start', 'finish']), eventSetDigest(['start']));
  assert.throws(() => eventSetDigest(['same', 'same']));
  assert.deepEqual(validateScope({ ...valid, closure: 'partial', evidence: { ...valid.evidence, rootWatermarkRefs: [], coverageState: 'partial' } }), []);
  for (const bad of [
    { complete: true }, { ...valid, complete: true }, { ...valid, group: { ...valid.group, isolatedCallId: 'call' } },
    { ...valid, evidence: { ...valid.evidence, extra: true } },
    { ...valid, evidence: { ...valid.evidence, expectedRecordCount: 1 } },
    { ...valid, evidence: { ...valid.evidence, expectedEventIds: ['start', 'start'] } },
    { ...valid, evidence: { ...valid.evidence, eventSetDigest: '0'.repeat(64) } },
    { ...valid, evidence: { ...valid.evidence, referenceOnlyEventIds: ['missing'] } },
    { ...valid, evidence: { ...valid.evidence, coverageState: 'legacy' } },
    { ...valid, evidence: { ...valid.evidence, rootWatermarkRefs: [] } },
    { ...valid, evidence: { ...valid.evidence, rootWatermarkRefs: [...valid.evidence.rootWatermarkRefs, ...valid.evidence.rootWatermarkRefs] } },
    { ...valid, evidence: { ...valid.evidence, expectedBindingVersions: [] } },
    { ...valid, expectedBindings: [], evidence: { ...valid.evidence, expectedBindingVersions: [] } },
    { ...valid, expectedBindings: [{ ...binding, version: 'wrong' }] },
    { ...valid, expectedBindings: [binding, binding] },
    { ...valid, evidence: { ...valid.evidence, sourceCapabilities: [{ ...capability, extra: true }] } },
    { ...valid, evidence: { ...valid.evidence, sourceCapabilities: [capability, capability] } },
    { ...valid, evidence: { ...valid.evidence, sourceCapabilities: [] } },
    { ...valid, evidence: { ...valid.evidence, baselineEventId: 'start' } },
    { ...valid, evidence: { ...valid.evidence, baselineEventId: 'start', selectedCurrentEventId: 'finish' } },
  ]) assert.ok(validateScope(bad).length > 0, 'incomplete or conflicting scope must produce notices');
  const cumulative = { ...valid, evidence: { ...valid.evidence, baselineEventId: 'start', selectedCurrentEventId: 'finish', referenceOnlyEventIds: ['start'] } };
  assert.deepEqual(validateScope(cumulative), []);
  assert.ok(validateScope({ ...cumulative, evidence: { ...cumulative.evidence, referenceOnlyEventIds: ['start', 'finish'] } }).length);
  let calls = 0;
  assert.ok(validateScope(Object.defineProperty({}, 'evidence', { enumerable: true, get() { calls++; return valid.evidence; } })).length);
  assert.equal(calls, 0);
  assert.deepEqual(validateScope(valid), [], 'validation accepts supplied evidence without claiming it verified real ownership or native coverage');
});
