/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryFixture } from './recovery-fixtures.js';
const tick=()=>new Promise<void>(r=>setImmediate(r));
test('Callback deadline revokes authority and rejects late success',async t=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000),checkpoint=f.store.replay().state.checkpoint,intent=f.store.journal.stage({operation:'one'});
  t.mock.timers.enable({apis:['setTimeout']});let release!:(value:string)=>void,guard!:()=>void;
  const result=f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,intent.reference,async(_ref,current)=>{guard=current;return new Promise<string>(r=>{release=r;});});
  await tick();assert.equal(typeof guard,'function');const rejected=assert.rejects(result,{code:'publication-uncertain'});
  t.mock.timers.tick(10000);await rejected;assert.throws(()=>guard(),{code:'ownership-lost'});release('late success');await tick();
  assert.equal(f.store.status().completionReceipt,null);assert.equal(f.store.status().state,'completion-requested');
  assert.equal(await f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,null,async()=> 'reconciled'),'reconciled');
 }finally{t.mock.timers.reset();f.cleanup();}
});
test('Undrained callback retains write fence through caller timeout',async t=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000),checkpoint=f.store.replay().state.checkpoint,intent=f.store.journal.stage({operation:'one'});
  t.mock.timers.enable({apis:['setTimeout']});let release!:()=>void,lateGuard!:()=>void;
  const first=f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,intent.reference,async(_ref,guard)=>{lateGuard=guard;await new Promise<void>(r=>{release=r;});});await tick();
  const rejected=assert.rejects(first,{code:'publication-uncertain'});t.mock.timers.tick(10000);await rejected;
  let entered=false;const second=f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,null,async()=>{entered=true;return 'second';});
  let renewed=false;const renewal=f.store.renew(lease.leaseId,lease.generation,300000).then(()=>{renewed=true;});await tick();
  assert.equal(entered,false);assert.equal(renewed,false);assert.throws(()=>lateGuard(),{code:'ownership-lost'});
  release();assert.equal(await second,'second');await renewal;assert.equal(renewed,true);
 }finally{t.mock.timers.reset();f.cleanup();}
});
