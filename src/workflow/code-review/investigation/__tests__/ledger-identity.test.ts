/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageRowId, ledgerDigest, ledgerSnapshot, ledgerEqual } from '../ledger-identity.js';
import { digestValue } from '../identity.js';
import type { CoverageV1, ReviewLedgerV1, LedgerDelta } from '../ledger-types.js';
test('sc2 contracts, canonical identities and bounded immutable values',()=>{
 const value={ nested:{ b:2,a:1 } };const copy=ledgerSnapshot(value);assert.ok(Object.isFrozen(copy.nested));assert.notEqual(value.nested,copy.nested);
 assert.equal(ledgerEqual({a:1,b:2},{b:2,a:1}),true);assert.equal(ledgerEqual({a:1},{a:2}),false);
 assert.equal(ledgerDigest(value),digestValue(value));assert.equal(ledgerDigest(value),ledgerDigest({nested:{a:1,b:2}}));
 assert.notEqual(coverageRowId('s',{category:'task',requirementRef:'t1'}),coverageRowId('s',{category:'change',requirementRef:'t1'}));
 assert.notEqual(coverageRowId('s',{category:'task',requirementRef:'t1'}),coverageRowId('other',{category:'task',requirementRef:'t1'}));
 for(const value of [{a:undefined},{a:Infinity},new Date()])assert.throws(()=>ledgerSnapshot(value),{name:'ReviewLedgerError',code:'invalid-input'});
 assert.throws(()=>ledgerSnapshot({text:'x'.repeat(1024*1024)}),{code:'resource-limit'});
 const row:CoverageV1={rowId:'r',subjectDigest:'s',requirementRef:'t1',category:'task',disposition:'pending',evidenceIds:[],findingIds:[],rationale:'',assessedByAttempt:null};
 const ledger:ReviewLedgerV1={runId:'run',subjectDigest:'s',coverage:[row],evidence:[],findings:[]};
 const delta:LedgerDelta={receiptIds:['trusted-reference'],assessments:[],findings:[]};assert.equal(ledger.coverage.length,1);assert.deepEqual(Object.keys(delta).sort(),['assessments','findings','receiptIds']);
});
