/** Isolated actual source/compiled file lifecycles. All paths and sources are test-owned. */
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {mkdtemp,mkdir,realpath,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import fs,{watch} from 'node:fs';
import fsPromises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {source} from './session-file-inputs.js';
import type {Driver,FileDriver} from '../../../../shared/db-driver.js';
import type {TemporaryConnectionOverlay} from '../../session-entries.js';
import type {MemoryFileExecution} from '../../file-execution.js';
const mode=process.argv[2]==='compiled'?'compiled':'source';
const base=new URL(mode==='compiled'?'../../../../../out/':'../../../../',import.meta.url);
const load=(path:string)=>import(new URL(path,base).href);
const directory=await realpath(await mkdtemp(join(tmpdir(),'cm-file-removal-')));
const {PATHS}=await load('shared/paths.js');
for(const [key,value] of Object.entries(PATHS)){
 if(typeof value==='string')PATHS[key]=join(directory,'state',key);
 else if(typeof value==='function')PATHS[key]=(...args:string[])=>join(directory,'state',key,...args.map(encodeURIComponent));
}
await mkdir(PATHS.insrc,{recursive:true});await mkdir(dirname(PATHS.config),{recursive:true});await writeFile(PATHS.config,'{}');
const {ConnectionSessionOwner}=await load('daemon/db/session-owner.js') as typeof import('../../session-owner.js');
const {createTemporaryOverlay}=await load('daemon/db/session-entries.js') as typeof import('../../session-entries.js');
const {contextualDriverFactory}=await load('daemon/db/driver-log-policy.js') as typeof import('../../driver-log-policy.js');
const {temporaryRemovalState,retryTemporaryRemovalCleanup}=await load('daemon/db/session-management.js') as typeof import('../../session-management.js');
const {getFactory}=await load('daemon/db/registry.js') as typeof import('../../registry.js');
await load('daemon/db/drivers/index.js');
const {DriverPool}=await load('daemon/db/pool.js') as typeof import('../../pool.js');
const {SavedConnectionManagement}=await load('daemon/db/management.js') as typeof import('../../management.js');
const {ManagedRegistry,PreparationJournal}=await load('daemon/db/managed-store.js') as typeof import('../../managed-store.js');
const {SavedTicketAuthority}=await load('daemon/db/management-tickets.js') as typeof import('../../management-tickets.js');
const {CredentialGenerations}=await load('daemon/db/secrets.js') as typeof import('../../secrets.js');
const {connectionsPath}=await load('daemon/db/config.js') as typeof import('../../config.js');
const {closeDuckDB}=await load('daemon/db/duckdb-pool.js');
async function tree(root:string):Promise<Record<string,string>>{
 const result:Record<string,string>={};try{for(const name of await readdir(root,{recursive:true}))try{result[name]=createHash('sha256').update(await readFile(join(root,name))).digest('hex');}catch{}}catch{}return result;
}
function protectSources(root:string){
 let writes=0;const spies:{mock:{restore():void}}[]=[];
 const selected=(value:unknown)=>typeof value==='string'&&(resolve(value)===root||resolve(value).startsWith(root+'/'));
 for(const [target,names] of [[fsPromises,['unlink','rm','rename','truncate','writeFile','appendFile']],[fs,['unlinkSync','rmSync','renameSync','truncateSync','writeFileSync','appendFileSync']]] as const){
  for(const name of names){
   const original=Reflect.get(target,name) as (...args:unknown[])=>unknown;
   spies.push(mock.method(target,name as never,((...args:unknown[])=>{if(args.some(selected)){writes++;throw new Error('Source mutation forbidden');}return Reflect.apply(original,target,args);}) as never));
  }
 }
 syncBuiltinESMExports();return {assertUntouched(){assert.equal(writes,0);},restore(){for(const spy of spies)spy.mock.restore();syncBuiltinESMExports();}};
}
const kinds=['csv','tsv','json','jsonl','ndjson','parquet','avro','bson','fixed-width','xlsx'];
let temporaryClosed=0,savedClosed=0;
try{
 const root=join(directory,'temporary'),inputs=join(root,'inputs');await mkdir(inputs,{recursive:true});
 const configs=[];for(const kind of kinds)configs.push(await source(inputs,kind,'CM_REMOVE_FILE_PRIVATE','input'));
 const csvDirectory=join(inputs,'directory');await mkdir(csvDirectory);await source(csvDirectory,'csv','CM_REMOVE_FILE_PRIVATE','one');await source(csvDirectory,'csv','CM_REMOVE_FILE_PRIVATE','two');configs.push({id:'csv-directory',kind:'csv',path:csvDirectory,recursive:true,options:{header:true}});
 const context={connectionIdentity:'files',daemonEpoch:'epoch'};let latest:MemoryFileExecution|undefined,closeAttempts=0;
 const owner=new ConnectionSessionOwner<TemporaryConnectionOverlay>({daemonEpoch:'epoch',isRegistered:async candidate=>candidate===root,createOverlay:(r,h,c)=>createTemporaryOverlay(r,h,c,{factory:kind=>contextualDriverFactory(async(config,authority)=>{
  const driver=await getFactory(kind)!(config,authority),close=driver.close.bind(driver);latest=(driver as unknown as {execution:MemoryFileExecution}).execution;
  mock.method(driver,'close',async()=>{if(config.id==='csv'&&++closeAttempts===1)throw new Error('CM_REMOVE_FILE_CLOSE_CANARY');await close();temporaryClosed++;});return driver;
 })}),dropOverlay:overlay=>overlay.close()});
 await owner.open(context,root);const owned=await owner.management(context,root),overlay=owned.overlay,authority={...owned,assertRequest:()=>owned.binding.assertActive()},resolver=overlay.resolver(owned.binding.access,{assertActive:authority.assertRequest,signal:owned.binding.signal});
 const before=await tree(directory),sourceBefore=await tree(inputs),events:string[]=[],protection=protectSources(inputs);const watcher=watch(inputs,{recursive:true},(_event,name)=>events.push(String(name)));
 try{for(const config of configs){
  const key={repoRoot:root,scope:'temporary' as const,id:config.id};
  const row=overlay.commit(await overlay.prepare({key,mode:'create',publicPatch:{kind:config.kind,path:config.path,...(config.options?{options:config.options}:{}),...(config.recursive?{recursive:true}:{})}}));
  await resolver.withConnection(owned.binding.access,config.id,async driver=>{assert.equal(driver.family,'file');assert.ok(JSON.stringify(await (driver as FileDriver).sample(config.kind==='xlsx'?'Data':undefined,{limit:1})).includes('CM_REMOVE_FILE_PRIVATE'));});
  const execution=latest!;assert.equal(execution.policy.persistence,'memory-only');assert.equal(execution.policy.allowSpill,false);
  const ticket=owned.ledger.issue(key,'remove'),prepared=overlay.prepareRemoval({id:config.id,expectedRevision:row.revision});
  await owned.ledger.mutate({key,ticket,operationId:ticket.operationId,mode:'remove',expectedRevision:row.revision},async(_request,commit)=>commit(()=>overlay.commitRemoval(prepared)),authority.assertRequest);
  let state=await retryTemporaryRemovalCleanup(authority,ticket);if(state.state==='removed-cleanup-pending')state=await retryTemporaryRemovalCleanup(authority,ticket);assert.equal(state.state,'removed');
  assert.equal(temporaryRemovalState(authority,ticket).state,'removed');assert.deepEqual(execution.diagnostics,{closed:true,connections:0,operations:0,tables:0,decodedBytes:0});
  assert.deepEqual(await tree(inputs),sourceBefore);await assert.rejects(resolver.lease(owned.binding.access,config.id),{code:'not-found'});
 }}finally{watcher.close();await owner.close();protection.assertUntouched();protection.restore();}
 assert.ok(events.every(name=>Object.hasOwn(sourceBefore,name)||name==='directory'),'no unexpected source directory entries');assert.deepEqual(await tree(directory),before,'temporary config conversion spill and checkpoint paths must stay unchanged');assert.equal(temporaryClosed,configs.length);assert.equal(closeAttempts,2);
 for(const kind of [...kinds,'csv-directory']){
  const savedRoot=join(directory,'saved-'+kind),savedInputs=join(savedRoot,'inputs');await mkdir(savedInputs,{recursive:true});
  if(kind==='csv-directory'){await source(savedInputs,'csv','CM_REMOVE_FILE_PRIVATE','one');await source(savedInputs,'csv','CM_REMOVE_FILE_PRIVATE','two');}
  const config=kind==='csv-directory'?{id:kind,kind:'csv',path:savedInputs,recursive:true,options:{header:true}}:await source(savedInputs,kind,'CM_REMOVE_FILE_PRIVATE','input');
  const registryId=randomUUID(),revision=randomUUID(),path=connectionsPath(savedRoot);await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify({connections:[config],_management:{version:2,registryId,generation:randomUUID(),revisions:{[config.id]:revision},receipts:{}}}),{mode:0o400});
  const values=new Map<string,string>(),keystore={getKey:async(ref:string)=>values.get(ref)??null,setKey:async(ref:string,value:string)=>{values.set(ref,value);},deleteKey:async(ref:string)=>{values.delete(ref);}};
  const tickets=await SavedTicketAuthority.open({root:savedRoot,registryId,adopted:false,keystore,isRegistered:async candidate=>candidate===savedRoot}),store=await ManagedRegistry.open(path,{ownsRoot:async()=>true}),journal=await PreparationJournal.open(path,registryId),generations=new CredentialGenerations(journal,'a'.repeat(32),{keystore,current:()=>store.inspect()});
  const pool=new DriverPool(savedRoot,{factory:kind=>async(config,privateContext)=>{const driver=await getFactory(kind)!(config,privateContext),close=driver.close.bind(driver);mock.method(driver,'close',async()=>{await close();savedClosed++;});return driver;}});await pool.reload();
  try{
   const service=await SavedConnectionManagement.create({root:savedRoot,store,tickets,generations,pool,enabled:async()=>true,isRegistered:async candidate=>candidate===savedRoot,activate:async()=>{},readSecret:keystore.getKey});
   const access={connectionIdentity:'saved-files',access:{lookupRoot:savedRoot,managementRepoRoot:savedRoot,daemonEpoch:'epoch'}},key={repoRoot:savedRoot,scope:'saved' as const,id:config.id},sourceBefore=await tree(savedInputs),events:string[]=[];
   const protection=protectSources(savedInputs);
   const watcher=watch(savedInputs,{recursive:true},(_event,name)=>events.push(String(name)));
   try{
    await pool.withConnection(config.id,async driver=>{assert.equal(driver.family,'file');assert.ok(JSON.stringify(await (driver as FileDriver).sample(kind==='xlsx'?'Data':undefined,{limit:1})).includes('CM_REMOVE_FILE_PRIVATE'));});
    const ticket=await service.ticket(access,key,'remove');const outcome=await service.mutate(access,{key,ticket,operationId:ticket.operationId,mode:'remove',expectedRevision:revision});assert.equal(outcome.status,'committed');
    assert.equal((await service.retryRemovalCleanup(access,ticket)).state,'removed');await assert.rejects(pool.lease(config.id),{code:'not-found'});assert.deepEqual(await service.list(access),[]);
    assert.deepEqual(await tree(savedInputs),sourceBefore);assert.ok(events.every(name=>Object.hasOwn(sourceBefore,name)));
   }finally{watcher.close();protection.assertUntouched();protection.restore();}
  }finally{await pool.closeAll();await store.close();}
 }
 assert.equal(savedClosed,kinds.length+1);
 process.stdout.write(JSON.stringify({proof:'file-removal-ok',mode,nativeAndConvertedKinds:kinds.length,directoryInputs:2,temporaryClosed,savedClosed})+'\n');
}finally{await closeDuckDB();await rm(directory,{recursive:true,force:true});}
