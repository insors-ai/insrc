import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getFactory} from '../registry.js';
import type {DraftProbe} from '../draft-probe.js';
import type {Driver} from '../../../shared/db-driver.js';
import {databaseFixture} from './fixtures/docker-database.js';
import '../drivers/redis.js';
import '../drivers/mongodb.js';

test('CM-S2-A5: Redis aliases and MongoDB authenticate real readonly probes and reject bad credentials or closed ports',async()=>{
 const redis=databaseFixture('redis:7.4-alpine',6379,['redis-server','--requirepass','fixture-pass','--save','','--appendonly','no']);
 let mongo: ReturnType<typeof databaseFixture>|undefined;
 try {
  mongo=databaseFixture('mongo:8.0',27017,[],{MONGO_INITDB_ROOT_USERNAME:'fixture',MONGO_INITDB_ROOT_PASSWORD:'fixture-pass'});
  for(const kind of ['redis','valkey','keydb','mongodb']) {
   const fixture=kind==='mongodb'?mongo:redis,scheme=kind==='mongodb'?'mongodb':'redis';
   const url=scheme+'://'+(kind==='mongodb'?'fixture':'default')+':fixture-pass@127.0.0.1:'+fixture.port+(kind==='mongodb'?'/admin?authSource=admin':'');
   let ready=false;const deadline=Date.now()+30000;
   while(Date.now()<deadline) {
    const driver=await getFactory(kind)!({id:kind,kind,url}) as Driver & DraftProbe;
    try {await driver.probeReachability();ready=true;break;} catch {} finally {await driver.close().catch(()=>{});}
    await new Promise(r=>setTimeout(r,100));
   }
   assert.equal(ready,true,kind+' fixture not ready');
   const bad=await getFactory(kind)!({id:'bad',kind,url:url.replace(':fixture-pass@',':wrong@')}) as Driver & DraftProbe;
   try {await assert.rejects(bad.probeReachability());} finally {await bad.close().catch(()=>{});}
  }
 } finally {mongo?.close();redis.close();}
 // Closed fixture ports exercise actual network failure after successful construction.
 for(const kind of ['redis','valkey','keydb','mongodb']) {
  const port=kind==='mongodb'?mongo!.port:redis.port;
  const driver=await getFactory(kind)!({id:'closed',kind,url:(kind==='mongodb'?'mongodb':'redis')+'://127.0.0.1:'+port}) as Driver & DraftProbe;
  try {await assert.rejects(driver.probeReachability());} finally {await driver.close().catch(()=>{});}
 }
});
