/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryFixture } from './recovery-fixtures.js';
import { RecoveryStore } from '../recovery-store.js';
import type { ReviewUsageObservationV1 } from '../types.js';
function observation(f:ReturnType<typeof recoveryFixture>):ReviewUsageObservationV1{return {runId:f.turn.runId,attemptId:f.turn.attemptId,observationId:'usage-1',activity:'code-review',chargedArtifactId:f.basis.subject.build.artifactId,subjectArtifactId:f.basis.subject.build.artifactId,providerRequestId:null,quality:'unavailable',providerId:'fixture',modelId:null,granularity:'invocation-total',counters:{inputUncachedTokens:null,cacheReadTokens:null,cacheWriteTokens:null,outputTokens:null,reasoningTokens:null},nativeObservationRef:null,allowanceTokens:128000,elapsedActiveMs:5};}
test('Usage identity, null quality counters and conflicting observation refusal',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000);await f.store.issueAttempt(lease.leaseId,lease.generation,f.turn,1000);
  const u=observation(f);assert.equal((await f.store.recordUsage(u)).state,'pending');
  const recovered=f.store.replay();assert.equal(recovered.state.usage[0]!.observation.quality,'unavailable');assert.ok(Object.values(recovered.state.usage[0]!.observation.counters).every(n=>n===null));
  await f.store.recordUsage(u);assert.equal(f.store.replay().state.usage.length,1);
  await assert.rejects(()=>f.store.recordUsage({...u,elapsedActiveMs:7}));
  await assert.rejects(()=>f.store.recordUsage({...u,observationId:'bad',counters:{...u.counters,outputTokens:1000}}));
  await assert.rejects(()=>f.store.recordUsage({...u,observationId:'foreign',attemptId:'not-issued'}));
  await f.store.release(lease.leaseId,lease.generation,'cancelled');
  await f.store.recordUsage({...u,observationId:'late-actual',quality:'reported',counters:{...u.counters,outputTokens:10},nativeObservationRef:'native-1'});
  assert.equal(f.store.status().state,'cancelled');assert.equal(f.store.status().activeMsConsumed,1000);
 }finally{f.cleanup();}
});
test('Durable pending-before-write outbox and lost receipt deduplication',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000);await f.store.issueAttempt(lease.leaseId,lease.generation,f.turn,1000);
  const seen=new Map<string,string>();let writes=0,fail=true;
  const writer={idempotent:true as const,write:async (_u:ReviewUsageObservationV1,key:string)=>{writes++;assert.equal(f.store.replay().state.usage[0]!.state,'pending');if(!seen.has(key))seen.set(key,'receipt-1');if(fail)throw Error('external write succeeded; transport ACK lost');return seen.get(key)!;}};
  const store=new RecoveryStore(f.repo,f.turn.runId,{...f.options,usageWriter:writer});const u=observation(f);
  assert.equal((await store.recordUsage(u)).state,'pending');assert.equal(seen.size,1);fail=false;
  const reopened=new RecoveryStore(f.repo,f.turn.runId,{...f.options,usageWriter:writer});await reopened.drainUsage();
  assert.equal(reopened.replay().state.usage[0]!.state,'recorded');assert.equal(seen.size,1);assert.equal(writes,2);
  await reopened.recordUsage(u);assert.equal(writes,2);assert.equal(reopened.status().continuationsConsumed,1);
 }finally{f.cleanup();}
});
