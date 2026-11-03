import assert from 'node:assert/strict';
import test from 'node:test';
import { createConnection } from 'node:net';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConnectionsWorkbenchOwner } from '../session-owner.js';
import { createConnectionsDraftTests } from '../gateway.js';
import { openIpcLane } from '../../../../src/shared/ipc-client.js';
import type { PersistentIpcLane } from '../../../../src/shared/ipc-client.js';
import { CONNECTION_SESSION_METHODS } from '../../../../src/shared/connection-management.js';
import type { ConnectionKey, DraftTestRequest, DraftTestResult } from '../../../../src/shared/connection-management.js';
import { ConnectionDraft } from '../../../../src/shared/connection-manager/draft.js';
import type { DraftTestIdentity } from '../../../../src/shared/connection-manager/test-controller.js';
import { decodeDriverDescriptors, decodeSafeConnection } from '../../../../src/shared/connection-manager/wire.js';
import { loadConnectionCorpus } from '../../../../src/shared/__tests__/fixtures/connection-corpus.js';
import { ConnectionSessionRpc } from '../../../../src/daemon/connection-session-rpc.js';
import { DraftTestSupervisor } from '../../../../src/daemon/db/draft-test.js';
import { createTemporaryOverlay } from '../../../../src/daemon/db/session-entries.js';
import { IpcServer, directDispatch } from '../../../../src/daemon/server.js';
import type { RpcHandlers } from '../../../../src/daemon/server.js';

const prefix='db.connections.v2.',descriptors=decodeDriverDescriptors(loadConnectionCorpus().driverDescriptors),descriptor=descriptors.find(d=>d.kind==='csv')!;
async function until(predicate:()=>boolean):Promise<void>{const end=Date.now()+15000;while(!predicate()){if(Date.now()>end)throw new Error('Probe fixture did not settle');await new Promise<void>(r=>setTimeout(r,5));}}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};}
async function fixture(){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'s5t-'))),a=join(dir,'a'),b=join(dir,'b'),socket=join(dir,'d.sock');mkdirSync(a);mkdirSync(b);
 const path=join(a,'fixture.csv');writeFileSync(path,'id,name\n1,fixture\n');const bytes=readFileSync(path);
 const supervisor=new DraftTestSupervisor(),lanes:PersistentIpcLane[]=[],calls:{request:DraftTestRequest;connection:string;claimed:boolean}[]=[],cancels:string[]=[];
 const runtime=new ConnectionSessionRpc({enabled:async()=>true,isRegistered:async root=>[a,b].includes(root),createOverlay:(root,handle,context)=>createTemporaryOverlay(root,handle,context),dropOverlay:overlay=>overlay.close()});
 let rejected:unknown=null;
 let preparation:ReturnType<typeof deferred>|null=null,reply:ReturnType<typeof deferred>|null=null,change:((r:DraftTestResult)=>DraftTestResult)|null=null;
 const gates:ReturnType<typeof deferred>[]=[];
 const handlers:RpcHandlers=Object.fromEntries(CONNECTION_SESSION_METHODS.map(m=>[m,(p,c)=>runtime.call(m,p,c!)]));
 handlers[prefix+'capabilities']=async(_p,c)=>({version:2,daemonEpoch:c!.daemonEpoch,features:['safe-read','driver-descriptors','workbench-sessions','session-delegation','draft-test','test-cancellation'],receiptRetentionDays:30});
 handlers[prefix+'test']=async(p,c)=>{
  const request=p as DraftTestRequest;assert.ok(c);calls.push({request,connection:c.connectionIdentity,claimed:!!c.connectionSession});
  if(request.key.scope==='temporary')await runtime.accessFor(c,request.key.repoRoot);else assert.equal(c.connectionSession,undefined);
  if(rejected!==null)return rejected;
  const wait=preparation,delivery=reply,alter=change;
  const result=await supervisor.run(p,request.key.scope==='temporary'?await runtime.probeContext(c,request):c,async()=>{
   if(wait)await wait.promise;
   return{config:{id:request.key.id,kind:'csv',path},credentialActions:request.credentials};
  });
  if(delivery)await delivery.promise;
  return alter?alter(result):result;
 };
 handlers[prefix+'cancelTest']=(p,c)=>{assert.ok(c);cancels.push(c.connectionIdentity);return supervisor.cancel(p,c);};
 const server=new IpcServer(runtime.forward(directDispatch(handlers)),undefined,socket);server.onConnectionClose(c=>runtime.disconnect(c));await server.listen();
 const owner=new ConnectionsWorkbenchOwner({openLane:()=>{const lane=openIpcLane({connect:()=>createConnection(socket)});lanes.push(lane);return lane;}});
 owner.setRegisteredRoots([a,b]);await owner.selectRoot(a);const tests=createConnectionsDraftTests(owner);
 let generation=0;
 const key=(scope:'saved'|'temporary'='saved',id='fixture'):ConnectionKey=>({repoRoot:a,scope,id});
 const identity=(k=key()):DraftTestIdentity=>({key:k,daemonEpoch:owner.view.daemonEpoch!,viewGeneration:++generation});
 const draft=(k=key(),edit=false)=>{
  const current=edit?decodeSafeConnection({key:k,revision:randomUUID(),kind:'csv',family:'file',effectiveFamily:'file',publicConfig:{kind:'csv',path},credentialPresence:{}}):undefined;
  const d=new ConnectionDraft(descriptor,k,current);if(!edit)d.setField(['path'],path);return d;
 };
 return{a,b,owner,tests,supervisor,lanes,calls,cancels,key,identity,draft,
  reject:(value:unknown)=>{rejected=value;},
  holdPreparation:()=>{preparation=deferred();gates.push(preparation);return preparation;},clearPreparation:()=>{preparation=null;},
  holdReply:()=>{reply=deferred();gates.push(reply);return reply;},clearReply:()=>{reply=null;},change:(fn:typeof change)=>{change=fn;},
  close:async()=>{for(const g of gates)g.resolve();tests.dispose();owner.dispose();await owner.whenDisposed();for(const l of lanes)l.dispose();await supervisor.shutdown();await server.close();await runtime.close();assert.deepEqual(readFileSync(path),bytes);rmSync(dir,{recursive:true,force:true});}};
}

test('CM-S5-TEST-TS: identical Test/Save input, optional Test, repeated clicks, exact stale-result identity and cancel/drain behavior',{timeout:60000},async()=>{
 const f=await fixture();try{
  const d=f.draft(f.key(),true),identity=f.identity();f.tests.setView(identity);
  const save=d.serialize();assert.equal(f.calls.length,0,'Save serialization does not require a Test');
  const gate=f.holdPreparation(),first=f.tests.test(d,identity);await until(()=>f.calls.length===1);
  const request=f.calls[0]!.request;
  assert.deepEqual({key:request.key,expectedRevision:request.expectedRevision,publicPatch:request.publicPatch,credentials:request.credentials},{key:save.key,expectedRevision:save.expectedRevision,publicPatch:save.publicPatch,credentials:save.credentials});
  assert.equal(request.draftRevision,d.view.draftRevision);assert.match(request.requestId,/^[a-f0-9-]{36}$/);
  await assert.rejects(f.tests.test(d,identity),{code:'busy'});assert.equal(f.calls.length,1);
  d.setField(['label'],'edited');assert.equal(f.tests.view.status,'idle');await first;
  assert.equal(f.supervisor.activeCount,1,'cancellation result leaves preparation/drain reserved');assert.equal(f.cancels.length,1);
  const before=f.lanes.length;await f.tests.test(d,identity);
  assert.equal(f.tests.view.status,'unavailable');assert.equal(f.tests.view.cleanupUnverified,true);
  assert.equal(f.lanes.length,before,'retry never opens a replacement transport');assert.equal(f.supervisor.activeCount,1);
  assert.equal(f.calls[0]!.connection,f.calls[1]!.connection);assert.equal(f.cancels[0],f.calls[0]!.connection);
  gate.resolve();f.clearPreparation();await until(()=>f.supervisor.activeCount===0);
  await f.tests.test(d,identity);assert.equal(f.tests.view.status,'reachable');assert.equal(f.tests.view.cleanupUnverified,false);assert.ok(f.tests.view.tookMs!>=0);
  d.setField(['label'],'success is now stale');assert.equal(f.tests.view.status,'idle');
  assert.equal(f.calls[2]!.connection,f.calls[0]!.connection);
  assert.equal(JSON.stringify(f.tests),'{}');assert.equal(JSON.stringify(d),'{}');
  // A result already produced by the daemon but delivered after A→B→A cannot repaint the new view.
  const delayed=f.holdReply(),old=f.tests.test(d,identity);await until(()=>f.calls.length===4&&f.supervisor.activeCount===0);
  f.tests.setView(f.identity(f.key('saved','other')));const returned=f.identity();f.tests.setView(returned);
  delayed.resolve();f.clearReply();await old;assert.equal(f.tests.view.status,'idle');
  await assert.rejects(f.tests.test(d,identity),{code:'stale-view'});
  // Full key and local generation are client-only correlation, not spoofable authority fields on wire.
  await assert.rejects(f.tests.test(f.draft(f.key('saved','other')),returned),{code:'stale-view'});
  await assert.rejects(f.tests.test(f.draft(f.key('temporary')),returned),{code:'stale-view'});
  assert.ok(!Object.hasOwn(request,'viewGeneration'));assert.ok(!Object.hasOwn(request,'daemonEpoch'));
  for(const corrupt of [
   (r:DraftTestResult)=>({...r,requestId:randomUUID()}),
   (r:DraftTestResult)=>({...r,draftRevision:r.draftRevision+1}),
   (r:DraftTestResult)=>({...r,repoRoot:f.b}),
   (r:DraftTestResult)=>({...r,daemonEpoch:'other-epoch'}),
   (r:DraftTestResult)=>({...r,status:'failed' as const,safeMessage:'PRIVATE_EXCEPTION_CANARY'}),
  ]){f.change(corrupt);await f.tests.test(d,returned);assert.equal(f.tests.view.status,'unavailable');assert.equal(f.tests.view.message,'Connection test unavailable. Retry after cleanup completes.');}
  f.change(null);
  // Closing and reopening only the manager preserves the source through cleanup.
  const closeGate=f.holdPreparation(),closing=f.tests.test(d,returned);await until(()=>f.supervisor.activeCount===1);
  f.tests.setView(null);await closing;assert.equal(f.tests.view.status,'idle');assert.equal(f.supervisor.activeCount,1);
  const reopened=f.identity();f.tests.setView(reopened);await f.tests.test(d,reopened);assert.equal(f.tests.view.status,'unavailable');
  assert.equal(f.lanes.length,before);closeGate.resolve();f.clearPreparation();await until(()=>f.supervisor.activeCount===0);
  await f.tests.test(d,reopened);assert.equal(f.tests.view.status,'reachable');
  // Root switch cancellation stays on the captured temporary data socket, never the current root's lane.
  const tempKey=f.key('temporary'),temp=f.draft(tempKey),ti=f.identity(tempKey);f.tests.setView(ti);const tg=f.holdPreparation();
  const temporary=f.tests.test(temp,ti);await until(()=>f.supervisor.activeCount===1);
  const temporarySource=f.calls.at(-1)!.connection;assert.equal(f.calls.at(-1)!.claimed,true);
  await f.owner.selectRoot(f.b);f.tests.setView(f.identity({...tempKey,repoRoot:f.b}));await temporary;
  assert.equal(f.cancels.at(-1),temporarySource);assert.equal(f.supervisor.activeCount,1);assert.equal(f.tests.view.status,'idle');
  tg.resolve();f.clearPreparation();await until(()=>f.supervisor.activeCount===0);
  await f.owner.selectRoot(f.a);
  const credentialKey=f.key('saved','credential-intent'),credentialDraft=new ConnectionDraft(descriptors.find(x=>x.kind==='postgres')!,credentialKey);
  credentialDraft.setField(['endpoint'],'postgresql://fixture.invalid/database');credentialDraft.setCredential('url.password','replace','fixture-only-private-intent');
  const credentialIdentity=f.identity(credentialKey),cg=f.holdPreparation();f.tests.setView(credentialIdentity);
  const credentialsBefore=credentialDraft.serialize(),credentialTest=f.tests.test(credentialDraft,credentialIdentity);
  await until(()=>f.supervisor.activeCount===1);const sent=f.calls.at(-1)!.request;
  assert.deepEqual(sent.publicPatch,credentialsBefore.publicPatch);assert.deepEqual(sent.credentials,credentialsBefore.credentials);
  assert.ok(!JSON.stringify(f.tests.view).includes('fixture-only-private-intent'));
  f.tests.setView(null);await credentialTest;cg.resolve();f.clearPreparation();await until(()=>f.supervisor.activeCount===0);
 }finally{await f.close();}
});

test('CM-S5-TEST-TS: real supervisor timeout keeps its transport and never treats the result as drain',{timeout:30000},async()=>{
 const f=await fixture();try{
  const d=f.draft(),i=f.identity();f.tests.setView(i);const gate=f.holdPreparation();
  await f.tests.test(d,i);assert.equal(f.tests.view.status,'timeout');assert.equal(f.tests.view.cleanupUnverified,true);assert.equal(f.supervisor.activeCount,1);
  const count=f.lanes.length;await f.tests.test(d,i);assert.equal(f.tests.view.status,'unavailable');assert.equal(f.supervisor.activeCount,1);
  assert.equal(f.lanes.length,count);assert.equal(f.calls[0]!.connection,f.calls[1]!.connection);
  gate.resolve();f.clearPreparation();await until(()=>f.supervisor.activeCount===0);await f.tests.test(d,i);assert.equal(f.tests.view.status,'reachable');
 }finally{await f.close();}
});


test('CM-S5-TEST-TS: known input rejection is actionable without false worker cleanup, while prior uncertainty keeps its source',async()=>{
 const f=await fixture();try{
  const d=f.draft(),i=f.identity();f.tests.setView(i);
  const rejected={status:'rejected',code:'invalid-input',message:'PRIVATE_PATH_EXCEPTION_CANARY'};
  f.reject(rejected);await f.tests.test(d,i);
  assert.equal(f.tests.view.status,'failed');assert.equal(f.tests.view.cleanupUnverified,false);assert.match(f.tests.view.message,/inside the selected repository/);assert.equal(f.supervisor.activeCount,0);assert.ok(!JSON.stringify(f.tests.view).includes('PRIVATE_PATH_EXCEPTION_CANARY'));
  f.reject(null);await f.tests.test(d,i);assert.equal(f.tests.view.status,'reachable');
  f.change(r=>({...r,daemonEpoch:'wrong-epoch'}));await f.tests.test(d,i);assert.equal(f.tests.view.cleanupUnverified,true);
  const source=f.calls.at(-1)!.connection,lanes=f.lanes.length;
  f.reject(rejected);await f.tests.test(d,i);assert.equal(f.tests.view.status,'failed');assert.equal(f.tests.view.cleanupUnverified,true);assert.equal(f.calls.at(-1)!.connection,source);assert.equal(f.lanes.length,lanes);
  f.reject(null);f.change(null);await f.tests.test(d,i);assert.equal(f.tests.view.status,'reachable');assert.equal(f.tests.view.cleanupUnverified,false);assert.equal(f.calls.at(-1)!.connection,source);
  f.reject({...rejected,code:'busy'});await f.tests.test(d,i);assert.equal(f.tests.view.status,'unavailable');assert.equal(f.tests.view.cleanupUnverified,true);assert.match(f.tests.view.message,/busy/);
 }finally{await f.close();}
});
