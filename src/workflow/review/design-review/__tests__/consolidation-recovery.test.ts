import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import { appendFileSync } from 'node:fs';
import { DesignReviewCoordinator } from '../coordinator.js';
import { saveDesignCheckpoint, loadDesignCheckpoint } from '../checkpoint.js';
import { impactFixture } from './impact-fixtures.js';
import { consolidateDesignReview } from '../results.js';
import { designFindingKey } from '../provenance.js';
import type { DesignReviewCheckpoint } from '../contracts.js';

async function fixture(t:Parameters<typeof impactFixture>[0],partial=false){
 const f=impactFixture(t);f.current.plan=f.plan;f.current.impact=f.impact;
 f.current.completedChunks=[structuredClone(f.baseline.completedChunks[1]!),structuredClone(f.baseline.completedChunks[2]!)];
 if(partial){
  const finding={id:'previous-defect',severity:'MED' as const,location:'/body/summary',message:'Old defect',evidenceReferences:[f.md]};
  f.baseline.completedChunks[1]!.findings=[finding];
  f.baseline.completedChunks[0]!.findings=[{...finding,id:'unresolved',severity:'HIGH'}];
  f.baseline.status='changes_requested';f.baseline.report=consolidateDesignReview('review-1',1,f.prepared.subject,f.baseline.baseline.contentIdentity,f.baseline.plan!,f.baseline.completedChunks);
  const source={attempt:1,chunkId:'edit',findingId:'previous-defect'},omitted={attempt:1,chunkId:'keep',findingId:'unresolved'};
  f.impact.carriedFindingIds=[designFindingKey(omitted),designFindingKey(source)];
  const final=f.current.completedChunks[1]!;final.status='incomplete';final.limitations=[`Required finding reconciliation not reported: ${designFindingKey(omitted)}`];
  final.findingDecisions=[{source,action:'resolved',rationale:'Fresh final inspection',evidenceReferences:[f.md],reviewedInChunkIds:['final']}];
 }
 f.current.status='failed';f.current.failure={code:'invalid_result',summary:'Resolution requires accepted fresh inspection without mandatory gaps'};
 const checkpoint:DesignReviewCheckpoint={...f.checkpoint,attempts:[f.baseline,f.current]};
 await saveDesignCheckpoint(f.repo,checkpoint);return{...f,checkpoint};
}
const request=(f:Awaited<ReturnType<typeof fixture>>)=>({phase:'recover',repo:f.repo,reviewId:'review-1',attempt:2,actionId:'approved-reconsolidation',operation:'resume',userDecision:{action:'retry_failed_unit',reason:'User approved recovery',recordedAt:new Date().toISOString()}});

test('failed consolidation recovers durable accepted chunks without provider calls and remains replay safe',async t=>{
 const f=await fixture(t,true);const before=structuredClone(f.current.completedChunks);
 const c=new DesignReviewCoordinator({provider:()=>{throw new Error('No model call is allowed');}});
 await assert.rejects(c.recover({...request(f),userDecision:undefined}),/user direction/);
 const approved=request(f);await c.recover(approved);
 for(let i=0;i<1000;i++){const p=await c.progress(f.repo,'review-1',2);if(!['running','pending'].includes(p.status))break;await pause(2);}
 const cp=(await loadDesignCheckpoint(f.repo,'review-1'))!;
 assert.equal(cp.attempts[1]!.status,'incomplete');assert.equal(cp.attempts[1]!.report!.counts.HIGH,1);assert.equal(cp.attempts[1]!.report!.counts.MED,0);assert.equal(cp.attempts[1]!.actions!.at(-1)!.outcome!.code,'completed');assert.deepEqual(cp.attempts[1]!.completedChunks,before);assert.deepEqual(cp.attempts[0],f.baseline);
 assert.equal((await c.recover(approved)).status,'incomplete');
});

test('failed consolidation recovery refuses changed subjects unrelated failures and missing accepted work',async t=>{
 for(const mode of ['changed','unrelated','unfinished'] as const){
  const f=await fixture(t);
  if(mode==='changed')appendFileSync(f.md,'\nChanged artifact');
  else{const cp=structuredClone(f.checkpoint);if(mode==='unrelated')cp.attempts[1]!.failure!.code='persistence_failed';else cp.attempts[1]!.completedChunks.pop();
   // Create an independent stored fixture rather than rewrite immutable feedback.
   const c=new DesignReviewCoordinator({load:async()=>cp});
   await assert.rejects(c.recover(request(f)),/not resumable/);continue;
  }
  const c=new DesignReviewCoordinator({});await assert.rejects(c.recover(request(f)),/changed/i);
 }
});
