/**
 * Story E20260921ad0d45c9:S001 / t1 — the shared ipc-client (sc1 SharedIpcClient).
 *
 * Exercises the `rpc` fn moved here from src/cli/client.ts and the
 * `createIpcClient` factory (status + reachability) over a FAKE socket seam, so
 * no live daemon is needed. Also asserts the k5 thin-boundary invariant by
 * source-scanning the module's import graph.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { rpc, createIpcClient, sockFilePath } from '../ipc-client.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..');

/**
 * A fake `net.Socket` good enough for `rpc`: it records what was written and
 * lets the test drive `connect` / `data` / `error` events. `end()` is a no-op.
 */
class FakeSocket extends EventEmitter {
  public written: string[] = [];
  public ended = false;
  write(chunk: string): boolean {
    this.written.push(chunk);
    return true;
  }
  end(): void {
    this.ended = true;
  }
  // Drive the happy path: emit connect (so rpc writes the request), then a data line.
  respondWith(line: string): void {
    this.emit('connect');
    this.emit('data', Buffer.from(line + '\n'));
  }
}

function errno(code: string): NodeJS.ErrnoException {
  const e = new Error(code) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

test('rpc resolves the daemon result and writes the { label, pid } identity envelope on connect', async () => {
  const sock = new FakeSocket();
  const p = rpc<{ ok: boolean }>('daemon.status', { a: 1 }, () => sock as unknown as import('node:net').Socket);
  sock.respondWith(JSON.stringify({ id: 1, result: { ok: true } }));
  const result = await p;
  assert.deepEqual(result, { ok: true });

  assert.equal(sock.written.length, 1);
  const req = JSON.parse(sock.written[0]!);
  assert.equal(req.method, 'daemon.status');
  assert.deepEqual(req.params, { a: 1 });
  assert.equal(req.client.label, 'cli');
  assert.equal(req.client.pid, process.pid);
  assert.ok(sock.ended, 'socket is ended after the first response line');
});

test('rpc rejects with "daemon is not running" on ENOENT / ECONNREFUSED', async () => {
  for (const code of ['ENOENT', 'ECONNREFUSED']) {
    const sock = new FakeSocket();
    const p = rpc('daemon.status', {}, () => sock as unknown as import('node:net').Socket);
    sock.emit('error', errno(code));
    await assert.rejects(p, /daemon is not running/);
  }
});

test('rpc surfaces a daemon-side error and an unparseable line distinctly', async () => {
  const errSock = new FakeSocket();
  const pErr = rpc('x', {}, () => errSock as unknown as import('node:net').Socket);
  errSock.respondWith(JSON.stringify({ id: 1, error: 'boom' }));
  await assert.rejects(pErr, /^Error: boom$/);

  const junkSock = new FakeSocket();
  const pJunk = rpc('x', {}, () => junkSock as unknown as import('node:net').Socket);
  junkSock.respondWith('not json');
  await assert.rejects(pJunk, /invalid response from daemon/);
});

test('IpcClient.status returns the wire DaemonStatus via daemon.status', async () => {
  const sock = new FakeSocket();
  const client = createIpcClient(() => sock as unknown as import('node:net').Socket);
  const p = client.status();
  sock.respondWith(JSON.stringify({ id: 1, result: { uptime: 61, repos: [], queueDepth: 0, embeddingsPending: 0 } }));
  const status = await p;
  assert.equal(status.uptime, 61);
  assert.equal(status.queueDepth, 0);
});

test('IpcClient.reachability derives running / stopped / errored and never throws', async () => {
  // running: status resolves
  {
    const sock = new FakeSocket();
    const client = createIpcClient(() => sock as unknown as import('node:net').Socket);
    const p = client.reachability();
    sock.respondWith(JSON.stringify({ id: 1, result: { uptime: 1, repos: [], queueDepth: 0, embeddingsPending: 0 } }));
    assert.equal(await p, 'running');
  }
  // stopped: the "daemon is not running" throw (socket down)
  {
    const sock = new FakeSocket();
    const client = createIpcClient(() => sock as unknown as import('node:net').Socket);
    const p = client.reachability();
    sock.emit('error', errno('ECONNREFUSED'));
    assert.equal(await p, 'stopped');
  }
  // errored: any other failure (a daemon-side error line)
  {
    const sock = new FakeSocket();
    const client = createIpcClient(() => sock as unknown as import('node:net').Socket);
    const p = client.reachability();
    sock.respondWith(JSON.stringify({ id: 1, error: 'internal' }));
    assert.equal(await p, 'errored');
  }
});

test('sockFilePath resolves to the daemon socket', () => {
  assert.ok(sockFilePath.endsWith('daemon.sock'), `expected a daemon.sock path, got ${sockFilePath}`);
});

// ---- k5 thin-boundary + no-mirrored-types source scan ---------------------

test('src/cli/client.ts re-exports rpc from the shared ipc-client (CLI/TUI surface preserved)', () => {
  const cli = readFileSync(join(SRC, 'cli', 'client.ts'), 'utf8');
  assert.match(cli, /export \{ rpc \} from '\.\.\/shared\/ipc-client\.js'/);
});

test('src/shared/ipc-client imports only node:net + shared types/paths (no daemon internals/indexer/storage)', () => {
  const mod = readFileSync(join(SRC, 'shared', 'ipc-client.ts'), 'utf8');
  const importLines = mod.split('\n').filter((l) => /^\s*import\b/.test(l) || /^\s*export\b.*\bfrom\b/.test(l));
  for (const line of importLines) {
    const m = line.match(/from '([^']+)'/);
    if (!m) continue;
    const spec = m[1]!;
    const ok = spec === 'node:net' || spec === './types.js' || spec === './paths.js';
    assert.ok(ok, `unexpected import in the thin ipc-client boundary: ${spec}`);
  }
  // It re-exports the real IPC types (no parallel definitions).
  assert.match(mod, /export type \{ IpcRequest, IpcResponse, DaemonStatus \} from '\.\/types\.js'/);
});
