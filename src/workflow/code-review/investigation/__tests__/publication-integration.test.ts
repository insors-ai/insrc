/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { recoveryFixture } from './recovery-fixtures.js';
import { RecoveryStore } from '../recovery-store.js';
const tick=()=>new Promise<void>(r=>setImmediate(r));
test('Publication crash boundaries reconcile frozen intent and terminal receipt',{timeout:30000},async()=>{
 for(const boundary of ['before-intent-commit','after-intent-commit','after-callback','before-terminal-receipt','after-terminal-receipt']){
  const f=recoveryFixture(),manifestPath=join(f.repo,'manifest.json');writeFileSync(manifestPath,JSON.stringify(f.manifest));
  const child=fork(new URL('./publication-crash-worker.ts',import.meta.url),[f.repo,manifestPath,boundary],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});const timer=setTimeout(()=>child.kill('SIGKILL'),7000);
  try{
   const [message]=await once(child,'message',{signal:AbortSignal.timeout(8000)});assert.deepEqual(message,{boundary});const exited=once(child,'exit');child.kill('SIGKILL');await exited;
   const store=new RecoveryStore(f.repo,f.turn.runId,{...f.options,processEpoch:'replacement-publication-daemon'}),before=store.replay();
   if(boundary==='after-terminal-receipt'){assert.equal(store.status().completionReceipt,'verified-terminal-receipt');await assert.rejects(()=>store.claim(300000));}
   else{
    const lease=await store.claim(300000),intent=before.publication?.intentRef??store.journal.stage({operationId:'publication-one'}).reference;
    const result=await store.withPublicationFence(lease.leaseId,lease.generation,before.state.checkpoint,intent,async(ref,guard)=>{
     guard();assert.deepEqual(store.journal.read(ref),{operationId:'publication-one'});const external=join(f.repo,'external-operation.json');
     if(!existsSync(external))writeFileSync(external,JSON.stringify({operationId:'publication-one',logicalWrites:1}));
     return JSON.parse(readFileSync(external,'utf8'));
    });
    assert.deepEqual(result,{operationId:'publication-one',logicalWrites:1});assert.equal(store.status().completionReceipt,null);
    await store.recordCompletion(lease.leaseId,lease.generation,'verified-terminal-receipt');await store.recordCompletion(lease.leaseId,lease.generation,'verified-terminal-receipt');
    assert.equal(store.status().state,'completed');assert.equal(store.replay().state.checkpoint,before.state.checkpoint);
   }
   assert.deepEqual(JSON.parse(readFileSync(join(f.repo,'external-operation.json'),'utf8')),{operationId:'publication-one',logicalWrites:1});
  }finally{clearTimeout(timer);child.kill('SIGKILL');f.cleanup();}
 }
});
test('Concurrent publication and external-operation replay preserve one frozen scope',async()=>{
 const f=recoveryFixture();try{
  await f.store.prepare(f.manifest);const lease=await f.store.claim(300000),checkpoint=f.store.replay().state.checkpoint,intent=f.store.journal.stage({operation:'one'}),other=f.store.journal.stage({operation:'two'});
  let release!:()=>void,callbacks=0,writes=0,guard!:()=>void;
  const existing=new Set<string>();const publish=async(ref:string,current:()=>void)=>{current();callbacks++;if(!existing.has(ref)){existing.add(ref);writes++;}return 'same-operation';};
  const first=f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,intent.reference,async(ref,current)=>{guard=current;await new Promise<void>(r=>{release=r;});return publish(ref,current);});await tick();
  const second=f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,null,publish);
  const conflict=assert.rejects(()=>f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,other.reference,publish));await tick();assert.equal(callbacks,0);
  release();assert.equal(await first,'same-operation');assert.equal(await second,'same-operation');await conflict;assert.equal(callbacks,2);assert.equal(writes,1);assert.throws(()=>guard(),{code:'ownership-lost'});
  const restarted=new RecoveryStore(f.repo,f.turn.runId,{...f.options,processEpoch:'replacement'});const next=await restarted.claim(300000);let stale=false;
  await assert.rejects(()=>f.store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,null,async()=>{stale=true;}));assert.equal(stale,false);
  assert.equal(await restarted.withPublicationFence(next.leaseId,next.generation,checkpoint,null,publish),'same-operation');assert.equal(writes,1);
 }finally{f.cleanup();}
});
