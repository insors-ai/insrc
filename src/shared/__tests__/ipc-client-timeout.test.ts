/**
 * Story E20261016315d510c:S003 / t4 — the opt-in deadline on the shared `rpc`.
 * Fake sockets only; no live daemon.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';

import { rpc } from '../ipc-client.js';

class FakeSocket extends EventEmitter {
  public written: string[] = [];
  public ended = false;
  public destroyed = 0;
  write(chunk: string): boolean { this.written.push(chunk); return true; }
  end(): void { this.ended = true; }
  destroy(): void { this.destroyed++; }
  asSocket(): Socket { return this as unknown as Socket; }
}

const reply = (id: number, result: unknown): string => JSON.stringify({ id, result }) + '\n';

test('rpc without opts is unchanged for a reply, an error and a split reply', async () => {
  // A reply: resolves, ends the socket, adds no timer, no end/close listener and never destroys.
  const ok = new FakeSocket();
  const p = rpc<{ v: number }>('m', {}, () => ok.asSocket());
  assert.equal(ok.listenerCount('end'), 0);
  assert.equal(ok.listenerCount('close'), 0);
  ok.emit('connect');
  ok.emit('data', Buffer.from(reply(1, { v: 1 })));
  assert.deepEqual(await p, { v: 1 });
  assert.equal(ok.ended, true);
  assert.equal(ok.destroyed, 0);

  // An error: the same messages as before.
  const refused = new FakeSocket();
  const pr = rpc('m', {}, () => refused.asSocket());
  refused.emit('error', Object.assign(new Error('x'), { code: 'ECONNREFUSED' }));
  await assert.rejects(pr, /daemon is not running/);
  const dErr = new FakeSocket();
  const pe = rpc('m', {}, () => dErr.asSocket());
  dErr.emit('data', Buffer.from(JSON.stringify({ id: 1, error: 'boom' }) + '\n'));
  await assert.rejects(pe, /^Error: boom$/);

  // A reply split across data events.
  const split = new FakeSocket();
  const ps = rpc<{ v: number }>('m', {}, () => split.asSocket());
  const line = reply(1, { v: 2 });
  split.emit('data', Buffer.from(line.slice(0, 5)));
  split.emit('data', Buffer.from(line.slice(5)));
  assert.deepEqual(await ps, { v: 2 });

  // An undefined timeoutMs is the same as no opts.
  const u = new FakeSocket();
  const pu = rpc('m', {}, () => u.asSocket(), {});
  assert.equal(u.listenerCount('close'), 0);
  u.emit('data', Buffer.from(reply(1, 1)));
  assert.equal(await pu, 1);
  assert.equal(u.destroyed, 0);
});

test('rpc with timeoutMs rejects on silence and on early close and cleans up', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cleared = mock.method(globalThis, 'clearTimeout');
  try {
    // Silence: the deadline rejects with a timeout error.
    const silent = new FakeSocket();
    const p1 = rpc('m', {}, () => silent.asSocket(), { timeoutMs: 1000 });
    silent.emit('connect');
    t.mock.timers.tick(999);
    assert.equal(silent.destroyed, 0, 'not before the deadline');
    t.mock.timers.tick(1);
    await assert.rejects(p1, /timeout/);
    assert.equal(silent.destroyed, 1);

    // The socket ends before a reply.
    const ended = new FakeSocket();
    const calls0 = cleared.mock.callCount();
    const p2 = rpc('m', {}, () => ended.asSocket(), { timeoutMs: 1000 });
    ended.emit('end');
    await assert.rejects(p2, /closed/);
    assert.equal(ended.destroyed, 1);
    assert.ok(cleared.mock.callCount() > calls0, 'timer cleared on early end');

    // The socket closes before a reply; a later close event does not destroy twice.
    const closed = new FakeSocket();
    const p3 = rpc('m', {}, () => closed.asSocket(), { timeoutMs: 1000 });
    closed.emit('close');
    await assert.rejects(p3, /closed/);
    closed.emit('close');
    assert.equal(closed.destroyed, 1);

    // A reply inside the deadline resolves, destroys the socket and clears the timer.
    const fast = new FakeSocket();
    const before = cleared.mock.callCount();
    const p4 = rpc<number>('m', {}, () => fast.asSocket(), { timeoutMs: 1000 });
    fast.emit('connect');
    t.mock.timers.tick(500);
    fast.emit('data', Buffer.from(reply(1, 42)));
    assert.equal(await p4, 42);
    assert.equal(fast.destroyed, 1);
    assert.ok(cleared.mock.callCount() > before, 'timer cleared on a reply');
    t.mock.timers.tick(5000);
    assert.equal(fast.destroyed, 1, 'the cleared timer does not fire later');

    // A daemon error and a connection error are also cleaned up.
    const dErr = new FakeSocket();
    const p5 = rpc('m', {}, () => dErr.asSocket(), { timeoutMs: 1000 });
    dErr.emit('data', Buffer.from(JSON.stringify({ id: 1, error: 'boom' }) + '\n'));
    await assert.rejects(p5, /boom/);
    assert.equal(dErr.destroyed, 1);
    const cErr = new FakeSocket();
    const p6 = rpc('m', {}, () => cErr.asSocket(), { timeoutMs: 1000 });
    cErr.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' }));
    await assert.rejects(p6, /daemon is not running/);
    assert.equal(cErr.destroyed, 1);
  } finally { cleared.mock.restore(); }
});
