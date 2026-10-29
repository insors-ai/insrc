/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { continuationFixture } from './continuation-fixtures.js';
import { inspectionFixture } from './ledger-fixtures.js';
import { InvestigationNavigation } from '../navigation.js';
import { applyReviewLedgerDelta } from '../ledger.js';
import type { TrustedInspectionReceipt } from '../ledger-types.js';
import type { ReviewReadReceiptV1 } from '../types.js';

function verifiedTest(result:'pass'|'fail'|'skipped'|'unknown'='pass'){
 const f=continuationFixture(),base=inspectionFixture(f.basis),reference=JSON.stringify({kind:'test-result',taskId:'t1'});
 const inspection:TrustedInspectionReceipt={...base,receiptId:'verified-test',kind:'test-result',role:'context-only',
  source:{...base.source,revision:f.basis.subject.build.sourceCommit,lines:null},contentRef:'test:verified',readReceipt:null,blockId:null,testResult:result};
 const read:ReviewReadReceiptV1={reference,sourceDigest:inspection.source.digest,contentRef:inspection.contentRef,
  text:`Verified test result: ${result}`,lines:null,completeness:'complete',limitations:[]};
 const navigation=(value={read,inspection})=>new InvestigationNavigation(f.turn,{...f.context,inspect:async()=>value},new AbortController().signal,async()=>{});
 return {...f,read,inspection,navigation};
}
test('Verified test navigation admits actual results and only passing evidence satisfies test obligations',async()=>{
 for(const result of ['pass','fail','skipped','unknown'] as const){
  const f=verifiedTest(result),nav=f.navigation(),read=await nav.read(f.read.reference);
  assert.ok(read.evidenceId);assert.equal(nav.validation().receipts[0]!.testResult,result);
  const row=f.context.state.ledger.coverage.find(r=>f.basis.requirements.some(x=>x.requirementRef===r.requirementRef&&x.needs==='test-pass'))!;
  const delta={receiptIds:[f.inspection.receiptId],findings:[],assessments:[{...row,disposition:'satisfied' as const,evidenceIds:[read.evidenceId],rationale:'Inspected matching native test result',assessedByAttempt:f.turn.attemptId}]};
  if(result==='pass')assert.equal(applyReviewLedgerDelta(f.context.state.ledger,delta,f.basis,nav.validation()).coverage.find(r=>r.rowId===row.rowId)!.disposition,'satisfied');
  else assert.throws(()=>applyReviewLedgerDelta(f.context.state.ledger,delta,f.basis,nav.validation()),{code:'invalid-input'});
 }
});
test('Test navigation rejects mismatched displays foreign provenance and unsupported receipts',async()=>{
 const f=verifiedTest();
 for(const read of [{...f.read,sourceDigest:'b'.repeat(64)},{...f.read,contentRef:'foreign'},{...f.read,lines:[1,1] as const},
  {...f.read,completeness:'partial' as const,limitations:['limited']},{...f.read,limitations:['changed']},{...f.read,reference:'foreign'},{...f.read,text:null},{...f.read,text:''}]){
  const nav=f.navigation({read,inspection:f.inspection});await assert.rejects(()=>nav.read(f.read.reference),{code:'invalid-progress'});assert.equal(nav.validation().receipts.length,0);
 }
 for(const inspection of [{...f.inspection,readReceipt:f.read},{...f.inspection,source:{...f.inspection.source,revision:'wrong-source'}},
  {...f.inspection,attempt:{...f.inspection.attempt,attemptId:'foreign'}},{...f.inspection,testResult:null},
  {...f.inspection,kind:'caller-impact' as const}]){
  const nav=f.navigation({read:f.read,inspection});await assert.rejects(()=>nav.read(f.read.reference));assert.equal(nav.validation().receipts.length,0);
 }
 const source=inspectionFixture(f.basis),nav=f.navigation({read:source.readReceipt!,inspection:source});
 assert.ok((await nav.read(source.readReceipt!.reference)).evidenceId);
 await assert.rejects(()=>f.navigation({read:{...source.readReceipt!,text:'forged'},inspection:source}).read(source.readReceipt!.reference),{code:'invalid-progress'});
});
test('Verified test navigation retains cancellation owner checks and receipt identity',async()=>{
 const f=verifiedTest(),abort=new AbortController();let inspected=0;
 abort.abort();const cancelled=new InvestigationNavigation(f.turn,{...f.context,inspect:async()=>{inspected++;return {read:f.read,inspection:f.inspection};}},abort.signal,async()=>{});
 await assert.rejects(()=>cancelled.read(f.read.reference));assert.equal(inspected,0);
 const owner=new InvestigationNavigation(f.turn,{...f.context,assertOwner:()=>{throw Error('owner lost');},inspect:async()=>({read:f.read,inspection:f.inspection})},new AbortController().signal,async()=>{});
 await assert.rejects(()=>owner.read(f.read.reference),/owner lost/);
 let inspection=f.inspection;
 const nav=new InvestigationNavigation(f.turn,{...f.context,inspect:async()=>({read:f.read,inspection})},new AbortController().signal,async()=>{});
 const first=await nav.read(f.read.reference);assert.equal((await nav.read(f.read.reference)).evidenceId,first.evidenceId);
 inspection={...inspection,testResult:'fail'};
 await assert.rejects(()=>nav.read(f.read.reference),{code:'invalid-progress'});assert.equal(nav.validation().receipts.length,1);
});
