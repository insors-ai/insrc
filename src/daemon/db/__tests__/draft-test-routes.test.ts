import test from 'node:test';
import assert from 'node:assert/strict';
import {connect} from 'node:net';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {writeFile,realpath,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {connectionsPath} from '../config.js';
import {environment} from './fixtures/saved-management-fixture.js';
import {IpcServer,directDispatch} from '../../server.js';
import {connectionManagementHandlers,connectionManagementRpc} from '../../connection-management-rpc.js';
import {testConnectionRpc} from '../../db-rpc.js';
import {Router} from '../../threads/router.js';
import {TargetRegistry} from '../../threads/registry.js';
import {methodClasses,MAIN_DAEMON_CONNECTION_METHODS} from '../../threads/method-class.js';
import {parseDraftTestResult} from '../../../shared/connection-management-wire.js';
import { ConnectionSessionRpc } from '../../connection-session-rpc.js';
import { createTemporaryOverlay, type TemporaryConnectionOverlay } from '../session-entries.js';
function sessions() {
	const overlays = new Map<string, TemporaryConnectionOverlay>();
	const runtime = new ConnectionSessionRpc({
		enabled: async () => true, isRegistered: async () => true, createOverlay: (root, handle, context) => {
			const overlay = createTemporaryOverlay(root, handle, context); overlays.set(handle, overlay); return overlay;
		}, dropOverlay: overlay => overlay.close()
	});
	return { runtime, overlays };
}
async function client(path:string){
 const socket=connect(path);await once(socket,'connect');let buffer='';let id=0;
 const waiting=new Map<number,(result:unknown)=>void>();
 socket.on('data',chunk=>{buffer+=chunk;for(;;){const end=buffer.indexOf('\n');if(end<0)break;const reply=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);waiting.get(reply.id)?.(reply.result??{error:reply.error});waiting.delete(reply.id);}});
 return {socket,call:(method:string,params:unknown)=>new Promise<unknown>(resolve=>{const requestId=++id;waiting.set(requestId,resolve);socket.write(JSON.stringify({id:requestId,method,params,client:{label:'same-untrusted-label',pid:123}})+'\n');})};
}
test('CM-S2-C1: actual v2 legacy IPC routes share main-owned probes and isolate cancellation by socket', { timeout: 30000 }, async () => {
 const env=await environment(),root=await realpath(env.directory),path=join(root,'data.csv');await writeFile(path,'value\nfirst\n');
 let release!:()=>void,announce!:()=>void;const wait=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{announce=r;});
	const { runtime, overlays } = sessions();
	const handlers = connectionManagementHandlers({ sessionRuntime: runtime, enabled: async () => true, isRegistered: async () => true, prepareTemporary: async (_request, _context, signal) => { announce(); await wait; signal.throwIfAborted(); return { config: { id: 'fixture', kind: 'csv', path }, credentialActions: {} }; } });
 handlers['db.testConnection']=(params,context)=>testConnectionRpc(params as never,context);
 // Deliberately route session methods: connection tests must still remain local.
 const router=new Router({classOf:methodClasses.classOf,registry:new TargetRegistry(),routed:new Set(['session']),local:directDispatch(handlers),holdMs:100});
	const server = new IpcServer(runtime.forward(router.forward), Date.now, join(root, 'fixture.sock')); server.onConnectionClose(c => runtime.disconnect(c)); await server.listen(); const a = await client(join(root, 'fixture.sock')), b = await client(join(root, 'fixture.sock'));
 const draft={requestId:randomUUID(),draftRevision:4,key:{repoRoot:root,scope:'temporary',id:'fixture'},publicPatch:{kind:'csv',path:'data.csv'},credentials:{}};
 try {
  for (const method of ['db.connections.v2.cancelTest','db.connections.v2.test','db.testConnection']) assert.ok(MAIN_DAEMON_CONNECTION_METHODS.has(method), method + ' must remain main-daemon owned');
  const result=parseDraftTestResult(await a.call('db.connections.v2.test',draft));assert.equal(result.status,'reachable');assert.equal(result.requestId,draft.requestId);assert.equal(result.repoRoot,root);assert.equal(result.draftRevision,4);
  const legacy=await a.call('db.testConnection',{repoRoot:root,config:{id:'fixture',kind:'csv',path:'data.csv'}}) as {ok:boolean;kind:string;family:string;tookMs:number};
  assert.equal(legacy.ok,true);assert.equal(legacy.kind,'csv');assert.equal(legacy.family,'file');assert.equal(Object.keys(legacy).sort().join(','),'family,kind,ok,tookMs');
  await mkdir(dirname(connectionsPath(root)),{recursive:true});await writeFile(connectionsPath(root),JSON.stringify({connections:[{id:'fixture',kind:'csv',family:'rdbms',path:'data.csv'},{id:'ancestor-only',kind:'csv',path:'data.csv'}]}));
  const saved=await a.call('db.testConnection',{repoRoot:root,config:{id:'fixture',kind:'csv'}}) as {ok:boolean;family:string};assert.equal(saved.ok,true);assert.equal(saved.family,'rdbms','legacy saved family pin survives testing');
  const nested=join(root,'nested');await mkdir(join(nested,'.insrc'),{recursive:true});await writeFile(join(nested,'own.json'),'[{"value":1}]');await mkdir(dirname(connectionsPath(nested)),{recursive:true});await writeFile(connectionsPath(nested),JSON.stringify({connections:[{id:'fixture',kind:'json',path:'own.json'}]}));
  assert.equal((await a.call('db.testConnection',{repoRoot:nested,config:{id:'fixture',kind:'json'}}) as {ok:boolean}).ok,true);
  const absent=await a.call('db.testConnection',{repoRoot:nested,config:{id:'ancestor-only',kind:'csv'}}) as {ok:boolean;error:string};assert.equal(absent.ok,false);assert.equal(absent.error,'Connection test failed.');
  const failed=await a.call('db.testConnection',{repoRoot:root,config:{id:'bad',kind:'json',path:'PRIVATE_MISSING_CANARY.json'}}) as {ok:boolean;error:string};assert.equal(failed.ok,false);assert.equal(failed.error,'Connection test failed.');assert.ok(!JSON.stringify(failed).includes('CANARY'));
  const malformed=await a.call('db.connections.v2.test',{...draft,requestId:randomUUID(),runtimeAuth:{secret:'private-canary'}});assert.equal((malformed as {status:string}).status,'rejected');assert.ok(!JSON.stringify(malformed).includes('private-canary'));
		const opened = await a.call('db.connections.v2.session.open', { repoRoot: root }) as { sessionHandle: string };
		const overlay = overlays.get(opened.sessionHandle)!;
		const entry = overlay.commit(await overlay.prepare({ key: { repoRoot: root, scope: 'temporary', id: 'cancel-fixture' }, mode: 'create', publicPatch: { kind: 'csv', path: 'data.csv' } }));
		const editing = { ...draft, key: { ...draft.key, id: 'cancel-fixture' }, requestId: randomUUID(), expectedRevision: entry.revision }; const pending = a.call('db.connections.v2.test', editing); await started;
  await b.call('db.connections.v2.session.open',{repoRoot:root});
  assert.equal((await a.call('db.connections.v2.cancelTest',{requestId:editing.requestId,repoRoot:root}) as {code:string}).code,'invalid-input');
  assert.deepEqual(await b.call('db.connections.v2.cancelTest',{requestId:editing.requestId}),{canceled:false});
  assert.deepEqual(await a.call('db.connections.v2.cancelTest',{requestId:editing.requestId}),{canceled:true});
  assert.equal(parseDraftTestResult(await pending).status,'canceled');release();
  const disabled=await connectionManagementRpc('db.connections.v2.capabilities',{}, {connectionIdentity:'fixture',daemonEpoch:'epoch'},{enabled:async()=>false}) as {features:string[]};assert.equal(disabled.features.includes('draft-test'),false);
	} finally { release(); a.socket.destroy(); b.socket.destroy(); await server.close(); await runtime.close(); await env.cleanup(); }
});

test('CM-S2-C2: actual IPC disconnect cancels owned preparation while its maintenance hold remains until drain', { timeout: 30000 }, async () => {
 const {connectionTestSupervisor}=await import('../draft-test.js');const {installLockManager,createLockBlock,LockManager}=await import('../../../shared/locks/lock-manager.js');const {enableMaintenanceLock,MAINTENANCE_LOCK}=await import('../../../shared/locks/maintenance-lock.js');
 const env=await environment(),root=await realpath(env.directory),path=join(root,'data.csv');await writeFile(path,'value\nfirst\n');
 const block=createLockBlock(),locks=installLockManager(block),other=new LockManager(block,{threadId:9013});enableMaintenanceLock();
 let release!:()=>void,announce!:()=>void,active=0;const wait=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{announce=r;});let lifetime:import('../../request-context.js').RequestLifetime|undefined;
	const { runtime, overlays } = sessions();
	const router = new Router({ classOf: () => undefined, registry: new TargetRegistry(), routed: new Set(), onRequest: () => { active++; return () => { active--; }; }, local: directDispatch(connectionManagementHandlers({ sessionRuntime: runtime, enabled: async () => true, prepareTemporary: async () => { announce(); await wait; return { config: { id: 'fixture', kind: 'csv', path }, credentialActions: {} }; } })) });
	const server = new IpcServer((request, deliver) => { lifetime = request.lifetime; return runtime.forward(router.forward)(request, deliver); }, Date.now, join(root, 'disconnect.sock')); server.onConnectionClose(c => runtime.disconnect(c)); await server.listen(); const control = await client(join(root, 'disconnect.sock')); const socket = control.socket; let replies = 0; socket.on('data', () => { replies++; });
 try{
		const opened = await control.call('db.connections.v2.session.open', { repoRoot: root }) as { sessionHandle: string };
		const overlay = overlays.get(opened.sessionHandle)!;
		const entry = overlay.commit(await overlay.prepare({ key: { repoRoot: root, scope: 'temporary', id: 'fixture' }, mode: 'create', publicPatch: { kind: 'csv', path: 'data.csv' } }));
		replies = 0;
		socket.write(JSON.stringify({ id: 2, method: 'db.connections.v2.test', params: { requestId: randomUUID(), draftRevision: 0, key: { repoRoot: root, scope: 'temporary', id: 'fixture' }, expectedRevision: entry.revision, publicPatch: {}, credentials: {} } }) + '\n'); await started; socket.destroy(); await lifetime!.completed;
  assert.equal(connectionTestSupervisor.activeCount,1);assert.equal(active,1);assert.equal(replies,0);assert.equal(await other.request(MAINTENANCE_LOCK,{mode:'exclusive',ifAvailable:true},lock=>lock!==null),false);
  release();await lifetime!.drained;await new Promise(r=>setImmediate(r));assert.equal(connectionTestSupervisor.activeCount,0);assert.equal(active,0);assert.equal(locks.query().held.length,0);assert.equal(replies,0);
	} finally { release(); socket.destroy(); await server.close(); await runtime.close(); await env.cleanup(); }
});
