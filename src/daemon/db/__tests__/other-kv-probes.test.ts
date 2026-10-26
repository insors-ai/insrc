import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {DraftTestSupervisor} from '../draft-test.js';
import {RequestLifetime} from '../../request-context.js';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {databaseFixture} from './fixtures/docker-database.js';
import {getFactory} from '../registry.js';
import type {DraftProbe} from '../draft-probe.js';
import type {ConnectionConfig,Driver} from '../../../shared/db-driver.js';
import {DynamoDriver} from '../drivers/dynamodb.js';
import '../drivers/cassandra.js';import '../drivers/nats.js';import '../drivers/etcd.js';import '../drivers/memcached.js';

async function isolated(config:ConnectionConfig) {
 const supervisor=new DraftTestSupervisor(),lifetime=new RequestLifetime();
 const result=await supervisor.run({requestId:randomUUID(),draftRevision:0,key:{repoRoot:'/tmp',scope:'temporary',id:config.id},publicPatch:{},credentials:{}},{connectionIdentity:randomUUID(),daemonEpoch:'fixture',signal:lifetime.signal,registerDrain:lifetime.registerDrain},async()=>({config,credentialActions:{}}));
 lifetime.complete();await lifetime.drained;assert.equal(supervisor.activeCount,0);await supervisor.shutdown();
 return result;
}
test('CM-S2-A6: Cassandra NATS etcd and Memcached perform actual readonly server probes and close',async()=>{
 const fixtures:ReturnType<typeof databaseFixture>[]=[];
 try {
  const cassandra=databaseFixture('cassandra:5.0',9042,[],{MAX_HEAP_SIZE:'512M',HEAP_NEWSIZE:'128M'},'2g');fixtures.push(cassandra);
  const nats=databaseFixture('nats:2.10-alpine',4222,['--user','fixture','--pass','fixture-pass']);fixtures.push(nats);
  const etcd=databaseFixture('quay.io/coreos/etcd:v3.5.17',2379,['/usr/local/bin/etcd','--data-dir','/tmp/fixture-data','--listen-client-urls','http://0.0.0.0:2379','--advertise-client-urls','http://127.0.0.1:2379']);fixtures.push(etcd);
  const memcached=databaseFixture('memcached:1.6-alpine',11211);fixtures.push(memcached);
  const configs:ConnectionConfig[]=[{id:'c',kind:'cassandra',options:{contactPoints:['127.0.0.1:'+cassandra.port],localDataCenter:'datacenter1'}},{id:'n',kind:'nats',options:{servers:['nats://fixture:fixture-pass@127.0.0.1:'+nats.port],bucket:'unused-fixture'}},{id:'e',kind:'etcd',options:{hosts:['http://127.0.0.1:'+etcd.port]}},{id:'m',kind:'memcached',options:{servers:['127.0.0.1:'+memcached.port]}}];
  for(const config of configs) {
   let ready=false;const deadline=Date.now()+120000;let last:unknown;
   while(Date.now()<deadline) {
    const driver=await getFactory(config.kind)!(config) as Driver&DraftProbe;
    try {assert.equal(await driver.probeReachability(),undefined);ready=true;break;} catch(error){last=error;} finally {await driver.close();}
    await new Promise(r=>setTimeout(r,200));
   }
   assert.equal(ready,true,config.kind+' local fixture: '+String(last));
   assert.equal((await isolated(config)).status,'reachable',config.kind+' worker exits after actual probe and close');
  }
  const denied=await getFactory('nats')!({...configs[1]!,options:{servers:['nats://fixture:wrong@127.0.0.1:'+nats.port],bucket:'unused'}}) as Driver&DraftProbe;
  try {await assert.rejects(denied.probeReachability());} finally {await denied.close();}
  const failed=await isolated({...configs[1]!,options:{servers:['nats://fixture:PRIVATE_PASSWORD_CANARY@127.0.0.1:'+nats.port],bucket:'PRIVATE_BUCKET_CANARY'}});
  assert.equal(failed.status,'failed');assert.equal(failed.safeMessage,'Connection test failed.');assert.ok(!JSON.stringify(failed).includes('CANARY'));
  for(const fixture of fixtures)fixture.close();fixtures.length=0;
  for(const config of configs) {
   const driver=await getFactory(config.kind)!(config) as Driver&DraftProbe;
   try {await assert.rejects(driver.probeReachability());} finally {await driver.close();}
  }
 } finally {for(const fixture of fixtures)fixture.close();}
});
test('CM-S2-A6: Dynamo probe sends only authenticated ListTables Limit1 and exposes no table data',async()=>{
 const requests:unknown[]=[];let refused=false;
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push({target:req.headers['x-amz-target'],body:JSON.parse(body)});if(refused){res.statusCode=403;res.end('{"__type":"UnrecognizedClientException","message":"private-canary"}');}else res.end('{"TableNames":["private-table-canary"]}');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();assert.ok(addr&&typeof addr==='object');
 const driver=new DynamoDriver('fixture','us-east-1',undefined,'http://127.0.0.1:'+addr.port,{id:'fixture',kind:'dynamodb'},{type:'aws-v1',accessKeyId:'FAKEKEY',secretAccessKey:'fake-secret'});
 try {assert.equal(await driver.probeReachability(),undefined);refused=true;await assert.rejects(driver.probeReachability());assert.deepEqual(requests,[{target:'DynamoDB_20120810.ListTables',body:{Limit:1}},{target:'DynamoDB_20120810.ListTables',body:{Limit:1}}]);}
 finally {await driver.close();await new Promise<void>(r=>server.close(()=>r()));}
});

test('CM-S2-A6: Memcached absent credentials stay cleared despite ambient SDK environment',async()=>{
 const {createServer}=await import('node:net');const sockets=new Set<import('node:net').Socket>(),opcodes:number[]=[];
 const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('data',data=>{opcodes.push(data[1]!);if(data[1]!==0x0b){socket.destroy();return;}const header=Buffer.from(data.subarray(0,24)),value=Buffer.from('fixture-version');header[0]=0x81;header.writeUInt32BE(value.length,8);header.writeUInt16BE(0,6);socket.write(Buffer.concat([header,value]));});});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address==='object');
 const names=['MEMCACHE_USERNAME','MEMCACHE_PASSWORD','MEMCACHIER_USERNAME','MEMCACHIER_PASSWORD'],previous=new Map(names.map(name=>[name,process.env[name]]));
 for(const name of names)process.env[name]='AMBIENT_PRIVATE_CANARY';
 const config={id:'fixture',kind:'memcached',options:{servers:['127.0.0.1:'+address.port]}},driver=await getFactory('memcached')!(config) as Driver&DraftProbe;
 try{await driver.probeReachability();assert.deepEqual(opcodes,[0x0b]);}finally{await driver.close();for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));for(const[name,value]of previous)if(value===undefined)delete process.env[name];else process.env[name]=value;}
});
