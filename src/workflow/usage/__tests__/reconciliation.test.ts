/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { DefaultUsageReducer } from '../index.js';
const reduceGroupCore = new DefaultUsageReducer().reduce;
import { capability, finish, scope, scoped, signed, start, stream } from './fixtures/domain-fixtures.js';
import type { LedgerRecord, RequestFinished, RequestStarted, UsageCorrected, UsageReconciled, ObservationGranularity } from '../types.js';

const zero = { inputUncachedTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
function pair(callId: string, amount: number, granularity: ObservationGranularity = 'model-call'): [RequestStarted, RequestFinished] {
  return [signed({ ...start(), eventId: `${callId}-start`, callId, context: { ...start().context, granularity } }),
    signed({ ...finish(), eventId: `${callId}-end`, callId, observation: { ...finish().observation, sourceCapabilityId: granularity === 'model-call' ? 'fixture' : 'aggregate-cap', counters: { ...zero, inputUncachedTokens: amount } } })];
}
function correction(prior: RequestFinished | UsageCorrected, eventId: string, amount: number): UsageCorrected {
  return signed({ ...prior, recordKind: 'usage.corrected', eventId, observation: { ...prior.observation, counters: { ...zero, inputUncachedTokens: amount } }, control: { supersedesEventId: prior.eventId, reason: 'fixture:replacement', provenanceEventIds: [] } });
}
function reconcile(candidates: readonly string[], selected: readonly string[], coverage: 'aggregate-fallback' | 'complete-leaf', eventId = 'reconcile', previous: string | null = null): UsageReconciled {
  return signed({ ...finish(), eventId, recordKind: 'usage.reconciled', callId: null, observation: null, control: {
    group: scope().group, candidateEventIds: candidates, selectedEventIds: selected, excludedEventIds: candidates.filter(id => !selected.includes(id)), previousReconciliationEventId: previous,
    coverage, sourceCapabilityId: coverage === 'aggregate-fallback' ? 'aggregate-cap' : 'fixture', evidenceEventIds: coverage === 'complete-leaf' ? ['a-start', 'b-start'] : [], reason: 'fixture:explicit-basis',
  } });
}
function evidence(rows: readonly LedgerRecord[]) {
  const value = scoped(rows);
  return { ...value, evidence: { ...value.evidence, sourceCapabilities: [capability, { ...capability, capabilityId: 'aggregate-cap', granularity: 'invocation-total' as const, physicalCallCoverage: 'unknown' as const }] } };
}

test('replacement correction heads are deterministic and missing forked cyclic or cross-call references stay unresolved', async () => {
  const [s, f] = pair('call', 100), first = correction(f, 'correction-1', 7), last = correction(first, 'correction-2', 9);
  const rows = [s, f, first, last], expected = await reduceGroupCore(stream(rows), evidence(rows));
  assert.equal(expected.knownTokens, '9'); assert.deepEqual(expected.basisEventIds, ['correction-2']);
  assert.deepEqual(await reduceGroupCore(stream([last, first, f, s, last]), evidence(rows)), expected);
  const fork = correction(f, 'fork', 8);
  const missing = signed({ ...first, control: { ...first.control, supersedesEventId: 'absent' } });
  const cycleA = signed({ ...first, control: { ...first.control, supersedesEventId: last.eventId } });
  const [otherStart, otherEnd] = pair('other', 3);
  const cross = signed({ ...first, control: { ...first.control, supersedesEventId: otherEnd.eventId } });
  for (const broken of [[s, f, first, fork], [s, f, missing], [s, f, cycleA, last], [s, f, otherStart, otherEnd, cross], [f, first]]) {
    const result = await reduceGroupCore(stream(broken), evidence(broken));
    assert.equal(result.knownTokens, '0'); assert.ok(result.quality.includes('conflict') || result.quality.includes('unavailable'));
  }
  assert.equal(f.observation.counters.inputUncachedTokens, 100, 'original observation retained');
  const known = signed({ ...f, observation: { ...f.observation, reportedModel: 'model-a' } });
  const cleared = signed({ ...correction(known, 'cleared', 4), observation: { ...known.observation, reportedModel: null } });
  const moved = signed({ ...correction(cleared, 'moved', 5), observation: { ...cleared.observation, reportedModel: 'model-b' }, control: { supersedesEventId: cleared.eventId, reason: 'fixture:change', provenanceEventIds: [s.eventId] } });
  const modelChange = [s, known, cleared, moved];
  assert.equal((await reduceGroupCore(stream(modelChange), evidence(modelChange))).knownTokens, '0', 'an intermediate unknown model cannot hide a cross-model correction');
});

test('aggregate fallback and qualified complete-leaf basis never add overlapping observations', async () => {
  const aggregate = pair('aggregate', 100, 'invocation-total'), a = pair('a', 30), b = pair('b', 40);
  const rows = [...aggregate, ...a, ...b], ids = ['aggregate-end', 'a-end', 'b-end'];
  const unresolved = await reduceGroupCore(stream(rows), evidence(rows));
  assert.equal(unresolved.knownTokens, '0'); assert.ok(unresolved.notices.includes('overlap-unresolved:/'));
  const fallback = [...rows, reconcile(ids, ['aggregate-end'], 'aggregate-fallback')];
  const fallbackResult = await reduceGroupCore(stream(fallback), evidence(fallback));
  assert.equal(fallbackResult.knownTokens, '100'); assert.deepEqual(fallbackResult.basisEventIds, ['aggregate-end']);
  const decomposed = [...rows, reconcile(ids, ['a-end', 'b-end'], 'complete-leaf')];
  const leafResult = await reduceGroupCore(stream(decomposed), evidence(decomposed));
  assert.equal(leafResult.knownTokens, '0'); assert.deepEqual(leafResult.basisEventIds, []);
  assert.ok(leafResult.quality.includes('unavailable'));
  assert.ok(leafResult.notices.includes('native-coverage-unverified:reconcile'));
  assert.deepEqual(await reduceGroupCore(stream([...decomposed].reverse()), evidence(decomposed)), leafResult);
  const successor = reconcile(ids, ['aggregate-end'], 'aggregate-fallback', 'fallback-successor', 'reconcile');
  const restored = [...decomposed, successor];
  const restoredResult = await reduceGroupCore(stream(restored), evidence(restored));
  assert.equal(restoredResult.knownTokens, '100'); assert.deepEqual(restoredResult.basisEventIds, ['aggregate-end']);
  assert.equal(restoredResult.notices.some(notice => notice.startsWith('native-coverage-unverified:')), false);
  const conflictingControl = reconcile(ids, ['a-end', 'b-end'], 'complete-leaf');
  const ambiguous = [...fallback, conflictingControl];
  const conflict = await reduceGroupCore(stream(ambiguous), evidence(ambiguous));
  assert.equal(conflict.knownTokens, '0'); assert.ok(conflict.quality.includes('conflict'));
  assert.deepEqual(await reduceGroupCore(stream([...ambiguous].reverse()), evidence(ambiguous)), conflict, 'conflicting control IDs never choose an arrival-order winner');
  const conflictingKind = signed({ ...reconcile(['a-end', 'b-end'], ['a-end', 'b-end'], 'complete-leaf'), eventId: 'a-end' });
  const mixedKinds = [...a, ...b, conflictingKind];
  const mixedResult = await reduceGroupCore(stream(mixedKinds), evidence(mixedKinds));
  assert.equal(mixedResult.knownTokens, '0');
  assert.deepEqual(await reduceGroupCore(stream([...mixedKinds].reverse()), evidence(mixedKinds)), mixedResult, 'conflicting record kinds are equally unusable in every order');
  const crossKind = signed({ ...correction(b[1], 'a-end', 4), callId: 'a', control: { supersedesEventId: 'b-end', reason: 'fixture:ambiguous-kind', provenanceEventIds: [] } });
  const mixedObservationKinds = [...a, ...b, crossKind];
  assert.deepEqual(await reduceGroupCore(stream(mixedObservationKinds), evidence(mixedObservationKinds)), await reduceGroupCore(stream([...mixedObservationKinds].reverse()), evidence(mixedObservationKinds)));
  assert.equal('physicalCallCount' in leafResult, false);
  const partial = evidence(decomposed);
  const partialResult = await reduceGroupCore(stream(decomposed), { ...partial, evidence: { ...partial.evidence, sourceCapabilities: partial.evidence.sourceCapabilities.map(item => item.capabilityId === 'fixture' ? { ...item, physicalCallCoverage: 'partial' } : item) } });
  assert.equal(partialResult.knownTokens, '0'); assert.ok(partialResult.quality.includes('conflict'));
  const pending = [...decomposed, pair('pending', 5)[0]];
  assert.equal((await reduceGroupCore(stream(pending), evidence(pending))).knownTokens, '0', 'a pending physical leaf prevents complete-leaf coverage');
  const selectedOverlap = reconcile(ids, ['aggregate-end'], 'aggregate-fallback');
  const bad = signed({ ...selectedOverlap, control: { ...selectedOverlap.control, excludedEventIds: ids } });
  assert.equal((await reduceGroupCore(stream([...rows, bad]), evidence([...rows, bad]))).knownTokens, '0');
});

test('new candidates and stale corrected heads invalidate reconciliation until an explicit successor names current heads', async () => {
  const rows = [...pair('aggregate', 100, 'invocation-total'), ...pair('a', 30), ...pair('b', 40)];
  const ids = ['aggregate-end', 'a-end', 'b-end'], old = reconcile(ids, ['aggregate-end'], 'aggregate-fallback');
  const extra = [...pair('c', 10)], expanded = [...rows, old, ...extra];
  assert.equal((await reduceGroupCore(stream(expanded), evidence(expanded))).knownTokens, '0');
  const successor = reconcile([...ids, 'c-end'], ['aggregate-end'], 'aggregate-fallback', 'new-reconcile', old.eventId);
  const updated = [...expanded, successor];
  assert.equal((await reduceGroupCore(stream(updated), evidence(updated))).knownTokens, '100');
  const a = rows.find(row => row.eventId === 'a-end') as RequestFinished;
  const corrected = correction(a, 'corrected-a', 35), stale = [...rows, old, corrected];
  assert.equal((await reduceGroupCore(stream(stale), evidence(stale))).knownTokens, '0');
  const replacement = reconcile(['aggregate-end', 'corrected-a', 'b-end'], ['aggregate-end'], 'aggregate-fallback', 'replacement', old.eventId);
  const replaced = [...stale, replacement];
  assert.equal((await reduceGroupCore(stream(replaced), evidence(replaced))).knownTokens, '100');
  const fork = reconcile(['aggregate-end', 'corrected-a', 'b-end'], ['aggregate-end'], 'aggregate-fallback', 'fork', old.eventId);
  assert.equal((await reduceGroupCore(stream([...replaced, fork]), evidence([...replaced, fork]))).knownTokens, '0');
  const wrongGroup = signed({ ...old, control: { ...old.control, group: { ...old.control.group, modelSliceId: 'different' } } });
  assert.equal((await reduceGroupCore(stream([...rows, wrongGroup]), evidence([...rows, wrongGroup]))).knownTokens, '0');
  const missingPrevious = signed({ ...old, control: { ...old.control, previousReconciliationEventId: 'missing' } });
  assert.equal((await reduceGroupCore(stream([...rows, missingPrevious]), evidence([...rows, missingPrevious]))).knownTokens, '0');
});
