/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectFixture } from '../../workflow/code-review/investigation/__tests__/fixtures.js';
import { continuationFixture,finalReply,progressFor } from '../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { ArtifactStore } from '../../workflow/artifact-core/store.js';
import { History } from '../../workflow/artifact-core/history.js';
import { createFileSidecarStore } from '../../workflow/artifact-core/sidecar-store.js';
import { createFileJournal } from '../../workflow/artifact-core/journal.js';
import { creationContextProvider } from '../../workflow/artifact-core/codecs.js';
import { emptyLifecycle } from '../../workflow/artifact-core/decode.js';
import { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
import { approvedScopeReference } from '../review-investigation-work.js';
import { InvestigationRepository } from '../review-investigation-repository.js';
import { dispatchInvestigation,investigationTransport,legacyInvestigationDiagnostics } from '../review-investigation-gateway.js';
import { parseInvestigationEnvelope } from '../../shared/review-investigation-wire.js';
import { handleCodeReviewStep,DEFAULT_DEPS } from '../steps/code-review-step/handler.js';
import { codeReviewRunStart } from '../code-review-rpc.js';
import type { ReviewControllerBudgetDeclaration } from '../../shared/review-budget.js';
import type { InvestigationTurnV1 } from '../../workflow/code-review/investigation/continuation-types.js';
import {fixture,caps,buildId} from './review-investigation-fixtures.js';
test('Entry parity across daemon controller source and indexed planned and planless runs',async()=>{
 for(const controller of [false,true])for(const planned of [false,true])for(const indexed of [false,true]){
  const f=await fixture(controller,planned,indexed);try{
   assert.equal((await legacyInvestigationDiagnostics({repo:f.dir,buildArtifactId:buildId},{repository:async()=>f.repository})).status,null);
   const first=await f.dispatch(f.envelope(f.start));const runId=String(first.runId??(first.turn as InvestigationTurnV1)?.runId);
   if(controller){
    const before=(await f.repository.service.open(runId)).store.journal.events().length;const status=await f.dispatch(f.envelope({version:1,engine:'plan-investigation-v1',operation:'status',repo:f.dir,runId}));assert.equal((status.status as {receipt:unknown}).receipt,null);assert.equal((await f.repository.service.open(runId)).store.journal.events().length,before);const reconnected=await f.dispatch(f.envelope({version:1,engine:'plan-investigation-v1',operation:'resume',repo:f.dir,runId}));assert.deepEqual(reconnected.binding,first.binding);
    assert.equal(first.next,'investigate');const turn=first.turn as InvestigationTurnV1,binding=first.binding as Record<string,unknown>,navigation=first.navigation as {sourceRefs:string[]};
    const command={version:1,engine:'plan-investigation-v1',repo:f.dir,runId,bindingId:binding.bindingId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,requestDigest:turn.requestDigest};
    await assert.rejects(()=>f.dispatch(f.envelope({...command,generation:turn.generation+1,operation:'read',reference:navigation.sourceRefs[0]})));
    await assert.rejects(()=>f.dispatch(f.envelope({...command,bindingId:'foreign',operation:'read',reference:navigation.sourceRefs[0]})));
    await assert.rejects(()=>f.dispatch({...f.envelope({...command,operation:'read',reference:navigation.sourceRefs[0]}),reviewBudget:undefined}));
    const read=await f.dispatch(f.envelope({...command,operation:'read',reference:navigation.sourceRefs.find(r=>JSON.parse(r).kind==='blob')}));assert.equal(read.next,'accepted');
    await f.dispatch(f.envelope({...command,operation:'progress',progress:progressFor(turn,f.packet.blocks[0]!.blockId,0)}));
    const state=(await f.repository.service.open(runId)).store.replay().state;
    await f.dispatch(f.envelope({...command,operation:'reply',reply:{...finalReply(turn,state.accepted.map(a=>a.receipt.progressId),state.sequence),next:{kind:'pause',remainingWork:[state.ledger.coverage[0]!.requirementRef],reason:'Scripted host fixture'}}}));
    // Wait for the bounded continuation to drain without issuing another model attempt.
    for(let n=0;n<100&&(await f.repository.service.open(runId)).store.status().owner;n++)await new Promise(r=>setTimeout(r,5));
   }else assert.equal(f.calls(),1);
   const status=await f.repository.view(runId);assert.equal(status.engine,'plan-investigation-v1');
   const view=(await f.repository.service.open(runId)).store.replay();assert.equal(view.state.sequence,1);assert.equal(view.state.attempts,1);assert.equal(view.lifecycle.completionReceipt,null);
   assert.equal(view.basis.subject.taskBasis,planned?'approved-plan':'approved-upstream');assert.equal(view.basis.requirements.some(r=>r.category==='impact'),indexed);
   assert.ok(view.state.ledger.coverage.some(r=>r.disposition==='pending'));assert.equal(view.basis.subject.build.sourceCommit,f.commitId);
  }finally{f.close();}
 }
});
test('Cross engine schema generation and capability replay are rejected',async()=>{
 const f=await fixture(true,false,false);try{
  const envelope=f.envelope(f.start);assert.ok(parseInvestigationEnvelope(envelope));
  for(const bad of [{...envelope,engine:'legacy'},{...envelope,version:2},{...envelope,capabilities:{...caps,canonicalInvestigationVersions:[]}},{...envelope,party:'daemon'},{...envelope,state:'legacy-token'}])await assert.rejects(()=>f.dispatch(bad));
  let legacy=0;const refused=async(raw:unknown)=>{parseInvestigationEnvelope(raw);throw Error('generation or binding mismatch');};
  const bad={...envelope,engine:'unknown'};
  const step=await handleCodeReviewStep(bad,{...DEFAULT_DEPS,investigation:refused,resolveSubject:async()=>{legacy++;throw Error('legacy');}});assert.equal(step.isError,true);
  const messages:unknown[]=[];await codeReviewRunStart(bad,m=>messages.push(m),new AbortController().signal,{investigation:refused,resolveSubject:async()=>{legacy++;throw Error('legacy');}});assert.equal(legacy,0);assert.equal(messages.length,1);
  const result=await investigationTransport(bad,refused);assert.equal(result.legacyFallback,false);
 }finally{f.close();}
});

test('Canonical repository publication completes without a second model call',async()=>{
 const f=await fixture(false,true,false,true);try{const result=await f.dispatch(f.envelope(f.start));assert.equal(result.next,'done');assert.ok(result.receipt);assert.equal(f.calls(),1);const receipt=result.receipt as {artifactId:string};assert.equal((await f.repository.options.canonical.history.log(receipt.artifactId)).length,1);const replay=await f.repository.complete(String(result.runId));assert.deepEqual(replay.receipt,result.receipt);assert.equal(f.calls(),1);}finally{f.close();}
});
