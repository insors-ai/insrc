import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, hash } from './publication-fixture.js';
import { channel, serve, eventually } from './controller-fixture.js';
import { CliProvider } from '../../../../agent/providers/cli-provider.js';
import type { ControllerFrame } from '../controller.js';
import type { ReviewAcknowledgement } from '../coordinator.js';

test('native adapter plus real IPC persists feedback on both routes and CLIs, and terminal resume never reruns a CLI',async()=>{
 // Synthetic stdout generators exercise the production provider and IPC path;
 // they are not live Claude/Codex model acceptance evidence.
 for(const party of ['daemon','controller'] as const)for(const kind of ['claude','codex'] as const){
  const f=await fixture();f.build.meta.authoredBy=party==='controller'?'daemon':'controller';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
  const bin=join(f.repo,'fake-review.mjs'),calls=join(f.repo,'cli-calls.jsonl');
  const frames=kind==='claude'?[{type:'assistant',uuid:'fixture-output',message:{content:[{type:'tool_use',id:'output-1',name:'StructuredOutput',input:f.result}]}}]:[{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(f.result)}},{type:'turn.completed'}];
  writeFileSync(bin,'#!/usr/bin/env node\nimport{appendFileSync}from"node:fs";appendFileSync('+JSON.stringify(calls)+',"started\\n");process.stdin.resume();setTimeout(()=>process.stdout.write('+JSON.stringify(frames.map(x=>JSON.stringify(x)+'\n').join(''))+',()=>{appendFileSync('+JSON.stringify(calls)+',\"wrapper_failed\\n\");process.exit(1)}),20);');chmodSync(bin,0o755);
  const cli=new CliProvider({kind,binPath:bin,timeoutMs:1,codexFirstOutputMs:1});
  const host=await serve(f.repo,()=>{assert.equal(party,'daemon','controller route cannot invoke daemon provider');return cli;});
  let client=await channel(host.path);
  const id=`end-to-end-${party}-${kind}`,base={repo:f.repo,epicHash:hash,reviewId:id,attempt:1,packet:f.packet};
  try{
   if(party==='daemon'){
    const ack=await client.call<ReviewAcknowledgement>('codeReview.task.start',base);assert.ok(['pending','running'].includes(ack.status));
    client.close(); // Native execution is daemon-owned, independent of the caller.
    await eventually(()=>existsSync(ack.path)&&f.read(ack.path).attempts[0]!['review-response'].crPublication==='complete');
    assert.deepEqual(f.read(ack.path).attempts[0]!['review-response'].tasks,[f.result]);
    client=await channel(host.path);
    // Publication durability precedes the background owner's final release.
    // Observe the public execution state before requesting another owner.
    const deadline=Date.now()+10000;
    while((await client.call<{executionState:string}>('codeReview.task.progress',base)).executionState!=='inactive'){
     assert.ok(Date.now()<deadline,'published native execution must release its owner');await new Promise(resolve=>setTimeout(resolve,10));
    }
    const done=await client.call<ReviewAcknowledgement>('codeReview.task.start',{...base,operation:'resume'});assert.equal(done.status,'passed');assert.deepEqual(done.pendingTaskIds,[]);
   }else{
    const frame=await client.call<ControllerFrame>('codeReview.task.start',base);assert.equal(frame.kind,'task');let sequence=frame.nextSequence!;
    const common={repo:f.repo,reviewId:id,attempt:1,taskId:frame.taskId,executionId:frame.executionId};
    const result=await cli.runReviewSession(frame.prompt!,frame.schema!,{mode:'activity',cwd:f.repo,inactivityMs:1800000,internalRetry:false,signal:new AbortController().signal,
     onActivity:async event=>{
      if(['model_output','tool_started','tool_completed'].includes(event.kind))await client.rawCall('codeReview.task.activity',{...common,sequence:sequence++,event:{kind:event.kind,...(event.toolId?{toolId:event.toolId}:{})}});
     },
     onCandidate:async candidate=>{
      const done=await client.rawCall<ControllerFrame>('codeReview.task.result',{...common,sequence:sequence++,result:candidate});assert.equal(done.kind,'done');assert.equal(done.status,'passed');
      assert.deepEqual(f.read(frame.path).attempts[0]!['review-response'].tasks,[f.result]);return{accepted:true};
     }});
    assert.deepEqual(result,f.result);client.close();client=await channel(host.path);
    const done=await client.call<ControllerFrame>('codeReview.task.start',{...base,operation:'resume'});assert.equal(done.kind,'done');assert.equal(done.status,'passed');
   }
   const attempts=readFileSync(calls,'utf8').trim().split('\n');assert.equal(attempts.filter(line=>line==='started').length,1,'no automatic retry or completed-task repeat');assert.ok(attempts.includes('wrapper_failed'),'native wrapper really exited after producing feedback');
   const cp=f.read(join(f.repo,'.insrc','tmp','code-review',id+'.json'));assert.deepEqual(cp.attempts[0]!.submitted,f.packet);
  }finally{client.close();await host.server.close();f.cleanup();}
 }
});

test('both native adapters preserve feedback queued before expiry and never accept a failed checkpoint write',async()=>{
 for(const kind of ['claude','codex'] as const)for(const failWrite of [false,true]){
  const f=await fixture();let clock=0,wake:(()=>void)|undefined,writes=0;
  let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),writing=new Promise<void>(resolve=>{entered=resolve;});
  const bin=join(f.repo,'fake-expiry.mjs');
  const frames=kind==='claude'?[{type:'assistant',message:{content:[{type:'tool_use',id:'output',name:'StructuredOutput',input:f.result}]}}]:[{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(f.result)}},{type:'turn.completed'}];
  writeFileSync(bin,'#!/usr/bin/env node\nprocess.stdin.resume();setTimeout(()=>process.stdout.write('+JSON.stringify(frames.map(x=>JSON.stringify(x)+'\n').join(''))+'),10);setInterval(()=>{},1000);');chmodSync(bin,0o755);
  const {TaskReviewCoordinator}=await import('../coordinator.js');const {saveCheckpoint}=await import('../checkpoint.js');
  class ObservedCli extends CliProvider {
   override async runReviewSession<T>(prompt:string,schema:import('../../../../shared/types.js').StructuredSchema,opts:import('../../../../shared/types.js').ReviewSessionOpts):Promise<T>{
    if(opts.mode!=='activity')throw Error('Expected activity mode');
    return super.runReviewSession<T>(prompt,schema,{...opts,onCandidate:async raw=>{
     const committing=opts.onCandidate(raw);void committing.catch(()=>{});await writing;
     clock=1_800_001;wake!();release();return committing;
    }});
   }
  }
  const cli=new ObservedCli({kind,binPath:bin,timeoutMs:1});
  const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>cli,now:()=>clock,timer:fn=>{wake=fn;return()=>{};},save:async(path,cp)=>{
   writes++;if(cp.attempts.at(-1)!['review-response'].tasks.length && writes>0){entered();if(failWrite)throw Error('checkpoint failure');await gate;}await saveCheckpoint(path,cp);
  }});
  try{
   const ack=await c.start(f.repo,'native-expiry',1,f.packet);await c.settled(f.repo,'native-expiry');
   const tasks=f.read(ack.path).attempts[0]!['review-response'].tasks;
   if(failWrite)assert.deepEqual(tasks,[]);else assert.deepEqual(tasks,[f.result]);
  }finally{release();f.cleanup();}
 }
});
