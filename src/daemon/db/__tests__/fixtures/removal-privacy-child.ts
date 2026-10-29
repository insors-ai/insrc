/** Removal projections/logs under real normal-daemon logging, isolated state only. */
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import fsPromises,{mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import type {Driver} from '../../../../shared/db-driver.js';
import type {MutationOutcome,OperationTicket,RemovalState,OpenConnectionSessionResult} from '../../../../shared/connection-management.js';
const directory=process.argv[2]!,mode=process.argv[3]==='compiled'?'compiled':'source',base=new URL(mode==='compiled'?'../../../../../out/':'../../../../',import.meta.url);
const load=(path:string)=>import(new URL(path,base).href);
const {PATHS}=await load('shared/paths.js');
for(const [key,value] of Object.entries(PATHS))if(typeof value==='string')PATHS[key]=join(directory,'state',key);else if(typeof value==='function')PATHS[key]=(...args:string[])=>join(directory,'state',key,...args.map(encodeURIComponent));
PATHS.logDir=join(directory,'logs');PATHS.daemonLog=join(PATHS.logDir,'daemon.log');PATHS.agentLog=join(PATHS.logDir,'agent.log');
await mkdir(PATHS.insrc,{recursive:true});await mkdir(dirname(PATHS.config),{recursive:true});await writeFile(PATHS.config,'{"logLevel":"trace"}');
const {getLogger}=await load('shared/logger.js');
const {ConnectionSessionRpc}=await load('daemon/connection-session-rpc.js') as typeof import('../../../connection-session-rpc.js');
const {createTemporaryOverlay}=await load('daemon/db/session-entries.js') as typeof import('../../session-entries.js');
const {contextualDriverFactory}=await load('daemon/db/driver-log-policy.js') as typeof import('../../driver-log-policy.js');
const {_setKeystoreForTests,CredentialGenerations}=await load('daemon/db/secrets.js') as typeof import('../../secrets.js');
await load('daemon/db/drivers/index.js');
const canaries=['cm_remove_private_endpoint.invalid','CM_REMOVE_PRIVATE_CREDENTIAL','CM_REMOVE_PRIVATE_OPTIONS','CM_REMOVE_PRIVATE_SOURCE','CM_REMOVE_PRIVATE_REF','CM_REMOVE_PRIVATE_SESSION','CM_REMOVE_PRIVATE_SDK','CM_REMOVE_PRIVATE_JOURNAL'];
const privateFailure=new Error(JSON.stringify({endpoint:canaries[0],password:canaries[1],options:canaries[2],rows:canaries[3],secretRef:canaries[4],capability:canaries[5],sdk:canaries[6],journal:canaries[7]}));
const context={connectionIdentity:'private-owner',daemonEpoch:'epoch'},root=join(directory,'temporary');await mkdir(root);
const replies:unknown[]=[];let closes=0,files=0,keychain=0;
const runtime=new ConnectionSessionRpc({enabled:async()=>true,removalEnabled:async()=>true,isRegistered:async candidate=>candidate===root,createOverlay:(r,h,c)=>createTemporaryOverlay(r,h,c,{factory:()=>contextualDriverFactory(async config=>({id:config.id,kind:config.kind,family:'rdbms',close:async()=>{if(++closes===1)throw privateFailure;}} as Driver))}),dropOverlay:overlay=>overlay.close()});
async function tree(root:string):Promise<Record<string,string>>{const result:Record<string,string>={};try{for(const name of await readdir(root,{recursive:true}))try{result[name]=createHash('sha256').update(await readFile(join(root,name))).digest('hex');}catch{}}catch{}return result;}
function safe(value:unknown){
 if(value&&typeof value==='object'){
  if('safeMessage' in value)assert.ok(['The removal outcome is unknown. Reconcile using the same operation.','The registration was removed. Application-owned cleanup is pending.','The registration was removed. Source data was preserved.'].includes(String(value.safeMessage)));
  if('message' in value)assert.equal(value.message,'Invalid connection request.');
 }
 const text=JSON.stringify(value);assert.ok(text.length<16384);for(const canary of canaries)assert.equal(text.includes(canary),false);assert.equal(text.includes('db:v2:'),false);replies.push(value);}
try{
 const opened=await runtime.call('db.connections.v2.session.open',{repoRoot:root},context) as OpenConnectionSessionResult;
 const key={repoRoot:root,scope:'temporary' as const,id:'row'},ticket=await runtime.manage('db.connections.v2.ticket',{key,mode:'create'},context) as OperationTicket;
 const initial=await runtime.manage('db.connections.v2.mutate',{key,ticket,operationId:ticket.operationId,mode:'create',publicPatch:{kind:'postgres',endpoint:'postgres://'+canaries[0]+'/db'},credentials:{'url.password':{action:'replace',value:canaries[1]}}},context) as MutationOutcome;
 assert.equal(initial.status,'committed');if(initial.status!=='committed')throw new Error('Expected fixture registration');
 const before=await tree(join(directory,'state')),beforeRoot=await tree(root);
 const previous=_setKeystoreForTests({getKey:async()=>{keychain++;throw privateFailure;},setKey:async()=>{keychain++;throw privateFailure;},deleteKey:async()=>{keychain++;throw privateFailure;}});
 const read=mock.method(fsPromises,'readFile',async()=>{files++;throw privateFailure;}),write=mock.method(fsPromises,'writeFile',async()=>{files++;throw privateFailure;});syncBuiltinESMExports();
 try{
  const remove=await runtime.manage('db.connections.v2.ticket',{key,mode:'remove'},context) as OperationTicket;
  safe(await runtime.manage('db.connections.v2.removalState',{ticket:remove},context));
  safe(await runtime.manage('db.connections.v2.mutate',{key,ticket:remove,operationId:remove.operationId,mode:'remove',expectedRevision:initial.value.revision},context));
  const state=await runtime.manage('db.connections.v2.removalState',{ticket:remove},context) as RemovalState;safe(state);assert.equal(state.state,'removed-cleanup-pending');
  let retried=await runtime.manage('db.connections.v2.retryRemovalCleanup',{ticket:remove},context) as RemovalState;safe(retried);if(retried.state==='removed-cleanup-pending'){retried=await runtime.manage('db.connections.v2.retryRemovalCleanup',{ticket:remove},context) as RemovalState;safe(retried);}assert.equal(retried.state,'removed');
  safe(await runtime.manage('db.connections.v2.status',{ticket:remove},context));
  safe(await runtime.manage('db.connections.v2.removalState',{ticket:remove,cleanupRef:canaries[4]},context));
  safe(await runtime.manage('db.connections.v2.removalState',{ticket:remove},{...context,connectionIdentity:'foreign'}));
  await runtime.call('db.connections.v2.session.end',{},context);
  const lost=await runtime.manage('db.connections.v2.removalState',{ticket:remove},context) as {code:string};assert.equal(lost.code,'session-expired');safe(lost);
  const restarted=new ConnectionSessionRpc({enabled:async()=>true,removalEnabled:async()=>true,isRegistered:async candidate=>candidate===root,createOverlay:createTemporaryOverlay,dropOverlay:overlay=>overlay.close()});
  try{
   const fresh={connectionIdentity:'new-owner',daemonEpoch:'new-epoch'};await restarted.call('db.connections.v2.session.open',{repoRoot:root},fresh);
   const stale=await restarted.manage('db.connections.v2.removalState',{ticket:remove},fresh) as {code:string};assert.equal(stale.code,'invalid-input');safe(stale);
  }finally{await restarted.close();}
  assert.equal(files,0);assert.equal(keychain,0);assert.equal(closes,2);
  const wire=JSON.stringify(replies);assert.equal(wire.includes(opened.sessionHandle),false);assert.equal(wire.includes(opened.capability),false);
 }finally{read.mock.restore();write.mock.restore();syncBuiltinESMExports();_setKeystoreForTests(previous);}
 assert.deepEqual(await tree(join(directory,'state')),before);assert.deepEqual(await tree(root),beforeRoot);
}finally{await runtime.close();}
// Existing protected Saved sc2 receipts keep their owned cleanup refs; the new
// sc6 wire/log projections must never expose those refs or private payloads.
const {connectionsPath}=await load('daemon/db/config.js') as typeof import('../../config.js');
const {ManagedRegistry,PreparationJournal}=await load('daemon/db/managed-store.js') as typeof import('../../managed-store.js');
const {SavedTicketAuthority}=await load('daemon/db/management-tickets.js') as typeof import('../../management-tickets.js');
const {SavedConnectionManagement}=await load('daemon/db/management.js') as typeof import('../../management.js');
const {DriverPool}=await load('daemon/db/pool.js') as typeof import('../../pool.js');
const savedRoot=join(directory,'saved');await mkdir(savedRoot);const path=connectionsPath(savedRoot),registryId=randomUUID();await mkdir(dirname(path),{recursive:true});
await writeFile(path,JSON.stringify({connections:[],_management:{version:2,registryId,generation:randomUUID(),revisions:{},receipts:{}}}),{mode:0o400});
const values=new Map<string,string>();let fail=true;
const keystore={getKey:async(ref:string)=>values.get(ref)??null,setKey:async(ref:string,value:string)=>{values.set(ref,value);},deleteKey:async(ref:string)=>{if(fail)throw privateFailure;values.delete(ref);}};
const previous=_setKeystoreForTests(keystore),tickets=await SavedTicketAuthority.open({root:savedRoot,registryId,adopted:false,keystore,isRegistered:async()=>true}),store=await ManagedRegistry.open(path,{ownsRoot:async()=>true}),journal=await PreparationJournal.open(path,registryId),generations=new CredentialGenerations(journal,'a'.repeat(32),{keystore,current:()=>store.inspect()}),pool=new DriverPool(savedRoot);await pool.reload();
try{
 const service=await SavedConnectionManagement.create({root:savedRoot,store,tickets,generations,pool,enabled:async()=>true,isRegistered:async()=>true,activate:async()=>{},readSecret:keystore.getKey}),access={connectionIdentity:'saved-owner',access:{lookupRoot:savedRoot,managementRepoRoot:savedRoot,daemonEpoch:'epoch'}},key={repoRoot:savedRoot,scope:'saved' as const,id:'row'};
 const create=await service.ticket(access,key,'create'),initial=await service.mutate(access,{key,ticket:create,operationId:create.operationId,mode:'create',publicPatch:{kind:'postgres',endpoint:'postgres://'+canaries[0]+'/db'},credentials:{'url.password':{action:'replace',value:canaries[1]}}});assert.equal(initial.status,'committed');if(initial.status!=='committed')throw new Error('Expected fixture registration');
 const remove=await service.ticket(access,key,'remove');safe(await service.mutate(access,{key,ticket:remove,operationId:remove.operationId,mode:'remove',expectedRevision:initial.value.revision}));
 const pending=await service.removalState(access,remove);safe(pending);assert.equal(pending.state,'removed-cleanup-pending');assert.equal(pending.credentialCleanup,'pending');safe(await service.retryRemovalCleanup(access,remove));
 const receipt=store.snapshot.file._management!.receipts[remove.operationId]!;assert.deepEqual(Object.keys(receipt).sort(),['cleanupRefs','outcome','requestMac','ticket']);assert.ok(receipt.cleanupRefs.length>0);assert.ok(receipt.cleanupRefs.every(ref=>generations.owns(ref)));
 for(const canary of canaries)assert.equal(JSON.stringify(receipt).includes(canary),false);
 fail=false;const done=await service.retryRemovalCleanup(access,remove);safe(done);assert.equal(done.state,'removed');
}finally{fail=false;await pool.closeAll();await store.close();_setKeystoreForTests(previous);}
getLogger('removal-privacy').info('CM_REMOVE_LOG_POSITIVE');
let logs='';for(let n=0;n<100;n++){await new Promise(resolve=>setTimeout(resolve,10));logs='';for(const name of Object.keys(await tree(PATHS.logDir)))logs+=await readFile(join(PATHS.logDir,name),'utf8');if(logs.includes('CM_REMOVE_LOG_POSITIVE'))break;}
assert.ok(logs.includes('CM_REMOVE_LOG_POSITIVE'));for(const canary of canaries)assert.equal(logs.includes(canary),false);assert.equal(logs.includes('db:v2:'),false);
process.stdout.write(JSON.stringify({proof:'removal-privacy-ok',mode,files,keychain,closes,replies:replies.length})+'\n');
