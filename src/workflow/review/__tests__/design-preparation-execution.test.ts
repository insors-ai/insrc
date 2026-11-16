import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { join } from 'node:path';
import type { ActivityReviewSessionOpts, LLMProvider } from '../../../shared/types.js';
import { designFixture } from '../design-review/__tests__/fixtures.js';
import { DesignPreparation } from '../design-preparation.js';
import { DesignReviewCoordinator } from '../design-review/coordinator.js';
import { DesignReviewWorker } from '../design-review/worker-admission.js';
import { persistReviewWorkerAdmission } from '../../../daemon/threads/review-worker-admission.js';
import type { ReviewBootstrapInput } from '../../../daemon/threads/review-worker-contract.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { preparationDigest } from '../prepared-context.js';
import { PreparedViewReader } from '../prepared-views.js';
import { ReviewMemoryBudget } from '../preparation-memory.js';

async function terminal(c: DesignReviewCoordinator, repo: string, attempt = 1) {
 for (let i=0;i<1000;i++) { const view=await c.progress(repo,'review-1',attempt); if (!['pending','running'].includes(view.status)) return view; await pause(5); }
 throw new Error('Design fixture did not finish');
}
function provider(f: ReturnType<typeof designFixture>, before?: (stage: string) => void) {
 const calls: string[]=[];
 const value={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{
  assert.ok(prompt.includes(f.md)); assert.ok(!prompt.includes('The feature works'), 'artifact content stays behind document links');
  const match=prompt.match(/Chunk assignment: (.+)\n/),chunk=match?JSON.parse(match[1]!):undefined,stage=chunk?.id??'planning'; calls.push(stage); before?.(stage);
  const selectors=f.prepared.inventory.units.map(u=>u.id);
  const output=chunk?{chunkId:chunk.id,status:'passed',summary:'Deterministic shared preparation fixture',findings:[],inspectedReferences:[...selectors,f.md,f.path],limitations:[],advice:[]}:
   {chunks:[{id:'content',title:'Contract',selectors,concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Full scope',finalConsistencyChunkId:'final',coverage:selectors.map(unitId=>({unitId,chunkIds:['content']}))};
  await opts.onCandidate(output); return output;
 }} as unknown as LLMProvider;
 return {value,calls};
}

test('shared design preparation executes planning and chunks through coordinator and fresh worker admission',async t=>{
 for(const workerMode of [false,true]) await t.test(workerMode?'worker':'coordinator',async t=>{
  const f=designFixture(t),limits=reviewPreparationLimits(join(f.repo,'missing-config.json')),capacity=new ReviewPreparationCapacity(limits.cacheMaxBytes);
  const key={project:f.repo,family:'design' as const,reviewId:'review-1'},preparation=new DesignPreparation(key,1,limits,capacity),native=provider(f);
  const deps={prepare:preparation.prepare,assertSubject:preparation.assertSubject,provider:()=>({provider:native.value,model:'deterministic fixture'})};
  const request={phase:'start',repo:f.repo,reviewId:'review-1',attempt:1,artifactPath:f.json};
  let coordinator:DesignReviewCoordinator;
  if(workerMode){
   const input:ReviewBootstrapInput={key,incarnation:'fixture',attempt:1,actionId:'start',reviewer:'daemon',subject:f.id,submitted:request};
   await persistReviewWorkerAdmission(input);const worker=new DesignReviewWorker(input,deps);coordinator=worker.coordinator;worker.execute();
   for(let i=0;i<1000&&worker.isPreparing();i++)await pause(5);
   // execute schedules preparation for the next turn; wait for its durable qualification.
   for(let i=0;i<1000;i++){try{if((await worker.progress()).phase!=='admission')break;}catch{}await pause(5);}
  }else{coordinator=new DesignReviewCoordinator(deps);await coordinator.start(request);}
  const done=await terminal(coordinator,f.repo);assert.equal(done.status,'passed');assert.equal(done.completedChunks,2);assert.deepEqual(native.calls,['planning','content','final']);
  const receipt=await preparation.seal(),reader=await PreparedViewReader.open(receipt,limits,new ReviewMemoryBudget(limits.memoryMaxBytes),async()=>{},async error=>{throw error;});
  assert.equal(preparationDigest(preparation.qualificationIdentity()), receipt.identityDigest);
  writeFileSync(join(f.repo,'unrelated.txt'),'External activity');
  const reused=await DesignPreparation.reuse(key,1,reader,limits,capacity);assert.deepEqual(reused.prepare(f.repo,f.json).inventory,f.prepared.inventory);
  appendFileSync(f.md,'\nChanged target');
  await assert.rejects(DesignPreparation.reuse(key,1,reader,limits,capacity),{code:'artifact_changed'});
  assert.equal(native.calls.length,3,'reuse and invalidation dispatch no model');preparation.close();reused.close();
 });
});

test('shared design target mutation invalidates execution and waits for explicit restart approval',async t=>{
 const f=designFixture(t),limits=reviewPreparationLimits(join(f.repo,'missing-config.json')),capacity=new ReviewPreparationCapacity(limits.cacheMaxBytes),key={project:f.repo,family:'design' as const,reviewId:'review-1'};
 let preparation=new DesignPreparation(key,1,limits,capacity),mutated=false;
 const native=provider(f,stage=>{if(stage==='content'&&!mutated){mutated=true;appendFileSync(f.md,'\nChanged target');}});
 const c=new DesignReviewCoordinator({prepare:(...args)=>preparation.prepare(...args),assertSubject:(...args)=>preparation.assertSubject(...args),provider:()=>({provider:native.value,model:'deterministic fixture'})});
 await c.start({phase:'start',repo:f.repo,reviewId:'review-1',attempt:1,artifactPath:f.json});
 const invalid=await terminal(c,f.repo);assert.equal(invalid.status,'invalidated');assert.equal(invalid.requiresUserInput,true);assert.equal(native.calls.length,2);
 for(let i=0;i<1000&&c.isActive(f.repo,'review-1');i++)await pause(5);
 assert.equal(c.isActive(f.repo,'review-1'),false);
 const request={phase:'recover',repo:f.repo,reviewId:'review-1',attempt:1,actionId:'restart',operation:'restart_full'};
 await assert.rejects(c.recover(request),/restart decision/);assert.equal(native.calls.length,2);
 preparation.close();preparation=new DesignPreparation(key,2,limits,capacity);
 const refreshed=preparation.prepare(f.repo,f.json);f.prepared.inventory=refreshed.inventory;
 await c.recover({...request,userDecision:{action:'restart_full',reason:'Fixture human authorization',recordedAt:new Date().toISOString()}});
 assert.equal((await terminal(c,f.repo,2)).status,'passed');assert.deepEqual(native.calls,['planning','content','planning','content','final']);preparation.close();
});


test('shared design context retains the submitted document locator and rejects foreign attempt reuse',async t=>{
 const f=designFixture(t),limits=reviewPreparationLimits(join(f.repo,'missing-config.json')),capacity=new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const key={project:f.repo,family:'design' as const,reviewId:'document-locator'};
 const preparation=new DesignPreparation(key,1,limits,capacity);
 preparation.prepare(f.repo,f.md);const receipt=await preparation.seal();
 assert.equal(receipt.inputDigest,preparationDigest({artifactPath:f.md,attempt:1}));
 const reader=await PreparedViewReader.open(receipt,limits,new ReviewMemoryBudget(limits.memoryMaxBytes),async()=>{},async error=>{throw error;});
 await assert.rejects(DesignPreparation.reuse(key,2,reader,limits,capacity),{code:'foreign_checkpoint'});
 await assert.rejects(DesignPreparation.reuse({...key,reviewId:'another-review'},1,reader,limits,capacity),{code:'foreign_checkpoint'});
 preparation.close();
});
