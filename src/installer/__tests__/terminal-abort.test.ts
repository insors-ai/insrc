import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { terminalAbort } from '../terminal-abort.js';

class Terminal extends EventEmitter { close() { this.emit('close'); } }
test('terminal-eof-and-interrupt-request-one-drain-and-restore-handlers', () => {
  for (const event of ['close', 'SIGINT']) {
    const terminal = new Terminal(), before = ['SIGINT', 'SIGHUP', 'SIGTERM'].map(name => process.listenerCount(name)), messages: string[] = [];
    const owner = terminalAbort(terminal as Parameters<typeof terminalAbort>[0], text => messages.push(text));
    try {
      assert.deepEqual(['SIGINT', 'SIGHUP', 'SIGTERM'].map(name => process.listenerCount(name)), before.map(count => count + 1));
      terminal.emit(event); terminal.emit(event); assert.equal(owner.signal.aborted, true); assert.equal(messages.length, 1); assert.match(messages[0]!, /draining finite work/);
    } finally { owner.dispose(); }
    assert.deepEqual(['SIGINT', 'SIGHUP', 'SIGTERM'].map(name => process.listenerCount(name)), before);
  }
});
test('normal-terminal-close-removes-install-handlers-before-tui-handoff', () => {
  const terminal = new Terminal(), before = ['SIGINT', 'SIGHUP', 'SIGTERM'].map(name => process.listenerCount(name));
  const owner = terminalAbort(terminal as Parameters<typeof terminalAbort>[0], () => { throw new Error('normal close must not print cancellation'); });
  owner.close(); assert.equal(owner.signal.aborted, false);
  assert.deepEqual(['SIGINT', 'SIGHUP', 'SIGTERM'].map(name => process.listenerCount(name)), before);
  owner.dispose(); assert.equal(owner.signal.aborted, false);
});
