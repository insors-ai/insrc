import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandlerRuntime, type HandlerRuntimeDeps } from '../handler-runtime.js';
import { directDispatch } from '../server.js';

test('production runtime step wrapper preserves the exact trusted fourth argument from directDispatch', async()=>{
 let observed:unknown;
 const runtime=buildHandlerRuntime({understandingService:()=>undefined,stepCallHandler:async(_params,_send,_signal,trusted)=>{observed=trusted;}} as unknown as HandlerRuntimeDeps);
 const handler=runtime.streamHandlers['step.call']!;
 const trusted={reviewOwnerNonce:'router-owned',assertRequestActive:()=>{}};
 const signal=new AbortController().signal;
 await handler({tool:'insrc_review_step'},()=>{},signal,trusted);
 assert.equal(observed,trusted);
 // The carrier is out of band: changing public JSON must not replace it.
 await handler({tool:'insrc_code_review_step',reviewOwnerNonce:'forged'},()=>{},signal,trusted);
 assert.equal(observed,trusted);
 await new Promise<void>(resolve=>{
  const forwarding=buildHandlerRuntime({understandingService:()=>undefined,stepCallHandler:async(_p,_s,_signal,context)=>{observed=context;resolve();}} as unknown as HandlerRuntimeDeps);
  directDispatch({},forwarding.streamHandlers)({kind:'request',requestId:'owner',method:'step.call',params:{reviewOwnerNonce:'forged'},stream:true,trustedContext:{connectionIdentity:'socket',daemonEpoch:'epoch',reviewOwnerNonce:'router-owned'}},()=>{});
 });
 assert.equal((observed as {reviewOwnerNonce:string}).reviewOwnerNonce,'router-owned');
});
