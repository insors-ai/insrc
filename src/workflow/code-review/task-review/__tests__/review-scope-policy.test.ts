import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,hash } from './publication-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { normalizeTaskResult } from '../results.js';
import { TaskResultSchema } from '../contracts.js';
import { assignmentResultSchema } from '../result-schema.js';
import { TASK_REVIEW_POLICY } from '../policy.js';
import { publishTaskCheckpoint } from '../publication.js';
import { readFileSync } from 'node:fs';
import type { LLMProvider } from '../../../../shared/types.js';
const optional=['Optional execution: Integration checks not independently rerun.','Optional execution: Tests not executed; relevant assertions inspected.','Optional execution: Typecheck and build not rerun.'];

test('optional execution notes remain nonblocking on daemon and controller routes and in CR publication',async()=>{
 const f=await fixture(),life=new AbortController(),owner={id:'optional',signal:life.signal};
 const result={...f.result,advice:optional,testCoverage:{...f.result.testCoverage,explanation:'Coverage assessment completed from committed assertions; no independent execution claimed.'}};
 let prompt='';
 const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(text:string)=>{prompt=text;return result;}} as unknown as LLMProvider),publish:(repo,id,h)=>publishTaskCheckpoint(repo,h,id,f.deps)});
 try{
  const a=await c.start(f.repo,'optional-daemon',1,f.packet);await c.settled(f.repo,'optional-daemon');
  const b=await c.startController(f.repo,'optional-controller',1,f.packet,owner,hash);
  assert.equal(b.prompt,prompt);
  await c.controllerResult(f.repo,'optional-controller',1,result,owner,{taskId:b.taskId,executionId:b.executionId,sequence:b.nextSequence});
  for(const path of [a.path,b.path]){const entry=f.read(path).attempts[0]!;assert.equal(entry.header.status,'passed');assert.deepEqual(entry['review-response'].tasks,[result]);assert.deepEqual(entry['review-response'].tasks[0]!.executedTests,[]);}
  const md=readFileSync(f.read(a.path).attempts[0]!['review-response'].crPath!,'utf8');
  assert.match(md,/Optional verification and advice \(nonblocking\)/);assert.ok(md.includes(optional[0]!));assert.ok(!md.includes('Review limitations (blocking):'));
 }finally{life.abort();f.cleanup();}
});

test('skipped mandatory modules or test-coverage review stay incomplete even when optional checks pass',async()=>{
 const f=await fixture();try{
  const scope={taskId:'t1',changes:[{path:'source.js',previousPath:'source.js',segments:[{after:[1,1] as [number,number]}]}],evidenceReferences:[...f.result.inspectedReferences,...f.result.testCoverage.evidenceReferences]};
  for(const reason of ['Selected module not reviewed due to size','Required code branch not inspected due to time','Test assertions not reviewed due to access']){
   const result=normalizeTaskResult({...f.result,limitations:[reason],advice:optional},scope);assert.equal(result.status,'incomplete');assert.deepEqual(result.limitations,[reason]);
  }
  for(const assessment of ['partial','unverified','unsupported'] as const){assert.equal(normalizeTaskResult({...f.result,advice:optional,testCoverage:{...f.result.testCoverage,assessment}},scope).status,'incomplete');}
  const finding={severity:'MED' as const,location:'source.js:1',message:'Required behavior has no test assertion',rationale:'The inspected assertion covers a different branch.',evidenceReferences:f.result.inspectedReferences};
  const defect=normalizeTaskResult({...f.result,advice:optional,findings:[finding]},scope);assert.equal(defect.status,'changes_requested');assert.deepEqual(defect.findings,[finding]);
  const historical={...f.result,status:'incomplete' as const,limitations:['Previously recorded optional execution limit']};const frozen=structuredClone(historical);
  assert.equal(normalizeTaskResult(historical,scope).status,'incomplete');assert.deepEqual(historical,frozen,'historical records are not rewritten or promoted');
 }finally{f.cleanup();}
});

test('native policy and schema descriptions separate required inspection from optional execution',()=>{
 assert.match(TASK_REVIEW_POLICY,/inspect ALL submitted in-scope changed code\/modules/);assert.match(TASK_REVIEW_POLICY,/test bodies\/assertions/);assert.match(TASK_REVIEW_POLICY,/typechecks or builds is OPTIONAL/);assert.match(TASK_REVIEW_POLICY,/do not put them in limitations/);
 assert.match(TaskResultSchema.properties.limitations.description??'',/Blocking omissions/);assert.match(TaskResultSchema.properties.advice.description??'',/Nonblocking optional execution/);assert.match(TaskResultSchema.properties.testCoverage.description??'',/not that tests were executed/);
 const native=assignmentResultSchema({taskId:'t1',size:'S',timeoutMs:300000,changes:[],tests:[],acceptanceChecks:[]});assert.equal(native.properties.advice.description,TaskResultSchema.properties.advice.description);
 assert.deepEqual(native.required,TaskResultSchema.required,'no new stored fields or shape changes');
});
