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
export function twoBlockFixture(){
 const f=continuationFixture(),input=catalogFixture(),{subjectId:_,subjectDigest:__,...projection}=input.subject;
 const packet=input.subject.packets[0]!;
 const subject=identifySubject({...projection,packets:[{...packet,blocks:[...packet.blocks,{...packet.blocks[0]!,blockId:'block-2',kind:'mode'}]}]});
 const basis=buildLedgerBasis({...input,subject}),state={...f.context.state,ledger:initializeReviewLedger(basis)},seed=buildInvestigationSeed(basis,state);
 const context={...f.context,basis,state,seed,validation:{...f.context.validation,attempt:{...f.context.validation.attempt,subjectDigest:subject.subjectDigest}}};
 const t={...f.turn,subjectDigest:subject.subjectDigest};return {...f,basis,context,turn:{...t,requestDigest:investigationRequestDigest(t,seed)}};
}
export function progressFor(turn:InvestigationTurnV1,blockId:string,expectedSequence:number):ReviewBlockProgressV1{
 return {runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,progressId:`${turn.attemptId}-${blockId}`,expectedSequence,blockId,disposition:'unverified',evidenceIds:[],notes:'Needs additional inspection',coverageUpdates:[],findings:[],outstandingWork:[]};
}
export function finalReply(turn:InvestigationTurnV1,ids:readonly string[],sequence:number):InvestigationReplyV1{
 return {runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,acceptedBlockReceiptIds:ids,lastAcceptedSequence:sequence,inspectedEvidenceIds:[],coverageUpdates:[],findings:[],next:{kind:'continue',remainingWork:[],reason:'More work remains'}};
}
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
