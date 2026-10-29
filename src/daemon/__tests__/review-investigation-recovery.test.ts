/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './review-investigation-fixtures.js';
import { InvestigationRepository } from '../review-investigation-repository.js';
import { productionRunId } from '../review-investigation-descriptor.js';
import { progressFor,finalReply,continuationFixture } from '../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import type { InvestigationTurnV1 } from '../../workflow/code-review/investigation/continuation-types.js';
import { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';

async function crash(f:Awaited<ReturnType<typeof fixture>>,boundary:string){
 const file=join(f.dir,'child-start.json');writeFileSync(file,JSON.stringify(f.start));
 const child=fork(fileURLToPath(new URL('./review-investigation-crash-worker.ts',import.meta.url)),[file,boundary],{execArgv:['--import','tsx'],stdio:['ignore','pipe','pipe','ipc']});
 let stderr='';child.stderr?.on('data',chunk=>{stderr+=String(chunk);});
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([once(child,'message'),once(child,'exit').then(([code])=>{throw Error(`Child exited ${code}: ${stderr}`);}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(`Crash boundary timeout: ${stderr}`)),30000);})]);}
 finally{if(timer)clearTimeout(timer);const exit=once(child,'exit');child.kill('SIGKILL');await exit;}
}
test('Crash concurrent resume cancel and frozen publication recover without duplicate execution',async()=>{
 for(const boundary of ['after-block','canonical-head']){
  const f=await fixture(false,true,false);try{
   await crash(f,boundary);const id=productionRunId('repo',f.start.requestId as string);let executions=0;
   const restarted=new InvestigationRepository({...f.repository.options,processEpoch:'restarted-daemon',assertReady:async()=>{if(boundary==='canonical-head')throw Error('Rollback disables new work');},daemonAdapter:async()=>({provider:continuationFixture().provider,modelLabel:'scripted-restart-fixture',assertQualified:async()=>{},drain:async()=>{},execute:async(turn,tools,_signal,runtime)=>{
    executions++;assert.ok(!turn.assignment.includes(f.packet.blocks[0]!.blockId));const remaining=f.packet.blocks.find(b=>turn.assignment.includes(b.blockId));assert.ok(remaining);await tools.progress(progressFor(turn,remaining.blockId,runtime.state().sequence));const state=runtime.state();return {...finalReply(turn,state.accepted.map(a=>a.receipt.progressId),state.sequence),next:{kind:'pause',remainingWork:[state.ledger.coverage[0]!.requirementRef],reason:'Remaining fixture coverage is explicit'}};
   }})});
   const before=(await restarted.service.open(id)).store.replay();assert.equal(before.state.accepted[0]!.progress.disposition,'reviewed');
   const result=await restarted.advance(id);if(boundary==='canonical-head'){
    assert.equal(executions,0);assert.equal(result.next,'done');assert.ok(result.receipt);assert.equal((await f.repository.options.canonical.history.log(`CR-${'c32aa60534232f36'}-s1`)).length,1);
    assert.deepEqual((await restarted.advance(id)).receipt,result.receipt);
   }else{assert.equal(executions,1);const after=(await restarted.service.open(id)).store.replay();assert.equal(after.state.sequence,2);assert.equal(after.state.attempts,2);assert.ok(after.state.consumedActiveMs>=300000);assert.ok(after.state.usage.some(u=>u.observation.quality==='unavailable'));assert.equal(after.lifecycle.completionReceipt,null);}
  }finally{f.close();}
 }
 const f=await fixture(true,false,false);try{
  const frame=await f.dispatch(f.envelope(f.start)),turn=frame.turn as InvestigationTurnV1,binding=frame.binding as {bindingId:string},runId=turn.runId;
  const base={version:1,engine:'plan-investigation-v1',repo:f.dir,runId,bindingId:binding.bindingId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,requestDigest:turn.requestDigest};
  const command={...base,operation:'progress',progress:progressFor(turn,f.packet.blocks[0]!.blockId,0)};
  const first=f.dispatch(f.envelope(command)),retry=f.dispatch(f.envelope(command));assert.deepEqual((await first).value,(await retry).value);
  assert.equal((await f.repository.service.open(runId)).store.replay().state.sequence,1);
  const cancelled=await f.dispatch(f.envelope({version:1,engine:'plan-investigation-v1',operation:'cancel',repo:f.dir,runId,reason:'Fixture cancellation'}));assert.equal((cancelled.status as {state:string}).state,'cancelled');
  await assert.rejects(()=>f.dispatch(f.envelope({...base,operation:'reply',reply:finalReply(turn,[],0)})));
  const state=(await f.repository.service.open(runId)).store.replay();assert.equal(state.lifecycle.completionReceipt,null);assert.equal(state.state.sequence,1);assert.ok(state.state.usage.length);assert.equal(state.lifecycle.owner,null);
 }finally{f.close();}
 for(const tamper of ['canonical-body','build-revision','party']){
  const f=await fixture(false,false,false);try{
   const frame=await f.dispatch(f.envelope(f.start)),runId=String(frame.runId),file=join(f.dir,'.insrc','artifacts',`${f.start.buildArtifactId}.json`);
   if(tamper==='build-revision'){const lifecycle=new LifecycleService({store:f.repository.options.canonical});await lifecycle.updateContent(f.start.buildArtifactId,{id:'github:fixture',kind:'person',properties:{}},{body:{commit:f.commitId,tasks:[{id:'t1',passed:true}],summary:'New build revision'},citations:[]});}
   else{const head=JSON.parse(readFileSync(file,'utf8'));if(tamper==='party')head.meta.authoredBy='daemon';else head.body.summary='Unlogged edit';writeFileSync(file,JSON.stringify(head));}
   await assert.rejects(()=>f.repository.advance(runId));assert.equal(f.calls(),1);
  }finally{f.close();}
 }
});

test('Accountable findings and pending usage survive canonical WARN and BLOCK publication',async()=>{
 for(const severity of ['MED','HIGH'] as const){
  const f=await fixture(false,false,false);try{
   const repository=new InvestigationRepository({...f.repository.options,daemonAdapter:async()=>({provider:continuationFixture().provider,modelLabel:'scripted-findings-fixture',assertQualified:async()=>{},drain:async()=>{},execute:async(turn,tools,_signal,runtime)=>{
    const evidenceIds:string[]=[];for(const ref of runtime.navigation!.sourceRefs)if(JSON.parse(ref).kind==='blob')evidenceIds.push((await tools.read(ref)).evidenceId);
    const findings=[{findingId:'fixture-finding',criterion:'quality',severity,confidence:severity==='HIGH'?'breach' as const:'observation' as const,evidenceIds,expectationRefs:runtime.state().ledger.coverage.map(row=>row.requirementRef),message:'Scripted finding retained through the production publication path'}];
    for(const block of f.packet.blocks)await tools.progress({...progressFor(turn,block.blockId,runtime.state().sequence),disposition:'reviewed',evidenceIds,findings,coverageUpdates:runtime.state().ledger.coverage.map(row=>({...row,disposition:'finding',evidenceIds,findingIds:['fixture-finding'],rationale:'Accountable fixture finding',assessedByAttempt:turn.attemptId}))});
    const state=runtime.state();return {...finalReply(turn,state.accepted.map(a=>a.receipt.progressId),state.sequence),next:{kind:'request-completion',remainingWork:[],reason:'Accountable fixture finding'}};
   }})});
   const accepted=await repository.start(f.start as Parameters<InvestigationRepository['start']>[0]),result=await repository.advance(accepted.descriptor.runId),receipt=result.receipt as {verdict:string};assert.equal(result.next,'done');assert.equal(receipt.verdict,severity==='HIGH'?'block':'warn');const view=(await repository.service.open(accepted.descriptor.runId)).store.replay();assert.equal(view.state.ledger.findings.length,1);assert.ok(view.state.usage.some(u=>u.state==='pending'));
  }finally{f.close();}
 }
});

test('Process wide provider admission serializes repositories and cancels queued work without a lease',async()=>{
 const first=await fixture(true,false,false),second=await fixture(false,false,false);try{
  const active=await first.dispatch(first.envelope(first.start));let entered!:()=>void;const queued=new Promise<void>(resolve=>{entered=resolve;});let gates=0;
  const repository=new InvestigationRepository({...second.repository.options,assertReady:async()=>{if(++gates===3)entered();}});
  const accepted=await repository.start(second.start as Parameters<InvestigationRepository['start']>[0]);
  const pending=repository.advance(accepted.descriptor.runId).then(value=>({value}),error=>({error}));await queued;
  const status=(await repository.service.open(accepted.descriptor.runId)).store.status();assert.equal(status.owner,null);assert.equal(status.attempts.length,0);
  await repository.cancel(accepted.descriptor.runId);await pending;assert.equal(second.calls(),0);assert.equal((await repository.service.open(accepted.descriptor.runId)).store.status().state,'cancelled');
  await first.repository.cancel((active.turn as InvestigationTurnV1).runId);
 }finally{first.close();second.close();}
});
