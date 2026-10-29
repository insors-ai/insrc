/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuationFixture } from './continuation-fixtures.js';
import { recordInvestigationUsage } from '../continuation-usage.js';
import type { ReviewUsageObservationV1 } from '../types.js';
test('Idempotent usage observations and retained active allowance',async()=>{
 const f=continuationFixture();let calls=0;
 const context={...f.context,ports:{...f.context.ports,recordAttemptUsage:async()=>{calls++;throw Error('writer unavailable');}}};
 const pending=await recordInvestigationUsage(f.turn,context,f.context.state,250);
 assert.equal(pending.usage[0]?.state,'pending');assert.equal(pending.usage[0]?.observation.quality,'unavailable');assert.ok(Object.values(pending.usage[0]!.observation.counters).every(n=>n===null));
 assert.equal(pending.usage[0]?.observation.granularity,'invocation-total');assert.equal(pending.usage[0]?.observation.chargedArtifactId,f.basis.subject.build.artifactId);
 assert.equal(await recordInvestigationUsage(f.turn,context,pending,250),pending);assert.equal(calls,1);
 const unavailable=pending.usage[0]!.observation;
 const actual:ReviewUsageObservationV1={...unavailable,observationId:'actual-model-call',providerRequestId:'native-call',quality:'reported',modelId:'model',granularity:'model-call',counters:{inputUncachedTokens:100,cacheReadTokens:25,cacheWriteTokens:10,outputTokens:20,reasoningTokens:5},nativeObservationRef:'native-receipt'};
 const recorded=await recordInvestigationUsage(f.turn,{...f.context,observeUsage:()=>actual},f.context.state,250);assert.equal(recorded.usage[0]?.state,'recorded');assert.equal(recorded.usage[0]?.observation.modelId,'model');
 await assert.rejects(()=>recordInvestigationUsage(f.turn,{...f.context,observeUsage:()=>({...actual,quality:'unavailable'})},f.context.state,250),{code:'invalid-binding'});
 const exhausted=await recordInvestigationUsage(f.turn,context,{...f.context.state,consumedActiveMs:f.context.policy.activeLimitMs},250);assert.equal(exhausted.usage[0]?.state,'pending');assert.equal(calls,1);
});
