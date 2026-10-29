/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { acquireInvestigationProvider } from '../review-investigation-provider-lane.js';
import { InvestigationRepository } from '../review-investigation-repository.js';
import { fixture } from './review-investigation-fixtures.js';

test('Probe and review across repositories share one lane until actual teardown', async () => {
  const f = await fixture(false, false, false);
  let entered!: () => void, draining!: () => void, teardown!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const drainStarted = new Promise<void>(resolve => { draining = resolve; });
  const drained = new Promise<void>(resolve => { teardown = resolve; });
  const repository = new InvestigationRepository({ ...f.repository.options, daemonAdapter: async (...args) => {
    const adapter = await f.repository.options.daemonAdapter!(...args);
    return { ...adapter, execute: async (_turn, _tools, signal) => {
      entered();
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('fixture cancelled')), { once: true });
        if (signal.aborted) reject(new Error('fixture cancelled'));
      });
      throw Error('unreachable');
    }, drain: async () => { draining(); await drained; } };
  } });
  let releaseProbe: (() => void) | undefined;
  let work: Promise<unknown> | undefined, cancel: Promise<unknown> | undefined;
  try {
    const accepted = await repository.start(f.start);
    work = repository.advance(accepted.descriptor.runId).catch(() => undefined);
    await started;
    let probeInvoked = false;
    const probe = acquireInvestigationProvider(new AbortController().signal).then(release => {
      probeInvoked = true; releaseProbe = release;
    });
    await setImmediate();
    assert.equal(probeInvoked, false);
    cancel = repository.cancel(accepted.descriptor.runId);
    await drainStarted;
    await setImmediate();
    assert.equal(probeInvoked, false, 'abort does not release the active review before actual teardown');
    teardown();
    await work;
    await cancel;
    await probe;
    assert.equal(probeInvoked, true);
  } finally {
    teardown();
    await work;
    await cancel;
    releaseProbe?.();
    f.close();
  }
});

test('Cancelling queued probe does not invoke provider or release another owner\'s slot', async () => {
  const releaseReview = await acquireInvestigationProvider(new AbortController().signal);
  const abort = new AbortController();
  let calls = 0, leases = 0, laterEntered = false;
  const cancelled = acquireInvestigationProvider(abort.signal).then(release => {
    calls++; leases++; release();
  });
  const cancellation = assert.rejects(cancelled, /cancelled/);
  abort.abort(new Error('probe cancelled'));
  await cancellation;
  let releaseLater: (() => void) | undefined;
  const later = acquireInvestigationProvider(new AbortController().signal).then(release => {
    laterEntered = true; releaseLater = release;
  });
  try {
    await setImmediate();
    assert.equal(calls, 0);
    assert.equal(leases, 0);
    assert.equal(laterEntered, false, 'cancelled waiter cannot skip the earlier active review');
    releaseReview();
    await later;
    assert.equal(laterEntered, true);
    releaseReview(); // idempotent release cannot release the later owner
    const nextAbort = new AbortController();
    const next = acquireInvestigationProvider(nextAbort.signal);
    nextAbort.abort(new Error('still queued'));
    await assert.rejects(next, /still queued/);
  } finally { releaseReview(); releaseLater?.(); }
});
