/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { reviewJsonLimit } from '../contracts.js';
import { fixture, hash } from './publication-fixture.js';
import { prepareReviewPacket } from '../packet.js';
import { readCapacityBaseline, terminalCapacity, capacityCheckedResult } from '../capacity.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { channel, serve, provider } from './controller-fixture.js';
import { MAX_ATTEMPT_DIAGNOSTIC_BYTES, validateFailureDiagnostics } from '../diagnostics.js';
import type { FailureDiagnostic } from '../diagnostic-schema.js';
import type { AdmittedReview } from '../execution.js';
import { bindTaskFinalIdentities } from '../attribution-binding.js';

async function pending(f:Awaited<ReturnType<typeof fixture>>,id='capacity'):Promise<AdmittedReview>{
 const prepared=await prepareReviewPacket(f.packet,f.deps.sources),checkpoint=f.checkpoint(id),attempt=checkpoint.attempts[0]!;
 attempt['review-response'].tasks=[];delete attempt.header.completedAt;
 delete attempt.header.acceptedAttribution;delete attempt.header.taskScopeIdentities;delete attempt.header.attributionIdentity;delete attempt.header.taskIdentityFormat;attempt.header.attributionState='pending';
 return{path:checkpointPath(f.repo,id),prepared,checkpoint,attempt,capacity:await readCapacityBaseline(f.repo,hash,'s1')};
}

test('terminal capacity: real serializers account for all outcomes prior history accepted decisions and exact fit',async()=>{
 const f=await fixture(true,2);try{
  const review=await pending(f),before=JSON.stringify(review.checkpoint),measure=terminalCapacity(review,review.capacity!);
  assert.equal(measure.length,2);assert.equal(JSON.stringify(review.checkpoint),before,'pure qualification cannot edit the checkpoint');
  const bound=Math.max(...measure.flatMap(m=>Object.values(m)));assert.doesNotThrow(()=>terminalCapacity(review,review.capacity!,bound));assert.throws(()=>terminalCapacity(review,review.capacity!,bound-1),/projection_limit/);
  await bindTaskFinalIdentities(review,[{taskId:'t1',changeIndexes:[0],testIndexes:[0],decision:{action:'initial'}},{taskId:'t2',changeIndexes:[],testIndexes:[],decision:{action:'initial'}}]);
  const accepted=terminalCapacity(review,review.capacity!);const shared=await pending(f,'shared');await bindTaskFinalIdentities(shared,[{taskId:'t1',changeIndexes:[0],testIndexes:[0],decision:{action:'initial'}},{taskId:'t2',changeIndexes:[0],testIndexes:[0],decision:{action:'initial'}}]);assert.ok(terminalCapacity(shared,shared.capacity!)[0]!.envelope>accepted[0]!.envelope,'actual accepted indexes are counted');
  await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  const baseline=await readCapacityBaseline(f.repo,hash,'s1');const withHistory=terminalCapacity(review,baseline);assert.ok(withHistory[0]!.envelope>accepted[0]!.envelope,'permanent immutable history is counted');
  const long=structuredClone(review.checkpoint);long.attempts[0]!.submitted.functionalSummary='ü\n"'.repeat(1000);
  const growth={...review,checkpoint:long,attempt:long.attempts[0]!};assert.ok(terminalCapacity(growth,baseline)[0]!.checkpoint>withHistory[0]!.checkpoint);
 }finally{f.cleanup();}
});

test('terminal capacity: unchanged 32 KiB Unicode escaped diagnostics retain reserved completion space',async()=>{
 const f=await fixture(true,2);try{
  const review=await pending(f),original=terminalCapacity(review,review.capacity!);
  const diagnostics:FailureDiagnostic[]=[{phase:'attribution',diagnostic:{provider:'claude',issues:[{code:'bad\n"',field:'scope',correction:'é\n"',occurrences:1}],lastRejectedFeedback:{preview:'é\n"'.repeat(1500),truncated:false}}},
   {phase:'attribution',diagnostic:{provider:'codex',issues:[],lastRejectedFeedback:{preview:'x'.repeat(8192),truncated:false}}},
   {phase:'assessment',taskId:'t1',diagnostic:{provider:'claude',issues:[],lastRejectedFeedback:{preview:'x'.repeat(8192),truncated:false}}},
   {phase:'assessment',taskId:'t2',diagnostic:{provider:'codex',issues:[],lastRejectedFeedback:{preview:'',truncated:false}}}];
  const remaining=MAX_ATTEMPT_DIAGNOSTIC_BYTES-Buffer.byteLength(JSON.stringify(diagnostics));assert.ok(remaining>=0&&remaining<=8192);diagnostics[3]!.diagnostic.lastRejectedFeedback!.preview='x'.repeat(remaining);
  assert.equal(Buffer.byteLength(JSON.stringify(diagnostics)),32768);review.attempt['review-response'].failureDiagnostics=diagnostics;validateFailureDiagnostics(review.attempt);
  const bytes=JSON.stringify(diagnostics),after=terminalCapacity(review,review.capacity!);assert.deepEqual(after,original,'latest diagnostic headroom is replaced rather than double charged');assert.equal(JSON.stringify(review.attempt['review-response'].failureDiagnostics),bytes);
 }finally{f.cleanup();}
});

test('terminal capacity: 10000-task small packet refuses dispatch and preserves controller admission failure',async()=>{
 for(const route of ['daemon','controller']as const){
  const f=await fixture(true,2);let calls=0,saves=0;try{
   const planPath=f.packet.documents.plan!.path;
   const plan={meta:{workflow:'plan',epicHash:hash,storyId:'s1'},body:{tasks:Array.from({length:10000},(_,i)=>({id:`t${i+1}`,title:'T',summary:'S',size:'S',order:i+1,dependsOn:[],acceptanceChecks:['C'],derivedFrom:['c1'],tests:[]}))},citations:[{id:'c1',kind:'stakeholder',ref:'Fixture'}]};
   f.put(planPath,plan);f.git('add',planPath);f.git('commit','-qm','large task plan');const revision=f.git('rev-parse','HEAD');f.packet.reviewRevision=revision;f.packet.documents.plan!.commit=revision;
   assert.ok(Buffer.byteLength(JSON.stringify(f.packet))<4096,'submitted packet is small');
   if(route==='daemon'){
    const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{calls++;return provider(async()=>f.result);},save:async(path,cp)=>{saves++;await saveCheckpoint(path,cp);}});
    await assert.rejects(c.start(f.repo,'oversize',1,f.packet),/projection_limit/);
   }else{
    f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);const host=await serve(f.repo,()=>{calls++;return provider(async()=>f.result);}),client=await channel(host.path);
    try{await assert.rejects(client.call('codeReview.task.start',{repo:f.repo,epicHash:hash,reviewId:'oversize',attempt:1,packet:f.packet}),/projection_limit/);}finally{client.close();await host.server.close();}
   }
   assert.equal(calls,0);assert.equal(saves,0);assert.equal(existsSync(checkpointPath(f.repo,'oversize')),route==='controller');if(route==='controller'){const saved=f.read(checkpointPath(f.repo,'oversize')) as any;assert.equal(saved.attempts[0].header.status,'failed');assert.match(saved.attempts[0].error.summary,/projection_limit/);}
  }finally{f.cleanup();}
 }
});

test('terminal capacity: oversized accepted mappings and results cannot consume remaining terminal reserve',async()=>{
 const f=await fixture(true,2);try{
  const review=await pending(f);
  await bindTaskFinalIdentities(review,[{taskId:'t1',changeIndexes:[0],testIndexes:[0],decision:{action:'initial'}},{taskId:'t2',changeIndexes:[],testIndexes:[],decision:{action:'initial'}}]);
  const huge={...structuredClone(f.result),advice:Array.from({length:Math.floor(reviewJsonLimit()/65536)-16},()=> 'x'.repeat(65536))};
  const result=capacityCheckedResult(review,huge);assert.equal(result.status,'failed');assert.match(result.error!,/storage capacity/);assert.equal(result.advice.length,0);
  assert.equal(review.attempt['review-response'].tasks.length,0);assert.doesNotThrow(()=>terminalCapacity(review,review.capacity!));
 }finally{f.cleanup();}
});

test('terminal capacity: long task IDs and large accepted decisions are qualified before becoming visible',async()=>{
 const f=await fixture(true,2);try{
  const review=await pending(f),base=review.prepared.tasks[0]!;
  const tasks=Array.from({length:Math.ceil(reviewJsonLimit()/65536)+50},(_,i)=>({...base,id:`t${String(i+1).padStart(240,'0')}`,order:i+1,dependsOn:[]}));
  review.prepared={...review.prepared,tasks};review.attempt.header.selectedTaskIds=tasks.map(t=>t.id);review.attempt.header.attempt=2;
  assert.doesNotThrow(()=>terminalCapacity(review,review.capacity!));const before=JSON.stringify(review.attempt);
  await assert.rejects(bindTaskFinalIdentities(review,tasks.map(t=>({taskId:t.id,changeIndexes:[0],testIndexes:[0],decision:{action:'reassess',reason:'x'.repeat(65536)}}))),/projection_limit/);
  assert.equal(JSON.stringify(review.attempt),before,'no accepted candidate is exposed after capacity refusal');
 }finally{f.cleanup();}
});

test('terminal capacity: boundary failures publish and raising configured capacity admits the next attempt on both routes',async()=>{
 const {writeFileSync,readFileSync}=await import('node:fs');const {prepareReviewAdmission}=await import('../admission.js');const {readQualifiedCodeCheckpoint}=await import('../worker-checkpoint.js');
 for(const route of ['daemon','controller']as const){
  const f=await fixture(true,2);try{
   const limit=reviewJsonLimit(),prior=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),head=JSON.parse(readFileSync(prior.jsonPath,'utf8')) as {meta:Record<string,unknown>};head.meta['capacityPadding']='';writeFileSync(prior.jsonPath,JSON.stringify(head,null,2)+'\n');
   const review=await pending(f,'boundary');review.attempt.header.reviewer=route;const m=terminalCapacity(review,review.capacity!),bound=Math.max(...m.flatMap(x=>Object.values(x)));
   head.meta['capacityPadding']='x'.repeat(limit-bound);writeFileSync(prior.jsonPath,JSON.stringify(head,null,2)+'\n');review.capacity=await readCapacityBaseline(f.repo,hash,'s1');
   assert.equal(Math.max(...terminalCapacity(review,review.capacity).flatMap(x=>Object.values(x))),limit);
   if(route==='daemon'){
    const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async()=>{throw new Error('Boundary attribution provider failure');}),publish:(repo,id,_hash,baseline)=>publishTaskCheckpoint(repo,hash,id,{...f.deps,...(baseline?{baseline}:{})})});
    await c.start(f.repo,'boundary',1,f.packet);await c.settled(f.repo,'boundary');
   }else{
    f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);const host=await serve(f.repo,()=>{throw new Error('No native model');}),client=await channel(host.path);
    try{await client.call('codeReview.task.start',{repo:f.repo,epicHash:hash,reviewId:'boundary',attempt:1,packet:f.packet});for(let i=0;i<3;i++)await client.call('codeReview.task.scope',{repo:f.repo,epicHash:hash,reviewId:'boundary',attempt:1,scope:{tasks:[{taskId:`foreign${i}`,changeIndexes:[0],testIndexes:[0]}]}});}finally{client.close();await host.server.close();}
   }
   const cp=f.read(checkpointPath(f.repo,'boundary'));assert.equal(cp.attempts[0]!['review-response'].crPublication,'complete');assert.equal(cp.attempts[0]!['review-response'].tasks.length,2);
   assert.ok(Buffer.byteLength(readFileSync(prior.jsonPath,'utf8'))<=limit);assert.ok(Buffer.byteLength(readFileSync(checkpointPath(f.repo,'boundary'),'utf8'))<=limit);
   await assert.rejects(prepareReviewAdmission(f.repo,'boundary',2,f.packet,route,f.deps.sources,{qualifiedHistory:(await readQualifiedCodeCheckpoint(checkpointPath(f.repo,'boundary')))!}),/projection_limit/);
   const {execFileSync}=await import('node:child_process');const {mkdirSync}=await import('node:fs');
   const configHome=f.repo+'/review-home';mkdirSync(configHome+'/.insrc',{recursive:true});writeFileSync(configHome+'/.insrc/config.json',JSON.stringify({review:{maxJsonBytes:2*limit}}));
   writeFileSync(configHome+'/packet.json',JSON.stringify(f.packet));
   const script=`import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{registerGitTools}from'./src/daemon/tools/builtins/git/index.ts';import{RegistryReviewSources}from'./src/workflow/code-review/task-review/sources.ts';import{prepareReviewAdmission}from'./src/workflow/code-review/task-review/admission.ts';import{readQualifiedCodeCheckpoint}from'./src/workflow/code-review/task-review/worker-checkpoint.ts';registerGitTools();const repo=process.argv[1];const next=await prepareReviewAdmission(repo,'boundary',2,JSON.parse(readFileSync(process.argv[2],'utf8')),process.argv[3],new RegistryReviewSources({repoPath:repo,sessionId:'capacity-resume',requestId:1,send:()=>{}}),{qualifiedHistory:await readQualifiedCodeCheckpoint(repo+'/.insrc/tmp/code-review/boundary.json')});assert.equal(next.attempt.header.attributionState,'pending');process.exit(0);`;
   execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',script,f.repo,configHome+'/packet.json',route],{cwd:process.cwd(),env:{...process.env,HOME:configHome},stdio:'pipe',timeout:60000});
  }finally{f.cleanup();}
 }
});

test('terminal capacity: both actual routes refuse oversized results and preserve publishable remaining outcomes',async()=>{
 for(const route of ['daemon','controller']as const){
  const f=await fixture(true,2);try{
   const huge={...structuredClone(f.result),advice:Array.from({length:Math.floor(reviewJsonLimit()/65536)-16},()=> 'x'.repeat(65536))};
   const scope={tasks:['t1','t2'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))};
   if(route==='daemon'){
    const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async prompt=>prompt.startsWith('Derive task attribution')?scope:prompt.includes('"taskId":"t1"')?huge:{...f.result,taskId:'t2'}),publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
    await c.start(f.repo,'growth',1,f.packet);await c.settled(f.repo,'growth');
   }else{
    f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);const host=await serve(f.repo,()=>{throw new Error('No daemon provider');}),client=await channel(host.path);
    const request={repo:f.repo,epicHash:hash,reviewId:'growth',attempt:1};
    try{await client.call('codeReview.task.start',{...request,packet:f.packet});await client.call('codeReview.task.scope',{...request,scope});await client.call('codeReview.task.result',{...request,result:huge});await client.call('codeReview.task.result',{...request,result:{...f.result,taskId:'t2'}});}finally{client.close();await host.server.close();}
   }
   const a=f.read(checkpointPath(f.repo,'growth')).attempts[0]!;assert.equal(a['review-response'].crPublication,'complete');assert.deepEqual(a['review-response'].tasks.map(t=>t.status),['failed','passed']);assert.match(a['review-response'].tasks[0]!.error!,/storage capacity/);
  }finally{f.cleanup();}
 }
});

test('terminal capacity: both routes persist late diagnostics and every outcome at the qualified boundary',async()=>{
 const {readFileSync,writeFileSync}=await import('node:fs');
 const {eventually}=await import('./controller-fixture.js');
 const {taskFailure}=await import('../assessment.js');
 for(const route of ['daemon','controller']as const)for(const outcome of ['passed','changes_requested','failed','incomplete']as const){
  const f=await fixture(true,2);let clock=0,expire:(()=>void)|undefined;
  try{
   const prior=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),head=JSON.parse(readFileSync(prior.jsonPath,'utf8'));
   head.meta.capacityPadding='';writeFileSync(prior.jsonPath,JSON.stringify(head,null,2)+'\n');
   const review=await pending(f,'diagnostic-boundary');review.attempt.header.reviewer=route;
   const bound=Math.max(...terminalCapacity(review,review.capacity!).flatMap(m=>Object.values(m))),limit=reviewJsonLimit();
   head.meta.capacityPadding='x'.repeat(limit-bound);writeFileSync(prior.jsonPath,JSON.stringify(head,null,2)+'\n');review.capacity=await readCapacityBaseline(f.repo,hash,'s1');
   assert.equal(Math.max(...terminalCapacity(review,review.capacity).flatMap(m=>Object.values(m))),limit);
   const diagnostic=(which:'claude'|'codex')=>({provider:which,issues:[{code:`BOUNDARY_${which}`,field:'findings',correction:'Return required findings.',occurrences:1}],lastRejectedFeedback:{preview:'é\n"'.repeat(1000),truncated:false}});
   const scope={tasks:['t1','t2'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))};
   const result=outcome==='failed'||outcome==='incomplete'?taskFailure('t1','Boundary failure',outcome==='incomplete'):{...structuredClone(f.result),status:outcome,...(outcome==='changes_requested'?{findings:[{severity:'MED' as const,location:'source.js:1',message:'Boundary defect',rationale:'Assertion mismatch',evidenceReferences:f.result.inspectedReferences}]}:{})};
   const c=new TaskReviewCoordinator({sources:f.deps.sources,now:()=>clock,timer:callback=>{expire=callback;return()=>{};},provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:import('../../../../shared/types.js').ActivityReviewSessionOpts)=>{
    if(prompt.startsWith('Derive task attribution'))return scope;
    const taskId=prompt.includes('"taskId":"t1"')?'t1':'t2';
    assert.equal(f.read(review.path).attempts[0]!.header.attributionState,'accepted','diagnostics grow after acceptance');
    await opts.onDiagnostic!(diagnostic('claude'));await opts.onDiagnostic!(diagnostic('codex'));
    if(taskId==='t2')return {...f.result,taskId};
    if(outcome==='failed')throw new Error('Boundary transport failure');
    if(outcome==='incomplete'){clock+=1800000;expire!();return new Promise((_,reject)=>opts.signal!.addEventListener('abort',()=>reject(opts.signal!.reason),{once:true}));}
    return result;
   }} as unknown as import('../../../../shared/types.js').LLMProvider),publish:(repo,id,_hash,baseline)=>publishTaskCheckpoint(repo,hash,id,{...f.deps,...(baseline?{baseline}:{})})});
   if(route==='daemon'){await c.start(f.repo,'diagnostic-boundary',1,f.packet);await c.settled(f.repo,'diagnostic-boundary');}
   else{
    const owner={id:'boundary-owner',signal:new AbortController().signal};let frame=await c.startController(f.repo,'diagnostic-boundary',1,f.packet,owner);
    frame=await c.controllerScope(f.repo,'diagnostic-boundary',1,scope,owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});
    for(const taskId of ['t1','t2']){
     for(const which of ['claude','codex']as const){
      await c.controllerActivity(f.repo,'diagnostic-boundary',1,{kind:'diagnostic',phase:'assessment',diagnostic:diagnostic(which)},owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});
      frame={...frame,nextSequence:frame.nextSequence!+1};
     }
     if(taskId==='t1'&&outcome==='incomplete'){
      clock+=1800000;expire!();await eventually(()=>f.read(review.path).attempts[0]!['review-response'].tasks.length===1);
      frame=await c.controllerAssignment(f.repo,'diagnostic-boundary',1,owner);
     }else frame=await c.controllerResult(f.repo,'diagnostic-boundary',1,taskId==='t1'?result:{...f.result,taskId},owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});
    }
   }
   const entry=f.read(review.path).attempts[0]!,diagnostics=entry['review-response'].failureDiagnostics!;
   assert.equal(entry['review-response'].crPublication,'complete');assert.deepEqual(entry['review-response'].tasks.map(t=>t.status),[outcome,'passed']);
   assert.equal(diagnostics.length,4);validateFailureDiagnostics(entry);
   for(const d of diagnostics){assert.equal(d.diagnostic.issues[0]!.code,`BOUNDARY_${d.diagnostic.provider}`);assert.equal(d.diagnostic.lastRejectedFeedback!.preview,'é\n"'.repeat(1000));}
   for(const path of [review.path,prior.jsonPath])assert.ok(Buffer.byteLength(readFileSync(path,'utf8'))<=limit,`${route}/${outcome}: ${path} fits`);
   const body=f.readRecord(prior.jsonPath).body;assert.equal(body.reviews.at(-1)!.tasks[0]!.status,outcome);
   assert.match(body.reviews.at(-1)!.summary,/BOUNDARY_claude/);assert.match(body.reviews.at(-1)!.summary,/BOUNDARY_codex/);
   assert.equal(body.reviews.at(-1)!.summary.includes('é'),false,'verbose previews remain only in checkpoint');
  }finally{f.cleanup();}
 }
});

test('terminal capacity: diagnostic-bearing attribution failure and timeout publish unmapped outcomes at the boundary on both routes',async()=>{
 const {readFileSync,writeFileSync}=await import('node:fs');const {eventually}=await import('./controller-fixture.js');
 for(const route of ['daemon','controller']as const)for(const outcome of ['failed','incomplete']as const){
  const f=await fixture(true,2);let clock=0,expire:(()=>void)|undefined;
  try{
   const prior=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),head=JSON.parse(readFileSync(prior.jsonPath,'utf8'));
   head.meta.capacityPadding='';writeFileSync(prior.jsonPath,JSON.stringify(head,null,2)+'\n');
   const review=await pending(f,'unmapped-boundary');review.attempt.header.reviewer=route;const limit=reviewJsonLimit();
   const bound=Math.max(...terminalCapacity(review,review.capacity!).flatMap(m=>Object.values(m)));
   head.meta.capacityPadding='x'.repeat(limit-bound);writeFileSync(prior.jsonPath,JSON.stringify(head,null,2)+'\n');review.capacity=await readCapacityBaseline(f.repo,hash,'s1');
   assert.equal(Math.max(...terminalCapacity(review,review.capacity).flatMap(m=>Object.values(m))),limit);
   const snapshots=(['claude','codex']as const).map(provider=>({provider,issues:[{code:`ATTRIBUTION_${provider}`,field:'tasks',correction:'Return every selected task.',occurrences:1}],lastRejectedFeedback:{preview:provider==='claude'?'é\n"'.repeat(1000):'x'.repeat(8192),truncated:false}}));
   const c=new TaskReviewCoordinator({sources:f.deps.sources,now:()=>clock,timer:callback=>{expire=callback;return()=>{};},provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:import('../../../../shared/types.js').ActivityReviewSessionOpts)=>{
    assert.ok(prompt.startsWith('Derive task attribution'),'no task assessment may run');
    assert.equal(f.read(review.path).attempts[0]!.header.attributionState,'pending');
    for(const diagnostic of snapshots)await opts.onDiagnostic!(diagnostic);
    if(outcome==='failed')throw new Error('Boundary attribution transport failure');
    return new Promise((_,reject)=>{opts.signal!.addEventListener('abort',()=>reject(opts.signal!.reason),{once:true});clock+=1800000;expire!();});
   }} as unknown as import('../../../../shared/types.js').LLMProvider),publish:(repo,id,_hash,baseline)=>publishTaskCheckpoint(repo,hash,id,{...f.deps,...(baseline?{baseline}:{})})});
   if(route==='daemon'){await c.start(f.repo,'unmapped-boundary',1,f.packet);await c.settled(f.repo,'unmapped-boundary');}
   else{
    const owner={id:'unmapped-boundary-owner',signal:new AbortController().signal};let frame=await c.startController(f.repo,'unmapped-boundary',1,f.packet,owner);
    assert.equal(frame.kind,'scope');
    for(const diagnostic of snapshots){await c.controllerActivity(f.repo,'unmapped-boundary',1,{kind:'diagnostic',phase:'attribution',diagnostic},owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});frame={...frame,nextSequence:frame.nextSequence!+1};}
    if(outcome==='failed')for(let i=0;i<3;i++)frame=await c.controllerScope(f.repo,'unmapped-boundary',1,{tasks:[{taskId:`foreign${i}`,changeIndexes:[0],testIndexes:[0]}]},owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});
    else{clock+=1800000;expire!();await eventually(()=>f.read(review.path).attempts[0]!['review-response'].crPublication==='complete');}
   }
   const entry=f.read(review.path).attempts[0]!,response=entry['review-response'];
   assert.equal(response.crPublication,'complete');assert.deepEqual(response.tasks.map(t=>t.status),[outcome,outcome]);
   assert.equal(entry.header.attributionState,'failed');assert.equal(entry.header.acceptedAttribution,undefined);assert.equal(entry.header.taskScopeIdentities,undefined);assert.equal(response.origins,undefined);
   assert.ok(Buffer.byteLength(entry.header.attributionFailure!.code)<=64);assert.ok(Buffer.byteLength(entry.header.attributionFailure!.summary)<=8192);
   assert.ok(response.tasks.every(t=>!t.findings.length&&t.testCoverage.assessment==='unverified'));validateFailureDiagnostics(entry);
   assert.deepEqual(response.failureDiagnostics!.map(d=>({phase:d.phase,taskId:d.taskId,diagnostic:d.diagnostic})),snapshots.map(diagnostic=>({phase:'attribution',taskId:undefined,diagnostic})),'shared diagnostics retained once, not copied per task');
   for(const path of [review.path,prior.jsonPath])assert.ok(Buffer.byteLength(readFileSync(path,'utf8'))<=limit,`${route}/${outcome} fits`);
   const summary=f.readRecord(prior.jsonPath).body.reviews.at(-1)!,scope=summary.scope.finalScope!;
   assert.equal(scope.attributionState,'unmapped_failure');assert.deepEqual(scope.tasks,[]);assert.equal(summary.taskScopeIdentities,undefined);assert.equal(summary.origins,undefined);
   assert.deepEqual(summary.tasks.map(t=>t.status),[outcome,outcome]);assert.match(summary.summary,/ATTRIBUTION_claude/);assert.match(summary.summary,/ATTRIBUTION_codex/);assert.equal(summary.summary.includes('é'),false);
  }finally{f.cleanup();}
 }
});
