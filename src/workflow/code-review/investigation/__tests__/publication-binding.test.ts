/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryFixture } from './recovery-fixtures.js';
import { RecoveryStore } from '../recovery-store.js';
import { acceptPublication } from './publication-fixtures.js';
test('Frozen publication binding validates identity checkpoint and attempt state',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000);const before=f.store.replay();assert.equal(before.publication,null);
  const intent=f.store.journal.stage({operationId:'operation-1'});
  await assert.rejects(()=>acceptPublication(f.store,lease.leaseId,lease.generation,intent.reference,'different'));
  await assert.rejects(()=>acceptPublication(f.store,lease.leaseId,lease.generation,'foreign/'+intent.digest,before.state.checkpoint));
  const text=f.store.journal.stage('not an intent object');await assert.rejects(()=>acceptPublication(f.store,lease.leaseId,lease.generation,text.reference,before.state.checkpoint));
  await f.store.issueAttempt(lease.leaseId,lease.generation,f.turn,1000);
  await assert.rejects(()=>acceptPublication(f.store,lease.leaseId,lease.generation,intent.reference,before.state.checkpoint));
  await f.store.settleAttempt(lease.leaseId,lease.generation,f.turn.attemptId,'accepted',5);
  const view=await acceptPublication(f.store,lease.leaseId,lease.generation,intent.reference,before.state.checkpoint);
  assert.equal(view.publication!.intentDigest,intent.digest);assert.equal(view.state.checkpoint,before.state.checkpoint);assert.equal(view.state.sequence,before.state.sequence);assert.equal(view.lifecycle.state,'completion-requested');
  await assert.rejects(()=>acceptPublication(f.store,lease.leaseId,lease.generation,intent.reference,before.state.checkpoint));
 }finally{f.cleanup();}
});
test('Publication-intent fsync replay and uncertain append reconciliation',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000);const intent=f.store.journal.stage({operationId:'operation-1'}),before=f.store.replay();
  const faulty=new RecoveryStore(f.repo,f.turn.runId,{...f.options,fault:p=>{if(p==='event-synced')throw Error('lost intent ACK');}});
  await assert.rejects(()=>acceptPublication(faulty,lease.leaseId,lease.generation,intent.reference,before.state.checkpoint),{code:'uncertain-append'});
  const recovered=f.store.replay();assert.equal(recovered.publication!.intentRef,intent.reference);assert.equal(recovered.eventOrdinal,before.eventOrdinal+1);assert.equal(recovered.state.sequence,before.state.sequence);
  f.store.journal.stabilize();const event=f.store.journal.events().at(-1)!;const {version:_,ordinal:__,previousDigest:___,digest:____,runId:_____,...input}=event;
  assert.equal(f.store.journal.append(input).ordinal,event.ordinal);assert.equal(f.store.replay().eventOrdinal,recovered.eventOrdinal);
 }finally{f.cleanup();}
});
