/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ScopedReviewBridge } from '../../daemon/review-investigation-bridge.js';
import { createScopedReviewMcpServer,scopedReviewToolCatalog } from '../review-investigation-bridge.js';
import { recoveryFixture } from '../../workflow/code-review/investigation/__tests__/recovery-fixtures.js';
import { inspectionFixture } from '../../workflow/code-review/investigation/__tests__/ledger-fixtures.js';
import { finalReply,progressFor } from '../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { runRecoveredContinuation } from '../../workflow/code-review/investigation/recovery-session.js';
import type { InvestigationTools } from '../../workflow/code-review/investigation/continuation-types.js';

test('Scoped bridge accepts multiple block ACKs and rejects stale cross run capabilities',async()=>{
 const f=recoveryFixture(),bridge=new ScopedReviewBridge('daemon-epoch',()=>{});let backendFailure:unknown;try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000),native=inspectionFixture(f.basis);
  await runRecoveredContinuation(f.store,lease,f.turn,{...f.context,inspect:async(_ref,attemptId)=>({read:native.readReceipt!,inspection:{...native,attempt:{...native.attempt,attemptId}}}),backend:{...f.context.backend,execute:async(turn,tools,signal)=>{try{
   const grant=bridge.issue({repo:f.repo,turn,tools,peer:'native-cli',signal,ttlMs:300000,assertCurrent:()=>f.store.assertLease(f.store.replay(),lease.leaseId,lease.generation),state:()=>f.store.replay().state});
   const {expiresAt:_,...common}=grant.binding;
   for(const change of [{runId:'foreign'},{repo:'/foreign'},{subjectDigest:'b'.repeat(64)},{generation:99},{attemptId:'foreign'},{requestDigest:'a'.repeat(64)}])await assert.rejects(()=>bridge.dispatch({...common,operation:'read',reference:'x',...change},'native-cli'),/binding mismatch/);
   await assert.rejects(()=>bridge.dispatch({...common,operation:'read',reference:'x'},'controller'),/not active/);
   await assert.rejects(()=>bridge.dispatch({...common,operation:'approve'},'native-cli'),/Invalid investigation/);
   await assert.rejects(()=>bridge.dispatch({...common,operation:'impact',entityRef:'foreign'},'native-cli'),/unavailable/);
   assert.deepEqual(bridge.reconnect(grant.binding.bindingId,'native-cli'),grant.binding);
   const server=createScopedReviewMcpServer(grant.binding,false,command=>bridge.dispatch(command,'native-cli'));
   const [a,b]=InMemoryTransport.createLinkedPair(),client=new Client({name:'scoped-test',version:'1'});await server.connect(a);await client.connect(b);
   try{
    const catalog=await client.listTools();assert.deepEqual(catalog.tools.map(t=>t.name),['review_read','review_progress','review_reply']);assert.ok(!JSON.stringify(catalog).includes(grant.binding.bindingId));
    assert.equal((await client.callTool({name:'review_read',arguments:{reference:'x',operation:'approve'}})).isError,true);
    const read=await client.callTool({name:'review_read',arguments:{reference:native.readReceipt!.reference}});assert.equal(read.isError,undefined);assert.match(JSON.stringify(read),/evidence-/);
    const first=progressFor(turn,'block-1',0),ack=await bridge.dispatch({...common,operation:'progress',progress:first},'native-cli');
    assert.equal(f.store.status().blockCheckpoints.length,1);assert.deepEqual(await bridge.dispatch({...common,operation:'progress',progress:first},'native-cli'),ack);
    await assert.rejects(()=>bridge.dispatch({...common,operation:'progress',progress:{...first,notes:'conflict'}},'native-cli'),/conflicting/);
    const second=progressFor(turn,'block-2',1);const result=await client.callTool({name:'review_progress',arguments:{progress:second}});assert.equal(result.isError,undefined);assert.equal(f.store.status().blockCheckpoints.length,2);
    const reply=finalReply(turn,[first.progressId,second.progressId],2);
    await assert.rejects(()=>bridge.dispatch({...common,operation:'reply',reply:{...reply,coverageUpdates:[f.context.state.ledger.coverage[0]!]}},'native-cli'),/new deltas/);
    assert.equal((await client.callTool({name:'review_reply',arguments:{reply}})).isError,undefined);assert.deepEqual(await grant.done,reply);
    assert.deepEqual(await bridge.dispatch({...common,operation:'reply',reply},'native-cli'),{accepted:true});await assert.rejects(()=>bridge.dispatch({...common,operation:'read',reference:'x'},'native-cli'),/already replied/);
    return reply;
   }finally{await client.close();await server.close();await bridge.revoke(grant.binding.bindingId);}
  }catch(cause){backendFailure=cause;throw cause;}}}});
  if(backendFailure)throw backendFailure;
  assert.equal(f.store.status().blockCheckpoints.length,2);assert.equal(f.store.status().attempts.length,1);
  assert.equal(scopedReviewToolCatalog(true).length,4);
  // Revocation drains in-flight trusted work before a run's authority can be replaced.
  let now=1000,release!:(value:unknown)=>void,completed=false;const expiry=new ScopedReviewBridge('epoch-2',()=>{},()=>now),abort=new AbortController();
  const tools:InvestigationTools={read:async()=>await new Promise(resolve=>{release=resolve;}) as Awaited<ReturnType<InvestigationTools['read']>>,impact:f.context.impact,progress:async()=>{throw Error('not called');},seed:f.context.seed,execution:{budget:{} as never,timeoutMs:100,stallMs:100,internalRetry:false}};
  const issue=()=>expiry.issue({repo:f.repo,turn:f.turn,tools,peer:'controller',signal:abort.signal,ttlMs:100,assertCurrent:()=>{},state:()=>f.context.state});
  const grant=issue(),{expiresAt:_,...common}=grant.binding,pending=expiry.dispatch({...common,operation:'read',reference:'pinned'},'controller');
  const drain=expiry.revoke(grant.binding.bindingId).then(()=>{completed=true;});await Promise.resolve();assert.equal(completed,false);assert.throws(issue,/must drain/);
  release({});await assert.rejects(()=>pending,/not active/);await drain;await assert.rejects(()=>grant.done,/revoked/);
  const active=issue();now=1101;assert.throws(()=>expiry.reconnect(active.binding.bindingId,'controller'),/not active/);await expiry.revoke(active.binding.bindingId);
  now=1200;const next=issue();abort.abort();await assert.rejects(()=>next.done,/revoked/);await expiry.shutdown();
  const other=new ScopedReviewBridge('epoch-3',()=>{});await assert.rejects(()=>other.dispatch({...common,operation:'read',reference:'pinned'},'controller'),/Unknown scoped/);
 }finally{await bridge.shutdown();f.cleanup();}
});
