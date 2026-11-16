import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cpus, loadavg } from 'node:os';
import { performance } from 'node:perf_hooks';
import { ProductionReviews, installProductionReviews } from '../../review-service.js';
import { ThreadServices } from '../main-services.js';
import { startReviewWorkerBootstrap } from '../review-worker-bootstrap.js';
import { startWorker } from '../workers.js';
import { ReviewRuntimeStore } from '../review-runtime-store.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';
import { IpcServer, directDispatch } from '../../server.js';
import { startTaskReview, readTaskReviewProgress } from '../../task-review-rpc.js';
import { LocalPeer } from './helpers/review-clearance-fixture.js';

test('Retained 171-file/four-attempt cold x3, warm and history 1/4/max source-light qualification with locator/Git/workspace/memory/RSS/write metrics, exact scope and mandatory coverage.', {timeout:900000}, async t=>{
 const root=await mkdtemp('/tmp/review-performance-');t.after(()=>rm(root,{recursive:true,force:true}));
 const manifest=JSON.parse(await readFile(new URL('./fixtures/review-preparation/manifest.json',import.meta.url),'utf8'));
 const bytes=gunzipSync(await readFile(new URL('./fixtures/review-preparation/history.json.gz',import.meta.url)));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.checkpointSha256);
 const repo=join(root,'project');execFileSync('git',['clone','--local','--no-hardlinks','--no-checkout','--quiet',resolve('.'),repo]);
 execFileSync('git',['-C',repo,'checkout','--quiet',manifest.sourceRevision]);
 const retained=JSON.parse(bytes.toString());
 const crPath=join(repo,'.insrc/artifacts/CR-e4af63128c7cbec2-s1.json'),retainedCr=JSON.parse(await readFile(crPath,'utf8'));
	 const historyGrowth=[1,4,retained.attempts.length].map(attempts=>{const prefix=retained.attempts.slice(0,attempts);return{attempts,bytes:Buffer.byteLength(JSON.stringify({...retained,attempts:prefix})),files:new Set(prefix.flatMap((attempt:any)=>attempt.submitted.reviewSet.flatMap((commit:any)=>commit.files.map((file:any)=>file.path)))).size,tests:prefix.map((attempt:any)=>attempt.submitted.tests.length)};});
 assert.deepEqual(historyGrowth.map(entry=>entry.attempts),[1,4,4]);assert.ok(historyGrowth[1]!.bytes>=historyGrowth[0]!.bytes);
 type Counters={path:string;writes:number;writtenBytes:number;maxRuntimeBytes:number;nativeCommands:number;fullHistoryNativeWrites:number;nativeDurations:number[]};
 let active:Counters|undefined;
 const initialize=ReviewRuntimeStore.prototype.initialize;
 t.mock.method(ReviewRuntimeStore.prototype,'initialize',async function(this:ReviewRuntimeStore,...args){
  const owner=this as any,write=owner.write;owner.write=async(...values:any[])=>{const size=Buffer.byteLength(values[1]);if(active){active.writes++;active.writtenBytes+=size;active.maxRuntimeBytes=Math.max(active.maxRuntimeBytes,size);}return write(...values);};return initialize.apply(this,args);
 });
 const resource=ReviewRuntimeStore.prototype.resource;
 t.mock.method(ReviewRuntimeStore.prototype,'resource',async function(this:ReviewRuntimeStore,...args){
  const counters=active;if(!counters)return resource.apply(this,args);
  const before=await stat(counters.path,{bigint:true}),at=performance.now();const value=await resource.apply(this,args);const after=await stat(counters.path,{bigint:true});
  if(before.ino!==after.ino||before.mtimeNs!==after.mtimeNs)counters.fullHistoryNativeWrites++;
  if(args[1]==='open')counters.nativeCommands++;counters.nativeDurations.push(performance.now()-at);return value;
 });
 const ready=new Map<string,(value:any)=>void>(),terminal=new Map<string,any>(),workers=new Map<string,Awaited<ReturnType<typeof startReviewWorkerBootstrap>>>();
 const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'performance-fixture'}));
 const host=new ProductionReviews({services,registeredRepos:async()=>new Set([repo]),track:()=>{},start:async(s,input,port,deps)=>{const worker=await startReviewWorkerBootstrap(s,input,port,{...deps,start:(svc,name,_script,extra,created)=>startWorker(svc,name,'__tests__/helpers/review-performance-worker',extra,w=>{w.on('message',raw=>{if(raw?.kind==='fixture-performance-ready')ready.get(input.key.reviewId)?.(raw);if(raw?.kind==='fixture-performance-failed')terminal.set(input.key.reviewId,raw);});created?.(w);})});workers.set(input.key.reviewId,worker);return worker;}});
 installProductionReviews(host);const server=new IpcServer(directDispatch({'taskReview.start':startTaskReview,'taskReview.progress':readTaskReviewProgress}),Date.now,join(root,'daemon.sock'));await server.listen();const peer=await LocalPeer.connect(join(root,'daemon.sock'));
 t.after(async()=>{peer.close();await server.close();await host.shutdown();});
 const runs=[] as any[];
 for(let run=1;run<=3;run++){
  const id=`retained-performance-cold-${run}`,history=structuredClone(retained);history.project=repo;history.reviewId=id;
  for(const attempt of history.attempts)attempt.resourceGuard={daemonInstance:'fixture-closed-historical-owner',openLeases:[]};
  const cr=structuredClone(retainedCr);for(const review of cr.body.reviews)if(review.reviewId===manifest.reviewId)review.reviewId=id;await writeFile(crPath,JSON.stringify(cr,null,2)+'\n');
  const key={project:repo,family:'code' as const,reviewId:id},path=reviewWorkerCheckpoint(key);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(history));
  const counters:Counters={path,writes:0,writtenBytes:0,maxRuntimeBytes:0,nativeCommands:0,fullHistoryNativeWrites:0,nativeDurations:[]};active=counters;
  let resolveReady!:(value:any)=>void;const completed=new Promise<any>(resolve=>{resolveReady=resolve;});ready.set(id,resolveReady);
  const request={repo,epicHash:'e4af63128c7cbec2',reviewId:id,attempt:4,operation:'resume'},started=performance.now();
  await peer.call('taskReview.start',request);const admitMs=performance.now()-started;
  let stop=false;const failure=(async()=>{while(!stop){const p=await peer.call('taskReview.progress',request);if(p.status==='failed')return{...(terminal.get(id)??{}),kind:'fixture-performance-failed',providerCalls:0,failure:p.admission?.error??p.error??p};await new Promise(resolve=>setTimeout(resolve,250));}return new Promise<never>(()=>{});})();
  const result=await Promise.race([completed,failure,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error(`Retained preparation run ${run} did not reach readiness or a recorded failure`)),240000).unref())]);stop=true;
  const elapsedMs=performance.now()-started,checkpoint=JSON.parse(await readFile(path,'utf8'));
  assert.deepEqual(checkpoint.attempts.map((a:any)=>a.submitted),history.attempts.map((a:any)=>a.submitted));
  const packet=checkpoint.attempts.at(-1).submitted;assert.equal(new Set(packet.reviewSet.flatMap((c:any)=>c.files.map((f:any)=>f.path))).size,171);assert.equal(checkpoint.attempts.length,4);
  const worker=workers.get(id);assert.ok(worker);const reclaimAt=performance.now();await worker.worker.terminate();await worker.reclaimed;const fixtureReclaimMs=performance.now()-reclaimAt;
  const report={...result,run,workerPreparationMs:result.elapsedMs,fixtureDigest:manifest.checkpointSha256,mode:'full-managed-production-cold',cacheState:'fresh review id and prepared-context generation; operating-system file cache uncontrolled',node:process.version,cpu:cpus()[0]?.model,load:loadavg(),admitMs,fixtureReclaimMs,elapsedMs,runtimeWrites:counters.writes,runtimeWrittenBytes:counters.writtenBytes,maxRuntimeBytes:counters.maxRuntimeBytes,nativeCommands:counters.nativeCommands,nativePersistenceMs:counters.nativeDurations.reduce((a,b)=>a+b,0),fullHistoryNativeWrites:counters.fullHistoryNativeWrites};
  if(result.kind!=='fixture-performance-ready'){await writeFile('/tmp/insrc-review-performance-failure.json',JSON.stringify({...report,historyGrowth},null,2));t.diagnostic(JSON.stringify(report));}
	  assert.equal(result.kind,'fixture-performance-ready',`Full retained qualification failed: ${JSON.stringify(result)}`);
	  assert.ok(admitMs<=2000,`Admission ${admitMs}ms exceeds 2000ms release gate`);assert.ok(result.warmHandoffMs!==null&&result.warmHandoffMs<=10000,`Warm phase handoff ${result.warmHandoffMs}ms exceeds 10000ms release gate`);
	  assert.equal(result.qualifiedHistoryAttempts,4,'all retained 1/4/max history boundaries must qualify');assert.equal(result.preparedTests,115,'all mandatory test evidence must reach the qualified packet');assert.equal(result.locatorCount,result.preparedChanges,'every prepared change must have one source-light locator');assert.ok(result.locatorCount>171);assert.ok(result.locatorBlockCount>0);
	  assert.ok(result.workspaceFiles>0);assert.ok(result.workspaceBytes>0);assert.equal(result.aggregateSourceBodyBytes,0,'prepared metadata must not retain aggregate source bodies');assert.ok(result.physicalQueries>0);assert.equal(result.physicalDuplicates,0);
	  const memoryLimit=result.sourceSessions[0]?.workingMemory?.limit;assert.ok(Number.isSafeInteger(memoryLimit));assert.ok(result.memoryHighWaterBytes>0&&result.memoryHighWaterBytes<=memoryLimit,`charged memory ${result.memoryHighWaterBytes} exceeds ${memoryLimit}`);
	  for(const field of ['heapUsed','external','rss'] as const)assert.ok(Number.isSafeInteger(result.processMemory[field])&&result.processMemory[field]>0,`missing ${field} measurement`);
	  assert.equal(counters.fullHistoryNativeWrites,0);assert.ok(counters.maxRuntimeBytes<=256*1024);assert.ok(elapsedMs<=120000,`Cold managed preparation ${elapsedMs}ms exceeds 120000ms release gate`);
  runs.push(report);ready.delete(id);active=undefined;
 }
 const sorted=runs.map(run=>run.elapsedMs as number).sort((a,b)=>a-b),report={fixtureDigest:manifest.checkpointSha256,mode:'full-managed-production-cold-x3',coldRuns:runs,coldMedianMs:sorted[1],warmHandoffMedianMs:[...runs].map(run=>run.warmHandoffMs as number).sort((a,b)=>a-b)[1],historyGrowth};
 assert.ok(report.coldMedianMs<=120000,`Cold median ${report.coldMedianMs}ms exceeds 120000ms release gate`);assert.ok(report.warmHandoffMedianMs<=10000,`Warm handoff median ${report.warmHandoffMedianMs}ms exceeds 10000ms release gate`);
 await writeFile('/tmp/insrc-review-performance.json',JSON.stringify(report,null,2));t.diagnostic(JSON.stringify(report));
});
