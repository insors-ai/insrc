import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,hash } from './publication-fixture.js';
import { prepareReviewPacket } from '../packet.js';
import { attributionPrompt,attributionSchema,AttributionSchema,ReassessmentSchema,reviewAssignments } from '../assessment.js';
import { decodeReview } from '../contracts.js';
import type { TaskReviewResult } from '../contracts.js';
import type { AdmittedReview } from '../execution.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { publishTaskCheckpoint } from '../publication.js';
import type { LLMProvider } from '../../../../shared/types.js';

async function fiveTaskFixture(){
 const f=await fixture(true,3),path=`.insrc/artifacts/PLAN-${hash}-s1.json`;
 const plan=JSON.parse(f.git('show',`HEAD:${path}`));
 plan.body.tasks=Array.from({length:5},(_,i)=>({...plan.body.tasks[0],id:`t${i+1}`,title:`Task ${i+1}`,order:i+1,dependsOn:i?[`t${i}`]:[]}));
 f.put(path,plan);f.git('add',path);f.git('commit','-qm','five task Plan');f.packet.documents.plan.commit=f.git('rev-parse','HEAD');f.packet.taskId='t4';
 return f;
}
const row=(taskId:string)=>({taskId,changeIndexes:[0],testIndexes:[0]});
const reassessment=(taskId:string)=>({...row(taskId),action:'reassess',reason:'Fresh review of selected task'});

test('single-task attribution prompt and native schema select t4 only on initial and subsequent attempts',async()=>{
 const f=await fiveTaskFixture();try{
  const prepared=await prepareReviewPacket(f.packet,f.deps.sources),checkpoint=f.checkpoint('scope-unit'),entry=checkpoint.attempts[0]!;
  const review:AdmittedReview={prepared,checkpoint,attempt:entry,path:'scope-unit'};
  const generic=JSON.stringify([AttributionSchema,ReassessmentSchema]);
  for(const attempt of [1,2]){
   entry.header.attempt=attempt;
   const schema=attributionSchema(review),wrap=(tasks:unknown[])=>attempt===1?{tasks}:{summary:'Reassess selected task',tasks};
   const valid=wrap([attempt===1?row('t4'):reassessment('t4')]);decodeReview(schema,valid);
   assert.deepEqual(reviewAssignments(review,valid).map(t=>t.taskId),['t4']);
   for(const tasks of [[],[attempt===1?row('t1'):reassessment('t1')],['t1','t2','t3','t4','t5'].map(id=>attempt===1?row(id):reassessment(id))])assert.throws(()=>decodeReview(schema,wrap(tasks)));
   const prompt=attributionPrompt(prepared,f.repo,review);assert.match(prompt,/Applicable task IDs: \["t4"\]/);assert.match(prompt,/Return exactly 1 task rows/);assert.ok(!prompt.includes('for every Plan task'));
  }
  assert.equal(JSON.stringify([AttributionSchema,ReassessmentSchema]),generic,'schema generation never mutates shared templates');
 }finally{f.cleanup();}
});

test('whole-story attribution retains every Plan task and strict host uniqueness and coverage checks',async()=>{
 const f=await fiveTaskFixture();try{
  delete f.packet.taskId;const prepared=await prepareReviewPacket(f.packet,f.deps.sources),checkpoint=f.checkpoint('whole-unit'),entry=checkpoint.attempts[0]!;
  const review:AdmittedReview={prepared,checkpoint,attempt:entry,path:'whole-unit'};
  for(const attempt of [1,2]){
   entry.header.attempt=attempt;const tasks=['t1','t2','t3','t4','t5'].map(id=>attempt===1?row(id):reassessment(id));
   const wrap=(rows:typeof tasks)=>attempt===1?{tasks:rows}:{summary:'Review all selected tasks',tasks:rows};
   const schema=attributionSchema(review);decodeReview(schema,wrap(tasks));assert.equal(reviewAssignments(review,wrap(tasks)).length,5);
   assert.throws(()=>decodeReview(schema,wrap(tasks.slice(0,4))));assert.throws(()=>decodeReview(schema,wrap([...tasks.slice(0,4),{...tasks[4]!,taskId:'t6'}])));
   assert.throws(()=>reviewAssignments(review,wrap([...tasks.slice(0,4),tasks[0]!])),/Every applicable/);
   assert.throws(()=>reviewAssignments(review,wrap(tasks.map(t=>({...t,changeIndexes:[]})))),/omit submitted/);
   assert.throws(()=>reviewAssignments(review,wrap(tasks.map(t=>({...t,testIndexes:[]})))),/omit submitted/);
   assert.match(attributionPrompt(prepared,f.repo,review),/Applicable task IDs: \["t1","t2","t3","t4","t5"\]/);
  }
 }finally{f.cleanup();}
});

test('single-task re-review uses the same constrained attribution on daemon and controller routes and preserves prior attempts',async()=>{
 const f=await fiveTaskFixture(),life=new AbortController(),owner={id:'scope-controller',signal:life.signal};
 const result:TaskReviewResult={...f.result,taskId:'t4'};let calls=0,nativeSchema:unknown;
 const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,schema:unknown)=>{
  calls++;if(prompt.startsWith('Derive task attribution')){nativeSchema=schema;assert.match(prompt,/Applicable task IDs: \["t4"\]/);return{summary:'Reassess selected task',tasks:[reassessment('t4')]};}return result;
 }} as unknown as LLMProvider),publish:(repo,id,h)=>publishTaskCheckpoint(repo,h,id,f.deps)});
 try{
  const a=await c.start(f.repo,'scoped-daemon',1,f.packet);await c.settled(f.repo,'scoped-daemon');const before=structuredClone(f.read(a.path).attempts[0]);
  await c.start(f.repo,'scoped-daemon',2,f.packet);await c.settled(f.repo,'scoped-daemon');
  const after=f.read(a.path);assert.deepEqual(after.attempts[0],before);assert.equal(after.attempts[1]!.header.status,'passed');assert.equal(calls,3,'initial assessment, one reassessment attribution and one fresh assessment');
  const first=await c.startController(f.repo,'scoped-controller',1,f.packet,owner,hash);
  await c.controllerResult(f.repo,'scoped-controller',1,result,owner,{taskId:first.taskId,executionId:first.executionId,sequence:first.nextSequence});const original=structuredClone(f.read(first.path).attempts[0]);
  const next=await c.startController(f.repo,'scoped-controller',2,f.packet,owner,hash);assert.equal(next.kind,'scope');assert.deepEqual(next.schema,nativeSchema);assert.match(next.prompt!,/Applicable task IDs: \["t4"\]/);
  const frame=await c.controllerScope(f.repo,'scoped-controller',2,{summary:'Fresh assessment',tasks:[reassessment('t4')]},owner,{taskId:next.taskId,executionId:next.executionId,sequence:next.nextSequence});
  const done=await c.controllerResult(f.repo,'scoped-controller',2,result,owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});assert.equal(done.status,'passed');assert.deepEqual(f.read(first.path).attempts[0],original);
 }finally{life.abort();f.cleanup();}
});
