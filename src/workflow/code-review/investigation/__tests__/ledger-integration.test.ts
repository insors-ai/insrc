/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectFixture } from './fixtures.js';
import { catalogFixture, basisFixture, inspectionFixture } from './ledger-fixtures.js';
import { prepareReviewSubject } from '../subject.js';
import { readReviewSource, sourceReference } from '../source.js';
import { buildLedgerBasis } from '../ledger-catalog.js';
import { initializeReviewLedger, applyReviewLedgerDelta, validateReviewLedger } from '../ledger.js';
import { admitLedgerEvidence } from '../ledger-evidence.js';
import { ledgerDigest } from '../ledger-identity.js';
import type { CoverageV1, TrustedInspectionReceipt } from '../ledger-types.js';

test('Pinned sc1-to-ledger integration and legacy obligation compatibility',async()=>{
 const f=await subjectFixture();try{
  const subject=await prepareReviewSubject(f.request,f.deps),input=catalogFixture();
  const lld={pin:subject.contracts.find(p=>p.artifactId==='LLD-root-s1')!,artifact:{...input.lld!.artifact,meta:{...input.lld!.artifact.meta,repoPath:f.dir}}};
  const plan={pin:subject.contracts.find(p=>p.artifactId==='PLAN-root-s1')!,artifact:{...input.plan!.artifact,meta:{...input.plan!.artifact.meta,repoPath:f.dir}}};
  const basis=buildLedgerBasis({...input,subject,repoPath:f.dir,lld,plan});const initial=initializeReviewLedger(basis);
  const block=subject.packets[0]!.blocks[0]!,oid=block.oldBlob!,reference=sourceReference({kind:'blob',oid,start:1,end:1});
  const read=await readReviewSource(subject,reference,{},f.deps);
  const receipt:TrustedInspectionReceipt={receiptId:'real-read',attempt:{runId:basis.runId,subjectDigest:subject.subjectDigest,attemptId:'real-attempt'},kind:'changed-block',
   source:{path:block.oldPath!,revision:f.parentId,digest:read.sourceDigest,lines:read.lines},role:'changed-scope',completeness:read.completeness,limitations:read.limitations,
   contentRef:read.contentRef,readReceipt:read,blockId:block.blockId,artifactId:null,testResult:null,index:null};
  const e=admitLedgerEvidence(basis,receipt,receipt.attempt),ctx={attempt:receipt.attempt,receipts:[receipt]};
  const assessments=initial.coverage.filter(r=>r.category==='task'||r.category==='change').map(r=>({...r,disposition:'satisfied' as const,evidenceIds:[e.evidenceId],rationale:'Inspected pinned source',assessedByAttempt:ctx.attempt.attemptId}));
  const result=applyReviewLedgerDelta(initial,{receiptIds:[receipt.receiptId],findings:[],assessments},basis,ctx);assert.equal(result.evidence.length,1);assert.equal(result.coverage.filter(r=>r.disposition==='satisfied').length,2);
  const partial=await readReviewSource(subject,sourceReference({kind:'context',path:'a.txt',start:1,end:10}),{lines:1},f.deps);
  const limited:TrustedInspectionReceipt={...receipt,receiptId:'partial-read',kind:'context-source',role:'context-only',source:{path:'a.txt',revision:subject.build.sourceCommit,digest:partial.sourceDigest,lines:partial.lines},completeness:partial.completeness,limitations:partial.limitations,contentRef:partial.contentRef,readReceipt:partial,blockId:null};
  const pe=admitLedgerEvidence(basis,limited,limited.attempt);
  assert.throws(()=>applyReviewLedgerDelta(initial,{receiptIds:[limited.receiptId],findings:[],assessments:[{...assessments[0]!,evidenceIds:[pe.evidenceId]}]},basis,{attempt:limited.attempt,receipts:[limited]}),{code:'invalid-input'});
  assert.throws(()=>admitLedgerEvidence(basis,{...limited,kind:'changed-block',role:'changed-scope',blockId:block.blockId},limited.attempt),{code:'provenance-mismatch'});
  assert.equal(result.coverage.filter(r=>r.category==='change').length,subject.packets.flatMap(p=>p.blocks).length);
 }finally{f.close();}
});
test('ledger rejects malformed provenance and preserves unresolved history atomically',()=>{
 const basis=basisFixture(),receipt=inspectionFixture(basis),initial=initializeReviewLedger(basis),ctx={attempt:receipt.attempt,receipts:[receipt]},before=ledgerDigest(initial),task=initial.coverage.find(r=>r.category==='task')!;
 const unverified:CoverageV1={...task,disposition:'unverified',rationale:'Evidence unavailable; retry later',assessedByAttempt:ctx.attempt.attemptId};
 const result=applyReviewLedgerDelta(initial,{receiptIds:[],findings:[],assessments:[unverified]},basis,ctx);assert.equal(result.coverage.find(r=>r.rowId===task.rowId)?.disposition,'unverified');
 const invalids=[{...unverified,disposition:'satisfied' as const},{...unverified,disposition:'not-applicable' as const},{...unverified,rowId:'foreign'},{...unverified,assessedByAttempt:'forged'}];
 for(const update of invalids)assert.throws(()=>applyReviewLedgerDelta(initial,{receiptIds:[],findings:[],assessments:[update]},basis,ctx));assert.equal(ledgerDigest(initial),before);
 const bad={...receipt,source:{...receipt.source,digest:'bad'}};assert.throws(()=>admitLedgerEvidence(basis,bad,ctx.attempt),{code:'provenance-mismatch'});
 const unavailable:TrustedInspectionReceipt={...receipt,receiptId:'missing',completeness:'unavailable',limitations:['Missing source'],source:{...receipt.source,lines:null},readReceipt:{...receipt.readReceipt!,text:null,lines:null,completeness:'unavailable',limitations:['Missing source']}};
 const e=admitLedgerEvidence(basis,unavailable,ctx.attempt);
 assert.throws(()=>applyReviewLedgerDelta(initial,{receiptIds:['missing'],findings:[],assessments:[{...unverified,disposition:'satisfied',evidenceIds:[e.evidenceId]}]},basis,{attempt:ctx.attempt,receipts:[unavailable]}),{code:'invalid-input'});
 const retained=applyReviewLedgerDelta(initial,{receiptIds:['missing'],findings:[],assessments:[{...unverified,evidenceIds:[e.evidenceId]}]},basis,{attempt:ctx.attempt,receipts:[unavailable]});assert.equal(retained.coverage.length,initial.coverage.length);
 assert.throws(()=>validateReviewLedger({...result,runId:'foreign'},basis,ctx),{code:'subject-mismatch'});
 const test:TrustedInspectionReceipt={...receipt,receiptId:'test',kind:'test-result',role:'context-only',source:{...receipt.source,revision:basis.subject.build.sourceCommit},readReceipt:null,blockId:null,testResult:'pass'};
 const passing=admitLedgerEvidence(basis,test,ctx.attempt),testRow=initial.coverage.find(r=>r.requirementRef.endsWith('/testStrategy'))!;
 assert.equal(applyReviewLedgerDelta(initial,{receiptIds:['test'],findings:[],assessments:[{...testRow,disposition:'satisfied',evidenceIds:[passing.evidenceId],rationale:'Verified matching test pass',assessedByAttempt:ctx.attempt.attemptId}]},basis,{attempt:ctx.attempt,receipts:[test]}).evidence.length,1);
});
