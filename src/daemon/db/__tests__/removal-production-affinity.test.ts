/** Default availability never grants authority to unregistered roots or forged tickets. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {SpawnedDaemon} from '../../threads/__tests__/helpers/daemon-socket.js';
import {Conn,once,spawnDaemon,stopDaemon} from '../../threads/__tests__/helpers/daemon-socket.js';
import type {ManagementCapabilities,OperationTicket,MutationOutcome} from '../../../shared/connection-management.js';

for(const threaded of [false,true])test(`CM-S4-AFFINITY: production ${threaded?'threaded':'single-thread'} daemon advertises default features but refuses unregistered roots and private consumers before use`,{timeout:120000},async t=>{
 const directory=await realpath(await mkdtemp(join('/private/tmp','cm-affinity-'))),root=join(directory,'repo');await mkdir(root);
 let daemon:SpawnedDaemon|undefined,attached:Conn|undefined;
 try{
  daemon=await spawnDaemon(join(directory,'daemon-state'),{daemon:{threads:{enabled:threaded}}});
  if(threaded){
   const serving=await once(daemon.sock,'test.servingThread',null,{label:'mcp',pid:9521});assert.equal(serving.error,undefined);assert.ok((serving.result as {threadId:number}).threadId>0);
  }
  const cap=await once(daemon.sock,'db.connections.v2.capabilities',{repoRoot:root});assert.equal(cap.error,undefined);
  const features=(cap.result as ManagementCapabilities).features;
  assert.equal(features.includes('saved-remove'),false,'unknown root has no Saved owner');
  for(const feature of ['temporary-remove','removal-state','removal-cleanup-retry'])assert.equal(features.includes(feature),true);
  for(const scope of ['saved','temporary'] as const){
   const key={repoRoot:root,scope,id:'stored-revision'},ticket:OperationTicket={operationId:randomUUID(),lookupRoot:root,scope,connectionId:key.id,mode:'remove',issuedAt:'2026-10-29T00:00:00.000Z',expiresAt:'2026-10-30T00:00:00.000Z',signature:'CM_AFFINITY_PRIVATE_CAPABILITY'};
   for(const method of ['db.connections.v2.removalState','db.connections.v2.retryRemovalCleanup']){
    const reply=await once(daemon.sock,method,{ticket});assert.equal(reply.error,undefined);assert.equal((reply.result as MutationOutcome & {code:string}).code,'upgrade-required');assert.equal(JSON.stringify(reply).includes(ticket.signature),false);
   }
   const result=await once(daemon.sock,'db.connections.v2.ticket',{key,mode:'remove'});assert.equal((result.result as {code:string}).code,scope==='saved'?'upgrade-required':'invalid-input');
  }
  attached=await Conn.open(daemon.sock);
  const opening=await attached.ask('db.connections.v2.session.open',{repoRoot:root});assert.equal((opening.result as {code:string}).code,'invalid-input');
  // A failed private-channel admission stays sticky. These calls cannot reach
  // analysis/model execution, driver construction, iteration or an edit-probe child.
  const paths=[
   ['analyze.run.start',{repo:root,connectionId:'stored-revision'}],
   ['step.call',{tool:'insrc_analyze_step',params:{phase:'start',repo:root,focus:'stored data'}}],
   ['db.testConnection',{repoRoot:root,config:{id:'stored-revision',kind:'postgres'}}],
   ['db.connections.v2.test',{requestId:randomUUID(),draftRevision:1,key:{repoRoot:root,scope:'temporary',id:'stored-revision'},expectedRevision:randomUUID(),publicPatch:{},credentials:{}}],
  ] as const;
  for(const [method,params] of paths){
   const reply=await attached.ask(method,params);assert.equal(reply.error,undefined);assert.ok(['upgrade-required','session-expired'].includes((reply.result as {code:string}).code));
  }
  t.diagnostic(JSON.stringify({threaded,sc6:'refused-before-ticket',privateConsumers:'refused-before-use',allConsumerOwnerAffinity:'pending',reason:'Runtime is enabled; unregistered roots and forged authority are still refused. Full cross-consumer owner affinity remains pending.'}));
 }finally{attached?.close();if(daemon)assert.equal(await stopDaemon(daemon),0);await rm(directory,{recursive:true,force:true});}
});
