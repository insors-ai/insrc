import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { ReviewOutputFailureError } from '../../../../shared/review-diagnostics.js';
import type { LLMProvider, ActivityReviewSessionOpts } from '../../../../shared/types.js';
import type { DesignChunkPlan } from '../contracts.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import { saveDesignCheckpoint } from '../checkpoint.js';
import { designFixture } from './fixtures.js';

const input=(f:ReturnType<typeof designFixture>,reviewId='review-1')=>({phase:'start',repo:f.repo,reviewId,attempt:1,artifactPath:f.json});
function fake(f:ReturnType<typeof designFixture>,options:{before?:(stage:string)=>Promise<void>|void;mode?:'limits'|'mutation'|'invalid-status'}={}){
 const calls:string[]=[],sessions:ActivityReviewSessionOpts[]=[];
 const plan:DesignChunkPlan={chunks:[{id:'content',title:'Coherent scope',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements and implementation responsibility'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Whole-design consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All units reviewed together, then consistency',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{
  const chunk=prompt.match(/Chunk assignment: (.+)\n/)?.[1];const assignment=chunk?JSON.parse(chunk):undefined;
  const stage=assignment?.id??'planning';calls.push(stage);sessions.push(opts);await options.before?.(stage);
  await opts.onActivity({sessionId:`session-${calls.length}`,sequence:1,kind:'session_started'});
  await opts.onActivity({sessionId:`session-${calls.length}`,sequence:2,kind:'model_output'});
  if(stage==='content'&&options.mode==='mutation')appendFileSync(f.md,'\nChanged during review');
  const limited=stage==='content'&&options.mode==='limits';
  const value=assignment?{chunkId:stage,status:limited||stage==='content'&&options.mode==='invalid-status'?'changes_requested':'passed',summary:'Fake substantive result, not hosted review',findings:limited?[{id:'f1',severity:'MED',location:'/body/summary',message:'Contradictory design',evidenceReferences:[f.md]}]:[],inspectedReferences:limited?[]:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:stage==='content'&&options.mode==='invalid-status'?['Required contract not verified']:[],advice:[]}:plan;
  const accepted=await opts.onCandidate(value);if(!accepted.accepted)throw new Error('Candidate rejected');return value;
 }} as unknown as LLMProvider;
 return {provider,calls,sessions};
}
async function terminal(coordinator:DesignReviewCoordinator,f:ReturnType<typeof designFixture>){
 for(let i=0;i<1000;i++){const view=await coordinator.progress(f.repo,'review-1',1);if(!['pending','running'].includes(view.status))return view;await pause(5);}
 throw new Error('Fake review failed to settle');
}
test('native acknowledgement is durable and duplicate start does not dispatch another review',async t=>{
 const f=designFixture(t);let release!:()=>void;const barrier=new Promise<void>(r=>release=r);
 const native=fake(f,{before:stage=>stage==='planning'?barrier:undefined});
 const coordinator=new DesignReviewCoordinator({provider:()=>({provider:native.provider,model:'fake-native (fixture)'})});
 const ack=await coordinator.start(input(f));assert.equal(ack.status,'pending');assert.equal(native.calls.length,0);
 assert.equal((await coordinator.start(input(f))).reviewId,ack.reviewId);
 await assert.rejects(coordinator.start({...input(f),artifactPath:f.md}),/immutable submission/);
 await assert.rejects(coordinator.start(input(f,'another-review')),/active review/);
 release();const done=await terminal(coordinator,f);assert.equal(done.status,'passed');assert.equal(done.completedChunks,2);assert.deepEqual(native.calls,['planning','content','final']);
 assert.equal((await coordinator.start(input(f))).status,'passed');assert.equal(native.calls.length,3);
 assert.ok(done.report);assert.ok(!('chunks' in done.report!));assert.ok(!JSON.stringify(done).includes('"reviewedContent":'));assert.ok(!JSON.stringify(done).includes('The feature works'));
});
test('findings and verification gaps continue chunks, while failed durability and mutation stop advancement',async t=>{
 const f=designFixture(t),native=fake(f,{mode:'limits'}),coordinator=new DesignReviewCoordinator({provider:()=>({provider:native.provider,model:'fake'})});
 await coordinator.start(input(f));const done=await terminal(coordinator,f);assert.equal(done.status,'incomplete');assert.equal(done.report?.counts.MED,1);assert.equal(done.completedChunks,2);assert.equal(native.calls.length,3);
 const fail=designFixture(t),writer=fake(fail);const failed=new DesignReviewCoordinator({provider:()=>({provider:writer.provider,model:'fake'}),save:async(project,cp)=>{if(cp.attempts[0]!.completedChunks.length)throw new Error('disk failure before accepted chunk');await saveDesignCheckpoint(project,cp);}});
 await failed.start(input(fail));const failure=await terminal(failed,fail);assert.equal(failure.status,'failed');assert.equal(failure.completedChunks,0);assert.equal(writer.calls.length,2);assert.match(failure.failure!.summary,/disk failure/);
 const changed=designFixture(t),mutator=fake(changed,{mode:'mutation'}),invalidated=new DesignReviewCoordinator({provider:()=>({provider:mutator.provider,model:'fake'})});
 await invalidated.start(input(changed));const invalid=await terminal(invalidated,changed);assert.equal(invalid.status,'invalidated');assert.equal(invalid.requiresUserInput,true);assert.equal(invalid.completedChunks,0);assert.equal(mutator.calls.length,2);
});
test('native execution has request-independent activity options and model-free observations',async t=>{
 const f=designFixture(t);let release!:()=>void;const barrier=new Promise<void>(r=>release=r);const native=fake(f,{before:stage=>stage==='planning'?barrier:undefined});
 let factories=0;const coordinator=new DesignReviewCoordinator({provider:()=>{factories++;return{provider:native.provider,model:'fake-configured-model'};}});
 await coordinator.start(input(f));for(let i=0;i<100&&!native.sessions.length;i++)await pause(5);
 const opts=native.sessions[0]!;assert.equal(opts.mode,'activity');assert.equal(opts.inactivityMs,1800000);assert.equal(opts.internalRetry,false);assert.ok(!('deadlineMs' in opts));assert.ok(!('codeTaskCommands' in opts));
 for(let i=0;i<4;i++)await coordinator.progress(f.repo,'review-1',1);assert.equal(native.calls.length,1);assert.equal(factories,1);assert.equal(opts.signal.aborted,false);
 release();assert.equal((await terminal(coordinator,f)).status,'passed');
 const first=await coordinator.progress(f.repo,'review-1',1,{includeResult:true});assert.equal(first.completedResults.length,1);assert.equal(first.nextCompletedChunk,1);
 const restored=new DesignReviewCoordinator({provider:()=>{throw new Error('Observation must not construct provider');}});assert.equal((await restored.progress(f.repo,'review-1',1)).status,'passed');
});

test('contradictory native status fails with pointed details and never silently retries or normalizes',async t=>{
 const f=designFixture(t),native=fake(f,{mode:'invalid-status'}),coordinator=new DesignReviewCoordinator({provider:()=>({provider:native.provider,model:'fake'})});
 await coordinator.start(input(f));const view=await terminal(coordinator,f);
 assert.equal(view.status,'failed');assert.equal(view.completedChunks,0);assert.deepEqual(native.calls,['planning','content']);
 assert.equal(view.failure?.code,'invalid_result');assert.match(view.failure!.summary,/received changes_requested, expected incomplete; limitations=1/);
});

test('native schema failures retain pointed diagnostic corrections without raw output or retry',async t=>{
 const f=designFixture(t);let calls=0;
 const provider={capabilities:{reviewActivity:true},runReviewSession:async()=>{calls++;throw new ReviewOutputFailureError('Native schema rejected feedback',{provider:'codex',issues:[{code:'MISSING_REQUIRED_FIELD',field:'/findings',correction:'Include findings as an array.',occurrences:1}],lastRejectedFeedback:{preview:'RAW_OUTPUT_CANARY',truncated:false}});}} as unknown as LLMProvider;
 const coordinator=new DesignReviewCoordinator({provider:()=>({provider,model:'fake'})});await coordinator.start(input(f));const view=await terminal(coordinator,f);
 assert.equal(view.status,'failed');assert.equal(calls,1);assert.match(view.failure!.summary,/MISSING_REQUIRED_FIELD \/findings: Include findings as an array/);assert.ok(!view.failure!.summary.includes('RAW_OUTPUT_CANARY'));
});

test('slow progress persistence coalesces activity instead of accumulating checkpoint writes',async t=>{
 const f=designFixture(t);let releaseProvider!:()=>void,releaseSave!:()=>void,entered!:()=>void;
 const providerWait=new Promise<void>(r=>releaseProvider=r),saveWait=new Promise<void>(r=>releaseSave=r),saving=new Promise<void>(r=>entered=r);
 const native=fake(f,{before:stage=>stage==='planning'?providerWait:undefined});let progressWrites=0;
 const coordinator=new DesignReviewCoordinator({provider:()=>({provider:native.provider,model:'fake'}),save:async(project,cp)=>{
  const attempt=cp.attempts[0]!;
  if(attempt.current?.kind==='planning'&&attempt.progress.lastMeaningfulActivityAt){progressWrites++;if(progressWrites===1){entered();await saveWait;}}
  await saveDesignCheckpoint(project,cp);
 }});
 await coordinator.start(input(f));for(let i=0;i<100&&!native.sessions.length;i++)await pause(5);
 const opts=native.sessions[0]!;await opts.onActivity({sessionId:'slow-write',sequence:1,kind:'session_started'});await opts.onActivity({sessionId:'slow-write',sequence:2,kind:'model_output'});await pause(300);await saving;
 for(let sequence=3;sequence<=5;sequence++){await opts.onActivity({sessionId:'slow-write',sequence,kind:'model_output'});await pause(300);}
 releaseSave();releaseProvider();assert.equal((await terminal(coordinator,f)).status,'passed');assert.equal(progressWrites,1);
});
