import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { managementFixture } from './fixtures/management.js';
import { ConnectionRemovals } from '../../../../src/shared/connection-manager/removal.js';
import { ConnectionDraft } from '../../../../src/shared/connection-manager/draft.js';
import { decodeDriverDescriptors,decodeSafeConnectionList } from '../../../../src/shared/connection-manager/wire.js';
import { loadConnectionCorpus } from '../../../../src/shared/__tests__/fixtures/connection-corpus.js';
import { removalConfirmation,removalDecision,removalInProgress,projectRemovalState,projectRemovalRejection } from '../../../../src/shared/connection-removal.js';
import type { MutationRequest,OperationTicket,SafeConnection } from '../../../../src/shared/connection-management.js';
import type { Driver } from '../../../../src/shared/db-driver.js';
import { _setKeystoreForTests } from '../../../../src/daemon/db/secrets.js';

const descriptor=decodeDriverDescriptors(loadConnectionCorpus().driverDescriptors).find(d=>d.kind==='postgres')!,prefix='db.connections.v2.';
type Fixture=Awaited<ReturnType<typeof managementFixture>>;
async function rows(f:Fixture){return decodeSafeConnectionList(await f.owner.requestTemporary(f.f.root,f.owner.view,prefix+'list',{repoRoot:f.f.root}),f.f.root);}
async function row(f:Fixture,id:string,scope:'saved'|'temporary'='saved'){const selected=(await rows(f)).find(r=>r.key.id===id&&r.key.scope===scope);assert.ok(selected);return selected;}

test('CM-S5-REMOVE-TS: exact selection confirmation, zero-effect Cancel, busy/conflict/unknown and independent ticket-only cleanup',async()=>{
 const f=await managementFixture(),removals=new ConnectionRemovals(f.controller);try{
  await f.controller.submit(f.draft('selected'));const original=await row(f,'selected');const dirty=f.draft('other');
  const ticketCount=()=>f.calls.filter(c=>c==='ticket').length,before=ticketCount(),privateBefore=JSON.stringify(dirty.serialize());
  removals.begin(original,dirty);assert.equal(removals.view.resolveDirty,true);assert.equal(removals.view.confirmation,null);assert.equal(ticketCount(),before);
  removals.resolveDirty('cancel');assert.equal(removals.view.confirmation,null);assert.ok(JSON.stringify(dirty.serialize())===privateBefore);assert.equal(ticketCount(),before);
  removals.begin(original,dirty);removals.resolveDirty('discard');assert.equal(dirty.view.discarded,true);
  assert.deepEqual(removals.view.confirmation,removalConfirmation(original.key,original.revision));assert.match(removals.view.confirmation!.message,/Source files, databases, tables and remote data will be preserved/);
  await removals.decide('cancel');assert.equal(ticketCount(),before);assert.equal((await row(f,'selected')).revision,original.revision);
  const edit=new ConnectionDraft(descriptor,original.key,original),editBefore=JSON.stringify(edit.serialize()),lease=await f.f.pool.lease('selected');
  let busy;
  try{removals.begin(original,edit);busy=await removals.decide('confirm');assert.equal(busy?.removal?.state,'busy');assert.equal(busy?.phase,'rejected');}
  finally{await lease.release();}
  assert.ok(JSON.stringify(edit.serialize())===editBefore);assert.equal((await row(f,'selected')).revision,original.revision);
  const update=new ConnectionDraft(descriptor,original.key,original);update.setField(['label'],'new generation');await f.controller.submit(update);
  const current=await row(f,'selected');assert.notEqual(current.revision,original.revision);
  removals.begin(original,edit);const conflict=await removals.decide('confirm');assert.equal(conflict?.removal?.state,'conflict');assert.equal((await row(f,'selected')).revision,current.revision);assert.ok(JSON.stringify(edit.serialize())===editBefore);
  await assert.rejects(removals.decide('confirm'),{code:'invalid-state'});
  removals.begin(current);assert.equal(removals.view.confirmation!.expectedRevision,current.revision);f.setFault('before');const unknown=await removals.decide('confirm');assert.ok(unknown);assert.equal(unknown.removal?.state,'unknown');
  assert.equal(f.controller.isBlocked(current.key),true);assert.throws(()=>removals.begin(current),{code:'busy'});
  const attempted=JSON.parse(f.requests.at(-1)!) as MutationRequest;assert.equal(attempted.mode,'remove');assert.deepEqual(Object.keys(attempted).sort(),['expectedRevision','key','mode','operationId','ticket']);
  // Another observer sees the row absent; only original-ticket status may classify this client's result.
  const outside=await f.f.service.mutate(f.f.context,attempted);assert.equal(outside.status,'committed');assert.equal((await rows(f)).some(r=>r.key.id==='selected'),false);
  assert.equal(f.controller.record(unknown.recordId).removal?.state,'unknown');removals.cancel();assert.equal(removals.records.find(r=>r.recordId===unknown.recordId)?.removal?.state,'unknown');
  const mutations=f.requests.length,recovered=await f.controller.reconcile(unknown.recordId);assert.equal(recovered.outcome?.registration,'removed');assert.equal(recovered.removal?.state,'removed');assert.equal(f.requests.length,mutations);
  await f.controller.submit(f.draft('temporary','temporary'));const temporary=await row(f,'temporary','temporary'),beforeCancel=ticketCount();
  removals.begin(temporary);assert.equal(removals.view.confirmation?.action,'Discard');await removals.decide('cancel');assert.equal(ticketCount(),beforeCancel);
  removals.begin(temporary);const discarded=await removals.decide('confirm');assert.equal(discarded?.outcome?.registration,'removed');assert.equal(discarded?.removal?.state,'removed');assert.equal((await rows(f)).some(r=>r.key.id==='temporary'),false);
 }finally{removals.dispose();await f.close();}
});

test('CM-S5-REMOVE-TS: independent original-ticket cleanup survives same-ID recreation without touching its source',async()=>{
 const f=await managementFixture(),removals=new ConnectionRemovals(f.controller);let credentialFail=true,resourceFail=true,oldCloses=0,newCloses=0,builds=0;
 const originalDelete=f.f.keystore.deleteKey;
 const previousKeystore=_setKeystoreForTests(f.f.keystore);
 try{
  const source=join(f.f.root,'source.csv');writeFileSync(source,'id,name\n1,preserved\n');const bytes=readFileSync(source);
  await f.controller.submit(f.draft('same-id'));const selected=await row(f,'same-id');
  f.f.hooks.factory=async config=>{const generation=++builds;return{id:config.id,kind:config.kind,family:'rdbms',close:async()=>{if(generation===1){oldCloses++;if(resourceFail)throw new Error('PRIVATE_RUNTIME_CANARY');}else newCloses++;}} as Driver;};
  await f.f.pool.withConnection('same-id',async()=>{});
  f.f.keystore.deleteKey=async ref=>{if(credentialFail)throw new Error('PRIVATE_CREDENTIAL_CANARY');await originalDelete(ref);};
  removals.begin(selected);let removed=(await removals.decide('confirm'))!;const original=JSON.parse(f.requests.at(-1)!) as MutationRequest,revision=removed.outcome!.revision;
  assert.equal(removed.phase,'committed');assert.equal(removed.removal?.state,'removed-cleanup-pending');assert.equal(removed.removal?.credentialCleanup,'pending');assert.equal(removed.removal?.resourceCleanup,'pending');assert.equal(removed.canDismiss,false);
  assert.equal((await rows(f)).length,0);assert.equal(removals.records.length,1);
  credentialFail=false;removed=await f.controller.retryCleanup(removed.recordId);assert.equal(removed.removal?.credentialCleanup,'complete');assert.equal(removed.removal?.resourceCleanup,'pending');assert.equal(removed.outcome?.revision,revision);
  const recreated=await f.controller.submit(f.draft('same-id'));await f.f.pool.withConnection('same-id',async()=>{});const freshRevision=recreated.outcome!.revision;
  assert.notEqual(freshRevision,selected.revision);const calls=f.requests.length;resourceFail=false;removed=await f.controller.retryCleanup(removed.recordId);
  assert.equal(removed.removal?.state,'removed');assert.equal(removed.canDismiss,true);assert.equal(removed.outcome?.revision,revision);assert.equal(f.requests.length,calls);
  assert.equal((await row(f,'same-id')).revision,freshRevision);assert.equal(newCloses,0);assert.ok(oldCloses>=2);assert.deepEqual(readFileSync(source),bytes);
  for(const request of f.removalRequests){assert.deepEqual(Object.keys(request.params as object),['ticket']);const ticket=(request.params as {ticket:OperationTicket}).ticket;assert.ok(JSON.stringify(ticket)===JSON.stringify(original.ticket),'cleanup must keep the original signed operation');}
  assert.equal(JSON.stringify(removals),'{}');assert.ok(!JSON.stringify(removals.records).includes('CANARY'));assert.ok(!JSON.stringify(removals.records).includes('signature'));
 }finally{credentialFail=false;resourceFail=false;f.f.keystore.deleteKey=originalDelete;removals.dispose();try{await f.close();}finally{_setKeystoreForTests(previousKeystore);}}
});

test('CM-S5-REMOVE-TS: all twenty unchanged sc6 consumer snapshots keep the exact confirmation and phase copy',()=>{
 const cases=loadConnectionCorpus().removalSnapshots as {scope:'saved'|'temporary';phase:string;confirmation?:ReturnType<typeof removalConfirmation>;state?:Record<string,unknown>;genericStatus?:'pending'|'not-seen'|'reconciliation-required';confirmedSelection?:unknown;cancelCommand?:unknown}[];
 assert.equal(cases.length,20);
 for(const c of cases){
  if(c.confirmation){const value=removalConfirmation(c.confirmation.key,c.confirmation.expectedRevision);assert.deepEqual(value,c.confirmation);assert.deepEqual(removalDecision(value,'confirm'),c.confirmedSelection);assert.equal(removalDecision(value,'cancel')??null,c.cancelCommand);continue;}
  const expected=c.state!,key=expected['key'] as SafeConnection['key'];
  const ticket:OperationTicket={operationId:expected['operationId'] as string,lookupRoot:key.repoRoot,scope:c.scope,connectionId:key.id,mode:'remove',issuedAt:'2026-10-29T00:00:00.000Z',expiresAt:'2026-11-28T00:00:00.000Z',signature:'A'.repeat(43)};
  let value;
  if(c.phase==='removing')value=removalInProgress(ticket);
  else if(c.phase==='busy'||c.phase==='conflict')value=projectRemovalRejection(ticket,c.phase);
  else if(c.phase==='unknown')value=projectRemovalState(ticket,{status:c.genericStatus!});
  else value=projectRemovalState(ticket,{status:'committed',value:{operationId:ticket.operationId,revision:'33333333-3333-4333-8333-333333333333',registration:'removed',activation:'not-applicable',credentialCleanup:expected['credentialCleanup'] as 'complete'|'pending'}},expected['resourceCleanup'] as 'complete'|'pending');
  assert.deepEqual(value,expected);
 }
});
