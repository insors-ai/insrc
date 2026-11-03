import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import type { LLMProvider } from '../../../../shared/types.js';
import type { DesignChunkPlan, DesignUnitAssignment } from '../contracts.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import type { DesignControllerOwner } from '../coordinator.js';
import { saveDesignCheckpoint, loadDesignCheckpoint } from '../checkpoint.js';
import { designFixture } from './fixtures.js';

type Fixture=ReturnType<typeof designFixture>;
const base=(f:Fixture,attempt=1)=>({repo:f.repo,reviewId:'review-1',attempt});
const recover=(f:Fixture,actionId='resume-1')=>({phase:'recover',...base(f),actionId,operation:'resume'});
function plan(f:Fixture):DesignChunkPlan{return{chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Coherent content then consistency',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};}
const result=(f:Fixture,id:string)=>({chunkId:id,status:'passed' as const,summary:'Deterministic recovery fixture',findings:[],inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:[],advice:[]});
async function terminal(c:DesignReviewCoordinator,f:Fixture,attempt=1){for(let i=0;i<1000;i++){const v=await c.progress(f.repo,'review-1',attempt);if(!['pending','running'].includes(v.status))return v;await pause(2);}throw new Error('Fixture review did not settle');}
async function assignment(c:DesignReviewCoordinator,f:Fixture,owner:DesignControllerOwner,attempt=1){for(let i=0;i<1000;i++){const v=await c.exchange({phase:'assignment',...base(f,attempt)},owner) as {assignment:DesignUnitAssignment|null};if(v.assignment)return v.assignment;await pause(2);}throw new Error('No fixture assignment');}

test('explicit native recovery preserves accepted prefixes and durable replay reserves only unfinished work',async t=>{
 const f=designFixture(t),a=f.checkpoint.attempts[0]!;a.plan=plan(f);a.completedChunks=[result(f,'content')];a.status='running';
 a.current={kind:'chunk',chunkId:'final',executionId:'old-execution',sequence:0,issuedAt:a.startedAt};
 a.unit={unitId:'final',phase:'chunk_review',executionId:'old-execution',dispatches:1,retriesUsed:0,userDirectedDispatches:0,diagnostics:[]};
 const reference=join(f.repo,'external-HLD.md');writeFileSync(reference,'Original external reference');f.checkpoint.subject.workflow.availableReferences.push({role:'context',path:reference});
 await saveDesignCheckpoint(f.repo,f.checkpoint);writeFileSync(reference,'External edit must be ignored');
 const accepted=JSON.stringify(a.completedChunks),calls:string[]=[];
 let release!:()=>void;const barrier=new Promise<void>(r=>release=r);t.after(()=>release());
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string)=>{const match=prompt.match(/Chunk assignment: (.+)\n/);assert.ok(match);const chunk=JSON.parse(match[1]!).id as string;calls.push(chunk);await barrier;return result(f,chunk);}} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'}),prepare:()=>{throw new Error('Resume must not re-resolve external context');}});
 assert.equal((await c.start({phase:'start',...base(f),artifactPath:f.json})).status,'interrupted');assert.equal(calls.length,0);
 const ack=await c.recover(recover(f));assert.equal(ack.attempt,1);assert.equal(calls.length,0);
 const reserved=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!;
 assert.equal(reserved.unit!.dispatches,2);assert.notEqual(reserved.current!.executionId,'old-execution');
 assert.equal((await c.recover(recover(f))).attempt,1);
 await assert.rejects(c.recover({...recover(f),operation:'restart_full',userDecision:{action:'restart_full',reason:'Different replay',recordedAt:a.startedAt}}),/Conflicting/);
 release();
 assert.equal((await terminal(c,f)).status,'passed');assert.deepEqual(calls,['final']);
 const saved=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!;
 assert.equal(JSON.stringify(saved.completedChunks.slice(0,1)),accepted);assert.deepEqual(saved.plan,a.plan);
 assert.equal(saved.actions!.length,1);assert.deepEqual(saved.unitSummaries![0]!.actionIds,['resume-1']);
});

test('report-only recovery rebuilds the checkpoint report with zero provider construction or calls',async t=>{
 const f=designFixture(t),a=f.checkpoint.attempts[0]!;a.plan=plan(f);a.completedChunks=[result(f,'content'),result(f,'final')];a.status='running';
 await saveDesignCheckpoint(f.repo,f.checkpoint);
 const c=new DesignReviewCoordinator({provider:()=>{throw new Error('No provider needed');}});
 await c.recover(recover(f));const done=await terminal(c,f);assert.equal(done.status,'passed');assert.equal(done.completedChunks,2);assert.equal(done.report?.status,'passed');
 assert.equal((await c.recover(recover(f))).status,'passed');
});

test('controller recovery rebinds only after disconnect and rejects stale generations without repeating completed chunks',async t=>{
 const f=designFixture(t,'daemon'),abort=new AbortController(),owner={id:'old-owner',signal:abort.signal},c=new DesignReviewCoordinator();
 await c.start({phase:'start',...base(f),artifactPath:f.json},{owner});let unit=await assignment(c,f,owner);
 await c.exchange({phase:'plan',...base(f),executionId:unit.executionId,sequence:1,plan:plan(f)},owner);
 unit=await assignment(c,f,owner);await c.exchange({phase:'result',...base(f),executionId:unit.executionId,sequence:1,result:result(f,'content')},owner);
 const unfinished=await assignment(c,f,owner);await assert.rejects(c.recover(recover(f),{owner}),/active execution/);
 abort.abort();assert.equal((await terminal(c,f)).status,'interrupted');await pause(5);
 const replacementAbort=new AbortController(),replacement={id:'replacement',signal:replacementAbort.signal},restarted=new DesignReviewCoordinator();
 await assert.rejects(restarted.recover(recover(f)),/trusted reviewer/);
 await restarted.recover(recover(f),{owner:replacement});unit=await assignment(restarted,f,replacement);
 assert.equal(unit.chunkId,'final');assert.notEqual(unit.executionId,unfinished.executionId);
 await assert.rejects(restarted.exchange({phase:'assignment',...base(f)},{id:'observer',signal:new AbortController().signal}),/reviewing connection/);
 await assert.rejects(restarted.exchange({phase:'result',...base(f),executionId:unfinished.executionId,sequence:1,result:result(f,'final')},replacement),/generation/);
 await restarted.exchange({phase:'result',...base(f),executionId:unit.executionId,sequence:1,result:result(f,'final')},replacement);
 assert.equal((await terminal(restarted,f)).status,'passed');replacementAbort.abort();
});

test('changed subject recovery latches invalidation and approved full restart refreshes party without reusing old work',async t=>{
 const f=designFixture(t),a=f.checkpoint.attempts[0]!;a.status='running';await saveDesignCheckpoint(f.repo,f.checkpoint);
 const original=readFileSync(f.md,'utf8');appendFileSync(f.md,'\nChanged subject');const c=new DesignReviewCoordinator();
 await assert.rejects(c.recover(recover(f)),/changed/);assert.equal((await c.progress(f.repo,'review-1',1)).status,'invalidated');
 writeFileSync(f.md,original);await assert.rejects(c.recover(recover(f)),/not resumable/);
 const restart={...recover(f,'restart-1'),operation:'restart_full',userDecision:{action:'restart_full',reason:'User approved full restart',recordedAt:a.startedAt}};
 await assert.rejects(c.recover({...restart,userDecision:undefined}),/restart decision/);
 const json=JSON.parse(readFileSync(f.json,'utf8'));json.meta.authoredBy='daemon';writeFileSync(f.json,JSON.stringify(json));
 await assert.rejects(c.recover(restart),/trusted reviewer/);
 const abort=new AbortController(),owner={id:'new-controller',signal:abort.signal};
 const ack=await c.recover(restart,{owner});assert.equal(ack.attempt,2);assert.equal(ack.reviewer,'controller');
 assert.equal((await c.recover(restart,{owner})).attempt,2);
 const cp=(await loadDesignCheckpoint(f.repo,'review-1'))!;assert.equal(cp.attempts.length,2);assert.equal(cp.attempts[1]!.plan,undefined);assert.deepEqual(cp.attempts[1]!.completedChunks,[]);
 assert.deepEqual(cp.attempts[0]!.baseline,a.baseline);assert.equal(cp.attempts[0]!.reviewer,'daemon');assert.equal((await c.progress(f.repo,'review-1',1)).status,'invalidated');
 await assignment(c,f,owner,2);abort.abort();await terminal(c,f,2);
});

test('recovery refuses missing checkpoints stale attempts and unavailable publication without invoking a provider',async t=>{
 const f=designFixture(t),c=new DesignReviewCoordinator({provider:()=>{throw new Error('Must not construct provider');}});
 await assert.rejects(c.recover(recover(f)),/not found/);await saveDesignCheckpoint(f.repo,f.checkpoint);
 await assert.rejects(c.recover({...recover(f),attempt:2}),/current attempt/);
 await assert.rejects(c.recover({...recover(f),operation:'retry_publication'}),/S4/);
});
