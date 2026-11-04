import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { DesignReviewCoordinator } from '../coordinator.js';
import { loadDesignCheckpoint, saveDesignCheckpoint } from '../checkpoint.js';
import { impactFixture } from './impact-fixtures.js';
import type { LLMProvider, ActivityReviewSessionOpts } from '../../../../shared/types.js';
import type { DesignUnitAssignment } from '../contracts.js';

const input=(f:ReturnType<typeof impactFixture>)=>({phase:'start',repo:f.repo,reviewId:'review-1',attempt:2,artifactPath:f.json});
async function settled(c:DesignReviewCoordinator,f:ReturnType<typeof impactFixture>){for(let i=0;i<500;i++){const v=await c.progress(f.repo,'review-1',2);if(!['pending','running'].includes(v.status))return v;await pause(5);}throw Error('Did not settle');}
const feedback=(f:ReturnType<typeof impactFixture>,id:string)=>({...structuredClone(f.baseline.completedChunks.find(c=>c.chunkId===id)!),inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path]});
async function seed(f:ReturnType<typeof impactFixture>){f.checkpoint.attempts=[f.baseline];await saveDesignCheckpoint(f.repo,f.checkpoint);appendFileSync(f.md,'\nCorrected concern');}

test('native impact persists one plan-selection pair and dispatches only selected chunks before mutation invalidation',async t=>{
 const f=impactFixture(t);await seed(f);const calls:string[]=[];
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{
  const chunk=prompt.match(/Chunk assignment: (.+)\n/)?.[1],id=chunk?JSON.parse(chunk).id:'impact';calls.push(id);
  await opts.onActivity({sessionId:'session-'+calls.length,sequence:1,kind:'session_started'});await opts.onActivity({sessionId:'session-'+calls.length,sequence:2,kind:'model_output'});
  if(id==='final'){
   const saved=await loadDesignCheckpoint(f.repo,'review-1');assert.deepEqual(saved!.attempts[1]!.impact,f.impact);assert.equal(saved!.attempts[1]!.completedChunks.length,1);
   appendFileSync(f.md,'\nMutation during final inspection');
   await new Promise<void>((_,reject)=>{if(opts.signal.aborted)reject(opts.signal.reason);else opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true});});
  }
  const value=chunk?feedback(f,id):{plan:f.plan,impact:f.impact};await opts.onCandidate(value);return value;
 }} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fake-cli (fixture)'}),subjectMonitor:{pollMs:5}});await c.start(input(f));
 assert.equal((await settled(c,f)).status,'invalidated');assert.deepEqual(calls,['impact','edit','final']);
 const cp=await loadDesignCheckpoint(f.repo,'review-1');assert.deepEqual(cp!.attempts[0],f.baseline);assert.equal(cp!.attempts[1]!.unitSummaries![0]!.phase,'impact');
});

test('controller impact uses the same schema and validator with fenced exchange and durable exact replay',async t=>{
 const f=impactFixture(t,'daemon');await seed(f);const abort=new AbortController(),owner={id:'trusted',signal:abort.signal};
 const c=new DesignReviewCoordinator({provider:()=>{throw Error('Controller cannot construct provider');}});await c.start(input(f),{owner});
 async function assignment(){for(let i=0;i<200;i++){const v=await c.exchange({phase:'assignment',repo:f.repo,reviewId:'review-1',attempt:2},owner) as {assignment:DesignUnitAssignment|null};if(v.assignment)return v.assignment;await pause(5);}throw Error('No assignment');}
 const a=await assignment();assert.equal(a.kind,'impact');assert.match(a.prompt,/indirect effects/);assert.ok(!a.prompt.includes('The feature works'));
 const req={...input(f),phase:'impact',executionId:a.executionId,sequence:1,plan:f.plan,impact:f.impact};delete (req as Partial<typeof req>).artifactPath;
 await assert.rejects(c.exchange(req,{id:'other',signal:new AbortController().signal}),/reviewing connection/);
 await assert.rejects(c.exchange({...req,executionId:'stale'},owner),/generation/);
 await assert.rejects(c.exchange({...req,phase:'plan',impact:undefined},owner),/match assignment/);
 assert.deepEqual(await c.exchange(req,owner),{accepted:true});assert.deepEqual(await c.exchange(req,owner),{accepted:true});
 const chunk=await assignment();assert.equal(chunk.chunkId,'edit');
 await c.exchange({phase:'result',repo:f.repo,reviewId:'review-1',attempt:2,executionId:chunk.executionId,sequence:1,result:feedback(f,'edit')},owner);
 assert.equal((await assignment()).chunkId,'final');abort.abort();assert.equal((await settled(c,f)).status,'interrupted');
 const cp=await loadDesignCheckpoint(f.repo,'review-1');assert.deepEqual(cp!.attempts[1]!.plan,f.plan);assert.deepEqual(cp!.attempts[1]!.impact,f.impact);assert.deepEqual(cp!.attempts[1]!.completedChunks.map(x=>x.chunkId),['edit']);
});

test('impact acceptance save failure preserves prior bytes and dispatches no selected chunk',async t=>{
 const f=impactFixture(t);await seed(f);let calls=0;
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(_p:string,_s:unknown,opts:ActivityReviewSessionOpts)=>{calls++;const value={plan:f.plan,impact:f.impact};await opts.onCandidate(value);return value;}} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fake (fixture)'}),save:async(repo,cp)=>{if(cp.attempts[1]?.plan)throw Error('Injected atomic pair save failure');await saveDesignCheckpoint(repo,cp);}});
 await c.start(input(f));assert.equal((await settled(c,f)).status,'failed');assert.equal(calls,1);
 const cp=await loadDesignCheckpoint(f.repo,'review-1');assert.deepEqual(cp!.attempts[0],f.baseline);assert.equal(cp!.attempts[1]!.plan,undefined);assert.equal(cp!.attempts[1]!.impact,undefined);
});
