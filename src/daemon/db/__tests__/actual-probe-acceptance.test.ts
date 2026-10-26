import test,{mock} from 'node:test';
import {fork} from 'node:child_process';
import type {ChildProcess,ForkOptions} from 'node:child_process';
import {createServer as createHttpServer} from 'node:http';
import type {DraftProbe} from '../draft-probe.js';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,realpath,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {connect,createServer} from 'node:net';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {serialize} from 'bson';
import {PATHS} from '../../../shared/paths.js';
import {connectionsPath,repoIdOf} from '../config.js';
import {adoptManagedRoot} from '../management-adoption.js';
import {openManagedRoot} from '../management-startup.js';
import {makeSecretRef,referencedSecrets,_setKeystoreForTests} from '../secrets.js';
import {DriverPool} from '../pool.js';
import {getFactory} from '../registry.js';
import {savedManagementFor} from '../management.js';
import {connectionTestSupervisor} from '../draft-test.js';
import {IpcServer,directDispatch} from '../../server.js';
import {connectionManagementHandlers} from '../../connection-management-rpc.js';
import {Router} from '../../threads/router.js';
import {TargetRegistry} from '../../threads/registry.js';
import {createLockBlock,installLockManager,LockManager} from '../../../shared/locks/lock-manager.js';
import {enableMaintenanceLock,MAINTENANCE_LOCK} from '../../../shared/locks/maintenance-lock.js';
import {pgProbeServer} from './fixtures/sql-probe-servers.js';
import type {ConnectionConfig} from '../../../shared/db-driver.js';
import '../drivers/index.js';
function effectiveRuntime(config:ConnectionConfig){const {secretRef,ephemeral,...effective}=config;return effective;}
async function snapshot(root:string){const result:Record<string,string>={};for(const name of await readdir(root,{recursive:true}))try{result[name]=(await readFile(join(root,name))).toString('base64');}catch{result[name]='<directory-or-socket>';}return result;}
test('CM-S2-A9: adopted saved SQL and converted file probes cross real IPC child metadata and maintenance boundaries without persistence',async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'cm-actual-probe-'))),root=join(directory,'repo'),old=PATHS.insrc;
 await mkdir(root);Object.defineProperty(PATHS,'insrc',{value:join(directory,'state'),configurable:true});
 const pg=await pgProbeServer(),values=new Map<string,string>(),reads:string[]=[];let writes=0;
 const keystore={getKey:async(ref:string)=>{reads.push(ref);return values.get(ref)??null;},setKey:async(ref:string,value:string)=>{writes++;values.set(ref,value);},deleteKey:async(ref:string)=>{writes++;values.delete(ref);}};
 const previous=_setKeystoreForTests(keystore),path=connectionsPath(root),ref=makeSecretRef(repoIdOf(root),'sql');values.set(ref,'old-secret-canary');const otherRef=makeSecretRef(repoIdOf(root),'unrelated');values.set(otherRef,'unrelated-private-canary');
 const awsNames=['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_EC2_METADATA_DISABLED'],awsBefore=new Map(awsNames.map(name=>[name,process.env[name]]));
 Object.assign(process.env,{AWS_ACCESS_KEY_ID:'FIXTUREKEY',AWS_SECRET_ACCESS_KEY:'PRIVATE_AWS_CANARY',AWS_SESSION_TOKEN:'PRIVATE_TOKEN_CANARY',AWS_EC2_METADATA_DISABLED:'true'});delete process.env['AWS_PROFILE'];
 const dynamoRequests:{key:string;token:unknown;body:unknown}[]=[];
 const dynamoServer=createHttpServer(async(req,res)=>{let body='';for await(const part of req)body+=part;dynamoRequests.push({key:/Credential=([^/]+)/.exec(String(req.headers.authorization))?.[1]??'',token:req.headers['x-amz-security-token'],body:JSON.parse(body)});res.end('{"TableNames":["PRIVATE_TABLE_CANARY"]}');});
 await new Promise<void>(r=>dynamoServer.listen(0,'127.0.0.1',r));const dynamoAddress=dynamoServer.address();assert.ok(dynamoAddress&&typeof dynamoAddress==='object');
 const childOutput:string[]=[];
 const spawnSpy=mock.method(connectionTestSupervisor as unknown as {spawnWorker:(entry:string,options:ForkOptions)=>ChildProcess},'spawnWorker',(entry,options)=>{
  assert.equal(Object.keys(options.env??{}).some(name=>name.startsWith('AWS_')),false);assert.ok(!JSON.stringify({entry,env:options.env,execArgv:options.execArgv}).includes('CANARY'));
  const child=fork(entry,[],{...options,stdio:['ignore','pipe','pipe','ipc']});child.stdout!.on('data',chunk=>childOutput.push(String(chunk)));child.stderr!.on('data',chunk=>childOutput.push(String(chunk)));return child;
 });
 let activated:ConnectionConfig|undefined,sqlDriver:DraftProbe|undefined;
 const pool=new DriverPool(root,{factory:kind=>async(config,context)=>{activated=config;const driver=await getFactory(kind)!(config,context);if(config.id==='sql')sqlDriver=driver as typeof driver&DraftProbe;return driver;}});
 const ports={isRegistered:async(candidate:string)=>candidate===root,keystore,enablement:async()=>({ready:true,digest:'a'.repeat(64)}),stopped:{source:'safe-stop-control' as const,pid:2147483647,processIdentity:'b'.repeat(64),stoppedAt:new Date().toISOString()}};
 let owner:Awaited<ReturnType<typeof openManagedRoot>>|undefined,server:IpcServer|undefined;
 try {
  await writeFile(join(root,'PRIVATE_SOURCE_PATH_CANARY.bson'),serialize({value:'PRIVATE_ROW_CANARY'}));await writeFile(join(root,'PRIVATE_NATIVE_PATH_CANARY.csv'),'value\nPRIVATE_NATIVE_CANARY\n');await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify({connections:[{id:'sql',kind:'postgres',url:'postgres://fixture:${secret:'+ref+'}@127.0.0.1:'+pg.port+'/fixture',secretRef:ref},{id:'file',kind:'bson',path:'PRIVATE_SOURCE_PATH_CANARY.bson'},{id:'native',kind:'csv',path:'PRIVATE_NATIVE_PATH_CANARY.csv'},{id:'kv',kind:'dynamodb',options:{region:'us-east-1',endpoint:'http://127.0.0.1:'+dynamoAddress.port}},{id:'unrelated',kind:'postgres',url:'postgres://fixture:${secret:'+otherRef+'}@127.0.0.1:'+pg.port+'/fixture',secretRef:otherRef}]}),{mode:0o600});
  await adoptManagedRoot(root,ports);owner=await openManagedRoot(root,{...ports,pool:async()=>{await pool.reload();return pool;}});
  const initial=JSON.parse(await readFile(path,'utf8')),service=savedManagementFor(root)!;
  const key={repoRoot:root,scope:'saved' as const,id:'sql'},saveContext={connectionIdentity:'save-fixture',access:{lookupRoot:root,managementRepoRoot:root,daemonEpoch:'epoch'}};
  const block=createLockBlock(),locks=installLockManager(block),other=new LockManager(block,{threadId:9010});enableMaintenanceLock();let active=0;
  const router=new Router({classOf:()=>undefined,registry:new TargetRegistry(),routed:new Set(),local:directDispatch(connectionManagementHandlers({enabled:async()=>true})),onRequest:()=>{active++;return()=>{active--;};}});
  let lastLifetime:import('../../request-context.js').RequestLifetime|undefined;
  server=new IpcServer((request,deliver)=>{lastLifetime=request.lifetime;return router.forward(request,deliver);},Date.now,join(directory,'test.sock'));await server.listen();
  const call=async(params:unknown):Promise<{status:string;code?:string}>=>{
   const socket=connect(join(directory,'test.sock'));await once(socket,'connect');
   const response=new Promise<{status:string;code?:string}>((resolve,reject)=>{let text='';socket.on('error',reject);socket.on('data',chunk=>{text+=chunk;const end=text.indexOf('\n');if(end>=0)resolve(JSON.parse(text.slice(0,end)).result);});});
   socket.write(JSON.stringify({id:1,method:'db.connections.v2.test',params})+'\n');try{return await response;}finally{socket.destroy();}
  };
  const form={requestId:randomUUID(),draftRevision:1,key,expectedRevision:initial._management.revisions.sql,publicPatch:{label:'Saved parity fixture'},credentials:{'url.password':{action:'replace' as const,value:'ok'}}};
  const unsavedBefore=await snapshot(directory),unsavedVault=[...values];writes=0;
  assert.equal((await call(form)).status,'reachable','unsaved replacement authenticates before Save');
  const unsaved=await service.prepareDraft(saveContext,form);assert.deepEqual(await snapshot(directory),unsavedBefore);assert.deepEqual([...values],unsavedVault);assert.equal(writes,0);
  const ticket=await service.ticket(saveContext,key,'update');const saved=await service.mutate(saveContext,{ticket,operationId:ticket.operationId,key,mode:'update',expectedRevision:form.expectedRevision,publicPatch:form.publicPatch,credentials:form.credentials});
  assert.equal(saved.status,'committed',JSON.stringify(saved));
  await pool.withConnection('sql',async()=>{assert.ok(sqlDriver);await sqlDriver.probeReachability();});assert.ok(activated);assert.deepEqual(effectiveRuntime(activated),{...effectiveRuntime(unsaved.config),family:'rdbms'});
  const document=JSON.parse(await readFile(path,'utf8')),unrelatedRefs=referencedSecrets(document.connections.find((c:{id:string})=>c.id==='unrelated')),selectedRefs=referencedSecrets(document.connections.find((c:{id:string})=>c.id==='sql'));
  const count=reads.length;
  assert.equal((await call({...form,requestId:randomUUID(),expectedRevision:randomUUID()})).code,'conflict');
  assert.equal((await call({...form,requestId:randomUUID(),key:{...key,scope:'temporary'}})).code,'upgrade-required');
  assert.equal((await call({...form,requestId:randomUUID(),key:{...key,repoRoot:root+'/.'}})).code,'invalid-input');assert.equal(reads.length,count,'metadata rejections precede every key read');
  const before=await snapshot(directory),vault=[...values];writes=0;reads.length=0;
  for(const id of ['sql','file','native','kv']){
   const input={requestId:randomUUID(),draftRevision:2,key:{repoRoot:root,scope:'saved' as const,id},expectedRevision:document._management.revisions[id],publicPatch:{},credentials:{}};
   const result=await call(input);assert.equal(result.status,'reachable',JSON.stringify(result));assert.ok(!JSON.stringify(result).includes('CANARY'));
  }
  const stalls=new Set<import('node:net').Socket>();let connected!:()=>void;const workerConnected=new Promise<void>(r=>{connected=r;});
  const stalledServer=createServer(socket=>{stalls.add(socket);socket.on('close',()=>stalls.delete(socket));connected();});
  await new Promise<void>(r=>stalledServer.listen(0,'127.0.0.1',r));const address=stalledServer.address();assert.ok(address&&typeof address==='object');
  const socket=connect(join(directory,'test.sock'));await once(socket,'connect');let lateReplies=0;socket.on('data',()=>{lateReplies++;});
  try{
   socket.write(JSON.stringify({id:1,method:'db.connections.v2.test',params:{requestId:randomUUID(),draftRevision:3,key,expectedRevision:document._management.revisions.sql,publicPatch:{endpoint:'postgres://127.0.0.1:'+address.port+'/fixture'},credentials:{}}})+'\n');
   await workerConnected;const lifetime=lastLifetime!,canceledAt=performance.now();socket.destroy();await lifetime.completed;
   assert.equal(active,1);assert.equal(connectionTestSupervisor.activeCount,1);assert.equal(await other.request(MAINTENANCE_LOCK,{mode:'exclusive',ifAvailable:true},lock=>lock!==null),false);
   await lifetime.drained;await new Promise(r=>setImmediate(r));assert.ok(performance.now()-canceledAt>=200,'actual stalled child retains the bounded reaping grace');assert.equal(lateReplies,0);
  }finally{socket.destroy();for(const client of stalls)client.destroy();await new Promise<void>(r=>stalledServer.close(()=>r()));}
  await pool.closeAll();await new Promise(r=>setImmediate(r));
  assert.equal(active,0);assert.equal(connectionTestSupervisor.activeCount,0);assert.equal(locks.query().held.length,0);
  assert.equal(await other.request(MAINTENANCE_LOCK,{mode:'exclusive',ifAvailable:true},lock=>lock!==null),true);
  assert.deepEqual(pg.queries,['SELECT 1','SELECT 1','SELECT 1']);assert.deepEqual(dynamoRequests,[{key:'FIXTUREKEY',token:'PRIVATE_TOKEN_CANARY',body:{Limit:1}}]);assert.equal(childOutput.join(''),'');assert.ok(reads.some(ref=>selectedRefs.has(ref)));assert.ok(reads.every(ref=>!unrelatedRefs.has(ref)));assert.equal(writes,0);assert.deepEqual([...values],vault);assert.deepEqual(await snapshot(directory),before);
 }finally{await server?.close();await owner?.close();await pool.closeAll();await pg.close();await new Promise<void>(r=>dynamoServer.close(()=>r()));spawnSpy.mock.restore();for(const[name,value]of awsBefore)if(value===undefined)delete process.env[name];else process.env[name]=value;_setKeystoreForTests(previous);Object.defineProperty(PATHS,'insrc',{value:old,configurable:true});await rm(directory,{recursive:true,force:true});}
});
