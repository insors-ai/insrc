/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { collectGroup, reduceGroupCore, UsageReductionError } from '../reducer.js';
import { canonicalSource } from '../canonical.js';
import { finish, signed, start, scoped, stream } from './fixtures/domain-fixtures.js';
import type { LedgerRecord } from '../types.js';
const rejectsAs = (code: string) => (error: unknown) => error instanceof UsageReductionError && error.code === code;

test('truncated closure and malformed evidence never assert a complete measured total', async () => {
  const rows = [start(), finish()], complete = scoped(rows);
  const truncated = await reduceGroupCore(stream([rows[0]!]), complete);
  assert.ok(truncated.quality.includes('unavailable')); assert.ok(truncated.quality.includes('pending'));
  assert.ok(truncated.notices.includes('closure-incomplete:/evidence/expectedEventIds'));
  const malformed = await reduceGroupCore(stream(rows), { complete: true });
  assert.deepEqual(malformed.quality, ['conflict', 'unavailable']); assert.equal(malformed.knownTokens, '0');
});

test('iterator failure and cancellation reject without returning a successful partial total', async () => {
  async function* broken(): AsyncIterable<LedgerRecord> { yield start(); throw new Error('source unavailable'); }
  await assert.rejects(reduceGroupCore(broken(), scoped([start(), finish()])), rejectsAs('source-unavailable'));
  const controller = new AbortController(); let returned = 0;
  const blocked: AsyncIterable<LedgerRecord> = { [Symbol.asyncIterator]() { return { next: () => new Promise(() => {}), return: async () => { returned++; return { done: true, value: undefined }; } }; } };
  const promise = reduceGroupCore(blocked, scoped([]), { signal: controller.signal });
  controller.abort();
  await assert.rejects(promise, rejectsAs('source-unavailable')); assert.equal(returned, 1);
  const failedAtCreation: AsyncIterable<LedgerRecord> = { [Symbol.asyncIterator]() { throw new Error('cannot open source'); } };
  await assert.rejects(collectGroup(failedAtCreation), rejectsAs('source-unavailable'));
});

test('duplicate floods count every row and byte and never return truncated success', async () => {
  let returned = false, delivered = 0;
  async function* flood(): AsyncIterable<LedgerRecord> { try { for (let i = 0; i < 1025; i++) { delivered++; yield start(); } } finally { returned = true; } }
  await assert.rejects(reduceGroupCore(flood(), scoped([start()])), rejectsAs('resource-limit'));
  assert.equal(delivered, 1025); assert.equal(returned, true);
  const base = finish({ reason: 'x' });
  const count = 16384 - Buffer.byteLength(canonicalSource(base)) + 1;
  const full = signed({ ...base, observation: { ...base.observation, reason: 'x'.repeat(count) } });
  assert.equal(Buffer.byteLength(canonicalSource(full)), 16384);
  const bytes = await collectGroup(stream(Array(512).fill(full)));
  assert.equal(bytes.receivedBytes, 8 * 1024 * 1024); assert.equal(bytes.records.size, 1);
  await assert.rejects(collectGroup(stream(Array(513).fill(full))), rejectsAs('resource-limit'));
});

import {
  DefaultUsageReducer, DefaultUsageAttributionPolicy, requireEffectiveOwners,
  sourceDigest, sameSource, USAGE_SCHEMA_VERSION,
} from '../index.js';
import { binding } from './fixtures/domain-fixtures.js';

test('complete public domain surface preserves ownership basis replay and additive compatibility without sibling services', async () => {
  const reducer = new DefaultUsageReducer(), policy = new DefaultUsageAttributionPolicy();
  assert.equal(USAGE_SCHEMA_VERSION, 1);
  const rows = [start(), finish()], before = JSON.stringify(rows);
  for (const row of rows) assert.deepEqual(reducer.validate(row), []);
  assert.deepEqual(policy.validate({ activity: 'task-implement', chargedArtifactId: binding.artifactId, subjectArtifactId: binding.artifactId, taskId: binding.artifactId }), []);
  assert.ok(policy.validate({ activity: 'task-implement', chargedArtifactId: 'missing' }).length);
  const result = await reducer.reduce(stream(rows), scoped(rows));
  assert.equal(result.knownTokens, '3'); assert.deepEqual(result.basisEventIds, ['finish']);
  const owner = requireEffectiveOwners(result)[0]!;
  assert.equal(owner.state, 'resolved'); assert.equal(owner.artifactId, binding.artifactId);
  assert.deepEqual(owner.basisEventIds, result.basisEventIds);
  assert.deepEqual(await reducer.reduce(stream([...rows, ...rows].reverse()), scoped(rows)), result);
  const transported = { ...rows[1]!, sequence: 99, recordedAt: '2026-10-27T00:00:00.000Z' };
  assert.equal(sameSource(rows[1]!, transported), true); assert.equal(sourceDigest(transported), rows[1]!.payloadDigest);
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(requireEffectiveOwners(await reducer.reduce(stream([]), scoped([]))), []);
  assert.throws(() => requireEffectiveOwners({ knownTokens: '0', estimatedTokens: '0', quality: [], notices: [], basisEventIds: [] }), /effective-ownership-unavailable/);
  for (const future of [{ ...finish(), schemaVersion: 2 }, { ...finish(), recordKind: 'future.kind' }]) {
    const row = future as unknown as LedgerRecord;
    assert.match(reducer.validate(row)[0]!, /unsupported-version|unknown-kind/);
    const unsupported = await reducer.reduce(stream([row]), scoped([row]));
    assert.ok(unsupported.quality.includes('unsupported')); assert.ok(unsupported.quality.includes('unavailable'));
    assert.equal(unsupported.quality.includes('reported'), false); assert.deepEqual(unsupported.effectiveOwners, []);
  }
});

test('public reducer composes correction reconciliation cumulative and transfer accounting with qualified capability evidence', async () => {
  const api = await import('../index.js');
  const reducer = new api.DefaultUsageReducer();
  const { capability } = await import('./fixtures/domain-fixtures.js');
  const counters = { inputUncachedTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 2, reasoningTokens: 1 };
  const s = start(), f = finish({ counters });
  const corrected = signed({ ...f, eventId: 'corrected', recordKind: 'usage.corrected' as const,
    observation: { ...f.observation, counters: { ...counters, inputUncachedTokens: 20 } },
    control: { supersedesEventId: f.eventId, reason: 'fixture:replacement', provenanceEventIds: [] } });
  const destination = { ...binding, artifactId: 'TASK-0123456789abcdef-s1-t2', workItemId: 's1/t2', version: 'destination-v1' };
  const transfer = signed({ ...f, eventId: 'transfer', recordKind: 'transfer.committed' as const, callId: null, observation: null,
    control: { transferId: 'move', originalObservationRef: { rootArtifactId: binding.rootArtifactId, eventId: f.eventId, callId: f.callId },
      sourceRootId: binding.rootArtifactId, destinationRootId: binding.rootArtifactId, fromArtifactId: binding.artifactId, destinationArtifactId: destination.artifactId,
      expectedBindingVersion: binding.version, reason: 'fixture:assignment', mode: 'same-root' as const, preparedEventId: null, acceptedEventId: null } });
  const rows = [s, f, corrected, transfer], original = JSON.stringify(rows), scope = scoped(rows);
  const evidence = { ...scope, expectedBindings: [binding, destination], evidence: { ...scope.evidence, expectedBindingVersions: [binding, destination].map(({ rootArtifactId, artifactId, version }) => ({ rootArtifactId, artifactId, version })) } };
  const result = await reducer.reduce(stream(rows), evidence);
  assert.equal(result.knownTokens, '22'); assert.deepEqual(result.basisEventIds, ['corrected']);
  assert.equal(api.requireEffectiveOwners(result)[0]!.artifactId, destination.artifactId);
  assert.deepEqual(api.requireEffectiveOwners(result)[0]!.basisEventIds, ['corrected']);
  assert.deepEqual(await reducer.reduce(stream([...rows].reverse()), evidence), result);
  assert.equal(JSON.stringify(rows), original);

  const aggregate = signed({ ...s, eventId: 'aggregate-start', callId: 'aggregate', context: { ...s.context, granularity: 'invocation-total' as const } });
  const aggregateEnd = signed({ ...f, eventId: 'aggregate-end', callId: 'aggregate', observation: { ...f.observation, sourceCapabilityId: 'aggregate-cap' } });
  const overlap = [s, f, aggregate, aggregateEnd];
  const aggregateCapability = { ...capability, capabilityId: 'aggregate-cap', granularity: 'invocation-total' as const, physicalCallCoverage: 'unknown' as const };
  assert.deepEqual(api.validateSourceCapability(aggregateCapability), []);
  assert.ok(api.validateSourceCapability({ ...aggregateCapability, physicalCallCoverage: 'complete' }).length);
  const reconciliation = signed({ ...f, eventId: 'reconciliation', recordKind: 'usage.reconciled' as const, callId: null, observation: null,
    control: { group: scope.group, candidateEventIds: ['finish', 'aggregate-end'], selectedEventIds: ['aggregate-end'], excludedEventIds: ['finish'],
      previousReconciliationEventId: null, coverage: 'aggregate-fallback' as const, sourceCapabilityId: 'aggregate-cap', evidenceEventIds: [], reason: 'fixture:basis' } });
  const selected = [...overlap, reconciliation], selectedScope = scoped(selected);
  const reconciled = await reducer.reduce(stream(selected), { ...selectedScope, evidence: { ...selectedScope.evidence, sourceCapabilities: [capability, aggregateCapability] } });
  assert.equal(reconciled.knownTokens, '12'); assert.deepEqual(reconciled.basisEventIds, ['aggregate-end']);

  const frames = ['baseline', 'current'].flatMap((name, index) => [
    signed({ ...s, eventId: `${name}-start`, callId: name, context: { ...s.context, granularity: 'cumulative-snapshot' as const, nativeSessionId: 'session' } }),
    signed({ ...f, eventId: `${name}-end`, callId: name, observation: { ...f.observation, sourceCapabilityId: 'cumulative-cap',
      counters: { ...counters, inputUncachedTokens: index === 0 ? 10 : 30, outputTokens: index === 0 ? 2 : 7 },
      cumulative: { nativeSessionId: 'session', frameId: name, baselineEventId: index === 0 ? 'origin' : 'baseline-end' } } }),
  ]);
  const frameScope = scoped(frames);
  const cumulative = await reducer.reduce(stream(frames), { ...frameScope, evidence: { ...frameScope.evidence,
    referenceOnlyEventIds: ['baseline-start', 'baseline-end'], baselineEventId: 'baseline-end', selectedCurrentEventId: 'current-end',
    sourceCapabilities: [{ ...capability, capabilityId: 'cumulative-cap', granularity: 'cumulative-snapshot', physicalCallCoverage: 'unknown', baselineRequired: true }],
  } });
  assert.equal(cumulative.knownTokens, '25'); assert.deepEqual(cumulative.basisEventIds, ['current-end']);
  assert.deepEqual(api.requireEffectiveOwners(cumulative)[0]!.basisEventIds, ['current-end']);
});

test('verified empty groups differ from missing usage and conflicted calls retain explicit unresolved ownership', async () => {
  const reducer = new DefaultUsageReducer(), emptyScope = scoped([]);
  const empty = await reducer.reduce(stream([]), emptyScope);
  assert.equal(empty.knownTokens, '0'); assert.deepEqual(empty.quality, ['reported']); assert.deepEqual(empty.effectiveOwners, []);
  assert.equal(empty.notices.includes('usage-missing:/'), false);
  const missing = await reducer.reduce(stream([]), { ...emptyScope, closure: 'partial', evidence: { ...emptyScope.evidence, coverageState: 'missing' } });
  assert.ok(missing.quality.includes('missing')); assert.ok(missing.quality.includes('unavailable')); assert.equal(missing.quality.includes('reported'), false);
  const s = start(), f = finish();
  const fork = signed({ ...f, eventId: 'fork', recordKind: 'usage.corrected' as const, control: { supersedesEventId: 'finish', reason: 'fixture:fork', provenanceEventIds: [] } });
  const other = signed({ ...fork, eventId: 'other-fork' });
  const changed = signed({ ...f, observation: { ...f.observation, counters: { ...f.observation.counters, outputTokens: 99 } } });
  for (const rows of [[s, f, changed], [s, f, fork, other]]) {
    const result = await reducer.reduce(stream(rows), scoped(rows)), owner = requireEffectiveOwners(result)[0]!;
    assert.equal(owner.callId, s.callId); assert.equal(owner.state, 'conflict');
    assert.equal(owner.artifactId, null); assert.equal(owner.rootArtifactId, null); assert.equal(owner.ownerVersion, null);
    assert.deepEqual(owner.basisEventIds, []); assert.equal(result.knownTokens, '0');
    assert.deepEqual(await reducer.reduce(stream([...rows].reverse()), scoped(rows)), result);
  }
  const rows = [s, f], scope = scoped(rows);
  const unbound = await reducer.reduce(stream(rows), { ...scope, expectedBindings: [{ ...binding, version: 'new-version' }], evidence: { ...scope.evidence, expectedBindingVersions: [{ rootArtifactId: binding.rootArtifactId, artifactId: binding.artifactId, version: 'new-version' }] } });
  assert.equal(requireEffectiveOwners(unbound)[0]!.state, 'conflict'); assert.equal(requireEffectiveOwners(unbound)[0]!.artifactId, null);
});

test('public eventSetDigest directly verifies canonical set identity and bounded input rejection', async () => {
  const { eventSetDigest } = await import('../index.js');
  assert.equal(eventSetDigest(['b', 'a']), eventSetDigest(['a', 'b']));
  assert.throws(() => eventSetDigest(['a', 'a']));
  assert.notEqual(eventSetDigest([]), eventSetDigest(['a']));
  assert.throws(() => eventSetDigest(Array.from({ length: 1025 }, (_, n) => `event-${n}`)));
});

test('bad digest excludes only its disjoint call and every unresolved observed call retains an owner entry', async () => {
  const reducer = new DefaultUsageReducer();
  const s = start(), f = finish();
  const secondStart = signed({ ...s, eventId: 'second-start', callId: 'second' });
  const secondFinish = signed({ ...f, eventId: 'second-finish', callId: 'second' });
  const damaged = { ...f, payloadDigest: '0'.repeat(64) };
  const rows = [s, damaged, secondStart, secondFinish], scope = scoped(rows);
  const result = await reducer.reduce(stream(rows), scope);
  assert.equal(result.knownTokens, '3'); assert.deepEqual(result.basisEventIds, ['second-finish']);
  assert.equal(requireEffectiveOwners(result).find(owner => owner.callId === 'call')!.state, 'conflict');
  assert.equal(requireEffectiveOwners(result).find(owner => owner.callId === 'second')!.state, 'resolved');
  assert.ok(result.quality.includes('conflict'));
  assert.deepEqual(await reducer.reduce(stream([...rows].reverse()), scope), result);
  const unknownSource = signed({ ...f, observation: { ...f.observation, sourceCapabilityId: 'missing-capability' } });
  const unavailable = signed({ ...f, observation: { ...f.observation, quality: 'unavailable' as const,
    counters: { inputUncachedTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null }, reason: 'fixture:no-counters' } });
  const conflictingModelStart = signed({ ...s, context: { ...s.context, reportedModel: 'model-a' } });
  const conflictingModelEnd = signed({ ...f, observation: { ...f.observation, reportedModel: 'model-b' } });
  for (const observed of [[s, unknownSource], [s, unavailable], [conflictingModelStart, conflictingModelEnd], [s, f, signed({ ...secondStart, context: { ...secondStart.context, granularity: 'invocation-total' as const } }), secondFinish]]) {
    const unresolved = await reducer.reduce(stream(observed), scoped(observed));
    const owners = requireEffectiveOwners(unresolved);
    assert.equal(owners.length, observed.length === 4 ? 2 : 1);
    assert.ok(owners.every(owner => owner.state === 'conflict' || owner.state === 'unavailable'));
    assert.ok(owners.every(owner => owner.artifactId === null && owner.ownerVersion === null));
  }
});

test('reference flags cannot hide an ordinary call or masquerade as a cumulative baseline', async () => {
  const reducer = new DefaultUsageReducer(), rows = [start(), finish()], scope = scoped(rows);
  for (const referenceOnlyEventIds of [['start'], ['finish'], ['start', 'finish']]) {
    const result = await reducer.reduce(stream(rows), { ...scope, evidence: { ...scope.evidence, referenceOnlyEventIds } });
    assert.ok(result.quality.includes('conflict')); assert.ok(result.quality.includes('unavailable'));
    assert.ok(result.notices.some(notice => notice.startsWith('reference-role-invalid:')));
    assert.equal(result.quality.includes('reported'), false);
  }
  const ordinary = signed({ ...finish(), eventId: 'fake-baseline', callId: 'prior' });
  const priorStart = signed({ ...start(), eventId: 'prior-start', callId: 'prior' });
  const forgedRows = [...rows, priorStart, ordinary], forged = scoped(forgedRows);
  const result = await reducer.reduce(stream(forgedRows), { ...forged, evidence: { ...forged.evidence,
    baselineEventId: 'fake-baseline', selectedCurrentEventId: 'finish', referenceOnlyEventIds: ['prior-start', 'fake-baseline'] } });
  assert.ok(result.quality.includes('unavailable')); assert.equal(result.quality.includes('reported'), false);
});

test('record and scope binding validation reject unrelated epic and standalone-story membership', async () => {
  const reducer = new DefaultUsageReducer(), { validateScope } = await import('../index.js');
  for (const rootArtifactId of ['EPIC-fedcba9876543210', 'STORY-0123456789abcdef-s2']) {
    const badBinding = { ...binding, rootArtifactId };
    const captured = signed({ ...start(), rootArtifactId, context: { ...start().context, binding: badBinding } });
    assert.ok(reducer.validate(captured).some(notice => notice.startsWith('binding-invalid:')));
    const scope = scoped([captured]);
    const badScope = { ...scope, expectedBindings: [badBinding], evidence: { ...scope.evidence,
      rootWatermarkRefs: [{ rootArtifactId, watermarkId: 'fixture' }], expectedBindingVersions: [{ rootArtifactId, artifactId: binding.artifactId, version: binding.version }] } };
    assert.ok(validateScope(badScope).some(notice => notice.startsWith('binding-invalid:')));
    const result = await reducer.reduce(stream([captured]), badScope);
    assert.ok(result.quality.includes('conflict')); assert.deepEqual(result.effectiveOwners, []);
  }
});

test('cross-call model slices reject mixed qualification and conflicting models while labeling requested-only totals', async () => {
  const reducer = new DefaultUsageReducer();
  const pair = (id: string, actual: string | null, requested = 'requested'): LedgerRecord[] => [
    signed({ ...start(), eventId: `${id}-start`, callId: id, context: { ...start().context, reportedModel: actual, requestedModel: requested } }),
    signed({ ...finish(), eventId: `${id}-end`, callId: id, observation: { ...finish().observation, reportedModel: actual } }),
  ];
  for (const rows of [
    [...pair('a', null), ...pair('b', 'model-b')],
    [...pair('a', 'model-a'), ...pair('b', 'model-b')],
    [...pair('a', null), ...pair('b', null, 'different-requested')],
  ]) {
    const result = await reducer.reduce(stream(rows), scoped(rows));
    assert.equal(result.knownTokens, '0'); assert.ok(result.quality.includes('conflict'));
    assert.ok(result.notices.includes('model-slice-conflict:/'));
    assert.equal(requireEffectiveOwners(result).length, 2);
    assert.ok(requireEffectiveOwners(result).every(owner => owner.state === 'conflict' && owner.artifactId === null));
    assert.deepEqual(await reducer.reduce(stream([...rows].reverse()), scoped(rows)), result);
  }
  for (const actual of [null, 'model-a']) {
    const rows = [...pair('a', actual), ...pair('b', actual)], result = await reducer.reduce(stream(rows), scoped(rows));
    assert.equal(result.knownTokens, '6');
    assert.equal(result.notices.includes('model-requested-only:slice'), actual === null);
  }
});
