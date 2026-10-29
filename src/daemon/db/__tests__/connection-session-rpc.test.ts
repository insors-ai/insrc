import { createTemporaryOverlay } from '../session-entries.js';
import type { TemporaryConnectionOverlay } from '../session-entries.js';
import '../drivers/index.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { MessageChannel } from 'node:worker_threads';
import { connectionManagementEnablement } from '../management-enablement.js';
import { ConnectionSessionRpc } from '../../connection-session-rpc.js';
import { connectionManagementHandlers } from '../../connection-management-rpc.js';
import { IpcServer, directDispatch } from '../../server.js';
import { Router } from '../../threads/router.js';
import { TargetRegistry } from '../../threads/registry.js';
import { wireRequest } from '../../threads/channel.js';
import { parseSessionOpen, parseSessionResume, parseSessionAttach, parseSessionDelegate, parseSessionEmpty } from '../../../shared/connection-management-wire.js';
import type { OpenConnectionSessionResult, SessionDataAttach } from '../../../shared/connection-management.js';
import type { TrustedRpcContext } from '../../request-context.js';

async function client(path: string) {
 const socket = createConnection(path); await once(socket, 'connect');
 let sequence = 0, buffer = '';
 const pending = new Map<number, (value: any) => void>();
 socket.on('data', chunk => {
  buffer += chunk.toString();
  for (;;) {
   const end = buffer.indexOf('\n'); if (end < 0) break;
   const reply = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
   pending.get(reply.id)?.(reply.stream ? reply : reply.result); pending.delete(reply.id);
  }
 });
 return {
  call<T = any>(method: string, params: unknown = {}, stream = false): Promise<T> {
   return new Promise(resolve => { const id = ++sequence; pending.set(id, resolve);
    socket.write(JSON.stringify({ id, method, params, stream, trustedContext: { connectionIdentity: 'forged', daemonEpoch: 'forged' }, client: { label: 'same-label', pid: 7 } }) + '\n'); });
  },
  async close() { const closed = once(socket, 'close'); socket.destroy(); await closed; },
 };
}

test('CM-S3-AUTH: strict bounded session decoding rejects hostile shapes before eligibility', async () => {
 let reads = 0, eligibility = 0, allocations = 0;
 const accessor = Object.defineProperty({}, 'repoRoot', { enumerable: true, get() { reads++; return '/root'; } });
 const hidden = Object.defineProperty({ repoRoot: '/root' }, 'extra', { value: 'hidden' });
 const symbol = { repoRoot: '/root', [Symbol('authority')]: true };
 const runtime = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async () => { eligibility++; return true; }, createOverlay: () => { allocations++; return {}; } });
 const context = { connectionIdentity: 'a', daemonEpoch: 'epoch' };
 try {
  for (const value of [undefined, null, [], {}, accessor, hidden, symbol, { repoRoot: {} }, { repoRoot: '/a', extra: true }, { repoRoot: 'a'.repeat(16385) }, { repoRoot: '\u0000private-canary' }, { repoRoot: '\ud800'.repeat(16384) }]) {
   assert.throws(() => parseSessionOpen(value));
   assert.equal((await runtime.call('db.connections.v2.session.open', value, context) as { code: string }).code, 'invalid-input');
  }
  const token = { sessionHandle: 'a'.repeat(43), capability: 'b'.repeat(43), daemonEpoch: 'epoch' };
  assert.deepEqual(parseSessionResume(token), token);
  assert.deepEqual(parseSessionAttach({ ...token, repoRoot: '/root' }), { ...token, repoRoot: '/root' });
  for (const value of [{ ...token, capability: 'x' }, { ...token, daemonEpoch: 'x'.repeat(129) }, { ...token, extra: true }]) assert.throws(() => parseSessionResume(value));
  assert.throws(() => parseSessionDelegate({ repoRoot: '/root', audience: 'trusted-by-client' }));
  assert.throws(() => parseSessionEmpty({ sessionHandle: token.sessionHandle }));
  assert.equal(reads, 0); assert.equal(eligibility, 0); assert.equal(allocations, 0);
  assert.equal((await connectionManagementEnablement(undefined, ['sc5'])).ready, false, 'release stays disabled');
 } finally { await runtime.close(); }
});

test('CM-S3-AUTH: socket session admission stays on main and refuses persistent runners and fallback', async () => {
 const directory = realpathSync(mkdtempSync(join(tmpdir(), 'cm-session-rpc-'))), root = join(directory, 'root'), other = join(directory, 'other');
 mkdirSync(root); mkdirSync(other);
 let eligibility = 0, allocations = 0, workerCalls = 0, savedWrites = 0, forbiddenCalls = 0;
 const runtime = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async value => { eligibility++; return value === root || value === other; }, createOverlay: () => { allocations++; return new Map(); } });
 const registry = new TargetRegistry(), { port1, port2 } = new MessageChannel();
 registry.register({ threadId: 17, cls: 'session' });
 port2.on('message', request => { workerCalls++; port2.postMessage({ kind: 'reply', requestId: request.requestId, result: 'worker' }); });
 let captured: TrustedRpcContext | undefined;
 const forbidden = ['workflow.step', 'build.step', 'review.step', 'tracker.push', 'analyze.status', 'step.call'];
 const local = directDispatch({ ...connectionManagementHandlers({ sessionRuntime: runtime }),
  'db.listDriverKinds': async (_params, context) => { captured = context; return { role: context?.connectionSession?.role ?? 'saved' }; },
  'db.saveConnection': async () => { savedWrites++; return 'saved-main'; },
  ...Object.fromEntries(forbidden.map(method => [method, async () => { forbiddenCalls++; return 'must-not-run'; }])),
 });
 const router = new Router({ classOf: () => 'session', registry, routed: new Set(['session']), local }); router.attach(17, port1);
 const server = new IpcServer(runtime.forward(router.forward), Date.now, join(directory, 'd.sock'));
 let closed!: () => void; let closeEvent = new Promise<void>(resolve => { closed = resolve; });
 server.onConnectionClose(context => { runtime.disconnect(context); closed(); });
 await server.listen();
 const control = await client(join(directory, 'd.sock')), data = await client(join(directory, 'd.sock')), legacy = await client(join(directory, 'd.sock')), failed = await client(join(directory, 'd.sock'));
 try {
  assert.equal(await legacy.call('legacy.echo'), 'worker');
  assert.equal(await legacy.call('db.saveConnection'), 'saved-main'); assert.equal(savedWrites, 1);
  const opened = await control.call<OpenConnectionSessionResult>('db.connections.v2.session.open', { repoRoot: root });
  assert.match(opened.sessionHandle, /^[A-Za-z0-9_-]{43}$/); assert.equal(allocations, 1);
  const delegated = await control.call<SessionDataAttach>('db.connections.v2.session.delegate', { repoRoot: root, audience: 'workbench-ui' });
  const attach = { sessionHandle: delegated.sessionHandle, capability: delegated.capability, daemonEpoch: delegated.daemonEpoch, repoRoot: root };
  const before = eligibility;
  assert.equal((await failed.call('db.connections.v2.session.attach', { ...attach, daemonEpoch: 'wrong' })).code, 'session-expired');
  assert.equal(eligibility, before);
  assert.equal((await failed.call('legacy.echo')).code, 'upgrade-required');
  assert.equal((await data.call('db.connections.v2.session.attach', attach)).attached, true);
  assert.deepEqual(await data.call('db.listDriverKinds'), { role: 'data' });
  assert.ok(captured?.connectionSession); assert.equal(Object.isFrozen(captured.connectionSession), true);
  assert.notEqual(captured.connectionIdentity, 'forged'); assert.equal(captured.connectionSession.access.lookupRoot, root);
  assert.throws(() => wireRequest({ kind: 'request', requestId: 'x', method: 'x', params: {}, stream: false, trustedContext: captured }));
  assert.deepEqual(wireRequest({ kind: 'request', requestId: 'x', method: 'x', params: {}, stream: false, trustedContext: { connectionIdentity: 'legacy', daemonEpoch: 'epoch', connectionSignal: new AbortController().signal } }).trustedContext, { connectionIdentity: 'legacy', daemonEpoch: 'epoch' });
  const beforeRoot = eligibility;
  assert.equal((await data.call('db.connections.v2.capabilities', { repoRoot: other })).code, 'session-expired'); assert.equal(eligibility, beforeRoot);
  for (const method of [...forbidden, 'db.saveConnection', 'unclassified.newMethod']) assert.equal((await data.call(method)).code, 'upgrade-required');
  const frame = await data.call('workflow.step', {}, true); assert.equal(frame.stream, 'error'); assert.equal(frame.data.code, 'upgrade-required');
  assert.equal(forbiddenCalls, 0); assert.equal(savedWrites, 1); assert.equal(workerCalls, 1);
  assert.deepEqual(await control.call('db.listDriverKinds'), { role: 'control' });
  // The completed call's trusted context must still become invalid on transport close.
  const bound = captured!; closeEvent = new Promise<void>(resolve => { closed = resolve; });
  await control.close(); await closeEvent;
  assert.equal(bound.connectionSignal?.aborted, true); assert.throws(() => bound.connectionSession!.assertActive());
  const unknown = await client(join(directory, 'd.sock'));
  try { assert.equal((await unknown.call('db.connections.v2.session.future')).code, 'upgrade-required'); assert.equal((await unknown.call('legacy.echo')).code, 'upgrade-required'); } finally { await unknown.close(); }
 } finally {
  await Promise.all([data.close(), legacy.close(), failed.close()]);
  await server.close(); await runtime.close(); port1.close(); port2.close(); rmSync(directory, { recursive: true, force: true });
 }
});

test('CM-S3-AUTH: disconnect during eligibility cannot publish a session or overlay', async () => {
 const directory = realpathSync(mkdtempSync(join(tmpdir(), 'cm-session-late-'))), root = join(directory, 'root'); mkdirSync(root);
 let enter!: () => void, release!: (value: boolean) => void, allocations = 0;
 const entered = new Promise<void>(resolve => { enter = resolve; }), decision = new Promise<boolean>(resolve => { release = resolve; });
 const runtime = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async () => { enter(); return decision; }, createOverlay: () => { allocations++; return {}; } });
 const controller = new AbortController();
 const pending = runtime.call('db.connections.v2.session.open', { repoRoot: root }, { connectionIdentity: 'late', daemonEpoch: 'epoch', connectionSignal: controller.signal });
 try { await entered; controller.abort(); release(true); assert.equal((await pending as { code: string }).code, 'session-expired'); assert.equal(allocations, 0); }
 finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('CM-S4-INPUT/RPC: temporary socket removal enforces sc6 owner audience root and no saved downgrade',async()=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),'cm-remove-rpc-'))),root=join(directory,'root');mkdirSync(root);
 let enabled=false,overlay!:TemporaryConnectionOverlay;
 const runtime=new ConnectionSessionRpc({enabled:async()=>true,removalEnabled:async()=>enabled,isRegistered:async value=>value===root,createOverlay:(...args)=>{overlay=createTemporaryOverlay(...args);return overlay;},dropOverlay:value=>value.close()});
 const server=new IpcServer(runtime.forward(directDispatch(connectionManagementHandlers({sessionRuntime:runtime}))),Date.now,join(directory,'d.sock'));
 server.onConnectionClose(context=>runtime.disconnect(context));await server.listen();
 const control=await client(join(directory,'d.sock')),mcp=await client(join(directory,'d.sock')),foreign=await client(join(directory,'d.sock'));
 try{
  await control.call('db.connections.v2.session.open',{repoRoot:root});
  const key={repoRoot:root,scope:'temporary' as const,id:'row'};
  const row=overlay.commit(await overlay.prepare({key,mode:'create',publicPatch:{kind:'postgres',endpoint:'postgres://host/db'}}));
  assert.equal((await control.call('db.connections.v2.ticket',{key,mode:'remove'})).code,'upgrade-required');
  enabled=true;
  const ticket=await control.call('db.connections.v2.ticket',{key,mode:'remove'});assert.equal(ticket.mode,'remove');
  const delegation=await control.call('db.connections.v2.session.delegate',{repoRoot:root,audience:'mcp-unverified'});
  await mcp.call('db.connections.v2.session.attach',{...delegation,repoRoot:root});
  const request={key,ticket,operationId:ticket.operationId,mode:'remove',expectedRevision:row.revision};
  for(const method of ['db.connections.v2.removalState','db.connections.v2.retryRemovalCleanup'] as const){
   assert.equal((await mcp.call(method,{ticket})).code,'upgrade-required');
   assert.equal((await foreign.call(method,{ticket})).code,'upgrade-required');
   assert.equal((await control.call(method,{ticket,revision:row.revision})).code,'invalid-input');
   assert.equal((await control.call(method,{ticket:{...ticket,scope:'saved'}})).code,'upgrade-required');
  }
  assert.equal((await control.call('db.connections.v2.ticket',{key:{...key,scope:'saved'},mode:'remove'})).code,'upgrade-required');
  assert.equal((await mcp.call('db.connections.v2.mutate',request)).code,'upgrade-required');
  assert.equal(overlay.read('row').revision,row.revision);
  assert.equal((await control.call('db.connections.v2.mutate',request)).value.registration,'removed');
  assert.equal((await control.call('db.connections.v2.removalState',{ticket})).state,'removed');
  assert.equal((await control.call('db.connections.v2.retryRemovalCleanup',{ticket})).state,'removed');
  assert.equal((await control.call('db.connections.v2.mutate',request)).value.registration,'removed');
  await control.call('db.connections.v2.session.end');assert.equal((await control.call('db.connections.v2.removalState',{ticket})).code,'session-expired');
 }finally{await Promise.all([control.close(),mcp.close(),foreign.close()]);await server.close();await runtime.close();rmSync(directory,{recursive:true,force:true});}
});
