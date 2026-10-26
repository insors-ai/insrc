import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { PATHS } from '../../../../shared/paths.js';
import { ConnectionSessionRpc } from '../../../connection-session-rpc.js';
import { RequestLifetime } from '../../../request-context.js';
import { createTemporaryOverlay } from '../../../db/session-entries.js';
import type { TemporaryConnectionOverlay } from '../../../db/session-entries.js';
import '../../../db/drivers/index.js';
import { SqliteDriver } from '../../../db/drivers/sqlite.js';
import { getFactory } from '../../../db/registry.js';
import { closeAll } from '../../../db/pool-cache.js';
import { _setMeasureDepsForTest, measureDataSource, measureRequestScope, measureResolvedScope } from '../../../../analyze/measure.js';
import type { RegisteredRepo } from '../../../../shared/types.js';
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};}
async function fixture(){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'cm-owner-measure-'))),root=join(directory,'root');await mkdir(root);
 const original=PATHS.insrc;PATHS.insrc=join(directory,'insrc');const overlays=new Map<string,TemporaryConnectionOverlay>(),factories:string[]=[];
 const runtime=new ConnectionSessionRpc({enabled:async()=>true,isRegistered:async r=>r===root,createOverlay:(r,h,c)=>{const o=createTemporaryOverlay(r,h,c,{factory:kind=>{factories.push(kind);return getFactory(kind);}});overlays.set(h,o);return o;},dropOverlay:o=>o.close()});
 const requests:RequestLifetime[]=[];
 const request=async(identity:string)=>{const lifetime=new RequestLifetime();requests.push(lifetime);const context={connectionIdentity:identity,daemonEpoch:'measure-fixture',signal:lifetime.signal,registerDrain:lifetime.registerDrain,assertRequestActive:lifetime.assertActive};return{lifetime,context};};
 const owners=[];
 for(const [index,count] of [1,3].entries()){
  const path=join(root,'owner'+index+'.sqlite'),db=new DatabaseSync(path);for(let n=0;n<count;n++)db.exec(`CREATE TABLE table_${n}(marker TEXT)`);db.close();
  const current=await request(randomUUID()),opened=await runtime.call('db.connections.v2.session.open',{repoRoot:root},current.context) as {sessionHandle:string};assert.ok(opened.sessionHandle);
  const overlay=overlays.get(opened.sessionHandle)!;overlay.commit(await overlay.prepare({key:{repoRoot:root,scope:'temporary',id:'same'},mode:'create',publicPatch:{kind:'sqlite',path}}));
  owners.push({...current,overlay,execution:await runtime.executionFor(current.context,root),count});
 }
 _setMeasureDepsForTest({scope:{listRepos:async()=>[{path:root,status:'ready'} as RegisteredRepo],findEntitiesByFile:async()=>[],listEntitiesForRepo:async()=>[],loadConnections:async()=>{throw new Error('cross-root saved enumeration forbidden');}}});
 return{root,runtime,owners,factories,async fresh(owner:typeof owners[number]){const current=await request(owner.context.connectionIdentity);return{...current,execution:await runtime.executionFor(current.context,root)};},async close(){for(const lifetime of requests){lifetime.abort();lifetime.complete();}await runtime.close();for(const lifetime of requests)await lifetime.drained;await closeAll();_setMeasureDepsForTest(undefined);PATHS.insrc=original;await rm(directory,{recursive:true,force:true});}};
}
test('owner-private measurement slot isolation and both data branches',async()=>{
 const f=await fixture(),[a,b]=f.owners as [typeof f.owners[number],typeof f.owners[number]];
 const enteredA=deferred(),enteredB=deferred(),heldA=deferred(),heldB=deferred();let hold=true;const calls=new Map<number,number>();
 const original=SqliteDriver.prototype.listTables;
 const spy=mock.method(SqliteDriver.prototype,'listTables',async function(this:SqliteDriver,...args:Parameters<typeof original>){assert.equal(args[0]?.complete,true);const result=await original.apply(this,args),count=result.tables.length;calls.set(count,(calls.get(count)??0)+1);if(hold){(count===1?enteredA:enteredB).resolve();await(count===1?heldA:heldB).promise;}return result;});
 const cancel=new AbortController();
 try {
  const first=measureDataSource({poolPath:f.root,connectionId:'same'},'S',{connectionExecution:a.execution,sourceTimeoutMs:5000,signal:cancel.signal});
  const second=measureDataSource({poolPath:f.root,connectionId:'same'},'M',{connectionExecution:b.execution,sourceTimeoutMs:5000});await enteredA.promise;await enteredB.promise;
  const another=await f.fresh(a),duplicate=await measureDataSource({poolPath:f.root,connectionId:'same'},undefined,{connectionExecution:another.execution,sourceTimeoutMs:100});assert.equal(duplicate.determined,false);assert.equal(duplicate.note,'The connection measure is busy.');assert.equal(calls.get(1),1);
  cancel.abort();const cancelled=await first;assert.equal(cancelled.determined,false);assert.match(cancelled.note!,/cancelled/);
  heldB.resolve();const other=await second;assert.equal(other.determined,true);assert.equal(other.items,3);assert.equal(other.sizeHint,'M');
  a.lifetime.complete();assert.equal(await Promise.race([a.lifetime.drained.then(()=>false),delay(5,true)]),true);
  heldA.resolve();await a.lifetime.drained;hold=false;
  const fresh=await measureDataSource({poolPath:f.root,connectionId:'same'},'L',{connectionExecution:another.execution,sourceTimeoutMs:1000});assert.equal(fresh.determined,true);assert.equal(fresh.items,1);assert.equal(calls.get(1),2);
  const revision=a.overlay.read('same').revision;a.overlay.commit(await a.overlay.prepare({key:{repoRoot:f.root,scope:'temporary',id:'same'},mode:'update',expectedRevision:revision,publicPatch:{label:'new revision'}}));
  const again=await measureRequestScope({kind:'connection',value:'same'},'generic',undefined,{connectionExecution:another.execution,sourceTimeoutMs:1000});assert.equal(again.items,1);assert.equal(again.determined,true);assert.equal(calls.get(1),3);
  const pool=await measureResolvedScope({kind:'repo',value:f.root,lookupPath:f.root,repoPath:f.root},'data',undefined,{connectionExecution:b.execution,sourceTimeoutMs:1000});assert.equal(pool.items,3);assert.equal(pool.determined,true);
  a.overlay.commit(await a.overlay.prepare({key:{repoRoot:f.root,scope:'temporary',id:'sampled'},mode:'create',publicPatch:{kind:'redis',endpoint:'redis://127.0.0.1:1'}}));
  const sampled=await measureDataSource({poolPath:f.root,connectionId:'sampled'},undefined,{connectionExecution:another.execution,sourceTimeoutMs:1000});assert.equal(sampled.determined,false);assert.match(sampled.note!,/no namespaces/);assert.equal(f.factories.includes('redis'),false);
 } finally {hold=false;heldA.resolve();heldB.resolve();spy.mock.restore();await f.close();}
});
test('measurement timeout and late rejection retain real owner drain and lease',async()=>{
 for(const fail of [false,true]){
  const f=await fixture(),a=f.owners[0]!,entered=deferred(),held=deferred();let reads=0,settled=false;const unhandled:unknown[]=[];const onUnhandled=(e:unknown)=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
  const original=SqliteDriver.prototype.listTables;
  const spy=mock.method(SqliteDriver.prototype,'listTables',async function(this:SqliteDriver,...args:Parameters<typeof original>){const result=await original.apply(this,args);entered.resolve();try{await held.promise;if(fail)throw Object.defineProperty(new Error(),'message',{get(){reads++;return 'LATE_SOURCE_CANARY';}});return result;}finally{settled=true;}});
  let ending:Promise<unknown>|undefined;
  try {
   const work=measureDataSource({poolPath:f.root,connectionId:'same'},undefined,{connectionExecution:a.execution,sourceTimeoutMs:10});await entered.promise;const timed=await work;assert.equal(timed.determined,false);assert.match(timed.note!,/timed out/);assert.equal(settled,false);
   const otherRequest=await f.fresh(a);assert.equal((await measureDataSource({poolPath:f.root,connectionId:'same'},undefined,{connectionExecution:otherRequest.execution})).note,'The connection measure is busy.');
   await assert.rejects(a.overlay.prepare({key:{repoRoot:f.root,scope:'temporary',id:'same'},mode:'update',expectedRevision:a.overlay.read('same').revision,publicPatch:{label:'blocked'}}),{code:'busy'});
   a.lifetime.complete();assert.equal(await Promise.race([a.lifetime.drained.then(()=>false),delay(5,true)]),true);
   ending=f.runtime.call('db.connections.v2.session.end',{}, {connectionIdentity:a.context.connectionIdentity,daemonEpoch:a.context.daemonEpoch});assert.equal(await Promise.race([ending.then(()=>false),delay(5,true)]),true);
   held.resolve();assert.deepEqual(await ending,{status:'ended'});await a.lifetime.drained;assert.equal(settled,true);assert.equal(reads,0);await delay(5);assert.deepEqual(unhandled,[]);
  } finally {held.resolve();await ending;spy.mock.restore();process.off('unhandledRejection',onUnhandled);await f.close();}
 }
});
