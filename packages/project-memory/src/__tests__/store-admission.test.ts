import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { MemoryError } from '../errors.js';
import { EmbeddedMemoryService } from '../runtime.js';
import { ModelDispatcher } from '../model-dispatcher.js';
import { QueueAdmission } from '../queue/admission.js';
import { digest, snapshotJson } from '../queue/codec.js';
import { admissionTransforms } from '../store/admission-policy.js';
import { admittedPayload, canonical } from '../store/plan.js';
import type { HostPolicy, Json, MemoryCommand, MemoryFailureCode } from '../types.js';
import type { QueueFrame } from '../queue/types.js';
import { nativeTest } from './fixtures/node22.js';
import { finalCommand, forgetPlan, framePlan, integrationFixture, integrationLimits } from './fixtures/store-integration.js';
import { scope } from './fixtures/store-rows.js';
import { options } from './fixtures/options.js';

function raw(eventId = 'admission'): MemoryCommand {
  const final = finalCommand(eventId);
  const { admitted: _protected, ...payload } = final.payload as Record<string, Json>;
  return { ...final, payload };
}
function attest(event: Json, changes: Record<string, Json> = {}): Json {
  const c = event as unknown as MemoryCommand;
  return { ...c, payload: { ...(c.payload as Record<string, Json>), policyAttestation: { version: 1, origin: 'user', policyVersion: 'test-policy-v1', occurrenceTimeVerified: false }, ...changes } } as unknown as Json;
}
const code = (expected: MemoryFailureCode) => (error: unknown) => error instanceof MemoryError && error.code === expected && !error.message.includes('private-host-detail');
async function bytes(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(path: string) {
    for (const entry of await readdir(join(root, 'queue', path), { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await walk(file); else result[file] = digest((await readFile(join(root, 'queue', file))).toString('base64'));
    }
  }
  await walk(''); return result;
}
async function firstFrame(f: Awaited<ReturnType<typeof integrationFixture>>): Promise<QueueFrame> {
  const frames: QueueFrame[] = []; for await (const frame of f.queue.replay()) frames.push(frame);
  assert.ok(frames[0]); return frames[0];
}
function publicService(f: Awaited<ReturnType<typeof integrationFixture>>, policy: HostPolicy) {
  const admission = new QueueAdmission(f.queue, policy, admissionTransforms(integrationLimits.maxEventBytes));
  const config = options(f.root);
  const models = new ModelDispatcher({ ...config.models, async complete() { assert.fail('Admission must not call models.'); }, async embed() { assert.fail('Admission must not embed.'); } }, 1000);
  // The test harness owns queue/store cleanup. Production composition is t13;
  // this tests the actual public service submit boundary without enabling it early.
  return new EmbeddedMemoryService(f.owner, models, config.logger, [], { ready: () => true, submit: c => admission.append(c), operation: r => admission.operation(r) });
}
const bind: HostPolicy['bind'] = async projectId => ({ projectId, root: '/host/project', scopeEpoch: 'epoch-1' });

nativeTest(import.meta.url, 'store-admission-public-submit-protected-input-and-host-errors-preserve-queue-bytes', async () => {
  const f = await integrationFixture(); let calls = 0, thrown: MemoryFailureCode | undefined;
  const service = publicService(f, { bind, async admit(_binding, event) { calls++; if (thrown) throw new MemoryError(thrown, 'private-host-detail'); return attest(event); } });
  try {
    const before = await bytes(f.root);
    for (const key of ['admitted', 'policyAttestation', 'unknown']) {
      const command = raw(); await assert.rejects(service.submit({ ...command, payload: { ...(command.payload as Record<string, Json>), [key]: {} } }), code('INVALID_REQUEST'));
    }
    assert.equal(calls, 0);
    for (const bad of [null, {}, { schemaVersion: 1, input: {}, source: null }, { schemaVersion: 1, input: {}, source: { text: 'x', reference: null, occurredAt: -1 } }]) await assert.rejects(service.submit({ ...raw(), payload: bad }), code('INVALID_REQUEST'));
    for (const failure of ['INVALID_REQUEST', 'REVISION_CONFLICT', 'POLICY_DENIED', 'UNBOUND_PROJECT'] as const) {
      thrown = failure; await assert.rejects(service.submit(raw()), code(['INVALID_REQUEST', 'REVISION_CONFLICT'].includes(failure) ? 'NOT_READY' : failure));
    }
    assert.deepEqual(await bytes(f.root), before); assert.equal(f.queue.stats().pendingEvents, 0);
    thrown = undefined;
    await service.submit(raw('after-errors')); assert.equal(f.queue.stats().pendingEvents, 1, 'all failure reservations released');
  } finally { await f.close(); }
});

nativeTest(import.meta.url, 'store-admission-real-queue-derived-redacted-hash-time-and-deterministic-terminal-retries', async () => {
  const f = await integrationFixture(); let changed = false;
  const policy: HostPolicy = { bind: async projectId => ({ projectId, root: '/host/project', scopeEpoch: 'epoch-1' }), async admit(_binding, event) {
    assert.equal(this, policy, 'trusted callback receiver is preserved');
    return attest(event, { source: { text: changed ? 'Changed output' : 'é\r\n😀 do not normalize', reference: 'artifact://trusted', occurredAt: 9000 } });
  } };
  const service = publicService(f, policy), command = raw();
  try {
    const accepted = await service.submit(command), frame = await firstFrame(f);
    const payload = admittedPayload(frame);
    assert.equal(payload.source!.text, 'é\r\n😀 do not normalize'); assert.equal(payload.source!.occurredAt, null);
    assert.equal(payload.admitted.occurredAt, null); assert.equal(payload.admitted.contentHash, digest(payload.source!.text));
    const final = frame.command.payload as Record<string, Json>;
    assert.equal((final.admitted as Record<string, Json>).requestHash, digest(snapshotJson(command, integrationLimits.maxEventBytes).text));
    assert.equal(Object.hasOwn(final, 'policyAttestation'), false);
    const before = await bytes(f.root); assert.deepEqual(await service.submit(command), accepted); assert.deepEqual(await bytes(f.root), before);
    changed = true; await assert.rejects(service.submit(command), code('REVISION_CONFLICT')); assert.deepEqual(await bytes(f.root), before);
    changed = false;
    const terminal = await f.store.commit(framePlan(frame, '0', 100));
    await f.queue.markResolved(frame.operationId, terminal.generation!); await f.queue.recycleResolvedSegments();
    const recycled = await bytes(f.root);
    assert.equal(canonical(await service.submit(command)), canonical(terminal));
    changed = true; await assert.rejects(service.submit(command), code('REVISION_CONFLICT')); assert.deepEqual(await bytes(f.root), recycled);
    assert.equal((await f.store.readRoot()).generation, '1');
  } finally { await f.close(); }
});

nativeTest(import.meta.url, 'store-admission-attestation-envelope-size-and-verified-time-fail-before-persist', async () => {
  const f = await integrationFixture(); let mode = 'missing';
  const service = publicService(f, { bind, async admit(_binding, event) {
    const command = event as unknown as MemoryCommand;
    if (mode === 'missing') return event;
    if (mode === 'scope') return { ...command, scope: { projectId: 'other' } } as unknown as Json;
    if (mode === 'malformed') return attest(event, { policyAttestation: { version: 1, origin: 'admin', policyVersion: 'x', occurrenceTimeVerified: true } });
    if (mode === 'protected') return attest(event, { admitted: {} });
    if (mode === 'overflow') return attest(event, { source: { text: 'x'.repeat(integrationLimits.maxEventBytes), reference: null, occurredAt: null } });
    if (mode === 'final-overflow') {
      const empty = attest(event, { source: { text: '', reference: null, occurredAt: null } });
      const length = integrationLimits.maxEventBytes - snapshotJson(empty, integrationLimits.maxEventBytes).bytes;
      return attest(event, { source: { text: 'x'.repeat(length), reference: null, occurredAt: null } });
    }
    if (mode === 'bad-time') return attest(event, { source: { text: 'x', reference: null, occurredAt: -1 } });
    return attest(event, { source: { text: 'trusted', reference: null, occurredAt: 9000 }, policyAttestation: { version: 1, origin: 'artifact', policyVersion: 'historical-v1', occurrenceTimeVerified: true } });
  } });
  try {
    const before = await bytes(f.root);
    for (const [next, error] of [['missing', 'NOT_READY'], ['scope', 'POLICY_DENIED'], ['malformed', 'POLICY_DENIED'], ['protected', 'POLICY_DENIED'], ['overflow', 'INVALID_REQUEST'], ['final-overflow', 'INVALID_REQUEST'], ['bad-time', 'POLICY_DENIED']] as const) {
      mode = next; await assert.rejects(service.submit(raw()), code(error)); assert.deepEqual(await bytes(f.root), before);
    }
    mode = 'verified'; await service.submit(raw());
    const frame = await firstFrame(f), payload = admittedPayload(frame);
    assert.equal(payload.source!.occurredAt, 9000); assert.equal(payload.admitted.occurredAt, 9000);
    await f.store.commit(framePlan(frame, '0', 100));
  } finally { await f.close(); }
});

nativeTest(import.meta.url, 'store-admission-host-registered-new-source-lifecycle-is-required-after-forget', async () => {
  const f = await integrationFixture(), registered = new Set(['source-session']);
  const service = publicService(f, { bind, async admit(_binding, event) {
    const c = event as unknown as MemoryCommand;
    if (!registered.has(c.source.sessionId)) throw new MemoryError('POLICY_DENIED', 'private-host-detail');
    return attest(event);
  } });
  try {
    const capture = raw('old'); await service.submit(capture); const old = await firstFrame(f);
    const forgetting: MemoryCommand = { ...raw('forget'), kind: 'forget', payload: { schemaVersion: 1, input: { target: { kind: 'session', sessionId: 'source-session' } }, source: null }, scope: { projectId: scope.projectId } };
    await service.submit(forgetting); let forget;
    for await (const frame of f.queue.replay()) if (frame.command.kind === 'forget') forget = frame;
    assert.ok(forget); f.clock(200); await f.store.commit(forgetPlan(forget, '0', 200, { kind: 'session', sessionId: 'source-session' }));
    assert.equal((await f.store.commit(framePlan(old, '0', 100))).errorCode, 'POLICY_DENIED');
    const fresh = { ...raw('fresh'), source: { ...capture.source, eventId: 'fresh', sessionId: 'new-session' } };
    await assert.rejects(service.submit(fresh), code('POLICY_DENIED'));
    registered.add('new-session'); await service.submit(fresh);
    let frame; for await (const candidate of f.queue.replay()) if (candidate.command.source.eventId === 'fresh') frame = candidate;
    assert.ok(frame); assert.equal((await f.store.validateFrameEligibility(frame)).eligible, true); f.clock(300);
    assert.equal((await f.store.commit(framePlan(frame, '2', 300))).state, 'committed');
  } finally { await f.close(); }
});
