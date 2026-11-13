import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, appendFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { DesignReviewCoordinator } from '../coordinator.js';
import { loadDesignCheckpoint, saveDesignCheckpoint } from '../checkpoint.js';
import { consolidateDesignReview } from '../results.js';
import { DesignProgressTracker } from '../progress.js';
import { designFixture } from './fixtures.js';
import type { DesignReviewCheckpoint, DesignReviewStatus } from '../contracts.js';

function completed(f:ReturnType<typeof designFixture>,status:'passed'|'changes_requested'|'incomplete'='passed') {
 const cp=structuredClone(f.checkpoint),a=cp.attempts[0]!;
 a.plan={chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(x=>x.id),concerns:['correctness'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All units',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(x=>({unitId:x.id,chunkIds:['content']}))};
 a.completedChunks=a.plan.chunks.map(c=>({chunkId:c.id,status,summary:'Deterministic accepted feedback',findings:status==='changes_requested'?[{id:'f-'+c.id,severity:'MED',location:'/body/summary',message:'Correct design',evidenceReferences:[f.md]}]:[],inspectedReferences:[f.md,f.path],limitations:status==='incomplete'?['Required evidence unavailable']:[],advice:[]}));
 a.status=status;a.report=consolidateDesignReview(cp.reviewId,1,cp.subject,a.baseline.contentIdentity,a.plan,a.completedChunks);
 return cp;
}
const request=(f:ReturnType<typeof designFixture>,attempt=2)=>({phase:'start',repo:f.repo,reviewId:'review-1',attempt,artifactPath:f.json});
async function stopped(c:DesignReviewCoordinator,f:ReturnType<typeof designFixture>,attempt=2){for(let i=0;i<200;i++){const v=await c.progress(f.repo,'review-1',attempt);if(!['pending','running'].includes(v.status))return;await pause(5);}throw Error('Controller did not stop');}

test('sequential admission and replay preserve immutable initial submission and complete prior attempts',async t=>{
 for(const status of ['passed','changes_requested','incomplete'] as const){
  const f=designFixture(t,'daemon'),cp=completed(f,status);await saveDesignCheckpoint(f.repo,cp);
  appendFileSync(f.md,'\nCorrected design');
  const ownerAbort=new AbortController(),owner={id:'controller',signal:ownerAbort.signal};
  const c=new DesignReviewCoordinator();
  const ack=await c.start(request(f),{owner});assert.equal(ack.attempt,2);
  const admitted=await loadDesignCheckpoint(f.repo,'review-1');assert.equal(admitted!.submitted.attempt,1);assert.equal(admitted!.attempts[1]!.preparationKind,'impact');assert.deepEqual(admitted!.attempts[0],cp.attempts[0]);
  assert.notEqual(admitted!.attempts[1]!.baseline.contentIdentity,cp.attempts[0]!.baseline.contentIdentity);
  assert.equal((await c.start(request(f,1))).status,status);assert.equal((await c.start(request(f))).attempt,2);
  await assert.rejects(c.start(request(f,3)),/active review/);
  ownerAbort.abort();await stopped(c,f);
 }
});

test('correction admission rejects unfinished statuses, skipped ordinals, missing reports and failed saves',async t=>{
 for(const status of ['pending','running','interrupted','paused','failed','invalidated'] satisfies DesignReviewStatus[]){
  const f=designFixture(t),cp=completed(f);cp.attempts[0]!.status=status;delete cp.attempts[0]!.report;await saveDesignCheckpoint(f.repo,cp);
  const c=new DesignReviewCoordinator();await assert.rejects(c.start(request(f)),/complete terminal report/);assert.equal((await loadDesignCheckpoint(f.repo,'review-1'))!.attempts.length,1);
 }
 const f=designFixture(t,'daemon'),cp=completed(f);await saveDesignCheckpoint(f.repo,cp);
 const c=new DesignReviewCoordinator();await assert.rejects(c.start(request(f,3)),/sequential/);await assert.rejects(c.start({...request(f),artifactPath:f.md}),/immutable submission/);
 const abort=new AbortController();let saves=0;
 const failing=new DesignReviewCoordinator({save:async()=>{saves++;throw Error('Injected admission disk failure');}});
 await assert.rejects(failing.start(request(f),{owner:{id:'controller',signal:abort.signal}}),/disk failure/);assert.equal(saves,1);assert.deepEqual(await loadDesignCheckpoint(f.repo,'review-1'),cp);
 const empty=designFixture(t);await assert.rejects(c.start(request(empty)),/Initial review requires attempt 1/);
});

test('checkpoint evolution freezes preparation and prior prefixes and rejects partial plan-impact pairs',async t=>{
 const f=designFixture(t),cp=completed(f);await saveDesignCheckpoint(f.repo,cp);
 const next=structuredClone(cp),tracker=new DesignProgressTracker(f.path);
 next.attempts.push({number:2,status:'pending',preparationKind:'impact',baseline:cp.attempts[0]!.baseline,inventory:cp.attempts[0]!.inventory,completedChunks:[],progress:tracker.snapshot(),startedAt:new Date().toISOString()});
 await saveDesignCheckpoint(f.repo,next);const bytes=readFileSync(f.path,'utf8');
 for(const mutate of [(x:DesignReviewCheckpoint)=>{x.attempts[0]!.status='failed';},(x:DesignReviewCheckpoint)=>{x.attempts[1]!.preparationKind='planning';},(x:DesignReviewCheckpoint)=>{delete x.attempts[1]!.preparationKind;},(x:DesignReviewCheckpoint)=>{x.attempts[1]!.plan=cp.attempts[0]!.plan!;}]){
  const bad=structuredClone(next);mutate(bad);await assert.rejects(saveDesignCheckpoint(f.repo,bad));assert.equal(readFileSync(f.path,'utf8'),bytes);
 }
 const wrong=designFixture(t),withoutReport=completed(wrong);delete withoutReport.attempts[0]!.report;await saveDesignCheckpoint(wrong.repo,withoutReport);
 const added=structuredClone(withoutReport);added.attempts.push({...next.attempts[1]!,progress:new DesignProgressTracker(wrong.path).snapshot()});await assert.rejects(saveDesignCheckpoint(wrong.repo,added),/terminal correction/);
});
