import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import { designFixture } from './fixtures.js';
import { impactFixture } from './impact-fixtures.js';
import { assertDesignDispatchCapacity, designDispatchCapacity, serializeDesignCheckpoint } from '../capacity.js';
import { saveDesignCheckpoint, loadDesignCheckpoint } from '../checkpoint.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import { DESIGN_LIMITS, DesignReviewError } from '../contracts.js';
import type { LLMProvider } from '../../../../shared/types.js';
import { consolidateDesignReview } from '../results.js';
import type { DesignChunkResult, DesignReviewCheckpoint } from '../contracts.js';
import type { ActivityReviewSessionOpts } from '../../../../shared/types.js';

function maximalResult(result: DesignChunkResult): DesignChunkResult {
 const r = structuredClone(result); r.status = 'incomplete'; r.limitations = [];
 while (Buffer.byteLength(JSON.stringify(r)) + DESIGN_LIMITS.text + 3 < DESIGN_LIMITS.resultBytes) r.limitations.push('x'.repeat(DESIGN_LIMITS.text));
 r.limitations.push('x'.repeat(DESIGN_LIMITS.resultBytes - Buffer.byteLength(JSON.stringify(r)) - (r.limitations.length ? 3 : 2)));
 assert.equal(Buffer.byteLength(JSON.stringify(r)), DESIGN_LIMITS.resultBytes);
 return r;
}

test('real checkpoint ceiling reserves maximum byte-valid feedback through consolidation and restart', async t => {
 const f = impactFixture(t); f.checkpoint.attempts = [f.baseline];
 f.baseline.completedChunks = f.baseline.completedChunks.map(maximalResult);
 f.baseline.status = 'incomplete';
 f.baseline.report = consolidateDesignReview('review-1',1,f.prepared.subject,f.baseline.baseline.contentIdentity,f.plan,f.baseline.completedChunks);
 // Historical baseline strings are deliberately synthetic capacity fixtures, never hosted evidence.
 const current = structuredClone(f.baseline); current.number = 5; current.status = 'pending';
 current.completedChunks = []; delete current.report;
 const history = Array.from({length:4},(_,i) => { const a = structuredClone(f.checkpoint.attempts[0]!); a.number=i+1; a.report!.attempt=i+1; return a; });
 f.checkpoint.attempts = [...history,current];
 let remaining = DESIGN_LIMITS.checkpointBytes - designDispatchCapacity(f.checkpoint);
 for (const old of history) for (const field of ['canonical','document'] as const) {
  const n = Math.min(remaining, DESIGN_LIMITS.subjectBytes - old.baseline.reviewedContent[field].length);
  if (n > 0) { old.baseline.reviewedContent[field] += 'x'.repeat(n); remaining -= n; }
 }
 assert.equal(remaining,0);
 assert.equal(designDispatchCapacity(f.checkpoint),DESIGN_LIMITS.checkpointBytes);
 assertDesignDispatchCapacity(f.checkpoint);
 const over = structuredClone(f.checkpoint); over.attempts[0]!.baseline.reviewedContent.document += 'x';
 assert.equal(designDispatchCapacity(over),DESIGN_LIMITS.checkpointBytes+1);
 assert.throws(() => assertDesignDispatchCapacity(over),{code:'checkpoint_capacity'});
 await saveDesignCheckpoint(f.repo,f.checkpoint);
 // Simulate the response acceptance/consolidation boundary using the actual maximum valid results.
 current.completedChunks = f.baseline.completedChunks;
 current.report = consolidateDesignReview('review-1',5,f.prepared.subject,current.baseline.contentIdentity,f.plan,current.completedChunks);
 current.status = 'incomplete';
 await saveDesignCheckpoint(f.repo,f.checkpoint);
 const restored = (await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[4]!;
 assert.equal(restored.report!.limitations.length,f.baseline.report.limitations.length);
 assert.deepEqual(restored.completedChunks,current.completedChunks);
});

test('encoded dispatch reservation accepts exact bound and refuses one byte below without expanding the ceiling', async t => {
 const f = impactFixture(t); f.checkpoint.attempts = [f.baseline];
 const bound = designDispatchCapacity(f.checkpoint);
 assert.ok(bound < DESIGN_LIMITS.checkpointBytes);
 assertDesignDispatchCapacity(f.checkpoint, bound);
 assert.throws(() => assertDesignDispatchCapacity(f.checkpoint, bound - 1), { code: 'checkpoint_capacity' });
 assert.throws(() => assertDesignDispatchCapacity(f.checkpoint, DESIGN_LIMITS.checkpointBytes + 1));
 await saveDesignCheckpoint(f.repo, f.checkpoint);
 assert.equal(serializeDesignCheckpoint((await loadDesignCheckpoint(f.repo, 'review-1'))!), serializeDesignCheckpoint(f.checkpoint));
 const larger = structuredClone(f.checkpoint); larger.attempts[0]!.completedChunks[0]!.limitations.push('Unicode \u0000 é');
 assert.ok(designDispatchCapacity(larger) > bound);
});
test('capacity refusal is durable before provider construction and does not spend retries', async t => {
 const f = designFixture(t); let calls = 0;
 const c = new DesignReviewCoordinator({ capacity: cp => assertDesignDispatchCapacity(cp, 1), provider: () => { calls++; throw Error('Must not construct provider'); } });
 await c.start({ phase: 'start', repo: f.repo, reviewId: 'review-1', attempt: 1, artifactPath: f.json });
 let view = await c.progress(f.repo, 'review-1', 1);
 for (let i = 0; i < 100 && ['pending','running'].includes(view.status); i++) { await pause(5); view = await c.progress(f.repo,'review-1',1); }
 assert.equal(view.status, 'failed'); assert.equal(calls, 0);
 const stored = (await loadDesignCheckpoint(f.repo,'review-1'))!;
 assert.equal(stored.attempts[0]!.failure!.code, 'checkpoint_capacity');
 assert.equal(stored.attempts[0]!.unit, undefined);
 const restarted = new DesignReviewCoordinator();
 assert.equal((await restarted.progress(f.repo,'review-1',1)).status, 'failed');
});
test('automatic retry and explicit recovery reserve capacity before charging dispatch counters', async t => {
 const f=designFixture(t); let calls=0;
 const provider={capabilities:{reviewActivity:true},runReviewSession:async()=>{calls++;throw new DesignReviewError('invalid_output','Synthetic invalid output');}} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'}),capacity:cp=>assertDesignDispatchCapacity(cp,cp.attempts.at(-1)!.unit?.retriesUsed?1:DESIGN_LIMITS.checkpointBytes)});
 await c.start({phase:'start',repo:f.repo,reviewId:'review-1',attempt:1,artifactPath:f.json});
 for(let i=0;i<200;i++){const p=await c.progress(f.repo,'review-1',1);if(p.status==='failed')break;await pause(5);}
 const failed=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!;
 assert.equal(failed.failure!.code,'checkpoint_capacity');assert.equal(calls,1);
 assert.equal(failed.unit!.dispatches,1);assert.equal(failed.unit!.retriesUsed,0);assert.equal(failed.unit!.diagnostics.length,1);
 const r=designFixture(t);await saveDesignCheckpoint(r.repo,r.checkpoint);
 const recovering=new DesignReviewCoordinator({capacity:cp=>assertDesignDispatchCapacity(cp,1),provider:()=>{throw Error('No provider');}});
 await assert.rejects(recovering.recover({phase:'recover',repo:r.repo,reviewId:'review-1',attempt:1,actionId:'refused-resume',operation:'resume'}),{code:'checkpoint_capacity'});
 const restored=(await loadDesignCheckpoint(r.repo,'review-1'))!.attempts[0]!;
 assert.equal(restored.failure!.code,'checkpoint_capacity');assert.equal(restored.unit,undefined);assert.equal(restored.actions,undefined);
});
test('coordinator dispatches maximum feedback at the real ceiling and durably refuses one byte over', async t => {
 const f=impactFixture(t),current=structuredClone(f.baseline);current.number=5;current.status='pending';delete current.report;
 current.completedChunks=current.completedChunks.slice(0,2).map(maximalResult);
 const final=maximalResult(f.baseline.completedChunks[2]!);
 const history=Array.from({length:4},(_,i)=>{const a=structuredClone(f.checkpoint.attempts[0]!);a.number=i+1;a.status='invalidated';a.completedChunks=[];return a;});
 const initial:DesignReviewCheckpoint={...f.checkpoint,attempts:[...history,current]};
 const request={phase:'recover',repo:f.repo,reviewId:'review-1',attempt:5,actionId:'boundary-resume',operation:'resume'};
 let calls=0,max=0,memory=structuredClone(initial);
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(_p:string,_s:unknown,opts:ActivityReviewSessionOpts)=>{calls++;await opts.onCandidate(final);return final;}} as unknown as LLMProvider;
 const settle=async(c:DesignReviewCoordinator)=>{for(let i=0;i<1000;i++){const v=await c.progress(f.repo,'review-1',5);if(!['pending','running'].includes(v.status))return v;await pause(5);}throw Error('Fixture did not settle');};
 // First measure the real coordinator's admission state; only observer fields differ later.
 const dry=new DesignReviewCoordinator({load:async()=>memory,save:async(_p,cp)=>{memory=structuredClone(cp);},provider:()=>({provider,model:'fixture'}),capacity:cp=>{max=Math.max(max,designDispatchCapacity(cp));assertDesignDispatchCapacity(cp);}});
 await dry.recover(request);assert.equal((await settle(dry)).status,'incomplete');assert.equal(calls,1);
 let padding=DESIGN_LIMITS.checkpointBytes-max;
 for(const a of history)for(const field of ['canonical','document'] as const){const n=Math.min(padding,DESIGN_LIMITS.subjectBytes-a.baseline.reviewedContent[field].length);a.baseline.reviewedContent[field]+='x'.repeat(n);padding-=n;}
 assert.equal(padding,0);
 await saveDesignCheckpoint(f.repo,initial);calls=0;let observed=0;
 const actual=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'}),capacity:cp=>{observed=Math.max(observed,designDispatchCapacity(cp));assertDesignDispatchCapacity(cp);}});
 await actual.recover(request);assert.equal((await settle(actual)).status,'incomplete');
 assert.equal(observed,DESIGN_LIMITS.checkpointBytes);assert.equal(calls,1);
 assert.equal((await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[4]!.completedChunks[2]!.limitations.length,final.limitations.length);
 // Fresh durable snapshot at the same public path: one extra historical byte,
 // with no model construction and no retry charge. Use a distinct fixture file
 // lifecycle by deleting only this test's completed checkpoint before reseeding.
 const {unlink}=await import('node:fs/promises');await unlink(f.path);
 const spare=initial.attempts.slice(0,4).find(a=>a.baseline.reviewedContent.document.length<DESIGN_LIMITS.subjectBytes)!;spare.baseline.reviewedContent.document+='x';await saveDesignCheckpoint(f.repo,initial);
 calls=0;const over=new DesignReviewCoordinator({provider:()=>{calls++;throw Error('No dispatch');}});
 await assert.rejects(over.recover(request),{code:'checkpoint_capacity'});assert.equal(calls,0);
 const refused=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[4]!;
 assert.equal(refused.failure!.code,'checkpoint_capacity');assert.equal(refused.unit,undefined);assert.equal(refused.actions,undefined);
 const restarted=new DesignReviewCoordinator();assert.equal((await restarted.progress(f.repo,'review-1',5)).status,'failed');
});
