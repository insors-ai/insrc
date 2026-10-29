/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryFixture } from '../../workflow/code-review/investigation/__tests__/recovery-fixtures.js';
import { recoveryCompatibility } from '../../workflow/code-review/investigation/recovery-lifecycle.js';
import { investigationStatus,legacyReviewStatus,boundedInvestigationStatus } from '../review-investigation-status.js';
import { progressFor } from '../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { BlockProgressCoordinator } from '../../workflow/code-review/investigation/progress.js';
import type { ReviewUsageObservationV1 } from '../../workflow/code-review/investigation/types.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';

test('Status reconnect progress accounting and pending unknown usage are truthful',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000),turn={...f.turn,generation:lease.generation};
  await f.store.issueAttempt(lease.leaseId,lease.generation,turn,1000);
  const coordinator=new BlockProgressCoordinator(turn,{...f.context,generation:lease.generation,ports:f.store.ports(lease.generation,turn.attemptId,lease.leaseId)});
  await coordinator.accept(progressFor(turn,'block-1',0));
  const unknown:ReviewUsageObservationV1={runId:turn.runId,attemptId:turn.attemptId,observationId:'unknown',activity:'code-review',chargedArtifactId:f.basis.subject.build.artifactId,subjectArtifactId:f.basis.subject.build.artifactId,providerRequestId:null,quality:'unavailable',providerId:'fixture',modelId:null,granularity:'invocation-total',counters:{inputUncachedTokens:null,cacheReadTokens:null,cacheWriteTokens:null,outputTokens:null,reasoningTokens:null},nativeObservationRef:null,allowanceTokens:128000,elapsedActiveMs:20};
  await f.store.ports(lease.generation,turn.attemptId,lease.leaseId).recordAttemptUsage(unknown);
  const before=f.store.journal.events().length,view=f.store.replay();
  const input={view,compatibility:recoveryCompatibility(view,view.manifest,true),readiness:{available:true,reason:null},receipt:null};
  const a=investigationStatus(input),b=investigationStatus(input);assert.deepEqual(a,b);assert.equal(f.store.journal.events().length,before);
  assert.equal(a.status.covered,0);assert.equal(a.status.required,view.basis.requirements.length);assert.ok(a.status.unresolved.length);assert.equal(a.diagnostics.latestBlockReceipt?.sequence,1);assert.equal(a.diagnostics.providerLivenessAt,null);
  assert.equal(a.status.consumption.estimatedInputTokens,null);assert.equal(a.status.consumption.reportedRef,null);assert.equal(a.diagnostics.usage.pendingAttempts,1);assert.equal(a.diagnostics.usage.unavailableAttempts,1);assert.ok(Object.values(view.state.usage[0]!.observation.counters).every(c=>c===null));assert.equal(a.status.resume.available,false);
  const stale=investigationStatus({...input,compatibility:recoveryCompatibility(view,view.manifest,false)});assert.equal(stale.status.state,'stale');assert.equal(stale.status.resume.available,false);
  const cumulative={...unknown,observationId:'cumulative',quality:'reported' as const,granularity:'cumulative-snapshot' as const,nativeObservationRef:'native-session-1',counters:{...unknown.counters,inputUncachedTokens:100}};
  const duplicateView={...view,state:{...view.state,usage:[...view.state.usage,{observation:cumulative,state:'recorded' as const,receiptRef:'existing-usage-reducer'}]}};
  const cumulativeStatus=investigationStatus({...input,view:duplicateView});assert.equal(cumulativeStatus.status.consumption.reportedRef,null);assert.equal(cumulativeStatus.status.consumption.estimatedInputTokens,null);
  const recorded=investigationStatus({...input,view:{...view,state:{...view.state,usage:[{observation:{...cumulative,granularity:'model-call'},state:'recorded',receiptRef:'deduplicated-usage'}]}}});assert.equal(recorded.status.consumption.reportedRef,'deduplicated-usage');
  const legacy=legacyReviewStatus({runId:'legacy',buildFingerprint:digestValue('build'),dimensions:[{name:'quality',completed:false}],phase:'quality'});assert.equal(legacy.diagnostics.coverageUnit,'legacy-dimension');assert.equal(legacy.status?.resume.available,false);assert.equal(legacy.status?.generation,0);assert.equal(legacyReviewStatus(null).status,null);
  assert.throws(()=>boundedInvestigationStatus({text:'x'.repeat(2*1024*1024)}),/bounded/);
  await f.store.settleAttempt(lease.leaseId,lease.generation,turn.attemptId,'accepted',20);await f.store.release(lease.leaseId,lease.generation,'paused');
  const after=f.store.replay(),paused=investigationStatus({...input,view:after,readiness:{available:false,reason:'Rollback disables scheduling'}});assert.equal(paused.status.resume.available,false);assert.match(paused.status.resume.reason!,/Rollback/);assert.equal(paused.status.consumption.activeMs,20);assert.equal(paused.status.consumption.continuationCount,1);
 }finally{f.cleanup();}
});
