/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryFixture } from './recovery-fixtures.js';
import { RecoveryStore } from '../recovery-store.js';
import { durableInvestigationBackend } from '../recovery-attempts.js';
import { runInvestigationContinuation, InvestigationTransientError } from '../continuation.js';
import { finalReply, progressFor } from './continuation-fixtures.js';
test('Reservation settlement, inactive pause and audited extension accounting',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000);
  await f.store.issueAttempt(lease.leaseId,lease.generation,f.turn,1000);assert.equal(f.store.status().activeMsConsumed,1000);
  await f.store.settleAttempt(lease.leaseId,lease.generation,f.turn.attemptId,'accepted',7);
  assert.equal(f.store.status().activeMsConsumed,7);assert.equal(f.store.status().continuationsConsumed,1);
  await assert.rejects(()=>f.store.issueAttempt(lease.leaseId,lease.generation,f.turn,1000));
  await assert.rejects(()=>f.store.extendAllowance(lease.leaseId,lease.generation,1,1,'shrink'));
  await assert.rejects(()=>f.store.extendAllowance(lease.leaseId,lease.generation,8000000,25,''));
  await f.store.extendAllowance(lease.leaseId,lease.generation,8000000,25,'Explicit test extension');
  await f.store.release(lease.leaseId,lease.generation);
  const reopened=new RecoveryStore(f.repo,f.turn.runId,f.options);assert.equal(reopened.status().activeMsConsumed,7);assert.equal(reopened.replay().accounting.activeLimitMs,8000000);
  await reopened.claim(300000);assert.equal(reopened.status().activeMsConsumed,7);
 }finally{f.cleanup();}
});
test('Issued-before-dispatch retry identities and uncertain attempt recovery',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000);let calls=0,clock=0;
  const backend=durableInvestigationBackend(f.store,lease.leaseId,lease.generation,{...f.context.backend,execute:async (turn,tools)=>{
   calls++;assert.equal(f.store.status().continuationsConsumed,calls);assert.equal(f.store.status().attempts.at(-1)!.attemptId,turn.attemptId);clock+=5;
   if(calls===1)throw new InvestigationTransientError();const receipt=await tools.progress(progressFor(turn,'block-1',0));return finalReply(turn,[receipt.progressId],1);
  }},()=>clock);
  const ports=f.store.ports(lease.generation,f.turn.attemptId,lease.leaseId);
  await runInvestigationContinuation(f.turn,{...f.context,backend,ports:{...ports,recordAttemptUsage:f.context.ports.recordAttemptUsage}});
  assert.equal(calls,2);const view=f.store.replay();assert.equal(view.accounting.attempts.length,2);assert.equal(view.state.sequence,1);assert.equal(view.accounting.attempts[1]!.priorAttemptId,f.turn.attemptId);assert.equal(view.state.consumedActiveMs,10);
  const next={...f.turn,attemptId:'interrupted'};await f.store.issueAttempt(lease.leaseId,lease.generation,next,1000);
  const restarted=new RecoveryStore(f.repo,f.turn.runId,{...f.options,processEpoch:'new-daemon'});const current=await restarted.claim(300000);
  assert.equal(restarted.status().attempts.at(-1)!.state,'uncertain');assert.equal(restarted.status().activeMsConsumed,1010);
  await assert.rejects(()=>f.store.settleAttempt(lease.leaseId,lease.generation,'interrupted','accepted',0),{code:'ownership-lost'});
  assert.equal(current.generation,lease.generation+1);
 }finally{f.cleanup();}
});
