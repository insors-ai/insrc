/**
 * Story E20261016315d510c:S003 / t8 — the daemon-backed ConfigGateway carries the repo-scoped
 * tracker rows: catalog() keeps repoFields, repoSettings() calls repo.settings.get and
 * writeRepoSetting() calls repo.settings.set. Over a fake shared client; no daemon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDaemonConfigGateway } from '../gateway.js';
import { REPO_TRACKER_FIELDS } from '../../../../src/config/repo-fields.js';
import { buildSettingsCatalog } from '../../../../src/config/settings-catalog.js';
import type { IpcClient } from '../../../../src/shared/ipc-client.js';

function fakeClient(replies: Record<string, unknown | ((params: unknown) => unknown)>): { client: IpcClient; calls: Array<{ method: string; params: unknown }> } {
  const calls: Array<{ method: string; params: unknown }> = [];
  const client = {
    rpc: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      const r = replies[method];
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? (r as (p: unknown) => unknown)(params) : r;
    },
  } as unknown as IpcClient;
  return { client, calls };
}

test('catalog keeps repoFields from the daemon payload and is empty when an older daemon omits them', async () => {
  const payload = buildSettingsCatalog({ logLevel: 'debug' });
  const { client } = fakeClient({ 'config.catalog': payload });
  const snap = await createDaemonConfigGateway(client).catalog();
  assert.deepEqual(snap.repoFields, REPO_TRACKER_FIELDS);
  assert.equal(snap.values.get('logLevel'), 'debug', 'existing values are unaffected');

  const old = fakeClient({ 'config.catalog': { values: { logLevel: 'info' } } });
  const oldSnap = await createDaemonConfigGateway(old.client).catalog();
  assert.deepEqual(oldSnap.repoFields, []);
  assert.equal(oldSnap.values.get('logLevel'), 'info');

  const none = fakeClient({ 'config.catalog': undefined });
  assert.deepEqual((await createDaemonConfigGateway(none.client).catalog()).repoFields, []);
});

test('the gateway calls repo.settings.get and repo.settings.set with the repo path, key and value', async () => {
  const payload = { repo: '/r', values: {}, resolved: { type: 'none', source: 'default-config' }, signin: { state: 'disabled' }, policy: { ok: true, mode: 'none' } };
  const { client, calls } = fakeClient({
    'repo.settings.get': { ok: true, payload },
    'repo.settings.set': { ok: true, payload },
  });
  const gw = createDaemonConfigGateway(client);

  assert.deepEqual(await gw.repoSettings('/r'), { ok: true, payload });
  assert.deepEqual(await gw.writeRepoSetting('/r', 'ghHost', 'ghe.example.com'), { ok: true });
  assert.deepEqual(await gw.writeRepoSetting('/r', 'ghPath', null), { ok: true });
  assert.deepEqual(calls, [
    { method: 'repo.settings.get', params: { repo: '/r' } },
    { method: 'repo.settings.set', params: { repo: '/r', key: 'ghHost', value: 'ghe.example.com' } },
    { method: 'repo.settings.set', params: { repo: '/r', key: 'ghPath', value: null } },
  ]);
});

test('a daemon refusal becomes a reason-carrying result and a socket rejection propagates', async () => {
  const refusal = { ok: false, error: { code: 'invalid-value', message: 'branchPattern must not start with a slash' } };
  const { client } = fakeClient({ 'repo.settings.set': refusal, 'repo.settings.get': refusal });
  const gw = createDaemonConfigGateway(client);
  assert.deepEqual(await gw.writeRepoSetting('/r', 'branchPattern', '/x'), { ok: false, reason: 'branchPattern must not start with a slash' });
  assert.deepEqual(await gw.repoSettings('/r'), refusal, 'a get refusal is returned as data for the renderer to show');

  const down = fakeClient({ 'repo.settings.get': new Error('daemon is not running'), 'repo.settings.set': new Error('daemon is not running') });
  const gw2 = createDaemonConfigGateway(down.client);
  await assert.rejects(() => gw2.repoSettings('/r'), /daemon is not running/);
  await assert.rejects(() => gw2.writeRepoSetting('/r', 'ghHost', 'x'), /daemon is not running/);
});
