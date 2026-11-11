import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel,Worker } from 'node:worker_threads';
import { mkdtemp,mkdir,cp,writeFile,readFile,rm,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ThreadServices } from '../main-services.js';
import { startWorker } from '../workers.js';
import { startReviewWorkerBootstrap,ReviewWorkerBootstrapError } from '../review-worker-bootstrap.js';
import type { ReviewBootstrapDeps,StartedReviewWorker } from '../review-worker-bootstrap.js';
import type { ReviewBootstrapInput } from '../review-worker-contract.js';
import { getToolSettings } from '../../tools/config.js';
import { getLockManager } from '../../../shared/locks/lock-manager.js';
import { getStoreGuard } from '../../../db/store-guard.js';
import { serveHub,pushToWorker } from '../channel.js';
import { ReviewWorkerNativeTransport,REVIEW_NATIVE_OP } from '../review-worker-native.js';
import { withReviewNativeTransport,reviewNativeTransport } from '../../../shared/review-process-bridge.js';

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
async function launch(t:{after:(fn:()=>Promise<void>)=>void},review:ReviewBootstrapInput,deps:ReviewBootstrapDeps={}){
 const {port1,port2}=new MessageChannel();
 const started=await startReviewWorkerBootstrap(services,review,port2,deps);
 t.after(async()=>{await started.worker.terminate();await started.reclaimed;started.disconnect();port1.close();});
 return started;
}
test('real worker joins guards and starts from the registered entrypoint',async t=>{
 const root=await mkdtemp(join(tmpdir(),'review-bootstrap-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const family of ['code','design'] as const){
  const repo=join(root,family);await mkdir(repo);const review=input(repo,family),started=await launch(t,review);
  const description=await rpc(started,'review.worker.describe',review);
  assert.ok(description.threadId>0);assert.equal(description.nativeBound,true);assert.equal(description.storeOwnerDeclared,true);assert.equal(description.shellTimeoutMs,3210);
  assert.equal(description.coordinator,family==='code'?'TaskReviewCoordinator':'DesignReviewCoordinator');
  const disk=JSON.parse(await readFile(started.admission.checkpointPath,'utf8'));assert.equal(disk.schemaVersion,2);assert.equal(disk.attempts[0].phase,'admission');assert.equal(disk.attempts[0].validation,'unverified');
  const progress=await rpc(started,'review.worker.progress',{...review,attempt:1});assert.ok(progress);
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
 }
});
test('never-ready and pre-save-hung workers fail within the parent bound and reject late acknowledgments',async()=>{
 for(const beforeSave of [false,true]){
  const project=await mkdtemp(join(tmpdir(),'review-bootstrap-hang-')),review=input(project,'code'),{port1,port2}=new MessageChannel();
  let worker:Worker|undefined,closed=false,ready=false;
  const began=Date.now();
  const failed=startReviewWorkerBootstrap(services,review,port2,{
   schedule:(fn,ms)=>{assert.equal(ms,30000);const timer=setTimeout(fn,1500);return()=>clearTimeout(timer);},
   onClosing:()=>{closed=true;},
   start:(s,name,_script,extra,onCreated)=>startWorker(s,name,'__tests__/helpers/review-bootstrap-hang',{...extra!,workerData:{...extra!.workerData,beforeSave}},w=>{worker=w;w.on('message',m=>{if(m==='worker-ready')ready=true;});onCreated?.(w);}),
  });
  let error:ReviewWorkerBootstrapError|undefined;
  await assert.rejects(failed,e=>{assert.ok(e instanceof ReviewWorkerBootstrapError);error=e;return e.code==='review_worker_bootstrap_timeout';});
  assert.ok(Date.now()-began<5000);assert.equal(closed,true);assert.equal(ready,beforeSave);
  worker!.emit('message',{kind:'review-admission-saved',...review,checkpointPath:join(project,'.insrc/tmp/code-review',`${review.key.reviewId}.json`)});
  await assert.rejects(failed,/bootstrap_timeout/);await error!.reclaimed;
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
  const result=await withReviewNativeTransport(transport,()=>transport.start(reservation,{checkpointPath:'/tmp/fixture.json',attempt:1,operationId:'op',workerIncarnation:review.incarnation,daemonInstance:'host'},async()=>{assert.equal(reviewNativeTransport(),transport);}));
  assert.equal(result.code,0);
 }finally{stop();port1.close();port2.close();}
});
