import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, appendFileSync } from 'node:fs';
import { impactFixture } from './impact-fixtures.js';
import { publishDesignReview, preflightDesignPublication } from '../publication.js';
import { validatePermanentDesignReview } from '../history.js';
import { loadDesignCheckpoint, saveDesignCheckpoint } from '../checkpoint.js';
import { assertDesignSubjectUnchanged } from '../subject.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import type { LLMProvider } from '../../../../shared/types.js';
import type { ActivityReviewSessionOpts } from '../../../../shared/types.js';
import { setTimeout as pause } from 'node:timers/promises';
import { ArtifactStore } from '../../../artifact-core/store.js';
import { History } from '../../../artifact-core/history.js';
import { FileSidecarStore } from '../../../artifact-core/sidecar-store.js';
import { createFileJournal } from '../../../artifact-core/journal.js';
import { writeAtomic } from '../../../storage.js';

async function fixture(t:Parameters<typeof impactFixture>[0]){
 const f=impactFixture(t);f.checkpoint.attempts=[f.baseline];
 f.baseline.publication={reviewId:'review-1',attempt:1,state:'pending'};
 await saveDesignCheckpoint(f.repo,f.checkpoint);return f;
}
test('journalled publication and lost-receipt recovery preserve one exact full history without model calls',async t=>{
 const f=await fixture(t),before=structuredClone(f.baseline.baseline),md=readFileSync(f.md,'utf8');
 const receipt=await publishDesignReview(f.checkpoint);
 const cp=(await loadDesignCheckpoint(f.repo,'review-1'))!;
 // Simulate crash before receipt save; a new coordinator must find the same history entry.
 const c=new DesignReviewCoordinator({publish:publishDesignReview,provider:()=>{throw Error('No model');}});
 const request={phase:'recover',repo:f.repo,reviewId:'review-1',attempt:1,actionId:'receipt-retry',operation:'retry_publication'};
 assert.equal((await c.recover(request)).status,'passed');
 assert.equal((await c.recover(request)).status,'passed');
 const stored=(await loadDesignCheckpoint(f.repo,'review-1'))!;
 assert.equal(stored.attempts[0]!.publication!.artifactHistoryEntryId,receipt.artifactHistoryEntryId);
 assert.equal((await createRepoLifecycle(f.repo).history.log(f.id)).filter(e=>e.operation==='review').length,1);
 const record=(await createRepoLifecycle(f.repo).history.log(f.id)).find(e=>e.id===receipt.artifactHistoryEntryId)!.outcome!.data;
 validatePermanentDesignReview(record,{project:f.repo,artifactId:f.id});
 assert.deepEqual(stored.attempts[0]!.baseline,before);assert.equal(readFileSync(f.md,'utf8'),md);
 assert.throws(()=>assertDesignSubjectUnchanged(f.prepared.subject,before),{code:'artifact_changed'});
 assert.doesNotThrow(()=>assertDesignSubjectUnchanged(f.prepared.subject,before,receipt));
 assert.deepEqual(cp.attempts[0]!.completedChunks,stored.attempts[0]!.completedChunks);
});
test('publication capacity stays pending and a raised history allowance retries persistence only',async t=>{
 const f=await fixture(t);let limit=1,calls=0;
 const c=new DesignReviewCoordinator({publish:cp=>publishDesignReview(cp,{historyLimit:()=>limit}),provider:()=>{calls++;throw Error('No model');}});
 const request={phase:'recover',repo:f.repo,reviewId:'review-1',attempt:1,actionId:'small-limit',operation:'retry_publication'};
 assert.equal((await c.recover(request)).status,'failed');
 const pending=(await loadDesignCheckpoint(f.repo,'review-1'))!;
 assert.equal(pending.attempts[0]!.publication!.state,'pending');assert.ok(pending.attempts[0]!.publication!.error);
 assert.equal((await c.progress(f.repo,'review-1',1)).phase,'publishing');
 assert.deepEqual(pending.attempts[0]!.completedChunks,f.baseline.completedChunks);
 limit=8*1024*1024;
 assert.equal((await c.recover({...request,actionId:'raised-limit'})).status,'passed');assert.equal(calls,0);
 assert.equal((await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!.publication!.state,'complete');
});
test('publication refuses changed subject before write and additional edits after its exact owned delta',async t=>{
 const f=await fixture(t);appendFileSync(f.md,'\nChanged');
 await assert.rejects(publishDesignReview(f.checkpoint),{code:'artifact_changed'});
 assert.equal((await createRepoLifecycle(f.repo).history.log(f.id)).length,0);
 const g=await fixture(t),receipt=await publishDesignReview(g.checkpoint);
 appendFileSync(g.json,' ');
 assert.throws(()=>assertDesignSubjectUnchanged(g.prepared.subject,g.baseline.baseline,receipt),{code:'artifact_changed'});
 await assert.rejects(publishDesignReview(g.checkpoint),{code:'artifact_changed'});
 const c=new DesignReviewCoordinator({publish:publishDesignReview});
 assert.equal((await c.recover({phase:'recover',repo:g.repo,reviewId:'review-1',attempt:1,actionId:'changed-publication',operation:'retry_publication'})).status,'invalidated');
 assert.equal((await c.progress(g.repo,'review-1',1)).status,'invalidated');
});
test('native review waits for durable publication and recovers failed receipt persistence without rerunning models',async t=>{
 const f=impactFixture(t);let calls=0,entered=false,release!:()=>void,failed=false;
 const barrier=new Promise<void>(r=>release=r);
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(_p:string,_s:unknown,opts:ActivityReviewSessionOpts)=>{
  calls++;const value=calls===1?f.plan:f.baseline.completedChunks[calls-2]!;await opts.onCandidate(value);return value;
 }} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'}),publish:async cp=>{entered=true;await barrier;return publishDesignReview(cp);},
  save:async(project,cp)=>{if(cp.attempts.at(-1)!.publication?.state==='complete'&&!failed){failed=true;throw Error('Injected receipt save failure');}await saveDesignCheckpoint(project,cp);}});
 await c.start({phase:'start',repo:f.repo,reviewId:'review-1',attempt:1,artifactPath:f.json});
 for(let i=0;i<500&&!entered;i++)await pause(5);assert.equal(entered,true);
 const pending=await c.progress(f.repo,'review-1',1);assert.equal(pending.phase,'publishing');assert.equal(pending.report,undefined);
 const before=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!.baseline;
 release();
 for(let i=0;i<500;i++){const p=await c.progress(f.repo,'review-1',1);if(p.publication?.error)break;await pause(5);}
 assert.equal(calls,4);assert.equal((await c.progress(f.repo,'review-1',1)).publication!.state,'pending');
 const restarted=new DesignReviewCoordinator({publish:publishDesignReview,provider:()=>{throw Error('No model');}});
 assert.equal((await restarted.recover({phase:'recover',repo:f.repo,reviewId:'review-1',attempt:1,actionId:'recover-receipt',operation:'retry_publication'})).status,'passed');
 assert.equal(calls,4);assert.deepEqual((await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!.baseline,before);
});
test('publication append and head-replace crashes replay the same complete history entry',async t=>{
 for(const fault of ['append','replace']){
  const f=await fixture(t),files=new FileSidecarStore(f.repo);let failed=false;
  const history=new History({readRecords:(file,id)=>files.readRecords(file,id),appendRecord:async(file,record)=>{if(fault==='append'&&!failed){failed=true;throw Error('Injected append');}await files.appendRecord(file,record);}});
  const store=new ArtifactStore({repoPath:f.repo,history,journal:createFileJournal(f.repo),writeHead:(path,bytes)=>{if(fault==='replace'&&!failed){failed=true;throw Error('Injected replace');}writeAtomic(path,bytes);}});
  await assert.rejects(publishDesignReview(f.checkpoint,{store}),/Injected/);
  const receipt=await publishDesignReview(f.checkpoint);
  assert.equal((await createRepoLifecycle(f.repo).history.log(f.id)).filter(e=>e.operation==='review').length,1);
  assert.doesNotThrow(()=>assertDesignSubjectUnchanged(f.prepared.subject,f.baseline.baseline,receipt));
 }
});
test('known permanent-history minimum preserves failure and starts a new attempt after the allowance is raised',async t=>{
 const f=impactFixture(t);let limit=1,calls=0;
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(_p:string,_s:unknown,opts:ActivityReviewSessionOpts)=>{calls++;const value=calls===1?f.plan:f.baseline.completedChunks[calls-2]!;await opts.onCandidate(value);return value;}} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({publish:publishDesignReview,preflight:cp=>preflightDesignPublication(cp,limit),provider:()=>({provider,model:'fixture'})});
 await c.start({phase:'start',repo:f.repo,reviewId:'review-1',attempt:1,artifactPath:f.json});
 for(let i=0;i<500;i++){const p=await c.progress(f.repo,'review-1',1);if(p.status==='failed')break;await pause(5);}
 const refused=(await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!;
 assert.equal(refused.failure!.code,'publication_capacity');assert.equal(calls,0);assert.equal(refused.unit,undefined);
 limit=1024*1024;
 await assert.rejects(c.recover({phase:'recover',repo:f.repo,reviewId:'review-1',attempt:1,actionId:'raised-preflight',operation:'resume'}),/Failed review requires the next attempt/);
 for(let i=0;i<500&&c.isActive(f.repo,'review-1');i++)await pause(5);
 await c.start({phase:'start',repo:f.repo,reviewId:'review-1',attempt:2,artifactPath:f.json});
 for(let i=0;i<500;i++){const p=await c.progress(f.repo,'review-1',2);if(p.publication?.state==='complete')break;await pause(5);}
 assert.equal((await c.progress(f.repo,'review-1',2)).publication!.state,'complete');assert.equal(calls,4);
 const cp=(await loadDesignCheckpoint(f.repo,'review-1'))!;
 assert.deepEqual(cp.attempts[0],refused);assert.equal(cp.attempts.length,2);
});
test('canonical edits during journal staging or log append are preserved and refuse publication',async t=>{
 for(const phase of ['stage','append']){
  const f=await fixture(t),files=new FileSidecarStore(f.repo),base=createFileJournal(f.repo),before=readFileSync(f.json,'utf8');let edited=false;
  const edit=()=>{if(!edited){edited=true;appendFileSync(f.json,' ');}};
  const history=new History({readRecords:(file,id)=>files.readRecords(file,id),appendRecord:async(file,record)=>{await files.appendRecord(file,record);if(phase==='append')edit();}});
  const journal={...base,stage:async(id:Parameters<typeof base.stage>[0],op:Parameters<typeof base.stage>[1])=>{await base.stage(id,op);if(phase==='stage')edit();}};
  const store=new ArtifactStore({repoPath:f.repo,history,journal});
  await assert.rejects(publishDesignReview(f.checkpoint,{store}),{code:'artifact_changed'});
  assert.equal(readFileSync(f.json,'utf8'),before+' ');
  assert.ok(await base.pending(f.id));assert.deepEqual((await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[0]!.baseline,f.baseline.baseline);
  const c=new DesignReviewCoordinator({publish:cp=>publishDesignReview(cp,{store})});
  assert.equal((await c.recover({phase:'recover',repo:f.repo,reviewId:'review-1',attempt:1,actionId:'changed-in-flight',operation:'retry_publication'})).status,'invalidated');
  assert.equal(readFileSync(f.json,'utf8'),before+' ');
 }
});
