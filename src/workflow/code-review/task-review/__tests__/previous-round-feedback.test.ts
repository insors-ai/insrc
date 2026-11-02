import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, hash } from './publication-fixture.js';
import { previousRoundFeedback } from '../previous-round-feedback.js';
import { attributionPrompt, directAssignments, taskFailure } from '../assessment.js';
import { assignmentPrompt } from '../policy.js';
import { prepareReviewPacket } from '../packet.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { publishTaskCheckpoint } from '../publication.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { channel, serve, eventually } from './controller-fixture.js';
import { CliProvider } from '../../../../agent/providers/cli-provider.js';
import { ReviewOutputFailureError } from '../../../../shared/review-diagnostics.js';
import type { ReviewDiagnosticSnapshot } from '../../../../shared/review-diagnostics.js';
import type { AdmittedReview } from '../execution.js';
import type { ReviewAttempt } from '../contracts.js';
import type { ControllerFrame } from '../controller.js';

const diagnostic:ReviewDiagnosticSnapshot={provider:'claude',issues:[{code:'MISSING_REQUIRED_FIELD',field:'findings',correction:'UNTRUSTED_CORRECTION_CANARY',message:'VERBOSE_MESSAGE_CANARY',occurrences:5}],lastRejectedFeedback:{preview:'REJECTED_FEEDBACK_CANARY',truncated:false}};
function nextReview(f:Awaited<ReturnType<typeof fixture>>,prepared:Awaited<ReturnType<typeof prepareReviewPacket>>):AdmittedReview{
 const checkpoint=f.checkpoint('projection'),prior=checkpoint.attempts[0]!;
 prior.header.status='failed';prior['review-response'].tasks=prior['review-response'].tasks.map(t=>taskFailure(t.taskId,'native failure',false));
 prior['review-response'].failureDiagnostics=[{phase:'assessment',taskId:'t1',diagnostic:structuredClone(diagnostic)}];
 const attempt:ReviewAttempt={header:{attempt:2,reviewer:'daemon',status:'pending',createdAt:new Date().toISOString(),selectedTaskIds:prior.header.selectedTaskIds},submitted:structuredClone(f.packet),'review-response':{summary:'Pending',tasks:[],crPublication:'pending'}};
 return{prepared,checkpoint:{...checkpoint,attempts:[prior,attempt]},attempt,path:checkpointPath(f.repo,'projection')};
}
test('previousRoundFeedback is concise, scoped, bounded, excludes previews/schema and respects latest same-party resolved result',async()=>{
 const f=await fixture();try{
  const prepared=await prepareReviewPacket(f.packet,f.deps.sources),review=nextReview(f,prepared);
  const expected={previousRoundFeedback:[{attempt:1,taskId:'t1',phase:'assessment',errors:[{code:'MISSING_REQUIRED_FIELD',field:'findings',correction:'Return findings as a top-level JSON array.'}]}]};
  assert.deepEqual(previousRoundFeedback(review,'t1'),expected);assert.deepEqual(previousRoundFeedback(review,'foreign'),{previousRoundFeedback:[]});
  const assigned=directAssignments(prepared)![0]!;
  for(const prompt of [attributionPrompt(prepared,f.repo,review),assignmentPrompt(prepared,assigned,[],f.repo,review)]){
   assert.ok(prompt.includes('"previousRoundFeedback":[{'));
   for(const forbidden of ['VERBOSE_MESSAGE_CANARY','REJECTED_FEEDBACK_CANARY','UNTRUSTED_CORRECTION_CANARY','"failureDiagnostics"'])assert.ok(!prompt.includes(forbidden),forbidden);
  }
  const prior=review.checkpoint.attempts[0]!;prior['review-response'].failureDiagnostics![0]!.resolved=true;
  assert.deepEqual(previousRoundFeedback(review),{previousRoundFeedback:[]});delete prior['review-response'].failureDiagnostics![0]!.resolved;
  prior['review-response'].tasks=[structuredClone(f.result)];assert.deepEqual(previousRoundFeedback(review),{previousRoundFeedback:[]});
  prior['review-response'].tasks=[taskFailure('t1','native error',false)];prior.header.reviewer='controller';assert.deepEqual(previousRoundFeedback(review),{previousRoundFeedback:[]});prior.header.reviewer='daemon';
  delete prior['review-response'].failureDiagnostics;assert.deepEqual(previousRoundFeedback(review),{previousRoundFeedback:[]});
 }finally{f.cleanup();}
});
test('feedback applies shared attribution only to selected tasks and enforces the whole-input byte budget',async()=>{
 const f=await fixture(true,3);try{
  const path=f.packet.documents.plan.path,plan=JSON.parse(f.git('show',`${f.packet.documents.plan.commit}:${path}`));
  plan.body.tasks=Array.from({length:10},(_,i)=>({...plan.body.tasks[0],id:`t${i+1}`,order:i+1,dependsOn:i?[`t${i}`]:[]}));
  f.put(path,plan);f.git('add',path);f.git('commit','-qm','projection scope');f.packet.documents.plan.commit=f.git('rev-parse','HEAD');
  const prepared=await prepareReviewPacket(f.packet,f.deps.sources),review=nextReview(f,prepared),prior=review.checkpoint.attempts[0]!;
  prior.header.selectedTaskIds=prepared.tasks.map(t=>t.id);review.attempt.header.selectedTaskIds=prior.header.selectedTaskIds;
  prior['review-response'].tasks=prepared.tasks.map(t=>taskFailure(t.id,'native error',false));
  prior['review-response'].failureDiagnostics=[{phase:'attribution',diagnostic:structuredClone(diagnostic)}];
  assert.deepEqual(previousRoundFeedback(review,'t2').previousRoundFeedback.map(r=>[r.taskId,r.phase]),[['t2','attribution']]);
  assert.equal(previousRoundFeedback(review).previousRoundFeedback.length,10);
  prior['review-response'].failureDiagnostics=prepared.tasks.map(t=>({phase:'assessment',taskId:t.id,diagnostic:{provider:'claude',issues:Array.from({length:8},(_,i)=>({code:'SCHEMA_CONSTRAINT',field:`field${i}${'x'.repeat(100)}`,correction:'ignored native correction',occurrences:1}))}}));
  const projected=previousRoundFeedback(review);assert.equal(projected.previousRoundFeedbackTruncated,true);assert.ok(Buffer.byteLength(JSON.stringify(projected))<=4096);assert.ok(projected.previousRoundFeedback.length<10);
 }finally{f.cleanup();}
});

function nativeFixture(f:Awaited<ReturnType<typeof fixture>>,kind:'claude'|'codex'){
 const bin=join(f.repo,`native-${kind}.mjs`),calls=join(f.repo,`native-${kind}-calls.jsonl`);
 // This fake CLI requires the real next-round input to contain pointed feedback.
 // It never performs a hosted model request or an actual code review.
 const source=`#!/usr/bin/env node
import{appendFileSync}from'node:fs';
let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',()=>{
 const scope=prompt.startsWith('Derive task attribution');
 const feedback=prompt.includes('"previousRoundFeedback":[{')&&prompt.includes('MISSING_REQUIRED_FIELD');
 appendFileSync(${JSON.stringify(calls)},JSON.stringify({scope,feedback})+'\\n');
 if(prompt.includes('REJECTED_FEEDBACK_CANARY'))process.exit(9);
 const output=scope?{summary:'Reassess failed output',tasks:[{taskId:'t1',changeIndexes:[0],testIndexes:[0],action:'reassess',reason:'Use prior output correction'}]}:feedback?${JSON.stringify(f.result)}:{...${JSON.stringify(f.result)},summary:'REJECTED_FEEDBACK_CANARY'};
 if(!scope&&!feedback)delete output.findings;
 const valid=scope||feedback;
 const frames=${JSON.stringify(kind)}==='claude'?[{type:'assistant',message:{content:[{type:'tool_use',name:'StructuredOutput',id:'out',input:output}]}},...(!valid?[{type:'result',is_error:true,subtype:'error_max_structured_output_retries',errors:['missing required findings']}]:[])]:[{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(output)}},{type:'turn.completed'}];
 process.stdout.write(frames.map(x=>JSON.stringify(x)+'\\n').join(''),()=>process.exit(valid?0:1));
});`;
 writeFileSync(bin,source);chmodSync(bin,0o755);return{cli:new CliProvider({kind,binPath:bin}),calls};
}
test('Fake Claude/Codex failure persists on daemon route and appears in subsequent input',async()=>{
 for(const kind of ['claude','codex'] as const){
  const f=await fixture(),native=nativeFixture(f,kind),id=`daemon-${kind}`;
  const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>native.cli,publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
  try{
   const first=await c.start(f.repo,id,1,f.packet);await c.settled(f.repo,id);
   const original=structuredClone(f.read(first.path).attempts[0]!);assert.equal(original.header.status,'failed');assert.equal(original['review-response'].failureDiagnostics?.[0]?.diagnostic.issues[0]?.field,'findings');
   await c.start(f.repo,id,2,f.packet);await c.settled(f.repo,id);
   const saved=f.read(first.path);assert.equal(saved.attempts[1]!.header.status,'passed');assert.deepEqual(saved.attempts[0],original);
   const before=readFileSync(native.calls,'utf8');assert.equal(before.trim().split('\n').length,3,'one failed assessment, one attribution, one corrected assessment');
   await c.start(f.repo,id,2,undefined,{operation:'resume'});assert.equal(readFileSync(native.calls,'utf8'),before,'terminal resume does not start another CLI');
  }finally{f.cleanup();}
 }
});
test('controller fake native failures use the same persisted feedback on real IPC for both CLIs',async()=>{
 for(const kind of ['claude','codex'] as const){
  const f=await fixture(),native=nativeFixture(f,kind);f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
  const host=await serve(f.repo,()=>{throw Error('Controller route must not use daemon native provider');}),client=await channel(host.path),id=`controller-${kind}`;
  try{
   let original:ReviewAttempt|undefined;
   for(const attempt of [1,2]){
    const base={repo:f.repo,epicHash:hash,reviewId:id,attempt};let frame=await client.call<ControllerFrame>('codeReview.task.start',{...base,packet:f.packet});
    while(frame.kind!=='done'){
     const current=frame,phase=current.kind==='scope'?'attribution':'assessment';let sequence=current.nextSequence!;
     const send=async<T=unknown>(method:string,data:Record<string,unknown>)=>{
      const value=await client.rawCall<T>(method,{...base,taskId:current.taskId,executionId:current.executionId,sequence,...data});sequence++;return value;
     };
     try{
      await native.cli.runReviewSession(current.prompt!,current.schema!,{mode:'activity',cwd:f.repo,inactivityMs:1800000,internalRetry:false,signal:new AbortController().signal,
       onActivity:()=>{},onDiagnostic:async diagnostic=>{await send('codeReview.task.activity',{event:{kind:'diagnostic',phase,diagnostic}});},
       onCandidate:async result=>{frame=await send<ControllerFrame>(phase==='attribution'?'codeReview.task.scope':'codeReview.task.result',phase==='attribution'?{scope:result}:{result});return{accepted:true};}});
     }catch(error){
      assert.ok(error instanceof ReviewOutputFailureError);assert.equal(phase,'assessment');
      frame=await send<ControllerFrame>('codeReview.task.result',{result:taskFailure(current.taskId!,error.message,false)});
     }
    }
    assert.equal(frame.status,attempt===1?'failed':'passed');
    const saved=f.read(frame.path);if(attempt===1)original=structuredClone(saved.attempts[0]!);else assert.deepEqual(saved.attempts[0],original);
   }
   assert.equal(readFileSync(native.calls,'utf8').trim().split('\n').length,3);
  }finally{client.close();await host.server.close();f.cleanup();}
 }
});
test('Saved diagnostics survive disconnect/restart; later valid feedback does not rewrite failed attempt',async()=>{
 const f=await fixture(),life=new AbortController(),owner={id:'first-owner',signal:life.signal};
 const first=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('controller route');}});
 try{
  const frame=await first.startController(f.repo,'recover-diagnostic',1,f.packet,owner);
  await first.controllerActivity(f.repo,'recover-diagnostic',1,{kind:'diagnostic',phase:'assessment',diagnostic},owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});
  life.abort();await eventually(()=>f.read(frame.path).attempts[0]!.header.interrupted===true);
  const nextLife=new AbortController(),nextOwner={id:'new-owner',signal:nextLife.signal};
  const restarted=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('controller route');},publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
  const resumed=await restarted.startController(f.repo,'recover-diagnostic',1,undefined,nextOwner,hash,'resume');
  assert.equal(f.read(resumed.path).attempts[0]!['review-response'].failureDiagnostics?.[0]?.diagnostic.issues[0]?.field,'findings');
  await restarted.controllerResult(f.repo,'recover-diagnostic',1,taskFailure('t1','Previous CLI failed',false),nextOwner,{taskId:resumed.taskId,executionId:resumed.executionId,sequence:resumed.nextSequence});
  const original=structuredClone(f.read(resumed.path).attempts[0]!);
  const next=await restarted.startController(f.repo,'recover-diagnostic',2,f.packet,nextOwner,hash);assert.ok(next.prompt!.includes('MISSING_REQUIRED_FIELD'));
  const task=await restarted.controllerScope(f.repo,'recover-diagnostic',2,{summary:'Reassess failed output',tasks:[{taskId:'t1',changeIndexes:[0],testIndexes:[0],action:'reassess',reason:'Correct missing field'}]},nextOwner,{taskId:next.taskId,executionId:next.executionId,sequence:next.nextSequence});
  assert.ok(task.prompt!.includes('"previousRoundFeedback":[{'));
  const done=await restarted.controllerResult(f.repo,'recover-diagnostic',2,f.result,nextOwner,{taskId:task.taskId,executionId:task.executionId,sequence:task.nextSequence});
  assert.equal(done.status,'passed');assert.deepEqual(f.read(done.path).attempts[0],original);nextLife.abort();
 }finally{life.abort();f.cleanup();}
});

test('exact failed-result origins preserve diagnostic provenance without reviving resolved older rounds',async()=>{
 const f=await fixture();try{
  const prepared=await prepareReviewPacket(f.packet,f.deps.sources),r=nextReview(f,prepared),original=r.checkpoint.attempts[0]!;
  const reused:ReviewAttempt={...structuredClone(original),header:{...original.header,attempt:2},'review-response':{...structuredClone(original['review-response']),origins:[{taskId:'t1',sourceAttempt:1,reason:'Exact failed result reuse'}]}};
  delete reused['review-response'].failureDiagnostics;
  r.attempt.header.attempt=3;r.checkpoint={...r.checkpoint,attempts:[original,reused,r.attempt]};
  assert.equal(previousRoundFeedback(r).previousRoundFeedback[0]?.attempt,1);
  reused['review-response'].tasks=[structuredClone(f.result)];delete reused['review-response'].origins;
  assert.deepEqual(previousRoundFeedback(r),{previousRoundFeedback:[]},'a newer pass suppresses older failures');
 }finally{f.cleanup();}
});

test('Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure',async()=>{
 for(const mode of ['diagnostic','feedback'] as const){
  const f=await fixture(),life=new AbortController(),owner={id:`writer-${mode}`,signal:life.signal};
  const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('controller route');},save:async(path,cp)=>{
   const response=cp.attempts.at(-1)!['review-response'];
   if(mode==='diagnostic'?response.failureDiagnostics?.length:response.tasks.length)throw Error('injected controller write failure');
   await saveCheckpoint(path,cp);
  }});
  try{
   const frame=await c.startController(f.repo,`writer-${mode}`,1,f.packet,owner),envelope={taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence};
   const event={kind:'diagnostic',phase:'assessment',diagnostic};
   if(mode==='diagnostic')await assert.rejects(c.controllerActivity(f.repo,`writer-${mode}`,1,event,owner,envelope),/write failure/);
   else{
    await c.controllerActivity(f.repo,`writer-${mode}`,1,event,owner,envelope);
    await assert.rejects(c.controllerResult(f.repo,`writer-${mode}`,1,f.result,owner,{...envelope,sequence:2}),/write failure/);
   }
   const disk=f.read(frame.path).attempts[0]!;assert.deepEqual(disk['review-response'].tasks,[]);assert.equal(disk['review-response'].failureDiagnostics?.[0]?.resolved,undefined);
   if(mode==='diagnostic')assert.equal(disk['review-response'].failureDiagnostics,undefined);
   const restartLife=new AbortController(),restartOwner={id:'restored',signal:restartLife.signal};
   const restored=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('controller route');}});
   const pending=await restored.startController(f.repo,`writer-${mode}`,1,undefined,restartOwner,hash,'resume');assert.equal(pending.kind,'task');assert.deepEqual(pending.completedTaskIds,[]);
   const done=await restored.controllerResult(f.repo,`writer-${mode}`,1,f.result,restartOwner,{taskId:pending.taskId,executionId:pending.executionId,sequence:pending.nextSequence});assert.equal(done.status,'passed');
   await assert.rejects(restored.controllerActivity(f.repo,`writer-${mode}`,1,event,restartOwner,{taskId:pending.taskId,executionId:pending.executionId,sequence:pending.nextSequence!+1}));
   assert.deepEqual(f.read(done.path).attempts[0]!['review-response'].tasks,[f.result]);restartLife.abort();
  }finally{life.abort();f.cleanup();}
 }
});
