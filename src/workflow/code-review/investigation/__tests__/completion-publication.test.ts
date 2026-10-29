/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { completedInvestigationFixture } from './completion-fixtures.js';
import { prepareCompletionPublication,readCompletionPublication,withCompletionPublication } from '../completion-publication.js';
import { RecoveryStore } from '../recovery-store.js';
import { ledgerDigest } from '../ledger-identity.js';
import type { PrepareCompletionInput } from '../completion-publication.js';

export async function publicationFixture(){
 const f=await completedInvestigationFixture();
 const input:PrepareCompletionInput={context:f.context,repoPath:f.repo,epicHash:'c32aa60534232f36',storyId:'s1',
  buildRecord:{meta:{revision:1},body:{commit:f.basis.subject.build.sourceCommit}},createdAt:'2026-10-29T12:00:00Z',model:'fixture',
  sourceMode:'source-only',expectedRevision:null,expectedHeadDigest:null};
 return {...f,input};
}
test('Immutable publication intent binds candidate coverage target and expected revision',async()=>{
 const f=await publicationFixture();try{
  const p=await prepareCompletionPublication(f.store,f.leaseId,1,f.input);
  assert.equal(f.store.replay().publication,null);assert.equal(f.store.status().state,'running');
  assert.equal(p.intent.artifactId,'CR-c32aa60534232f36-s1');assert.equal(p.intent.expectedRevision,null);
  assert.equal(p.intent.build.revision,1);assert.equal(p.intent.authorParty,'controller');assert.equal(p.intent.reviewerParty,'daemon');
  assert.equal(p.intent.candidateDigest,ledgerDigest(p.candidate));assert.equal(p.intent.checkpointDigest,f.view.state.checkpoint);
  assert.deepEqual(readCompletionPublication(f.store,p.intentRef),p);
  const coverage=f.store.journal.read(p.intent.coverageRef) as {ledger:unknown;receiptRefs:string[]};
  assert.deepEqual(coverage.ledger,f.view.state.ledger);assert.equal(coverage.receiptRefs.length,f.view.receipts.length);
  await assert.rejects(()=>prepareCompletionPublication(f.store,f.leaseId,1,{...f.input,expectedRevision:1}));
  const revised=await prepareCompletionPublication(f.store,f.leaseId,1,{...f.input,expectedRevision:2,expectedHeadDigest:'a'.repeat(64)});
  assert.equal(revised.intent.expectedRevision,2);assert.equal(revised.intent.operationId,p.intent.operationId);
  await assert.rejects(()=>withCompletionPublication(f.store,f.leaseId,1,p.intentRef,{...f.context,reviewerParty:'controller'},async()=>{throw Error('must not run');}));
  assert.equal(f.store.replay().publication,null);
 }finally{f.cleanup();}
});
test('Completed sc4 fence freezes original intent and refuses conflicts without duplicate recovery',async()=>{
 const f=await publicationFixture();try{
  const p=await prepareCompletionPublication(f.store,f.leaseId,1,f.input);let calls=0;
  const publish=async(prepared:typeof p,assertCurrent:()=>void)=>{assertCurrent();calls++;return prepared.intent.operationId;};
  assert.equal((await withCompletionPublication(f.store,f.leaseId,1,p.intentRef,f.context,publish)).kind,'published');
  assert.equal(f.store.status().state,'completion-requested');
  const reopened=new RecoveryStore(f.repo,f.manifest.runId,f.options);
  const resumed=await prepareCompletionPublication(reopened,f.leaseId,1,{...f.input,createdAt:'later'});
  assert.equal(resumed.intentRef,p.intentRef);
  await withCompletionPublication(reopened,f.leaseId,1,null,f.context,publish);assert.equal(calls,2);
  assert.equal(reopened.journal.events().filter(e=>e.kind==='publication-intent').length,1);
  const conflicting=reopened.journal.stage({...p.intent,expectedRevision:99});
  await assert.rejects(()=>withCompletionPublication(reopened,f.leaseId,1,conflicting.reference,f.context,publish));assert.equal(calls,2);
  const terminal=reopened.journal.stage({receipt:'existing'});
  await reopened.recordCompletion(f.leaseId,1,terminal.reference);
  assert.deepEqual(await withCompletionPublication(reopened,f.leaseId,1,null,f.context,publish),{kind:'completed',receiptRef:terminal.reference});
  assert.equal(calls,2);
 }finally{f.cleanup();}
});
