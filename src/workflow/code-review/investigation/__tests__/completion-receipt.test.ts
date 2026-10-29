/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationFixture } from './completion-fixtures.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import { ArtifactStore } from '../../../artifact-core/store.js';
import { createFileJournal } from '../../../artifact-core/journal.js';
import { creationContextProvider } from '../../../artifact-core/codecs.js';
import { writeAtomic } from '../../../storage.js';
import { prepareCompletionPublication } from '../completion-publication.js';
import { completeInvestigationReview,readReviewCompletion } from '../completion-receipt.js';
import type { CompletionPublisherDeps } from '../completion-publisher.js';
const actor={id:'insrc:daemon',kind:'agent' as const,properties:{}};

test('Lost canonical write acknowledgment reconciles one revision and terminal receipt',async()=>{
 const f=await publicationFixture();try{
  const lifecycle=createRepoLifecycle(f.repo);let lose=true;
  const canonical=new ArtifactStore({repoPath:f.repo,history:lifecycle.history,journal:createFileJournal(f.repo),
   contexts:creationContextProvider(f.repo,{rootKinds:['CR']}),writeHead:(path,bytes)=>{writeAtomic(path,bytes);if(lose){lose=false;throw Error('lost canonical ACK');}}});
  const deps:CompletionPublisherDeps={canonical,actor,current:async()=>({context:f.context,buildRecord:f.input.buildRecord})};
  const p=await prepareCompletionPublication(f.store,f.leaseId,1,f.input);
  await assert.rejects(()=>completeInvestigationReview(f.store,f.leaseId,1,p.intentRef,f.context,deps),/lost canonical ACK/);
  assert.equal(f.store.status().state,'completion-requested');assert.equal(f.store.status().completionReceipt,null);
  const receipt=await completeInvestigationReview(f.store,f.leaseId,1,null,f.context,deps);
  assert.equal(receipt.artifactRevision,1);assert.equal(receipt.verdict,'pass');assert.equal(receipt.coverageRef,p.intent.coverageRef);
  assert.equal(receipt.terminalCheckpointDigest,f.view.state.checkpoint);assert.equal(f.store.status().state,'completed');
  assert.equal((await lifecycle.history.log(p.intent.artifactId)).length,1);
  const before=f.store.journal.events().length;
  assert.deepEqual(await completeInvestigationReview(f.store,'old-owner',0,null,f.context,deps),receipt);
  assert.equal(f.store.journal.events().length,before);assert.equal((await lifecycle.history.log(p.intent.artifactId)).length,1);
 }finally{f.cleanup();}
});
test('Terminal replay conflict and revoked callback authority cannot manufacture completion',async()=>{
 const f=await publicationFixture();try{
  const lifecycle=createRepoLifecycle(f.repo),deps:CompletionPublisherDeps={canonical:lifecycle.store,actor,current:async()=>({context:f.context,buildRecord:f.input.buildRecord})};
  const p=await prepareCompletionPublication(f.store,f.leaseId,1,f.input);
  // Revoke process authority during the fresh canonical read: the final sc4 guard rejects before stage.
  let revoked=false;
  const guarded=new (await import('../recovery-store.js')).RecoveryStore(f.repo,f.manifest.runId,{...f.options,assertProcessOwner:()=>{if(revoked)throw Error('revoked callback');}});
  await assert.rejects(()=>completeInvestigationReview(guarded,f.leaseId,1,p.intentRef,f.context,{...deps,current:async()=>{revoked=true;return {context:f.context,buildRecord:f.input.buildRecord};}}),/revoked callback/);
  revoked=false;assert.equal(guarded.status().completionReceipt,null);assert.equal(await lifecycle.store.readHeadSnapshot(p.intent.artifactId),null);
  await completeInvestigationReview(f.store,f.leaseId,1,null,f.context,deps);
  await lifecycle.store.mutateContentAndLog(p.intent.artifactId,actor,async(head)=>({payload:{body:{...head!.head.body,verdict:'warn'},citations:[]},metadata:{},assertCurrent:()=>{}}));
  await assert.rejects(()=>readReviewCompletion(f.store,deps),/conflicts/);
  await assert.rejects(()=>completeInvestigationReview(f.store,f.leaseId,1,null,f.context,deps),/conflicts/);
 }finally{f.cleanup();}
});
