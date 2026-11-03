import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import type { ActivityReviewSessionOpts, LLMProvider } from '../../../../shared/types.js';
import { ReviewOutputFailureError } from '../../../../shared/review-diagnostics.js';
import type { DesignChunkPlan, DesignUnitAssignment } from '../contracts.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import type { DesignControllerOwner } from '../coordinator.js';
import { loadDesignCheckpoint, saveDesignCheckpoint } from '../checkpoint.js';
import { designFixture } from './fixtures.js';

type Fixture=ReturnType<typeof designFixture>;
const base=(f:Fixture)=>({repo:f.repo,reviewId:'review-1',attempt:1});
function plan(f:Fixture):DesignChunkPlan{return{chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Complete coverage',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};}
const result=(f:Fixture,id:string)=>({chunkId:id,status:'passed',summary:'Retry fixture, not hosted evidence',findings:[],inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:[],advice:[]});
async function terminal(c:DesignReviewCoordinator,f:Fixture){for(let i=0;i<1000;i++){const v=await c.progress(f.repo,'review-1',1);if(!['pending','running'].includes(v.status))return v;await pause(2);}throw new Error('Retry fixture did not settle');}
async function assignment(c:DesignReviewCoordinator,f:Fixture,owner:DesignControllerOwner){for(let i=0;i<1000;i++){const v=await c.exchange({phase:'assignment',...base(f)},owner) as {assignment:DesignUnitAssignment|null};if(v.assignment)return v.assignment;await pause(2);}throw new Error('No retry assignment');}

test('native retries only the failed unit with pointed feedback and preserves substantive findings and prior summaries',async t=>{
 const f=designFixture(t),calls:string[]=[],prompts:string[]=[];let failures=0;
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{
  const match=prompt.match(/Chunk assignment: (.+)\n/),id=match?JSON.parse(match[1]!).id as string:'planning';calls.push(id);prompts.push(prompt);assert.equal(opts.internalRetry,false);
  if(id==='final'&&failures++<2)throw new ReviewOutputFailureError('Invalid structured feedback',{provider:'claude',issues:[{code:'MISSING_REQUIRED_FIELD',field:'/findings',correction:'Include findings array',occurrences:1}],lastRejectedFeedback:{preview:'RAW_TRANSCRIPT_CANARY',truncated:false}});
  if(id==='planning')return plan(f);
  const output=result(f,id);
  if(id==='content')Object.assign(output,{status:'changes_requested',findings:[{id:'real-med',severity:'MED',location:'/body/summary',message:'Design contradiction',evidenceReferences:[f.md]}]});
  await opts.onCandidate(output);return output;
 }} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'})});await c.start({phase:'start',...base(f),artifactPath:f.json});
 assert.equal((await terminal(c,f)).status,'changes_requested');assert.deepEqual(calls,['planning','content','final','final','final']);
 assert.match(prompts[3]!,/MISSING_REQUIRED_FIELD.*findings.*Include findings array/);assert.ok(!prompts.some(p=>p.includes('RAW_TRANSCRIPT_CANARY')));
 const a=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!;assert.equal(a.completedChunks[0]!.findings[0]!.id,'real-med');
 assert.deepEqual(a.unitSummaries!.map(s=>[s.unitId,s.automaticDispatches,s.retriesUsed]),[['planning',1,0],['content',1,0],['final',3,2]]);
 assert.equal(a.unitSummaries![2]!.diagnostics.length,2);
});

test('exhausted native retries pause and each approved recovery grants one execution without resetting the budget',async t=>{
 const f=designFixture(t);let calls=0,succeed=false;
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string)=>{calls++;if(!succeed)throw new Error('CLI failed');const m=prompt.match(/Chunk assignment: (.+)\n/);return m?result(f,JSON.parse(m[1]!).id as string):plan(f);}} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'})});await c.start({phase:'start',...base(f),artifactPath:f.json});
 assert.equal((await terminal(c,f)).status,'paused');assert.equal(calls,4);
 for(let i=0;i<3;i++)assert.equal((await c.progress(f.repo,'review-1',1)).requiresUserInput,true);assert.equal(calls,4);
 const request={phase:'recover',...base(f),operation:'resume',actionId:'extra-1'};
 await assert.rejects(c.recover(request),/user direction/);assert.equal(calls,4);
 const directed={...request,userDecision:{action:'retry_failed_unit',reason:'User approved one execution',recordedAt:'2026-11-03T00:00:00.000Z'}};
 await c.recover(directed);assert.equal((await terminal(c,f)).status,'paused');assert.equal(calls,5);
 let a=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!;assert.equal(a.unit!.dispatches,4);assert.equal(a.unit!.userDirectedDispatches,1);assert.equal(a.unit!.diagnostics.length,4);assert.equal(a.actions![0]!.outcome!.code,'process_failed');
 succeed=true;await c.recover({...directed,actionId:'extra-2'});assert.equal((await terminal(c,f)).status,'passed');assert.equal(calls,8);
 a=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!;assert.equal(a.unitSummaries![0]!.automaticDispatches,4);assert.equal(a.unitSummaries![0]!.userDirectedDispatches,2);
 assert.deepEqual(a.actions!.map(x=>x.outcome?.code),['process_failed','completed']);
});

test('controller technical failures use the same budget and invalid review output rotates generation without accepting it',async t=>{
 const f=designFixture(t,'daemon'),abort=new AbortController(),owner={id:'controller',signal:abort.signal},c=new DesignReviewCoordinator();t.after(()=>abort.abort());
 await c.start({phase:'start',...base(f),artifactPath:f.json},{owner});let a=await assignment(c,f,owner);
 const initial={phase:'failure',...base(f),executionId:a.executionId,sequence:1,failure:{code:'process_failed',summary:'CLI failed'}};
 await c.exchange(initial,owner);await c.exchange(initial,owner);a=await assignment(c,f,owner);assert.equal(a.retriesUsed,1);assert.equal(a.previousTechnicalFeedback?.summary,'CLI failed');
 await assert.rejects(c.exchange({phase:'plan',...base(f),executionId:a.executionId,sequence:1,plan:{...plan(f),coverage:[]}},owner));
 const replacement=await assignment(c,f,owner);assert.equal(replacement.executionId,a.executionId);assert.equal(replacement.retriesUsed,1); // malformed envelope is a request error, not a consumed review
 const invalid=plan(f);invalid.coverage[0]!.unitId='/unknown-unit';
 await assert.rejects(c.exchange({phase:'plan',...base(f),executionId:replacement.executionId,sequence:1,plan:invalid},owner),/coverage/);
 a=await assignment(c,f,owner);assert.equal(a.retriesUsed,2);
 await c.exchange({phase:'plan',...base(f),executionId:a.executionId,sequence:1,plan:plan(f)},owner);
 for(const id of ['content','final']){a=await assignment(c,f,owner);await c.exchange({phase:'result',...base(f),executionId:a.executionId,sequence:1,result:result(f,id)},owner);}
 assert.equal((await terminal(c,f)).status,'passed');
 const cp=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!;assert.equal(cp.unitSummaries![0]!.automaticDispatches,3);assert.equal(cp.unitSummaries![0]!.diagnostics.length,2);
});

test('four controller execution failures pause remaining work with no reassignment or automatic budget reset',async t=>{
 const f=designFixture(t,'daemon'),abort=new AbortController(),owner={id:'owner',signal:abort.signal},c=new DesignReviewCoordinator();t.after(()=>abort.abort());
 await c.start({phase:'start',...base(f),artifactPath:f.json},{owner});
 for(let i=0;i<4;i++){const a=await assignment(c,f,owner);assert.equal(a.retriesUsed,i);await c.exchange({phase:'failure',...base(f),executionId:a.executionId,sequence:1,failure:{code:'process_failed',summary:'CLI failed'}},owner);}
 const v=await terminal(c,f);assert.equal(v.status,'paused');assert.equal(v.completedChunks,0);assert.equal(v.recovery?.failedUnit?.retriesUsed,3);
 const a=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!;assert.equal(a.unit!.dispatches,4);assert.equal(a.unit!.diagnostics.length,4);
});

test('failed retry reservation stops execution and an orphan exhausted reservation cannot reset its budget',async t=>{
 const f=designFixture(t);let calls=0;
 const provider={capabilities:{reviewActivity:true},runReviewSession:async()=>{calls++;throw new Error('CLI failed');}} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'}),save:async(repo,cp)=>{if(cp.attempts[0]!.unit?.dispatches===2)throw new Error('Retry reservation disk failure');await saveDesignCheckpoint(repo,cp);}});
 await c.start({phase:'start',...base(f),artifactPath:f.json});assert.equal((await terminal(c,f)).status,'failed');assert.equal(calls,1);
 const orphan=designFixture(t),a=orphan.checkpoint.attempts[0]!;a.status='running';a.unit={unitId:'planning',phase:'planning',executionId:'lost-fourth',dispatches:4,retriesUsed:3,userDirectedDispatches:0,diagnostics:[]};
 await saveDesignCheckpoint(orphan.repo,orphan.checkpoint);const restored=new DesignReviewCoordinator({provider:()=>{throw new Error('No automatic dispatch');}});
 await assert.rejects(restored.recover({phase:'recover',...base(orphan),actionId:'resume-orphan',operation:'resume'}),/budget exhausted/);
 assert.equal((await restored.progress(orphan.repo,'review-1',1)).status,'paused');
});
