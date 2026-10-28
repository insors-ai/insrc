/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basisFixture } from './ledger-fixtures.js';
import { admitLedgerEvidence } from '../ledger-evidence.js';
import type { LedgerBasis, TrustedInspectionReceipt } from '../ledger-types.js';
import { inspectionFixture } from './ledger-fixtures.js';
test('Trusted receipt admission, provenance, completeness and replay',()=>{
 const basis=basisFixture(),receipt=inspectionFixture(basis),evidence=admitLedgerEvidence(basis,receipt,receipt.attempt);
 assert.equal(evidence.role,'changed-scope');assert.equal(evidence.evidenceId,admitLedgerEvidence(basis,receipt,receipt.attempt).evidenceId);
 assert.throws(()=>admitLedgerEvidence(basis,receipt,{...receipt.attempt,attemptId:'another'}),{code:'provenance-mismatch'});
 assert.throws(()=>admitLedgerEvidence(basis,{...receipt,source:{...receipt.source,path:'foreign.ts'}},receipt.attempt),{code:'provenance-mismatch'});
 assert.throws(()=>admitLedgerEvidence(basis,{...receipt,source:{...receipt.source,lines:[1,3]}},receipt.attempt),{code:'provenance-mismatch'});
 assert.throws(()=>admitLedgerEvidence(basis,{...receipt,attempt:{...receipt.attempt,runId:'another'}},receipt.attempt),{code:'provenance-mismatch'});
 const fail:TrustedInspectionReceipt={...receipt,receiptId:'test-1',kind:'test-result',role:'context-only',source:{...receipt.source,revision:basis.subject.build.sourceCommit},readReceipt:null,blockId:null,testResult:'fail'};
 const passing={...fail,testResult:'pass' as const};assert.notEqual(admitLedgerEvidence(basis,fail,fail.attempt).evidenceId,admitLedgerEvidence(basis,passing,passing.attempt).evidenceId);
 const stale:TrustedInspectionReceipt={...fail,receiptId:'index-1',kind:'caller-impact',testResult:null,index:{sourceCommit:basis.subject.build.sourceCommit,indexId:'index',freshness:'stale',coverage:'partial'}};
 assert.throws(()=>admitLedgerEvidence(basis,stale,stale.attempt),{code:'provenance-mismatch'});
 assert.equal(admitLedgerEvidence(basis,{...stale,completeness:'partial',limitations:['Stale partial index']},stale.attempt).completeness,'partial');
});
