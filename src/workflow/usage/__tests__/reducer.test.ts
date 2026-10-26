/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { collectGroup, reduceGroupCore } from '../reducer.js';
import { finish, start, signed, scoped, stream } from './fixtures/domain-fixtures.js';
import type { RequestFinished, RequestStarted } from '../types.js';
const zero = { inputUncachedTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
function call(number: number): [RequestStarted, RequestFinished] {
  return [signed({ ...start(), eventId: `start-${number}`, callId: `call-${number}` }), signed({ ...finish({ counters: zero }), eventId: `finish-${number}`, callId: `call-${number}` })];
}

test('bounded reduction deduplicates delivery while counting all input work and exact bigint metrics', async () => {
  const [a, b] = call(1), [c, d] = call(2);
  const max = Number.MAX_SAFE_INTEGER;
  const one = signed({ ...b, observation: { ...b.observation, counters: { inputUncachedTokens: max, cacheReadTokens: 5, cacheWriteTokens: 7, outputTokens: max, reasoningTokens: max } } });
  const two = signed({ ...d, observation: { ...d.observation, counters: { ...zero, inputUncachedTokens: max } } });
  const rows = [a, one, c, two], evidence = scoped(rows);
  const result = await reduceGroupCore(stream([...rows, ...rows]), evidence);
  assert.equal(result.knownTokens, (BigInt(max) * 3n + 12n).toString());
  assert.equal(result.estimatedTokens, '0');
  assert.deepEqual(result.quality, ['reported']);
  assert.deepEqual(result.basisEventIds, ['finish-1', 'finish-2']);
  assert.deepEqual(await reduceGroupCore(stream([...rows].reverse()), evidence), result);
  const copied = await collectGroup(stream([...rows, ...rows]));
  assert.equal(copied.receivedRows, 8); assert.equal(copied.records.size, 4);
  const single = await collectGroup(stream(rows));
  assert.equal(copied.receivedBytes, single.receivedBytes * 2);
  const reasoning = await reduceGroupCore(stream(rows), { ...evidence, metric: 'reasoningTokens' });
  assert.equal(reasoning.knownTokens, String(max), 'reasoning is a separate subset, not added to processed');
});

test('known zero, partial counters, estimates, pending, interrupted, unavailable and missing remain distinct', async () => {
  const [s, f] = call(1);
  const knownZero = await reduceGroupCore(stream([s, f]), scoped([s, f]));
  assert.equal(knownZero.knownTokens, '0'); assert.deepEqual(knownZero.quality, ['reported']);
  const partial = signed({ ...f, observation: { ...finish().observation } });
  const partialResult = await reduceGroupCore(stream([s, partial]), scoped([s, partial]));
  assert.equal(partialResult.knownTokens, '3'); assert.deepEqual(partialResult.quality, ['reported', 'unavailable']);
  const estimated = signed({ ...partial, observation: { ...partial.observation, quality: 'estimated', reason: 'fixture:estimation-evidence' } });
  const estimateResult = await reduceGroupCore(stream([s, estimated]), scoped([s, estimated]));
  assert.equal(estimateResult.knownTokens, '0'); assert.equal(estimateResult.estimatedTokens, '3');
  assert.deepEqual(estimateResult.quality, ['estimated', 'unavailable']);
  const pending = await reduceGroupCore(stream([s]), scoped([s]));
  assert.equal(pending.knownTokens, '0'); assert.deepEqual(pending.quality, ['pending']);
  for (const outcome of ['error', 'timeout', 'cancelled', 'interrupted'] as const) {
    const consumed = signed({ ...partial, observation: { ...partial.observation, outcome } });
    const result = await reduceGroupCore(stream([s, consumed]), scoped([s, consumed]));
    assert.equal(result.knownTokens, '3'); assert.ok(result.notices.includes(`${outcome}:finish-1`));
  }
  const unknown = signed({ ...partial, observation: { ...partial.observation, quality: 'unavailable', reason: 'missing provider metrics', counters: { inputUncachedTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null } } });
  assert.deepEqual((await reduceGroupCore(stream([s, unknown]), scoped([s, unknown]))).quality, ['unavailable']);
  for (const coverageState of ['legacy', 'missing', 'unsupported'] as const) {
    const e = scoped([]);
    const result = await reduceGroupCore(stream([]), { ...e, closure: 'partial', evidence: { ...e.evidence, coverageState } });
    assert.equal(result.knownTokens, '0'); assert.ok(result.quality.includes(coverageState)); assert.ok(result.quality.includes('unavailable')); assert.ok(!result.quality.includes('reported'));
  }
});

test('event and call identity conflicts cannot produce a trusted contribution or mutate input', async () => {
  const [s, f] = call(1);
  const changed = signed({ ...f, observation: { ...f.observation, counters: { ...zero, outputTokens: 9 } } });
  const identity = await reduceGroupCore(stream([s, f, changed]), scoped([s, f]));
  assert.equal(identity.knownTokens, '0'); assert.ok(identity.quality.includes('conflict'));
  const secondStart = signed({ ...s, eventId: 'second-start', context: { ...s.context, modelSliceId: 'different' } });
  const rows = [s, secondStart, f];
  const conflict = await reduceGroupCore(stream(rows), scoped(rows));
  assert.equal(conflict.knownTokens, '0'); assert.ok(conflict.quality.includes('conflict'));
  const secondFinish = signed({ ...f, eventId: 'second-finish' });
  assert.ok((await reduceGroupCore(stream([s, f, secondFinish]), scoped([s, f, secondFinish]))).quality.includes('conflict'));
  const before = JSON.stringify([s, f]);
  function freeze(value: unknown): void { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } }
  freeze(s); freeze(f);
  await reduceGroupCore(stream([f, s]), scoped([s, f]));
  assert.equal(JSON.stringify([s, f]), before);
  assert.equal('effectiveOwners' in identity, false, 'unpublished t6 core does not claim completed ownership composition');
});
