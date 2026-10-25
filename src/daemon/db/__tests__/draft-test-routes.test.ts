import test from 'node:test';
import assert from 'node:assert/strict';
import {connect} from 'node:net';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {writeFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {environment} from './fixtures/saved-management-fixture.js';
import {IpcServer,directDispatch} from '../../server.js';
import {connectionManagementHandlers,connectionManagementRpc} from '../../connection-management-rpc.js';
import {testConnectionRpc} from '../../db-rpc.js';
import {Router} from '../../threads/router.js';
import {TargetRegistry} from '../../threads/registry.js';
import {methodClasses,MAIN_DAEMON_CONNECTION_METHODS} from '../../threads/method-class.js';
import {parseDraftTestResult} from '../../../shared/connection-management-wire.js';
async function client(path:string){
 const socket=connect(path);await once(socket,'connect');let buffer='';let id=0;
 const waiting=new Map<number,(result:unknown)=>void>();
 socket.on('data',chunk=>{buffer+=chunk;for(;;){const end=buffer.indexOf('\n');if(end<0)break;const reply=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);waiting.get(reply.id)?.(reply.result??{error:reply.error});waiting.delete(reply.id);}});
 return {socket,call:(method:string,params:unknown)=>new Promise<unknown>(resolve=>{const requestId=++id;waiting.set(requestId,resolve);socket.write(JSON.stringify({id:requestId,method,params,client:{label:'same-untrusted-label',pid:123}})+'\n');})};
}
test('CM-S2-C1: actual v2 legacy IPC routes share main-owned probes and isolate cancellation by socket',async()=>{
 const env=await environment(),root=await realpath(env.directory),path=join(root,'data.csv');await writeFile(path,'value\nfirst\n');
 let release!:()=>void,announce!:()=>void;const wait=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{announce=r;});
 const handlers=connectionManagementHandlers({enabled:async()=>true,isRegistered:async()=>true,prepareTemporary:async(_request,_context,signal)=>{announce();await wait;signal.throwIfAborted();return {config:{id:'fixture',kind:'csv',path},credentialActions:{}};}});
 handlers['db.testConnection']=(params,context)=>testConnectionRpc(params as never,context);
 // Deliberately route session methods: connection tests must still remain local.
 const router=new Router({classOf:methodClasses.classOf,registry:new TargetRegistry(),routed:new Set(['session']),local:directDispatch(handlers),holdMs:100});
 const server=new IpcServer(router.forward,Date.now,join(root,'fixture.sock'));await server.listen();const a=await client(join(root,'fixture.sock')),b=await client(join(root,'fixture.sock'));
 const draft={requestId:randomUUID(),draftRevision:4,key:{repoRoot:root,scope:'temporary',id:'fixture'},publicPatch:{kind:'csv',path:'data.csv'},credentials:{}};
 try {
  assert.deepEqual([...MAIN_DAEMON_CONNECTION_METHODS].sort(),['db.connections.v2.cancelTest','db.connections.v2.test','db.testConnection']);
  const result=parseDraftTestResult(await a.call('db.connections.v2.test',draft));assert.equal(result.status,'reachable');assert.equal(result.requestId,draft.requestId);assert.equal(result.repoRoot,root);assert.equal(result.draftRevision,4);
  const legacy=await a.call('db.testConnection',{repoRoot:root,config:{id:'fixture',kind:'csv',path:'data.csv'}}) as {ok:boolean;kind:string;family:string;tookMs:number};
  assert.equal(legacy.ok,true);assert.equal(legacy.kind,'csv');assert.equal(legacy.family,'file');assert.equal(Object.keys(legacy).sort().join(','),'family,kind,ok,tookMs');
  const malformed=await a.call('db.connections.v2.test',{...draft,requestId:randomUUID(),runtimeAuth:{secret:'private-canary'}});assert.equal((malformed as {status:string}).status,'rejected');assert.ok(!JSON.stringify(malformed).includes('private-canary'));
  const editing={...draft,requestId:randomUUID(),expectedRevision:randomUUID()};const pending=a.call('db.connections.v2.test',editing);await started;
  assert.deepEqual(await b.call('db.connections.v2.cancelTest',{requestId:editing.requestId}),{canceled:false});
  assert.deepEqual(await a.call('db.connections.v2.cancelTest',{requestId:editing.requestId}),{canceled:true});
  assert.equal(parseDraftTestResult(await pending).status,'canceled');release();
  const disabled=await connectionManagementRpc('db.connections.v2.capabilities',{}, {connectionIdentity:'fixture',daemonEpoch:'epoch'}) as {features:string[]};assert.equal(disabled.features.includes('draft-test'),false);
 }finally{release();a.socket.destroy();b.socket.destroy();await server.close();await env.cleanup();}
});
