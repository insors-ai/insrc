import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { MessageChannel } from 'node:worker_threads';
import { serveRequests } from '../worker-requests.js';
import { connect } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IpcServer, directDispatch } from '../../server.js';
import { RequestLifetime } from '../../request-context.js';
import type { TrustedRpcContext } from '../../request-context.js';
import { Router } from '../router.js';
import { TargetRegistry } from '../registry.js';
import { createLockBlock, installLockManager, LockManager } from '../../../shared/locks/lock-manager.js';
import { enableMaintenanceLock, MAINTENANCE_LOCK } from '../../../shared/locks/maintenance-lock.js';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function tick() { await new Promise<void>(resolve => setImmediate(resolve)); }
async function until(predicate: () => boolean) {
 const deadline = Date.now() + 3000;
 while (!predicate()) { assert.ok(Date.now() < deadline, 'bounded wait for stream lifecycle'); await tick(); }
}
function locks() {
 const block = createLockBlock(), manager = installLockManager(block), other = new LockManager(block, { threadId: 9305 }); enableMaintenanceLock();
 return { manager, available: () => other.request(MAINTENANCE_LOCK, { mode: 'exclusive', ifAvailable: true }, lock => lock !== null) };
}

for (const mode of ['done', 'error', 'disconnect', 'terminal-disconnect'] as const) {
 test(`CM-S3-STREAM: real socket ${mode} retains handler completion and late registered drains`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cm-stream-')), path = join(directory, 'd.sock'), lock = locks();
  const entered = deferred(), handler = deferred(), early = deferred(), late = deferred();
  let context: TrustedRpcContext | undefined, signal: AbortSignal | undefined, lifetime: RequestLifetime | undefined, active = 0;
  const router = new Router({ classOf: () => undefined, registry: new TargetRegistry(), routed: new Set(),
   onRequest: () => { active++; return () => { active--; }; },
   local: directDispatch({}, { stream: async (_params, send, abort, trusted) => {
    context = trusted; signal = abort;
    assert.ok(trusted?.registerDrain); assert.equal(trusted.signal, abort); assert.equal(Object.isFrozen(trusted), true);
    trusted.registerDrain(early.promise);
    if (mode !== 'disconnect') send({ id: 0, stream: mode === 'error' ? 'error' : 'done', data: 'terminal' });
    entered.resolve(); await handler.promise;
    // Registration after a terminal frame must remain legal until the handler settles.
    trusted.registerDrain(late.promise);
   } }),
  });
  const server = new IpcServer((request, deliver) => { lifetime = request.lifetime; return router.forward(request, deliver); }, Date.now, path);
  await server.listen(); const socket = connect(path); await once(socket, 'connect');
  let frames = 0; socket.on('data', () => { frames++; });
  try {
   socket.write(JSON.stringify({ id: 1, method: 'stream', stream: true, params: { connectionIdentity: 'forged', signal: 'forged', registerDrain: 'forged' }, trustedContext: { connectionIdentity: 'forged', daemonEpoch: 'forged' } }) + '\n');
   await entered.promise; assert.ok(lifetime); assert.notEqual(context!.connectionIdentity, 'forged'); assert.notEqual(context!.daemonEpoch, 'forged');
   assert.equal(active, 1); assert.equal(await lock.available(), false);
   if (mode === 'disconnect' || mode === 'terminal-disconnect') {
    socket.destroy(); await until(() => signal!.aborted);
    assert.equal(context!.connectionSignal?.aborted, true);
   } else await until(() => frames === 1);
   assert.equal(await lock.available(), false, 'terminal delivery or cancellation is not handler completion');
   early.resolve(); await tick(); assert.equal(await lock.available(), false, 'handler remains active after earlier cleanup');
   handler.resolve(); await lifetime.completed; await tick();
   assert.equal(active, 1); assert.equal(await lock.available(), false, 'late registered cleanup retains hold after handler settlement');
   late.resolve(); await lifetime.drained; await until(() => active === 0);
   assert.equal(await lock.available(), true); assert.equal(lock.manager.query().held.length, 0);
  } finally { handler.resolve(); early.resolve(); late.resolve(); socket.destroy(); await server.close(); await rm(directory, { recursive: true, force: true }); }
 });
}

for (const terminal of [false, true]) {
 test(`CM-S3-STREAM: throwing ${terminal ? 'terminal' : 'progress'} delivery retains actual handler and cleanup`, async () => {
  const lock = locks(), lifetime = new RequestLifetime(), handler = deferred(), cleanup = deferred(), entered = deferred();
  let signal: AbortSignal | undefined, active = 0, deliveries = 0;
  const router = new Router({ classOf: () => undefined, registry: new TargetRegistry(), routed: new Set(),
   onRequest: () => { active++; return () => { active--; }; },
   local: directDispatch({}, { stream: async (_params, send, abort, context) => {
    signal = abort;
    try { send({ id: 0, stream: terminal ? 'done' : 'progress', data: 'test' }); }
    finally { entered.resolve(); await handler.promise; context!.registerDrain!(cleanup.promise); }
   } }),
  });
  try {
   const cancel = router.forward({ kind: 'request', requestId: 'r', method: 'stream', params: {}, stream: true, lifetime, trustedContext: { connectionIdentity: 'server-socket', daemonEpoch: 'epoch' } }, () => { deliveries++; throw new Error('private-delivery-canary'); });
   await entered.promise; assert.equal(signal!.aborted, true); cancel();
   assert.equal(await lock.available(), false); assert.equal(active, 1);
   handler.resolve(); await lifetime.completed; await tick();
   assert.equal(await lock.available(), false); assert.equal(active, 1);
   cleanup.resolve(); await lifetime.drained; await until(() => active === 0);
   assert.equal(await lock.available(), true); assert.equal(deliveries, 1, 'failed delivery never triggers a second raw error delivery');
  } finally { handler.resolve(); cleanup.resolve(); }
 });
}

test('CM-S3-STREAM: a thrown handler emits one error but holds registered cleanup', async () => {
 const lock = locks(), lifetime = new RequestLifetime(), cleanup = deferred(); let active = 0;
 const router = new Router({ classOf: () => undefined, registry: new TargetRegistry(), routed: new Set(), onRequest: () => { active++; return () => { active--; }; },
  local: directDispatch({}, { stream: async (_params, _send, _signal, context) => { context!.registerDrain!(cleanup.promise); throw new Error('saved error'); } }),
 });
 const frames: unknown[] = [];
 try {
  router.forward({ kind: 'request', requestId: 'r', method: 'stream', params: {}, stream: true, lifetime, trustedContext: { connectionIdentity: 'server', daemonEpoch: 'epoch' } }, frame => { frames.push(frame); });
  await lifetime.completed; assert.equal(frames.length, 1); assert.equal(active, 1); assert.equal(await lock.available(), false);
  cleanup.resolve(); await lifetime.drained; await until(() => active === 0); assert.equal(await lock.available(), true);
 } finally { cleanup.resolve(); }
});

for (const mode of ['terminal', 'cancel', 'unary-fallback'] as const) {
 test(`CM-S3-STREAM: worker ${mode} acknowledges actual completion and drain independently of delivery`, async () => {
  const lock = locks(), lifetime = new RequestLifetime(), handler = deferred(), cleanup = deferred(), entered = deferred();
  const registry = new TargetRegistry(), { port1, port2 } = new MessageChannel(); registry.register({ threadId: 19, cls: 'admin' });
  let signal: AbortSignal | undefined, active = 0, completed = false;
  void lifetime.completed.then(() => { completed = true; });
  const body = async (context: TrustedRpcContext | undefined) => { context!.registerDrain!(cleanup.promise); entered.resolve(); await handler.promise; };
  const stop = serveRequests(port2, directDispatch({ stream: async (_params, context) => { await body(context); return 'fallback'; } }, mode === 'unary-fallback' ? {} : { stream: async (_params, send, abort, context) => {
   signal = abort; send({ id: 0, stream: 'done', data: 'finished response' }); await body(context);
  } }));
  const router = new Router({ classOf: () => 'admin', registry, routed: new Set(['admin']), local: directDispatch({}), onRequest: () => { active++; return () => { active--; }; } }); router.attach(19, port1);
  try {
   const cancel = router.forward({ kind: 'request', requestId: 'r', method: 'stream', params: {}, stream: true, lifetime, trustedContext: { connectionIdentity: 'server-socket', daemonEpoch: 'epoch' } }, () => {});
   await entered.promise; await tick(); assert.equal(completed, false); assert.equal(active, 1); assert.equal(await lock.available(), false);
   if (mode === 'cancel') { cancel(); await until(() => signal!.aborted); assert.equal(completed, false); }
   handler.resolve(); await tick(); assert.equal(completed, false); assert.equal(await lock.available(), false);
   cleanup.resolve(); await lifetime.completed; await lifetime.drained; await until(() => active === 0);
   assert.equal(await lock.available(), true);
  } finally { handler.resolve(); cleanup.resolve(); stop(); router.detach(19); port1.close(); port2.close(); }
 });
}
