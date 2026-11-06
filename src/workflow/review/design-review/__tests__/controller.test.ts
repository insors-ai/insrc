import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,appendFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { DesignReviewCoordinator } from '../coordinator.js';
import type { DesignControllerOwner } from '../coordinator.js';
import type { DesignUnitAssignment, DesignChunkPlan } from '../contracts.js';
import { saveDesignCheckpoint,loadDesignCheckpoint } from '../checkpoint.js';
import { designFixture } from './fixtures.js';

async function assignment(c:DesignReviewCoordinator,f:ReturnType<typeof designFixture>,owner:DesignControllerOwner){
 for(let i=0;i<500;i++){const value=await c.exchange({phase:'assignment',repo:f.repo,reviewId:'review-1',attempt:1},owner) as {assignment:DesignUnitAssignment|null};if(value.assignment)return value.assignment;await pause(5);}throw new Error('Assignment not issued');
}
function setup(t:Parameters<typeof designFixture>[0]){
 const f=designFixture(t,'daemon'),abort=new AbortController(),owner={id:'trusted-connection',signal:abort.signal};
 const c=new DesignReviewCoordinator({provider:()=>{throw new Error('Controller must not construct provider');}});
 const base={repo:f.repo,reviewId:'review-1',attempt:1};
 const plan:DesignChunkPlan={chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Coherent content then consistency',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};
 const result=(id:string)=>({chunkId:id,status:'passed',summary:'Controller fixture feedback',findings:[],inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:[],advice:[]});
 return{f,c,owner,abort,base,plan,result,start:()=>c.start({phase:'start',...base,artifactPath:f.json},{owner})};
}
test('trusted controller authority, execution sequence and durable exact replay are enforced',async t=>{
 const x=setup(t);await x.start();const a=await assignment(x.c,x.f,x.owner);
 assert.ok(a.prompt.includes(x.f.md));assert.ok(!a.prompt.includes('The feature works'));assert.ok(a.schema);
 const request={phase:'plan',...x.base,executionId:a.executionId,sequence:1,plan:x.plan};
 await assert.rejects(x.c.exchange({phase:'result',...x.base,executionId:a.executionId,sequence:1,result:x.result('content')},x.owner),(error:unknown)=>!!error&&typeof error==='object'&&'code' in error&&error.code==='invalid_phase');
 await assert.rejects(x.c.exchange(request,{id:'observer',signal:new AbortController().signal}),/reviewing connection/);
 await assert.rejects(x.c.exchange({...request,executionId:'stale'},x.owner),/generation/);
 await assert.rejects(x.c.exchange({...request,sequence:2},x.owner),/sequence/);
 assert.deepEqual(await x.c.exchange(request,x.owner),{accepted:true});
 assert.ok((await loadDesignCheckpoint(x.f.repo,'review-1'))!.attempts[0]!.plan);
 assert.deepEqual(await x.c.exchange(request,x.owner),{accepted:true});
 const reordered=Object.fromEntries(Object.entries({...request,plan:Object.fromEntries(Object.entries(x.plan).reverse())}).reverse());
 assert.deepEqual(await x.c.exchange(reordered,x.owner),{accepted:true});
 await assert.rejects(x.c.exchange({...request,plan:{...x.plan,coverageExplanation:'Changed replay'}},x.owner),/Conflicting/);
 const chunk=await assignment(x.c,x.f,x.owner);assert.notEqual(chunk.executionId,a.executionId);
 await assert.rejects(x.c.exchange({phase:'plan',...x.base,executionId:chunk.executionId,sequence:1,plan:x.plan},x.owner),(error:unknown)=>!!error&&typeof error==='object'&&'code' in error&&error.code==='invalid_phase');
 const event={phase:'activity',...x.base,executionId:chunk.executionId,sequence:1,event:{sessionId:'session',sequence:1,kind:'session_started'}};
 await x.c.exchange(event,x.owner);await x.c.exchange(event,x.owner);
 await assert.rejects(x.c.exchange({...event,sequence:2},x.owner),/activity/);
 await x.c.exchange({phase:'result',...x.base,executionId:chunk.executionId,sequence:2,result:x.result('content')},x.owner);
 assert.equal((await x.c.progress(x.f.repo,'review-1',1)).completedChunks,1);
 x.abort.abort();for(let i=0;i<100;i++){if((await x.c.progress(x.f.repo,'review-1',1)).status==='interrupted')break;await pause(5);}
});
test('controller disconnect preserves accepted chunks and never reassigns interrupted work',async t=>{
 const x=setup(t);await x.start();let a=await assignment(x.c,x.f,x.owner);
 await x.c.exchange({phase:'plan',...x.base,executionId:a.executionId,sequence:1,plan:x.plan},x.owner);
 a=await assignment(x.c,x.f,x.owner);await x.c.exchange({phase:'result',...x.base,executionId:a.executionId,sequence:1,result:x.result('content')},x.owner);
 await assignment(x.c,x.f,x.owner);x.abort.abort();
 for(let i=0;i<100;i++){if((await x.c.progress(x.f.repo,'review-1',1)).status==='interrupted')break;await pause(5);}
 const view=await x.c.progress(x.f.repo,'review-1',1);assert.equal(view.status,'interrupted');assert.equal(view.completedChunks,1);assert.equal(view.failure?.code,'controller_disconnected');
 assert.equal((await x.c.start({phase:'start',...x.base,artifactPath:x.f.json},{owner:{id:'another',signal:new AbortController().signal}})).status,'interrupted');
 await assert.rejects(x.c.exchange({phase:'assignment',...x.base},{id:'another',signal:new AbortController().signal}),/reviewing connection/);
});
test('controller results use the common schema and produce deterministic complete counts',async t=>{
 const x=setup(t);await x.start();let a=await assignment(x.c,x.f,x.owner);
 await x.c.exchange({phase:'plan',...x.base,executionId:a.executionId,sequence:1,plan:x.plan},x.owner);
 for(const id of ['content','final']){a=await assignment(x.c,x.f,x.owner);assert.equal(a.chunkId,id);assert.equal(Object.hasOwn((a.schema as {properties:object}).properties,'findingDecisions'),false);assert.deepEqual(JSON.parse(a.prompt.split('Output schema (structural reference):\n')[1]!),JSON.parse(JSON.stringify(a.schema)));const result=x.result(id);
  if(id==='content')Object.assign(result,{status:'changes_requested',findings:[{id:'med1',severity:'MED',location:'/body/summary',message:'Required contract is inconsistent',evidenceReferences:[x.f.md]}]});
  await x.c.exchange({phase:'result',...x.base,executionId:a.executionId,sequence:1,result},x.owner);
 }
 for(let i=0;i<100;i++){if((await x.c.progress(x.f.repo,'review-1',1)).report)break;await pause(5);}
 const view=await x.c.progress(x.f.repo,'review-1',1);assert.equal(view.status,'changes_requested');assert.deepEqual(view.report?.counts,{HIGH:0,MED:1,LOW:0});assert.equal(view.completedChunks,2);x.abort.abort();
});

test('failed controller activity persistence fences a concurrently submitted valid plan',async t=>{
 const f=designFixture(t,'daemon'),abort=new AbortController(),owner={id:'trusted-owner',signal:abort.signal};
 let entered!:()=>void,release!:()=>void;const saving=new Promise<void>(r=>entered=r),blocked=new Promise<void>(r=>release=r);
 const c=new DesignReviewCoordinator({save:async(project,cp)=>{
  if(cp.attempts[0]!.current?.sequence===1){entered();await blocked;throw new Error('activity disk failure');}
  await saveDesignCheckpoint(project,cp);
 }}),base={repo:f.repo,reviewId:'review-1',attempt:1};
 await c.start({phase:'start',...base,artifactPath:f.json},{owner});const a=await assignment(c,f,owner);
 const activity=c.exchange({phase:'activity',...base,executionId:a.executionId,sequence:1,event:{sessionId:'session',sequence:1,kind:'session_started'}},owner);void activity.catch(()=>{});await saving;
 const plan={chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All units',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};
 const submission=c.exchange({phase:'plan',...base,executionId:a.executionId,sequence:2,plan},owner);void submission.catch(()=>{});await pause(10);release();
 await assert.rejects(activity,/activity disk failure/);await assert.rejects(submission,/activity disk failure/);
 for(let i=0;i<100;i++){if((await c.progress(f.repo,'review-1',1)).status==='failed')break;await pause(5);}
 const view=await c.progress(f.repo,'review-1',1);assert.equal(view.status,'failed');assert.equal(view.totalChunks,0);assert.equal(view.completedChunks,0);assert.equal(view.failure?.code,'persistence_failed');assert.equal(abort.signal.aborted,false);abort.abort();
});

test('observed controller subject changes invalidate every exchange boundary and cannot be restored into acceptance',async t=>{
 for(const phase of ['assignment','activity','plan','result'] as const){
  const x=setup(t);await x.start();let a=await assignment(x.c,x.f,x.owner);
  if(phase==='result'){
   await x.c.exchange({phase:'plan',...x.base,executionId:a.executionId,sequence:1,plan:x.plan},x.owner);
   a=await assignment(x.c,x.f,x.owner);
  }
  const original=readFileSync(x.f.md,'utf8');appendFileSync(x.f.md,'\nChanged during review');
  const request=phase==='assignment'?{phase,...x.base}:phase==='activity'?{phase,...x.base,executionId:a.executionId,sequence:1,event:{sessionId:'session',sequence:1,kind:'session_started'}}:phase==='plan'?{phase,...x.base,executionId:a.executionId,sequence:1,plan:x.plan}:{phase,...x.base,executionId:a.executionId,sequence:1,result:x.result('content')};
  // The asynchronous subject monitor may already have retired the owner before this boundary executes.
  await assert.rejects(x.c.exchange(request,x.owner),(error:unknown)=>!!error&&typeof error==='object'&&'code' in error&&['artifact_changed','wrong_owner'].includes(String(error.code)));
  writeFileSync(x.f.md,original);await assert.rejects(x.c.exchange(request,x.owner));
  for(let i=0;i<100;i++){if((await x.c.progress(x.f.repo,'review-1',1)).status==='invalidated')break;await pause(5);}
  const view=await x.c.progress(x.f.repo,'review-1',1);assert.equal(view.status,'invalidated',phase);assert.equal(view.requiresUserInput,true);assert.equal(view.completedChunks,0);assert.equal(view.failure?.code,'artifact_changed');x.abort.abort();
 }
});
