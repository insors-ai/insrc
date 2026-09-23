/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for the daemon.update / daemon.updateOutcome IPC handlers
 * (Story S001 / sc1, plan t3). The handlers are built via makeUpdateHandlers over
 * STUBBED launch + shutdown seams and mounted on a real IpcServer, then driven
 * through the same internals(server).handleMessage path server-registry.test.ts
 * uses for daemon.status — so no real helper is spawned and the test process is
 * never shut down. The result/error framing is read off a write-capturing socket.
 *
 * Run: npx tsx --test src/daemon/__tests__/update-handlers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { IpcServer } from '../server.js';
import { makeUpdateHandlers } from '../update-runner.js';
import type { IpcRequest, DaemonUpdateOutcome } from '../../shared/types.js';

/** A fake Socket that records every framed line written to it. */
class CapturingSocket extends EventEmitter {
  readonly writes: string[] = [];
  write(chunk: string): boolean { this.writes.push(chunk); return true; }
  /** The parsed envelopes written so far. */
  envelopes(): Array<{ id: number; result?: unknown; error?: string }> {
    return this.writes.flatMap(w => w.split('\n').filter(Boolean).map(l => JSON.parse(l) as { id: number; result?: unknown; error?: string }));
  }
}

interface ServerInternals {
  handleConnection(socket: CapturingSocket): void;
  handleMessage(raw: string, socket: CapturingSocket): Promise<void>;
}
function internals(server: IpcServer): ServerInternals {
  return server as unknown as ServerInternals;
}
function reqLine(method: string): string {
  const req: IpcRequest = { id: 1, method, params: {} };
  return JSON.stringify(req);
}

test('t3: daemon.update returns { launched:true } and schedules shutdown, without exiting the process', async () => {
  let shutdowns = 0;
  const handlers = makeUpdateHandlers({
    launch: () => ({ launched: true, message: 'updating' }),
    readOutcome: () => null,
    scheduleShutdown: () => { shutdowns++; },
  });
  const server = new IpcServer(handlers, {}, () => 1000);
  const sock = new CapturingSocket();
  internals(server).handleConnection(sock);

  await internals(server).handleMessage(reqLine('daemon.update'), sock);

  const env = sock.envelopes().find(e => e.id === 1)!;
  assert.deepEqual(env.result, { launched: true, message: 'updating' });
  assert.equal(env.error, undefined);
  assert.equal(shutdowns, 1, 'a successful launch schedules exactly one shutdown');
});

test('t3: a launch guard failure surfaces as a result.error envelope and does NOT schedule shutdown', async () => {
  let shutdowns = 0;
  const handlers = makeUpdateHandlers({
    launch: () => { throw new Error('daemon.update: update already in progress'); },
    readOutcome: () => null,
    scheduleShutdown: () => { shutdowns++; },
  });
  const server = new IpcServer(handlers, {}, () => 1000);
  const sock = new CapturingSocket();
  internals(server).handleConnection(sock);

  await internals(server).handleMessage(reqLine('daemon.update'), sock);

  const env = sock.envelopes().find(e => e.id === 1)!;
  assert.equal(env.result, undefined);
  assert.match(env.error ?? '', /update already in progress/);
  assert.equal(shutdowns, 0, 'a rejected launch never triggers a shutdown');
});

test('t3: daemon.updateOutcome returns the last outcome, and null when none exists', async () => {
  const outcome: DaemonUpdateOutcome = { state: 'succeeded', finishedAt: '2026-09-24T00:00:00.000Z' };

  // present
  let handlers = makeUpdateHandlers({ launch: () => ({ launched: true }), readOutcome: () => outcome, scheduleShutdown: () => {} });
  let server = new IpcServer(handlers, {}, () => 1000);
  let sock = new CapturingSocket();
  internals(server).handleConnection(sock);
  await internals(server).handleMessage(reqLine('daemon.updateOutcome'), sock);
  assert.deepEqual(sock.envelopes().find(e => e.id === 1)!.result, outcome);

  // absent → null
  handlers = makeUpdateHandlers({ launch: () => ({ launched: true }), readOutcome: () => null, scheduleShutdown: () => {} });
  server = new IpcServer(handlers, {}, () => 1000);
  sock = new CapturingSocket();
  internals(server).handleConnection(sock);
  await internals(server).handleMessage(reqLine('daemon.updateOutcome'), sock);
  assert.equal(sock.envelopes().find(e => e.id === 1)!.result, null);
});
