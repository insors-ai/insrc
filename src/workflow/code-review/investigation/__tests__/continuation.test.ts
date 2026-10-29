/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuationFixture } from './continuation-fixtures.js';
import { catalogFixture } from './ledger-fixtures.js';
import { identifySubject } from '../identity.js';
import { buildLedgerBasis } from '../ledger-catalog.js';
import { initializeReviewLedger } from '../ledger.js';
import { buildInvestigationSeed, investigationRequestDigest } from '../continuation-policy.js';
import { runInvestigationContinuation, InvestigationTransientError } from '../continuation.js';
import type { InvestigationTurnV1, InvestigationReplyV1, ReviewBlockProgressV1 } from '../continuation-types.js';
import { twoBlockFixture, progressFor, finalReply } from './continuation-fixtures.js';
test('Grouped continuation execution, bounded retries and cancellation',async()=>{
 const f=twoBlockFixture();let calls=0;
 const backend={...f.context.backend,execute:async(turn,tools)=>{calls++;assert.equal(tools.execution.internalRetry,false);const a=await tools.progress(progressFor(turn,'block-1',0));const b=await tools.progress(progressFor(turn,'block-2',1));return finalReply(turn,[a.progressId,b.progressId],2);}} satisfies typeof f.context.backend;
 const done=await runInvestigationContinuation(f.turn,{...f.context,backend});assert.equal(calls,1);assert.equal(done.lastAcceptedSequence,2);assert.ok(done.next.remainingWork.length>0);assert.equal(f.states.at(-1)?.attempts,1);
 const retry=twoBlockFixture();let attempted=0;const identities:string[]=[];
 const retried=await runInvestigationContinuation(retry.turn,{...retry.context,backend:{...retry.context.backend,execute:async(turn,tools)=>{
  attempted++;identities.push(turn.attemptId);const seq=attempted-1;const p=await tools.progress(progressFor(turn,`block-${attempted}`,seq));
  if(attempted===1)throw new InvestigationTransientError();
  const prior=retry.states.at(-1)!.accepted.map(a=>a.receipt.progressId);return finalReply(turn,prior,p.sequence);
 }}});assert.equal(attempted,2);assert.notEqual(identities[0],identities[1]);assert.equal(retried.lastAcceptedSequence,2);assert.equal(retry.states.at(-1)?.attempts,2);
 const cancel=twoBlockFixture(),abort=new AbortController();
 const paused=await runInvestigationContinuation(cancel.turn,{...cancel.context,signal:abort.signal,backend:{...cancel.context.backend,execute:async(turn,tools)=>{
  await tools.progress(progressFor(turn,'block-1',0));cancel.setClock(1000);abort.abort();return new Promise(()=>{});
 }}});assert.equal(paused.next.kind,'pause');assert.equal(paused.next.reason,'cancelled');assert.equal(paused.lastAcceptedSequence,1);assert.equal(cancel.states.at(-1)?.consumedActiveMs,1000);
 const bounded=twoBlockFixture();let failures=0;const failed=await runInvestigationContinuation(bounded.turn,{...bounded.context,backend:{...bounded.context.backend,execute:async()=>{failures++;throw new InvestigationTransientError();}}});assert.equal(failures,2);assert.equal(failed.next.kind,'pause');
});

test('Continuation mode, deadline and final-reply refusals',async()=>{
 const yieldOnce=twoBlockFixture();
 const accepted=await runInvestigationContinuation(yieldOnce.turn,{...yieldOnce.context,backend:{...yieldOnce.context.backend,qualification:{...yieldOnce.context.backend.qualification,progressMode:'block-yield'},execute:async(turn,tools)=>{const r=await tools.progress(progressFor(turn,'block-1',0));return finalReply(turn,[r.progressId],1);}}});assert.equal(accepted.lastAcceptedSequence,1);
 const yieldTwice=twoBlockFixture();
 const bounded=await runInvestigationContinuation(yieldTwice.turn,{...yieldTwice.context,backend:{...yieldTwice.context.backend,qualification:{...yieldTwice.context.backend.qualification,progressMode:'block-yield'},execute:async(turn,tools)=>{await tools.progress(progressFor(turn,'block-1',0));await tools.progress(progressFor(turn,'block-2',1));throw Error('unreachable');}}});assert.equal(bounded.next.kind,'pause');assert.equal(bounded.next.reason,'unsupported-backend');assert.equal(bounded.lastAcceptedSequence,1);
 const unsupported=twoBlockFixture();let dispatches=0;
 await assert.rejects(()=>runInvestigationContinuation(unsupported.turn,{...unsupported.context,backend:{...unsupported.context.backend,qualification:{...unsupported.context.backend.qualification,readOnly:false},execute:async()=>{dispatches++;throw Error('unreachable');}}}),{code:'unsupported-backend'});assert.equal(dispatches,0);
 const expired=twoBlockFixture(),short={...expired.turn,limits:{...expired.turn.limits,attemptMs:30}};
 const timed=await runInvestigationContinuation({...short,requestDigest:investigationRequestDigest(short,expired.context.seed)},{...expired.context,now:()=>performance.now(),backend:{...expired.context.backend,execute:async()=>new Promise(()=>{})}});assert.equal(timed.next.kind,'pause');assert.equal(timed.next.reason,'budget-refused');assert.ok(expired.states.at(-1)!.consumedActiveMs>0);
 for(const property of ['coverageUpdates','findings','next'] as const){
  const f=twoBlockFixture();let calls=0;
  const bad=await runInvestigationContinuation(f.turn,{...f.context,backend:{...f.context.backend,execute:async turn=>{calls++;return {...finalReply(turn,[],0),[property]:property==='next'?{kind:'approved',remainingWork:[],reason:'forged completion'}:[{}]} as InvestigationReplyV1;}}});
  assert.equal(bad.next.kind,'pause');assert.equal(bad.next.reason,'invalid-progress');assert.equal(calls,1);
 }
});
