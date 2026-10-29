/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryFixture } from './recovery-fixtures.js';
import { RecoveryStore } from '../recovery-store.js';
import { acceptPublication } from './publication-fixtures.js';
test('Frozen completion-requested takeover and legacy terminal refusal',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000);const intent=f.store.journal.stage({operation:'publish'});
  await acceptPublication(f.store,lease.leaseId,lease.generation,intent.reference,f.store.replay().state.checkpoint);
  const binding=f.store.replay().publication;await f.store.release(lease.leaseId,lease.generation);
  assert.equal(f.store.status().state,'completion-requested');const next=await f.store.claim(300000);assert.ok(next.generation>lease.generation);assert.deepEqual(f.store.replay().publication,binding);
  await f.store.recordCompletion(next.leaseId,next.generation,'terminal-receipt');
  await assert.rejects(()=>f.store.claim(300000));assert.equal(f.store.status().completionReceipt,'terminal-receipt');
 }finally{f.cleanup();}
 const legacy=recoveryFixture();try{await legacy.store.prepare(legacy.manifest);const lease=await legacy.store.claim(300000);await legacy.store.requestCompletion(lease.leaseId,lease.generation);const restarted=new RecoveryStore(legacy.repo,legacy.turn.runId,{...legacy.options,processEpoch:'replacement'});await assert.rejects(()=>restarted.claim(300000),{code:'unsupported'});}finally{legacy.cleanup();}
});
test('Replacement owner preserves publication intent and fences prior generation',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000),intent=f.store.journal.stage({operation:'publish'});await acceptPublication(f.store,lease.leaseId,lease.generation,intent.reference,f.store.replay().state.checkpoint);
  const before=f.store.replay();const restarted=new RecoveryStore(f.repo,f.turn.runId,{...f.options,processEpoch:'replacement'});const next=await restarted.claim(300000);const after=restarted.replay();
  assert.deepEqual(after.publication,before.publication);assert.equal(after.state.checkpoint,before.state.checkpoint);assert.equal(after.lifecycle.state,'completion-requested');assert.equal(next.generation,lease.generation+1);
  await assert.rejects(()=>f.store.recordCompletion(lease.leaseId,lease.generation,'late'),{code:'ownership-lost'});
  await assert.rejects(()=>restarted.issueAttempt(next.leaseId,next.generation,{...f.turn,generation:next.generation},1000));
  await restarted.release(next.leaseId,next.generation,'cancelled');await assert.rejects(()=>restarted.claim(300000));
 }finally{f.cleanup();}
});
