import assert from 'node:assert/strict';
import test from 'node:test';
import { createConnection } from 'node:net';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionsWorkbenchOwner } from '../session-owner.js';
import type { OwnerTimer } from '../session-owner.js';
import { openIpcLane } from '../../../../src/shared/ipc-client.js';
import type { PersistentIpcLane } from '../../../../src/shared/ipc-client.js';
import { CONNECTION_SESSION_METHODS } from '../../../../src/shared/connection-management.js';
import { ConnectionSessionRpc } from '../../../../src/daemon/connection-session-rpc.js';
import { createTemporaryOverlay } from '../../../../src/daemon/db/session-entries.js';
import type { TemporaryConnectionOverlay } from '../../../../src/daemon/db/session-entries.js';
import { IpcServer, directDispatch } from '../../../../src/daemon/server.js';
import type { RpcHandlers } from '../../../../src/daemon/server.js';
import '../../../../src/daemon/db/drivers/index.js';

class Clock {
 now=0; #id=0; jobs=new Map<number,{at:number;cb:()=>void}>();
 timer=(cb:()=>void,ms:number):OwnerTimer=>{const id=++this.#id;this.jobs.set(id,{at:this.now+ms,cb});return{dispose:()=>{this.jobs.delete(id);}};};
 advance(to:number):void {this.now=to;for(const [id,job]of [...this.jobs])if(job.at<=to&&this.jobs.delete(id))job.cb();}
}
async function until(predicate:()=>boolean):Promise<void> {const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw new Error('Fixture did not reach expected state');await new Promise<void>(resolve=>setImmediate(resolve));}}
async function fixture() {
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'s5-owner-'))),a=join(dir,'a'),b=join(dir,'b'),socket=join(dir,'d.sock');mkdirSync(a);mkdirSync(b);writeFileSync(join(a,'fixture.csv'),'id,name\n1,fixture\n');
 const clock=new Clock(),lanes:PersistentIpcLane[]=[],methods:string[]=[],roles:string[]=[],overlays:{root:string;handle:string;overlay:TemporaryConnectionOverlay}[]=[];
 let runtime!:ConnectionSessionRpc<TemporaryConnectionOverlay>,server!:IpcServer,enabled=true,stallEnd=false;
 async function start() {
  runtime=new ConnectionSessionRpc({enabled:async()=>enabled,monotonicNow:()=>clock.now,isRegistered:async root=>[a,b].includes(root),
   createOverlay:(root,handle,context)=>{const overlay=createTemporaryOverlay(root,handle,context);overlays.push({root,handle,overlay});return overlay;},dropOverlay:overlay=>overlay.close()});
  const handlers:RpcHandlers=Object.fromEntries(CONNECTION_SESSION_METHODS.map(method=>[method,async(params,context)=>{assert.ok(context);methods.push(method);const result=await runtime.call(method,params,context);if(stallEnd&&method.endsWith('.end'))return await new Promise(()=>{});return result;} ]));
  handlers['db.connections.v2.capabilities']=async(_params,context)=>({version:2,daemonEpoch:context!.daemonEpoch,features:enabled?['safe-read','driver-descriptors','workbench-sessions','session-delegation']:[],receiptRetentionDays:30});
  handlers['db.connections.v2.list']=async(params,context)=>{
   assert.ok(context);methods.push('list');roles.push(context.connectionSession?.role??'saved');
   if(!context.connectionSession)return [];
   const access=await runtime.accessFor(context,(params as {repoRoot:string}).repoRoot);
   return overlays.find(o=>o.root===access.lookupRoot&&o.handle===access.sessionHandle)!.overlay.list();
  };
  server=new IpcServer(runtime.forward(directDispatch(handlers)),()=>clock.now,socket);
  server.onConnectionClose(context=>runtime.disconnect(context));await server.listen();
 }
 await start();
 const owner=new ConnectionsWorkbenchOwner({now:()=>clock.now,timer:clock.timer,openLane:()=>{const lane=openIpcLane({connect:()=>createConnection(socket)});lanes.push(lane);return lane;}});
 owner.setRegisteredRoots([a,b]);
 return {a,b,clock,owner,methods,roles,overlays,lanes,setEnabled:(value:boolean)=>{enabled=value;},stallEnd:()=>{stallEnd=true;},
  restart:async()=>{for(const lane of lanes)lane.dispose();await server.close();await runtime.close();await start();},
  close:async()=>{owner.dispose();await owner.whenDisposed();for(const lane of lanes)lane.dispose();await server.close();await runtime.close();rmSync(dir,{recursive:true,force:true});}};
}
const prefix='db.connections.v2.';

test('CM-S5-OWNER-TS: real workbench control/data/Saved lanes, heartbeat/resume/epoch, root retention and disposal',async()=>{
 const f=await fixture();try {
  const views:unknown[]=[];let erased=0;const disposableView=f.owner.onChange(view=>views.push(view));f.owner.onTemporaryInvalidated(()=>{erased++;});
  await f.owner.selectRoot(f.a);const handle=f.overlays[0]!.handle;
  const current=()=>f.owner.view;
  await f.owner.requestTemporary(f.a,current(),prefix+'list',{repoRoot:f.a});
  const first=f.overlays.find(o=>o.root===f.a)!;
  first.overlay.commit(await first.overlay.prepare({key:{repoRoot:f.a,scope:'temporary',id:'preview'},mode:'create',publicPatch:{kind:'csv',path:'fixture.csv'}}));
  f.clock.advance(10000);await f.owner.selectRoot(f.b);await f.owner.requestTemporary(f.b,current(),prefix+'list',{repoRoot:f.b});
  f.clock.advance(20000);await f.owner.selectRoot(f.a);
  assert.equal((await f.owner.requestTemporary(f.a,current(),prefix+'list',{repoRoot:f.a}) as unknown[]).length,1);
  assert.equal(f.overlays.filter(o=>o.root===f.a).length,1);assert.equal(f.overlays.filter(o=>o.root===f.b).length,1);
  assert.deepEqual(await f.owner.requestSaved(f.a,prefix+'list',{repoRoot:f.a}),[]);
  assert.equal(f.roles.at(-1),'saved');assert.ok(f.roles.includes('data'));
  assert.equal(f.methods.filter(m=>m===prefix+'session.open').length,1);
  // Root switches must not postpone the heartbeat; the original 30-second timer still fires.
  f.clock.advance(30000);await until(()=>[...f.clock.jobs.values()].some(j=>j.at===120000));
  assert.equal(f.methods.filter(m=>m===prefix+'session.heartbeat').length,1);
  // Closing the manager means disposing only its subscription.
  disposableView.dispose();assert.equal(f.methods.filter(m=>m===prefix+'session.end').length,0);
  // A lost data lane reattaches without unnecessarily resuming/revoking a healthy control.
  f.lanes[1]!.dispose();assert.equal(current().status,'offline');await f.owner.selectRoot(f.a);
  assert.equal(f.methods.filter(m=>m===prefix+'session.resume').length,0);
  const generation=current().generation;const oldData=f.lanes.at(-1)!;
  f.lanes[0]!.dispose();assert.equal(current().status,'offline');assert.ok(current().generation>generation);
  await f.owner.selectRoot(f.a);assert.equal(current().status,'ready');assert.equal(f.overlays[0]!.handle,handle);assert.equal(erased,0);
  assert.equal(f.methods.filter(m=>m===prefix+'session.resume').length,1);assert.ok(oldData.isClosed);
  assert.equal((await f.owner.requestTemporary(f.a,current(),prefix+'list',{repoRoot:f.a}) as unknown[]).length,1);
  const writes=f.methods.length;
  await assert.rejects(f.owner.requestTemporary(f.a,{...current(),generation:0},prefix+'list',{repoRoot:f.a}),{code:'stale-view'});
  await assert.rejects(f.owner.requestSaved(f.a,prefix+'session.open',{repoRoot:f.a}),{code:'invalid-request'});
  await assert.rejects(f.owner.requestSaved(f.a,prefix+'list',{repoRoot:f.b}),{code:'invalid-request'});
  await assert.rejects(f.owner.requestSaved(f.a,prefix+'list',{repoRoot:f.a,capability:'forged'}),{code:'invalid-request'});
  assert.equal(f.methods.length,writes);
  assert.equal(JSON.stringify(f.owner),'{}');assert.ok(!JSON.stringify(views).includes(handle));assert.ok(views.every(v=>!Object.hasOwn(v as object,'capability')));
  f.owner.dispose();f.owner.dispose();await f.owner.whenDisposed();assert.equal(current().status,'disposed');
  assert.equal(f.methods.filter(m=>m===prefix+'session.end').length,1);assert.equal(erased,1);assert.equal(f.clock.jobs.size,0);assert.ok(f.lanes.every(l=>l.isClosed));
  await assert.rejects(f.owner.selectRoot(f.a),{code:'disposed'});
  const entry=readFileSync(new URL('../../extension.ts',import.meta.url),'utf8');
  assert.match(entry,/const connectionsOwner = new ConnectionsWorkbenchOwner\(\);\s*context.subscriptions.push\(connectionsOwner\)/);
 }finally{await f.close();}
});

test('CM-S5-OWNER-TS: exact expiry erases temporary inputs and epoch restart never resumes or replays old authority',async()=>{
 const f=await fixture();try {
  let erased=0;f.owner.onTemporaryInvalidated(()=>{erased++;});
  await f.owner.selectRoot(f.a);const first=f.owner.view;const oldHandle=f.overlays[0]!.handle;
  // Simulate a suspended frontend whose heartbeat has not run: backend and client lease reach 90s.
  f.clock.now=90000;
  await assert.rejects(f.owner.requestTemporary(f.a,first,prefix+'list',{repoRoot:f.a}),{code:'expired'});
  assert.equal(erased,1);assert.equal(f.owner.view.status,'expired');
  await f.owner.selectRoot(f.a);assert.equal(f.overlays.length,2);assert.notEqual(f.overlays[1]!.handle,oldHandle);assert.throws(()=>f.overlays[0]!.overlay.list(),{code:'session-expired'});
  const before=f.owner.view.daemonEpoch;await f.restart();await f.owner.selectRoot(f.a);
  assert.notEqual(f.owner.view.daemonEpoch,before);assert.equal(erased,2);assert.equal(f.methods.filter(m=>m===prefix+'session.resume').length,0);
  assert.equal(f.owner.view.status,'ready');assert.equal(f.methods.filter(m=>m===prefix+'session.open').length,3);
 }finally{await f.close();}
});

test('CM-S5-OWNER-TS: unavailable session features refuse without a claimed-lane Saved fallback',async()=>{
 const f=await fixture();try {
  f.setEnabled(false);await assert.rejects(f.owner.selectRoot(f.a),{code:'upgrade-required'});
  assert.equal(f.owner.view.status,'upgrade-required');assert.equal(f.methods.length,0);
  await assert.rejects(f.owner.requestTemporary(f.a,f.owner.view,prefix+'list',{repoRoot:f.a}),{code:'expired'});
  assert.deepEqual(await f.owner.requestSaved(f.a,prefix+'list',{repoRoot:f.a}),[]);assert.deepEqual(f.roles,['saved']);
 }finally{await f.close();}
});


test('CM-S5-OWNER-TS: disposal deadline closes only owned lanes even when end reply is lost',async()=>{
 const f=await fixture();try {
  await f.owner.selectRoot(f.a);await f.owner.requestSaved(f.a,prefix+'list',{repoRoot:f.a});f.stallEnd();
  f.owner.dispose();assert.equal(f.owner.view.status,'disposed');
  await until(()=>f.methods.includes(prefix+'session.end'));
  f.clock.advance(1000);await f.owner.whenDisposed();
  assert.ok(f.lanes.every(lane=>lane.isClosed));assert.equal(f.clock.jobs.size,0);
 }finally{await f.close();}
});
