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
