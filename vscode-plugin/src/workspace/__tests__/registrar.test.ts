/**
 * Story E20260921ad0d45c9:S004 / t1 — createWorkspaceRegistrar tests.
 * Fake IpcClient recording repo.list/repo.add — no live daemon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorkspaceRegistrar } from '../registrar.js';
import type { IpcClient, DaemonStatus, DaemonReachability } from '../../../../src/shared/ipc-client.js';

interface Call { method: string; params: unknown }

/** A fake IpcClient whose rpc() is scripted per method. */
function fakeClient(handlers: Record<string, (params: unknown) => unknown>): { client: IpcClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: IpcClient = {
    async rpc<T>(method: string, params?: unknown): Promise<T> {
      calls.push({ method, params });
      const h = handlers[method];
      if (h === undefined) throw new Error(`unexpected rpc ${method}`);
      return h(params) as T;
    },
    status: async () => ({ uptime: 0 } as unknown as DaemonStatus),
    reachability: async () => 'running' as DaemonReachability,
    update: async () => ({ launched: false }),
    updateOutcome: async () => null,
  };
  return { client, calls };
}

const ROOT = '/home/u/projects/app';

test('state(root) returns registered:true iff a repo.list row path equals the normalized root; false otherwise', async () => {
  const present = createWorkspaceRegistrar({
    client: fakeClient({ 'repo.list': () => [{ path: '/home/u/other' }, { path: ROOT }] }).client,
  });
  assert.deepEqual(await present.state(ROOT), { root: ROOT, registered: true });

  const absent = createWorkspaceRegistrar({
    client: fakeClient({ 'repo.list': () => [{ path: '/home/u/other' }] }).client,
  });
  assert.deepEqual(await absent.state(ROOT), { root: ROOT, registered: false });
});

test('state(root) returns registered:false (never throws) when repo.list rejects or returns a non-array', async () => {
  const down = createWorkspaceRegistrar({
    client: fakeClient({ 'repo.list': () => { throw new Error('daemon is not running'); } }).client,
  });
  assert.deepEqual(await down.state(ROOT), { root: ROOT, registered: false });

  const weird = createWorkspaceRegistrar({
    client: fakeClient({ 'repo.list': () => ({ error: 'drift' }) }).client,
  });
  assert.deepEqual(await weird.state(ROOT), { root: ROOT, registered: false });
});

test('state(root) normalizes both sides so a trailing-slash / "." difference still matches a registered row', async () => {
  const reg = createWorkspaceRegistrar({
    client: fakeClient({ 'repo.list': () => [{ path: '/home/u/projects/app' }] }).client,
  });
  assert.equal((await reg.state('/home/u/projects/app/')).registered, true, 'trailing slash matches');
  assert.equal((await reg.state('/home/u/projects/./app')).registered, true, '"." segment matches');
});

test('register(root) calls rpc(repo.add, { path: root }) with NO steering key and returns { root, registered:true } on { ok:true }', async () => {
  const { client, calls } = fakeClient({ 'repo.add': () => ({ ok: true }) });
  const reg = createWorkspaceRegistrar({ client });
  assert.deepEqual(await reg.register(ROOT), { root: ROOT, registered: true });

  const add = calls.find((c) => c.method === 'repo.add')!;
  assert.deepEqual(add.params, { path: ROOT }, 'exactly { path } — no steering key');
  assert.equal('steering' in (add.params as object), false, 'no steering (no daemon-side host wiring)');
});

test('register(root) surfaces the error (does not mark registered) when repo.add rejects', async () => {
  const reg = createWorkspaceRegistrar({
    client: fakeClient({ 'repo.add': () => { throw new Error('rejected repo.add: invalid path'); } }).client,
  });
  await assert.rejects(() => reg.register(ROOT), /invalid path/);
});
