import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,chmod,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Worker } from 'node:worker_threads';
import type { TrustedRpcContext } from '../../request-context.js';
import { ThreadServices } from '../main-services.js';
import { ReviewWorkers } from '../review-workers.js';
import type { ReviewWorkerProgress } from '../review-workers.js';
import { startReviewWorkerBootstrap } from '../review-worker-bootstrap.js';
import type { StartedReviewWorker } from '../review-worker-bootstrap.js';

const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
const packet=()=>({reviewRevision:'a'.repeat(40),storyId:'s1',functionalSummary:'Fixture',documents:{},reviewSet:[{commit:'a'.repeat(40),parent:null,files:[{path:'a.ts',segments:[{after:[1,1]}]}]}],tests:[]});
function context(id:string){const abort=new AbortController();return{abort,context:{connectionIdentity:id,daemonEpoch:'test-epoch',connectionSignal:abort.signal} satisfies TrustedRpcContext};}
async function fixture(t:{after:(fn:()=>Promise<void>)=>void},reviewer:'daemon'|'controller'){
 const old=process.env['INSRC_TEST_HOOKS'];process.env['INSRC_TEST_HOOKS']='1';
 const root=await mkdtemp(join(tmpdir(),'review-progress-of-'));const repo=join(root,'repo');await mkdir(repo);
 const binary=join(root,'review-cli');
 await writeFile(binary,'#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>process.stdout.write(JSON.stringify({type:"assistant",message:{content:[{type:"tool_use",id:"out",name:"StructuredOutput",input:{ok:true}}]}})+"\\n"));');await chmod(binary,0o755);
 const started=new Map<string,StartedReviewWorker>(),tracked=new Set<Worker>();
 const registry=new ReviewWorkers({services,
  resolveScope:async key=>({reviewer,subject:'same-design-subject',cleanupScope:`${key.project}:s1`}),
  authorizeNative:async()=>{},
  resolveBinary:async()=>binary,
  track:worker=>{tracked.add(worker);},
  start:async(...args)=>{const s=await startReviewWorkerBootstrap(...args);started.set(s.admission.key.reviewId,s);return s;},
 });
 t.after(async()=>{await registry.shutdown();await rm(root,{recursive:true,force:true});if(old===undefined)delete process.env['INSRC_TEST_HOOKS'];else process.env['INSRC_TEST_HOOKS']=old;});
 const submit=(id:string)=>({key:{project:repo,family:'code' as const,reviewId:id},attempt:1,actionId:`action-${id}`,submitted:packet()});
 return{root,repo,registry,started,tracked,submit};
}
test('progressOf returns a clone of the last accepted progress and undefined for a closing or unknown key',async t=>{
 const f=await fixture(t,'controller'),owner=context('owner');
 const unknown={project:f.repo,family:'code' as const,reviewId:'never-admitted'};
 assert.equal(f.registry.progressOf(unknown),undefined);
 const ack=await f.registry.admit(f.submit('po-clone'),owner.context);
 const key=ack.key;
 const admitted=f.registry.progressOf(key)!;
 assert.equal(admitted.phase,'admission','admission publishes an initial progress');
 const started=f.started.get('po-clone')!;
 const progress:ReviewWorkerProgress={...ack,attempt:1,sequence:admitted.sequence+1,phase:'execution',completed:2,total:5,updatedAt:new Date().toISOString(),observation:{reviewId:'po-clone'} as never};
 assert.equal(f.registry.acceptProgress(started.worker,ack,progress),true);
 const first=f.registry.progressOf(key)!;
 assert.equal(first.sequence,progress.sequence);assert.equal(first.attempt,1);assert.equal(first.phase,'execution');assert.equal(first.completed,2);assert.equal(first.total,5);
 assert.deepEqual(first.observation,progress.observation);
 assert.throws(()=>{(first as {sequence:number}).sequence=99;},TypeError,'returned value is frozen');
 assert.equal(f.registry.cachedProgress(key)!.sequence,progress.sequence,'mutating the clone did not change the entry');
 const second=f.registry.progressOf(key)!;
 assert.notEqual(second,first);assert.deepEqual(second,first);
 // Close the entry via the owner connection abort, then catch the window where
 // the entry is still present but closing: cachedProgress (no closing guard)
 // still sees it while progressOf must not.
 owner.abort.abort();
 const end=Date.now()+10000;
 while(Date.now()<end){
  if(f.registry.cachedProgress(key)&&f.registry.progressOf(key)===undefined)break;
  await new Promise(r=>setTimeout(r,10));
 }
 assert.ok(f.registry.cachedProgress(key),'entry must still be present in the closing window');
 assert.equal(f.registry.progressOf(key),undefined,'closing entry yields undefined');
 await f.registry.shutdown();
 assert.equal(f.registry.progressOf(key),undefined,'deleted entry yields undefined');
});
test('progressOf is read-only and never advances sequence or renews grace',async t=>{
 const f=await fixture(t,'controller'),owner=context('owner');
 const ack=await f.registry.admit(f.submit('po-readonly'),owner.context);
 const started=f.started.get('po-readonly')!;
 const base=f.registry.progressOf(ack.key)!.sequence;
 const progress:ReviewWorkerProgress={...ack,attempt:1,sequence:base+1,phase:'execution',completed:1,updatedAt:new Date().toISOString()};
 assert.equal(f.registry.acceptProgress(started.worker,ack,progress),true);
 const before=f.registry.cachedProgress(ack.key)!,boardBefore=JSON.stringify(services.board.snapshot());
 // Spy on every message posted to the worker for the duration of the reads.
 const posted:unknown[]=[];
 const original=started.worker.postMessage.bind(started.worker);
 (started.worker as {postMessage:(m:unknown)=>void}).postMessage=(m:unknown)=>{posted.push(m);original(m);};
 try{
  for(let i=0;i<5;i++)assert.ok(f.registry.progressOf(ack.key));
 }finally{(started.worker as {postMessage:typeof original}).postMessage=original;}
 assert.equal(f.registry.cachedProgress(ack.key)!.sequence,before.sequence,'sequence unchanged');
 assert.equal(f.registry.cachedProgress(ack.key),before,'the entry object is untouched, not replaced');
 assert.equal(JSON.stringify(services.board.snapshot()),boardBefore,'no board publication');
 assert.deepEqual(posted,[],'no message posted to the worker');
 // Grace renewal would show up as a fresh updatedAt on the stored progress.
 assert.equal(f.registry.cachedProgress(ack.key)!.updatedAt,before.updatedAt,'no grace/heartbeat renewal');
});
