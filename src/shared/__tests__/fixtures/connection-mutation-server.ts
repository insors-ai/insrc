/** Test-only native-client peer using actual signed tickets, receipts and session ownership. */
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { writeFileSync,readFileSync } from 'node:fs';
import { environment } from '../../../daemon/db/__tests__/fixtures/saved-management-fixture.js';
import { ConnectionSessionRpc } from '../../../daemon/connection-session-rpc.js';
import { connectionManagementHandlers } from '../../../daemon/connection-management-rpc.js';
import { createTemporaryOverlay } from '../../../daemon/db/session-entries.js';
import { contextualDriverFactory } from '../../../daemon/db/driver-log-policy.js';
import { _setPoolForTests, closeAll } from '../../../daemon/db/pool-cache.js';
import { IpcServer, directDispatch } from '../../../daemon/server.js';
import type { Driver } from '../../db-driver.js';
import type { MutationRequest } from '../../connection-management.js';
import { _setKeystoreForTests } from '../../../daemon/db/secrets.js';
import { listConnectionsRpc, listDriverKindsRpc } from '../../../daemon/db-rpc.js';
import { connectionTestSupervisor } from '../../../daemon/db/draft-test.js';

// Explicit test entry only; never imported by a packaged client or daemon.
const liveUi=process.argv[3]==='live-ui';
const dir=process.argv[2]!,env=await environment(),f=await env.rootFixture('managed');_setPoolForTests(f.root,f.pool);
if(liveUi)Object.defineProperty(f.clock,'value',{get:()=>Date.now()});
const other=await env.rootFixture('other');_setPoolForTests(other.root,other.pool);const roots=[f.root,other.root];
const previousKeystore=_setKeystoreForTests(f.keystore),sourcePath=join(f.root,'source.csv');writeFileSync(sourcePath,'id,name\n1,preserved\n');const sourceBytes=readFileSync(sourcePath);
let credentialFail=false,resourceFail=false,builds=0,oldCloses=0,newCloses=0,removeStateCalls=0,cleanupCalls=0,ticketOnlyCleanup=true,originalCleanup=true;
let originalRemoval:MutationRequest['ticket']|null=null,removeFieldsValid=true,lease:{release():Promise<void>}|null=null;
const deleteKey=f.keystore.deleteKey;f.keystore.deleteKey=async ref=>{if(credentialFail)throw new Error('fixture credential cleanup failure');await deleteKey(ref);};
f.hooks.factory=async config=>{const generation=++builds;return{id:config.id,kind:config.kind,family:'rdbms',close:async()=>{if(generation===1){oldCloses++;if(resourceFail)throw new Error('fixture runtime cleanup failure');}else newCloses++;}} as Driver;};
let now=0,fault='none',refreshFail=false,activationFail=false,cleanupFail=false,afterCommit=false;
const monotonicNow=()=>liveUi?performance.now():now;
let tickets=0,mutations=0,statuses=0,activations=0,lists=0,identicalReplay=true;
const firstRequests=new Map<string,string>(),held=new Set<Promise<unknown>>();
let release:(()=>void)|undefined;
const recover=f.generations.recover.bind(f.generations);
f.generations.recover=async()=>{if(cleanupFail&&afterCommit)throw new Error('fixture cleanup failure');return await recover();};
f.hooks.writer=async stage=>{if(stage==='after-rename')afterCommit=true;};
f.hooks.activate=async()=>{if(activationFail)throw new Error('fixture activation failure');};
const runtime=new ConnectionSessionRpc({enabled:async()=>true,removalEnabled:async()=>true,monotonicNow,isRegistered:async root=>roots.includes(root),
 createOverlay:(root,handle,context)=>createTemporaryOverlay(root,handle,context,{factory:()=>contextualDriverFactory(async config=>({id:config.id,kind:config.kind,family:'rdbms',close:async()=>{},describe:async()=>({columns:[]})}) as Driver)}),dropOverlay:overlay=>overlay.close()});
const P='db.connections.v2.',handlers=connectionManagementHandlers({sessionRuntime:runtime,enabled:async()=>true,removalEnabled:async()=>true,isRegistered:async root=>roots.includes(root)});
let capabilityMode='normal',omittedFeatures:string[]=[],readRows:unknown=null,legacyMutations=0;
const baseCapabilities=handlers[P+'capabilities']!;
handlers[P+'capabilities']=async(params,context)=>{if(capabilityMode==='missing')throw new Error('unknown method');const reply=await baseCapabilities(params,context) as {features:string[]};return{...reply,...capabilityMode==='old'?{version:1}:capabilityMode==='future'?{version:3}:capabilityMode==='malformed'?{version:'2'}:{},features:reply.features.filter(feature=>!omittedFeatures.includes(feature))};};
handlers['db.listConnections']=(params,context)=>listConnectionsRpc(params as {repoRoot:unknown},context);
handlers['db.listDriverKinds']=async()=>listDriverKindsRpc();
for(const method of ['db.saveConnection','db.deleteConnection'])handlers[method]=async()=>{legacyMutations++;throw new Error('legacy mutation is forbidden in this fixture');};
handlers['fixture.capabilities']=async params=>{const p=params as {mode?:string;omit?:string[]};capabilityMode=p.mode??'normal';omittedFeatures=p.omit??[];return{configured:true};};
handlers['fixture.readRows']=async params=>{readRows=(params as {rows:unknown}).rows;return{configured:true};};
handlers['fixture.seedSaved']=async params=>{const request=await f.request((params as {id:string}).id);return await f.service.mutate(f.context,request);};
const baseTicket=handlers[P+'ticket']!,baseMutate=handlers[P+'mutate']!,baseStatus=handlers[P+'status']!,baseActivate=handlers[P+'activate']!,baseList=handlers[P+'list']!;
handlers[P+'ticket']=async(params,context)=>{tickets++;return await baseTicket(params,context);};
handlers[P+'mutate']=async(params,context)=>{
 mutations++;const request=params as MutationRequest,bytes=JSON.stringify(params),prior=firstRequests.get(request.operationId);
 if(request.mode==='remove'){originalRemoval=request.ticket;removeFieldsValid&&=Object.keys(request).sort().join(',')==='expectedRevision,key,mode,operationId,ticket';}
 if(prior!==undefined)identicalReplay&&=prior===bytes;else firstRequests.set(request.operationId,bytes);
 const selected=fault;fault='none';
 if(selected==='before')throw new Error('fixture lost response before effect');
 if(selected==='pending'){
  const gate=new Promise<void>(resolve=>{release=resolve;});f.hooks.stage=async()=>{await gate;};
  const work=baseMutate(params,context);held.add(work);void work.then(()=>held.delete(work),()=>held.delete(work));throw new Error('fixture lost response while pending');
 }
 const result=await baseMutate(params,context);
 if(selected==='after')throw new Error('fixture lost response after effect');
 if(selected==='malformed'&&(result as {status:string}).status==='committed')return{...(result as object),value:{...(result as {value:object}).value,operationId:randomUUID()}};
 return result;
};
handlers[P+'status']=async(params,context)=>{statuses++;return await baseStatus(params,context);};
handlers[P+'activate']=async(params,context)=>{activations++;return await baseActivate(params,context);};
handlers[P+'list']=async(params,context)=>{lists++;if(refreshFail)throw new Error('fixture refresh failure');if(readRows!==null)return readRows;return await baseList(params,context);};
for(const method of ['removalState','retryRemovalCleanup']){
 const base=handlers[P+method]!;handlers[P+method]=async(params,context)=>{
  if(method==='removalState')removeStateCalls++;else cleanupCalls++;
  ticketOnlyCleanup&&=Object.keys(params as object).join(',')==='ticket';
  originalCleanup&&=JSON.stringify((params as {ticket:unknown}).ticket)===JSON.stringify(originalRemoval);
  return await base(params,context);
 };
}
handlers['fixture.info']=async()=>({roots,wallNow:f.clock.value});
if(liveUi){
 // Only incidental IDE startup reads: no install/update/register handlers.
 handlers['repo.list']=async()=>roots.map((path,i)=>({path,name:i?'Other acceptance repository':'Managed acceptance repository',status:'ready'}));
 handlers['daemon.status']=async()=>({pid:process.pid,uptime:process.uptime(),repos:[],queueLength:0,indexing:null,installedCommit:''});
 writeFileSync(join(dir,'live-info.json'),JSON.stringify({roots,socket:join(dir,'daemon.sock'),sourcePath,testOnlyPrerequisites:true,productionGatesChanged:false})+'\n');
}
handlers['fixture.stats']=async()=>({tickets,mutations,statuses,activations,lists,probeActive:connectionTestSupervisor.activeCount,legacyMutations,identicalReplay,savedRows:f.store.snapshot.file.connections.length,registryWrites:f.counts.writes,credentialSets:f.counts.sets,credentialDeletes:f.counts.deletes,removeStateCalls,cleanupCalls,ticketOnlyCleanup,originalCleanup,removeFieldsValid,oldCloses,newCloses,sourcePreserved:readFileSync(sourcePath).equals(sourceBytes)});
handlers['fixture.fault']=async params=>{
 const p=params as Record<string,unknown>;
 if(typeof p['mode']==='string')fault=p['mode'];if(typeof p['refreshFail']==='boolean')refreshFail=p['refreshFail'];if(typeof p['activationFail']==='boolean')activationFail=p['activationFail'];if(typeof p['cleanupFail']==='boolean')cleanupFail=p['cleanupFail'];
 if(typeof p['credentialFail']==='boolean')credentialFail=p['credentialFail'];if(typeof p['resourceFail']==='boolean')resourceFail=p['resourceFail'];
 return{configured:true};
};
handlers['fixture.clock']=async params=>{now=(params as {now:number}).now;return{now};};
handlers['fixture.wallClock']=async params=>{f.clock.value=(params as {now:number}).now;return{now:f.clock.value};};
handlers['fixture.release']=async()=>{release?.();await Promise.allSettled([...held]);f.hooks.stage=undefined;return{released:true};};
handlers['fixture.instantiate']=async params=>{await f.pool.withConnection((params as {id:string}).id,async()=>{});return{ready:true};};
handlers['fixture.lease']=async params=>{lease=await f.pool.lease((params as {id:string}).id);return{ready:true};};
handlers['fixture.releaseLease']=async()=>{await lease?.release();lease=null;return{released:true};};
handlers['fixture.commitOriginalRemoval']=async()=>{
 if(!originalRemoval)return{committed:false};const request=firstRequests.get(originalRemoval.operationId);if(!request)return{committed:false};
 const result=await f.service.mutate(f.context,JSON.parse(request) as MutationRequest);return{committed:result.status==='committed'};
};
const server=new IpcServer(runtime.forward(directDispatch(handlers)),monotonicNow,join(dir,'daemon.sock'));
server.onConnectionClose(context=>runtime.disconnect(context));await server.listen();
process.stdout.write('INSRC_PROJECT_FIXTURE_READY\n');
createInterface({input:process.stdin}).on('line',line=>{if(line==='stop')void(async()=>{
 release?.();credentialFail=false;resourceFail=false;cleanupFail=false;await lease?.release();await Promise.allSettled([...held]);await server.close();await runtime.close();await closeAll();
 const preserved=readFileSync(sourcePath).equals(sourceBytes);await env.cleanup();_setKeystoreForTests(previousKeystore);process.exit(preserved?0:1);
})();});
