import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { ReviewPreparationHost } from '../review-preparation-host.js';
import { ReviewPreparationClient } from '../review-preparation-client.js';
import { ReviewRuntimeStore } from '../review-runtime-store.js';
import type { ReviewRuntime } from '../../../shared/review-preparation.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { preparationDigest, writePreparedContext, PreparedContextReader, contextRoot } from '../../../workflow/review/prepared-context.js';
import { ReviewSourceSession } from '../../../workflow/review/source-session.js';
import { prepareReviewPacket } from '../../../workflow/code-review/task-review/packet.js';
import { HistoryBindingSession } from '../../../workflow/review/history-binding.js';
import { codeHistoryFeedback } from '../../../workflow/review/history-feedback.js';
import { ThreadServices } from '../main-services.js';
import { startWorker } from '../workers.js';
import { HubClient } from '../channel.js';

async function setup(t: { after(fn: () => Promise<void>): void }, limit = 256 * 1024 * 1024) {
 const f=await fixture(),limits={...reviewPreparationLimits(join(f.repo,'missing.json')),cacheMaxBytes:limit},store=new ReviewRuntimeStore();
 const disposed=new Set<string>(),closed=new Set<string>(),connections: {close():Promise<void>;port:{close():void}}[]=[],handles:Parameters<typeof store.release>[0][]=[];
 const host=new ReviewPreparationHost(store,'epoch',async identity=>{if(closed.has(identity.incarnation))throw Error('Worker no longer current');},async identity=>{if(!disposed.has(identity.incarnation))throw Error('Worker not disposed');},()=>limits);
 async function connect(id:string){
  const key={project:f.repo,family:'code' as const,reviewId:id},incarnation=`worker-${id}`,inputDigest=preparationDigest(f.packet);
  const runtime:ReviewRuntime={schemaVersion:1,key,attempt:1,runtimeId:`runtime-${id}`,daemonEpoch:'epoch',workerIncarnation:incarnation,sequence:0,checkpointBinding:{inputDigest,semanticSequence:0},state:'initializing',resourceGuard:{daemonInstance:'epoch',openLeases:[]},progress:{completedUnits:0,totalUnits:1,observedAt:'2026-11-14T00:00:00.000Z',lastMeaningfulActivityAt:null}};
  const handle=await store.initialize(runtime);handles.push(handle);
  const cp={...f.checkpoint(id),schemaVersion:3,runtime:{runtimeId:runtime.runtimeId,inputDigest}};cp.attempts[0]!['review-response'].tasks=[];delete cp.attempts[0]!.header.completedAt;
  const path=reviewWorkerCheckpoint(key);await writeFile(path,JSON.stringify(cp));await store.activate(handle);
  disposed.add(incarnation);
  const identity={key,incarnation,attempt:1,phase:'execution' as const},connection=await host.connect(identity,handle);connections.push(connection);
  return{key,handle,cp,path,identity,connection,client:new ReviewPreparationClient(connection.port)};
 }
 t.after(async()=>{for(const connection of connections){await connection.close();connection.port.close();}for(const handle of handles)store.release(handle);f.cleanup();});
 return{f,host,store,limits,closed,disposed,connect};
}

test('private preparation ports share aggregate capacity and reject foreign allocations and forged input',async t=>{
 const f=await setup(t,1000),one=await f.connect('one'),two=await f.connect('two');
 const token=await one.client.reserve(600);assert.equal(f.host.reservedBytes(f.f.repo),600);
 await assert.rejects(two.client.reserve(500),/capacity exhausted/);
 await assert.rejects(two.client.release(token),/Foreign/);
 const parts=await one.client.split(token,[200,300]);await one.client.commit(parts[0]!,100);
 const combined=await one.client.combine(parts);assert.equal(f.host.reservedBytes(f.f.repo),400);
 const raw=new HubClient(two.connection.port);await assert.rejects(raw.request('capacity.reserve',{bytes:1,key:one.key}),/Invalid private/);
 await one.connection.close();assert.equal(f.host.reservedBytes(f.f.repo),400,'reclamation does not refund retained disk');
 await assert.rejects(f.host.releaseCleaned(two.key,async()=>{}),/borrowed/);
 await assert.rejects(f.host.releaseCleaned(one.key,async()=>{throw Error('Files still present');}),/Files still present/);
 assert.equal(f.host.reservedBytes(f.f.repo),400);
 await f.host.releaseCleaned(one.key,async()=>{});assert.equal(f.host.reservedBytes(f.f.repo),0);
 await assert.rejects(two.client.release(combined),/Foreign/);
});

test('private bridge binds context and accepted history to current input and retains capacity until cleanup',async t=>{
 const f=await setup(t),one=await f.connect('context'),two=await f.connect('other');
 const session=await ReviewSourceSession.create(one.key,f.f.deps.sources,f.limits,one.client);
 const prepared=await prepareReviewPacket(f.f.packet,session,true),inputDigest=preparationDigest(f.f.packet);
 const identity={key:one.key,attempt:1,inputDigest,validatorVersion:1,routeDigest:preparationDigest(f.f.packet.documents),sourceIdentity:preparationDigest(f.f.packet.reviewRevision),scopeDigest:prepared.projection!.identity,testDocumentDigest:preparationDigest(f.f.packet.tests)};
 const receipt=await writePreparedContext(identity,{current:prepared},session,f.limits,one.client);
 await assert.rejects(two.client.qualify(identity,receipt),/Foreign prepared input/);
 const publication=await f.host.connect({...one.identity,phase:'publication'},one.handle),publisher=new ReviewPreparationClient(publication.port);
 try{
  await assert.rejects(publisher.qualify(identity,receipt),/Foreign/);
  // A rejected qualification cannot pin or mutate the source owner's token.
  await one.client.commit(receipt.capacityToken,receipt.storedBytes);
  await one.client.qualify(identity,receipt);
  await assert.rejects(publisher.qualify(identity,receipt),/Foreign/);
  // Qualified immutable data is reusable via a new phase's own borrow only.
  const warm=await publisher.borrow(identity);assert.deepEqual(await publisher.resolve(warm.access),receipt);await publisher.releaseBorrow(warm.access);
 }finally{await publication.close();publication.port.close();}
 await one.client.qualify(identity,receipt);const borrowed=await one.client.borrow(identity);
 await assert.rejects(two.client.resolve(borrowed.access),/Unissued|Foreign|access/i);
 await assert.rejects(one.client.release(receipt.capacityToken),/retained/);
 const reader=await PreparedContextReader.open(receipt,f.limits,async()=>{await one.client.resolve(borrowed.access);},async()=>{await one.client.invalidate(borrowed.access);});
 assert.equal((await reader.view('current') as typeof prepared).projection!.identity,prepared.projection!.identity);
 await session.close();
 const history=await HistoryBindingSession.open(receipt,one.cp,{authorize:()=>one.client.resolve(borrowed.access),validate:codeHistoryFeedback(new Map([[1,prepared]]),{commit:(oid)=>reader.query('commit',[oid]) as ReturnType<typeof session.commit>,file:(oid,path)=>reader.query('file',[oid,path]) as ReturnType<typeof session.file>,isAncestor:(a,b)=>reader.query('isAncestor',[a,b]) as ReturnType<typeof session.isAncestor>,changedRanges:(oid,parent,paths)=>reader.query('changedRanges',[oid,parent,paths]) as ReturnType<typeof session.changedRanges>,pathChanges:(a,b,path)=>reader.query('pathChanges',[a,b,path]) as ReturnType<typeof session.pathChanges>}),capacity:one.client,limits:f.limits,invalidateSource:async()=>{await one.client.invalidate(borrowed.access);}});
 await one.client.acceptHistory(borrowed.access,history.latest());
 const cp=JSON.parse(await readFile(one.path,'utf8'));cp.attempts[0]['review-response'].tasks.push(structuredClone(f.f.result));
 const boundary=await history.accept(cp);await one.client.acceptHistory(borrowed.access,boundary);
 assert.equal(f.store.snapshot(one.handle).progress.completedUnits,1);
 const bytes=f.host.reservedBytes(f.f.repo);await one.connection.close();assert.equal(f.host.reservedBytes(f.f.repo),bytes);
 await f.host.releaseCleaned(one.key,async()=>{await rm(contextRoot(one.key),{recursive:true});});assert.equal(f.host.reservedBytes(f.f.repo),0);
});

test('private preparation requests are revoked when the exact worker loses ownership',async t=>{
 const f=await setup(t),one=await f.connect('one'),two=await f.connect('two');
 const token=await one.client.reserve(100);f.closed.add(one.identity.incarnation);
 await assert.rejects(one.client.commit(token,20),/no longer current/);
 const other=await two.client.reserve(200);assert.equal(f.host.reservedBytes(f.f.repo),300);
 await two.client.release(other);assert.equal(f.host.reservedBytes(f.f.repo),100);
});


test('private preparation client validates and reads qualified context from a real worker and retains proof until actual reclamation',async t=>{
 const f=await setup(t),one=await f.connect('thread-context');
 const session=await ReviewSourceSession.create(one.key,f.f.deps.sources,f.limits,one.client),prepared=await prepareReviewPacket(f.f.packet,session,true);
 const identity={key:one.key,attempt:1,inputDigest:preparationDigest(f.f.packet),validatorVersion:1,routeDigest:preparationDigest(f.f.packet.documents),sourceIdentity:preparationDigest(f.f.packet.reviewRevision),scopeDigest:prepared.projection!.identity,testDocumentDigest:preparationDigest(f.f.packet.tests)};
 const receipt=await writePreparedContext(identity,{current:prepared},session,f.limits,one.client);await one.client.qualify(identity,receipt);
 const {access}=await one.client.borrow(identity);await session.close();
 const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
 const started=await startWorker(services,'preparation-client','__tests__/helpers/preparation-bridge-worker',{workerData:{preparationPort:one.connection.port},transferList:[one.connection.port]});
 f.disposed.delete(one.identity.incarnation);
 try{
  const read=new Promise<any>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Fixture worker RPC timed out')),10000);
   started.worker.once('message',(raw:any)=>{clearTimeout(timer);raw.error?reject(Error(raw.error)):resolve(raw.result);});
   started.worker.postMessage({method:'bridge.read',receipt,access,limits:f.limits,query:[f.f.packet.reviewRevision,'source.js']});
  });
  const result=await read;assert.ok(result.threadId>0);assert.equal(result.identity,prepared.projection!.identity);assert.match(result.source,/total = 2/);
  await assert.rejects(one.connection.close(),/not disposed/);
  await assert.rejects(f.host.releaseCleaned(one.key,async()=>{}),/borrowed/);
 }finally{
  await started.worker.terminate();await started.reclaimed;started.disconnect();f.disposed.add(one.identity.incarnation);await one.connection.close();
 }
 assert.ok(f.host.reservedBytes(f.f.repo)>0);
 await f.host.releaseCleaned(one.key,async()=>{await rm(contextRoot(one.key),{recursive:true});});assert.equal(f.host.reservedBytes(f.f.repo),0);
});

test('private progress preserves unknown totals and cannot advance committed result counts',async t=>{
 const f=await setup(t),one=await f.connect('progress'),before=f.store.snapshot(one.handle);
 const preparation={stage:'fetch_sources' as const,logicalCompleted:2,physicalCompleted:1,cacheHits:1,bytes:123,total:null,elapsedMs:100};
 await one.client.progress({progress:{...before.progress,observedAt:'2026-11-14T00:00:01.000Z'},preparation});await f.store.flushProgress(one.handle);
 assert.deepEqual(f.store.snapshot(one.handle).preparation,preparation);assert.equal(f.store.snapshot(one.handle).progress.completedUnits,0);
 await assert.rejects(one.client.progress({progress:{...before.progress,completedUnits:1},preparation}),/cannot authorize/);
 await assert.rejects(one.client.progress({progress:before.progress,preparation:{...preparation,total:1}}),/cannot authorize/);
 assert.equal(f.store.snapshot(one.handle).progress.completedUnits,0);
 const observed=f.store.snapshot(one.handle).progress.observedAt;f.store.snapshot(one.handle);f.host.reservedBytes(f.f.repo);assert.equal(f.store.snapshot(one.handle).progress.observedAt,observed);
});

test('cleanup cannot pass while a private phase attachment is awaiting ownership validation',async t=>{
 const f=await setup(t),one=await f.connect('attach-race');let release!:()=>void,entered!:()=>void,checks=0;
 const barrier=new Promise<void>(resolve=>{release=resolve;}),waiting=new Promise<void>(resolve=>{entered=resolve;});
 const host=new ReviewPreparationHost(f.store,'race-epoch',async()=>{if(++checks===2){entered();await barrier;}},async()=>{},()=>f.limits);
 const connecting=host.connect(one.identity,one.handle);await waiting;let deleted=false;
 await assert.rejects(host.releaseCleaned(one.key,async()=>{deleted=true;}),/borrowed/);assert.equal(deleted,false);
 release();const connection=await connecting;await connection.close();connection.port.close();
 await host.releaseCleaned(one.key,async()=>{deleted=true;});assert.equal(deleted,true);
});

test('one private phase cannot mutate another phase allocation for the same review',async t=>{
 const f=await setup(t),one=await f.connect('phase-owner'),token=await one.client.reserve(100);
 const next=await f.host.connect({...one.identity,phase:'publication'},one.handle),client=new ReviewPreparationClient(next.port);
 try{await assert.rejects(client.release(token),/Foreign/);await assert.rejects(client.commit(token,10),/Foreign/);await assert.rejects(client.split(token,[10]),/Foreign/);}
 finally{await next.close();next.port.close();}
 assert.equal(f.host.reservedBytes(f.f.repo),100);await one.client.release(token);
});

test('cancellation rejects a model candidate released after the private phase was fenced',async t=>{
 const f=await setup(t),one=await f.connect('candidate-race');
 const session=await ReviewSourceSession.create(one.key,f.f.deps.sources,f.limits,one.client),prepared=await prepareReviewPacket(f.f.packet,session,true);
 const identity={key:one.key,attempt:1,inputDigest:preparationDigest(f.f.packet),validatorVersion:1,routeDigest:preparationDigest(f.f.packet.documents),sourceIdentity:preparationDigest(f.f.packet.reviewRevision),scopeDigest:prepared.projection!.identity,testDocumentDigest:preparationDigest(f.f.packet.tests)};
 const receipt=await writePreparedContext(identity,{current:prepared},session,f.limits,one.client);await one.client.qualify(identity,receipt);const {access}=await one.client.borrow(identity);
 const reader=await PreparedContextReader.open(receipt,f.limits,async()=>{await one.client.resolve(access);},async()=>{await one.client.invalidate(access);});await session.close();
 const sources={commit:(oid:string)=>reader.query('commit',[oid]),file:(oid:string,path:string)=>reader.query('file',[oid,path]),isAncestor:(a:string,b:string)=>reader.query('isAncestor',[a,b]),changedRanges:(oid:string,parent:string|null,paths:readonly string[])=>reader.query('changedRanges',[oid,parent,paths]),pathChanges:(a:string,b:string,path:string)=>reader.query('pathChanges',[a,b,path])} as import('../../../workflow/code-review/task-review/sources.js').ReviewSources;
 const history=await HistoryBindingSession.open(receipt,one.cp,{authorize:()=>one.client.resolve(access),validate:codeHistoryFeedback(new Map([[1,prepared]]),sources),capacity:one.client,limits:f.limits,invalidateSource:async()=>{await one.client.invalidate(access);}});
 await one.client.acceptHistory(access,history.latest());const before=await readFile(one.path,'utf8'),reserved=f.host.reservedBytes(f.f.repo);
 let entered!:()=>void,release!:()=>void,calls=0;const waiting=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});t.after(()=>release());
 const provider={runReviewSession:async()=>{calls++;entered();await gate;return structuredClone(f.f.result);}};
 const candidate=(async()=>{const result=await provider.runReviewSession(),cp=JSON.parse(await readFile(one.path,'utf8'));cp.attempts[0]['review-response'].tasks.push(result);return history.accept(cp);})();
 await waiting;await f.store.beginCancellation(one.handle,'cancel-candidate','Cancel before candidate acceptance');release();
 await assert.rejects(candidate,/fenced|closed/i);
 assert.equal(await readFile(one.path,'utf8'),before);assert.equal(f.store.snapshot(one.handle).progress.completedUnits,0);assert.equal(calls,1);assert.equal(f.host.reservedBytes(f.f.repo),reserved);
 await f.store.finishCancellation(one.handle,true,true);
});
