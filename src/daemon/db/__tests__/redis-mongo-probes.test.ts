import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getFactory} from '../registry.js';
import type {DraftProbe} from '../draft-probe.js';
import type {Driver} from '../../../shared/db-driver.js';
import {databaseFixture} from './fixtures/docker-database.js';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
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
  const paused=await getFactory('mongodb')!({id:'paused',kind:'mongodb',url:'mongodb://fixture:fixture-pass@127.0.0.1:'+mongo.port+'/admin?authSource=admin'}) as Driver & DraftProbe;
  await paused.probeReachability();execFileSync('docker',['pause',mongo.id],{stdio:'ignore'});
  try {const started=Date.now();await assert.rejects(paused.probeReachability());assert.ok(Date.now()-started<7500,'established Mongo ping has an operation deadline');}
  finally {execFileSync('docker',['unpause',mongo.id],{stdio:'ignore'});await paused.close();}
 } finally {mongo?.close();redis.close();}
 // Closed fixture ports exercise actual network failure after successful construction.
 for(const kind of ['redis','valkey','keydb','mongodb']) {
  const port=kind==='mongodb'?mongo!.port:redis.port;
  const driver=await getFactory(kind)!({id:'closed',kind,url:(kind==='mongodb'?'mongodb':'redis')+'://127.0.0.1:'+port}) as Driver & DraftProbe;
  try {await assert.rejects(driver.probeReachability());} finally {await driver.close().catch(()=>{});}
 }
});

test('CM-S2-A5: an established silent Redis endpoint cannot hang PING or QUIT cleanup',async()=>{
 const sockets=new Set<import('node:net').Socket>();const commands:string[]=[];
 const server=createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});let buffer='';
  socket.on('data',data=>{buffer+=data.toString();
   while(buffer.startsWith('*')) {
    const end=buffer.indexOf('\r\n');if(end<0)return;const count=Number(buffer.slice(1,end));let offset=end+2;const args:string[]=[];
    for(let i=0;i<count;i++){const line=buffer.indexOf('\r\n',offset);if(line<0)return;const size=Number(buffer.slice(offset+1,line));if(buffer.length<line+2+size+2)return;args.push(buffer.slice(line+2,line+2+size));offset=line+2+size+2;}
    buffer=buffer.slice(offset);const cmd=args[0]!.toLowerCase();commands.push(cmd);
    if(cmd==='ping'||cmd==='quit')continue;
    if(cmd==='info'){const body='role:master\r\n';socket.write('$'+Buffer.byteLength(body)+'\r\n'+body+'\r\n');}else socket.write('+OK\r\n');
   }
  });
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address==='object');
 const driver=await getFactory('redis')!({id:'silent',kind:'redis',url:'redis://127.0.0.1:'+address.port}) as Driver & DraftProbe;
 try {let started=Date.now();await assert.rejects(driver.probeReachability());assert.ok(Date.now()-started<7500);started=Date.now();await driver.close();assert.ok(Date.now()-started<7500);assert.ok(commands.includes('ping')&&commands.includes('quit'));}
 finally {for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));}
});
