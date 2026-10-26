/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalData, canonicalSource, sameSource, sourceDigest, UsageInputError } from '../canonical.js';
import type { LedgerRecord } from '../types.js';

const record: LedgerRecord = {
  schemaVersion: 1, eventId: 'finish', rootArtifactId: 'EPIC-0123456789abcdef', artifactId: 'TASK-0123456789abcdef-s1-t1',
  sequence: 0, recordedAt: '2026-10-26T00:00:00.000Z', recordKind: 'request.finished', payloadDigest: '0'.repeat(64),
  callId: 'call', context: null, control: null,
  observation: { outcome: 'success', reportedModel: null, finishedAt: '2026-10-26T00:00:00.000Z', quality: 'reported',
    counters: { inputUncachedTokens: 1, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: 2, reasoningTokens: null },
    normalizationVersion: 'disjoint-v1', nativeUnit: 'tokens', sourceCapabilityId: 'fixture', reason: null, cumulative: null },
};
const rejected = (operation: () => unknown, code: 'invalid-input' | 'resource-limit' = 'invalid-input') =>
  assert.throws(operation, (error: unknown) => error instanceof UsageInputError && error.code === code);

test('canonical source identity preserves capture data and ignores only service metadata', () => {
  assert.equal(canonicalData({ z: -0, a: ['😀', true, null] }), '{"a":["😀",true,null],"z":0}');
  const reversed = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(sourceDigest(reversed), sourceDigest(record));
  assert.equal(sameSource(record, { ...record, sequence: 42, recordedAt: '2026-10-27T00:00:00.000Z', payloadDigest: 'f'.repeat(64) }), true);
  for (const changed of [
    { ...record, eventId: 'other' }, { ...record, rootArtifactId: 'EPIC-fedcba9876543210' },
    { ...record, artifactId: 'TASK-0123456789abcdef-s1-t2' }, { ...record, callId: 'other' },
    { ...record, observation: { ...record.observation!, counters: { ...record.observation!.counters, outputTokens: 3 } } },
    { ...record, observation: { ...record.observation!, reportedModel: 'actual' } },
  ]) assert.equal(sameSource(record, changed), false);
  assert.equal(sourceDigest(record), createHash('sha256').update(Buffer.from('insrc.usage.source.v1\0', 'utf8')).update(canonicalSource(record)).digest('hex'));
  assert.notEqual(sourceDigest(record), createHash('sha256').update(canonicalSource(record)).digest('hex'));
  assert.deepEqual(record.observation!.counters, { inputUncachedTokens: 1, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: 2, reasoningTokens: null });
  assert.equal(record.sequence, 0);
  rejected(() => canonicalSource({ ...record, transcript: 'not allowed' }));
});

test('canonical traversal rejects unsafe data without invoking hooks', () => {
  let invoked = 0;
  const getter = Object.defineProperty({}, 'secret', { enumerable: true, get() { invoked++; return 'secret'; } });
  const serviceGetter = Object.defineProperty({ ...record }, 'sequence', { enumerable: true, get() { invoked++; return 0; } });
  const toJSON = { toJSON() { invoked++; return {}; } };
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  const custom = Object.create({ inherited: true }); custom.own = 1;
  const proxy = new Proxy({}, { ownKeys() { invoked++; return []; }, getPrototypeOf() { invoked++; return null; } });
  const symbol = { [Symbol('hidden')]: 1 };
  const hidden = Object.defineProperty({}, 'hidden', { value: 1, enumerable: false });
  const array = [1]; Object.defineProperty(array, 'extra', { value: true, enumerable: true });
  for (const value of [getter, toJSON, cycle, custom, proxy, symbol, hidden, array, new Array(2), new Date(), new Map(),
    undefined, () => 1, NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 1n, '\ud800', '\udfff', { '\ud800': 1 },
    Object.setPrototypeOf([1], null)]) rejected(() => canonicalData(value));
  rejected(() => canonicalSource(serviceGetter));
  assert.equal(invoked, 0);
  assert.equal(canonicalData(Object.assign(Object.create(null), { safe: 1 })), '{"safe":1}');
  const reused = { a: 1 };
  assert.equal(canonicalData([reused, reused]), '[{"a":1},{"a":1}]');
});

test('canonical identity enforces byte, depth, node and reference limits', () => {
  assert.equal(Buffer.byteLength(canonicalData('a'.repeat(16382))), 16384);
  rejected(() => canonicalData('a'.repeat(16383)), 'resource-limit');
  // UTF-8 size and JSON escaping, not UTF-16 character count, govern the budget.
  rejected(() => canonicalData('😀'.repeat(4096)), 'resource-limit');
  rejected(() => canonicalData('\n'.repeat(8192)), 'resource-limit');
  let deep: unknown = 1;
  for (let i = 0; i < 32; i++) deep = { a: deep };
  assert.doesNotThrow(() => canonicalData(deep));
  rejected(() => canonicalData({ a: deep }), 'resource-limit');
  assert.doesNotThrow(() => canonicalData(Array(1024).fill(0)));
  rejected(() => canonicalData(Array(1025).fill(0)), 'resource-limit');
  rejected(() => canonicalData(Array.from({ length: 5 }, () => Array(1024).fill(0))), 'resource-limit');
  rejected(() => canonicalData(Object.fromEntries(Array.from({ length: 4097 }, (_, i) => [`k${i}`, 0]))), 'resource-limit');
  const longPrefix = 'x'.repeat(100_000);
  rejected(() => canonicalData({ [longPrefix + 'a']: 1, [longPrefix + 'b']: 2 }), 'resource-limit');
  // Aggregate key work is bounded even when each name alone fits the budget.
  rejected(() => canonicalData({ ['a'.repeat(9000)]: 1, ['b'.repeat(9000)]: 2 }), 'resource-limit');
  const longArrayKey: unknown[] = [];
  Object.defineProperty(longArrayKey, '1'.repeat(100_000), { value: 1, enumerable: true });
  rejected(() => canonicalData(longArrayKey), 'resource-limit');
  const base = { ...record, observation: { ...record.observation!, reason: 'x' } };
  const spare = 16384 - Buffer.byteLength(canonicalSource(base)) + 1;
  const full = { ...base, observation: { ...base.observation, reason: 'x'.repeat(spare) } };
  assert.equal(Buffer.byteLength(canonicalSource(full)), 16384);
  rejected(() => canonicalSource({ ...full, observation: { ...full.observation, reason: 'x'.repeat(spare + 1) } }), 'resource-limit');
});
