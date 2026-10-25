import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {once} from 'node:events';
import {RequestLifetime} from '../../request-context.js';
import {Router} from '../router.js';
import {TargetRegistry} from '../registry.js';
import {directDispatch} from '../../server.js';
import {wireRequest} from '../channel.js';
import type {LocalRequestEnvelope} from '../channel.js';
const request=(lifetime:RequestLifetime):LocalRequestEnvelope=>({kind:'request',requestId:'r',method:'test',params:{},stream:false,lifetime,trustedContext:{connectionIdentity:'socket',daemonEpoch:'epoch'}});
test('CM-S2-G1: production router projects cloneable identity and completes remote reply error and queued cancellation',async()=>{
 for(const error of [undefined,'remote failure']) {
  const registry=new TargetRegistry();registry.register({threadId:1,cls:'admin'});
  const router=new Router({classOf:()=> 'admin',registry,routed:new Set(['admin']),local:directDispatch({})});
  const {port1,port2}=new MessageChannel();router.attach(1,port1);
  try {
   const lifetime=new RequestLifetime(),input=request(lifetime);Object.assign(input,{nonCloneable:()=>0});
   const got=once(port2,'message');let reply=false;router.forward(input,()=>{reply=true;});
   const [wire]=await got;assert.deepEqual(wire,wireRequest(input));assert.equal('lifetime' in wire,false);assert.deepEqual(wire.trustedContext,{connectionIdentity:'socket',daemonEpoch:'epoch'});
   port2.postMessage({kind:'reply',requestId:'r',...(error?{error}:{result:true})});await lifetime.completed;await lifetime.drained;assert.equal(reply,true);
  }finally{router.detach(1);port1.close();port2.close();}
 }
 const router=new Router({classOf:()=> 'admin',registry:new TargetRegistry(),routed:new Set(['admin']),local:directDispatch({}),holdMs:5});
 const queued=new RequestLifetime();let replies=0;router.forward(request(queued),()=>{replies++;})();await queued.completed;await queued.drained;assert.equal(replies,0);
 const unavailable=new RequestLifetime();router.forward(request(unavailable),()=>{replies++;});await unavailable.completed;await unavailable.drained;assert.equal(replies,1);
});

test('CM-S2-G2: real maintenance ownership and activity retain admitted drain and release every non-admitted path',async()=>{
 const {createLockBlock,installLockManager,LockManager}=await import('../../../shared/locks/lock-manager.js');
 const {enableMaintenanceLock,MAINTENANCE_LOCK}=await import('../../../shared/locks/maintenance-lock.js');
 const block=createLockBlock(),manager=installLockManager(block),other=new LockManager(block,{threadId:9102});enableMaintenanceLock();
 let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});let active=0,calls=0;
 const router=new Router({classOf:()=>undefined,registry:new TargetRegistry(),routed:new Set(),onRequest:()=>{active++;return()=>{active--;};},local:directDispatch({test:async(_p,ctx)=>{calls++;ctx!.registerDrain!(pending);return 'timeout';}})});
 const lifetime=new RequestLifetime();router.forward(request(lifetime),()=>{});await lifetime.completed;
 assert.equal(active,1);
 assert.equal(await other.request(MAINTENANCE_LOCK,{mode:'exclusive',ifAvailable:true},lock=>lock!==null),false);
 release();await lifetime.drained;await new Promise(r=>setImmediate(r));assert.equal(active,0);
 assert.equal(await other.request(MAINTENANCE_LOCK,{mode:'exclusive',ifAvailable:true},lock=>lock!==null),true);
 let unlock!:()=>void,granted!:()=>void;
 const grantedPromise=new Promise<void>(r=>{granted=r;}),held=new Promise<void>(r=>{unlock=r;});
 const exclusive=other.request(MAINTENANCE_LOCK,{mode:'exclusive'},async()=>{granted();await held;});await grantedPromise;
 const denied=new RequestLifetime();let deniedReply=0;router.forward(request(denied),()=>{deniedReply++;});await denied.completed;await denied.drained;assert.equal(calls,1);assert.equal(deniedReply,1);unlock();await exclusive;
 const cancelled=new RequestLifetime();const cancel=router.forward(request(cancelled),()=>{throw new Error('closed socket reply');});cancel();await cancelled.completed;await cancelled.drained;
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(active,0);
 const {mock}=await import('node:test');const spy=mock.method(manager,'request',async()=>{throw new Error('lock failed');});
 try {const failed=new RequestLifetime();router.forward(request(failed),()=>{});await failed.completed;await failed.drained;}finally{spy.mock.restore();}
 const unknown=new RequestLifetime();router.forward({...request(unknown),method:'unknown'},()=>{});await unknown.completed;await unknown.drained;
 await new Promise(r=>setImmediate(r));assert.equal(active,0);assert.equal(manager.query().held.length,0);
});

test('CM-S2-G1: routed streams retain frame cancellation behavior and crashed unary lifetimes complete',async()=>{
 const registry=new TargetRegistry();registry.register({threadId:1,cls:'admin'});let active=0;
 const router=new Router({classOf:()=> 'admin',registry,routed:new Set(['admin']),local:directDispatch({}),onRequest:()=>{active++;return()=>{active--;};}});
 const {port1,port2}=new MessageChannel();router.attach(1,port1);
 try {
  const received=once(port2,'message'),frames:unknown[]=[];let delivered!:()=>void;const frameReady=new Promise<void>(r=>{delivered=r;});
  const cancel=router.forward({...request(new RequestLifetime()),lifetime:undefined,stream:true},frame=>{frames.push(frame);delivered();});await received;
  port2.postMessage({kind:'frame',requestId:'r',frame:{id:0,stream:'progress',data:'row'}});
  await frameReady;assert.equal(active,1);
  const cancellation=once(port2,'message');cancel();assert.deepEqual((await cancellation)[0],{kind:'cancel',requestId:'r'});assert.equal(active,0);assert.equal(frames.length,1);
  const lifetime=new RequestLifetime(),started=once(port2,'message');router.forward(request(lifetime),()=>{});await started;
  for(const orphan of router.detach(1))orphan.deliver({kind:'reply',requestId:orphan.requestId,error:'worker crashed'});
  await lifetime.completed;await lifetime.drained;await Promise.resolve();assert.equal(active,0);
 }finally{router.detach(1);port1.close();port2.close();}
});
