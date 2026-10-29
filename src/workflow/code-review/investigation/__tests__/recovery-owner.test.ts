/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryFixture } from './recovery-fixtures.js';
import { RecoveryStore } from '../recovery-store.js';
test('Resume compatibility, unsupported legacy state and clock rollback',async()=>{
 const f=recoveryFixture();try{
  assert.throws(()=>f.store.replay(),{code:'unsupported'});await f.store.prepare(f.manifest);
  assert.equal((await f.store.compatibility(f.manifest,async()=>{})).kind,'compatible');
  assert.equal((await f.store.compatibility({...f.manifest,subjectDigest:'a'.repeat(64)},async()=>{})).kind,'stale');
  assert.equal((await f.store.compatibility({...f.manifest,compatibility:{...f.manifest.compatibility,toolsDigest:'changed'}},async()=>{})).kind,'stale');
  assert.equal((await f.store.compatibility(f.manifest,async()=>{throw Error('contract changed');})).kind,'stale');
  let clock=1000;const store=new RecoveryStore(f.repo,f.turn.runId,{...f.options,wallNow:()=>clock});const lease=await store.claim(100);
  clock=900;await assert.rejects(()=>store.renew(lease.leaseId,lease.generation,100),{code:'ownership-lost'});
 }finally{f.cleanup();}
});
test('Concurrent owner claims, generation takeover and lost process guard fencing',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);let clock=1000,owned=true;
  const options={...f.options,wallNow:()=>clock,assertProcessOwner:()=>{if(!owned)throw Error('daemon guard lost');}};
  const a=new RecoveryStore(f.repo,f.turn.runId,options),b=new RecoveryStore(f.repo,f.turn.runId,options);
  const claims=await Promise.allSettled([a.claim(100),b.claim(100)]);assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
  const first=a.status().owner!;const oldPorts=a.ports(first.generation,f.turn.attemptId,first.leaseId);
  clock=1101;const next=await b.claim(100);assert.equal(next.generation,first.generation+1);
  await assert.rejects(()=>oldPorts.stageImmutableValue(f.turn.runId,{late:true}),{code:'ownership-lost'});
  await b.renew(next.leaseId,next.generation,100);await b.requestCompletion(next.leaseId,next.generation);
  await b.recordCompletion(next.leaseId,next.generation,'CR-receipt');await b.recordCompletion(next.leaseId,next.generation,'CR-receipt');
  await assert.rejects(()=>b.recordCompletion(next.leaseId,next.generation,'different'));
  assert.equal(b.status().state,'completed');assert.equal(b.status().completionReceipt,'CR-receipt');
  owned=false;assert.throws(()=>a.status());
 }finally{f.cleanup();}
});
