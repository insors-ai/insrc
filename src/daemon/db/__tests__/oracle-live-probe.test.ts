import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseFixture} from './fixtures/docker-database.js';
import {getFactory} from '../registry.js';
import type {DraftProbe} from '../draft-probe.js';
import type {Driver} from '../../../shared/db-driver.js';
import '../drivers/oracle.js';
test('CM-S2-A4: Oracle actual service authenticates SELECT1 and closes without exposing database rows',async()=>{
 const fixture=databaseFixture('gvenzl/oracle-free:23-slim-faststart',1521,[],{ORACLE_PASSWORD:'FixturePassword123'},'2g');
 try{
  const config={id:'fixture',kind:'oracle',url:'oracle://system:FixturePassword123@127.0.0.1:'+fixture.port+'/FREEPDB1'};
  let ready=false,last:unknown;
  for(const deadline=Date.now()+180000;Date.now()<deadline;){
   const driver=await getFactory('oracle')!(config) as Driver&DraftProbe;
   try{assert.equal(await driver.probeReachability(),undefined);ready=true;break;}catch(error){last=error;}finally{await driver.close();}
   await new Promise(r=>setTimeout(r,500));
  }
  assert.equal(ready,true,String(last));
  const denied=await getFactory('oracle')!({...config,url:config.url.replace('FixturePassword123','IncorrectPassword')}) as Driver&DraftProbe;
  try{await assert.rejects(denied.probeReachability());}finally{await denied.close();}
  fixture.close();
  const unavailable=await getFactory('oracle')!(config) as Driver&DraftProbe;
  try{await assert.rejects(unavailable.probeReachability());}finally{await unavailable.close();}
 }finally{fixture.close();}
});
