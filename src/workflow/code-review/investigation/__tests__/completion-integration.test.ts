/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicationFixture } from './completion-fixtures.js';
import { recoveryFixture } from './recovery-fixtures.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import { prepareCompletionPublication,readCompletionPublication } from '../completion-publication.js';
import { completeInvestigationReview } from '../completion-receipt.js';
import { SubjectPreparationError } from '../types.js';
const actor={id:'insrc:daemon',kind:'agent' as const,properties:{}};

test('Completion crash concurrency and stale pin matrix converges to one canonical result',async()=>{
 for(const point of ['intent','canonical-stage','canonical-head','receipt','terminal']){
  const f=await publicationFixture();try{
   const p=await prepareCompletionPublication(f.store,f.leaseId,1,f.input);
   const child=spawnSync(process.execPath,['--import','tsx',fileURLToPath(new URL('./completion-crash-worker.ts',import.meta.url)),f.repo,f.manifest.runId,f.leaseId,p.intentRef,point],{encoding:'utf8',timeout:20000});
   assert.equal(child.status,86,`${point}: ${child.stderr}`);assert.equal(readFileSync(join(f.repo,'crash-point'),'utf8'),point);
   const lifecycle=createRepoLifecycle(f.repo),deps={canonical:lifecycle.store,actor,current:async()=>({context:f.context,buildRecord:f.input.buildRecord})};
   const results=await Promise.all([completeInvestigationReview(f.store,f.leaseId,1,null,f.context,deps),completeInvestigationReview(f.store,f.leaseId,1,null,f.context,deps)]);
   assert.deepEqual(results[0],results[1]);assert.equal(results[0]!.artifactRevision,1);assert.equal(f.store.status().state,'completed');
   assert.equal((await lifecycle.history.log(p.intent.artifactId)).length,1);
   assert.equal(f.store.journal.events().filter(e=>e.kind==='publication-intent').length,1);
  }finally{f.cleanup();}
 }
 const f=await publicationFixture();try{
  const p=await prepareCompletionPublication(f.store,f.leaseId,1,f.input),lifecycle=createRepoLifecycle(f.repo);
  const forged={...p.candidate,body:{...p.candidate.body,counts:{high:1,med:0,low:0},verdict:'block',dimensions:p.candidate.body.dimensions.map((d,i)=>i?d:{...d,findings:[{dimension:d.dimension,severity:'HIGH',location:'a.ts:1',message:'not accepted'}]})}};
  const staged=f.store.journal.stage(forged),forgedIntent=f.store.journal.stage({...p.intent,candidateRef:staged.reference,candidateDigest:staged.digest});
  assert.throws(()=>readCompletionPublication(f.store,forgedIntent.reference),{code:'corrupt'});
  for(const context of [{...f.context,policyDigest:'changed'}, {...f.context,compatibility:{...f.context.compatibility,providerDigest:'changed'}},
   {...f.context,build:{...f.context.build,revision:2}}, {...f.context,assertFresh:async()=>{throw new SubjectPreparationError('stale-contract','Approved contract changed at CAS');}}]){
   await assert.rejects(()=>completeInvestigationReview(f.store,f.leaseId,1,p.intentRef,f.context,{canonical:lifecycle.store,actor,current:async()=>({context,buildRecord:f.input.buildRecord})}),{code:'stale'});
   assert.equal(await lifecycle.store.readHeadSnapshot(p.intent.artifactId),null);assert.equal(f.store.status().completionReceipt,null);
  }
  // Freshness loss after the canonical commit must not manufacture terminal success either.
  let reads=0;
  await assert.rejects(()=>completeInvestigationReview(f.store,f.leaseId,1,null,f.context,{canonical:lifecycle.store,actor,current:async()=>({context:++reads===1?f.context:{...f.context,policyDigest:'changed'},buildRecord:f.input.buildRecord})}),{code:'stale'});
  assert.equal(f.store.status().completionReceipt,null);assert.equal((await lifecycle.store.readHeadSnapshot(p.intent.artifactId))?.revision,1);
 }finally{f.cleanup();}
});
test('Complete blocked warned and incomplete review outcomes preserve mode and coverage semantics',async()=>{
 for(const severity of [undefined,'LOW','MED','HIGH'] as const){
  const verdicts:string[]=[];
  for(const sourceMode of ['source-only','indexed-impact'] as const){
   const f=await publicationFixture(severity);try{
    await f.store.recordUsage({runId:f.turn.runId,attemptId:f.turn.attemptId,observationId:'pending-usage',activity:'code-review',
     chargedArtifactId:f.basis.subject.build.artifactId,subjectArtifactId:f.basis.subject.build.artifactId,providerRequestId:null,
     quality:'unavailable',providerId:'fixture',modelId:null,granularity:'invocation-total',
     counters:{inputUncachedTokens:null,cacheReadTokens:null,cacheWriteTokens:null,outputTokens:null,reasoningTokens:null},
     nativeObservationRef:null,allowanceTokens:128000,elapsedActiveMs:5});
    const p=await prepareCompletionPublication(f.store,f.leaseId,1,{...f.input,sourceMode}),lifecycle=createRepoLifecycle(f.repo);
    const receipt=await completeInvestigationReview(f.store,f.leaseId,1,p.intentRef,f.context,{canonical:lifecycle.store,actor,current:async()=>({context:f.context,buildRecord:f.input.buildRecord})});
    verdicts.push(receipt.verdict);assert.equal(p.candidate.body.investigation!.sourceMode,sourceMode);
    assert.equal(p.candidate.body.dimensions.flatMap(d=>d.findings).length,severity?1:0);
    const usage=f.store.replay().state.usage[0]!;assert.equal(usage.state,'pending');
    assert.ok(Object.values(usage.observation.counters).every(n=>n===null)); // Unknown usage is never fabricated as zero tokens.
   }finally{f.cleanup();}
  }
  assert.deepEqual(verdicts,[severity==='HIGH'?'block':severity==='MED'?'warn':'pass',severity==='HIGH'?'block':severity==='MED'?'warn':'pass']);
 }
 const incomplete=recoveryFixture();try{
  await incomplete.store.prepare(incomplete.manifest);const owner=await incomplete.store.claim(300000);
  const base=await publicationFixture();try{
   await assert.rejects(()=>prepareCompletionPublication(incomplete.store,owner.leaseId,owner.generation,{...base.input,context:{...base.context,subjectDigest:incomplete.manifest.subjectDigest}}));
   assert.equal(incomplete.store.replay().publication,null);
   assert.equal(await createRepoLifecycle(incomplete.repo).store.readHeadSnapshot('CR-c32aa60534232f36-s1'),null);
  }finally{base.cleanup();}
 }finally{incomplete.cleanup();}
});
