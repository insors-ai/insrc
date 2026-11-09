import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { DESIGN_LIMITS } from '../contracts.js';
import { saveDesignCheckpoint, loadDesignCheckpoint, designCheckpointPath, updateStoredDesignCheckpoint, loadStoredDesignCheckpoint } from '../checkpoint.js';
import { isDesignAdmission } from '../contracts.js';
import { DesignProgressTracker, observeDesignCheckpoint } from '../progress.js';
import { designFixture, admissionFixture } from './fixtures.js';

test('atomic checkpoint failure preserves the last accepted snapshot and cleans its own temporary file',async t=>{
 const f=designFixture(t);await saveDesignCheckpoint(f.repo,f.checkpoint);const before=await fs.readFile(f.path,'utf8');
 const rename=fs.rename;t.mock.method(fs,'rename',async (...args:Parameters<typeof fs.rename>)=>{if(args[1]===f.path)throw new Error('simulated rename failure');return rename(...args);});
 const next=structuredClone(f.checkpoint);next.attempts[0]!.status='running';
 await assert.rejects(saveDesignCheckpoint(f.repo,next),/simulated rename failure/);
 assert.equal(await fs.readFile(f.path,'utf8'),before);assert.deepEqual((await fs.readdir(join(f.repo,'.insrc/tmp/design-review'))),['review-1.json']);
 assert.equal((await fs.stat(f.path)).mode&0o777,0o600);
});
test('bounded no-follow checkpoint loading retains corrupt foreign and oversized state',async t=>{
 const f=designFixture(t);assert.equal(await loadDesignCheckpoint(f.repo,'review-1'),undefined);await saveDesignCheckpoint(f.repo,f.checkpoint);
 await fs.writeFile(f.path,'not JSON');await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'));assert.equal(await fs.readFile(f.path,'utf8'),'not JSON');
 await assert.rejects(saveDesignCheckpoint(f.repo,f.checkpoint));
 const foreign=structuredClone(f.checkpoint);foreign.project='/foreign';await fs.writeFile(f.path,JSON.stringify(foreign));await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'),/identity/);
 await fs.truncate(f.path,DESIGN_LIMITS.checkpointBytes+1);await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'),/bounded regular/);
 await fs.unlink(f.path);await fs.writeFile(join(f.repo,'outside.json'),'{}');await fs.symlink(join(f.repo,'outside.json'),f.path);await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'));
 assert.throws(()=>designCheckpointPath(f.repo,'../escape'));
});
test('progress pages expose one result without baseline and polling does not renew activity',t=>{
 const f=designFixture(t);let now=0;const tracker=new DesignProgressTracker(f.path,{now:()=>now,wall:()=>new Date(1762128000000+now).toISOString()});
 tracker.unit('chunk_review','chunk-1',0,2);tracker.activity({sessionId:'session',sequence:1,kind:'session_started'});
 now=20;tracker.activity({sessionId:'session',sequence:2,kind:'tool_started',toolId:'tool'});const active=tracker.snapshot();assert.equal(active.activeToolCount,1);const last=active.lastMeaningfulActivityAt;
 now=5000;assert.notEqual(tracker.snapshot().observedAt,active.observedAt);assert.equal(tracker.snapshot().sequence,active.sequence);assert.equal(tracker.activity({sessionId:'session',sequence:3,kind:'heartbeat'}),false);assert.equal(tracker.snapshot().lastMeaningfulActivityAt,last);
 tracker.activity({sessionId:'session',sequence:4,kind:'tool_completed',toolId:'tool'});assert.equal(tracker.snapshot().activeToolCount,0);
 const attempt=f.checkpoint.attempts[0]!;attempt.status='running';attempt.progress=tracker.snapshot();
 const units=f.prepared.inventory.units.map(u=>u.id);attempt.plan={chunks:[{id:'a',title:'Content',selectors:units,concerns:['Correctness'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['a'],purpose:'consistency'}],coverageExplanation:'All required units',finalConsistencyChunkId:'final',coverage:units.map(unitId=>({unitId,chunkIds:['a']}))};
 attempt.completedChunks=[{chunkId:'a',status:'passed',summary:'Assessed',findings:[],inspectedReferences:['/body/summary'],limitations:[],advice:[]}];
 const normal=observeDesignCheckpoint(f.checkpoint,{active:true,liveProgress:tracker.snapshot()});assert.deepEqual(normal.completedResults,[]);assert.ok(!JSON.stringify(normal).includes('reviewedContent'));
 const page=observeDesignCheckpoint(f.checkpoint,{includeResult:true});assert.equal(page.completedResults.length,1);assert.equal(page.nextCompletedChunk,1);assert.equal(page.status,'interrupted');
 assert.deepEqual(observeDesignCheckpoint(f.checkpoint,{includeResult:true,afterCompletedChunk:1}).completedResults,[]);
 assert.throws(()=>observeDesignCheckpoint(f.checkpoint,{afterCompletedChunk:2}));assert.equal(tracker.snapshot().lastMeaningfulActivityAt,attempt.progress.lastMeaningfulActivityAt);
});
test('accepted feedback cannot be rewritten and oversized stored results cannot bypass paging limits',async t=>{
 const f=designFixture(t);const attempt=f.checkpoint.attempts[0]!;
 attempt.completedChunks=[{chunkId:'a',status:'passed',summary:'Accepted',findings:[],inspectedReferences:['/body/summary'],limitations:[],advice:[]}];
 await saveDesignCheckpoint(f.repo,f.checkpoint);
 const changed=structuredClone(f.checkpoint);changed.attempts[0]!.completedChunks[0]!.summary='Replacement';
 await assert.rejects(saveDesignCheckpoint(f.repo,changed),/replace completed/);
 const oversized=structuredClone(f.checkpoint);oversized.attempts[0]!.completedChunks[0]!.advice=Array.from({length:200},()=>'x'.repeat(8192));
 await fs.writeFile(f.path,JSON.stringify(oversized));await assert.rejects(loadDesignCheckpoint(f.repo,'review-1'),/page limit/);
});

test('serialized resource and progress updates cannot lose open intents', async t => {
 const f = designFixture(t), cp = admissionFixture(f);
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, () => cp);
 let entered!: () => void, release!: () => void;
 const started = new Promise<void>(resolve => { entered = resolve; });
 const blocked = new Promise<void>(resolve => { release = resolve; });
 const lease = { operationId: 'op-1', workerIncarnation: 'worker-1', kind: 'git', openedAt: '2026-11-09T00:00:00.000Z' };
 const resources = updateStoredDesignCheckpoint(f.repo, cp.reviewId, async current => {
  assert.ok(current?.schemaVersion === 2); entered(); await blocked;
  current.attempts[0]!.resourceGuard = { daemonInstance: 'daemon-1', openLeases: [lease] }; return current;
 });
 await started;
 let progressRan = false;
 const progress = updateStoredDesignCheckpoint(f.repo, cp.reviewId, current => {
  assert.ok(current?.schemaVersion === 2); const a = current.attempts[0]!; assert.ok(isDesignAdmission(a));
  progressRan = true; assert.deepEqual(a.resourceGuard?.openLeases, [lease]); a.progress.sequence++; return current;
 });
 await Promise.resolve(); assert.equal(progressRan, false, 'mutation waits for the resource save');
 release(); await resources; await progress;
 const saved = await loadStoredDesignCheckpoint(f.repo, cp.reviewId); assert.ok(saved?.schemaVersion === 2);
 assert.deepEqual(saved.attempts[0]!.resourceGuard?.openLeases, [lease]); assert.equal(saved.attempts[0]!.progress.sequence, 1);
 const bytes = await fs.readFile(f.path, 'utf8');
 for (const replacement of [undefined, { daemonInstance: 'daemon-1', openLeases: [] }, { daemonInstance: 'daemon-2', openLeases: [lease] }]) {
  await assert.rejects(updateStoredDesignCheckpoint(f.repo, cp.reviewId, current => {
   assert.ok(current?.schemaVersion === 2);
   if (replacement) current.attempts[0]!.resourceGuard = replacement; else delete current.attempts[0]!.resourceGuard;
   return current;
  }), /unresolved native intent/);
  assert.equal(await fs.readFile(f.path, 'utf8'), bytes, 'failed mutation cannot close an unresolved lease');
 }
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, current => {
  assert.ok(current?.schemaVersion === 2); current.attempts[0]!.progress.sequence++; return current;
 });
 assert.equal((await loadStoredDesignCheckpoint(f.repo, cp.reviewId))!.attempts[0]!.progress.sequence, 2, 'failed updates do not poison the queue');
 // Qualified history uses the same writer and retains its original immutable
 // baseline, inventory and accepted feedback while resource metadata changes.
 const q = designFixture(t);
 await saveDesignCheckpoint(q.repo, q.checkpoint);
 await updateStoredDesignCheckpoint(q.repo, 'review-1', current => {
  assert.ok(current?.schemaVersion === 1);
  return { ...current, schemaVersion: 2, attempts: current.attempts.map(a => ({ ...a, resourceGuard: { daemonInstance: 'daemon-1', openLeases: [lease] } })) };
 });
 await updateStoredDesignCheckpoint(q.repo, 'review-1', current => {
  assert.ok(current?.schemaVersion === 2); const a = current.attempts[0]!; assert.ok(!isDesignAdmission(a));
  a.progress.sequence++; a.completedChunks.push({ chunkId: 'a', status: 'passed', summary: 'Accepted', findings: [], inspectedReferences: ['/body/summary'], limitations: [], advice: [] }); return current;
 });
 const qualified = await loadStoredDesignCheckpoint(q.repo, 'review-1');
 assert.deepEqual(qualified!.attempts[0]!.resourceGuard?.openLeases, [lease]);
 await assert.rejects(updateStoredDesignCheckpoint(q.repo, 'review-1', current => {
  assert.ok(current?.schemaVersion === 2); const a = current.attempts[0]!; assert.ok(!isDesignAdmission(a)); a.completedChunks[0]!.summary = 'Replacement'; return current;
 }), /replace completed/);
});
