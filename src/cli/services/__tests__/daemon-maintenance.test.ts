import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('retained status backup and compact services round-trip their wire payloads and refusals over isolated IPC', async () => {
  const home = mkdtempSync(join(tmpdir(), 'insrc-maintenance-rpc-'));
  process.env['HOME'] = home;
  mkdirSync(join(home, '.insrc'));
  const { IpcServer, directDispatch } = await import('../../../daemon/server.js');
  const { getStatus, backup, compact } = await import('../daemon.js');
  const calls: { method: string; params: unknown }[] = [];
  let busy = false;
  const status = { uptime: 12, repos: [], queueDepth: 0, embeddingsPending: 0 };
  const snapshot = { targetDir: '/snapshot', lmdbBytes: 20, lanceBytes: 30, elapsedMs: 4 };
  const compacted = { beforeBytes: 30, afterBytes: 10, savedBytes: 20, elapsedMs: 2 };
  const server = new IpcServer(directDispatch({
    'daemon.status': async () => status,
    'daemon.backup': async params => { calls.push({ method: 'backup', params }); return snapshot; },
    'daemon.compact': async params => { calls.push({ method: 'compact', params }); if (busy) throw new Error('indexer busy'); return compacted; },
  }));
  try {
    await server.listen();
    assert.deepEqual(await getStatus(), status);
    assert.deepEqual(await backup('fixture-snapshot'), snapshot);
    assert.deepEqual(calls[0], { method: 'backup', params: { path: resolve('fixture-snapshot') } });
    assert.deepEqual(await backup('/absolute-fixture-snapshot'), snapshot);
    assert.deepEqual(calls[1], { method: 'backup', params: { path: '/absolute-fixture-snapshot' } });
    assert.deepEqual(await compact(), compacted);
    assert.equal(calls[2]?.method, 'compact');
    busy = true;
    await assert.rejects(compact(), /indexer busy/);
  } finally { server.disconnectClients(); await server.close(); rmSync(home, { recursive: true, force: true }); }
});
