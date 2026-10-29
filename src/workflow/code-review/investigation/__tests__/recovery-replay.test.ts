/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { recoveryFixture } from './recovery-fixtures.js';
import { progressFor } from './continuation-fixtures.js';
import { BlockProgressCoordinator } from '../progress.js';
import { RecoveryStore } from '../recovery-store.js';
import { ledgerDigest } from '../ledger-identity.js';
import type { BlockProgressTransitionV1 } from '../continuation-types.js';
test('Verified replay recomputes sc2 deltas and rejects forged candidates and corrupt closure',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const ports=f.store.ports(1,f.turn.attemptId);
  const p=progressFor(f.turn,'block-1',0);
  const basis=await ports.stageImmutableValue(f.turn.runId,{...f.basis});
  const forged=await ports.stageImmutableValue(f.turn.runId,{...f.context.state.ledger,findings:[{findingId:'forged'}]});
  const transition:BlockProgressTransitionV1={version:1,kind:'block-progress',progress:p,payloadDigest:ledgerDigest(p),candidateLedgerRef:forged.reference,basisRef:basis.reference,trustedReceiptRefs:[],predecessorCheckpoint:f.context.state.checkpoint};
  const staged=await ports.stageImmutableValue(f.turn.runId,{...transition});
  await assert.rejects(()=>ports.appendTransition(f.turn.runId,1,0,staged.reference),{code:'corrupt'});assert.equal(f.store.replay().state.sequence,0);
  const owner=new BlockProgressCoordinator(f.turn,{...f.context,ports});await owner.accept(p);
  const event=f.store.journal.events().at(-1)!;const accepted=f.store.journal.read(event.payloadRef) as BlockProgressTransitionV1;
  rmSync(join(f.store.journal.directory,'blobs',accepted.candidateLedgerRef.split('/')[1]!));
  assert.throws(()=>f.store.replay(),{code:'corrupt'});
 }finally{f.cleanup();}
});
test('Per-block checkpoint ACK, uncertain receipt replay and snapshot reconstruction',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);let fault=false;
  const store=new RecoveryStore(f.repo,f.turn.runId,{...f.options,fault:p=>{if(fault&&p==='event-synced')throw Error('ACK lost');}});
  const ports=store.ports(1,f.turn.attemptId),owner=new BlockProgressCoordinator(f.turn,{...f.context,ports});
  const p=progressFor(f.turn,'block-1',0);const first=await owner.accept(p);assert.equal(store.replay().state.sequence,1);
  fault=true;await assert.rejects(()=>owner.accept(progressFor(f.turn,'block-2',1)));fault=false;
  assert.equal(owner.state.sequence,1);assert.equal(store.replay().state.sequence,2);
  const reopened=new RecoveryStore(f.repo,f.turn.runId,f.options);assert.equal(reopened.replay().state.accepted.length,2);
  // No snapshot can override the journal, even with apparently newer malicious state.
  writeFileSync(join(store.journal.directory,'snapshot.json'),'{"sequence":999999}',{mode:0o600});
  const view=reopened.replay();assert.equal(view.state.sequence,2);assert.ok(view.outstandingWork.length>0);
  const hydrated=new BlockProgressCoordinator(f.turn,{...f.context,state:view.state,ports:reopened.ports(1,f.turn.attemptId)});
  assert.deepEqual(await hydrated.accept(p),first);assert.equal(reopened.journal.events().length,3);
  await assert.rejects(()=>hydrated.accept({...p,notes:'conflict'}));
 }finally{f.cleanup();}
});
