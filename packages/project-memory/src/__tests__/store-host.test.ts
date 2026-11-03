import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryFactory } from '../index.js';
import { MemoryError } from '../errors.js';
import { acquireOwnership } from '../ownership.js';
import { FileQueue } from '../queue/file-queue.js';
import type { QueueFrame } from '../queue/types.js';
import { OwnedLanceStore } from '../store/lance-store.js';
import { canonical } from '../store/plan.js';
import type { Json, MemoryCommand, MemoryFailureCode } from '../types.js';
import { nativeTest } from './fixtures/node22.js';
import { hostOptions, attestHostEvent } from './fixtures/host-options.js';
import { finalCommand, framePlan } from './fixtures/store-integration.js';
import { profile, scope } from './fixtures/store-rows.js';

function command(): MemoryCommand {
  const c = finalCommand('factory-event'), { admitted: _protected, ...payload } = c.payload as Record<string, Json>;
  return { ...c, payload };
}
const code = (value: string) => (error: unknown) => error instanceof MemoryError && error.code === value && !error.message.includes('private-host');

nativeTest(import.meta.url, 'store-host-factory-durable-submit-cold-terminal-status-and-protected-error-boundary', async () => {
  for (const recycle of [false, true]) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-host-')));
    let changed = false, failure: MemoryFailureCode | undefined, calls = 0;
    const base = hostOptions(root);
    const config = { ...base, models: { ...base.models, embeddingModel: profile.model, async complete() { calls++; return null; }, async embed() { calls++; return [1, 0]; } }, policy: { ...base.policy,
      async admit(_binding: unknown, event: Json) {
        if (failure) throw new MemoryError(failure, 'private-host');
        const result = attestHostEvent(event) as Record<string, Json>;
        if (changed) { const p = result.payload as Record<string, Json>; result.payload = { ...p, source: { text: 'changed historical result', reference: null, occurredAt: null } }; }
        return result;
      },
    } };
    let service = await MemoryFactory.open(config);
    try {
      await service.ready(); const raw = command();
      const accepted = await service.submit(raw); assert.equal(accepted.state, 'accepted');
      const segment = join(root, 'queue/segments/00000000000000000001.jsonl'), before = await readFile(segment);
      for (const key of ['admitted', 'policyAttestation']) await assert.rejects(service.submit({ ...raw, payload: { ...(raw.payload as Record<string, Json>), [key]: {} } }), code('INVALID_REQUEST'));
      changed = true; await assert.rejects(service.submit(raw), code('REVISION_CONFLICT')); changed = false;
      for (const next of ['INVALID_REQUEST', 'REVISION_CONFLICT', 'POLICY_DENIED', 'UNBOUND_PROJECT'] as const) { failure = next; await assert.rejects(service.submit(raw), code(['INVALID_REQUEST', 'REVISION_CONFLICT'].includes(next) ? 'NOT_READY' : next)); }
      failure = undefined; assert.deepEqual(await readFile(segment), before);
      await assert.rejects(service.submit({ ...raw, kind: 'delivery' }), code('NOT_READY'));
      for (const read of [service.context({ scope, budgetTokens: 100 }), service.search({ scope, budgetTokens: 100, query: 'rule', limit: 1 }), service.inspect({ scope, memoryId: 'missing' })]) await assert.rejects(read, code('NOT_READY'));
      assert.equal(calls, 0); await service.close();
      // No worker is invented for S3: seed an actual private commit while the
      // public host is closed, then prove its next cold open uses that authority.
      const owner = await acquireOwnership(config), store = await OwnedLanceStore.open(owner, profile, { now: () => 100 }, config.limits, config.policy);
      const queue = new FileQueue(owner, root, config.limits, {}, store.receiptVerifier()); await queue.start();
      let terminal;
      try {
        const frames: QueueFrame[] = []; for await (const frame of queue.replay()) frames.push(frame);
        assert.equal(frames.length, 1); terminal = await store.commit(framePlan(frames[0]!, '0', 100));
        if (recycle) { await queue.markResolved(accepted.operationId, '1'); await queue.recycleResolvedSegments(); }
      } finally { await queue.close(); await store.close(); await owner.close(); }
      service = await MemoryFactory.open(config); await service.ready();
      assert.equal(canonical(await service.operation({ scope, operationId: accepted.operationId })), canonical(terminal));
      assert.equal(canonical(await service.submit(raw)), canonical(terminal));
      changed = true; await assert.rejects(service.submit(raw), code('REVISION_CONFLICT')); changed = false;
      assert.equal(calls, 0); await service.close(); await config.models.embed(); assert.equal(calls, 1, 'host model port remains usable');
      await assert.rejects(MemoryFactory.open({ ...config, models: { ...config.models, embeddingModel: 'mismatched-profile' } }), code('UNSUPPORTED_VERSION'));
      const reacquired = await acquireOwnership(config); await reacquired.close();
    } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  }
});
