import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getFactory} from '../registry.js';
import type {DraftProbe} from '../draft-probe.js';
import type {Driver} from '../../../shared/db-driver.js';
import {pgProbeServer,mysqlProbeServer} from './fixtures/sql-probe-servers.js';
import '../drivers/pg.js';
import '../drivers/mysql.js';

test('CM-S2-A3: registered SQL probes authenticate and await SELECT1 rather than lazy construction',async()=>{
 const postgres=await pgProbeServer(),mysql=await mysqlProbeServer();
 try {
  for(const kind of ['postgres','cockroachdb','mysql','mariadb']) {
   const fixture=kind==='postgres'||kind==='cockroachdb'?postgres:mysql,scheme=kind==='postgres'||kind==='cockroachdb'?'postgres':'mysql';
   const factory=getFactory(kind)!;
   const before=fixture.queries.length;
   const driver=await factory({id:kind,kind,url:scheme+'://good:ok@127.0.0.1:'+fixture.port+'/fixture'}) as Driver & DraftProbe;
   assert.equal(fixture.queries.length,before,'construction itself does not prove reachability');
   try {await driver.probeReachability();assert.deepEqual(fixture.queries.slice(before),['SELECT 1']);} finally {await driver.close();}
   const rejected=await factory({id:'bad',kind,url:scheme+'://bad:wrong@127.0.0.1:'+fixture.port+'/fixture'}) as Driver & DraftProbe;
   try {await assert.rejects(rejected.probeReachability());} finally {await rejected.close();}
  }
 } finally {await postgres.close();await mysql.close();}
 const closed=await pgProbeServer(),port=closed.port;await closed.close();
 for(const kind of ['postgres','cockroachdb','mysql','mariadb']) {
  const driver=await getFactory(kind)!({id:'unreachable',kind,url:(kind==='postgres'||kind==='cockroachdb'?'postgres':'mysql')+'://user:password@127.0.0.1:'+port+'/db'}) as Driver & DraftProbe;
  try {await assert.rejects(driver.probeReachability());} finally {await driver.close();}
 }
});
