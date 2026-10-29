/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LLMProvider, ReviewSessionOpts } from '../../../../shared/types.js';
import { subjectFixture } from './fixtures.js';
import { catalogFixture } from './ledger-fixtures.js';
import { continuationFixture, finalReply, progressFor } from './continuation-fixtures.js';
import { prepareReviewSubject, assertReviewSubjectFresh } from '../subject.js';
import { buildLedgerBasis } from '../ledger-catalog.js';
import { initializeReviewLedger } from '../ledger.js';
import { buildInvestigationSeed, investigationRequestDigest } from '../continuation-policy.js';
import { runInvestigationContinuation } from '../continuation.js';
import { readReviewSource, sourceReference } from '../source.js';
import { BlockProgressCoordinator } from '../progress.js';
import type { InvestigationContext, InvestigationTools, InvestigationTurnV1 } from '../continuation-types.js';
import type { TrustedInspectionReceipt } from '../ledger-types.js';

async function integrated(cancelAfterFirst:boolean){
 const f=await subjectFixture(),base=continuationFixture(),catalog=catalogFixture(),abort=new AbortController();
 try{
  const build='BUILD-c32aa60534232f36-s1';f.setInputs({...f.inputs,build:{...f.inputs.build,artifactId:build}});f.setProof({...f.proof,buildArtifactId:build,exclusive:true,blockIds:[]});
  const subject=await prepareReviewSubject({...f.request,buildArtifactId:build},f.deps);
  const input={...catalog,subject,repoPath:f.dir,lld:{pin:subject.contracts.find(p=>p.artifactId==='LLD-root-s1')!,artifact:{...catalog.lld!.artifact,meta:{...catalog.lld!.artifact.meta,repoPath:f.dir}}},
   plan:{pin:subject.contracts.find(p=>p.artifactId==='PLAN-root-s1')!,artifact:{...catalog.plan!.artifact,meta:{...catalog.plan!.artifact.meta,repoPath:f.dir}}}};
  const basis=buildLedgerBasis(input),state={...base.context.state,ledger:initializeReviewLedger(basis)},seed=buildInvestigationSeed(basis,state);
  const t={...base.turn,subjectDigest:subject.subjectDigest};const turn={...t,requestDigest:investigationRequestDigest(t,seed)};
  let tools!:InvestigationTools,activeTurn!:InvestigationTurnV1,modelCalls=0;const acknowledged:string[]=[];
  const provider:LLMProvider={...base.provider,runReviewSession:async<T>(_prompt:string,_schema,opts:ReviewSessionOpts):Promise<T>=>{
   modelCalls++;assert.equal(opts.internalRetry,false);assert.ok(opts.reviewBudget);assert.ok(opts.signal);
   for(const [index,block]of subject.packets[0]!.blocks.entries()){
    const before=await tools.read(sourceReference({kind:'blob',oid:block.oldBlob!,start:block.oldLines![0],end:block.oldLines![1]}));
    const after=await tools.read(sourceReference({kind:'blob',oid:block.newBlob!,start:block.newLines![0],end:block.newLines![1]}));
    const row=basis.requirements.find(r=>r.category==='change'&&r.requirementRef.endsWith('/'+block.blockId))!;
    const coverage=initializeReviewLedger(basis).coverage.find(r=>r.requirementRef===row.requirementRef)!;
    const receipt=await tools.progress({runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:activeTurn.attemptId,
     progressId:`real-block-${index}`,expectedSequence:index,blockId:block.blockId,disposition:'reviewed',evidenceIds:[before.evidenceId,after.evidenceId],notes:'Inspected exact before/after block',
     coverageUpdates:[{...coverage,disposition:'satisfied',evidenceIds:[before.evidenceId,after.evidenceId],rationale:'Verified pinned before/after source',assessedByAttempt:activeTurn.attemptId}],findings:[],outstandingWork:[]});
    acknowledged.push(receipt.progressId);
    if(cancelAfterFirst&&index===0){abort.abort();return new Promise<T>(()=>{});}
   }
   return finalReply(activeTurn,acknowledged,acknowledged.length) as T;
  }};
  const context:InvestigationContext={...base.context,basis,state,seed,signal:abort.signal,now:()=>performance.now(),validation:{attempt:{runId:turn.runId,subjectDigest:turn.subjectDigest,attemptId:turn.attemptId},receipts:[]},
   assertFresh:()=>assertReviewSubjectFresh(subject,f.deps),
   backend:{...base.context.backend,provider,execute:async(value,capabilities,signal)=>{activeTurn=value;tools=capabilities;return provider.runReviewSession!(JSON.stringify({turn:value,seed:tools.seed}),base.context.schema,{cwd:f.dir,deadlineMs:tools.execution.timeoutMs,internalRetry:false,reviewBudget:tools.execution.budget,signal});}},
   inspect:async(reference,attemptId,signal)=>{
    signal.throwIfAborted();const read=await readReviewSource(subject,reference,{},f.deps),parsed=JSON.parse(reference);
    const packet=subject.packets[0]!,block=packet.blocks.find(b=>(b.oldBlob===parsed.oid&&b.oldLines?.[0]===parsed.start)||(b.newBlob===parsed.oid&&b.newLines?.[0]===parsed.start))!;
    const old=block.oldBlob===parsed.oid;
    const inspection:TrustedInspectionReceipt={receiptId:`${attemptId}:${block.blockId}:${old?'old':'new'}`,attempt:{runId:turn.runId,subjectDigest:turn.subjectDigest,attemptId},kind:'changed-block',source:{path:(old?block.oldPath:block.newPath)!,revision:old?packet.parentId:packet.commitId,digest:read.sourceDigest,lines:read.lines},role:'changed-scope',completeness:read.completeness,limitations:read.limitations,contentRef:read.contentRef,readReceipt:read,blockId:block.blockId,artifactId:null,testResult:null,index:null};
    return {read,inspection};
   }};
  const result=await runInvestigationContinuation(turn,context);assert.equal(modelCalls,1);assert.equal(result.lastAcceptedSequence,cancelAfterFirst?1:2);
  const accepted=base.states.at(-1)!;assert.equal(accepted.accepted.length,cancelAfterFirst?1:2);assert.equal(accepted.usage.length,1);
  for(const value of base.values.values())if(value&&typeof value==='object'&&'kind' in value&&value.kind==='block-progress'){
   assert.ok(base.values.has(value.basisRef as string));for(const ref of value.trustedReceiptRefs as string[])assert.ok(base.values.has(ref));
  }
  if(cancelAfterFirst)assert.equal(result.next.reason,'cancelled');else assert.equal(accepted.ledger.coverage.filter(r=>r.category==='change'&&r.disposition==='satisfied').length,2);
 }finally{f.close();}
}
test('Pinned source-ledger-progress integration and legacy compatibility',async()=>{await integrated(false);await integrated(true);});


test('Progress binding, staging and late-callback boundaries',async()=>{
 const f=continuationFixture(),owner=new BlockProgressCoordinator(f.turn,f.context),p=progressFor(f.turn,'block-1',0);
 for(const change of [{generation:2},{attemptId:'foreign'},{expectedSequence:1},{evidenceIds:['uninspected']}])await assert.rejects(()=>owner.accept({...p,...change}));
 assert.equal(owner.state.sequence,0);let appends=0;
 const staging=new BlockProgressCoordinator(f.turn,{...f.context,ports:{...f.context.ports,stageImmutableValue:async()=>{throw Error('cannot stage');},appendTransition:async()=>{appends++;throw Error('unexpected');}}});
 await assert.rejects(()=>staging.accept(p),{code:'acceptance-conflict'});assert.equal(appends,0);assert.equal(staging.state.uncertainProgressId,null);
 const late=continuationFixture();let tools!:InvestigationTools;
 await runInvestigationContinuation(late.turn,{...late.context,backend:{...late.context.backend,execute:async(turn,capabilities)=>{tools=capabilities;return finalReply(turn,[],0);}}});
 await assert.rejects(()=>tools.progress(progressFor(late.turn,'block-1',0)));assert.equal(late.states.at(-1)?.sequence,0);
});
