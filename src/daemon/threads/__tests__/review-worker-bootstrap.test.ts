import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel,Worker } from 'node:worker_threads';
import { mkdtemp,mkdir,cp,writeFile,readFile,rm,symlink,chmod,open,rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ThreadServices } from '../main-services.js';
import { startWorker } from '../workers.js';
import { startReviewWorkerBootstrap,ReviewWorkerBootstrapError,ReviewBootstrapFence } from '../review-worker-bootstrap.js';
import type { ReviewBootstrapDeps,StartedReviewWorker } from '../review-worker-bootstrap.js';
import type { ReviewBootstrapInput } from '../review-worker-contract.js';
import { getToolSettings } from '../../tools/config.js';
import { getLockManager } from '../../../shared/locks/lock-manager.js';
import { getStoreGuard } from '../../../db/store-guard.js';
import { serveHub,pushToWorker } from '../channel.js';
import { ReviewWorkerNativeTransport,REVIEW_NATIVE_OP } from '../review-worker-native.js';
import { withReviewNativeTransport,reviewNativeTransport } from '../../../shared/review-process-bridge.js';
import { ReviewProcessLeases } from '../review-processes.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';

const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
services.setToolSettings({...getToolSettings(),shell:{...getToolSettings().shell,defaultTimeoutMs:3210}});
function packet(){return{reviewRevision:'a'.repeat(40),storyId:'s1',functionalSummary:'Fixture',documents:{},reviewSet:[{commit:'a'.repeat(40),parent:null,files:[{path:'a.ts',segments:[{after:[1,1]}]}]}],tests:[]};}
const input=(project:string,family:'code'|'design'):ReviewBootstrapInput=>({key:{project,family,reviewId:`bootstrap-${family}`},incarnation:`${family}-instance`,attempt:1,reviewer:'daemon',actionId:'bootstrap-action',submitted:family==='code'?packet():{phase:'start',repo:project,reviewId:`bootstrap-${family}`,attempt:1,artifactPath:'unread-artifact.json'}});
function rpc(started:StartedReviewWorker,method:string,params:unknown):Promise<any>{
 const requestId=Math.random().toString();return new Promise((resolve,reject)=>{
  const handler=(value:any)=>{if(value?.kind!=='reply'||value.requestId!==requestId)return;started.worker.off('message',handler);if(value.error)reject(Error(value.error));else resolve(value.result);};
  started.worker.on('message',handler);started.worker.postMessage({kind:'request',requestId,method,params,stream:false});
 });
}
async function nativeHost(review:ReviewBootstrapInput,port:MessageChannel['port1']){
 const binary=join(review.key.project,'bootstrap-cli.mjs');
 await writeFile(binary,'#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>process.stdout.write(JSON.stringify({type:"assistant",message:{content:[{type:"tool_use",id:"out",name:"StructuredOutput",input:{ok:true}}]}})+"\\n"));');await chmod(binary,0o755);
 const path=reviewWorkerCheckpoint(review.key),leases=new ReviewProcessLeases({authorize:(r,c)=>{assert.deepEqual(r.key,review.key);assert.ok([binary,process.execPath].includes(c.command));},verifyIntent:async r=>{
  const cp=JSON.parse(await readFile(path,'utf8'));assert.ok(cp.attempts.at(-1).resourceGuard.openLeases.some((l:any)=>l.operationId===r.operationId));
 }}),owner=leases.register(review.key,review.incarnation);
 let sequence=0,calls=0,writes=Promise.resolve();const outcomes=new Map(),acks=new Map<string,()=>void>();
 const number=(r:any)=>Number(r.operationId.split(':').at(-1));
 const mutate=(fn:(cp:any)=>void)=>{const next=writes.then(async()=>{
  const cp=JSON.parse(await readFile(path,'utf8'));fn(cp);const temp=path+'.fixture';const f=await open(temp,'w',0o600);try{await f.writeFile(JSON.stringify(cp));await f.sync();}finally{await f.close();}await rename(temp,path);const d=await open(join(path,'..'),'r');try{await d.sync();}finally{await d.close();}
 });writes=next.catch(()=>{});return next;};
 const stop=serveHub(port,{
  [REVIEW_NATIVE_OP+'resolveBinary']:()=>binary,
  [REVIEW_NATIVE_OP+'reserve']:(raw:any)=>{calls++;return leases.reserve(owner,++sequence,raw.command);},
  [REVIEW_NATIVE_OP+'saveOpenIntent']:async(raw:any)=>{const r=raw.reservation;await mutate(cp=>{const a=cp.attempts.at(-1);a.resourceGuard??={daemonInstance:leases.daemonInstance,openLeases:[]};a.resourceGuard.openLeases.push({operationId:r.operationId,workerIncarnation:r.workerIncarnation,kind:r.kind,openedAt:r.openedAt});});return{checkpointPath:path,attempt:review.attempt,operationId:r.operationId,workerIncarnation:r.workerIncarnation,daemonInstance:r.daemonInstance};},
  [REVIEW_NATIVE_OP+'start']:async(raw:any)=>{const outcome=await leases.start(owner,number(raw.reservation),raw.receipt,output=>new Promise<void>(resolve=>{acks.set(`${output.operationId}:${output.sequence}`,resolve);pushToWorker(port,REVIEW_NATIVE_OP+'output',output);})).result;outcomes.set(raw.reservation.operationId,outcome);return outcome;},
  [REVIEW_NATIVE_OP+'outputAck']:(raw:any)=>{assert.equal(raw.error,undefined);const key=`${raw.operationId}:${raw.sequence}`;acks.get(key)?.();acks.delete(key);},
  [REVIEW_NATIVE_OP+'waitStarted']:(raw:any)=>leases.waitStarted(owner,number(raw.reservation)),
  [REVIEW_NATIVE_OP+'write']:(raw:any)=>leases.write(owner,number(raw.reservation),raw.bytes,raw.end),
  [REVIEW_NATIVE_OP+'cancel']:async(raw:any)=>{const outcome=await leases.cancel(owner,number(raw.reservation));outcomes.set(raw.reservation.operationId,outcome);return outcome;},
  [REVIEW_NATIVE_OP+'saveClosedIntent']:async(raw:any)=>{assert.equal(outcomes.get(raw.reservation.operationId)?.disposal.state,'confirmed');await mutate(cp=>{const a=cp.attempts.at(-1);a.resourceGuard.openLeases=a.resourceGuard.openLeases.filter((l:any)=>l.operationId!==raw.reservation.operationId);});},
 });
 return{calls:()=>calls,close:async()=>{for(const resolve of acks.values())resolve();acks.clear();await leases.close(owner);if(leases.recheck(owner))leases.release(owner);stop();port.close();}};
}
async function launch(t:{after:(fn:()=>Promise<void>)=>void},review:ReviewBootstrapInput,deps:Omit<ReviewBootstrapDeps,'fence'>&{fence?:ReviewBootstrapFence}={}){
 const {port1,port2}=new MessageChannel();
 const native=await nativeHost(review,port1);
 const started=await startReviewWorkerBootstrap(services,review,port2,{...deps,fence:deps.fence??new ReviewBootstrapFence(review)});
 t.after(async()=>{await started.worker.terminate();await started.reclaimed;started.disconnect();await native.close();});
 return{...started,nativeCalls:native.calls};
}
test('real worker joins guards and starts from the registered entrypoint',async t=>{
 const hooks=process.env['INSRC_TEST_HOOKS'];process.env['INSRC_TEST_HOOKS']='1';t.after(()=>{if(hooks===undefined)delete process.env['INSRC_TEST_HOOKS'];else process.env['INSRC_TEST_HOOKS']=hooks;});
 const root=await mkdtemp(join(tmpdir(),'review-bootstrap-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const family of ['code','design'] as const){
  const repo=join(root,family);await mkdir(repo);const review=input(repo,family),started=await launch(t,review);
  const description=await rpc(started,'review.worker.describe',review);
  assert.ok(description.threadId>0);assert.equal(description.nativeBound,true);assert.equal(description.storeOwnerDeclared,true);assert.equal(description.shellTimeoutMs,3210);
  assert.equal(description.coordinator,family==='code'?'TaskReviewCoordinator':'DesignReviewCoordinator');
  const disk=JSON.parse(await readFile(started.admission.checkpointPath,'utf8'));assert.equal(disk.schemaVersion,2);assert.equal(disk.attempts[0].phase,'admission');assert.equal(disk.attempts[0].validation,'unverified');
  const progress=await rpc(started,'review.worker.progress',{...review,attempt:1});assert.ok(progress);
  assert.equal(started.fence.state,'ready');
  assert.deepEqual(await rpc(started,'test.review.native',{...review,probe:'role'}),{changed:false,role:'review'});
  assert.deepEqual(await rpc(started,'test.review.native',{...review,probe:'cli'}),{ok:true});
  const tool=await rpc(started,'test.review.native',{...review,probe:'tool'});assert.deepEqual(tool.stdout,new Uint8Array([0,255,128,10]));assert.equal(tool.code,0);
  const calls=started.nativeCalls();await assert.rejects(rpc(started,'test.review.native',{...review,probe:'missing'}),/not installed/);assert.equal(started.nativeCalls(),calls);
  await assert.rejects(rpc(started,'review.worker.describe',{...review,incarnation:'stale'}),/stale/);
  await assert.rejects(rpc(started,'review.worker.describe',{...review,key:{...review.key,reviewId:'foreign'}}),/stale/);
 }
 // Build a disposable compiled tree, without replacing the shared out/ used
 // by another session. Full package/release qualification remains t16.
 const built=join(root,'package');await mkdir(built);await symlink(join(process.cwd(),'node_modules'),join(built,'node_modules'),'dir');await writeFile(join(built,'package.json'),'{"type":"module"}');
 execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--outDir',join(built,'out')],{cwd:process.cwd(),stdio:'pipe',timeout:60000});
 await cp('src/assets',join(built,'out/assets'),{recursive:true});await cp('src/prompts',join(built,'out/prompts'),{recursive:true});
 const {startWorker:compiledStart}=await import(pathToFileURL(join(built,'out/daemon/threads/workers.js')).href);
 const {ThreadServices:CompiledServices}=await import(pathToFileURL(join(built,'out/daemon/threads/main-services.js')).href);
 const compiledServices=new CompiledServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));compiledServices.setToolSettings(getToolSettings());
 for(const family of ['code','design'] as const){
  const repo=join(root,`compiled-${family}`);await mkdir(repo);const review=input(repo,family),compiled=await launch(t,review,{start:(_s,...args)=>compiledStart(compiledServices,...args)});
  assert.equal((await rpc(compiled,'review.worker.describe',review)).coordinator,family==='code'?'TaskReviewCoordinator':'DesignReviewCoordinator');
  assert.deepEqual(await rpc(compiled,'test.review.native',{...review,probe:'cli'}),{ok:true});assert.equal((await rpc(compiled,'test.review.native',{...review,probe:'tool'})).code,0);
 }
});
test('never-ready and pre-save-hung workers fail within the parent bound and reject late acknowledgments',async()=>{
 for(const beforeSave of [false,true]){
  const project=await mkdtemp(join(tmpdir(),'review-bootstrap-hang-')),review=input(project,'code'),{port1,port2}=new MessageChannel();
  let worker:Worker|undefined,closed=false,ready=false;
  const fence=new ReviewBootstrapFence(review);let creations=0;
  const began=Date.now();
  const failed=startReviewWorkerBootstrap(services,review,port2,{
   fence,
   schedule:(fn,ms)=>{assert.equal(ms,30000);const timer=setTimeout(fn,1500);return()=>clearTimeout(timer);},
   onClosing:()=>{closed=true;},
   start:(s,name,_script,extra,onCreated)=>{creations++;return startWorker(s,name,'__tests__/helpers/review-bootstrap-hang',{...extra!,workerData:{...extra!.workerData,beforeSave}},w=>{worker=w;w.on('message',m=>{if(m==='worker-ready')ready=true;});onCreated?.(w);});},
  });
  let error:ReviewWorkerBootstrapError|undefined;
  await assert.rejects(failed,e=>{assert.ok(e instanceof ReviewWorkerBootstrapError);error=e;return e.code==='review_worker_bootstrap_timeout';});
  assert.ok(Date.now()-began<5000);assert.equal(closed,true);assert.equal(ready,beforeSave);
  assert.equal(fence.state,'closing');const retry=new MessageChannel();assert.throws(()=>startReviewWorkerBootstrap(services,review,retry.port2,{fence}),/fenced/);retry.port1.close();assert.equal(creations,1);
  worker!.emit('message',{kind:'review-admission-saved',...review,checkpointPath:join(project,'.insrc/tmp/code-review',`${review.key.reviewId}.json`)});
  await assert.rejects(failed,/bootstrap_timeout/);await error!.reclaimed;
  assert.equal(fence.reclaimed,true);assert.equal(fence.state,'closing');
  assert.equal(getLockManager().query().held.some(x=>x.name==='review-bootstrap-held'),false);assert.equal(getStoreGuard().holders().length,0);
  port1.close();await rm(project,{recursive:true,force:true});
 }
});
test('native byte replies retain the originating review async context',async()=>{
 const {port1,port2}=new MessageChannel(),review=input('/tmp','code');
 const reservation={key:review.key,workerIncarnation:review.incarnation,daemonInstance:'host',operationId:'op',kind:'cli',openedAt:new Date().toISOString(),commandDigest:'a'.repeat(64)};
 let ack!:()=>void;const acknowledged=new Promise<void>(r=>{ack=r;});
 const stop=serveHub(port1,{
  [REVIEW_NATIVE_OP+'start']:async()=>{pushToWorker(port1,REVIEW_NATIVE_OP+'output',{operationId:'op',workerIncarnation:review.incarnation,sequence:1,stream:'stdout',bytes:new Uint8Array([120])});await acknowledged;return{code:0,signal:null,aborted:false,timedOut:false,spawnError:false,disposal:{state:'confirmed',reason:'closed'},stdoutBytes:1,stderrBytes:0};},
  [REVIEW_NATIVE_OP+'outputAck']:()=>{ack();},
 });
 try{
  const transport=new ReviewWorkerNativeTransport(port2,review);
  let observed:ReturnType<typeof reviewNativeTransport>;
  const result=await withReviewNativeTransport(transport,()=>transport.start(reservation,{checkpointPath:'/tmp/fixture.json',attempt:1,operationId:'op',workerIncarnation:review.incarnation,daemonInstance:'host'},async()=>{observed=reviewNativeTransport();}));
  assert.equal(observed,transport);
  assert.equal(result.code,0);
 }finally{stop();port1.close();port2.close();}
});
