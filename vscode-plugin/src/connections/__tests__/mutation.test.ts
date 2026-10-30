import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { deferred } from '../../../../src/daemon/db/__tests__/fixtures/saved-management-fixture.js';
import type { MutationRequest } from '../../../../src/shared/connection-management.js';
import { managementFixture as fixture } from './fixtures/management.js';

async function until(predicate:()=>boolean):Promise<void>{const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)assert.fail('Fixture did not reach the required state');await new Promise<void>(resolve=>setImmediate(resolve));}}


test('CM-S5-OUTCOME-TS: immutable signed attempts, lost-reply same-ticket status/replay, expiry and independent activation/refresh recovery',async()=>{
 const f=await fixture({multipleRoots:true});try {
  const draft=f.draft('lost');f.setFault('after');
  const submitting=f.controller.submit(draft);await assert.rejects(f.controller.submit(draft),{code:'busy'});
  let record=await submitting;assert.equal(record.phase,'unknown');assert.equal(record.canReplay,false);assert.equal(draft.view.dirty,true);
  const operationId=(JSON.parse(f.requests[0]!) as MutationRequest).operationId;
  assert.equal(f.f.store.snapshot.file.connections.length,1);assert.ok(f.f.counts.writes>0);assert.equal(f.f.store.snapshot.file.connections.length,1);
  f.owner.setRegisteredRoots(f.roots);await f.owner.selectRoot(f.roots[1]!);
  record=await f.controller.reconcile(record.recordId);
  assert.equal(record.phase,'committed');assert.equal(record.refresh,'failed');assert.equal(f.owner.view.repoRoot,f.roots[1]);
  await f.owner.selectRoot(f.f.root);record=await f.controller.retryRefresh(record.recordId);
  assert.equal(record.phase,'committed');assert.equal(record.outcome?.operationId,operationId);assert.equal(record.outcome?.registration,'persisted');assert.equal(record.refresh,'complete');
  assert.equal(draft.view.discarded,true);assert.equal(f.calls.filter(c=>c==='mutate').length,1);assert.equal(f.calls.filter(c=>c==='ticket').length,1);
  assert.ok(!JSON.stringify(f.controller.records).includes('fixture-only-private'));assert.equal(JSON.stringify(f.controller),'{}');
  assert.ok(!JSON.stringify(f.controller.records).includes('signature'));
  f.setStatusMalformed(true);const known=record.outcome;record=await f.controller.reconcile(record.recordId);assert.equal(record.phase,'committed');assert.deepEqual(record.outcome,known);f.setStatusMalformed(false);
  assert.equal(record.canReplay,false);await assert.rejects(f.controller.replay(record.recordId),{code:'invalid-state'});
 }finally{await f.close();}
});

test('CM-S5-OUTCOME-TS: not-seen requires explicit byte-identical same-ticket replay and expiry blocks all fresh mutation',async()=>{
 const f=await fixture();try {
  const draft=f.draft('not-seen');f.setFault('before');let record=await f.controller.submit(draft);assert.equal(record.phase,'unknown');
  const original=f.requests[0]!;await assert.rejects(f.controller.replay(record.recordId),{code:'invalid-state'});
  record=await f.controller.reconcile(record.recordId);assert.equal(record.phase,'not-seen');assert.equal(record.canReplay,true);assert.equal(f.requests.length,1);
  // Even direct private draft changes cannot alter the captured attempt; UI admission blocks such edits while unknown.
  draft.setField(['label'],'Changed after submission');record=await f.controller.replay(record.recordId);
  assert.equal(record.phase,'committed');assert.equal(f.requests[1],original);assert.ok(f.f.counts.writes>0);assert.equal(f.f.store.snapshot.file.connections.length,1);assert.equal(f.calls.filter(c=>c==='ticket').length,1);
  const expired=f.draft('expired');f.setFault('before');let pending=await f.controller.submit(expired);pending=await f.controller.reconcile(pending.recordId);assert.equal(pending.phase,'not-seen');
  const request=JSON.parse(f.requests.at(-1)!) as MutationRequest;f.f.clock.value=Date.parse(request.ticket.expiresAt)+1;
  const before=f.requests.length;pending=await f.controller.replay(pending.recordId);assert.equal(pending.phase,'reconciliation-required');assert.equal(pending.canReplay,false);assert.equal(f.requests.length,before);
  await assert.rejects(f.controller.submit(expired),{code:'busy'});assert.equal((await f.controller.reconcile(pending.recordId)).phase,'reconciliation-required');
 }finally{await f.close();}
});

test('CM-S5-OUTCOME-TS: pending polling is bounded and malformed committed replies reconcile without another create',async()=>{
 const f=await fixture(),entered=deferred(),release=deferred();try {
  f.f.hooks.stage=async()=>{entered.resolve();await release.promise;};f.setFault('pending');const submit=f.controller.submit(f.draft('pending'));await entered.promise;
  let record=await submit;assert.equal(record.phase,'unknown');record=await f.controller.reconcile(record.recordId);assert.equal(record.phase,'pending');
  for(const delay of [1000,2000,4000,8000,16000]){
   assert.equal(f.delays.at(-1),delay);const before=f.calls.filter(c=>c==='status').length;f.nextTimer();
   await until(()=>f.calls.filter(c=>c==='status').length>before&&!f.controller.record(record.recordId).busy);
  }
  assert.equal(f.timers.size,0);assert.equal(f.requests.length,1);assert.equal(f.controller.record(record.recordId).phase,'pending');
  release.resolve();await f.drain();assert.equal(f.f.store.snapshot.file.connections.length,1);
  f.f.hooks.stage=undefined;record=await f.controller.reconcile(record.recordId);assert.equal(record.phase,'committed');assert.equal(f.requests.length,1);
  f.setFault('malformed');let malformed=await f.controller.submit(f.draft('malformed'));assert.equal(malformed.phase,'unknown');
  malformed=await f.controller.reconcile(malformed.recordId);assert.equal(malformed.phase,'committed');assert.equal(f.f.store.snapshot.file.connections.length,2);
 }finally{release.resolve();await f.close();}
});

test('CM-S5-OUTCOME-TS: activation cleanup and read retries preserve committed revision and never repeat mutation',async()=>{
 const f=await fixture();let failCleanup=false;const recover=f.f.generations.recover.bind(f.f.generations);
 const recovery=mock.method(f.f.generations,'recover',async()=>{if(failCleanup)throw new Error('fixture cleanup failure');return await recover();});
 try {
  f.f.hooks.writer=async stage=>{if(stage==='after-rename')failCleanup=true;};f.f.hooks.activate=async()=>{throw new Error('fixture activation failure');};f.setRefreshFail(true);
  const draft=f.draft('phases');let record=await f.controller.submit(draft);assert.equal(record.phase,'committed');assert.equal(record.outcome?.activation,'failed');assert.equal(record.outcome?.credentialCleanup,'pending');assert.equal(record.refresh,'failed');assert.equal(draft.view.discarded,true);
  const revision=record.outcome!.revision;const requests=f.requests.length;
  f.f.hooks.activate=undefined;record=await f.controller.retryActivation(record.recordId);assert.equal(record.phase,'committed');assert.equal(record.outcome?.revision,revision);assert.equal(record.outcome?.activation,'active');assert.equal(record.refresh,'failed');
  failCleanup=false;f.f.hooks.writer=undefined;record=await f.controller.retryCleanup(record.recordId);assert.equal(record.outcome?.credentialCleanup,'complete');assert.equal(record.outcome?.revision,revision);
  f.setRefreshFail(false);record=await f.controller.retryRefresh(record.recordId);assert.equal(record.refresh,'complete');assert.equal(record.canDismiss,true);assert.equal(f.requests.length,requests);assert.ok(f.f.counts.writes>0);assert.equal(f.f.store.snapshot.file.connections.length,1);
 }finally{failCleanup=false;recovery.mock.restore();await f.close();}
});

test('CM-S5-OUTCOME-TS: temporary expiry erases attempts while saved unknowns survive view close and owner resume',async()=>{
 const f=await fixture();try {
  f.setFault('before');const saved=await f.controller.submit(f.draft('saved'));
  f.setFault('before');const temporaryDraft=f.draft('temporary','temporary');const temporary=await f.controller.submit(temporaryDraft);
  assert.equal(temporary.phase,'unknown');let notifications=0;const view=f.controller.onChange(()=>{notifications++;});view.dispose();const before=notifications;
  assert.equal(f.controller.record(saved.recordId).phase,'unknown');assert.equal(f.controller.record(temporary.recordId).phase,'unknown');
  f.owner.expireTemporary();assert.equal(f.controller.record(temporary.recordId).phase,'session-ended');assert.equal(temporaryDraft.view.discarded,true);assert.equal(f.controller.record(saved.recordId).phase,'unknown');assert.equal(notifications,before);
  await assert.rejects(f.controller.replay(temporary.recordId),{code:'invalid-state'});const writes=f.requests.length;
  await f.owner.selectRoot(f.f.root);assert.equal(f.controller.record(saved.recordId).phase,'unknown');assert.equal(f.requests.length,writes);
 }finally{await f.close();}
});


test('CM-S5-OUTCOME-TS: resource limits refuse before ticket and never evict an unknown operation',async()=>{
 const f=await fixture();try {
  for(let i=0;i<64;i++){f.setFault('before');assert.equal((await f.controller.submit(f.draft('bounded-'+i))).phase,'unknown');}
  const before=f.calls.length;await assert.rejects(f.controller.submit(f.draft('overflow')),{code:'resource-limit'});
  assert.equal(f.calls.length,before);assert.equal(f.controller.records.length,64);assert.ok(f.controller.records.every(r=>r.phase==='unknown'));
  assert.throws(()=>f.controller.dismiss(f.controller.records[0]!.recordId),{code:'invalid-state'});
 }finally{await f.close();}
 const bytes=await fixture();try {
  const values=Array.from({length:200},()=> 'x'.repeat(8192));let accepted=0;
  for(let i=0;i<12;i++){
   const draft=bytes.draft('bytes-'+i);draft.setField(['pii'],values);bytes.setFault('before');const before=bytes.calls.length;
   try{assert.equal((await bytes.controller.submit(draft)).phase,'unknown');accepted++;}catch(error){assert.equal((error as {code:string}).code,'resource-limit');assert.equal(bytes.calls.length,before);break;}
  }
  assert.ok(accepted>0&&accepted<12);assert.equal(bytes.controller.records.length,accepted);assert.ok(bytes.controller.records.every(r=>r.phase==='unknown'));
 }finally{await bytes.close();}
});

test('CM-S5-OUTCOME-TS: malformed ticket correlation fails before mutation and draft remains editable',async()=>{
 const f=await fixture();try {
  const draft=f.draft('ticket');f.setTicketMalformed(true);const rejected=await f.controller.submit(draft);
  assert.equal(rejected.phase,'ticket-error');assert.equal(f.requests.length,0);assert.equal(draft.view.discarded,false);assert.equal(draft.view.dirty,true);
  f.setTicketMalformed(false);const committed=await f.controller.submit(draft);assert.equal(committed.phase,'committed');assert.equal(f.requests.length,1);
 }finally{await f.close();}
});
