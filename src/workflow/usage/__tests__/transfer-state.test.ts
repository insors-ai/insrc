/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { DefaultUsageReducer } from '../index.js';
const reduceGroupCore = new DefaultUsageReducer().reduce;
import { requireEffectiveOwners } from '../ownership.js';
import { binding, finish, scoped, signed, start, stream } from './fixtures/domain-fixtures.js';
import type { AccountingScope, LedgerRecord, TransferIdentity, UsageBinding } from '../types.js';

type TransferRecord = Extract<LedgerRecord, { recordKind: 'transfer.prepared' | 'transfer.accepted' | 'transfer.committed' }>;
const same: UsageBinding = { ...binding, artifactId: 'TASK-0123456789abcdef-s1-t2', workItemId: 's1/t2', version: 'same-membership-v1', provenance: 'workflow-reservation' };
const cross: UsageBinding = { ...binding, rootArtifactId: 'EPIC-fedcba9876543210', artifactId: 'TASK-fedcba9876543210-s2-t1', workItemId: 's2/t1', version: 'cross-membership-v1', provenance: 'workflow-reservation' };
const third: UsageBinding = { ...binding, rootArtifactId: 'EPIC-aabbccddeeff0011', artifactId: 'TASK-aabbccddeeff0011-s3-t1', workItemId: 's3/t1', version: 'third-membership-v1', provenance: 'workflow-reservation' };
function identity(transferId: string, source: UsageBinding, destination: UsageBinding, version = source.version): TransferIdentity {
  return { transferId, originalObservationRef: { rootArtifactId: binding.rootArtifactId, eventId: 'finish', callId: 'call' }, sourceRootId: source.rootArtifactId, destinationRootId: destination.rootArtifactId, fromArtifactId: source.artifactId, destinationArtifactId: destination.artifactId, expectedBindingVersion: version, reason: 'fixture:correct-charged-subject' };
}
function phase(recordKind: TransferRecord['recordKind'], eventId: string, value: TransferIdentity, preparedEventId: string | null = null, acceptedEventId: string | null = null): TransferRecord {
  const accepted = recordKind === 'transfer.accepted';
  return signed({ ...finish(), recordKind, eventId, callId: null, observation: null,
    rootArtifactId: accepted ? value.destinationRootId : value.sourceRootId, artifactId: accepted ? value.destinationArtifactId : value.fromArtifactId,
    control: { ...value, mode: value.sourceRootId === value.destinationRootId ? 'same-root' : 'cross-root', preparedEventId, acceptedEventId },
  } as TransferRecord);
}
function base(): LedgerRecord[] { return [start(), finish({ counters: { inputUncachedTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 2, reasoningTokens: 1 } })]; }
function evidence(rows: readonly LedgerRecord[], expectedBindings: readonly UsageBinding[] = [binding, same, cross, third]): AccountingScope {
  const original = scoped(rows);
  return { ...original, expectedBindings, evidence: { ...original.evidence,
    rootWatermarkRefs: [...new Set(expectedBindings.map(item => item.rootArtifactId))].map(rootArtifactId => ({ rootArtifactId, watermarkId: `watermark:${rootArtifactId}` })),
    expectedBindingVersions: expectedBindings.map(({ rootArtifactId, artifactId, version }) => ({ rootArtifactId, artifactId, version })),
  } };
}

test('same-root single commitment changes effective artifact once and preserves immutable capture provenance', async () => {
  const original = base(), commit = phase('transfer.committed', 'same-commit', identity('same-transfer', binding, same));
  const rows = [...original, commit], before = JSON.stringify(rows);
  const result = await reduceGroupCore(stream(rows), evidence(rows));
  assert.equal(result.knownTokens, '12'); assert.deepEqual(result.basisEventIds, ['finish']);
  assert.equal(result.effectiveOwners?.length, 1);
  const owner = result.effectiveOwners![0]!;
  assert.equal(owner.state, 'resolved'); assert.equal(owner.rootArtifactId, binding.rootArtifactId); assert.equal(owner.artifactId, same.artifactId); assert.equal(owner.ownerVersion, 'same-commit');
  assert.equal(owner.captureRootArtifactId, binding.rootArtifactId); assert.equal(owner.captureArtifactId, binding.artifactId);
  assert.deepEqual(owner.basisEventIds, ['finish']); assert.deepEqual(owner.provenanceEventIds, ['start', 'finish', 'same-commit']);
  assert.deepEqual(await reduceGroupCore(stream([...rows, ...rows].reverse()), evidence(rows)), result);
  assert.equal(JSON.stringify(rows), before);
  const alias = signed({ ...commit, eventId: 'same-commit-alias' });
  const aliases = [...rows, alias], duplicate = await reduceGroupCore(stream(aliases), evidence(aliases));
  assert.equal(duplicate.knownTokens, '12'); assert.equal(duplicate.effectiveOwners![0]!.ownerVersion, 'same-commit'); assert.equal(duplicate.effectiveOwners![0]!.artifactId, same.artifactId);
  assert.equal(original.length, 2, 'no destination observation is created');
  const bound = signed({ ...finish(), eventId: 'destination-binding', recordKind: 'artifact.bound' as const, artifactId: same.artifactId, callId: null, observation: null,
    control: { binding: same, expectedPreviousVersion: null, reason: 'fixture:membership', authorityEvidenceId: 'fixture:workflow-authority' } });
  const withBinding = [...rows, bound], traced = (await reduceGroupCore(stream(withBinding), evidence(withBinding))).effectiveOwners![0]!;
  assert.ok(traced.provenanceEventIds.includes('destination-binding'));
  assert.ok(traced.provenanceEventIds.indexOf('destination-binding') < traced.provenanceEventIds.indexOf('same-commit'));
  const corrected = signed({ ...finish(), eventId: 'corrected-finish', recordKind: 'usage.corrected' as const,
    observation: { ...finish().observation, counters: { inputUncachedTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 2, reasoningTokens: 1 } },
    control: { supersedesEventId: 'finish', reason: 'fixture:replace-counters', provenanceEventIds: [] } });
  const correctedRows = [...rows, corrected], correctedResult = await reduceGroupCore(stream(correctedRows), evidence(correctedRows));
  assert.equal(correctedResult.knownTokens, '22'); assert.deepEqual(correctedResult.effectiveOwners![0]!.basisEventIds, ['corrected-finish']);
  assert.equal(correctedResult.effectiveOwners![0]!.artifactId, same.artifactId);
});

test('cross-root commitment requires matching phases and complete ownership proof; pending retains committed owner', async () => {
  const value = identity('cross-transfer', binding, cross), prepared = phase('transfer.prepared', 'prepare', value), accepted = phase('transfer.accepted', 'accept', value, 'prepare'), committed = phase('transfer.committed', 'commit', value, 'prepare', 'accept');
  for (const phases of [[prepared], [prepared, accepted]]) {
    const rows = [...base(), ...phases], result = await reduceGroupCore(stream(rows), evidence(rows)), owner = result.effectiveOwners![0]!;
    assert.equal(result.knownTokens, '12'); assert.equal(owner.state, 'pending'); assert.equal(owner.rootArtifactId, binding.rootArtifactId); assert.equal(owner.artifactId, binding.artifactId); assert.equal(owner.ownerVersion, binding.version);
  }
  const rows = [...base(), prepared, accepted, committed], result = await reduceGroupCore(stream(rows), evidence(rows)), owner = result.effectiveOwners![0]!;
  assert.equal(result.knownTokens, '12'); assert.equal(owner.state, 'resolved'); assert.equal(owner.rootArtifactId, cross.rootArtifactId); assert.equal(owner.artifactId, cross.artifactId); assert.equal(owner.ownerVersion, 'commit');
  assert.equal(owner.captureRootArtifactId, binding.rootArtifactId); assert.equal(owner.captureArtifactId, binding.artifactId);
  assert.deepEqual(owner.provenanceEventIds, ['start', 'finish', 'prepare', 'accept', 'commit']);
  assert.deepEqual(await reduceGroupCore(stream([...rows].reverse()), evidence(rows)), result);
  const replay = rows.map(row => ({ ...row, sequence: 99, recordedAt: '2026-10-27T00:00:00.000Z' }));
  assert.deepEqual(await reduceGroupCore(stream([...rows, ...replay]), evidence(rows)), result);
  for (const broken of [[accepted], [prepared, committed], [committed]]) {
    const invalid = [...base(), ...broken], invalidResult = await reduceGroupCore(stream(invalid), evidence(invalid)), unresolved = invalidResult.effectiveOwners![0]!;
    assert.equal(invalidResult.knownTokens, '12', 'physical consumption is retained independently of unresolved assignment');
    assert.equal(unresolved.state, 'unavailable'); assert.equal(unresolved.rootArtifactId, null); assert.equal(unresolved.artifactId, null); assert.equal(unresolved.ownerVersion, null);
  }
  const completeScope = evidence(rows);
  const incompleteScopes: AccountingScope[] = [
    { ...completeScope, closure: 'partial' },
    { ...completeScope, closure: 'partial', evidence: { ...completeScope.evidence, coverageState: 'partial' } },
    evidence([...rows, phase('transfer.prepared', 'omitted-successor', identity('successor', cross, third, 'commit'))]),
  ];
  for (const incomplete of incompleteScopes) {
    const partial = await reduceGroupCore(stream(rows), incomplete), assignment = partial.effectiveOwners![0]!;
    assert.equal(partial.knownTokens, '12');
    assert.equal(assignment.state, 'unavailable');
    assert.equal(assignment.rootArtifactId, null); assert.equal(assignment.artifactId, null); assert.equal(assignment.ownerVersion, null);
    assert.ok(partial.quality.includes('unavailable'));
  }
  const missingDestination = await reduceGroupCore(stream(rows), evidence(rows, [binding]));
  assert.equal(missingDestination.effectiveOwners![0]!.state, 'unavailable'); assert.equal(missingDestination.effectiveOwners![0]!.artifactId, null);
});

test('transfer forks cycles wrong versions and conflicting intent IDs produce typed unresolved ownership', async () => {
  const ab = phase('transfer.committed', 'ab', identity('move-ab', binding, same));
  const acValue = identity('move-ac', binding, cross), ac = phase('transfer.prepared', 'ac', acValue);
  const stale = phase('transfer.committed', 'stale', identity('stale-version', binding, same, 'wrong-version'));
  const ba = phase('transfer.committed', 'ba', identity('move-back', same, binding, 'ab'));
  const conflictingIntent = signed({ ...ab, eventId: 'conflicting-intent', control: { ...ab.control, reason: 'different-intent-payload' } });
  const missingSource = signed({ ...ab, eventId: 'missing-original', control: { ...ab.control, originalObservationRef: { ...ab.control.originalObservationRef, eventId: 'missing-observation' } } });
  const invalidSubject = { ...same, artifactId: 'LLD-0123456789abcdef-s1' };
  const wrongKind = phase('transfer.committed', 'wrong-kind', identity('wrong-kind-transfer', binding, invalidSubject));
  for (const controls of [[ab, ac], [stale], [ab, ba], [ab, conflictingIntent]]) {
    const rows = [...base(), ...controls], result = await reduceGroupCore(stream(rows), evidence(rows)), owner = result.effectiveOwners![0]!;
    assert.equal(result.knownTokens, '12'); assert.equal(owner.state, 'conflict'); assert.equal(owner.rootArtifactId, null); assert.equal(owner.artifactId, null); assert.equal(owner.ownerVersion, null);
    assert.deepEqual(await reduceGroupCore(stream([...rows].reverse()), evidence(rows)), result);
  }
  const missingRows = [...base(), missingSource];
  assert.equal((await reduceGroupCore(stream(missingRows), evidence(missingRows))).effectiveOwners![0]!.state, 'unavailable');
  const kindRows = [...base(), wrongKind];
  assert.equal((await reduceGroupCore(stream(kindRows), evidence(kindRows, [binding, invalidSubject]))).effectiveOwners![0]!.state, 'conflict');
  const malformed = await reduceGroupCore(stream(base()), { complete: true });
  assert.deepEqual(malformed.effectiveOwners, [], 'new results always carry typed ownership, even with no selectable contribution');
  assert.deepEqual(requireEffectiveOwners(malformed), []);
  assert.throws(() => requireEffectiveOwners({ knownTokens: '12', estimatedTokens: '0', quality: ['reported'], basisEventIds: ['finish'], notices: [] }), /effective-ownership-unavailable/, 'a totals-only legacy result cannot be grouped by inferred capture IDs');
});

test('pending successors retain the latest committed owner and equivalent commit aliases advance once', async () => {
  const first = identity('cross-first', binding, cross), p = phase('transfer.prepared', 'p-first', first), a = phase('transfer.accepted', 'a-first', first, 'p-first'), c = phase('transfer.committed', 'c-first', first, 'p-first', 'a-first');
  const second = identity('cross-second', cross, third, 'c-first'), pending = phase('transfer.prepared', 'p-second', second);
  const rows = [...base(), p, a, c, pending], result = await reduceGroupCore(stream(rows), evidence(rows)), owner = result.effectiveOwners![0]!;
  assert.equal(result.knownTokens, '12'); assert.equal(owner.state, 'pending'); assert.equal(owner.rootArtifactId, cross.rootArtifactId); assert.equal(owner.artifactId, cross.artifactId); assert.equal(owner.ownerVersion, 'c-first'); assert.equal(owner.captureArtifactId, binding.artifactId);
  const committed = phase('transfer.committed', 'same-commit', identity('same-op', binding, same)), alias = signed({ ...committed, eventId: 'same-commit-alias' });
  const next = identity('next-op', same, cross, 'same-commit-alias');
  const aliasRows = [...base(), committed, alias, phase('transfer.prepared', 'next-p', next), phase('transfer.accepted', 'next-a', next, 'next-p'), phase('transfer.committed', 'next-c', next, 'next-p', 'next-a')];
  const aliasResult = await reduceGroupCore(stream(aliasRows), evidence(aliasRows));
  assert.equal(aliasResult.knownTokens, '12'); assert.equal(aliasResult.effectiveOwners![0]!.artifactId, cross.artifactId); assert.equal(aliasResult.effectiveOwners![0]!.ownerVersion, 'next-c');
});
