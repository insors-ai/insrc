/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { collectGroup } from '../reducer.js';
import { DefaultUsageReducer } from '../index.js';
const reduceGroupCore = new DefaultUsageReducer().reduce;
import { finish, start, signed, scoped, stream } from './fixtures/domain-fixtures.js';
import type { AccountingScope, LedgerRecord, RequestFinished, RequestStarted } from '../types.js';
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
  assert.deepEqual(identity.effectiveOwners, [], 'new results explicitly expose no selected contribution under a conflicting identity');
});

function cumulativeFrame(name: string, input: number, output: number, invocationId = 'invocation'): [RequestStarted, RequestFinished] {
  const [s, f] = call(100);
  return [signed({ ...s, eventId: `${name}-start`, callId: name, context: { ...s.context, invocationId, granularity: 'cumulative-snapshot', nativeSessionId: 'native-session' } }),
    signed({ ...f, eventId: `${name}-end`, callId: name, observation: { ...f.observation,
      sourceCapabilityId: 'cumulative-cap', counters: { ...zero, inputUncachedTokens: input, outputTokens: output, reasoningTokens: Math.floor(output / 2) },
      cumulative: { nativeSessionId: 'native-session', baselineEventId: name === 'baseline' ? 'origin-frame' : 'baseline-end', frameId: `frame-${name}` } } })];
}
function intervalScope(rows: readonly LedgerRecord[], referenceOnlyEventIds: string[] = ['baseline-start', 'baseline-end']): AccountingScope {
  const value = scoped(rows), original = value.evidence.sourceCapabilities[0]!;
  return { ...value, evidence: { ...value.evidence, referenceOnlyEventIds,
    selectedCurrentEventId: 'current-end', baselineEventId: 'baseline-end',
    sourceCapabilities: [{ ...original, capabilityId: 'cumulative-cap', granularity: 'cumulative-snapshot', physicalCallCoverage: 'unknown', baselineRequired: true }],
  } };
}

test('cumulative selected intervals exclude baselines and intermediate frames including prior-invocation references', async () => {
  const baseline = cumulativeFrame('baseline', 10, 5, 'prior-invocation'), middle = cumulativeFrame('middle', 20, 7), current = cumulativeFrame('current', 30, 10);
  const rows = [...baseline, ...middle, ...current], evidence = intervalScope(rows, ['baseline-start', 'baseline-end', 'middle-start', 'middle-end']);
  const result = await reduceGroupCore(stream(rows), evidence);
  assert.equal(result.knownTokens, '25'); assert.deepEqual(result.basisEventIds, ['current-end']); assert.deepEqual(result.quality, ['reported']);
  assert.deepEqual(await reduceGroupCore(stream([...rows].reverse()), evidence), result);
  assert.equal((await reduceGroupCore(stream(rows), { ...evidence, metric: 'reasoningTokens' })).knownTokens, '3');
  const noBaseline = await reduceGroupCore(stream([...middle, ...current]), evidence);
  assert.equal(noBaseline.knownTokens, '0'); assert.ok(noBaseline.quality.includes('unavailable'));
  assert.equal((await reduceGroupCore(stream([...baseline, ...current]), evidence)).knownTokens, '0', 'a missing declared intermediate cannot hide reset or correction evidence');
  const undeclared = intervalScope(rows, ['baseline-end', 'middle-start', 'middle-end']);
  assert.equal((await reduceGroupCore(stream(rows), undeclared)).knownTokens, '0', 'cross-invocation start must be explicitly reference-only too');
});

test('cumulative common-baseline endpoints require reconciliation and never add overlapping deltas', async () => {
  const baseline = cumulativeFrame('baseline', 10, 5, 'prior-invocation'), middle = cumulativeFrame('middle', 20, 7), current = cumulativeFrame('current', 30, 10);
  const rows = [...baseline, ...middle, ...current], evidence = intervalScope(rows);
  const overlapping = await reduceGroupCore(stream(rows), evidence);
  assert.equal(overlapping.knownTokens, '0'); assert.ok(overlapping.notices.includes('overlap-unresolved:/'));
  const reconciliation = signed({ ...finish(), recordKind: 'usage.reconciled' as const, eventId: 'cumulative-basis', callId: null, observation: null,
    control: { group: evidence.group, candidateEventIds: ['middle-end', 'current-end'], selectedEventIds: ['current-end'], excludedEventIds: ['middle-end'], previousReconciliationEventId: null, coverage: 'aggregate-fallback' as const, sourceCapabilityId: 'cumulative-cap', evidenceEventIds: ['baseline-end'], reason: 'fixture:select-one-interval' },
  });
  const selected = [...rows, reconciliation], scopedInterval = intervalScope(selected);
  assert.equal((await reduceGroupCore(stream(selected), scopedInterval)).knownTokens, '25');
  const oldEndpoint = signed({ ...reconciliation, control: { ...reconciliation.control, selectedEventIds: ['middle-end'], excludedEventIds: ['current-end'] } });
  const older = [...rows, oldEndpoint], olderScope = intervalScope(older);
  const oldResult = await reduceGroupCore(stream(older), { ...olderScope, evidence: { ...olderScope.evidence, selectedCurrentEventId: 'middle-end' } });
  assert.equal(oldResult.knownTokens, '12', 'explicit basis, not latest timestamp, selects the interval');
});

test('cumulative resets unknown buckets unqualified sessions and model mismatches never fabricate measured deltas', async () => {
  const baseline = cumulativeFrame('baseline', 10, 5, 'prior-invocation'), current = cumulativeFrame('current', 30, 10);
  const rows = [...baseline, ...current];
  const changedSession = signed({ ...baseline[0], context: { ...baseline[0].context, nativeSessionId: 'different-session' } });
  const changedModel = signed({ ...baseline[0], context: { ...baseline[0].context, modelSliceId: 'different-model' } });
  const reset = signed({ ...current[1], observation: { ...current[1].observation, counters: { ...zero, inputUncachedTokens: 3, outputTokens: 10 } } });
  const differentNativeSession = signed({ ...baseline[1], observation: { ...baseline[1].observation, cumulative: { ...baseline[1].observation.cumulative!, nativeSessionId: 'different-session' } } });
  for (const invalidRows of [[changedSession, baseline[1], ...current], [changedModel, baseline[1], ...current], [baseline[0], differentNativeSession, ...current], [...baseline, current[0], reset]]) {
    const result = await reduceGroupCore(stream(invalidRows), intervalScope(invalidRows));
    assert.equal(result.knownTokens, '0'); assert.ok(result.quality.includes('unavailable'));
  }
  const unknownBaseline = signed({ ...baseline[1], observation: { ...baseline[1].observation, counters: { ...baseline[1].observation.counters, cacheReadTokens: null } } });
  const unknownRows = [baseline[0], unknownBaseline, ...current], unknownScope = intervalScope(unknownRows);
  const partial = await reduceGroupCore(stream(unknownRows), unknownScope);
  assert.equal(partial.knownTokens, '25'); assert.deepEqual(partial.quality, ['reported', 'unavailable']);
  const unknownMetric = await reduceGroupCore(stream(unknownRows), { ...unknownScope, metric: 'cacheReadTokens' });
  assert.equal(unknownMetric.knownTokens, '0'); assert.deepEqual(unknownMetric.quality, ['unavailable']);
  const unqualified = intervalScope(rows);
  assert.equal((await reduceGroupCore(stream(rows), { ...unqualified, evidence: { ...unqualified.evidence, sourceCapabilities: unqualified.evidence.sourceCapabilities.map(item => ({ ...item, qualification: 'unqualified', version: null, sourceRevision: null, evidenceRefs: [] })) } })).knownTokens, '0');
  const estimatedBaseline = signed({ ...baseline[1], observation: { ...baseline[1].observation, quality: 'estimated' as const, reason: 'fixture:estimated-baseline' } });
  const estimatedRows = [baseline[0], estimatedBaseline, ...current];
  const estimate = await reduceGroupCore(stream(estimatedRows), intervalScope(estimatedRows));
  assert.equal(estimate.knownTokens, '0'); assert.equal(estimate.estimatedTokens, '25'); assert.deepEqual(estimate.quality, ['estimated']);
  const middle = cumulativeFrame('middle', 90, 7), interrupted = [...baseline, ...middle, ...current];
  assert.equal((await reduceGroupCore(stream(interrupted), intervalScope(interrupted, ['baseline-start', 'baseline-end', 'middle-start', 'middle-end']))).knownTokens, '0', 'intermediate counter reset evidence invalidates the selected interval');
});
