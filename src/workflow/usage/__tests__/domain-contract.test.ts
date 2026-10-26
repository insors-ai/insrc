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
