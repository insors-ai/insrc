import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { OperationTicket, CommittedOutcome } from '../connection-management.js';
import { removalConfirmation, removalDecision, removalInProgress, projectRemovalState, projectRemovalRejection } from '../connection-removal.js';
import { ManagementInputError } from '../connection-management-wire.js';

const ticket:OperationTicket={operationId:randomUUID(),lookupRoot:'/registered/root',scope:'saved',connectionId:'selected',mode:'remove',issuedAt:'2026-10-29T00:00:00.000Z',expiresAt:'2026-11-28T00:00:00.000Z',signature:'fixture-signature'};
const outcome:CommittedOutcome={operationId:ticket.operationId,revision:'operation-revision',registration:'removed',activation:'not-applicable',credentialCleanup:'complete'};

test('CM-S4-CONFIRM: cancellation creates no command or ticket and confirmation captures the exact generation',()=>{
 for(const scope of ['saved','temporary'] as const){
  const key={repoRoot:ticket.lookupRoot,scope,id:ticket.connectionId};
  const confirmation=removalConfirmation(key,'selected-revision');
  key.id='another';
  assert.deepEqual(confirmation.key,{repoRoot:ticket.lookupRoot,scope,id:ticket.connectionId});
  assert.equal(confirmation.action,scope==='saved'?'Delete':'Discard');
  assert.match(confirmation.message,/Source files, databases, tables and remote data will be preserved/);
  assert.equal(removalDecision(confirmation,'cancel'),undefined);
  assert.deepEqual(removalDecision(confirmation,'confirm'),{key:confirmation.key,expectedRevision:'selected-revision'});
  assert.equal(Object.hasOwn(confirmation,'ticket'),false);assert.equal(Object.hasOwn(confirmation,'operationId'),false);
  assert.equal(Object.isFrozen(confirmation),true);assert.equal(Object.isFrozen(confirmation.key),true);
 }
 assert.throws(()=>removalConfirmation({repoRoot:'/root',scope:'saved',id:'id'},''),ManagementInputError);
});

test('CM-S4-STATE: uncertain status and missing rows never become successful removal',()=>{
 for(const status of ['pending','not-seen','reconciliation-required'] as const){
  const state=projectRemovalState(ticket,{status},'complete');
  assert.equal(state.state,'unknown');assert.equal(state.operationId,ticket.operationId);
  assert.equal(Object.hasOwn(state,'resourceCleanup'),false);
 }
 assert.equal(projectRemovalRejection(ticket,'not-found').state,'unknown');
 assert.equal(projectRemovalRejection(ticket,'recovery-required').state,'unknown');
 assert.equal(projectRemovalRejection(ticket,'busy').state,'busy');
 assert.equal(projectRemovalRejection(ticket,'conflict').state,'conflict');
 assert.equal(removalInProgress(ticket).state,'removing');
});

test('CM-S4-STATE: committed removal tracks credential and runtime cleanup independently',()=>{
 for(const credentialCleanup of ['complete','pending'] as const) for(const resourceCleanup of ['complete','pending'] as const){
  const state=projectRemovalState(ticket,{status:'committed',value:{...outcome,credentialCleanup}},resourceCleanup);
  assert.equal(state.state,credentialCleanup==='complete'&&resourceCleanup==='complete'?'removed':'removed-cleanup-pending');
  assert.equal(state.credentialCleanup,credentialCleanup);assert.equal(state.resourceCleanup,resourceCleanup);
  assert.deepEqual(state.key,{repoRoot:ticket.lookupRoot,scope:ticket.scope,id:ticket.connectionId});
 }
 assert.equal(projectRemovalState(ticket,{status:'committed',value:outcome}).state,'removed-cleanup-pending');
});

test('CM-S4-STATE: unrelated outcomes cannot assert removal and projections never copy unsafe fields',()=>{
 for(const value of [{...outcome,operationId:randomUUID()},{...outcome,registration:'persisted' as const},{...outcome,activation:'active' as const}]){
  assert.throws(()=>projectRemovalState(ticket,{status:'committed',value},'complete'),ManagementInputError);
 }
 assert.throws(()=>projectRemovalState({...ticket,mode:'update'},{status:'committed',value:outcome}),ManagementInputError);
 const state=projectRemovalState(ticket,{status:'committed',value:{...outcome,...{rawError:'secret-canary',secretRef:'secret-canary'}}},'complete');
 assert.ok(!JSON.stringify(state).includes('secret-canary'));
 const detached=removalInProgress(ticket);(detached.key as {id:string}).id='changed';
 assert.equal(removalInProgress(ticket).key.id,'selected');
});
