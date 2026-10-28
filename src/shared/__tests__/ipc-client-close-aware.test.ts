/**
 * Story s10 / t15 — the opt-in closeAware on the shared `rpc`: it rejects when the socket ends or closes before a reply, and sets no
 * timer. Without it the request is unchanged. Fake sockets only; no live daemon.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';

import { rpc } from '../ipc-client.js';

class FakeSocket extends EventEmitter {
  public destroyed = 0;
  public ended = false;
  write(): boolean { return true; }
  end(): void { this.ended = true; }
  destroy(): void { this.destroyed++; }
  asSocket(): Socket { return this as unknown as Socket; }
}

const reply = (result: unknown): string => JSON.stringify({ id: 1, result }) + '\n';

test('ipc-client-close-aware.test.ts: rpc with closeAware rejects on premature close and sets no timer; rpc without it is unchanged', async () => {
  const timers = mock.method(globalThis, 'setTimeout');
  try {
    // an early close rejects, with no timer set and the socket destroyed
    const closing = new FakeSocket();
    const p = rpc('m', {}, () => closing.asSocket(), { closeAware: true });
    closing.emit('connect');
    closing.emit('close');
    await assert.rejects(p, /closed the connection before replying/);
    assert.equal(closing.destroyed, 1);
    // so does an end
    const ending = new FakeSocket();
    const pe = rpc('m', {}, () => ending.asSocket(), { closeAware: true });
    ending.emit('end');
    await assert.rejects(pe, /closed the connection before replying/);
    // a reply still resolves; a close after the reply changes nothing
    const ok = new FakeSocket();
    const po = rpc<number>('m', {}, () => ok.asSocket(), { closeAware: true });
    ok.emit('data', Buffer.from(reply(7)));
    assert.equal(await po, 7);
    ok.emit('close');
    assert.equal(timers.mock.calls.length, 0, 'closeAware sets no timer');

    // without closeAware: no close listener, no destroy, and a close is not an error
    const plain = new FakeSocket();
    const pp = rpc<number>('m', {}, () => plain.asSocket());
    assert.equal(plain.listenerCount('close'), 0);
    plain.emit('data', Buffer.from(reply(1)));
    assert.equal(await pp, 1);
    assert.equal(plain.destroyed, 0);
    // closeAware: false is the same as absent
    const off = new FakeSocket();
    const pf = rpc<number>('m', {}, () => off.asSocket(), { closeAware: false });
    assert.equal(off.listenerCount('close'), 0);
    off.emit('data', Buffer.from(reply(2)));
    assert.equal(await pf, 2);
  } finally { timers.mock.restore(); }
});
