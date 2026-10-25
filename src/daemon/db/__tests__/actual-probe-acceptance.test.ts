import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,realpath,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {connect} from 'node:net';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {serialize} from 'bson';
import {PATHS} from '../../../shared/paths.js';
import {connectionsPath,repoIdOf} from '../config.js';
import {adoptManagedRoot} from '../management-adoption.js';
import {openManagedRoot} from '../management-startup.js';
import {makeSecretRef,_setKeystoreForTests} from '../secrets.js';
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
async function snapshot(root:string){const result:Record<string,string>={};for(const name of await readdir(root,{recursive:true}))try{result[name]=(await readFile(join(root,name))).toString('base64');}catch{result[name]='<directory-or-socket>';}return result;}
test('CM-S2-A9: adopted saved SQL and converted file probes cross real IPC child metadata and maintenance boundaries without persistence',async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'cm-actual-probe-'))),root=join(directory,'repo'),old=PATHS.insrc;
 await mkdir(root);Object.defineProperty(PATHS,'insrc',{value:join(directory,'state'),configurable:true});
 const pg=await pgProbeServer(),values=new Map<string,string>();let writes=0;
 const keystore={getKey:async(ref:string)=>values.get(ref)??null,setKey:async(ref:string,value:string)=>{writes++;values.set(ref,value);},deleteKey:async(ref:string)=>{writes++;values.delete(ref);}};
 const previous=_setKeystoreForTests(keystore),path=connectionsPath(root),ref=makeSecretRef(repoIdOf(root),'sql');values.set(ref,'ok');
 let activated:ConnectionConfig|undefined;
 const pool=new DriverPool(root,{factory:kind=>async(config,context)=>{activated=config;return getFactory(kind)!(config,context);}});
 const ports={isRegistered:async(candidate:string)=>candidate===root,keystore,enablement:async()=>({ready:true,digest:'a'.repeat(64)}),stopped:{source:'safe-stop-control' as const,pid:2147483647,processIdentity:'b'.repeat(64),stoppedAt:new Date().toISOString()}};
 let owner:Awaited<ReturnType<typeof openManagedRoot>>|undefined,server:IpcServer|undefined;
 try {
  await writeFile(join(root,'private.bson'),serialize({value:'PRIVATE_ROW_CANARY'}));await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify({connections:[{id:'sql',kind:'postgres',url:'postgres://fixture:${secret:'+ref+'}@127.0.0.1:'+pg.port+'/fixture',secretRef:ref},{id:'file',kind:'bson',path:'private.bson'}]}),{mode:0o600});
  await adoptManagedRoot(root,ports);owner=await openManagedRoot(root,{...ports,pool:async()=>{await pool.reload();return pool;}});
  const document=JSON.parse(await readFile(path,'utf8'));
  const block=createLockBlock(),locks=installLockManager(block),other=new LockManager(block,{threadId:9010});enableMaintenanceLock();let active=0;
  const router=new Router({classOf:()=>undefined,registry:new TargetRegistry(),routed:new Set(),local:directDispatch(connectionManagementHandlers({enabled:async()=>true})),onRequest:()=>{active++;return()=>{active--;};}});
  server=new IpcServer(router.forward,Date.now,join(directory,'test.sock'));await server.listen();
  const before=await snapshot(directory),vault=[...values];writes=0;
  for(const id of ['sql','file']){
   const socket=connect(join(directory,'test.sock'));await once(socket,'connect');
   const input={requestId:randomUUID(),draftRevision:2,key:{repoRoot:root,scope:'saved' as const,id},expectedRevision:document._management.revisions[id],publicPatch:{},credentials:{}};
   const response=new Promise<unknown>((resolve,reject)=>{let text='';socket.on('error',reject);socket.on('data',chunk=>{text+=chunk;const end=text.indexOf('\n');if(end>=0)resolve(JSON.parse(text.slice(0,end)).result);});});
   socket.write(JSON.stringify({id:1,method:'db.connections.v2.test',params:input})+'\n');
   const result=await response as {status:string};assert.equal(result.status,'reachable',JSON.stringify(result));assert.ok(!JSON.stringify(result).includes('CANARY'));socket.destroy();
   if(id==='sql'){
    const prepared=await savedManagementFor(root)!.prepareDraft({connectionIdentity:'fixture',access:{lookupRoot:root,managementRepoRoot:root,daemonEpoch:'epoch'}},input);
    await pool.withConnection(id,async()=>{});assert.deepEqual(activated,{...prepared.config,family:'rdbms'});
   }
  }
  await pool.closeAll();await new Promise(r=>setImmediate(r));
  assert.equal(active,0);assert.equal(connectionTestSupervisor.activeCount,0);assert.equal(locks.query().held.length,0);
  assert.equal(await other.request(MAINTENANCE_LOCK,{mode:'exclusive',ifAvailable:true},lock=>lock!==null),true);
  assert.deepEqual(pg.queries,['SELECT 1']);assert.equal(writes,0);assert.deepEqual([...values],vault);assert.deepEqual(await snapshot(directory),before);
 }finally{await server?.close();await owner?.close();await pool.closeAll();await pg.close();_setKeystoreForTests(previous);Object.defineProperty(PATHS,'insrc',{value:old,configurable:true});await rm(directory,{recursive:true,force:true});}
});
