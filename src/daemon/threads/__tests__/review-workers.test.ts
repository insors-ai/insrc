import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,writeFile,chmod,rm,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Worker } from 'node:worker_threads';
import type { TrustedRpcContext } from '../../request-context.js';
import { ThreadServices } from '../main-services.js';
import { ReviewWorkers } from '../review-workers.js';
import type { ReviewWorkerProgress } from '../review-workers.js';
import { startReviewWorkerBootstrap } from '../review-worker-bootstrap.js';
import type { StartedReviewWorker } from '../review-worker-bootstrap.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';
import { persistReviewWorkerAdmission } from '../review-worker-admission.js';
import { updateStoredCodeCheckpoint,loadStoredCheckpoint } from '../../../workflow/code-review/task-review/checkpoint.js';

const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
const packet=()=>({reviewRevision:'a'.repeat(40),storyId:'s1',functionalSummary:'Fixture',documents:{},reviewSet:[{commit:'a'.repeat(40),parent:null,files:[{path:'a.ts',segments:[{after:[1,1]}]}]}],tests:[]});
function context(id:string){const abort=new AbortController();return{abort,context:{connectionIdentity:id,daemonEpoch:'test-epoch',connectionSignal:abort.signal} satisfies TrustedRpcContext};}
function rpc(started:StartedReviewWorker,probe:string):Promise<unknown>{
 const requestId=Math.random().toString();return new Promise((resolve,reject)=>{
  const done=()=>{started.worker.off('message',message);started.worker.off('exit',exit);};
  const exit=()=>{done();reject(new Error('worker exited'));};
  const message=(raw:{kind:string;requestId:string;error?:string;result?:unknown})=>{if(raw.kind!=='reply'||raw.requestId!==requestId)return;done();if(raw.error)reject(new Error(raw.error));else resolve(raw.result);};
  started.worker.on('message',message);started.worker.once('exit',exit);
  started.worker.postMessage({kind:'request',requestId,method:'test.review.native',params:{...started.admission,probe},stream:false});
 });
}
async function until(check:()=>Promise<boolean>){const end=Date.now()+10000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,20));}throw new Error('condition not reached');}
async function fixture(t:{after:(fn:()=>Promise<void>)=>void},reviewer:'daemon'|'controller'){
 const old=process.env['INSRC_TEST_HOOKS'];process.env['INSRC_TEST_HOOKS']='1';
 const root=await mkdtemp(join(tmpdir(),'review-registry-'));const repo=join(root,'repo');await mkdir(repo);
 const binary=join(root,'review-cli');
 await writeFile(binary,'#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>process.stdout.write(JSON.stringify({type:"assistant",message:{content:[{type:"tool_use",id:"out",name:"StructuredOutput",input:{ok:true}}]}})+"\\n"));');await chmod(binary,0o755);
 const started=new Map<string,StartedReviewWorker>(),tracked=new Set<Worker>();let authorizations=0;
 const registry=new ReviewWorkers({services,
  resolveScope:async key=>({reviewer,subject:'same-design-subject',cleanupScope:`${key.project}:s1`}),
  authorizeNative:async(key,command,_context,signal)=>{assert.equal(key.project,repo);assert.ok([binary,process.execPath].includes(command.command));assert.equal(signal.aborted,false);authorizations++;},
  resolveBinary:async command=>{assert.equal(command,'bootstrap-fixture-cli');return binary;},
  track:worker=>{tracked.add(worker);},
  start:async(...args)=>{const s=await startReviewWorkerBootstrap(...args);started.set(s.admission.key.reviewId,s);return s;},
 });
 t.after(async()=>{await registry.shutdown();await rm(root,{recursive:true,force:true});if(old===undefined)delete process.env['INSRC_TEST_HOOKS'];else process.env['INSRC_TEST_HOOKS']=old;});
 const submit=(id:string,family:'code'|'design'='code',project=repo)=>({key:{project,family,reviewId:id},attempt:1,actionId:`action-${id}`,submitted:family==='code'?packet():{phase:'start',repo,reviewId:id,attempt:1,artifactPath:'unread-artifact.json'}});
 return{root,repo,registry,started,tracked,submit,authorizations:()=>authorizations};
}
test('canonical identities own one incarnation and preserve subject and cleanup exclusions',async t=>{
 const f=await fixture(t,'daemon'),observer=context('observer');
 const a=await f.registry.admit(f.submit('code-a'),observer.context);
 const b=await f.registry.admit(f.submit('design-b','design'),observer.context);
 assert.notEqual(a.incarnation,b.incarnation);assert.equal(f.tracked.size,2);
 const alias=join(f.root,'alias');await symlink(f.repo,alias);
 assert.deepEqual(await f.registry.admit(f.submit('code-a','code',alias),observer.context),a);
 await assert.rejects(f.registry.admit({...f.submit('code-a'),submitted:{...packet(),functionalSummary:'changed'}},observer.context),/Conflicting/);
 await assert.rejects(f.registry.admit(f.submit('design-c','design'),observer.context),/subject or cleanup busy/);
 assert.throws(()=>f.registry.claimCleanup(`${f.repo}:s1`),/cleanup busy/);
 observer.abort.abort();
 assert.ok(await f.registry.progress(a.key,context('new-observer').context));
 for(const id of ['code-a','design-b']){
  const s=f.started.get(id)!;await Promise.all([rpc(s,'tool'),rpc(s,'tool')]);
  await rpc(s,'cli');
  const cp=JSON.parse(await readFile(reviewWorkerCheckpoint(s.admission.key),'utf8'));
  assert.deepEqual(cp.attempts.at(-1).resourceGuard.openLeases,[]);
 }
 assert.equal(f.authorizations(),6);
 await f.registry.shutdown();
 const release=f.registry.claimCleanup(`${f.repo}:s1`);
 await assert.rejects(f.registry.admit(f.submit('code-cleaning'),context('new').context),/cleanup busy/);
 release();release();
 await f.registry.admit(f.submit('code-after-cleanup'),context('new').context);
});
test('stale owner messages and targeted disconnects cannot mutate another review',async t=>{
 const f=await fixture(t,'controller'),one=context('one'),two=context('two');
 const a=await f.registry.admit(f.submit('owned-a'),one.context),b=await f.registry.admit(f.submit('owned-b'),two.context);
 const sa=f.started.get('owned-a')!,sb=f.started.get('owned-b')!;
 const progress:ReviewWorkerProgress={...b,attempt:1,sequence:(f.registry.cachedProgress(b.key)?.sequence??0)+1,phase:'execution',completed:0,updatedAt:new Date().toISOString()};
 assert.equal(f.registry.acceptProgress(sa.worker,b,progress),false);
 assert.equal(f.registry.acceptProgress(sb.worker,b,progress),true);
 assert.equal(f.registry.acceptProgress(sb.worker,b,progress),false);
 await assert.rejects(f.registry.progress(a.key,two.context),/owner mismatch/);
 await assert.rejects(f.registry.control({...a,attempt:1,phase:'result',actionId:'a',executionId:'e',sequence:1,input:{}},two.context),/owner mismatch/);
 // Assignment observes the durable admission while qualification has not
 // started; it must not fabricate task authority or start model work.
 const pending=await f.registry.control({...a,attempt:1,phase:'assignment',actionId:'a',executionId:'e',sequence:1,input:{}},one.context) as {status:string;admission:{validation:string}};
 assert.equal(pending.status,'pending');assert.equal(pending.admission.validation,'unverified');
 const holding=rpc(sa,'hold').catch(()=>undefined);
 await until(async()=>{const cp=JSON.parse(await readFile(reviewWorkerCheckpoint(a.key),'utf8'));return cp.attempts.at(-1).resourceGuard?.openLeases.length===1;});
 one.abort.abort();await holding;await sa.reclaimed;
 assert.ok(await f.registry.progress(b.key,two.context));await rpc(sb,'tool');
 assert.equal(f.registry.acceptProgress(sa.worker,a,{...progress,...a,sequence:2}),false);
 assert.ok((f.registry.cachedProgress(b.key)?.sequence??0)>=progress.sequence);
 const cp=JSON.parse(await readFile(reviewWorkerCheckpoint(a.key),'utf8'));assert.deepEqual(cp.attempts.at(-1).resourceGuard.openLeases,[]);
});
test('admission replay retains a native intent committed by the writer ahead of it',async t=>{
 const repo=await mkdtemp(join(tmpdir(),'review-intent-replay-'));t.after(()=>rm(repo,{recursive:true,force:true}));
 const input={key:{project:repo,family:'code' as const,reviewId:'replay-race'},incarnation:'worker-incarnation',attempt:1,reviewer:'daemon' as const,actionId:'action',submitted:packet()};
 const ack=await persistReviewWorkerAdmission(input);
 let entered!:()=>void,release!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;}),barrier=new Promise<void>(resolve=>{release=resolve;});
 const guard={daemonInstance:'daemon-instance',openLeases:[{operationId:'worker-incarnation:1',workerIncarnation:input.incarnation,kind:'shell',openedAt:new Date().toISOString()}]};
 const mutation=updateStoredCodeCheckpoint(ack.checkpointPath,async current=>{
  assert.ok(current);entered();await barrier;
  return{...current,schemaVersion:2,attempts:current.attempts.map(a=>({...a,resourceGuard:guard}))};
 });
 await started;
 // Hold the owner write while the replay is submitted. A replay that reads
 // before entering the lane would capture the old guard-free checkpoint.
 const replay=persistReviewWorkerAdmission(input);
 try{await new Promise(resolve=>setTimeout(resolve,100));}finally{release();}
 await mutation;assert.deepEqual(await replay,ack);
 assert.deepEqual((await loadStoredCheckpoint(ack.checkpointPath))?.attempts.at(-1)?.resourceGuard,guard);
});
