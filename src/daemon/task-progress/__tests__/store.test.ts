import assert from 'node:assert/strict';
import { mkdtemp, open, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MAX_PROGRESS_RECORD_BYTES, progressTaskKey } from '../record.js';
import type { ProgressRecord } from '../record.js';
import { ProgressStore } from '../store.js';
import type { ProgressStoreLimits } from '../store.js';

const bytes = MAX_PROGRESS_RECORD_BYTES;
const limits: ProgressStoreLimits = { activePerProject: 2, inactivePerProject: 1, globalBytes: 8 * bytes, quarantineRecords: 0 };
type Details = { kind: 'test' };
const validate = (kind: string, value: unknown): value is Details =>
  kind === 'test' && typeof value === 'object' && value !== null &&
  Object.keys(value).length === 1 && 'kind' in value && value.kind === 'test';

function active(taskId: string, projectId = 'project'): ProgressRecord<Details> {
  return {
    version: 1, task: { projectId, invocationId: 'invocation', taskId, attempt: 1 },
    origin: {}, owner: { ownerId: 'owner', ownerEpoch: 'epoch', ownerSequence: 0 },
    revision: 0, state: 'running', retention: 'active', updatedAt: 1,
    lastOwnerActivityAt: 1, recoveryDeadline: null, measurement: null, priorAttempts: [],
  };
}

function terminal(record: ProgressRecord<Details>, updatedAt: number): ProgressRecord<Details> {
  return { ...record, owner: null, revision: record.revision + 1, state: 'completed', retention: 'terminal', updatedAt };
}

async function stateDir(t: { after(fn: () => Promise<void>): void }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'insrc-task-progress-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return join(root, 'state');
}

test('Progress storage recovers an unchanged record after failure before rename and fences stale revisions', async t => {
  const dir = await stateDir(t);
  let fail = false;
  const store = await ProgressStore.open(dir, validate, limits, {
    open,
    rename: async (source, target) => {
      if (fail) throw new Error('before rename');
      await rename(source, target);
    },
  });
  const task = active('a');
  await store.commit(task, null);
  fail = true;
  await assert.rejects(store.commit(terminal(task, 2), 0), { reason: 'unavailable' });
  assert.throws(() => store.get(task.task), { reason: 'unavailable' });
  const reopened = await ProgressStore.open(dir, validate, limits);
  assert.deepEqual(reopened.get(task.task), task);
  assert.deepEqual(await readdir(dir), [progressTaskKey(task.task) + '.json']);
  await assert.rejects(reopened.commit({ ...task, revision: 2 }, 1), { reason: 'stale' });
  const current = { ...task, owner: { ownerId: 'owner', ownerEpoch: 'revalidated', ownerSequence: 0 }, revision: 1 };
  await reopened.commit(current, 0);
  assert.deepEqual(reopened.get(task.task), current);
});

test('Progress storage withholds ambiguous publication and reconciles the replaced record', async t => {
  const dir = await stateDir(t);
  let fail = false;
  const store = await ProgressStore.open(dir, validate, limits, {
    open,
    rename: async (source, target) => {
      await rename(source, target);
      if (fail) throw new Error('after rename');
    },
  });
  const task = active('a');
  await store.commit(task, null);
  const completed = terminal(task, 2);
  fail = true;
  await assert.rejects(store.commit(completed, 0), { reason: 'unavailable' });
  assert.throws(() => store.get(task.task), { reason: 'unavailable' });
  fail = false;
  await assert.rejects(store.commit(completed, 0), { reason: 'stale' });
  assert.deepEqual(store.get(task.task), completed);
  const reopened = await ProgressStore.open(dir, validate, limits);
  assert.deepEqual(reopened.get(task.task), completed);
  assert.equal((await stat(dir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(dir, progressTaskKey(task.task) + '.json'))).mode & 0o777, 0o600);
});

test('Progress storage reserves active and terminal capacity without evicting active tasks', async t => {
  const dir = await stateDir(t);
  const store = await ProgressStore.open(dir, validate, { ...limits, globalBytes: 4 * bytes });
  const first = active('a');
  const second = active('b');
  const third = active('c', 'other-project');
  await Promise.all([store.commit(first, null), store.commit(second, null)]);
  await assert.rejects(store.commit(third, null), { reason: 'capacity' });
  assert.deepEqual(store.list(), [first, second]);
  await store.commit(terminal(first, 2), 0);
  await store.commit(third, null);
  assert.equal(store.get(first.task), undefined);
  assert.deepEqual(store.get(second.task), second);
  assert.deepEqual(store.get(third.task), third);
});

test('Progress storage quarantines bounded corrupt records and rejects path substitution', async t => {
  const dir = await stateDir(t);
  const options = { ...limits, quarantineRecords: 1 };
  const store = await ProgressStore.open(dir, validate, options);
  const good = active('good');
  await store.commit(good, null);
  const goodPath = join(dir, progressTaskKey(good.task) + '.json');
  await writeFile(join(dir, 'a'.repeat(64) + '.json'), 'broken', { mode: 0o600 });
  await symlink(goodPath, join(dir, 'b'.repeat(64) + '.json'));
  const recovered = await ProgressStore.open(dir, validate, options);
  assert.deepEqual(recovered.list(), [good]);
  const files = await readdir(dir);
  assert.equal(files.filter(name => name.endsWith('.invalid')).length, 1);
  assert.equal(files.filter(name => name.endsWith('.json')).length, 1);
  const alias = dir + '-alias';
  await symlink(dir, alias);
  await assert.rejects(ProgressStore.open(alias, validate, options), { reason: 'unavailable' });
});

test('Progress storage rejects unsafe or oversized measurements before writing', async t => {
  const dir = await stateDir(t);
  const store = await ProgressStore.open(dir, validate, limits);
  const task = active('a');
  const measurement = {
    kind: 'test' as const, measuredAt: 1, meaningfulRevision: 1, lastMeaningfulAt: 1,
    phase: 'execution', activeUnit: null, counts: [], milestones: [], controls: [], details: { kind: 'test' as const },
  };
  await assert.rejects(store.commit({ ...task, measurement: {
    ...measurement, details: { kind: 'test', raw: 'private' } as Details,
  } }, null), { reason: 'unavailable' });
  await assert.rejects(store.commit({ ...task, measurement: {
    ...measurement, milestones: Array.from({ length: 32 }, () => 'é'.repeat(256)),
  } }, null), { reason: 'unavailable' });
  assert.deepEqual(await readdir(dir), []);
});
