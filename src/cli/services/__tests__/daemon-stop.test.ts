/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeStop, stopDaemonWith } from '../daemon.js';
import type { StopDeps } from '../daemon.js';
import { restart } from '../maintenance.js';

function fixture(options: { clean?: boolean | undefined; rpcError?: boolean | undefined; survives?: boolean | undefined; conflict?: string | undefined; capabilityError?: boolean | undefined } = {}) {
 let alive = true, closed = 0, killed = 0, cleaned = 0;
 const order: string[] = [];
 const target = { pid: 71, startedAt: 'kernel-incarnation', commandLine: 'node /installed/daemon/index.js', handle: {
  hasExited: async () => !alive,
  terminate: async (): Promise<'sent'> => { order.push('kill original handle'); killed++; if (options.capabilityError) throw new Error('denied'); if (!options.survives) alive = false; return 'sent'; },
  close: async () => { closed++; },
 } };
 const deps: StopDeps = {
  capture: async () => { order.push('capture'); return { target, pidFile: undefined, socketFile: undefined }; },
  requestShutdown: async () => { order.push('rpc'); if (options.rpcError) throw new Error('connection refused'); return 'replied'; },
  waitForStop: async (_ms, observed) => { assert.equal(observed, target); order.push('wait original handle'); if (options.clean) alive = false; return !alive; },
  cleanup: () => { if (options.conflict) throw new Error(options.conflict); cleaned++; },
  sleep: async () => {}, replyBoundMs: 5, stopWaitMs: 0, killWaitMs: 0,
 };
 return { deps, target, order, state: () => ({ closed, killed, cleaned }) };
}

test('stop outcome: clean and forced retain the original capability and preserve outcome shape', async () => {
 const clean = fixture({ clean: true });
 assert.deepEqual(await stopDaemonWith(clean.deps), { stopped: true, forced: false });
 assert.deepEqual(clean.state(), { closed: 1, killed: 0, cleaned: 1 });
 const forced = fixture({ rpcError: true });
 assert.deepEqual(await stopDaemonWith(forced.deps), { stopped: true, forced: true, pid: 71 });
 assert.deepEqual(forced.order, ['capture', 'rpc', 'wait original handle', 'kill original handle']);
 assert.deepEqual(forced.state(), { closed: 1, killed: 1, cleaned: 1 });
});

test('stop outcome: missing target or capture refusal never sends RPC', async () => {
 const f = fixture();
 await assert.rejects(stopDaemonWith({ ...f.deps, capture: async () => ({ target: undefined, pidFile: undefined, socketFile: undefined }) }), /not running/);
 await assert.rejects(stopDaemonWith({ ...f.deps, capture: async () => { throw new Error('unverifiable identity'); } }), /unverifiable/);
 assert.deepEqual(f.order, []);
});

test('stop outcome: capability errors or survival withhold cleanup and always release handle', async () => {
 for (const options of [{ survives: true }, { capabilityError: true }]) {
  const f = fixture(options); await assert.rejects(stopDaemonWith(f.deps), /SIGKILL/);
  assert.deepEqual(f.state(), { closed: 1, killed: 1, cleaned: 0 });
 }
});

test('Ownership or orphan-guard conflicts prevent maintenance restart', async () => {
 for (const conflict of ['replacement PID', 'orphan guard owner pid=71 start=original nonce=abc']) {
  let starts = 0; const f = fixture({ conflict });
  const result = await restart(() => {}, { stopDaemon: () => stopDaemonWith(f.deps), startDaemon: async () => { starts++; return { started: true, alreadyRunning: false, logPath: '' }; } });
  assert.equal(result.ok, false); assert.match(result.error!, /replacement|orphan/); assert.equal(starts, 0); assert.equal(f.state().closed, 1);
 }
});

test('restart: clean and forced outcomes start only after confirmed stop', async () => {
 for (const clean of [false, true]) {
  const f = fixture({ clean }); const order: string[] = [];
  const result = await restart(() => {}, { stopDaemon: async () => { const out = await stopDaemonWith(f.deps); order.push('stop'); return out; }, startDaemon: async () => { order.push('start'); return { started: true, logPath: '', alreadyRunning: false }; } });
  assert.equal(result.ok, true); assert.deepEqual(order, ['stop', 'start']); assert.deepEqual(result.steps, clean ? ['stop', 'start'] : ['stop', 'force-stop', 'start']);
 }
});

test('describeStop: says when the daemon was killed', () => {
 assert.equal(describeStop({ stopped: true, forced: false }), 'daemon stopped');
 assert.equal(describeStop({ stopped: true, forced: true, pid: 5 }), 'daemon did not stop by itself; killed (pid 5)');
});
