/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuationFixture } from './continuation-fixtures.js';
import { inspectionFixture } from './ledger-fixtures.js';
import { InvestigationNavigation } from '../navigation.js';
test('Pinned navigation and changed-entity impact scope parity',async()=>{
 const f=continuationFixture(),receipt=inspectionFixture(f.basis),signal=new AbortController().signal;
 const context={...f.context,inspect:async()=>({read:receipt.readReceipt!,inspection:receipt})};
 const source=new InvestigationNavigation(f.turn,context,signal,async()=>{});
 const read=await source.read(receipt.readReceipt!.reference);assert.ok(read.evidenceId);assert.equal(source.capability().queryChangedEntityCallers,null);
 let queried=0,questions=0;
 const indexed=new InvestigationNavigation(f.turn,{...context,impact:{mode:'indexed-impact',index:{revision:'idx',freshness:'stale',completeness:'partial'},queryChangedEntityCallers:async()=>{queried++;return [];}},changedEntity:ref=>ref==='changed'?{blockId:'block-1',sourceDigest:'a'.repeat(64)}:null},signal,async()=>{questions++;});
 const query=indexed.capability().queryChangedEntityCallers!;
 await assert.rejects(()=>query('foreign'),{code:'impact-unavailable'});assert.equal(queried,0);
 assert.deepEqual(await query('changed'),[]);assert.equal(questions,1);assert.ok(indexed.basis.requirements.some(r=>r.category==='impact'));assert.deepEqual(indexed.basis.subject.packets,f.basis.subject.packets);
 const wrong=new InvestigationNavigation(f.turn,{...context,inspect:async()=>({read:{...receipt.readReceipt!,reference:'foreign'},inspection:receipt})},signal,async()=>{});
 await assert.rejects(()=>wrong.read(receipt.readReceipt!.reference),{code:'invalid-progress'});
});
