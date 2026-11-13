import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync,writeFileSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture,hash } from './publication-fixture.js';
import { channel,serve } from './controller-fixture.js';
import { CliProvider } from '../../../../agent/providers/cli-provider.js';
import { pollTaskReviewProgress } from '../progress-client.js';
import type { ReviewProgressView } from '../progress-view.js';
import type { ControllerFrame } from '../controller.js';
import { publishTaskCheckpoint } from '../publication.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { saveCheckpoint,checkpointPath } from '../checkpoint.js';
import type { LLMProvider,ActivityReviewSessionOpts } from '../../../../shared/types.js';

test('Both native CLI fixtures expose isolated reconnectable progress through production IPC',async()=>{
 for(const party of ['daemon','controller'] as const)for(const kind of ['claude','codex'] as const){
  const f=await fixture();f.build.meta.authoredBy=party==='controller'?'daemon':'controller';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
  const bin=join(f.repo,'progress-cli.mjs'),calls=join(f.repo,'calls'),release=join(f.repo,'release-cli');
  const tool=kind==='claude'?{type:'assistant',message:{content:[{type:'tool_use',id:'PRIVATE_TOOL',name:'Read',input:{private:'NEVER_IN_PROGRESS'}}]}}:{type:'item.started',item:{type:'command_execution',id:'PRIVATE_TOOL',command:'NEVER_IN_PROGRESS'}};
  const final=kind==='claude'?[{type:'assistant',message:{content:[{type:'tool_use',id:'answer',name:'StructuredOutput',input:f.result}]}}]:[{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(f.result)}},{type:'turn.completed'}];
  writeFileSync(bin,'#!/usr/bin/env node\nimport{appendFileSync,existsSync}from"node:fs";appendFileSync('+JSON.stringify(calls)+',"call\\n");process.stdin.resume();setTimeout(()=>process.stdout.write('+JSON.stringify(JSON.stringify(tool)+'\n')+'),10);const timer=setInterval(()=>{if(existsSync('+JSON.stringify(release)+')){clearInterval(timer);process.stdout.write('+JSON.stringify(final.map(x=>JSON.stringify(x)+'\n').join(''))+')}},10);');chmodSync(bin,0o755);
  const cli=new CliProvider({kind,binPath:bin,timeoutMs:1,codexFirstOutputMs:1});
  let resolutions=0;const host=await serve(f.repo,()=>{resolutions++;assert.equal(party,'daemon');return cli;});
  const owner=await channel(host.path),observer=await channel(host.path);const life=new AbortController();
  const reviewId=`progress-${party}-${kind}`,request={repo:f.repo,reviewId,attempt:1};const views:ReviewProgressView[]=[];let native:Promise<unknown>|undefined;
  try{
   const frame=await owner.call<ControllerFrame>('codeReview.task.start',{...request,epicHash:hash,packet:f.packet});
   if(party==='daemon')owner.close();
   else{
    let sequence=frame.nextSequence!;const common={...request,taskId:frame.taskId,executionId:frame.executionId};
    native=cli.runReviewSession(frame.prompt!,frame.schema!,{mode:'activity',cwd:f.repo,inactivityMs:1800000,internalRetry:false,signal:life.signal,
     onActivity:async event=>{if(['model_output','tool_started','tool_completed'].includes(event.kind))await owner.rawCall('codeReview.task.activity',{...common,sequence:sequence++,event:{kind:event.kind,...(event.toolId?{toolId:event.toolId}:{})}});},
     onCandidate:async result=>{await owner.rawCall('codeReview.task.result',{...common,sequence:sequence++,result});return{accepted:true};}});
    void native.catch(()=>{});
   }
   const updates:string[]=[],deadline=Date.now()+15000;
   const done=await pollTaskReviewProgress(request,{signal:life.signal,read:async p=>{const view=await(party==='controller'?owner:observer).call<ReviewProgressView>('codeReview.task.progress',p);views.push(view);if(view.progress?.phase==='tool_running')writeFileSync(release,'observed');return view;},sleep:async ms=>{assert.equal(ms,5000);assert.ok(Date.now()<deadline,'tool phase must reach the cache before release');await new Promise(resolve=>setTimeout(resolve,5));},onUpdate:text=>updates.push(text)});
   await native;assert.equal(done.status,'passed');assert.equal(done.crPublication,'complete');
   assert.ok(views.some(v=>v.freshness==='live'&&v.progress?.phase==='tool_running'));
   assert.ok(updates.length>=2);assert.ok(!JSON.stringify(views).includes('PRIVATE_TOOL'));assert.ok(!JSON.stringify(views).includes('NEVER_IN_PROGRESS'));
   assert.equal(readFileSync(calls,'utf8'),'call\n');assert.equal(resolutions,party==='daemon'?1:0,'polling never invokes provider');
   assert.deepEqual(f.read(checkpointPath(f.repo,reviewId)).attempts[0]!.submitted,f.packet);
   await assert.rejects(observer.call('codeReview.task.progress',{...request,reviewId:'another-review'}),/checkpoint|not found|locator/);
  }finally{life.abort();owner.close();observer.close();await native?.catch(()=>{});await host.server.close();f.cleanup();}
 }
});

test('Progress write failure restart and terminal races preserve authoritative task outcomes',async()=>{
 const f=await fixture();let release!:()=>void,failed!:()=>void,calls=0;
 const gate=new Promise<void>(resolve=>{release=resolve;}),failure=new Promise<void>(resolve=>{failed=resolve;});
 const c=new TaskReviewCoordinator({sources:f.deps.sources,save:async(path,cp)=>{
  if(cp.attempts.at(-1)!.progress?.phase==='tool_running'&&!cp.attempts.at(-1)!['review-response'].tasks.length){failed();throw Error('private disk failure');}
  await saveCheckpoint(path,cp);
 },provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(_p:string,_s:unknown,opts:ActivityReviewSessionOpts)=>{
  calls++;await opts.onActivity({sessionId:'native',sequence:1,kind:'session_started'});await opts.onActivity({sessionId:'native',sequence:2,kind:'tool_started',toolId:'private'});await gate;return f.result;
 }} as unknown as LLMProvider)});
 try{
  const a=await c.start(f.repo,'progress-failure',1,f.packet);
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([failure,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('Progress failure was not observed')),10000);})]);}finally{clearTimeout(timeout);}
  // Let the failed serial write roll back before observing it.
  await new Promise(resolve=>setImmediate(resolve));
  const live=await c.progress(f.repo,'progress-failure',1);assert.equal(live.warning,'progress_persistence_failed');assert.equal(live.completedTasks,0);assert.equal(live.progress!.phase,'tool_running');
  const restarted=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('Must not rerun');}});
  const stale=await restarted.progress(f.repo,'progress-failure',1);assert.equal(stale.freshness,'stale');assert.equal(stale.progress!.lastMeaningfulActivityAt,null);
  release();await c.settled(f.repo,'progress-failure');assert.deepEqual(f.read(a.path).attempts[0]!['review-response'].tasks,[f.result]);assert.equal(calls,1);
  const final=await restarted.progress(f.repo,'progress-failure',1);assert.equal(final.status,'passed');assert.equal(final.completedTasks,1);assert.equal(final.progress!.phase,'complete');
  const one=new AbortController(),two=new AbortController(),owner1={id:'one',signal:one.signal},owner2={id:'two',signal:two.signal};
  try{
   const frame1=await c.startController(f.repo,'isolated-one',1,f.packet,owner1,hash);
   await c.startController(f.repo,'isolated-two',1,f.packet,owner2,hash);
   await c.controllerActivity(f.repo,'isolated-one',1,{kind:'model_output'},owner1,{taskId:frame1.taskId,executionId:frame1.executionId,sequence:frame1.nextSequence});
   const first=await c.progress(f.repo,'isolated-one',1),second=await c.progress(f.repo,'isolated-two',1);
   assert.ok(first.progress!.lastMeaningfulActivityAt);assert.equal(second.progress!.lastMeaningfulActivityAt,null);assert.notEqual(first.progress!.executionId,second.progress!.executionId);
   assert.equal(calls,1);
  }finally{one.abort();two.abort();await c.settled(f.repo,'isolated-one');await c.settled(f.repo,'isolated-two');}

 }finally{release();await c.settled(f.repo,'progress-failure');f.cleanup();}
});


test('A new daemon attempt never exposes retired controller progress',async()=>{
 const f=await fixture(),life=new AbortController(),owner={id:'switch',signal:life.signal};
 let release!:()=>void,started!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),running=new Promise<void>(resolve=>{started=resolve;});
 const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_s:unknown,opts:ActivityReviewSessionOpts)=>{
  if(prompt.startsWith('Derive task attribution')){
   await opts.onActivity({sessionId:'new-native',sequence:1,kind:'session_started'});await opts.onActivity({sessionId:'new-native',sequence:2,kind:'model_output'});started();await gate;
   return{summary:'Fresh reassessment by daemon',tasks:[{taskId:'t1',changeIndexes:[0],testIndexes:[0],action:'reassess',reason:'New reviewer'}]};
  }return f.result;
 }} as unknown as LLMProvider)});
 try{
  const first=await c.startController(f.repo,'party-switch',1,f.packet,owner,hash);
  await c.controllerResult(f.repo,'party-switch',1,f.result,owner,{taskId:first.taskId,executionId:first.executionId,sequence:first.nextSequence});
  await publishTaskCheckpoint(f.repo,hash,'party-switch',f.deps);
  const old=await c.progress(f.repo,'party-switch',1);
  await c.start(f.repo,'party-switch',2,f.packet);await running;
  const current=await c.progress(f.repo,'party-switch',2);assert.equal(current.freshness,'live');assert.notEqual(current.progress!.executionId,old.progress!.executionId);assert.equal(current.completedTasks,0);
  assert.equal((await c.progress(f.repo,'party-switch',1)).freshness,'stale');
  release();await c.settled(f.repo,'party-switch');
 }finally{release();life.abort();await c.settled(f.repo,'party-switch');f.cleanup();}
});
