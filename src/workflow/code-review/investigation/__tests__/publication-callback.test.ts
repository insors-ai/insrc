/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryFixture } from './recovery-fixtures.js';
test('Approved publication callback binding guard and null replay',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000),checkpoint=f.store.replay().state.checkpoint;
  await assert.rejects(()=>f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,null,async()=>0));
  const intent=f.store.journal.stage({operation:'one'});let retainedGuard!:()=>void,calls=0;
  const result=await f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,intent.reference,async(ref,guard)=>{calls++;guard();retainedGuard=guard;assert.equal(ref,intent.reference);assert.equal(f.store.status().state,'completion-requested');assert.equal(f.store.journal.events().at(-1)!.kind,'publication-intent');return 'canonical-result';});
  assert.equal(result,'canonical-result');assert.throws(()=>retainedGuard(),{code:'ownership-lost'});
  const ordinal=f.store.replay().eventOrdinal;
  assert.equal(await f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,null,async(ref,guard)=>{calls++;guard();return ref;}),intent.reference);
  assert.equal(f.store.replay().eventOrdinal,ordinal);assert.equal(calls,2);
  const other=f.store.journal.stage({operation:'two'});await assert.rejects(()=>f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,other.reference,async()=>{calls++;}));assert.equal(calls,2);
 }finally{f.cleanup();}
});
test('Callback failure and separate terminal receipt do not reenter run queue',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000),checkpoint=f.store.replay().state.checkpoint,intent=f.store.journal.stage({operation:'one'});
  await assert.rejects(()=>f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,intent.reference,async()=>{throw Error('external ACK lost');}));
  assert.equal(f.store.status().completionReceipt,null);assert.equal(f.store.status().state,'completion-requested');
  await f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,null,async(_ref,guard)=>{guard();return 'existing-result';});
  await f.store.recordCompletion(lease.leaseId,lease.generation,'verified-receipt');assert.equal(f.store.status().completionReceipt,'verified-receipt');
  let called=false;await assert.rejects(()=>f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,null,async()=>{called=true;}));assert.equal(called,false);
 }finally{f.cleanup();}
});
