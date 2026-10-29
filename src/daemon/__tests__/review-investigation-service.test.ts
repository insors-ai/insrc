/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync,statSync } from 'node:fs';
import { join } from 'node:path';
import { recoveryFixture } from '../../workflow/code-review/investigation/__tests__/recovery-fixtures.js';
import { catalogFixture } from '../../workflow/code-review/investigation/__tests__/ledger-fixtures.js';
import { subjectFixture } from '../../workflow/code-review/investigation/__tests__/fixtures.js';
import { buildLedgerBasis } from '../../workflow/code-review/investigation/ledger-catalog.js';
import { initializeReviewLedger } from '../../workflow/code-review/investigation/ledger.js';
import { finalReply,progressFor } from '../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { ProductionReviewService } from '../review-investigation-service.js';
import type { ProductionReviewServiceOptions } from '../review-investigation-service.js';
import { productionRunId } from '../review-investigation-descriptor.js';
import type { InvestigationStart } from '../review-investigation-descriptor.js';
import { lifecycleFor } from '../lifecycle-registry.js';
import { isInvestigationRuntimePath,PRODUCTION_REVIEW_RUNTIME_PATH,REVIEW_BRIDGE_RUNTIME_PATH } from '../../shared/review-runtime-paths.js';
import { readReviewSource,sourceReference } from '../../workflow/code-review/investigation/source.js';
import { prepareReviewSubject } from '../../workflow/code-review/investigation/subject.js';
import { readCommitPacket,ReviewGitReader } from '../../workflow/code-review/investigation/git-packets.js';
import { inspectionFixture } from '../../workflow/code-review/investigation/__tests__/ledger-fixtures.js';
import { evidenceFromReceipt } from '../../workflow/code-review/investigation/ledger-evidence.js';
import { BlockProgressCoordinator } from '../../workflow/code-review/investigation/progress.js';
import type { TrustedInspectionReceipt } from '../../workflow/code-review/investigation/ledger-types.js';
import type { CompletionValidationContext } from '../../workflow/code-review/investigation/completion-types.js';

function fixture(){
 const f=recoveryFixture();let fresh=true,qualified=false,prepared=0,executions=0,admitted=0;
 let wait:Promise<void>=Promise.resolve();
 const start:InvestigationStart={version:1,engine:'plan-investigation-v1',operation:'start',repo:f.repo,repoId:f.basis.subject.repoId,requestId:'12345678-1234-1234-1234-123456789abc',rootArtifactId:f.basis.subject.rootArtifactId,storyId:'s1',buildArtifactId:f.basis.subject.build.artifactId,selections:[{commitId:'c'.repeat(40),parentId:'d'.repeat(40),attestationRef:'approved-proof'}],sourceMode:'source-only'};
 const options:ProductionReviewServiceOptions={repoPath:f.repo,repoId:'repo',processEpoch:'epoch-1',canonical:lifecycleFor(f.repo).store,assertRegistered:async()=>{},assertProcessOwner:()=>{},
  prepare:async(_start,runId)=>{prepared++;const basis=buildLedgerBasis({...catalogFixture(),subject:f.basis.subject,runId});return {manifest:{...f.manifest,runId,basis,initial:{...f.manifest.initial,ledger:initializeReviewLedger(basis)}},authorParty:'controller',reviewerParty:'daemon'};},
  recoveryOptions:()=>({...f.options,processEpoch:'epoch-1'}),assertFresh:async()=>{if(!fresh)throw Error('canonical pins stale');},assertQualified:async()=>{if(!qualified)throw Error('backend unqualified');},
  admitProvider:async signal=>{await wait;signal.throwIfAborted();admitted++;return ()=>{admitted--;};},
  execution:async(_descriptor,store,lease,signal)=>{executions++;const view=store.replay();return {turn:{...f.turn,runId:view.manifest.runId,generation:lease.generation},context:{...f.context,basis:view.basis,state:view.state,generation:lease.generation,signal,
   backend:{...f.context.backend,execute:async(turn,tools)=>{
    if(!view.state.accepted.length)await tools.progress(progressFor(turn,'block-1',0));
    f.setClock(executions*20);const now=store.replay().state;return finalReply(turn,now.accepted.map(a=>a.receipt.progressId),now.sequence);
   }}}};}
 };
 return {...f,start,options,service:new ProductionReviewService(options),setFresh:(v:boolean)=>{fresh=v;},setQualified:(v:boolean)=>{qualified=v;},setWait:(v:Promise<void>)=>{wait=v;},counts:()=>({prepared,executions,admitted})};
}
test('Idempotent admission descriptor recovery and runtime source exclusions',async()=>{
 const f=fixture();try{
  // Crash after descriptor installation, before the prepared journal event.
  f.setFresh(false);await assert.rejects(()=>f.service.start(f.start),/stale/);assert.equal(f.counts().prepared,1);
  const id=productionRunId('repo',f.start.requestId),orphan=await f.service.open(id);assert.equal(orphan.store.journal.events().length,0);
  f.setFresh(true);const restarted=new ProductionReviewService(f.options),a=await restarted.start(f.start),b=await restarted.start(f.start);
  assert.equal(a.descriptor.runId,b.descriptor.runId);assert.equal(f.counts().prepared,1);assert.equal(a.store.status().blockCheckpoints.length,0);assert.equal(a.store.status().attempts.length,0);
  await assert.rejects(()=>restarted.start({...f.start,sourceMode:'indexed-impact'}),{code:'identity-conflict'});
  assert.equal(statSync(join(f.repo,PRODUCTION_REVIEW_RUNTIME_PATH)).mode&0o077,0);assert.equal(statSync(join(f.repo,PRODUCTION_REVIEW_RUNTIME_PATH,`${id}.json`)).mode&0o077,0);
  await assert.rejects(()=>restarted.open('../foreign'));await assert.rejects(()=>restarted.open('unknown'),/Unknown production/);
  for(const root of [PRODUCTION_REVIEW_RUNTIME_PATH,REVIEW_BRIDGE_RUNTIME_PATH])assert.ok(isInvestigationRuntimePath(`${root}/private.json`));
 }finally{f.cleanup();}
 const git=await subjectFixture();try{
  const subject=await prepareReviewSubject(git.request,git.deps);
  for(const root of [PRODUCTION_REVIEW_RUNTIME_PATH,REVIEW_BRIDGE_RUNTIME_PATH]){
   mkdirSync(join(git.dir,root),{recursive:true});git.write(`${root}/private.json`,'private');
   await assert.rejects(()=>readReviewSource(subject,sourceReference({kind:'context',path:`${root}/private.json`,start:1,end:1}),{},git.deps),/Private review runtime/);
  }
  const commit=git.commit();assert.equal((await readCommitPacket(new ReviewGitReader(git.dir),commit,git.commitId)).blocks.length,0);
 }finally{git.close();}
});
test('Service lease budget and frozen publication composition survive restart',async()=>{
 const f=fixture();try{
  const {descriptor,store}=await f.service.start(f.start),runId=descriptor.runId;
  await assert.rejects(()=>f.service.resume(runId),/unqualified/);assert.equal(f.counts().executions,0);assert.equal(store.status().owner,null);
  f.setQualified(true);let release!:()=>void;f.setWait(new Promise<void>(r=>{release=r;}));
  const pending=f.service.resume(runId);await new Promise(r=>setTimeout(r,10));assert.equal(store.status().owner,null);assert.equal(f.counts().executions,0);
  await assert.rejects(()=>f.service.resume(runId),/already active/);release();await pending;
  const before=store.replay();assert.equal(before.state.sequence,1);assert.equal(before.state.attempts,1);assert.equal(store.status().owner,null);assert.equal(f.counts().admitted,0);
  const restarted=new ProductionReviewService({...f.options,processEpoch:'epoch-2',recoveryOptions:()=>({...f.options.recoveryOptions(runId),processEpoch:'epoch-2'})});
  await restarted.resume(runId);const after=(await restarted.open(runId)).store;
  assert.equal(after.status().blockCheckpoints.length,1);assert.equal(after.status().attempts.length,2);assert.ok(after.status().activeMsConsumed>=before.state.consumedActiveMs);
  const lease=await after.claim(300000),intent=await after.journal.exclusive(()=>after.journal.stage({version:1,frozen:'test'}));
  await after.withPublicationFence(lease.leaseId,lease.generation,after.replay().state.checkpoint,intent.reference,async()=>{});
  await after.release(lease.leaseId,lease.generation,'paused');const frozen=after.replay().publication;
  const recovered=new ProductionReviewService({...f.options,processEpoch:'epoch-3',recoveryOptions:()=>({...f.options.recoveryOptions(runId),processEpoch:'epoch-3'})});
  await assert.rejects(()=>recovered.resume(runId),/Frozen publication/);await assert.rejects(()=>recovered.cancel(runId),/Frozen publication/);
  assert.deepEqual((await recovered.open(runId)).store.replay().publication,frozen);assert.equal(f.counts().executions,2);
 }finally{f.cleanup();}
 const cancelled=fixture();try{const {descriptor}=await cancelled.service.start(cancelled.start);await cancelled.service.cancel(descriptor.runId);assert.equal((await cancelled.service.open(descriptor.runId)).store.status().state,'cancelled');assert.equal(cancelled.counts().executions,0);}finally{cancelled.cleanup();}
 const published=fixture();try{
  const {descriptor,store}=await published.service.start(published.start),lease=await store.claim(300000),basis=store.replay().basis;
  const turn={...published.turn,runId:basis.runId,generation:lease.generation};await store.issueAttempt(lease.leaseId,lease.generation,turn,1000);
  const receipt=inspectionFixture(basis),passing:TrustedInspectionReceipt={...receipt,receiptId:'actual-test',kind:'test-result',role:'context-only',source:{...receipt.source,revision:basis.subject.build.sourceCommit},readReceipt:null,blockId:null,testResult:'pass'};
  const receipts=[receipt,passing],evidenceIds=receipts.map(r=>evidenceFromReceipt(basis,r).evidenceId);
  const coordinator=new BlockProgressCoordinator(turn,{...published.context,basis,state:store.replay().state,ports:store.ports(lease.generation,turn.attemptId,lease.leaseId),validation:{attempt:receipt.attempt,receipts}});
  await coordinator.accept({...progressFor(turn,'block-1',0),disposition:'reviewed',evidenceIds,coverageUpdates:store.replay().state.ledger.coverage.map(row=>({...row,disposition:'satisfied',evidenceIds,rationale:'Inspected pinned source and actual test',assessedByAttempt:turn.attemptId}))});
  await coordinator.accept({...progressFor(turn,'block-2',1),disposition:'reviewed',evidenceIds});await store.settleAttempt(lease.leaseId,lease.generation,turn.attemptId,'accepted',20);await store.release(lease.leaseId,lease.generation);
  const context:CompletionValidationContext={subjectDigest:basis.subject.subjectDigest,policyDigest:store.replay().manifest.policyDigest,compatibility:store.replay().manifest.compatibility,build:{...basis.subject.build,meta:{authoredBy:'controller'}},reviewerParty:'daemon',expectationConflicts:[],assertFresh:async()=>{}};
  const buildRecord={meta:{revision:1},body:{commit:basis.subject.build.sourceCommit}},canonical=published.options.canonical,deps={canonical,actor:{id:'insrc:daemon',kind:'agent' as const,properties:{}},current:async()=>({context,buildRecord})};
  const first=await published.service.complete(descriptor.runId,{context,repoPath:published.repo,epicHash:'c32aa60534232f36',storyId:'s1',buildRecord,createdAt:'2026-10-29T12:00:00Z',model:'fixture',sourceMode:'source-only',expectedRevision:null,expectedHeadDigest:null},deps);
  const restart=new ProductionReviewService({...published.options,processEpoch:'epoch-2',recoveryOptions:()=>({...published.options.recoveryOptions(descriptor.runId),processEpoch:'epoch-2'})});
  assert.deepEqual(await restart.complete(descriptor.runId,null,deps),first);assert.equal((await canonical.history.log(first.artifactId)).length,1);
 }finally{published.cleanup();}
});
