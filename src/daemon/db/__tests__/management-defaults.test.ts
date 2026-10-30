import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,lstat,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DuckDBInstance} from '@duckdb/node-api';
import {environment} from './fixtures/saved-management-fixture.js';
import {connectionManagementEnablement,verifyConnectionManagementRelease} from '../management-enablement.js';
import {initializeFreshManagedRoot,ensureDefaultManagedRoot,closeDefaultManagedRoots} from '../management-defaults.js';
import {connectionsPath} from '../config.js';
import {openManagedRoot} from '../management-startup.js';
import {DriverPool} from '../pool.js';
import {savedManagementFor} from '../management.js';
import {connectionManagementRpc} from '../../connection-management-rpc.js';
import type {TrustedRpcContext} from '../../request-context.js';
import type {MutationRequest,OperationTicket,DraftTestResult} from '../../../shared/connection-management.js';

test('CM-DEFAULT: runtime is enabled independently of unverified release evidence',async()=>{
 for(const scopes of [[],['sc5'],['sc6'],['sc5','sc6']]){const runtime=await connectionManagementEnablement(undefined,scopes);assert.equal(runtime.ready,true);assert.match(runtime.digest,/^[a-f0-9]{64}$/);}
 assert.equal((await connectionManagementEnablement(undefined,['unknown'])).ready,false);
 assert.equal((await verifyConnectionManagementRelease()).ready,false,'pending audit is retained, not forged positive');
});

test('CM-DEFAULT: fresh initialization refuses unregistered legacy symlink and interrupted roots without modifying their data',async()=>{
 const env=await environment();const values=new Map<string,string>(),keystore={getKey:async(k:string)=>values.get(k)??null,setKey:async(k:string,v:string)=>{values.set(k,v);},deleteKey:async(k:string)=>{values.delete(k);}};
 try{
  for(const kind of ['unregistered','legacy','symlink','interrupted']){
   const root=join(env.directory,kind);await mkdir(root);const path=connectionsPath(root);await mkdir(dirname(path),{recursive:true,mode:0o700});
   const bytes=Buffer.from('{"connections":[],"keep":"original"}');
   if(kind==='legacy')await writeFile(path,bytes);
   if(kind==='symlink'){const target=join(env.directory,'source');await writeFile(target,bytes);await symlink(target,path);}
   if(kind==='interrupted')await mkdir(join(dirname(path),'connection-management'),{mode:0o700});
   await assert.rejects(initializeFreshManagedRoot(root,{isRegistered:async()=>kind!=='unregistered',keystore}));
   if(kind==='legacy'||kind==='symlink')assert.deepEqual(await readFile(path),bytes);
  }
  assert.equal(values.size,0,'refused roots never create signing keys');
 }finally{await env.cleanup();}
});

test('CM-DEFAULT: default policy supports fresh Saved Parquet Test Save reopen and removal with real file driver', {timeout:60000},async()=>{
 const env=await environment(),root=join(env.directory,'fresh');await mkdir(root);
 const values=new Map<string,string>(),keystore={getKey:async(k:string)=>values.get(k)??null,setKey:async(k:string,v:string)=>{values.set(k,v);},deleteKey:async(k:string)=>{values.delete(k);}};
 const pool=new DriverPool(root),ports={isRegistered:async(candidate:string)=>candidate===root,keystore,pool:async()=>{await pool.reload();return pool;}};
 const drains:Promise<unknown>[]=[],context:TrustedRpcContext={connectionIdentity:'default-enabled-peer',daemonEpoch:randomUUID(),registerDrain:p=>{drains.push(p);}};
 let reopened:Awaited<ReturnType<typeof openManagedRoot>>|undefined;
 try{
  const source=join(root,'orders.parquet'),db=await DuckDBInstance.create(':memory:'),connection=await db.connect();
  try{await connection.run(`COPY (SELECT 1 AS order_id, 'Test customer' AS customer) TO '${source.replaceAll("'","''")}' (FORMAT PARQUET)`);}finally{connection.closeSync();db.closeSync();}
  const bytes=await readFile(source);
  await Promise.all([ensureDefaultManagedRoot(root,ports),ensureDefaultManagedRoot(root,ports)]);
  const path=connectionsPath(root);assert.equal((await lstat(path)).mode&0o777,0o400);
  const state=JSON.parse(await readFile(join(dirname(path),'connection-management/state.json'),'utf8')).payload;
  assert.equal(state.oldDaemon,undefined);assert.equal(state.initializedBy.pid,process.pid);assert.equal(state.baseline.missing,true);
  const caps=await connectionManagementRpc('db.connections.v2.capabilities',{repoRoot:root},context) as {features:string[]};
  for(const feature of ['workbench-sessions','session-delegation','draft-test','test-cancellation','saved-create','saved-update','saved-remove'])assert.ok(caps.features.includes(feature),feature);
  const key={repoRoot:root,scope:'saved' as const,id:'orders'},publicPatch={kind:'parquet',path:'orders.parquet',label:''};
  const probe=await connectionManagementRpc('db.connections.v2.test',{key,requestId:randomUUID(),draftRevision:1,publicPatch,credentials:{}},context) as DraftTestResult;
  assert.equal(probe.status,'reachable',JSON.stringify(probe));await Promise.all(drains);
  const ticket=await connectionManagementRpc('db.connections.v2.ticket',{key,mode:'create'},context) as OperationTicket;
  const request:MutationRequest={ticket,operationId:ticket.operationId,key,mode:'create',publicPatch,credentials:{}};
  const result=await connectionManagementRpc('db.connections.v2.mutate',request,context) as {status:string;value:{revision:string}};
  assert.equal(result.status,'committed',JSON.stringify(result));
  assert.deepEqual(await readFile(source),bytes);
  // Reopen the persisted, signed owner state using the normal startup path.
  await closeDefaultManagedRoots();reopened=await openManagedRoot(root,ports);
  assert.equal((await savedManagementFor(root)!.list({connectionIdentity:context.connectionIdentity,access:{lookupRoot:root,managementRepoRoot:root,daemonEpoch:context.daemonEpoch}})).length,1);
  const removeTicket=await connectionManagementRpc('db.connections.v2.ticket',{key,mode:'remove'},context) as OperationTicket;
  const removed=await connectionManagementRpc('db.connections.v2.mutate',{ticket:removeTicket,operationId:removeTicket.operationId,key,mode:'remove',expectedRevision:result.value.revision},context) as {status:string};
  assert.equal(removed.status,'committed',JSON.stringify(removed));assert.deepEqual(await readFile(source),bytes);
 }finally{await Promise.allSettled(drains);await reopened?.close();await closeDefaultManagedRoots();await pool.closeAll();await env.cleanup();}
});
