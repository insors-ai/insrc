import assert from 'node:assert/strict';
import { mkdtemp, open, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { DelegateMeasurement, TaskProgressDelegate } from '../../../shared/task-progress.js';
import { createProgressAuthority, ProgressCoordinator } from '../coordinator.js';
import type { ProducerAuthorization } from '../coordinator.js';
import { ProgressStore } from '../store.js';

type Details = { readonly kind: 'test' };
const details: Details = { kind: 'test' };
const validate = (kind: string, input: unknown): input is Details =>
  kind === 'test' && input !== null && typeof input === 'object' &&
  'kind' in input && input.kind === 'test' && Object.keys(input).length === 1;

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'insrc-progress-coordinator-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'state');
  let failRename = false;
  const store = await ProgressStore.open(path, validate, undefined, {
    open,
    rename: async (source, target) => {
      if (failRename) throw new Error('injected rename failure');
      await rename(source, target);
    },
  });
  const authority = createProgressAuthority();
  let time = 1000;
  let monotonic = 0;
  const clock = { now: () => time, monotonic: () => monotonic, wait: async (ms: number) => { monotonic += ms; } };
  const coordinator = new ProgressCoordinator(store, authority.inspect, clock);
  const producer = coordinator.registerProducer('test', () => details);
  const mint = (invocationId: string) => authority.mint({
    action: 'launch', invocationId, projectId: 'project', ownerId: 'owner', origin: { extensionChatId: 'chat' },
  });
  return { path, store, authority, coordinator, producer, mint, clock,
    setTime: (value: number) => { time = value; }, failRename: (value: boolean) => { failRename = value; } };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Admitted = Extract<Awaited<ReturnType<Fixture['producer']['register']>>, { kind: 'admitted' }>;

async function admitted(f: Fixture, invocationId: string, delegate: TaskProgressDelegate<Details>): Promise<Admitted> {
  const result = await f.producer.register(f.mint(invocationId), 'producer', delegate);
  assert.equal(result.kind, 'admitted');
  return result;
}

function sample(a: Admitted, ownerSequence: number, meaningfulRevision: number, measuredAt: number,
  phase: string, completed: number): DelegateMeasurement<Details> {
  return {
    task: a.task, owner: { ...a.fence, ownerSequence }, kind: 'test',
    meaningfulRevision, measuredAt: new Date(measuredAt).toISOString(), lastMeaningfulAt: null,
    phase, activeUnit: 'suite', counts: [{ unit: 'cases', completed, total: null }],
    milestones: ['started'], controls: [], details,
  };
}

test('Progress coordinator fences duplicate admission, old owners and a delayed delegate after terminal commit', async t => {
  const f = await fixture(t);
  let release!: (value: DelegateMeasurement<Details>) => void;
  let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const delegate: TaskProgressDelegate<Details> = {
    progress: () => { began(); return new Promise(resolve => { release = resolve; }); },
  };
  const a = await admitted(f, 'a', delegate);
  const duplicate = await f.producer.register(f.mint('a'), 'producer', delegate);
  assert.equal(duplicate.kind, 'admitted');
  assert.equal(duplicate.owner, a.owner);
  assert.deepEqual(await f.producer.register({} as ProducerAuthorization, 'producer', delegate),
    { kind: 'refused', reason: 'invalid-origin' });
  const refreshing = f.producer.signalMeasurement(a.owner, 1);
  await started;
  const evidence = { sequence: 2, state: 'completed', resultRef: 'result' } as const;
  assert.equal(await f.producer.recordLifecycle(a.owner, evidence), 'recorded');
  assert.equal(await f.producer.recordLifecycle(a.owner, evidence), 'replay');
  const reopened = await ProgressStore.open(f.path, validate);
  assert.equal(reopened.get(a.task)?.resultRef, 'result');
  const retry = await f.producer.register(f.authority.mint({ action: 'retry', task: a.task, ownerId: 'owner' }),
    'producer', { progress: async () => null });
  assert.equal(retry.kind, 'admitted');
  assert.equal(retry.task.attempt, 2);
  release(sample(a, 1, 1, 1000, 'execution', 1));
  await refreshing;
  assert.equal(await f.producer.recordLifecycle(a.owner, { sequence: 3, state: 'running' }), 'rejected');
  assert.equal(f.coordinator.read(retry.task)?.measurement, null);
});

test('Meaningful progress revisions isolate tasks and preserve original measurements on repeats and heartbeats', async t => {
  const f = await fixture(t);
  let nextA: DelegateMeasurement<Details> | null = null;
  let nextB: DelegateMeasurement<Details> | null = null;
  let reads = 0;
  const a = await admitted(f, 'a', { progress: async () => { reads++; return nextA; } });
  const b = await admitted(f, 'b', { progress: async () => nextB });
  nextA = sample(a, 1, 1, 1000, 'discovery', 0);
  nextB = sample(b, 1, 1, 1000, 'execution', 5);
  await f.producer.signalMeasurement(a.owner, 1);
  await f.producer.signalMeasurement(b.owner, 1);
  const before = f.coordinator.read(a.task)?.measurement;
  const other = f.coordinator.read(b.task);
  assert.equal(before?.meaningfulRevision, 1);
  assert.equal(before?.phase, 'discovery');
  assert.deepEqual(other?.measurement?.counts, [{ unit: 'cases', completed: 5, total: null }]);

  nextA = sample(a, 2, 1, 2000, 'discovery', 0);
  await f.producer.signalMeasurement(a.owner, 2);
  f.setTime(3000);
  assert.equal(await f.producer.renewActivity(a.owner, 3), 'renewed');
  assert.deepEqual(f.coordinator.read(a.task)?.measurement, before);
  assert.equal(reads, 2);
  assert.equal(f.coordinator.read(a.task)?.lastOwnerActivityAt, new Date(3000).toISOString());

  nextA = sample(a, 4, 2, 3000, 'execution', 0);
  await f.producer.signalMeasurement(a.owner, 4);
  assert.equal(f.coordinator.read(a.task)?.measurement?.meaningfulRevision, 2);
  nextA = sample(a, 5, 3, 4000, 'execution', 2);
  await f.producer.signalMeasurement(a.owner, 5);
  const changed = f.coordinator.read(a.task)?.measurement;
  assert.equal(changed?.meaningfulRevision, 3);
  assert.equal(changed?.measuredAt, new Date(4000).toISOString());
  assert.deepEqual(changed?.counts, [{ unit: 'cases', completed: 2, total: null }]);
  assert.deepEqual(changed?.milestones, ['started']);
  assert.deepEqual(f.coordinator.read(b.task), other);
});

test('Progress coordinator publishes no terminal outcome when the durable write fails', async t => {
  const f = await fixture(t);
  const a = await admitted(f, 'a', { progress: async () => null });
  f.failRename(true);
  await assert.rejects(f.producer.recordLifecycle(a.owner, { sequence: 1, state: 'failed', resultRef: 'result' }),
    { reason: 'unavailable' });
  assert.throws(() => f.coordinator.read(a.task), { reason: 'unavailable' });
  const reopened = await ProgressStore.open(f.path, validate);
  assert.equal(reopened.get(a.task)?.state, 'queued');
  assert.equal(reopened.get(a.task)?.resultRef, undefined);
  f.failRename(false);
  assert.equal(await f.producer.recordLifecycle(a.owner, { sequence: 1, state: 'failed', resultRef: 'result' }), 'recorded');
  assert.equal(f.coordinator.read(a.task)?.state, 'failed');
});

test('Progress coordinator requires trusted revalidation to bind a recovered attempt to a new epoch', async t => {
  const f = await fixture(t);
  let next: DelegateMeasurement<Details> | null = null;
  const a = await admitted(f, 'a', { progress: async () => next });
  next = sample(a, 1, 1, 1000, 'execution', 3);
  await f.producer.signalMeasurement(a.owner, 1);
  const store = await ProgressStore.open(f.path, validate);
  const recovered = new ProgressCoordinator(store, f.authority.inspect, f.clock);
  const port = recovered.registerProducer('test', () => details);
  assert.equal(recovered.read(a.task)?.freshness, 'stale');
  const delegate = { progress: async () => next };
  assert.deepEqual(await port.register(f.authority.mint({ action: 'revalidate', task: a.task, ownerId: 'foreign' }),
    'producer', delegate), { kind: 'refused', reason: 'conflict' });
  const rebound = await port.register(f.authority.mint({ action: 'revalidate', task: a.task, ownerId: 'owner' }),
    'producer', delegate);
  assert.equal(rebound.kind, 'admitted');
  assert.notEqual(rebound.fence.ownerEpoch, a.fence.ownerEpoch);
  assert.deepEqual(rebound.task, a.task);
  assert.equal(await port.recordLifecycle(a.owner, { sequence: 2, state: 'failed' }), 'rejected');
  next = sample(rebound, 1, 1, 2000, 'execution', 4);
  await port.signalMeasurement(rebound.owner, 1);
  assert.equal(recovered.read(rebound.task)?.measurement?.meaningfulRevision, 2);
});

test('Verify 30-second owner renewal and 120-second expiry with no observers, separate tasks in one chat, removal, and stale callbacks', async t => {
  const f = await fixture(t);
  const a = await admitted(f, 'a', { progress: async () => null });
  const b = await admitted(f, 'b', { progress: async () => null });
  await f.clock.wait(30_000);
  f.setTime(31_000);
  assert.equal(await f.producer.renewActivity(b.owner, 1), 'renewed');
  assert.equal(await f.producer.renewActivity(b.owner, 1), 'rejected');
  assert.equal(f.coordinator.activityFor('project', 'chat').length, 2);
  f.coordinator.read(a.task);
  await f.clock.wait(90_000);
  f.setTime(121_000);
  await f.coordinator.sweep();
  assert.deepEqual(f.coordinator.activityFor('project', 'chat').map(lease => lease.task), [b.task]);
  assert.equal(f.coordinator.read(a.task)?.state, 'interrupted');
  assert.equal(await f.producer.renewActivity(a.owner, 2), 'rejected');
  assert.equal(await f.producer.recordLifecycle(a.owner, { sequence: 3, state: 'completed' }), 'rejected');
  assert.equal(f.coordinator.read(b.task)?.workerHealth, 'alive');
  const independent = await f.producer.register(f.authority.mint({
    action: 'launch', invocationId: 'c', projectId: 'project', ownerId: 'owner', origin: { extensionChatId: 'other-chat' },
  }), 'producer', { progress: async () => null });
  assert.equal(independent.kind, 'admitted');
  const record = f.store.get(b.task)!;
  await f.store.commit({ ...record, revision: record.revision + 1, activityReleased: true }, record.revision);
  assert.deepEqual(f.coordinator.activityFor('project', 'chat'), []);
  assert.equal(f.coordinator.activityFor('project', 'other-chat').length, 1);
  assert.equal(await f.producer.recordLifecycle(b.owner, { sequence: 2, state: 'completed' }), 'recorded');
});

test('Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination', async t => {
  const f = await fixture(t);
  const a = await admitted(f, 'a', { progress: async () => null });
  const limits = { activePerProject: 1, inactivePerProject: 2, globalBytes: 512 * 1024, quarantineRecords: 0 };
  let store = await ProgressStore.open(f.path, validate, limits);
  let coordinator = new ProgressCoordinator(store, f.authority.inspect, f.clock);
  f.setTime(2_000);
  await coordinator.sweep();
  assert.equal(coordinator.read(a.task)?.state, 'interrupted');
  assert.equal(store.get(a.task)?.recoveryDeadline, 122_000);
  const before = coordinator.registerProducer('test', () => details);
  assert.deepEqual(await before.register(f.mint('b'), 'producer', { progress: async () => null }),
    { kind: 'refused', reason: 'capacity' });

  store = await ProgressStore.open(f.path, validate, limits);
  coordinator = new ProgressCoordinator(store, f.authority.inspect, f.clock);
  f.setTime(121_000);
  await coordinator.sweep();
  assert.equal(store.get(a.task)?.recoveryDeadline, 122_000);
  f.setTime(122_000);
  await coordinator.sweep();
  assert.equal(store.get(a.task)?.retention, 'expired');
  assert.equal(coordinator.read(a.task)?.state, 'unknown');
  assert.equal(coordinator.read(a.task)?.workerHealth, 'lost');
  assert.equal(coordinator.isTerminal(a.task), false);
  const after = coordinator.registerProducer('test', () => details);
  assert.deepEqual(await after.register(f.authority.mint({ action: 'revalidate', task: a.task, ownerId: 'owner' }),
    'producer', { progress: async () => null }), { kind: 'refused', reason: 'expired' });
  assert.equal((await after.register(f.mint('b'), 'producer', { progress: async () => null })).kind, 'admitted');
  f.setTime(122_000 + 7 * 24 * 60 * 60 * 1000);
  await coordinator.sweep();
  assert.equal(coordinator.read(a.task), undefined);
});
